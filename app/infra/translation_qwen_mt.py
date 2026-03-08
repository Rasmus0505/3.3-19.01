from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Callable

from openai import OpenAI


MT_BASE_URL = os.getenv("MT_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip()
MT_MODEL = os.getenv("MT_MODEL", "qwen-mt-plus").strip()
MT_TIMEOUT_SECONDS = max(5, int((os.getenv("MT_TIMEOUT_SECONDS", "20") or "20").strip() or "20"))
MT_MAX_RETRIES = max(0, int((os.getenv("MT_MAX_RETRIES", "2") or "2").strip() or "2"))
MT_RETRY_BASE_SECONDS = max(0.0, float((os.getenv("MT_RETRY_BASE_SECONDS", "0.8") or "0.8").strip() or "0.8"))
_TRANSIENT_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}
_TRANSIENT_MESSAGE_SNIPPETS = (
    "timeout",
    "timed out",
    "connection",
    "temporarily unavailable",
    "temporarily overloaded",
    "rate limit",
    "too many requests",
    "try again",
    "bad gateway",
    "service unavailable",
    "gateway timeout",
)

logger = logging.getLogger(__name__)


class TranslationError(RuntimeError):
    pass


class SemanticSplitError(RuntimeError):
    pass


def _client(api_key: str) -> OpenAI:
    return OpenAI(api_key=api_key, base_url=MT_BASE_URL)


def _preview_text(text: str, *, limit: int = 96) -> str:
    normalized = re.sub(r"\s+", " ", str(text or "").strip())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit]}..."


def _extract_error_context(exc: Exception) -> dict[str, str | int | None]:
    response = getattr(exc, "response", None)
    status_code = getattr(exc, "status_code", None)
    if status_code is None and response is not None:
        status_code = getattr(response, "status_code", None)

    request_id = getattr(exc, "request_id", None)
    if not request_id and response is not None:
        headers = getattr(response, "headers", None) or {}
        request_id = headers.get("x-request-id") or headers.get("request-id") or headers.get("x-acs-request-id")

    body = getattr(exc, "body", None)
    detail = ""
    if isinstance(body, dict):
        detail = json.dumps(body, ensure_ascii=False)[:800]
    elif body:
        detail = str(body)[:800]
    else:
        detail = str(exc).strip()[:800]

    return {
        "status_code": status_code,
        "request_id": request_id,
        "detail": detail,
    }


def _is_retryable_exception(exc: Exception) -> bool:
    context = _extract_error_context(exc)
    status_code = context["status_code"]
    if isinstance(status_code, int) and status_code in _TRANSIENT_STATUS_CODES:
        return True
    lowered = f"{exc} {context['detail']}".lower()
    return any(snippet in lowered for snippet in _TRANSIENT_MESSAGE_SNIPPETS)


def _usage_summary(completion: object) -> str:
    usage = getattr(completion, "usage", None)
    if not usage:
        return "none"
    prompt_tokens = getattr(usage, "prompt_tokens", None)
    completion_tokens = getattr(usage, "completion_tokens", None)
    total_tokens = getattr(usage, "total_tokens", None)
    return f"prompt={prompt_tokens},completion={completion_tokens},total={total_tokens}"


def translate_to_zh(text: str, api_key: str) -> str:
    normalized = (text or "").strip()
    if not normalized:
        return ""
    client = _client(api_key)
    max_attempts = MT_MAX_RETRIES + 1
    for attempt in range(1, max_attempts + 1):
        try:
            completion = client.chat.completions.create(
                model=MT_MODEL,
                messages=[{"role": "user", "content": normalized}],
                extra_body={"translation_options": {"source_lang": "English", "target_lang": "Chinese"}},
                timeout=MT_TIMEOUT_SECONDS,
            )
            if not completion.choices:
                logger.warning(
                    "[DEBUG] qwen_mt.translate.empty_choices model=%s base_url=%s preview=%s",
                    MT_MODEL,
                    MT_BASE_URL,
                    _preview_text(normalized),
                )
                return ""

            first_choice = completion.choices[0]
            finish_reason = getattr(first_choice, "finish_reason", None)
            content = (first_choice.message.content or "").strip()
            if finish_reason == "length":
                logger.warning(
                    "[DEBUG] qwen_mt.translate.finish_length model=%s usage=%s preview=%s",
                    MT_MODEL,
                    _usage_summary(completion),
                    _preview_text(normalized),
                )
            if not content:
                logger.warning(
                    "[DEBUG] qwen_mt.translate.empty_content finish_reason=%s usage=%s preview=%s",
                    finish_reason,
                    _usage_summary(completion),
                    _preview_text(normalized),
                )
            return content
        except Exception as exc:
            context = _extract_error_context(exc)
            retryable = _is_retryable_exception(exc)
            logger.warning(
                "[DEBUG] qwen_mt.translate.error attempt=%s/%s retryable=%s status_code=%s request_id=%s model=%s base_url=%s preview=%s detail=%s",
                attempt,
                max_attempts,
                retryable,
                context["status_code"],
                context["request_id"],
                MT_MODEL,
                MT_BASE_URL,
                _preview_text(normalized),
                context["detail"],
            )
            if not retryable or attempt >= max_attempts:
                raise TranslationError(str(context["detail"])[:1200]) from exc
            time.sleep(MT_RETRY_BASE_SECONDS * attempt)


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
        except Exception as exc:
            output.append("")
            failed += 1
            logger.warning(
                "[DEBUG] qwen_mt.batch.item_failed index=%s/%s preview=%s reason=%s",
                index,
                total,
                _preview_text(item),
                str(exc)[:1200],
            )
        if progress_callback:
            progress_callback(index, total)
    if failed:
        logger.warning(
            "[DEBUG] qwen_mt.batch.partial_failed failed=%s success=%s total=%s model=%s base_url=%s",
            failed,
            total - failed,
            total,
            MT_MODEL,
            MT_BASE_URL,
        )
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
