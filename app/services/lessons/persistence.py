from __future__ import annotations

import logging
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.models import Lesson, LessonSentence
from app.models.billing import BillingModelRate
from app.repositories.progress import create_progress
from app.services.billing_service import (
    EVENT_CONSUME_TRANSLATE,
    append_translation_request_logs,
    calculate_llm_cost_by_tokens,
    calculate_points,
    calculate_token_points,
    consume_points,
    get_model_rate,
    refund_points,
    reserve_points,
    settle_reserved_points,
)
from app.services.lesson_builder import estimate_duration_ms
from app.services.lessons.cefr import process_sentences_with_cefr
from app.services.lessons.content_options import (
    CONTENT_STATE_GENERATED,
    CONTENT_STATE_PENDING_REGENERATE,
    CONTENT_STATE_SKIPPED,
    build_generated_content_status,
    clear_sentence_generated_content,
    normalize_generation_options,
)
from app.services.lesson_task_manager import persist_lesson_workspace_summary
from app.services.llm_usage_service import log_llm_usage
from app.services.media import MediaError
from app.services.translation_qwen_mt import MT_MODEL


logger = logging.getLogger(__name__)

BuildTaskResultMetaFn = Callable[..., dict[str, Any]]
BuildSubtitleCacheSeedFn = Callable[..., dict[str, Any]]


def _resolve_owner_user_cefr_level(db: Session, owner_id: int, fallback: str = "B1") -> str:
    try:
        from app.models import User

        user = db.get(User, int(owner_id))
        level = str(getattr(user, "cefr_level", "") or "").strip().upper()
        if level:
            return level
    except Exception:
        logger.warning("[DEBUG] lesson.cefr_level.resolve_failed owner_id=%s", owner_id, exc_info=True)
    return fallback


def _append_translation_request_logs_safe(
    db: Session,
    *,
    trace_id: str,
    user_id: int | None,
    task_id: str | None,
    lesson_id: int | None,
    records: list[dict[str, Any]] | None,
) -> None:
    if not records:
        return
    try:
        append_translation_request_logs(
            db,
            trace_id=trace_id,
            user_id=user_id,
            task_id=task_id,
            lesson_id=lesson_id,
            records=list(records),
        )
    except Exception as exc:
        logger.warning(
            "[DEBUG] lesson.translation_logs.persist_failed task_id=%s lesson_id=%s detail=%s",
            task_id,
            lesson_id,
            str(exc)[:400],
        )


def attach_task_result_metadata(
    lesson: Lesson,
    *,
    translation_debug: dict[str, Any] | None = None,
    result_kind: str = "full_success",
    result_message: str = "",
    partial_failure_stage: str = "",
    partial_failure_code: str = "",
    partial_failure_message: str = "",
) -> Lesson:
    lesson.task_translation_debug = dict(translation_debug) if isinstance(translation_debug, dict) else None
    lesson.task_result_kind = str(result_kind or "full_success").strip() or "full_success"
    lesson.task_result_message = str(result_message or "").strip()
    lesson.task_partial_failure_stage = str(partial_failure_stage or "").strip()
    lesson.task_partial_failure_code = str(partial_failure_code or "").strip()
    lesson.task_partial_failure_message = str(partial_failure_message or "").strip()
    return lesson


def _add_runtime_sentences(db: Session, *, lesson_id: int, runtime_sentences: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    for sentence in runtime_sentences:
        try:
            db.add(
                LessonSentence(
                    lesson_id=lesson_id,
                    idx=int(sentence["idx"]),
                    begin_ms=int(sentence["begin_ms"]),
                    end_ms=int(sentence["end_ms"]),
                    text_en=str(sentence["text_en"]),
                    text_zh=str(sentence["text_zh"]),
                    tokens_json=[str(item) for item in list(sentence.get("tokens") or [])],
                    audio_clip_path=None,
                    cefr_vocab_json=sentence.get("cefr_vocab_json"),
                    needs_explanation=sentence.get("needs_explanation", False),
                    explanation_text=sentence.get("explanation_text"),
                    simplified_sentence=sentence.get("simplified_sentence"),
                    explanation_audio_url=sentence.get("explanation_audio_url"),
                    key_explanations_json=sentence.get("key_explanations_json"),
                )
            )
        except Exception as exc:
            errors.append(str(exc))
    return errors


def create_lesson_from_local_generation_result(
    *,
    asr_payload: dict[str, Any],
    source_filename: str,
    source_duration_ms: int,
    runtime_kind: str = "local_browser",
    owner_id: int,
    asr_model: str,
    local_generation_result: dict[str, Any],
    db: Session,
    build_task_result_meta_fn: BuildTaskResultMetaFn,
    build_subtitle_cache_seed_fn: BuildSubtitleCacheSeedFn,
) -> Lesson:
    if not isinstance(asr_payload, dict):
        raise MediaError("ASR_PAYLOAD_INVALID", "本地 ASR 结果无效", "asr_payload 必须是对象")
    if not isinstance(local_generation_result, dict):
        raise MediaError("LOCAL_GENERATION_RESULT_INVALID", "本地生成结果无效", "local_generation_result 必须是对象")

    variant = dict(local_generation_result.get("variant") or {})
    runtime_sentences = [dict(item) for item in list(variant.get("sentences") or []) if isinstance(item, dict)]
    if not runtime_sentences:
        raise MediaError("LOCAL_GENERATION_RESULT_EMPTY", "本地生成结果缺少字幕", "variant.sentences is empty")
    requested_generation_options = normalize_generation_options(local_generation_result.get("requested_generation_options"))
    effective_generation_options = normalize_generation_options(
        local_generation_result.get("effective_generation_options"),
        defaults=requested_generation_options,
    )
    resolved_user_level = _resolve_owner_user_cefr_level(db, owner_id)
    cefr_state = CONTENT_STATE_GENERATED
    explanation_state = CONTENT_STATE_GENERATED
    if effective_generation_options["cefr_annotation"]:
        try:
            runtime_sentences = process_sentences_with_cefr(
                sentences=runtime_sentences,
                target_level=resolved_user_level,
                user_level=resolved_user_level,
                include_explanations=effective_generation_options["word_explanation"],
            )
            variant["sentences"] = runtime_sentences
        except Exception:
            logger.exception("[DEBUG] lesson.cefr_processing_failed.local_complete owner_id=%s", owner_id)
            cefr_state = CONTENT_STATE_PENDING_REGENERATE
            explanation_state = CONTENT_STATE_PENDING_REGENERATE if effective_generation_options["word_explanation"] else CONTENT_STATE_SKIPPED
            runtime_sentences = [
                clear_sentence_generated_content(
                    sentence,
                    clear_translation=False,
                    clear_cefr=True,
                    clear_explanation=True,
                )
                for sentence in runtime_sentences
            ]
            variant["sentences"] = runtime_sentences
    else:
        runtime_sentences = [
            clear_sentence_generated_content(
                sentence,
                clear_translation=False,
                clear_cefr=True,
                clear_explanation=True,
            )
            for sentence in runtime_sentences
        ]
        variant["sentences"] = runtime_sentences

    reserved_duration_ms = max(1, int(source_duration_ms or local_generation_result.get("source_duration_ms") or 0))
    normalized_runtime_kind = str(local_generation_result.get("runtime_kind") or runtime_kind or "local_browser").strip().lower() or "local_browser"
    translation_debug = dict(local_generation_result.get("translation_debug") or {})
    translation_usage = dict(translation_debug.get("usage") or {})
    translation_debug["usage"] = translation_usage
    failed_count = int(translation_debug.get("failed_sentences", variant.get("translate_failed_count", 0)) or 0)
    translation_debug["failed_sentences"] = failed_count
    translation_debug["total_sentences"] = int(translation_debug.get("total_sentences", len(runtime_sentences)) or len(runtime_sentences))
    translation_debug["request_count"] = int(translation_debug.get("request_count", variant.get("translation_request_count", 0)) or 0)
    translation_debug["success_request_count"] = int(
        translation_debug.get("success_request_count", variant.get("translation_success_request_count", 0)) or 0
    )
    translation_debug["latest_error_summary"] = str(
        translation_debug.get("latest_error_summary") or variant.get("latest_translate_error_summary") or ""
    )
    task_result_meta = dict(local_generation_result.get("task_result_meta") or {})
    if not task_result_meta:
        task_result_meta = build_task_result_meta_fn(variant=variant, translation_debug=translation_debug)
    subtitle_cache_seed = dict(local_generation_result.get("subtitle_cache_seed") or {})
    if not subtitle_cache_seed:
        subtitle_cache_seed = build_subtitle_cache_seed_fn(
            asr_payload=asr_payload,
            variant=variant,
            runtime_kind=normalized_runtime_kind,
        )
    translation_state = CONTENT_STATE_GENERATED
    if not effective_generation_options["zh_translation"]:
        translation_state = CONTENT_STATE_SKIPPED
        translation_debug = {}
    elif failed_count > 0:
        translation_state = CONTENT_STATE_PENDING_REGENERATE
    if not effective_generation_options["word_explanation"]:
        explanation_state = CONTENT_STATE_SKIPPED
    generated_content_status = build_generated_content_status(
        effective_options=effective_generation_options,
        translation_state=translation_state,
        cefr_state=cefr_state,
        explanation_state=explanation_state,
    )

    reserved_points = 0
    reserve_ledger_id: int | None = None
    try:
        rate = get_model_rate(db, asr_model)
        reserved_points = calculate_points(
            reserved_duration_ms,
            rate.points_per_minute,
            price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
        )
        reserve_ledger = reserve_points(
            db,
            user_id=owner_id,
            points=reserved_points,
            model_name=asr_model,
            duration_ms=reserved_duration_ms,
            note=f"本地生成结果入库预扣，模型={asr_model}，runtime={normalized_runtime_kind}",
        )
        reserve_ledger_id = reserve_ledger.id
        db.commit()

        duration_ms = max(1, int(local_generation_result.get("duration_ms") or estimate_duration_ms(asr_payload, runtime_sentences)))
        translation_rate = get_model_rate(db, MT_MODEL)
        translation_total_tokens = int(translation_usage.get("total_tokens", 0) or 0)
        translation_cost_amount_cents = calculate_token_points(
            translation_total_tokens,
            int(getattr(translation_rate, "points_per_1k_tokens", 0) or 0),
        )
        translation_usage["charged_points"] = translation_cost_amount_cents
        translation_usage["charged_amount_cents"] = translation_cost_amount_cents
        translation_usage["actual_cost_amount_cents"] = translation_cost_amount_cents

        actual_points = calculate_points(
            reserved_duration_ms,
            rate.points_per_minute,
            price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
        )
        actual_cost_amount_cents = calculate_points(
            reserved_duration_ms,
            int(getattr(rate, "cost_per_minute_cents", 0) or 0),
            price_per_minute_yuan=getattr(rate, "cost_per_minute_yuan", None),
        ) + translation_cost_amount_cents
        gross_profit_amount_cents = int(actual_points) - int(actual_cost_amount_cents)
        translation_debug["estimated_charge_amount_cents"] = int(reserved_points) + int(translation_cost_amount_cents)
        translation_debug["actual_charge_amount_cents"] = int(actual_points) + int(translation_cost_amount_cents)
        translation_debug["actual_cost_amount_cents"] = int(actual_cost_amount_cents)
        translation_debug["gross_profit_amount_cents"] = int(gross_profit_amount_cents)
        translation_usage["actual_revenue_amount_cents"] = int(actual_points) + int(translation_cost_amount_cents)
        translation_usage["gross_profit_amount_cents"] = int(gross_profit_amount_cents)

        lesson = Lesson(
            user_id=owner_id,
            title=Path(source_filename or "lesson").stem[:200] or "lesson",
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=duration_ms,
            media_storage="client_indexeddb",
            source_duration_ms=reserved_duration_ms,
            status="partial_ready" if failed_count > 0 else "ready",
        )
        lesson.user_cefr_level = resolved_user_level
        lesson.requested_generation_options_json = requested_generation_options
        lesson.effective_generation_options_json = effective_generation_options
        lesson.generated_content_status_json = generated_content_status
        db.add(lesson)
        db.flush()

        _add_runtime_sentences(db, lesson_id=lesson.id, runtime_sentences=runtime_sentences)
        create_progress(db, lesson_id=lesson.id, user_id=owner_id)
        points_diff = int(actual_points) - int(reserved_points)
        settle_reserved_points(
            db,
            user_id=owner_id,
            model_name=asr_model,
            reserved_points=reserved_points,
            actual_points=actual_points,
            duration_ms=reserved_duration_ms,
            note=(
                f"本地生成结果入库结算，预扣流水#{reserve_ledger_id}，预扣金额={reserved_points}分，实耗金额={actual_points}分，差额={points_diff}分，"
                f"runtime={normalized_runtime_kind}"
            ),
        )
        consume_points(
            db,
            user_id=owner_id,
            points=int(translation_cost_amount_cents),
            model_name=MT_MODEL,
            lesson_id=lesson.id,
            event_type=EVENT_CONSUME_TRANSLATE,
            note=f"本地课程生成翻译扣费，total_tokens={translation_total_tokens}",
        )
        log_llm_usage(
            db,
            user_id=owner_id,
            model_name=MT_MODEL,
            category="mt",
            prompt_tokens=int(translation_usage.get("prompt_tokens", 0) or 0),
            completion_tokens=int(translation_usage.get("completion_tokens", 0) or 0),
            total_tokens=translation_total_tokens,
            input_cost_cents=calculate_llm_cost_by_tokens(
                prompt_tokens=int(translation_usage.get("prompt_tokens", 0) or 0),
                completion_tokens=int(translation_usage.get("completion_tokens", 0) or 0),
                cost_per_1k_tokens_input_cents=translation_rate.cost_per_1k_tokens_input_cents,
                cost_per_1k_tokens_output_cents=translation_rate.cost_per_1k_tokens_output_cents,
            ),
            charge_cents=translation_cost_amount_cents,
            lesson_id=lesson.id,
            enable_thinking=False,
            input_text_preview="",
        )
        consume_points(
            db,
            user_id=owner_id,
            points=int(actual_points),
            model_name=asr_model,
            duration_ms=reserved_duration_ms,
            lesson_id=lesson.id,
            note=(
                f"本地生成结果入库完成，预扣流水#{reserve_ledger_id}，预扣金额={reserved_points}分，实耗金额={actual_points}分，差额={points_diff}分，"
                f"runtime={normalized_runtime_kind}"
            ),
        )
        db.commit()
        db.refresh(lesson)
        lesson.subtitle_cache_seed = subtitle_cache_seed
        lesson.requested_generation_options = requested_generation_options
        lesson.effective_generation_options = effective_generation_options
        lesson.generated_content_status = generated_content_status
        lesson.task_result_meta = dict(task_result_meta)
        lesson.translation_debug = dict(translation_debug) if translation_debug else None
        lesson.workspace_summary = persist_lesson_workspace_summary(
            owner_user_id=owner_id,
            lesson_id=int(lesson.id),
            source_filename=source_filename,
            source_duration_ms=reserved_duration_ms,
            input_mode="local_asr_complete",
            runtime_kind=normalized_runtime_kind,
            task_id="",
            status="succeeded",
            current_text=str(task_result_meta.get("result_message") or "课程已生成完成"),
            subtitle_cache_seed=subtitle_cache_seed,
            translation_debug=dict(translation_debug) if translation_debug else None,
        )
        return lesson
    except Exception:
        db.rollback()
        if reserve_ledger_id is not None:
            try:
                refund_points(
                    db,
                    user_id=owner_id,
                    points=reserved_points,
                    model_name=asr_model,
                    duration_ms=reserved_duration_ms,
                    note=f"本地生成结果入库失败，退回预扣金额，预扣流水#{reserve_ledger_id}",
                )
                db.commit()
            except Exception:
                db.rollback()
        raise


def build_one_lesson(
    lesson: Lesson,
    *,
    owner_id: int,
    asr_payload: dict[str, Any],
    variant: dict[str, Any],
    db: Session,
    source_filename: str = "",
    asr_model: str = "",
    source_duration_ms: int = 0,
    media_storage: str = "client_indexeddb",
    translation_trace_id: str | None = None,
    task_id: str | None = None,
    translation_usage: dict[str, Any] | None = None,
    translation_debug: dict[str, Any] | None = None,
    duration_ms: int | None = None,
    lesson_status: str = "",
    reserved_points: int = 0,
    actual_points: int = 0,
    translation_cost_amount_cents: int = 0,
    settle_note: str = "",
    translation_consume_note: str = "",
    translation_rate: BillingModelRate | None = None,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> SimpleNamespace:
    runtime_sentences = list(variant.get("sentences") or [])
    normalized_translation_debug = dict(translation_debug or {})
    failed_sentences = int(
        normalized_translation_debug.get("failed_sentences", variant.get("translate_failed_count", 0)) or 0
    )
    resolved_duration_ms = max(1, int(duration_ms or estimate_duration_ms(asr_payload, runtime_sentences) or 1))
    resolved_source_duration_ms = max(1, int(source_duration_ms or lesson.source_duration_ms or resolved_duration_ms or 1))
    resolved_actual_points = max(0, int(actual_points or 0))
    resolved_reserved_points = max(0, int(reserved_points or 0))
    resolved_translation_cost_amount_cents = max(0, int(translation_cost_amount_cents or 0))

    lesson.user_id = owner_id
    try:
        from app.models import User

        user = db.query(User).filter(User.id == owner_id).first()
        if user:
            lesson.user_cefr_level = user.cefr_level
    except Exception:
        pass
    if not str(getattr(lesson, "title", "") or "").strip():
        lesson.title = Path(source_filename or "lesson").stem[:200] or "lesson"
    lesson.source_filename = str(source_filename or getattr(lesson, "source_filename", "") or "")
    lesson.asr_model = str(asr_model or getattr(lesson, "asr_model", "") or "")
    lesson.duration_ms = resolved_duration_ms
    lesson.media_storage = str(media_storage or getattr(lesson, "media_storage", "") or "client_indexeddb")
    lesson.source_duration_ms = resolved_source_duration_ms
    lesson.status = str(lesson_status or getattr(lesson, "status", "") or ("partial_ready" if failed_sentences > 0 else "ready"))

    db.add(lesson)
    db.flush()

    errors = _add_runtime_sentences(db, lesson_id=lesson.id, runtime_sentences=runtime_sentences)
    create_progress(db, lesson_id=lesson.id, user_id=owner_id)
    _append_translation_request_logs_safe(
        db,
        trace_id=translation_trace_id,
        user_id=owner_id,
        task_id=task_id,
        lesson_id=lesson.id,
        records=list(variant.get("translation_attempt_records") or []),
    )
    settle_reserved_points(
        db,
        user_id=owner_id,
        model_name=lesson.asr_model,
        reserved_points=resolved_reserved_points,
        actual_points=resolved_actual_points,
        duration_ms=resolved_source_duration_ms,
        note=str(settle_note or f"课程生成结算，lesson_id={lesson.id}"),
    )
    consume_points(
        db,
        user_id=owner_id,
        points=resolved_translation_cost_amount_cents,
        model_name=MT_MODEL,
        lesson_id=lesson.id,
        event_type=EVENT_CONSUME_TRANSLATE,
        note=str(
            translation_consume_note
            or f"课程生成翻译扣费，total_tokens={int((translation_usage or {}).get('total_tokens', 0) or 0)}"
        ),
    )
    effective_translation_rate = translation_rate or get_model_rate(db, MT_MODEL)
    log_llm_usage(
        db,
        user_id=owner_id,
        model_name=MT_MODEL,
        category="mt",
        prompt_tokens=int((translation_usage or {}).get("prompt_tokens", 0) or 0),
        completion_tokens=int((translation_usage or {}).get("completion_tokens", 0) or 0),
        total_tokens=int((translation_usage or {}).get("total_tokens", 0) or 0),
        input_cost_cents=calculate_llm_cost_by_tokens(
            prompt_tokens=int((translation_usage or {}).get("prompt_tokens", 0) or 0),
            completion_tokens=int((translation_usage or {}).get("completion_tokens", 0) or 0),
            cost_per_1k_tokens_input_cents=effective_translation_rate.cost_per_1k_tokens_input_cents,
            cost_per_1k_tokens_output_cents=effective_translation_rate.cost_per_1k_tokens_output_cents,
        ),
        charge_cents=resolved_translation_cost_amount_cents,
        lesson_id=lesson.id,
        enable_thinking=False,
        input_text_preview="",
    )
    return SimpleNamespace(errors=errors)


__all__ = [
    "attach_task_result_metadata",
    "build_one_lesson",
    "create_lesson_from_local_generation_result",
]
