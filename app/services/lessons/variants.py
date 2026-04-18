from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.core.config import DASHSCOPE_API_KEY
from app.services.billing_service import get_subtitle_settings_snapshot
from app.services.lesson_builder import (
    estimate_duration_ms,
    extract_sentences,
    extract_word_items,
    normalize_learning_english_text,
    tokenize_learning_sentence,
)
from app.services.media import MediaError
from app.services.lessons.content_options import normalize_generation_options
from app.services.translation_qwen_mt import TranslationError, translate_sentences_to_zh, translation_batch_chars_scope


logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict[str, Any]], None]
BuildSubtitleVariantFn = Callable[..., dict[str, Any]]
BuildTaskResultMetaFn = Callable[..., dict[str, Any]]
BuildSubtitleCacheSeedFn = Callable[..., dict[str, Any]]
NormalizeRuntimeSentencesFn = Callable[[list[dict[str, Any]], list[str]], list[dict[str, Any]]]

_TRANSLATION_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
_TRANSLATION_ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200D\uFEFF]")


def _read_json_file(path: Path) -> dict[str, Any] | None:
    try:
        if not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None
    except Exception:
        logger.warning("[DEBUG] lesson.checkpoint.read_failed path=%s", path, exc_info=True)
        return None


def _write_json_file(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")


def _json_default(value: Any) -> str:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def _sanitize_translation_text(text: str) -> str:
    normalized = str(text or "")
    normalized = _TRANSLATION_ZERO_WIDTH_RE.sub("", normalized)
    normalized = _TRANSLATION_CONTROL_CHAR_RE.sub(" ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _prepare_translation_sentences(sentences: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    cleaned_sentences: list[dict[str, Any]] = []
    dropped_count = 0
    for sentence in sentences:
        cleaned = dict(sentence)
        cleaned_text = _sanitize_translation_text(str(sentence.get("text") or ""))
        if not cleaned_text:
            dropped_count += 1
            continue
        cleaned["text"] = cleaned_text
        cleaned_sentences.append(cleaned)
    return cleaned_sentences, dropped_count


def _build_translation_failure_debug(
    *,
    total_sentences: int,
    failed_sentences: int,
    request_count: int,
    success_request_count: int,
    latest_error_summary: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
) -> dict[str, Any]:
    return {
        "total_sentences": int(total_sentences),
        "failed_sentences": int(failed_sentences),
        "request_count": int(request_count),
        "success_request_count": int(success_request_count),
        "usage": {
            "prompt_tokens": int(prompt_tokens),
            "completion_tokens": int(completion_tokens),
            "total_tokens": int(total_tokens),
            "charged_points": 0,
        },
        "latest_error_summary": str(latest_error_summary or "").strip(),
    }


def _call_translate_sentences_to_zh(
    sentences: list[str],
    *,
    api_key: str,
    progress_callback: Callable[[int, int], None] | None = None,
    resume_state: dict[str, Any] | None = None,
    checkpoint_callback: Callable[[dict[str, Any]], None] | None = None,
):
    kwargs: dict[str, Any] = {"api_key": api_key}
    if progress_callback is not None:
        kwargs["progress_callback"] = progress_callback
    if resume_state is not None:
        kwargs["resume_state"] = resume_state
    if checkpoint_callback is not None:
        kwargs["checkpoint_callback"] = checkpoint_callback
    try:
        return translate_sentences_to_zh(sentences, **kwargs)
    except TypeError as exc:
        if "unexpected keyword argument" not in str(exc):
            raise
        legacy_kwargs: dict[str, Any] = {"api_key": api_key}
        if progress_callback is not None:
            legacy_kwargs["progress_callback"] = progress_callback
        return translate_sentences_to_zh(sentences, **legacy_kwargs)


def _emit_subtitle_variant_progress(
    callback: ProgressCallback | None,
    *,
    stage: str,
    message: str,
    translate_done: int = 0,
    translate_total: int = 0,
) -> None:
    if not callback:
        return
    if stage == "prepare":
        stage_key = "build_lesson"
        stage_status = "running"
        stage_ratio = 0.08
        overall_percent = 48 + int(20 * stage_ratio)
    elif stage == "translate":
        stage_key = "translate_zh"
        stage_status = "running"
        stage_ratio = 0.0 if translate_total <= 0 else max(0.0, min(1.0, translate_done / max(translate_total, 1)))
        overall_percent = 68 + int(17 * stage_ratio)
    elif stage == "completed":
        stage_key = "translate_zh"
        stage_status = "completed"
        overall_percent = 85
    else:
        stage_key = ""
        stage_status = ""
        overall_percent = None
    try:
        callback(
            {
                "stage": stage,
                "stage_key": stage_key,
                "stage_status": stage_status,
                "message": message,
                "current_text": message,
                "overall_percent": overall_percent,
                "translate_done": max(0, int(translate_done)),
                "translate_total": max(0, int(translate_total)),
                "counters": {
                    "translate_done": max(0, int(translate_done)),
                    "translate_total": max(0, int(translate_total)),
                },
            }
        )
    except Exception:
        logger.exception("[DEBUG] lesson.subtitle_variant_progress.emit_failed stage=%s", stage)


def normalize_runtime_sentences(sentences: list[dict[str, Any]], zh_list: list[str]) -> list[dict[str, Any]]:
    normalized_sentences: list[dict[str, Any]] = []
    for idx, sentence in enumerate(sentences):
        normalized_text_en = normalize_learning_english_text(str(sentence["text"]))
        normalized_tokens = tokenize_learning_sentence(normalized_text_en)
        normalized_sentences.append(
            {
                "idx": idx,
                "begin_ms": int(sentence["begin_ms"]),
                "end_ms": int(sentence["end_ms"]),
                "text_en": normalized_text_en,
                "text_zh": zh_list[idx] if idx < len(zh_list) else "",
                "tokens": normalized_tokens,
                "audio_url": None,
            }
        )
    return normalized_sentences


def build_subtitle_variant(
    *,
    asr_payload: dict[str, Any],
    db: Session,
    task_id: str | None = None,
    generation_options: dict[str, Any] | None = None,
    allow_partial_translation: bool = False,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
    before_translate_callback: Callable[[int], None] | None = None,
    translation_progress_callback: Callable[[int, int], None] | None = None,
    translation_checkpoint_path: Path | None = None,
    normalize_runtime_sentences_fn: NormalizeRuntimeSentencesFn = normalize_runtime_sentences,
) -> dict[str, Any]:
    if not isinstance(asr_payload, dict):
        raise MediaError("ASR_PAYLOAD_INVALID", "字幕源数据无效", "asr_payload 必须是对象")

    normalized_generation_options = normalize_generation_options(generation_options)
    subtitle_settings = get_subtitle_settings_snapshot(db)
    _emit_subtitle_variant_progress(progress_callback, stage="prepare", message="正在重切分句")

    sentences = extract_sentences(asr_payload)
    split_mode = "asr_sentences"
    if not sentences:
        raise MediaError("ASR_SENTENCE_MISSING", "ASR 返回结果缺少句级信息", "未找到有效句子")

    source_word_count = len(extract_word_items(asr_payload))
    prepared_sentences, dropped_translation_sentences = _prepare_translation_sentences(sentences)
    if not prepared_sentences:
        raise TranslationError(
            "翻译阶段失败，请重试",
            code="TRANSLATION_INPUT_EMPTY",
            detail="识别结果清洗后没有可翻译内容",
            translation_debug={
                "total_sentences": 0,
                "failed_sentences": 0,
                "request_count": 0,
                "success_request_count": 0,
                "latest_error_summary": "识别结果清洗后没有可翻译内容",
            },
        )
    if dropped_translation_sentences:
        logger.warning(
            "[DEBUG] lesson.translation_input.dropped count=%s before=%s after=%s",
            dropped_translation_sentences,
            len(sentences),
            len(prepared_sentences),
        )
    sentences = prepared_sentences

    if not normalized_generation_options["zh_translation"]:
        normalized_sentences = normalize_runtime_sentences_fn(sentences, [])
        return {
            "split_mode": split_mode,
            "source_word_count": source_word_count,
            "strategy_version": 2 if split_mode == "asr_sentences" else 1,
            "sentences": normalized_sentences,
            "translate_failed_count": 0,
            "translation_attempt_records": [],
            "translation_request_count": 0,
            "translation_success_request_count": 0,
            "translation_usage": {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "charged_points": 0,
            },
            "latest_translate_error_summary": "",
            "task_id": task_id,
        }

    if before_translate_callback:
        before_translate_callback(len(sentences))
    _emit_subtitle_variant_progress(
        progress_callback,
        stage="translate",
        message=f"正在翻译 0/{len(sentences)}",
        translate_done=0,
        translate_total=len(sentences),
    )
    translation_source_texts = [str(item["text"]) for item in sentences]
    translation_resume_state = _read_json_file(translation_checkpoint_path) if translation_checkpoint_path else None
    if (
        not isinstance(translation_resume_state, dict)
        or list(translation_resume_state.get("source_texts") or []) != translation_source_texts
    ):
        translation_resume_state = None

    def _on_translation_progress(done: int, total: int) -> None:
        if translation_progress_callback:
            translation_progress_callback(done, total)
        _emit_subtitle_variant_progress(
            progress_callback,
            stage="translate",
            message=f"正在翻译 {done}/{total}",
            translate_done=done,
            translate_total=total,
        )

    def _on_translation_checkpoint(checkpoint_payload: dict[str, Any]) -> None:
        if not translation_checkpoint_path:
            return
        _write_json_file(
            translation_checkpoint_path,
            {
                "source_texts": translation_source_texts,
                "translated_texts": list(checkpoint_payload.get("translated_texts") or []),
                "completed_indexes": list(checkpoint_payload.get("completed_indexes") or []),
                "attempt_records": list(checkpoint_payload.get("attempt_records") or []),
                "latest_error_summary": str(checkpoint_payload.get("latest_error_summary") or ""),
            },
        )

    translation_batch_max_chars = max(
        1,
        min(
            12000,
            int(getattr(subtitle_settings, "translation_batch_max_chars", 2600) or 2600),
        ),
    )
    logger.info(
        "[DEBUG] lesson.subtitle_variant translation_batch_chars=%s sentence_total=%s",
        translation_batch_max_chars,
        len(sentences),
    )
    with translation_batch_chars_scope(translation_batch_max_chars):
        translation_result = _call_translate_sentences_to_zh(
            [item["text"] for item in sentences],
            api_key=DASHSCOPE_API_KEY,
            progress_callback=_on_translation_progress,
            resume_state=translation_resume_state,
            checkpoint_callback=_on_translation_checkpoint,
        )
    if int(translation_result.failed_count or 0) > 0 and not allow_partial_translation:
        latest_error_summary = str(translation_result.latest_error_summary or "").strip() or "翻译存在失败句子"
        raise TranslationError(
            "翻译阶段失败，请重试",
            code="TRANSLATION_INCOMPLETE",
            detail=latest_error_summary,
            translation_debug=_build_translation_failure_debug(
                total_sentences=len(sentences),
                failed_sentences=int(translation_result.failed_count or 0),
                request_count=int(translation_result.total_requests or 0),
                success_request_count=int(translation_result.success_request_count or 0),
                latest_error_summary=latest_error_summary,
                prompt_tokens=int(translation_result.success_prompt_tokens or 0),
                completion_tokens=int(translation_result.success_completion_tokens or 0),
                total_tokens=int(translation_result.success_total_tokens or 0),
            ),
        )
    if int(translation_result.failed_count or 0) > 0 and allow_partial_translation:
        logger.warning(
            "[DEBUG] lesson.subtitle_variant.partial_translation task_id=%s failed_count=%s latest_error=%s",
            task_id,
            int(translation_result.failed_count or 0),
            str(translation_result.latest_error_summary or "")[:240],
        )
    normalized_sentences = normalize_runtime_sentences_fn(sentences, translation_result.texts)
    _emit_subtitle_variant_progress(
        progress_callback,
        stage="completed",
        message="字幕重新生成完成",
        translate_done=len(sentences),
        translate_total=len(sentences),
    )
    return {
        "split_mode": split_mode,
        "source_word_count": source_word_count,
        "strategy_version": 2 if split_mode == "asr_sentences" else 1,
        "sentences": normalized_sentences,
        "translate_failed_count": int(translation_result.failed_count),
        "translation_attempt_records": list(translation_result.attempt_records),
        "translation_request_count": int(translation_result.total_requests),
        "translation_success_request_count": int(translation_result.success_request_count),
        "translation_usage": {
            "prompt_tokens": int(translation_result.success_prompt_tokens),
            "completion_tokens": int(translation_result.success_completion_tokens),
            "total_tokens": int(translation_result.success_total_tokens),
            "charged_points": 0,
        },
        "latest_translate_error_summary": str(translation_result.latest_error_summary or ""),
        "task_id": task_id,
    }


def build_subtitle_cache_seed(*, asr_payload: dict[str, Any], variant: dict[str, Any], runtime_kind: str = "") -> dict[str, Any]:
    payload = {
        "split_mode": str(variant.get("split_mode") or ""),
        "source_word_count": int(variant.get("source_word_count", 0)),
        "strategy_version": int(variant.get("strategy_version", 1)),
        "asr_payload": dict(asr_payload or {}),
        "sentences": [dict(item) for item in list(variant.get("sentences") or []) if isinstance(item, dict)],
    }
    normalized_runtime_kind = str(runtime_kind or "").strip().lower()
    if normalized_runtime_kind:
        payload["runtime_kind"] = normalized_runtime_kind
    return payload


def build_task_result_meta(*, variant: dict[str, Any], translation_debug: dict[str, Any]) -> dict[str, Any]:
    failed_sentences = int(translation_debug.get("failed_sentences", 0) or 0)
    latest_error_summary = str(translation_debug.get("latest_error_summary") or "").strip()
    if failed_sentences > 0:
        return {
            "result_kind": "asr_only",
            "result_message": "课程已生成，翻译失败，可先使用原文字幕学习。",
            "partial_failure_stage": "translate_zh",
            "partial_failure_code": "TRANSLATION_INCOMPLETE",
            "partial_failure_message": latest_error_summary or "翻译阶段失败",
        }
    return {
        "result_kind": "full_success",
        "result_message": "课程已生成完成",
        "partial_failure_stage": "",
        "partial_failure_code": "",
        "partial_failure_message": "",
    }


def build_local_generation_result(
    *,
    asr_payload: dict[str, Any],
    runtime_kind: str,
    asr_model: str,
    source_duration_ms: int,
    db: Session,
    task_id: str | None = None,
    progress_callback: ProgressCallback | None = None,
    generation_options: dict[str, Any] | None = None,
    build_subtitle_variant_fn: BuildSubtitleVariantFn = build_subtitle_variant,
    build_task_result_meta_fn: BuildTaskResultMetaFn = build_task_result_meta,
    build_subtitle_cache_seed_fn: BuildSubtitleCacheSeedFn = build_subtitle_cache_seed,
) -> dict[str, Any]:
    normalized_runtime_kind = str(runtime_kind or "local_browser").strip().lower() or "local_browser"
    variant = build_subtitle_variant_fn(
        asr_payload=asr_payload,
        db=db,
        task_id=task_id,
        generation_options=generation_options,
        allow_partial_translation=True,
        progress_callback=progress_callback,
    )
    runtime_sentences = [dict(item) for item in list(variant.get("sentences") or []) if isinstance(item, dict)]
    translation_usage = dict(variant.get("translation_usage") or {})
    translation_usage["charged_points"] = 0
    translation_usage["charged_amount_cents"] = 0
    translation_usage["actual_cost_amount_cents"] = 0
    failed_count = int(variant.get("translate_failed_count", 0) or 0)
    translation_debug = {
        "total_sentences": len(runtime_sentences),
        "failed_sentences": failed_count,
        "request_count": int(variant.get("translation_request_count", 0) or 0),
        "success_request_count": int(variant.get("translation_success_request_count", 0) or 0),
        "usage": translation_usage,
        "latest_error_summary": str(variant.get("latest_translate_error_summary") or ""),
    }
    return {
        "runtime_kind": normalized_runtime_kind,
        "lesson_status": "partial_ready" if failed_count > 0 else "ready",
        "duration_ms": estimate_duration_ms(asr_payload, runtime_sentences),
        "source_duration_ms": max(1, int(source_duration_ms or 0)),
        "variant": dict(variant),
        "translation_debug": translation_debug,
        "task_result_meta": build_task_result_meta_fn(variant=variant, translation_debug=translation_debug),
        "subtitle_cache_seed": build_subtitle_cache_seed_fn(
            asr_payload=asr_payload,
            variant=variant,
            runtime_kind=normalized_runtime_kind,
        ),
        "asr_model": str(asr_model or "").strip(),
    }


__all__ = [
    "build_local_generation_result",
    "build_subtitle_cache_seed",
    "build_subtitle_variant",
    "build_task_result_meta",
    "normalize_runtime_sentences",
]
