from __future__ import annotations

import json
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.core.config import BASE_DATA_DIR, DASHSCOPE_API_KEY
from app.models import Lesson, LessonSentence, MediaAsset
from app.repositories.progress import create_progress
from app.services.asr_dashscope import transcribe_audio_file
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
from app.services.collins_levels import normalize_collins_level
from app.services.lesson_builder import (
    estimate_duration_ms,
    extract_sentences,
    extract_word_items,
    normalize_learning_english_text,
    tokenize_learning_sentence,
)
from app.services.lesson_service import LessonService
from app.services.lesson_task_manager import persist_lesson_workspace_summary
from app.services.lessons.content_options import (
    CONTENT_STATE_GENERATED,
    CONTENT_STATE_SKIPPED,
    build_generated_content_status,
    clear_sentence_generated_content,
    normalize_generation_options,
)
from app.services.lessons.vocabulary import process_sentences_with_vocabulary
from app.services.llm_usage_service import log_llm_usage
from app.services.media import extract_audio_for_asr, probe_audio_duration_ms
from app.services.translation_qwen_mt import MT_MODEL, TranslationError, translate_sentences_to_zh


logger = logging.getLogger(__name__)
ProgressCallback = Callable[[dict[str, Any]], None]


@dataclass(frozen=True)
class GenerationJobSpec:
    task_id: str
    owner_id: int
    source_filename: str
    source_path: Path
    work_dir: Path
    requested_asr_model: str
    effective_asr_model: str
    generation_options: dict[str, Any]
    media_storage: str = "server"
    source_duration_ms: int = 0


class CourseGenerationError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        self.code = str(code or "COURSE_GENERATION_FAILED").strip() or "COURSE_GENERATION_FAILED"
        self.message = str(message or "课程生成失败").strip() or "课程生成失败"
        self.detail = str(detail or "").strip()
        super().__init__(self.message)


def _progress_percent(stage_key: str, ratio: float = 1.0) -> int:
    safe_ratio = max(0.0, min(1.0, float(ratio or 0.0)))
    bounds = {
        "convert_audio": (0, 15),
        "asr_transcribe": (15, 45),
        "build_lesson": (45, 60),
        "translate_zh": (60, 85),
        "vocabulary_annotation": (85, 90),
        "word_explanation": (90, 95),
        "write_lesson": (95, 100),
    }.get(stage_key, (0, 100))
    return int(bounds[0] + (bounds[1] - bounds[0]) * safe_ratio)


def _emit(callback: ProgressCallback | None, *, stage_key: str, stage_status: str, current_text: str, ratio: float = 1.0, **extra: Any) -> None:
    if not callback:
        return
    payload = {
        "stage_key": stage_key,
        "stage_status": stage_status,
        "overall_percent": _progress_percent(stage_key, ratio),
        "current_text": current_text,
    }
    payload.update(extra)
    callback(payload)


def _resolve_owner_user_collins_level(db: Session, owner_id: int) -> int:
    from app.models import User

    user = db.get(User, int(owner_id))
    if user is None:
        raise CourseGenerationError("OWNER_NOT_FOUND", "用户不存在", f"owner_id={owner_id}")
    normalized = normalize_collins_level(getattr(user, "collins_level", None), default=None)
    if normalized is None:
        raise CourseGenerationError("USER_LEVEL_REQUIRED", "用户等级缺失，无法生成生词标注", f"owner_id={owner_id}")
    return normalized


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def _prepare_audio(spec: GenerationJobSpec, callback: ProgressCallback | None) -> tuple[Path, int]:
    opus_path = spec.work_dir / "lesson_input.opus"
    if not spec.source_path.exists() or spec.source_path.stat().st_size <= 0:
        raise CourseGenerationError("MEDIA_SOURCE_INVALID", "上传素材无效", str(spec.source_path))
    if spec.source_path.stat().st_size < 1024:
        raise CourseGenerationError(
            "MEDIA_SOURCE_TOO_SMALL",
            "上传素材过小，无法作为音视频素材处理",
            f"path={spec.source_path} size={spec.source_path.stat().st_size}",
        )
    _emit(callback, stage_key="convert_audio", stage_status="running", current_text="抽取音频", ratio=0.1)
    extract_audio_for_asr(spec.source_path, opus_path)
    if not opus_path.exists() or opus_path.stat().st_size <= 0:
        raise CourseGenerationError("AUDIO_EXTRACT_EMPTY", "音频抽取结果为空", str(opus_path))
    duration_ms = int(spec.source_duration_ms or probe_audio_duration_ms(opus_path) or 0)
    if duration_ms <= 0:
        raise CourseGenerationError("MEDIA_DURATION_REQUIRED", "无法读取素材时长", str(spec.source_path))
    _emit(callback, stage_key="convert_audio", stage_status="completed", current_text="音频已准备", ratio=1.0)
    return opus_path, duration_ms


def _run_asr(
    spec: GenerationJobSpec,
    *,
    opus_path: Path,
    source_duration_ms: int,
    callback: ProgressCallback | None,
) -> dict[str, Any]:
    asr_result_path = spec.work_dir / "asr_result.json"
    _emit(
        callback,
        stage_key="asr_transcribe",
        stage_status="running",
        current_text="识别字幕",
        ratio=0.05,
        counters={"asr_done": 0, "asr_estimated": 0, "segment_done": 0, "segment_total": 0},
    )

    def _on_asr_progress(payload: dict[str, Any]) -> None:
        elapsed = max(0, int(payload.get("elapsed_seconds", 0) or 0))
        segment_done = max(0, int(payload.get("segment_done", 0) or 0))
        segment_total = max(segment_done, int(payload.get("segment_total", 0) or 0))
        if segment_total > 0:
            ratio = min(0.98, max(0.05, segment_done / max(segment_total, 1)))
        else:
            ratio = min(0.85, 0.05 + elapsed / 180.0)
        _emit(
            callback,
            stage_key="asr_transcribe",
            stage_status="running",
            current_text=f"识别字幕 {segment_done}/{segment_total}" if segment_total else "识别字幕",
            ratio=ratio,
            counters={"segment_done": segment_done, "segment_total": segment_total},
        )

    raw = transcribe_audio_file(
        str(opus_path),
        model=spec.effective_asr_model,
        known_duration_ms=source_duration_ms,
        progress_callback=_on_asr_progress,
    )
    asr_payload = dict(raw.get("asr_result_json") or {})
    if not asr_payload:
        raise ValueError("ASR result is empty")
    _write_json(asr_result_path, {"asr_payload": asr_payload, "raw_result": raw})
    _emit(
        callback,
        stage_key="asr_transcribe",
        stage_status="completed",
        current_text="字幕识别完成",
        ratio=1.0,
        asr_raw=dict(raw),
    )
    return {
        "asr_payload": asr_payload,
        "raw_result": raw,
        "usage_seconds": raw.get("usage_seconds"),
    }


def _build_variant(
    spec: GenerationJobSpec,
    *,
    asr_payload: dict[str, Any],
    callback: ProgressCallback | None,
    db: Session,
) -> dict[str, Any]:
    variant_result_path = spec.work_dir / "variant_result.json"
    _emit(callback, stage_key="build_lesson", stage_status="running", current_text="生成课程结构", ratio=0.2)

    provider_sentences = extract_sentences(asr_payload)
    if not provider_sentences:
        raise ValueError("ASR provider did not return sentence-level subtitles")

    zh_list: list[str] = []
    translation_attempt_records: list[dict[str, Any]] = []
    translation_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "charged_points": 0}
    translation_request_count = 0
    translation_success_request_count = 0
    latest_translate_error_summary = ""
    if spec.generation_options.get("zh_translation"):
        total = len(provider_sentences)
        _emit(
            callback,
            stage_key="translate_zh",
            stage_status="running",
            current_text=f"翻译字幕 0/{total}",
            ratio=0.0,
            counters={"translate_done": 0, "translate_total": total},
        )
        if not str(DASHSCOPE_API_KEY or "").strip():
            raise TranslationError(
                "已开启中文翻译，但翻译模型 qwen-mt-flash 需要 DASHSCOPE_API_KEY",
                code="TRANSLATION_API_KEY_MISSING",
                detail="ASR 模型只负责英文字幕识别；中文翻译是独立阶段。请配置 DASHSCOPE_API_KEY，或关闭中文翻译后只生成原文字幕。",
                translation_debug={"total_sentences": total, "failed_sentences": total, "latest_error_summary": "DASHSCOPE_API_KEY is missing"},
            )

        def _translation_progress(done: int, total_count: int) -> None:
            _emit(
                callback,
                stage_key="translate_zh",
                stage_status="running",
                current_text=f"翻译字幕 {done}/{total_count}",
                ratio=(done / max(total_count, 1)) if total_count else 0,
                counters={"translate_done": max(0, int(done)), "translate_total": max(0, int(total_count))},
            )

        translation_result = translate_sentences_to_zh(
            [str(item["text"]) for item in provider_sentences],
            api_key=DASHSCOPE_API_KEY,
            progress_callback=_translation_progress,
        )
        zh_list = list(translation_result.texts or [])
        translation_attempt_records = [dict(item) for item in list(translation_result.attempt_records or []) if isinstance(item, dict)]
        translation_usage = {
            "prompt_tokens": int(translation_result.success_prompt_tokens or 0),
            "completion_tokens": int(translation_result.success_completion_tokens or 0),
            "total_tokens": int(translation_result.success_total_tokens or 0),
            "charged_points": 0,
        }
        translation_request_count = int(translation_result.total_requests or 0)
        translation_success_request_count = int(translation_result.success_request_count or 0)
        latest_translate_error_summary = str(translation_result.latest_error_summary or "")
        if int(translation_result.failed_count or 0) > 0:
            raise TranslationError(
                "翻译阶段失败，请重试",
                code="TRANSLATION_INCOMPLETE",
                detail=latest_translate_error_summary or "翻译存在失败句子",
                translation_debug={
                    "total_sentences": total,
                    "failed_sentences": int(translation_result.failed_count or 0),
                    "request_count": translation_request_count,
                    "success_request_count": translation_success_request_count,
                    "latest_error_summary": latest_translate_error_summary,
                    "usage": translation_usage,
                },
            )

    runtime_sentences: list[dict[str, Any]] = []
    for idx, sentence in enumerate(provider_sentences):
        text_en = normalize_learning_english_text(str(sentence.get("text") or ""))
        if not text_en:
            raise ValueError(f"ASR provider sentence {idx} has empty text")
        begin_ms = int(sentence.get("begin_ms") or 0)
        end_ms = int(sentence.get("end_ms") or 0)
        if end_ms <= begin_ms:
            raise ValueError(f"ASR provider sentence {idx} has invalid official timestamps")
        runtime_sentences.append(
            {
                "idx": idx,
                "begin_ms": begin_ms,
                "end_ms": end_ms,
                "text_en": text_en,
                "text_zh": zh_list[idx] if idx < len(zh_list) else "",
                "tokens": tokenize_learning_sentence(text_en),
                "audio_url": None,
            }
        )

    variant = {
        "split_mode": "asr_provider_sentences",
        "source_word_count": len(extract_word_items(asr_payload)),
        "strategy_version": 3,
        "sentences": runtime_sentences,
        "translate_failed_count": 0,
        "translation_attempt_records": translation_attempt_records,
        "translation_request_count": translation_request_count,
        "translation_success_request_count": translation_success_request_count,
        "translation_usage": translation_usage,
        "latest_translate_error_summary": latest_translate_error_summary,
        "task_id": spec.task_id,
    }
    _write_json(variant_result_path, dict(variant))
    _emit(callback, stage_key="build_lesson", stage_status="completed", current_text="课程结构已生成", ratio=1.0)
    if spec.generation_options.get("zh_translation"):
        total = len(list(variant.get("sentences") or []))
        _emit(
            callback,
            stage_key="translate_zh",
            stage_status="completed",
            current_text=f"翻译字幕 {total}/{total}",
            ratio=1.0,
            counters={"translate_done": total, "translate_total": total},
        )
    return dict(variant)


def _apply_strict_content_options(
    spec: GenerationJobSpec,
    *,
    variant: dict[str, Any],
    owner_level: int,
    callback: ProgressCallback | None,
) -> tuple[list[dict[str, Any]], str, str]:
    runtime_sentences = [dict(item) for item in list(variant.get("sentences") or []) if isinstance(item, dict)]
    if not runtime_sentences:
        raise ValueError("Lesson variant does not contain runtime sentences")

    if not spec.generation_options.get("vocabulary_annotation"):
        return (
            [
                clear_sentence_generated_content(
                    sentence,
                    clear_translation=False,
                    clear_vocabulary=True,
                    clear_explanation=True,
                )
                for sentence in runtime_sentences
            ],
            CONTENT_STATE_SKIPPED,
            CONTENT_STATE_SKIPPED,
        )

    _emit(callback, stage_key="vocabulary_annotation", stage_status="running", current_text="生成生词标注", ratio=0.2)
    enriched = process_sentences_with_vocabulary(
        sentences=runtime_sentences,
        target_level=owner_level,
        user_level=owner_level,
        include_explanations=bool(spec.generation_options.get("word_explanation")),
    )
    _emit(callback, stage_key="vocabulary_annotation", stage_status="completed", current_text="生词标注已生成", ratio=1.0)
    if spec.generation_options.get("word_explanation"):
        _emit(callback, stage_key="word_explanation", stage_status="completed", current_text="讲解已生成", ratio=1.0)
        explanation_state = CONTENT_STATE_GENERATED
    else:
        explanation_state = CONTENT_STATE_SKIPPED
    return enriched, CONTENT_STATE_GENERATED, explanation_state


def _persist_media(*, lesson_id: int, source_path: Path, opus_path: Path, source_filename: str, db: Session) -> None:
    lesson_dir = BASE_DATA_DIR / f"lesson_{lesson_id}"
    lesson_dir.mkdir(parents=True, exist_ok=True)
    source_suffix = Path(source_filename or "").suffix.lower() or source_path.suffix.lower() or ".bin"
    stored_source_path = lesson_dir / f"source{source_suffix}"
    stored_opus_path = lesson_dir / "lesson_input.opus"
    shutil.copy2(source_path, stored_source_path)
    shutil.copy2(opus_path, stored_opus_path)
    db.add(MediaAsset(lesson_id=lesson_id, original_path=str(stored_source_path), opus_path=str(stored_opus_path)))


def _add_sentences(*, db: Session, lesson_id: int, runtime_sentences: list[dict[str, Any]]) -> None:
    for sentence in runtime_sentences:
        db.add(
            LessonSentence(
                lesson_id=lesson_id,
                idx=int(sentence["idx"]),
                begin_ms=int(sentence["begin_ms"]),
                end_ms=int(sentence["end_ms"]),
                text_en=str(sentence["text_en"]),
                text_zh=str(sentence.get("text_zh") or ""),
                tokens_json=[str(item) for item in list(sentence.get("tokens") or [])],
                audio_clip_path=None,
                vocabulary_analysis_json=sentence.get("vocabulary_analysis_json"),
                needs_explanation=bool(sentence.get("needs_explanation", False)),
                explanation_text=sentence.get("explanation_text"),
                simplified_sentence=sentence.get("simplified_sentence"),
                explanation_audio_url=sentence.get("explanation_audio_url"),
                key_explanations_json=sentence.get("key_explanations_json"),
            )
        )


def _persist_lesson(
    spec: GenerationJobSpec,
    *,
    opus_path: Path,
    source_duration_ms: int,
    asr_payload: dict[str, Any],
    variant: dict[str, Any],
    runtime_sentences: list[dict[str, Any]],
    vocabulary_state: str,
    explanation_state: str,
    reserved_points: int,
    usage_seconds: int | None,
    callback: ProgressCallback | None,
    db: Session,
) -> Lesson:
    _emit(callback, stage_key="write_lesson", stage_status="running", current_text="保存课程", ratio=0.2)
    duration_ms = max(1, estimate_duration_ms(asr_payload, runtime_sentences))
    usage_hit = isinstance(usage_seconds, int) and usage_seconds > 0
    actual_duration_ms = int(usage_seconds * 1000) if usage_hit else duration_ms
    rate = get_model_rate(db, spec.effective_asr_model)
    actual_points = calculate_points(
        actual_duration_ms,
        rate.points_per_minute,
        price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
    )

    translation_enabled = bool(spec.generation_options.get("zh_translation"))
    translation_rate = get_model_rate(db, MT_MODEL) if translation_enabled else None
    translation_usage = dict(variant.get("translation_usage") or {})
    translation_cost_points = (
        calculate_token_points(
            int(translation_usage.get("total_tokens", 0) or 0),
            int(getattr(translation_rate, "points_per_1k_tokens", 0) or 0),
        )
        if translation_enabled
        else 0
    )
    translation_usage["charged_points"] = translation_cost_points
    translation_usage["charged_amount_cents"] = translation_cost_points
    translation_usage["actual_cost_amount_cents"] = translation_cost_points
    translation_debug = {
        "total_sentences": len(runtime_sentences),
        "failed_sentences": int(variant.get("translate_failed_count", 0) or 0),
        "request_count": int(variant.get("translation_request_count", 0) or 0),
        "success_request_count": int(variant.get("translation_success_request_count", 0) or 0),
        "usage": translation_usage,
        "latest_error_summary": str(variant.get("latest_translate_error_summary") or ""),
    }
    if translation_debug["failed_sentences"] > 0:
        raise ValueError(f"Translation failed for {translation_debug['failed_sentences']} sentence(s)")

    translation_state = CONTENT_STATE_GENERATED if translation_enabled else CONTENT_STATE_SKIPPED
    generated_content_status = build_generated_content_status(
        effective_options=spec.generation_options,
        translation_state=translation_state,
        vocabulary_state=vocabulary_state,
        explanation_state=explanation_state,
    )
    lesson = Lesson(
        user_id=spec.owner_id,
        title=Path(spec.source_filename or "lesson").stem[:200] or "lesson",
        source_filename=spec.source_filename,
        asr_model=spec.effective_asr_model,
        duration_ms=duration_ms,
        media_storage="server",
        source_duration_ms=source_duration_ms,
        status="ready",
    )
    lesson.user_collins_level = _resolve_owner_user_collins_level(db, spec.owner_id) if spec.generation_options.get("vocabulary_annotation") else None
    lesson.requested_generation_options_json = dict(spec.generation_options)
    lesson.effective_generation_options_json = dict(spec.generation_options)
    lesson.generated_content_status_json = generated_content_status
    db.add(lesson)
    db.flush()

    _persist_media(lesson_id=int(lesson.id), source_path=spec.source_path, opus_path=opus_path, source_filename=spec.source_filename, db=db)
    _add_sentences(db=db, lesson_id=int(lesson.id), runtime_sentences=runtime_sentences)
    create_progress(db, lesson_id=int(lesson.id), user_id=spec.owner_id)

    points_diff = int(actual_points) - int(reserved_points)
    settle_reserved_points(
        db,
        user_id=spec.owner_id,
        model_name=spec.effective_asr_model,
        reserved_points=int(reserved_points),
        actual_points=int(actual_points),
        duration_ms=actual_duration_ms,
        note=(
            f"课程生成结算，预扣金额={reserved_points}分，实耗金额={actual_points}分，"
            f"差额={points_diff}分，usage_seconds={usage_seconds if usage_hit else 'duration'}"
        ),
    )
    if translation_enabled:
        consume_points(
            db,
            user_id=spec.owner_id,
            points=int(translation_cost_points),
            model_name=MT_MODEL,
            lesson_id=int(lesson.id),
            event_type=EVENT_CONSUME_TRANSLATE,
            note=f"课程生成翻译扣费，total_tokens={int(translation_usage.get('total_tokens', 0) or 0)}",
        )
    if translation_enabled and variant.get("translation_attempt_records"):
        try:
            append_translation_request_logs(
                db,
                trace_id=spec.task_id,
                user_id=spec.owner_id,
                task_id=spec.task_id,
                lesson_id=int(lesson.id),
                records=list(variant.get("translation_attempt_records") or []),
            )
        except Exception:
            logger.warning("course_generation.translation_logs_failed task_id=%s lesson_id=%s", spec.task_id, lesson.id, exc_info=True)
    if translation_enabled:
        log_llm_usage(
            db,
            user_id=spec.owner_id,
            model_name=MT_MODEL,
            category="mt",
            prompt_tokens=int(translation_usage.get("prompt_tokens", 0) or 0),
            completion_tokens=int(translation_usage.get("completion_tokens", 0) or 0),
            total_tokens=int(translation_usage.get("total_tokens", 0) or 0),
            input_cost_cents=calculate_llm_cost_by_tokens(
                prompt_tokens=int(translation_usage.get("prompt_tokens", 0) or 0),
                completion_tokens=int(translation_usage.get("completion_tokens", 0) or 0),
                cost_per_1k_tokens_input_cents=translation_rate.cost_per_1k_tokens_input_cents,
                cost_per_1k_tokens_output_cents=translation_rate.cost_per_1k_tokens_output_cents,
            ),
            charge_cents=int(translation_cost_points),
            lesson_id=int(lesson.id),
            enable_thinking=False,
            input_text_preview="",
        )
    db.commit()
    db.refresh(lesson)

    subtitle_cache_seed = LessonService.build_subtitle_cache_seed(asr_payload=asr_payload, variant=variant)
    lesson.subtitle_cache_seed = subtitle_cache_seed
    lesson.requested_generation_options = dict(spec.generation_options)
    lesson.effective_generation_options = dict(spec.generation_options)
    lesson.generated_content_status = generated_content_status
    lesson.translation_debug = translation_debug if translation_enabled else None
    lesson.task_result_meta = {"result_kind": "full_success", "result_message": "课程生成完成"}
    lesson.workspace_summary = persist_lesson_workspace_summary(
        owner_user_id=spec.owner_id,
        lesson_id=int(lesson.id),
        source_filename=spec.source_filename,
        source_duration_ms=source_duration_ms,
        input_mode="upload",
        runtime_kind="cloud_api",
        task_id=spec.task_id,
        status="succeeded",
        current_text="课程生成完成",
        subtitle_cache_seed=subtitle_cache_seed,
        translation_debug=lesson.translation_debug,
    )
    _write_json(
        spec.work_dir / "lesson_result.json",
        {"lesson_id": int(lesson.id), "subtitle_cache_seed": subtitle_cache_seed, "task_result_meta": lesson.task_result_meta},
    )
    _emit(callback, stage_key="write_lesson", stage_status="completed", current_text="课程生成完成", ratio=1.0, translation_debug=translation_debug)
    return lesson


def run_generation_job(spec: GenerationJobSpec, *, db: Session, progress_callback: ProgressCallback | None = None) -> Lesson:
    normalized_options = normalize_generation_options(spec.generation_options)
    normalized_spec = GenerationJobSpec(
        task_id=spec.task_id,
        owner_id=spec.owner_id,
        source_filename=spec.source_filename,
        source_path=Path(spec.source_path),
        work_dir=Path(spec.work_dir),
        requested_asr_model=spec.requested_asr_model,
        effective_asr_model=spec.effective_asr_model,
        generation_options=normalized_options,
        media_storage="server",
        source_duration_ms=int(spec.source_duration_ms or 0),
    )
    reserved_points = 0
    reserved_duration_ms = 0
    reserve_ledger_id: int | None = None
    try:
        opus_path, reserved_duration_ms = _prepare_audio(normalized_spec, progress_callback)
        rate = get_model_rate(db, normalized_spec.effective_asr_model)
        reserved_points = calculate_points(
            reserved_duration_ms,
            rate.points_per_minute,
            price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
        )
        reserve_ledger = reserve_points(
            db,
            user_id=normalized_spec.owner_id,
            points=reserved_points,
            model_name=normalized_spec.effective_asr_model,
            duration_ms=reserved_duration_ms,
            note=f"课程生成预扣，模型={normalized_spec.effective_asr_model}",
        )
        reserve_ledger_id = int(reserve_ledger.id)
        db.commit()

        asr_result = _run_asr(normalized_spec, opus_path=opus_path, source_duration_ms=reserved_duration_ms, callback=progress_callback)
        variant = _build_variant(normalized_spec, asr_payload=asr_result["asr_payload"], callback=progress_callback, db=db)
        owner_level = _resolve_owner_user_collins_level(db, normalized_spec.owner_id) if normalized_spec.generation_options.get("vocabulary_annotation") else 0
        runtime_sentences, vocabulary_state, explanation_state = _apply_strict_content_options(
            normalized_spec,
            variant=variant,
            owner_level=owner_level,
            callback=progress_callback,
        )
        variant["sentences"] = runtime_sentences
        return _persist_lesson(
            normalized_spec,
            opus_path=opus_path,
            source_duration_ms=reserved_duration_ms,
            asr_payload=asr_result["asr_payload"],
            variant=variant,
            runtime_sentences=runtime_sentences,
            vocabulary_state=vocabulary_state,
            explanation_state=explanation_state,
            reserved_points=reserved_points,
            usage_seconds=asr_result.get("usage_seconds"),
            callback=progress_callback,
            db=db,
        )
    except Exception:
        db.rollback()
        if reserve_ledger_id is not None:
            try:
                refund_points(
                    db,
                    user_id=normalized_spec.owner_id,
                    points=reserved_points,
                    model_name=normalized_spec.effective_asr_model,
                    duration_ms=reserved_duration_ms or None,
                    note=f"课程生成失败，退回预扣点数，预扣流水#{reserve_ledger_id}",
                )
                db.commit()
            except Exception:
                db.rollback()
        raise
