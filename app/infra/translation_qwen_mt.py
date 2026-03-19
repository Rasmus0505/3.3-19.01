from __future__ import annotations

import contextvars
import json
import logging
import os
import re
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable, Iterator

from openai import OpenAI

from app.core.config import MT_BATCH_MAX_CHARS, MT_MIN_REQUEST_INTERVAL_MS, MT_RETRY_MAX_ATTEMPTS
from app.core.timezone import now_shanghai_naive


MT_BASE_URL = os.getenv("MT_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip()
FORCED_MT_MODEL = "qwen-mt-flash"
_REQUESTED_MT_MODEL = (os.getenv("MT_MODEL", FORCED_MT_MODEL) or "").strip() or FORCED_MT_MODEL
MT_MODEL = FORCED_MT_MODEL
MT_TIMEOUT_SECONDS = max(5, int((os.getenv("MT_TIMEOUT_SECONDS", "20") or "20").strip() or "20"))
MAX_TRANSLATION_BATCH_CHARS = 12000
DEFAULT_TRANSLATION_BATCH_CHARS = max(1, min(MAX_TRANSLATION_BATCH_CHARS, int(MT_BATCH_MAX_CHARS)))
logger = logging.getLogger(__name__)

if _REQUESTED_MT_MODEL.lower() != FORCED_MT_MODEL:
    logger.warning("[DEBUG] qwen_mt.model_forced requested=%s forced=%s", _REQUESTED_MT_MODEL, FORCED_MT_MODEL)

_REQUEST_LOCK = threading.Lock()
_LAST_REQUEST_AT = 0.0
_BATCH_MAX_CHARS_CTX: contextvars.ContextVar[int] = contextvars.ContextVar(
    "translation_batch_max_chars",
    default=DEFAULT_TRANSLATION_BATCH_CHARS,
)


class TranslationError(RuntimeError):
    def __init__(self, message: str, *, code: str = "TRANSLATION_FAILED", detail: str = ""):
        super().__init__(message)
        self.code = str(code or "TRANSLATION_FAILED").strip() or "TRANSLATION_FAILED"
        self.message = str(message or "translation failed").strip() or "translation failed"
        self.detail = str(detail or "").strip()


class SemanticSplitError(RuntimeError):
    pass


class TranslationResponseParseError(RuntimeError):
    def __init__(self, error_code: str, message: str):
        super().__init__(message)
        self.error_code = error_code
        self.error_message = message


@dataclass(frozen=True)
class TranslationAttemptRecord:
    sentence_idx: int
    attempt_no: int
    provider: str
    model_name: str
    base_url: str
    input_text_preview: str
    provider_request_id: str
    status_code: int | None
    finish_reason: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    success: bool
    error_code: str
    error_message: str
    raw_request_text: str
    raw_response_text: str
    raw_error_text: str
    started_at: object
    finished_at: object

    def to_dict(self) -> dict[str, object]:
        return {
            "sentence_idx": self.sentence_idx,
            "attempt_no": self.attempt_no,
            "provider": self.provider,
            "model_name": self.model_name,
            "base_url": self.base_url,
            "input_text_preview": self.input_text_preview,
            "provider_request_id": self.provider_request_id,
            "status_code": self.status_code,
            "finish_reason": self.finish_reason,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "success": self.success,
            "error_code": self.error_code,
            "error_message": self.error_message,
            "raw_request_text": self.raw_request_text,
            "raw_response_text": self.raw_response_text,
            "raw_error_text": self.raw_error_text,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


@dataclass(frozen=True)
class TranslationBatchResult:
    texts: list[str]
    failed_count: int
    attempt_records: list[dict[str, object]]
    total_requests: int
    success_request_count: int
    success_prompt_tokens: int
    success_completion_tokens: int
    success_total_tokens: int
    latest_error_summary: str


@dataclass(frozen=True)
class _RecursiveBatchResult:
    texts: list[str]
    failed_count: int
    attempt_records: list[TranslationAttemptRecord]
    latest_error_summary: str


def _client(api_key: str) -> OpenAI:
    return OpenAI(api_key=api_key, base_url=MT_BASE_URL, max_retries=0)


def _preview_text(text: str, *, limit: int = 96) -> str:
    normalized = re.sub(r"\s+", " ", str(text or "").strip())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit]}..."


def _preview_batch(items: list[tuple[int, str]]) -> str:
    return _preview_text(" | ".join(text for _, text in items), limit=180)


def _json_default(value):
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump()
        except Exception:
            pass
    if hasattr(value, "to_dict"):
        try:
            return value.to_dict()
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        return value.__dict__
    return str(value)


def _serialize_raw_payload(payload: object) -> str:
    if payload is None:
        return ""
    if isinstance(payload, str):
        return payload
    try:
        return json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default)
    except Exception:
        return str(payload)


def _build_raw_request_text(*, prompt: str) -> str:
    return _serialize_raw_payload(
        {
            "provider": "dashscope_compatible",
            "base_url": MT_BASE_URL,
            "request": {
                "model": MT_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
                "timeout": MT_TIMEOUT_SECONDS,
            },
        }
    )


def _normalize_batch_max_chars(value: int | None) -> int:
    if value is None:
        candidate = _BATCH_MAX_CHARS_CTX.get()
    else:
        candidate = value
    try:
        normalized = int(candidate)
    except Exception:
        normalized = DEFAULT_TRANSLATION_BATCH_CHARS
    if normalized <= 0:
        normalized = DEFAULT_TRANSLATION_BATCH_CHARS
    return max(1, min(MAX_TRANSLATION_BATCH_CHARS, normalized))


def current_translation_batch_max_chars() -> int:
    return _normalize_batch_max_chars(None)


@contextmanager
def translation_batch_chars_scope(max_chars: int | None) -> Iterator[int]:
    token = _BATCH_MAX_CHARS_CTX.set(_normalize_batch_max_chars(max_chars))
    try:
        yield current_translation_batch_max_chars()
    finally:
        _BATCH_MAX_CHARS_CTX.reset(token)


def _respect_min_request_interval() -> None:
    if MT_MIN_REQUEST_INTERVAL_MS <= 0:
        return
    interval_seconds = MT_MIN_REQUEST_INTERVAL_MS / 1000.0
    global _LAST_REQUEST_AT
    with _REQUEST_LOCK:
        now = time.monotonic()
        wait_seconds = (_LAST_REQUEST_AT + interval_seconds) - now
        if wait_seconds > 0:
            time.sleep(wait_seconds)
            now = time.monotonic()
        _LAST_REQUEST_AT = now


def _extract_error_context(exc: Exception) -> dict[str, object]:
    response = getattr(exc, "response", None)
    status_code = getattr(exc, "status_code", None)
    if status_code is None and response is not None:
        status_code = getattr(response, "status_code", None)

    request_id = getattr(exc, "request_id", None)
    if not request_id and response is not None:
        headers = getattr(response, "headers", None) or {}
        request_id = headers.get("x-request-id") or headers.get("request-id") or headers.get("x-acs-request-id")

    body = getattr(exc, "body", None)
    detail = str(exc).strip()[:800]
    error_code = ""
    if isinstance(body, dict):
        detail = json.dumps(body, ensure_ascii=False)[:800]
        error_block = body.get("error") if isinstance(body.get("error"), dict) else body
        error_code = str(error_block.get("code") or body.get("code") or "").strip()
    elif body:
        detail = str(body)[:800]

    return {
        "status_code": status_code,
        "request_id": request_id,
        "detail": detail,
        "error_code": error_code,
        "body": body,
    }


def _usage_values(completion: object) -> tuple[int, int, int]:
    usage = getattr(completion, "usage", None)
    if not usage:
        return 0, 0, 0
    return (
        max(0, int(getattr(usage, "prompt_tokens", 0) or 0)),
        max(0, int(getattr(usage, "completion_tokens", 0) or 0)),
        max(0, int(getattr(usage, "total_tokens", 0) or 0)),
    )


def _build_attempt_record(
    *,
    sentence_idx: int,
    input_text: str,
    attempt_no: int = 1,
    provider_request_id: str = "",
    status_code: int | None = None,
    finish_reason: str = "",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    success: bool,
    error_code: str = "",
    error_message: str = "",
    raw_request_text: str = "",
    raw_response_text: str = "",
    raw_error_text: str = "",
    started_at=None,
    finished_at=None,
) -> TranslationAttemptRecord:
    return TranslationAttemptRecord(
        sentence_idx=sentence_idx,
        attempt_no=max(1, int(attempt_no or 1)),
        provider="dashscope_compatible",
        model_name=MT_MODEL,
        base_url=MT_BASE_URL,
        input_text_preview=_preview_text(input_text, limit=180),
        provider_request_id=str(provider_request_id or "").strip(),
        status_code=status_code,
        finish_reason=str(finish_reason or "").strip(),
        prompt_tokens=max(0, int(prompt_tokens or 0)),
        completion_tokens=max(0, int(completion_tokens or 0)),
        total_tokens=max(0, int(total_tokens or 0)),
        success=bool(success),
        error_code=str(error_code or "").strip(),
        error_message=str(error_message or "")[:1200],
        raw_request_text=str(raw_request_text or ""),
        raw_response_text=str(raw_response_text or ""),
        raw_error_text=str(raw_error_text or ""),
        started_at=started_at or now_shanghai_naive(),
        finished_at=finished_at or now_shanghai_naive(),
    )


def _extract_json_array(content: str, *, preserve_empty: bool) -> list[str]:
    normalized = (content or "").strip()
    if not normalized:
        return []
    try:
        parsed = json.loads(normalized)
    except json.JSONDecodeError as exc:
        match = re.search(r"\[[\s\S]*\]", normalized)
        if not match:
            raise TranslationResponseParseError("INVALID_BATCH_JSON", f"invalid JSON response: {exc}") from exc
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError as exc2:
            raise TranslationResponseParseError("INVALID_BATCH_JSON", f"invalid JSON fallback: {exc2}") from exc2
    except Exception as exc:
        raise TranslationResponseParseError("INVALID_BATCH_JSON", f"unexpected JSON error: {exc}") from exc
    if not isinstance(parsed, list):
        raise TranslationResponseParseError("INVALID_BATCH_JSON", "translation response is not a JSON array")
    items: list[str] = []
    for item in parsed:
        value = str(item or "").strip()
        if value or preserve_empty:
            items.append(value)
    return items


def _build_batch_prompt(texts: list[str]) -> str:
    return (
        "Translate the following English subtitle lines into Simplified Chinese.\n"
        "Return JSON only as an array of strings.\n"
        "The output array length must match the input array length exactly.\n"
        "Translate each item independently.\n"
        "Do not merge, split, skip, explain, or paraphrase any item.\n"
        f"Input JSON: {json.dumps(texts, ensure_ascii=False)}"
    )


def _parse_batch_response(content: str, *, expected_count: int) -> tuple[list[str] | None, str, str]:
    try:
        items = _extract_json_array(content, preserve_empty=True)
    except TranslationResponseParseError as exc:
        return None, exc.error_code, exc.error_message
    if len(items) != expected_count:
        return None, "INVALID_BATCH_COUNT", f"expected={expected_count} actual={len(items)}"
    if any(not item for item in items):
        return None, "EMPTY_BATCH_ITEM", "batch translation contains empty item"
    return items, "", ""


def _is_retryable_status(status_code: int | None) -> bool:
    if status_code is None:
        return True
    if status_code in {408, 409, 429}:
        return True
    return status_code >= 500


def _retry_delay_seconds(attempt_no: int) -> float:
    return min(8.0, 0.8 * (2 ** max(0, attempt_no - 1)))


def _is_fatal_batch_error(error_code: str) -> bool:
    return str(error_code or "").strip().upper() == "INVALID_BATCH_JSON"


def _build_sentence_batches(items: list[tuple[int, str]]) -> list[list[tuple[int, str]]]:
    batches: list[list[tuple[int, str]]] = []
    current_batch: list[tuple[int, str]] = []
    current_chars = 0
    max_chars = current_translation_batch_max_chars()

    for item in items:
        sentence_text = item[1]
        sentence_chars = max(1, len(sentence_text))
        should_flush = bool(current_batch) and (current_chars + sentence_chars > max_chars)
        if should_flush:
            batches.append(current_batch)
            current_batch = []
            current_chars = 0
        current_batch.append(item)
        current_chars += sentence_chars

    if current_batch:
        batches.append(current_batch)
    return batches


def _request_batch_translation(
    items: list[tuple[int, str]],
    *,
    api_key: str,
) -> tuple[list[str] | None, list[TranslationAttemptRecord], str, str]:
    if not items:
        return [], [], "", ""

    client = _client(api_key)
    start_idx = int(items[0][0])
    batch_texts = [text for _, text in items]
    batch_preview = _preview_batch(items)
    prompt = _build_batch_prompt(batch_texts)
    raw_request_text = _build_raw_request_text(prompt=prompt)
    attempt_records: list[TranslationAttemptRecord] = []

    for attempt_no in range(1, MT_RETRY_MAX_ATTEMPTS + 1):
        _respect_min_request_interval()
        started_at = now_shanghai_naive()
        try:
            completion = client.chat.completions.create(
                model=MT_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                timeout=MT_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            context = _extract_error_context(exc)
            raw_error_text = _serialize_raw_payload(
                {
                    "exception_type": exc.__class__.__name__,
                    "message": str(exc),
                    "context": context,
                }
            )
            record = _build_attempt_record(
                sentence_idx=start_idx,
                input_text=batch_preview,
                attempt_no=attempt_no,
                provider_request_id=str(context["request_id"] or ""),
                status_code=context["status_code"] if isinstance(context["status_code"], int) else None,
                success=False,
                error_code=str(context["error_code"] or "") or "REQUEST_FAILED",
                error_message=str(context["detail"] or "")[:1200],
                raw_request_text=raw_request_text,
                raw_error_text=raw_error_text,
                started_at=started_at,
                finished_at=now_shanghai_naive(),
            )
            attempt_records.append(record)
            logger.warning(
                "[DEBUG] qwen_mt.batch.request_failed attempt=%s/%s sentence_idx=%s size=%s status_code=%s request_id=%s preview=%s detail=%s",
                attempt_no,
                MT_RETRY_MAX_ATTEMPTS,
                start_idx,
                len(items),
                record.status_code,
                record.provider_request_id,
                record.input_text_preview,
                record.error_message,
            )
            if _is_retryable_status(record.status_code) and attempt_no < MT_RETRY_MAX_ATTEMPTS:
                delay_seconds = _retry_delay_seconds(attempt_no)
                logger.info(
                    "[DEBUG] qwen_mt.batch.retry delay_seconds=%.3f attempt=%s sentence_idx=%s size=%s",
                    delay_seconds,
                    attempt_no + 1,
                    start_idx,
                    len(items),
                )
                time.sleep(delay_seconds)
                continue
            return None, attempt_records, record.error_code or "REQUEST_FAILED", record.error_message

        prompt_tokens, completion_tokens, total_tokens = _usage_values(completion)
        provider_request_id = str(getattr(completion, "_request_id", "") or getattr(completion, "id", "") or "").strip()
        raw_response_text = _serialize_raw_payload(completion)

        if not completion.choices:
            record = _build_attempt_record(
                sentence_idx=start_idx,
                input_text=batch_preview,
                attempt_no=attempt_no,
                provider_request_id=provider_request_id,
                status_code=200,
                success=False,
                error_code="EMPTY_CHOICES",
                error_message="empty choices",
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                raw_request_text=raw_request_text,
                raw_response_text=raw_response_text,
                started_at=started_at,
                finished_at=now_shanghai_naive(),
            )
            attempt_records.append(record)
            logger.warning(
                "[DEBUG] qwen_mt.batch.invalid_output attempt=%s sentence_idx=%s size=%s reason=%s preview=%s",
                attempt_no,
                start_idx,
                len(items),
                record.error_code,
                record.input_text_preview,
            )
            return None, attempt_records, record.error_code, record.error_message

        first_choice = completion.choices[0]
        finish_reason = str(getattr(first_choice, "finish_reason", None) or "").strip()
        content = str(getattr(first_choice.message, "content", "") or "").strip()
        translated_items, error_code, error_message = _parse_batch_response(content, expected_count=len(items))
        if finish_reason == "length":
            error_code = "FINISH_REASON_LENGTH"
            error_message = "finish_reason=length"
            translated_items = None

        if translated_items is None:
            record = _build_attempt_record(
                sentence_idx=start_idx,
                input_text=batch_preview,
                attempt_no=attempt_no,
                provider_request_id=provider_request_id,
                status_code=200,
                finish_reason=finish_reason,
                success=False,
                error_code=error_code or "INVALID_BATCH_OUTPUT",
                error_message=error_message or "invalid batch output",
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                raw_request_text=raw_request_text,
                raw_response_text=raw_response_text,
                started_at=started_at,
                finished_at=now_shanghai_naive(),
            )
            attempt_records.append(record)
            logger.warning(
                "[DEBUG] qwen_mt.batch.invalid_output attempt=%s sentence_idx=%s size=%s finish_reason=%s reason=%s preview=%s",
                attempt_no,
                start_idx,
                len(items),
                finish_reason,
                record.error_message or record.error_code,
                record.input_text_preview,
            )
            return None, attempt_records, record.error_code, record.error_message

        record = _build_attempt_record(
            sentence_idx=start_idx,
            input_text=batch_preview,
            attempt_no=attempt_no,
            provider_request_id=provider_request_id,
            status_code=200,
            finish_reason=finish_reason,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            success=True,
            raw_request_text=raw_request_text,
            raw_response_text=raw_response_text,
            started_at=started_at,
            finished_at=now_shanghai_naive(),
        )
        attempt_records.append(record)
        return translated_items, attempt_records, "", ""

    return None, attempt_records, "REQUEST_FAILED", "translation failed"


def _combine_recursive_results(
    head_records: list[TranslationAttemptRecord],
    left: _RecursiveBatchResult,
    right: _RecursiveBatchResult,
) -> _RecursiveBatchResult:
    return _RecursiveBatchResult(
        texts=[*left.texts, *right.texts],
        failed_count=left.failed_count + right.failed_count,
        attempt_records=[*head_records, *left.attempt_records, *right.attempt_records],
        latest_error_summary=right.latest_error_summary or left.latest_error_summary,
    )


def _translate_batch_recursive(items: list[tuple[int, str]], *, api_key: str) -> _RecursiveBatchResult:
    translated_items, attempt_records, error_code, error_message = _request_batch_translation(items, api_key=api_key)
    if translated_items is not None:
        return _RecursiveBatchResult(
            texts=translated_items,
            failed_count=0,
            attempt_records=attempt_records,
            latest_error_summary="",
        )

    if _is_fatal_batch_error(error_code):
        detail_parts = [str(error_message or error_code or "translation response parse failed").strip()]
        if items:
            detail_parts.append(f"sentence_idx={int(items[0][0]) + 1}")
            detail_parts.append(f"size={len(items)}")
            detail_parts.append(f"preview={_preview_batch(items)}")
        raise TranslationError(
            "翻译结果解析失败",
            code="TRANSLATION_RESPONSE_INVALID",
            detail="; ".join(part for part in detail_parts if part),
        )

    if len(items) > 1:
        split_index = max(1, len(items) // 2)
        logger.warning(
            "[DEBUG] qwen_mt.batch.split sentence_idx=%s size=%s split_index=%s reason=%s",
            items[0][0],
            len(items),
            split_index,
            error_message or error_code,
        )
        left = _translate_batch_recursive(items[:split_index], api_key=api_key)
        right = _translate_batch_recursive(items[split_index:], api_key=api_key)
        return _combine_recursive_results(attempt_records, left, right)

    sentence_idx, sentence_text = items[0]
    latest_error_summary = f"第{sentence_idx + 1}句失败：{error_code or 'REQUEST_FAILED'} {error_message}".strip()
    logger.warning(
        "[DEBUG] qwen_mt.batch.item_failed index=%s preview=%s reason=%s",
        sentence_idx + 1,
        _preview_text(sentence_text),
        error_message or error_code,
    )
    return _RecursiveBatchResult(
        texts=[""],
        failed_count=1,
        attempt_records=attempt_records,
        latest_error_summary=latest_error_summary,
    )


def translate_to_zh(text: str, api_key: str) -> str:
    if not str(text or "").strip():
        return ""
    result = translate_sentences_to_zh([text], api_key=api_key)
    if result.failed_count:
        raise TranslationError(result.latest_error_summary or "translation failed")
    return result.texts[0]


def translate_sentences_to_zh(
    sentences: list[str],
    api_key: str,
    progress_callback: Callable[[int, int], None] | None = None,
    resume_state: dict[str, object] | None = None,
    checkpoint_callback: Callable[[dict[str, object]], None] | None = None,
) -> TranslationBatchResult:
    total = len(sentences)
    translated_texts = [""] * total
    resume_payload = dict(resume_state or {})
    resume_texts = list(resume_payload.get("translated_texts") or [])
    resume_completed_indexes = {
        int(item)
        for item in list(resume_payload.get("completed_indexes") or [])
        if isinstance(item, int) or str(item).isdigit()
    }
    existing_records = [dict(item) for item in list(resume_payload.get("attempt_records") or []) if isinstance(item, dict)]
    if len(resume_texts) == total:
        translated_texts = [str(item or "") for item in resume_texts]
    non_empty_items: list[tuple[int, str]] = []
    completed_sentences = 0

    for index, item in enumerate(sentences):
        normalized = str(item or "").strip()
        if index in resume_completed_indexes:
            completed_sentences += 1
            if progress_callback:
                progress_callback(completed_sentences, total)
            continue
        if normalized:
            non_empty_items.append((index, normalized))
            continue
        resume_completed_indexes.add(index)
        completed_sentences += 1
        if progress_callback:
            progress_callback(completed_sentences, total)

    records: list[TranslationAttemptRecord] = []
    failed = 0
    latest_error_summary = str(resume_payload.get("latest_error_summary") or "")
    batch_max_chars = current_translation_batch_max_chars()
    logger.info(
        "[DEBUG] qwen_mt.batch.config model=%s batch_max_chars=%s total_sentences=%s non_empty=%s",
        MT_MODEL,
        batch_max_chars,
        total,
        len(non_empty_items),
    )

    batches = _build_sentence_batches(non_empty_items)
    for batch_no, batch in enumerate(batches, start=1):
        batch_chars = sum(max(1, len(text)) for _, text in batch)
        logger.info(
            "[DEBUG] qwen_mt.batch.dispatch batch_no=%s sentence_idx=%s size=%s chars=%s limit=%s",
            batch_no,
            batch[0][0] if batch else -1,
            len(batch),
            batch_chars,
            batch_max_chars,
        )

        batch_result = _translate_batch_recursive(batch, api_key=api_key)
        records.extend(batch_result.attempt_records)
        if batch_result.latest_error_summary:
            latest_error_summary = batch_result.latest_error_summary

        for offset, (sentence_idx, _) in enumerate(batch):
            translated_texts[sentence_idx] = batch_result.texts[offset]
            resume_completed_indexes.add(sentence_idx)
            completed_sentences += 1
            if progress_callback:
                progress_callback(completed_sentences, total)
        failed = sum(1 for sentence_idx, sentence_text in non_empty_items if sentence_idx in resume_completed_indexes and not translated_texts[sentence_idx])
        if checkpoint_callback:
            checkpoint_callback(
                {
                    "translated_texts": list(translated_texts),
                    "completed_indexes": sorted(resume_completed_indexes),
                    "attempt_records": [*existing_records, *[record.to_dict() for record in records]],
                    "latest_error_summary": latest_error_summary,
                }
            )

    if failed:
        logger.warning(
            "[DEBUG] qwen_mt.batch.partial_failed failed=%s success=%s total=%s model=%s base_url=%s latest_error=%s",
            failed,
            total - failed,
            total,
            MT_MODEL,
            MT_BASE_URL,
            latest_error_summary,
        )

    all_records = [*existing_records, *[record.to_dict() for record in records]]
    success_records = [
        record
        for record in [*existing_records, *[record.to_dict() for record in records]]
        if bool(record.get("success"))
    ]
    return TranslationBatchResult(
        texts=translated_texts,
        failed_count=sum(1 for index, sentence in enumerate(sentences) if str(sentence or "").strip() and index in resume_completed_indexes and not translated_texts[index]),
        attempt_records=all_records,
        total_requests=len(all_records),
        success_request_count=len(success_records),
        success_prompt_tokens=sum(int(record.get("prompt_tokens", 0) or 0) for record in success_records),
        success_completion_tokens=sum(int(record.get("completion_tokens", 0) or 0) for record in success_records),
        success_total_tokens=sum(int(record.get("total_tokens", 0) or 0) for record in success_records),
        latest_error_summary=latest_error_summary,
    )


def split_sentence_by_semantic(
    text: str,
    *,
    api_key: str,
    model: str | None = None,
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
        requested_model = (model or "").strip() or MT_MODEL
        completion = client.chat.completions.create(
            model=requested_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            timeout=max(1, int(timeout_seconds)),
        )
    except Exception as exc:
        raise SemanticSplitError(str(exc)[:1200]) from exc

    if not completion.choices:
        raise SemanticSplitError("empty_choices")
    content = (completion.choices[0].message.content or "").strip()
    segments = _extract_json_array(content, preserve_empty=False)
    if len(segments) <= 1:
        raise SemanticSplitError("invalid_segments")
    return segments
