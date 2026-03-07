from __future__ import annotations

import json
import os
import re
from typing import Callable

from openai import OpenAI


MT_BASE_URL = os.getenv("MT_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip()
MT_MODEL = os.getenv("MT_MODEL", "qwen-mt-plus").strip()


class TranslationError(RuntimeError):
    pass


class SemanticSplitError(RuntimeError):
    pass


def _client(api_key: str) -> OpenAI:
    return OpenAI(api_key=api_key, base_url=MT_BASE_URL)


def translate_to_zh(text: str, api_key: str) -> str:
    normalized = (text or "").strip()
    if not normalized:
        return ""
    client = _client(api_key)
    try:
        completion = client.chat.completions.create(
            model=MT_MODEL,
            messages=[{"role": "user", "content": normalized}],
            extra_body={"translation_options": {"source_lang": "English", "target_lang": "Chinese"}},
        )
    except Exception as exc:
        raise TranslationError(str(exc)[:1200]) from exc

    if not completion.choices:
        return ""
    content = (completion.choices[0].message.content or "").strip()
    return content


def translate_sentences_to_zh(
    sentences: list[str],
    api_key: str,
    progress_callback: Callable[[int, int], None] | None = None,
) -> tuple[list[str], int]:
    output: list[str] = []
    failed = 0
    total = len(sentences)
    for index, item in enumerate(sentences, start=1):
        try:
            output.append(translate_to_zh(item, api_key))
        except Exception:
            output.append("")
            failed += 1
        if progress_callback:
            progress_callback(index, total)
    return output, failed


def _extract_json_array(content: str) -> list[str]:
    normalized = (content or "").strip()
    if not normalized:
        return []
    try:
        parsed = json.loads(normalized)
    except Exception:
        match = re.search(r"\[[\s\S]*\]", normalized)
        if not match:
            return []
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, list):
        return []
    items: list[str] = []
    for item in parsed:
        value = str(item or "").strip()
        if value:
            items.append(value)
    return items


def split_sentence_by_semantic(
    text: str,
    *,
    api_key: str,
    model: str,
    timeout_seconds: int,
) -> list[str]:
    normalized = (text or "").strip()
    if not normalized:
        return []
    if not api_key:
        raise SemanticSplitError("missing_api_key")

    client = _client(api_key)
    prompt = (
        "Split the following English subtitle sentence into 2-6 shorter subtitle lines.\n"
        "Keep the original word order and wording.\n"
        "Do not paraphrase, translate, or add words.\n"
        "Return JSON only as an array of strings.\n"
        f"Sentence: {normalized}"
    )
    try:
        completion = client.chat.completions.create(
            model=(model or "").strip() or MT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            timeout=max(1, int(timeout_seconds)),
        )
    except Exception as exc:
        raise SemanticSplitError(str(exc)[:1200]) from exc

    if not completion.choices:
        raise SemanticSplitError("empty_choices")
    content = (completion.choices[0].message.content or "").strip()
    segments = _extract_json_array(content)
    if len(segments) <= 1:
        raise SemanticSplitError("invalid_segments")
    return segments
