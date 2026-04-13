from __future__ import annotations

import json
import logging
import re

from fastapi import HTTPException

from app.core.config import DASHSCOPE_API_KEY

logger = logging.getLogger(__name__)

LLM_MODEL_DEEPSEEK_THINKING = "deepseek-v3.2"
LLM_MODEL_DEEPSEEK_FAST = "deepseek-v3.2"
LLM_VALID_MODELS = {"deepseek-v3.2"}
CEFR_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}

COMMON_SIMPLIFY_WORD_MEANINGS: dict[str, str] = {
    "peruse": 'to read carefully or in detail (NOT just "read")',
    "eschew": "to deliberately avoid or abstain from something",
    "adverse": "preventing success or development; harmful (NOT just different)",
    "affluent": "having a great deal of money; wealthy (NOT just full)",
    "ambiguous": "open to more than one interpretation; unclear",
    "coherent": "logical and consistent; clear (NOT just together)",
    "concurrent": "existing or happening at the same time",
    "correlate": "to have a mutual relationship or connection",
    "diligent": "having or showing care and conscientiousness in one's work",
    "eloquent": "fluent or persuasive in speaking or writing",
    "feasible": "possible to do easily or conveniently",
    "imminent": "about to happen (NOT just important)",
    "implicit": "implied though not plainly expressed",
    "inherent": "existing in something as a permanent characteristic",
    "innovative": "introducing new ideas; original",
    "obsolete": "no longer produced or used; out of date",
    "phenomenon": "a fact or situation that is observed to exist or happen",
    "pragmatic": "dealing with things sensibly and realistically (NOT just practical)",
    "scrutinize": "to examine or inspect closely and thoroughly",
    "subsequent": "coming after something in time; following",
    "superficial": "existing or occurring on the surface; not deep",
    "ubiquitous": "present, appearing, or found everywhere",
    "viable": "capable of working successfully; feasible",
}


def _require_api_key() -> str:
    key = DASHSCOPE_API_KEY
    if not key or not str(key).strip():
        raise HTTPException(status_code=503, detail="LLM API key not configured")
    return str(key).strip()


def strip_json_fences(text: str) -> str:
    content = str(text or "").strip()
    fence = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", content, flags=re.DOTALL | re.IGNORECASE)
    if fence:
        return fence.group(1).strip()
    return content


def recover_json_payload(text: str) -> str | None:
    if not text:
        return None

    content = strip_json_fences(text)
    for pattern in (r"\{[\s\S]*\}", r"\[[\s\S]*\]"):
        match = re.search(pattern, content, re.DOTALL)
        if not match:
            continue
        candidate = match.group(0)
        last_complete = None
        depth = 0
        for index, char in enumerate(candidate):
            if char in "{[":
                depth += 1
            elif char in "}]":
                depth -= 1
                if depth == 0:
                    last_complete = index
        if last_complete is not None and last_complete + 1 < len(candidate):
            candidate = candidate[: last_complete + 1]
        try:
            json.loads(candidate)
            return candidate
        except Exception:
            continue
    return None


def build_semantic_meaning_entries(words: list[str]) -> list[str]:
    entries: list[str] = []
    for word in words:
        base = str(word or "").lower()
        for suffix, replacement in (("ing", ""), ("es", ""), ("ed", ""), ("s", "")):
            if base.endswith(suffix) and len(base) > len(suffix) + 2:
                candidate = base[: -len(suffix)] + replacement
                if candidate in COMMON_SIMPLIFY_WORD_MEANINGS:
                    base = candidate
                break
        meaning = COMMON_SIMPLIFY_WORD_MEANINGS.get(base)
        if meaning:
            entries.append(f"{word} = {meaning}")
    return entries
