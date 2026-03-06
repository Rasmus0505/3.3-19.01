from __future__ import annotations

import os
from typing import Callable

from openai import OpenAI


MT_BASE_URL = os.getenv("MT_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip()
MT_MODEL = os.getenv("MT_MODEL", "qwen-mt-plus").strip()


class TranslationError(RuntimeError):
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
