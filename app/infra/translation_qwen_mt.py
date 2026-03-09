from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Callable

from openai import OpenAI

from app.core.timezone import now_shanghai_naive


MT_BASE_URL = os.getenv("MT_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip()
MT_MODEL = os.getenv("MT_MODEL", "qwen-mt-plus").strip()
MT_TIMEOUT_SECONDS = max(5, int((os.getenv("MT_TIMEOUT_SECONDS", "20") or "20").strip() or "20"))
logger = logging.getLogger(__name__)


class TranslationError(RuntimeError):
    pass


class SemanticSplitError(RuntimeError):
    pass


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
    provider_request_id: str = "",
    status_code: int | None = None,
    finish_reason: str = "",
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    success: bool,
    error_code: str = "",
    error_message: str = "",
    started_at=None,
    finished_at=None,
) -> TranslationAttemptRecord:
    return TranslationAttemptRecord(
        sentence_idx=sentence_idx,
        attempt_no=1,
        provider="dashscope_compatible",
        model_name=MT_MODEL,
        base_url=MT_BASE_URL,
        input_text_preview=_preview_text(input_text),
        provider_request_id=str(provider_request_id or "").strip(),
        status_code=status_code,
        finish_reason=str(finish_reason or "").strip(),
        prompt_tokens=max(0, int(prompt_tokens or 0)),
        completion_tokens=max(0, int(completion_tokens or 0)),
        total_tokens=max(0, int(total_tokens or 0)),
        success=bool(success),
        error_code=str(error_code or "").strip(),
        error_message=str(error_message or "")[:1200],
        started_at=started_at or now_shanghai_naive(),
        finished_at=finished_at or now_shanghai_naive(),
    )


def _translate_sentence_to_zh(text: str, api_key: str, *, sentence_idx: int) -> tuple[str, TranslationAttemptRecord]:
    normalized = (text or "").strip()
    started_at = now_shanghai_naive()
    if not normalized:
        record = _build_attempt_record(
            sentence_idx=sentence_idx,
            input_text=normalized,
            success=False,
            error_code="EMPTY_INPUT",
            error_message="empty input",
            status_code=400,
            started_at=started_at,
            finished_at=now_shanghai_naive(),
        )
        return "", record

    client = _client(api_key)
    try:
        completion = client.chat.completions.create(
            model=MT_MODEL,
            messages=[{"role": "user", "content": normalized}],
            extra_body={"translation_options": {"source_lang": "English", "target_lang": "Chinese"}},
            timeout=MT_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        context = _extract_error_context(exc)
        record = _build_attempt_record(
            sentence_idx=sentence_idx,
            input_text=normalized,
            provider_request_id=str(context["request_id"] or ""),
            status_code=context["status_code"] if isinstance(context["status_code"], int) else None,
            success=False,
            error_code=str(context["error_code"] or "") or "REQUEST_FAILED",
            error_message=str(context["detail"] or "")[:1200],
            started_at=started_at,
            finished_at=now_shanghai_naive(),
        )
        logger.warning(
            "[DEBUG] qwen_mt.translate.error status_code=%s request_id=%s model=%s base_url=%s sentence_idx=%s preview=%s detail=%s",
            record.status_code,
            record.provider_request_id,
            MT_MODEL,
            MT_BASE_URL,
            sentence_idx,
            record.input_text_preview,
            record.error_message,
        )
        return "", record

    prompt_tokens, completion_tokens, total_tokens = _usage_values(completion)
    provider_request_id = str(getattr(completion, "_request_id", "") or getattr(completion, "id", "") or "").strip()
    if not completion.choices:
        record = _build_attempt_record(
            sentence_idx=sentence_idx,
            input_text=normalized,
            provider_request_id=provider_request_id,
            status_code=200,
            success=False,
            error_code="EMPTY_CHOICES",
            error_message="empty choices",
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            started_at=started_at,
            finished_at=now_shanghai_naive(),
        )
        logger.warning(
            "[DEBUG] qwen_mt.translate.empty_choices model=%s base_url=%s sentence_idx=%s preview=%s",
            MT_MODEL,
            MT_BASE_URL,
            sentence_idx,
            record.input_text_preview,
        )
        return "", record

    first_choice = completion.choices[0]
    finish_reason = str(getattr(first_choice, "finish_reason", None) or "").strip()
    content = (first_choice.message.content or "").strip()
    if finish_reason == "length":
        logger.warning(
            "[DEBUG] qwen_mt.translate.finish_length model=%s sentence_idx=%s prompt_tokens=%s completion_tokens=%s total_tokens=%s preview=%s",
            MT_MODEL,
            sentence_idx,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            _preview_text(normalized),
        )
    if not content:
        record = _build_attempt_record(
            sentence_idx=sentence_idx,
            input_text=normalized,
            provider_request_id=provider_request_id,
            status_code=200,
            finish_reason=finish_reason,
            success=False,
            error_code="EMPTY_CONTENT",
            error_message="empty translated content",
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            started_at=started_at,
            finished_at=now_shanghai_naive(),
        )
        logger.warning(
            "[DEBUG] qwen_mt.translate.empty_content finish_reason=%s sentence_idx=%s prompt_tokens=%s completion_tokens=%s total_tokens=%s preview=%s",
            finish_reason,
            sentence_idx,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            record.input_text_preview,
        )
        return "", record

    record = _build_attempt_record(
        sentence_idx=sentence_idx,
        input_text=normalized,
        provider_request_id=provider_request_id,
        status_code=200,
        finish_reason=finish_reason,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        success=True,
        started_at=started_at,
        finished_at=now_shanghai_naive(),
    )
    return content, record


def translate_to_zh(text: str, api_key: str) -> str:
    if not str(text or "").strip():
        return ""
    translated, record = _translate_sentence_to_zh(text, api_key, sentence_idx=0)
    if not record.success:
        raise TranslationError(record.error_message or record.error_code or "translation failed")
    return translated


def translate_sentences_to_zh(
    sentences: list[str],
    api_key: str,
    progress_callback: Callable[[int, int], None] | None = None,
) -> TranslationBatchResult:
    texts: list[str] = []
    records: list[dict[str, object]] = []
    failed = 0
    total = len(sentences)
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    success_request_count = 0
    latest_error_summary = ""

    for index, item in enumerate(sentences, start=1):
        translated, record = _translate_sentence_to_zh(item, api_key, sentence_idx=index - 1)
        texts.append(translated)
        records.append(record.to_dict())
        if record.success:
            success_request_count += 1
            prompt_tokens += record.prompt_tokens
            completion_tokens += record.completion_tokens
            total_tokens += record.total_tokens
        else:
            failed += 1
            latest_error_summary = f"第{index}句失败：{record.error_code or 'REQUEST_FAILED'} {record.error_message}".strip()
            logger.warning(
                "[DEBUG] qwen_mt.batch.item_failed index=%s/%s preview=%s reason=%s",
                index,
                total,
                record.input_text_preview,
                record.error_message or record.error_code,
            )
        if progress_callback:
            progress_callback(index, total)

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

    return TranslationBatchResult(
        texts=texts,
        failed_count=failed,
        attempt_records=records,
        total_requests=len(records),
        success_request_count=success_request_count,
        success_prompt_tokens=prompt_tokens,
        success_completion_tokens=completion_tokens,
        success_total_tokens=total_tokens,
        latest_error_summary=latest_error_summary,
    )


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
