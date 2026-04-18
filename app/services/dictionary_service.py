from __future__ import annotations

import re
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import APP_DIR
from app.services.collins_levels import classify_collins_band


VOCABULARY_SQLITE_PATH = APP_DIR / "data" / "vocab" / "vocabulary.sqlite"
TOKEN_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
APOSTROPHE_RE = re.compile(r"[']")
NONTEXT_RE = re.compile(r"[^a-zA-Z']")
CONTRACTION_RE = re.compile(r"^(.+?)'(s|d|m|re|ve|ll)$", re.IGNORECASE)
NT_RE = re.compile(r"^(.+?)n't$", re.IGNORECASE)


IRREGULAR_LEMMAS: dict[str, str] = {
    "ran": "run",
    "won": "win",
    "begun": "begin",
    "written": "write",
    "taken": "take",
    "given": "give",
    "seen": "see",
    "been": "be",
    "gone": "go",
    "come": "come",
    "made": "make",
    "known": "know",
    "thought": "think",
    "told": "tell",
    "found": "find",
    "said": "say",
    "got": "get",
}
SUFFIX_RULES: list[tuple[str, str]] = [
    ("ies", "y"),
    ("es", ""),
    ("ed", ""),
    ("ing", ""),
    ("s", ""),
]


def dictionary_db_exists(path: Path | None = None) -> bool:
    candidate = Path(path) if path else VOCABULARY_SQLITE_PATH
    return candidate.is_file()


def normalize_lookup_token(token: str) -> str:
    text = str(token or "").strip().lower()
    if not text:
        return ""
    text = NONTEXT_RE.sub("", text)
    return text


def _iter_lookup_candidates(token: str) -> list[str]:
    normalized = normalize_lookup_token(token)
    if not normalized:
        return []
    candidates: list[str] = []
    seen: set[str] = set()

    def _add(value: str) -> None:
        if value and value not in seen:
            seen.add(value)
            candidates.append(value)

    _add(normalized)
    _add(APOSTROPHE_RE.sub("", normalized))

    mapped = IRREGULAR_LEMMAS.get(normalized)
    if mapped:
        _add(mapped)
    nt_match = NT_RE.match(normalized)
    if nt_match:
        _add(nt_match.group(1).lower())
    contraction_match = CONTRACTION_RE.match(normalized)
    if contraction_match:
        _add(contraction_match.group(1).lower())
    for suffix, replacement in SUFFIX_RULES:
        if normalized.endswith(suffix) and len(normalized) > len(suffix) + 2:
            _add(normalized[: -len(suffix)] + replacement)
    return candidates


@lru_cache(maxsize=1)
def _db_path_cached() -> str:
    return str(VOCABULARY_SQLITE_PATH)


def _connect(path: str | None = None) -> sqlite3.Connection:
    db_path = path or _db_path_cached()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def lookup_dictionary_entry(token: str, *, db_path: str | None = None) -> dict[str, Any] | None:
    if not dictionary_db_exists(Path(db_path) if db_path else VOCABULARY_SQLITE_PATH):
        return None
    candidates = _iter_lookup_candidates(token)
    if not candidates:
        return None
    conn = _connect(db_path)
    try:
        cursor = conn.cursor()
        for lookup_key in candidates:
            cursor.execute(
                """
                SELECT e.lemma, e.phonetic, e.translation, e.pos, e.collins, e.oxford, e.tags
                FROM lookup_keys lk
                JOIN entries e ON e.lemma = lk.lemma
                WHERE lk.lookup_key = ?
                ORDER BY
                    CASE WHEN e.collins IS NOT NULL THEN 0 ELSE 1 END ASC,
                    e.oxford DESC,
                    LENGTH(e.lemma) ASC
                LIMIT 1
                """,
                (lookup_key,),
            )
            row = cursor.fetchone()
            if row:
                return dict(row)
        return None
    finally:
        conn.close()


def classify_tokens(
    tokens: list[str],
    *,
    user_collins_level: int,
    include_entry: bool = False,
    db_path: str | None = None,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for token in list(tokens or []):
        token_text = str(token or "")
        normalized = normalize_lookup_token(token_text)
        entry = lookup_dictionary_entry(token_text, db_path=db_path)
        collins = None
        band = "unrated"
        if entry:
            collins = int(entry["collins"]) if entry.get("collins") is not None else None
            band = classify_collins_band(collins=collins, user_collins_level=user_collins_level)
        else:
            band = "unrated"
        results.append(
            {
                "token": token_text,
                "normalized": normalized,
                "lemma": str(entry.get("lemma") or "") if entry else None,
                "matched": bool(entry),
                "collins": collins,
                "band": band,
                "entry": {
                    "lemma": str(entry.get("lemma") or ""),
                    "phonetic": entry.get("phonetic"),
                    "translation": entry.get("translation"),
                    "pos": entry.get("pos"),
                    "collins": collins,
                    "oxford": bool(entry.get("oxford")),
                    "tags": entry.get("tags"),
                }
                if include_entry and entry
                else None,
            }
        )
    return results
