from __future__ import annotations

import argparse
import re
import sqlite3
from pathlib import Path

from mdict_utils.base.readmdict import MDX


STYLE_RE = re.compile(r"`\d`")
TAG_LINE_RE = re.compile(r"^\((?P<tags>.+?)\s+(?P<frq>\d+)\/(?P<bnc>\d+)\)$")
PHONETIC_LINE_RE = re.compile(r"^\[(?P<phonetic>.*?)\]\s*(?P<meta>-\S+)?$")
ASCII_KEY_RE = re.compile(r"[A-Za-z]")
FORMS_LINE_RE = re.compile(r"^(?:时态|复数|比较级|最高级|过去式|过去分词|现在分词|第三人称单数|名词复数)\s*:\s*(.+)$")
FORM_TOKEN_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")


def normalize_lookup_key(value: str) -> str:
    return re.sub(r"[^a-zA-Z']", "", str(value or "").strip().lower())


def iter_lookup_keys(lemma: str, exchange_line: str | None) -> list[str]:
    keys = []
    seen = set()

    def _add(value: str) -> None:
        normalized = normalize_lookup_key(value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            keys.append(normalized)
        no_apos = normalized.replace("'", "")
        if no_apos and no_apos not in seen:
            seen.add(no_apos)
            keys.append(no_apos)

    _add(lemma)
    if exchange_line:
        for token in FORM_TOKEN_RE.findall(exchange_line):
            _add(token)
    return keys


def parse_entry_text(lemma: str, raw_text: str) -> dict:
    cleaned = STYLE_RE.sub("", raw_text or "")
    cleaned = cleaned.replace("\x00", "")
    cleaned = cleaned.replace("</br>", "\n").replace("<br>", "\n").replace("<br/>", "\n")
    cleaned = re.sub(r"<[^>]+>", "", cleaned)
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]

    phonetic = None
    meta = ""
    tags = None
    frq_rank = None
    bnc_rank = None
    translation_lines: list[str] = []
    exchange_line = None

    for line in lines:
        if line == lemma:
            continue
        phonetic_match = PHONETIC_LINE_RE.match(line)
        if phonetic_match:
            phonetic = phonetic_match.group("phonetic").strip() or None
            meta = str(phonetic_match.group("meta") or "").strip()
            continue
        tag_match = TAG_LINE_RE.match(line)
        if tag_match:
            tags = tag_match.group("tags").strip() or None
            frq_rank = int(tag_match.group("frq"))
            bnc_rank = int(tag_match.group("bnc"))
            continue
        forms_match = FORMS_LINE_RE.match(line)
        if forms_match:
            exchange_line = forms_match.group(1).strip()
            continue
        translation_lines.append(line)

    collins = None
    oxford = False
    if meta:
        oxford = "K" in meta.upper()
        collins_match = re.search(r"([1-5])", meta)
        if collins_match:
            collins = int(collins_match.group(1))

    return {
        "lemma": lemma,
        "phonetic": phonetic,
        "translation": "\n".join(translation_lines).strip() or None,
        "pos": translation_lines[0].split(".", 1)[0].strip() if translation_lines and "." in translation_lines[0] else None,
        "exchange": exchange_line,
        "collins": collins,
        "oxford": 1 if oxford else 0,
        "tags": tags,
        "frq_rank": frq_rank,
        "bnc_rank": bnc_rank,
    }


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS entries (
            lemma TEXT PRIMARY KEY,
            phonetic TEXT,
            translation TEXT,
            pos TEXT,
            exchange TEXT,
            collins INTEGER,
            oxford INTEGER NOT NULL DEFAULT 0,
            tags TEXT,
            frq_rank INTEGER,
            bnc_rank INTEGER
        );
        CREATE TABLE IF NOT EXISTS lookup_keys (
            lookup_key TEXT NOT NULL,
            lemma TEXT NOT NULL REFERENCES entries(lemma)
        );
        CREATE INDEX IF NOT EXISTS ix_entries_collins ON entries(collins);
        CREATE INDEX IF NOT EXISTS ix_lookup_keys_lookup_key ON lookup_keys(lookup_key);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_lookup_keys_lookup_key_lemma ON lookup_keys(lookup_key, lemma);
        """
    )


def convert(mdx_path: Path, sqlite_path: Path) -> None:
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    temp_sqlite_path = sqlite_path.with_suffix(f"{sqlite_path.suffix}.tmp")
    if temp_sqlite_path.exists():
        temp_sqlite_path.unlink()
    if sqlite_path.exists():
        sqlite_path.unlink()

    mdx = MDX(str(mdx_path))
    conn = sqlite3.connect(str(temp_sqlite_path))
    try:
        create_schema(conn)
        entry_rows = []
        lookup_rows = []
        batch_size = 5000
        total = 0
        kept = 0
        for raw_key, raw_value in mdx.items():
            key = raw_key.decode("utf-8", errors="ignore") if isinstance(raw_key, (bytes, bytearray)) else str(raw_key)
            if not ASCII_KEY_RE.search(key):
                total += 1
                continue
            value = raw_value.decode("utf-8", errors="ignore") if isinstance(raw_value, (bytes, bytearray)) else str(raw_value)
            parsed = parse_entry_text(key.strip(), value)
            entry_rows.append(
                (
                    parsed["lemma"],
                    parsed["phonetic"],
                    parsed["translation"],
                    parsed["pos"],
                    parsed["exchange"],
                    parsed["collins"],
                    parsed["oxford"],
                    parsed["tags"],
                    parsed["frq_rank"],
                    parsed["bnc_rank"],
                )
            )
            for lookup_key in iter_lookup_keys(parsed["lemma"], parsed["exchange"]):
                lookup_rows.append((lookup_key, parsed["lemma"]))
            total += 1
            kept += 1
            if len(entry_rows) >= batch_size:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO entries
                    (lemma, phonetic, translation, pos, exchange, collins, oxford, tags, frq_rank, bnc_rank)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    entry_rows,
                )
                conn.executemany(
                    "INSERT OR IGNORE INTO lookup_keys (lookup_key, lemma) VALUES (?, ?)",
                    lookup_rows,
                )
                conn.commit()
                entry_rows.clear()
                lookup_rows.clear()
        if entry_rows:
            conn.executemany(
                """
                INSERT OR REPLACE INTO entries
                (lemma, phonetic, translation, pos, exchange, collins, oxford, tags, frq_rank, bnc_rank)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                entry_rows,
            )
            conn.executemany(
                "INSERT OR IGNORE INTO lookup_keys (lookup_key, lemma) VALUES (?, ?)",
                lookup_rows,
            )
            conn.commit()
        print(f"converted_total={total}")
        print(f"kept_entries={kept}")
    finally:
        conn.close()
    temp_sqlite_path.replace(sqlite_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert vocabulary.mdx into runtime SQLite.")
    parser.add_argument("--source", default="app/data/vocab/vocabulary.mdx")
    parser.add_argument("--output", default="app/data/vocab/vocabulary.sqlite")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    convert(Path(args.source), Path(args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
