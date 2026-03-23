from __future__ import annotations

from typing import Callable

from app.infra import translation_qwen_mt as _infra
from app.services.lesson_task_manager import is_task_terminate_requested, wait_for_task_terminate_request


MT_MODEL = _infra.MT_MODEL
SemanticSplitError = _infra.SemanticSplitError
TranslationAttemptRecord = _infra.TranslationAttemptRecord
TranslationBatchResult = _infra.TranslationBatchResult
TranslationError = _infra.TranslationError
current_translation_batch_max_chars = _infra.current_translation_batch_max_chars
split_sentence_by_semantic = _infra.split_sentence_by_semantic
translation_batch_chars_scope = _infra.translation_batch_chars_scope


class TranslationCancellationRequested(RuntimeError):
    pass


def _raise_if_translation_cancel_requested() -> None:
    if is_task_terminate_requested():
        raise TranslationCancellationRequested("terminate requested")


def _emit_translation_progress(progress_callback: Callable[[int, int], None] | None, done: int, total: int) -> None:
    _raise_if_translation_cancel_requested()
    if progress_callback:
        progress_callback(done, total)
    _raise_if_translation_cancel_requested()


def _wait_or_raise(delay_seconds: float) -> None:
    delay = max(0.0, float(delay_seconds or 0.0))
    if delay <= 0:
        _raise_if_translation_cancel_requested()
        return
    if wait_for_task_terminate_request(delay):
        _raise_if_translation_cancel_requested()
    _raise_if_translation_cancel_requested()


def _respect_min_request_interval_with_cancel() -> None:
    if _infra.MT_MIN_REQUEST_INTERVAL_MS <= 0:
        _raise_if_translation_cancel_requested()
        return
    interval_seconds = _infra.MT_MIN_REQUEST_INTERVAL_MS / 1000.0
    with _infra._REQUEST_LOCK:
        _raise_if_translation_cancel_requested()
        now = _infra.time.monotonic()
        wait_seconds = (_infra._LAST_REQUEST_AT + interval_seconds) - now
        if wait_seconds > 0:
            _wait_or_raise(wait_seconds)
        _infra._LAST_REQUEST_AT = _infra.time.monotonic()
    _raise_if_translation_cancel_requested()


def _request_batch_translation_with_cancel(
    items: list[tuple[int, str]],
    *,
    api_key: str,
) -> tuple[list[str] | None, list[TranslationAttemptRecord], str, str]:
    if not items:
        return [], [], "", ""

    client = _infra._client(api_key)
    start_idx = int(items[0][0])
    batch_texts = [text for _, text in items]
    batch_preview = _infra._preview_batch(items)
    prompt = _infra._build_batch_prompt(batch_texts)
    raw_request_text = _infra._build_raw_request_text(prompt=prompt)
    attempt_records: list[TranslationAttemptRecord] = []

    for attempt_no in range(1, _infra.MT_RETRY_MAX_ATTEMPTS + 1):
        _raise_if_translation_cancel_requested()
        _respect_min_request_interval_with_cancel()
        started_at = _infra.now_shanghai_naive()
        try:
            completion = client.chat.completions.create(
                model=_infra.MT_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                timeout=_infra.MT_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            context = _infra._extract_error_context(exc)
            raw_error_text = _infra._serialize_raw_payload(
                {
                    "exception_type": exc.__class__.__name__,
                    "message": str(exc),
                    "context": context,
                }
            )
            record = _infra._build_attempt_record(
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
                finished_at=_infra.now_shanghai_naive(),
            )
            attempt_records.append(record)
            _infra.logger.warning(
                "[DEBUG] qwen_mt.batch.request_failed attempt=%s/%s sentence_idx=%s size=%s status_code=%s request_id=%s preview=%s detail=%s",
                attempt_no,
                _infra.MT_RETRY_MAX_ATTEMPTS,
                start_idx,
                len(items),
                record.status_code,
                record.provider_request_id,
                record.input_text_preview,
                record.error_message,
            )
            if _infra._is_retryable_status(record.status_code) and attempt_no < _infra.MT_RETRY_MAX_ATTEMPTS:
                delay_seconds = _infra._retry_delay_seconds(attempt_no)
                _infra.logger.info(
                    "[DEBUG] qwen_mt.batch.retry delay_seconds=%.3f attempt=%s sentence_idx=%s size=%s",
                    delay_seconds,
                    attempt_no + 1,
                    start_idx,
                    len(items),
                )
                _wait_or_raise(delay_seconds)
                continue
            return None, attempt_records, record.error_code or "REQUEST_FAILED", record.error_message

        _raise_if_translation_cancel_requested()
        prompt_tokens, completion_tokens, total_tokens = _infra._usage_values(completion)
        provider_request_id = str(getattr(completion, "_request_id", "") or getattr(completion, "id", "") or "").strip()
        raw_response_text = _infra._serialize_raw_payload(completion)

        if not completion.choices:
            record = _infra._build_attempt_record(
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
                finished_at=_infra.now_shanghai_naive(),
            )
            attempt_records.append(record)
            return None, attempt_records, record.error_code, record.error_message

        first_choice = completion.choices[0]
        finish_reason = str(getattr(first_choice, "finish_reason", None) or "").strip()
        content = str(getattr(first_choice.message, "content", "") or "").strip()
        translated_items, error_code, error_message = _infra._parse_batch_response(content, expected_count=len(items))
        if finish_reason == "length":
            error_code = "FINISH_REASON_LENGTH"
            error_message = "finish_reason=length"
            translated_items = None

        if translated_items is None:
            record = _infra._build_attempt_record(
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
                finished_at=_infra.now_shanghai_naive(),
            )
            attempt_records.append(record)
            return None, attempt_records, record.error_code, record.error_message

        record = _infra._build_attempt_record(
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
            finished_at=_infra.now_shanghai_naive(),
        )
        attempt_records.append(record)
        _raise_if_translation_cancel_requested()
        return translated_items, attempt_records, "", ""

    return None, attempt_records, "REQUEST_FAILED", "translation failed"


def _translate_batch_recursive_with_cancel(
    items: list[tuple[int, str]],
    *,
    api_key: str,
) -> _infra._RecursiveBatchResult:
    translated_items, attempt_records, error_code, error_message = _request_batch_translation_with_cancel(items, api_key=api_key)
    if translated_items is not None:
        return _infra._RecursiveBatchResult(
            texts=translated_items,
            failed_count=0,
            attempt_records=attempt_records,
            latest_error_summary="",
        )

    if _infra._is_fatal_batch_error(error_code):
        detail_parts = [str(error_message or error_code or "translation response parse failed").strip()]
        if items:
            detail_parts.append(f"sentence_idx={int(items[0][0]) + 1}")
            detail_parts.append(f"size={len(items)}")
            detail_parts.append(f"preview={_infra._preview_batch(items)}")
        translation_debug = {
            "total_sentences": len(items),
            "failed_sentences": len(items),
            "request_count": len(attempt_records),
            "success_request_count": sum(1 for record in attempt_records if record.success),
            "usage": {
                "prompt_tokens": sum(int(record.prompt_tokens or 0) for record in attempt_records if record.success),
                "completion_tokens": sum(int(record.completion_tokens or 0) for record in attempt_records if record.success),
                "total_tokens": sum(int(record.total_tokens or 0) for record in attempt_records if record.success),
                "charged_points": 0,
            },
            "latest_error_summary": str(error_message or error_code or "translation response parse failed").strip(),
        }
        raise TranslationError(
            "翻译结果解析失败",
            code="TRANSLATION_RESPONSE_INVALID",
            detail="; ".join(part for part in detail_parts if part),
            translation_debug=translation_debug,
        )

    if len(items) > 1:
        split_index = max(1, len(items) // 2)
        left = _translate_batch_recursive_with_cancel(items[:split_index], api_key=api_key)
        right = _translate_batch_recursive_with_cancel(items[split_index:], api_key=api_key)
        return _infra._combine_recursive_results(attempt_records, left, right)

    sentence_idx, sentence_text = items[0]
    latest_error_summary = f"第{sentence_idx + 1}句失败：{error_code or 'REQUEST_FAILED'} {error_message}".strip()
    _infra.logger.warning(
        "[DEBUG] qwen_mt.batch.item_failed index=%s preview=%s reason=%s",
        sentence_idx + 1,
        _infra._preview_text(sentence_text),
        error_message or error_code,
    )
    return _infra._RecursiveBatchResult(
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
    _raise_if_translation_cancel_requested()
    total = len(sentences)
    normalized_api_key = str(api_key or "").strip()
    if not normalized_api_key:
        latest_error_summary = "missing_api_key"
        _emit_translation_progress(progress_callback, 0, total)
        return TranslationBatchResult(
            texts=[""] * total,
            failed_count=sum(1 for sentence in sentences if str(sentence or "").strip()),
            attempt_records=[],
            total_requests=0,
            success_request_count=0,
            success_prompt_tokens=0,
            success_completion_tokens=0,
            success_total_tokens=0,
            latest_error_summary=latest_error_summary,
        )

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
            _emit_translation_progress(progress_callback, completed_sentences, total)
            continue
        if normalized:
            non_empty_items.append((index, normalized))
            continue
        resume_completed_indexes.add(index)
        completed_sentences += 1
        _emit_translation_progress(progress_callback, completed_sentences, total)

    records: list[TranslationAttemptRecord] = []
    latest_error_summary = str(resume_payload.get("latest_error_summary") or "")
    batch_max_chars = current_translation_batch_max_chars()
    _infra.logger.info(
        "[DEBUG] qwen_mt.batch.config model=%s batch_max_chars=%s total_sentences=%s non_empty=%s",
        _infra.MT_MODEL,
        batch_max_chars,
        total,
        len(non_empty_items),
    )

    batches = _infra._build_sentence_batches(non_empty_items)
    for batch_no, batch in enumerate(batches, start=1):
        _raise_if_translation_cancel_requested()
        batch_chars = sum(max(1, len(text)) for _, text in batch)
        _infra.logger.info(
            "[DEBUG] qwen_mt.batch.dispatch batch_no=%s sentence_idx=%s size=%s chars=%s limit=%s",
            batch_no,
            batch[0][0] if batch else -1,
            len(batch),
            batch_chars,
            batch_max_chars,
        )

        batch_result = _translate_batch_recursive_with_cancel(batch, api_key=normalized_api_key)
        records.extend(batch_result.attempt_records)
        if batch_result.latest_error_summary:
            latest_error_summary = batch_result.latest_error_summary

        for offset, (sentence_idx, _) in enumerate(batch):
            translated_texts[sentence_idx] = batch_result.texts[offset]
            resume_completed_indexes.add(sentence_idx)
            completed_sentences += 1
            _emit_translation_progress(progress_callback, completed_sentences, total)

        if checkpoint_callback:
            _raise_if_translation_cancel_requested()
            checkpoint_callback(
                {
                    "translated_texts": list(translated_texts),
                    "completed_indexes": sorted(resume_completed_indexes),
                    "attempt_records": [*existing_records, *[record.to_dict() for record in records]],
                    "latest_error_summary": latest_error_summary,
                }
            )

    failed_count = sum(
        1
        for index, sentence in enumerate(sentences)
        if str(sentence or "").strip() and index in resume_completed_indexes and not translated_texts[index]
    )
    if failed_count:
        _infra.logger.warning(
            "[DEBUG] qwen_mt.batch.partial_failed failed=%s success=%s total=%s model=%s base_url=%s latest_error=%s",
            failed_count,
            total - failed_count,
            total,
            _infra.MT_MODEL,
            _infra.MT_BASE_URL,
            latest_error_summary,
        )

    all_records = [*existing_records, *[record.to_dict() for record in records]]
    success_records = [record for record in all_records if bool(record.get("success"))]
    _raise_if_translation_cancel_requested()
    return TranslationBatchResult(
        texts=translated_texts,
        failed_count=failed_count,
        attempt_records=all_records,
        total_requests=len(all_records),
        success_request_count=len(success_records),
        success_prompt_tokens=sum(int(record.get("prompt_tokens", 0) or 0) for record in success_records),
        success_completion_tokens=sum(int(record.get("completion_tokens", 0) or 0) for record in success_records),
        success_total_tokens=sum(int(record.get("total_tokens", 0) or 0) for record in success_records),
        latest_error_summary=latest_error_summary,
    )


__all__ = [
    "MT_MODEL",
    "SemanticSplitError",
    "TranslationAttemptRecord",
    "TranslationBatchResult",
    "TranslationCancellationRequested",
    "TranslationError",
    "current_translation_batch_max_chars",
    "split_sentence_by_semantic",
    "translate_to_zh",
    "translate_sentences_to_zh",
    "translation_batch_chars_scope",
]
