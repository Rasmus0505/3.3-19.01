from __future__ import annotations

import json
import logging
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.core.config import BASE_DATA_DIR, DASHSCOPE_API_KEY
from app.services.forced_alignment import ForcedAlignmentError, align_transcript_timestamps
from app.services.ai_platform import transcribe_audio, translate_sentences
from app.models import Lesson, LessonSentence, MediaAsset
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
from app.services.collins_levels import normalize_collins_level
from app.services.lesson_builder import (
    estimate_duration_ms,
    extract_sentences,
    extract_word_items,
    normalize_learning_english_text,
    resolve_official_sentence_timestamps_ms,
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
from app.services.lessons.recovery_contract import (
    build_source_identity,
    load_asr_checkpoint,
    load_forced_alignment_checkpoint,
    load_lesson_result_checkpoint,
    load_translation_checkpoint,
    load_variant_checkpoint,
    write_checkpoint,
)
from app.services.lessons.vocabulary import process_sentences_with_vocabulary
from app.services.llm_usage_service import log_llm_usage
from app.services.media import extract_audio_for_asr, probe_audio_duration_ms
from app.services.translation_qwen_mt import MT_MODEL, TranslationError


logger = logging.getLogger(__name__)
ProgressCallback = Callable[[dict[str, Any]], None]
transcribe_audio_file = transcribe_audio
translate_sentences_to_zh = translate_sentences


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


def _now_iso() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _event(kind: str, text: str) -> dict:
    return {"ts": _now_iso(), "kind": kind, "text": text}


def _progress_percent(stage_key: str, ratio: float = 1.0) -> int:
    safe_ratio = max(0.0, min(1.0, float(ratio or 0.0)))
    bounds = {
        "convert_audio": (0, 15),
        "asr_transcribe": (15, 45),
        "forced_alignment": (45, 60),
        "build_lesson": (60, 70),
        "translate_zh": (70, 88),
        "vocabulary_annotation": (88, 93),
        "word_explanation": (93, 97),
        "write_lesson": (97, 100),
    }.get(stage_key, (0, 100))
    return int(bounds[0] + (bounds[1] - bounds[0]) * safe_ratio)


def _emit(callback: ProgressCallback | None, *, stage_key: str, stage_status: str, current_text: str, ratio: float = 1.0, events: list[dict] | None = None, **extra: Any) -> None:
    if not callback:
        return
    payload: dict[str, Any] = {
        "stage_key": stage_key,
        "stage_status": stage_status,
        "overall_percent": _progress_percent(stage_key, ratio),
        "current_text": current_text,
    }
    if events:
        payload["events"] = events
    payload.update({k: v for k, v in extra.items() if k != "events"})
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


def _source_identity(spec: GenerationJobSpec) -> dict[str, Any]:
    return build_source_identity(
        task_id=spec.task_id,
        source_path=spec.source_path,
        source_filename=spec.source_filename,
    )


def _checkpoint_stages(payload: dict[str, Any] | None) -> set[str]:
    if not isinstance(payload, dict):
        return set()
    completed_stages = {
        str(item).strip()
        for item in list(payload.get("completed_stages") or [])
        if str(item or "").strip()
    }
    sentences = [dict(item) for item in list(payload.get("sentences") or []) if isinstance(item, dict)]
    if sentences:
        completed_stages.add("build_lesson")
    if any(str(item.get("text_zh") or "").strip() for item in sentences):
        completed_stages.add("translate_zh")
    if any(item.get("vocabulary_analysis_json") is not None for item in sentences):
        completed_stages.add("vocabulary_annotation")
    if any(
        item.get("explanation_text")
        or item.get("simplified_sentence")
        or item.get("key_explanations_json")
        for item in sentences
    ):
        completed_stages.add("word_explanation")
    return completed_stages


def _variant_sentences(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    return [dict(item) for item in list((payload or {}).get("sentences") or []) if isinstance(item, dict)]


def _translation_resume_state(
    *,
    checkpoint_path: Path,
    source_identity: dict[str, Any],
    source_texts: list[str],
) -> dict[str, Any] | None:
    payload = load_translation_checkpoint(checkpoint_path, current_source_identity=source_identity)
    if not isinstance(payload, dict):
        return None
    if list(payload.get("source_texts") or []) != list(source_texts or []):
        return None
    return payload


def _call_translate_sentences(
    sentences: list[str],
    *,
    progress_callback: Callable[[int, int], None] | None = None,
    resume_state: dict[str, Any] | None = None,
    checkpoint_callback: Callable[[dict[str, Any]], None] | None = None,
):
    kwargs: dict[str, Any] = {
        "model_key": MT_MODEL,
        "api_key": DASHSCOPE_API_KEY,
    }
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
        legacy_kwargs: dict[str, Any] = {"api_key": DASHSCOPE_API_KEY}
        if progress_callback is not None:
            legacy_kwargs["progress_callback"] = progress_callback
        return translate_sentences_to_zh(sentences, **legacy_kwargs)


def _prepare_audio(spec: GenerationJobSpec, callback: ProgressCallback | None) -> tuple[Path, int]:
    opus_path = spec.work_dir / "lesson_input.opus"
    if opus_path.exists() and opus_path.stat().st_size > 0:
        duration_ms = int(spec.source_duration_ms or probe_audio_duration_ms(opus_path) or 0)
        if duration_ms <= 0:
            raise CourseGenerationError("MEDIA_DURATION_REQUIRED", "无法读取素材时长", str(opus_path))
        _emit(callback, stage_key="convert_audio", stage_status="completed", current_text="音频已准备", ratio=1.0, events=[
            _event("milestone", f"音频缓存已存在，时长 {duration_ms // 1000 // 60}:{duration_ms // 1000 % 60:02d}")
        ])
        return opus_path, duration_ms
    if not spec.source_path.exists() or spec.source_path.stat().st_size <= 0:
        raise CourseGenerationError("MEDIA_SOURCE_INVALID", "上传素材无效", str(spec.source_path))
    if spec.source_path.stat().st_size < 1024:
        raise CourseGenerationError(
            "MEDIA_SOURCE_TOO_SMALL",
            "上传素材过小，无法作为音视频素材处理",
            f"path={spec.source_path} size={spec.source_path.stat().st_size}",
        )
    source_size_mb = spec.source_path.stat().st_size / (1024 * 1024)
    _emit(callback, stage_key="convert_audio", stage_status="running", current_text="抽取音频", ratio=0.1, events=[
        _event("info", f"正在从素材中抽取音频 ({source_size_mb:.1f} MB)")
    ])
    extract_audio_for_asr(spec.source_path, opus_path)
    if not opus_path.exists() or opus_path.stat().st_size <= 0:
        raise CourseGenerationError("AUDIO_EXTRACT_EMPTY", "音频抽取结果为空", str(opus_path))
    duration_ms = int(spec.source_duration_ms or probe_audio_duration_ms(opus_path) or 0)
    if duration_ms <= 0:
        raise CourseGenerationError("MEDIA_DURATION_REQUIRED", "无法读取素材时长", str(spec.source_path))
    minutes = duration_ms // 1000 // 60
    seconds = duration_ms // 1000 % 60
    _emit(callback, stage_key="convert_audio", stage_status="completed", current_text="音频已准备", ratio=1.0, events=[
        _event("milestone", f"音频抽取完成，时长 {minutes}:{seconds:02d}")
    ])
    return opus_path, duration_ms


def _run_asr(
    spec: GenerationJobSpec,
    *,
    opus_path: Path,
    source_duration_ms: int,
    callback: ProgressCallback | None,
) -> dict[str, Any]:
    asr_result_path = spec.work_dir / "asr_result.json"
    source_identity = _source_identity(spec)
    cached_checkpoint = load_asr_checkpoint(asr_result_path, current_source_identity=source_identity)
    if isinstance(cached_checkpoint, dict):
        cached_asr_payload = dict(cached_checkpoint.get("asr_payload") or {})
        cached_raw_result = dict(cached_checkpoint.get("raw_result") or {})
        cached_counters = dict(cached_checkpoint.get("progress_counters") or {})
        _emit(
            callback,
            stage_key="asr_transcribe",
            stage_status="completed",
            current_text="字幕识别完成",
            ratio=1.0,
            counters=cached_counters or {"asr_done": 0, "asr_estimated": 0, "segment_done": 0, "segment_total": 0},
            asr_raw=cached_raw_result or None,
        )
        return {
            "asr_payload": cached_asr_payload,
            "raw_result": cached_raw_result,
            "usage_seconds": cached_checkpoint.get("usage_seconds"),
        }
    _emit(
        callback,
        stage_key="asr_transcribe",
        stage_status="running",
        current_text="识别字幕",
        ratio=0.05,
        counters={"asr_done": 0, "asr_estimated": 0, "segment_done": 0, "segment_total": 0},
        events=[
            _event("info", f"开始 ASR 转写，模型: {spec.effective_asr_model}"),
        ],
    )

    def _on_asr_progress(payload: dict[str, Any]) -> None:
        elapsed = max(0, int(payload.get("elapsed_seconds", 0) or 0))
        segment_done = max(0, int(payload.get("segment_done", 0) or 0))
        segment_total = max(segment_done, int(payload.get("segment_total", 0) or 0))
        if segment_total > 0:
            ratio = min(0.98, max(0.05, segment_done / max(segment_total, 1)))
        else:
            ratio = min(0.85, 0.05 + elapsed / 180.0)
        events = []
        if segment_total > 0 and segment_done > 0:
            events.append(_event("progress", f"识别进度 {segment_done}/{segment_total} 段"))
        _emit(
            callback,
            stage_key="asr_transcribe",
            stage_status="running",
            current_text=f"识别字幕 {segment_done}/{segment_total}" if segment_total else "识别字幕",
            ratio=ratio,
            counters={"segment_done": segment_done, "segment_total": segment_total},
            events=events if events else None,
        )

    raw = transcribe_audio_file(
        str(opus_path),
        model_key=spec.effective_asr_model,
        known_duration_ms=source_duration_ms,
        progress_callback=_on_asr_progress,
    )
    asr_payload = dict(raw.get("asr_result_json") or {})
    if not asr_payload:
        raise ValueError("ASR result is empty")
    progress_counters = {
        "asr_done": max(0, int((raw.get("progress_counters") or {}).get("asr_done", 0) or 0)),
        "asr_estimated": max(0, int((raw.get("progress_counters") or {}).get("asr_estimated", 0) or 0)),
        "segment_done": max(0, int((raw.get("progress_counters") or {}).get("segment_done", 0) or 0)),
        "segment_total": max(0, int((raw.get("progress_counters") or {}).get("segment_total", 0) or 0)),
    }
    write_checkpoint(
        asr_result_path,
        stage="asr_transcribe",
        source_identity=source_identity,
        payload={
            "asr_payload": asr_payload,
            "raw_result": raw,
            "usage_seconds": raw.get("usage_seconds"),
            "progress_counters": progress_counters,
        },
    )
    sentence_count = len(list(asr_payload.get("sentences") or []))
    _emit(
        callback,
        stage_key="asr_transcribe",
        stage_status="completed",
        current_text="字幕识别完成",
        ratio=1.0,
        counters=progress_counters,
        asr_raw=dict(raw),
        events=[
            _event("milestone", f"字幕识别完成，共识别 {sentence_count} 个句子"),
        ],
    )
    return {
        "asr_payload": asr_payload,
        "raw_result": raw,
        "usage_seconds": raw.get("usage_seconds"),
    }


def _infer_alignment_language(spec: GenerationJobSpec) -> str:
    model_key = str(spec.effective_asr_model or spec.requested_asr_model or "").strip().lower()
    if "stepaudio" in model_key:
        return "English"
    return "English"


def _apply_forced_alignment(
    spec: GenerationJobSpec,
    *,
    opus_path: Path,
    provider_sentences: list[dict[str, Any]],
    callback: ProgressCallback | None,
) -> dict[str, Any]:
    forced_alignment_path = spec.work_dir / "forced_alignment.json"
    source_identity = _source_identity(spec)
    cached_checkpoint = load_forced_alignment_checkpoint(forced_alignment_path, current_source_identity=source_identity)
    if isinstance(cached_checkpoint, dict):
        cached_sentence_count = len(list(cached_checkpoint.get("sentences") or []))
        _emit(
            callback,
            stage_key="forced_alignment",
            stage_status="completed",
            current_text="时间戳对齐完成",
            ratio=1.0,
            events=[
                _event("info", f"时间戳对齐缓存命中，{cached_sentence_count} 句已对齐"),
            ],
        )
        return cached_checkpoint
    sentence_count = len(provider_sentences)
    _emit(callback, stage_key="forced_alignment", stage_status="running", current_text="时间戳对齐中", ratio=0.15, events=[
        _event("info", f"开始时间戳对齐，{sentence_count} 句"),
    ])
    try:
        result = align_transcript_timestamps(
            audio_path=opus_path,
            source_sentences=provider_sentences,
            language=_infer_alignment_language(spec),
        )
    except ForcedAlignmentError:
        raise
    except Exception as exc:
        raise ForcedAlignmentError("FORCED_ALIGNMENT_RUN_FAILED", "本地时间戳对齐执行失败", str(exc)) from exc
    aligned_count = len(list(result.get("sentences") or []))
    _emit(
        callback,
        stage_key="forced_alignment",
        stage_status="completed",
        current_text="时间戳对齐完成",
        ratio=1.0,
        events=[
            _event("milestone", f"时间戳对齐完成，{aligned_count} 句时间戳已精校"),
        ],
    )
    aligned_sentence_indexes = list(result.get("aligned_sentence_indexes") or [])
    if not aligned_sentence_indexes:
        aligned_sentence_indexes = [
            int(item.get("idx", index))
            for index, item in enumerate(list(result.get("sentences") or []))
            if isinstance(item, dict)
        ]
    checkpoint_payload = {
        "language": str(result.get("language") or ""),
        "words": [dict(item) for item in list(result.get("words") or []) if isinstance(item, dict)],
        "sentences": [dict(item) for item in list(result.get("sentences") or []) if isinstance(item, dict)],
        "aligned_sentence_indexes": aligned_sentence_indexes,
    }
    write_checkpoint(
        forced_alignment_path,
        stage="forced_alignment",
        source_identity=source_identity,
        payload=checkpoint_payload,
    )
    return checkpoint_payload


def _build_variant(
    spec: GenerationJobSpec,
    *,
    opus_path: Path,
    asr_payload: dict[str, Any],
    callback: ProgressCallback | None,
    db: Session,
) -> dict[str, Any]:
    variant_result_path = spec.work_dir / "variant_result.json"
    source_identity = _source_identity(spec)
    cached_variant = load_variant_checkpoint(variant_result_path, current_source_identity=source_identity)
    cached_stages = _checkpoint_stages(cached_variant)
    if isinstance(cached_variant, dict) and "build_lesson" in cached_stages:
        cached_sentences = len(list(cached_variant.get("sentences") or []))
        _emit(callback, stage_key="build_lesson", stage_status="completed", current_text="课程结构已生成", ratio=1.0, events=[
            _event("info", f"课程结构缓存命中，{cached_sentences} 句"),
        ])
        return dict(cached_variant)

    _emit(callback, stage_key="build_lesson", stage_status="running", current_text="生成课程结构", ratio=0.2, events=[
        _event("info", "解析句子结构，准备课程数据"),
    ])
    try:
        provider_sentences = extract_sentences(asr_payload)
    except ValueError as exc:
        raise CourseGenerationError(
            "ASR_PROVIDER_SENTENCES_INVALID",
            "ASR 返回的句子时间戳无效",
            str(exc),
        ) from exc
    if not provider_sentences:
        raise ValueError("ASR provider did not return sentence-level subtitles")

    forced_alignment_result = None
    if spec.generation_options.get("forced_alignment"):
        _total_words = sum(len(list(s.get("words") or [])) for s in provider_sentences)
        _sentence_count = len(provider_sentences)
        if _sentence_count <= 2 and _total_words >= 100:
            _avg_words = _total_words / max(1, _sentence_count)
            logger.warning(
                "[DEBUG] pipeline.forced_alignment_guard skipping alignment: "
                "sentences=%s total_words=%s avg_words_per_sentence=%.0f — ASR sentence segmentation may be incomplete",
                _sentence_count,
                _total_words,
                _avg_words,
            )
        else:
            try:
                forced_alignment_result = _apply_forced_alignment(
                    spec,
                    opus_path=opus_path,
                    provider_sentences=provider_sentences,
                    callback=callback,
                )
                provider_sentences = [dict(item) for item in list(forced_alignment_result.get("sentences") or []) if isinstance(item, dict)]
            except ForcedAlignmentError as exc:
                raise CourseGenerationError(exc.code, exc.message, exc.detail) from exc

    runtime_sentences: list[dict[str, Any]] = []
    for idx, sentence in enumerate(provider_sentences):
        text_en = normalize_learning_english_text(str(sentence.get("text_en") or sentence.get("text") or ""))
        if not text_en:
            raise ValueError(f"ASR provider sentence {idx} has empty text")
        timestamps = resolve_official_sentence_timestamps_ms(sentence)
        if timestamps is None:
            raise ValueError(f"ASR provider sentence {idx} has invalid official timestamps")
        begin_ms, end_ms = timestamps
        runtime_sentences.append(
            {
                "idx": int(sentence.get("idx", idx)),
                "begin_ms": begin_ms,
                "end_ms": end_ms,
                "text_en": text_en,
                "text_zh": "",
                "tokens": list(sentence.get("tokens") or tokenize_learning_sentence(text_en)),
                "audio_url": sentence.get("audio_url"),
            }
        )

    completed_stages = ["build_lesson"]
    if not spec.generation_options.get("zh_translation"):
        completed_stages.append("translate_zh")
    variant = {
        "split_mode": "asr_provider_sentences",
        "source_word_count": len(extract_word_items(asr_payload)),
        "strategy_version": 3,
        "sentences": runtime_sentences,
        "forced_alignment": {
            "enabled": bool(spec.generation_options.get("forced_alignment")),
            "applied": bool(forced_alignment_result),
            "language": str((forced_alignment_result or {}).get("language") or ""),
            "words": [dict(item) for item in list((forced_alignment_result or {}).get("words") or []) if isinstance(item, dict)],
            "aligned_sentence_indexes": list((forced_alignment_result or {}).get("aligned_sentence_indexes") or []),
        },
        "translate_failed_count": 0,
        "translation_attempt_records": [],
        "translation_request_count": 0,
        "translation_success_request_count": 0,
        "translation_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "charged_points": 0},
        "latest_translate_error_summary": "",
        "task_id": spec.task_id,
        "completed_stages": completed_stages,
    }
    write_checkpoint(
        variant_result_path,
        stage="build_lesson",
        source_identity=source_identity,
        payload=variant,
    )
    sentence_count = len(list(variant.get("sentences") or []))
    _emit(callback, stage_key="build_lesson", stage_status="completed", current_text="课程结构已生成", ratio=1.0, events=[
        _event("milestone", f"课程结构生成完成，共 {sentence_count} 句"),
    ])
    return dict(variant)


def _translate_variant_if_needed(
    spec: GenerationJobSpec,
    *,
    variant: dict[str, Any],
    callback: ProgressCallback | None,
) -> dict[str, Any]:
    if not spec.generation_options.get("zh_translation"):
        return dict(variant)

    completed_stages = _checkpoint_stages(variant)
    total = len(_variant_sentences(variant))
    if "translate_zh" in completed_stages:
        _emit(
            callback,
            stage_key="translate_zh",
            stage_status="completed",
            current_text=f"翻译字幕 {total}/{total}",
            ratio=1.0,
            counters={"translate_done": total, "translate_total": total},
        )
        return dict(variant)

    if not str(DASHSCOPE_API_KEY or "").strip():
        raise TranslationError(
            "已开启中文翻译，但翻译模型 qwen-mt-flash 需要 DASHSCOPE_API_KEY",
            code="TRANSLATION_API_KEY_MISSING",
            detail="ASR 模型只负责英文字幕识别；中文翻译是独立阶段。请配置 DASHSCOPE_API_KEY，或关闭中文翻译后只生成原文字幕。",
            translation_debug={"total_sentences": total, "failed_sentences": total, "latest_error_summary": "DASHSCOPE_API_KEY is missing"},
        )

    source_identity = _source_identity(spec)
    translation_checkpoint_path = spec.work_dir / "translation_checkpoint.json"
    translation_source_texts = [str(item.get("text_en") or "") for item in _variant_sentences(variant)]
    translation_resume_state = _translation_resume_state(
        checkpoint_path=translation_checkpoint_path,
        source_identity=source_identity,
        source_texts=translation_source_texts,
    )

    def _translation_progress(done: int, total_count: int) -> None:
        events: list[dict] = []
        if done > 0 and (done <= 3 or done % 3 == 0 or done == total_count):
            events.append(_event("progress", f"翻译进度 {done}/{total_count} 句"))
        _emit(
            callback,
            stage_key="translate_zh",
            stage_status="running",
            current_text=f"翻译字幕 {done}/{total_count}",
            ratio=(done / max(total_count, 1)) if total_count else 0,
            counters={"translate_done": max(0, int(done)), "translate_total": max(0, int(total_count))},
            events=events if events else None,
        )

    def _translation_checkpoint(checkpoint_payload: dict[str, Any]) -> None:
        write_checkpoint(
            translation_checkpoint_path,
            stage="translate_zh",
            source_identity=source_identity,
            stage_completed=False,
            payload={
                "source_texts": translation_source_texts,
                "translated_texts": list(checkpoint_payload.get("translated_texts") or []),
                "completed_indexes": list(checkpoint_payload.get("completed_indexes") or []),
                "attempt_records": list(checkpoint_payload.get("attempt_records") or []),
                "latest_error_summary": str(checkpoint_payload.get("latest_error_summary") or ""),
            },
        )

    _emit(
        callback,
        stage_key="translate_zh",
        stage_status="running",
        current_text=f"翻译字幕 0/{total}",
        ratio=0.0,
        counters={"translate_done": 0, "translate_total": total},
        events=[
            _event("info", f"开始翻译，共 {total} 句，模型: qwen-mt-flash"),
        ],
    )
    translation_result = _call_translate_sentences(
        translation_source_texts,
        progress_callback=_translation_progress,
        resume_state=translation_resume_state,
        checkpoint_callback=_translation_checkpoint,
    )
    if int(translation_result.failed_count or 0) > 0:
        latest_translate_error_summary = str(translation_result.latest_error_summary or "")
        raise TranslationError(
            "翻译阶段失败，请重试",
            code="TRANSLATION_INCOMPLETE",
            detail=latest_translate_error_summary or "翻译存在失败句子",
            translation_debug={
                "total_sentences": total,
                "failed_sentences": int(translation_result.failed_count or 0),
                "request_count": int(translation_result.total_requests or 0),
                "success_request_count": int(translation_result.success_request_count or 0),
                "latest_error_summary": latest_translate_error_summary,
                "usage": {
                    "prompt_tokens": int(translation_result.success_prompt_tokens or 0),
                    "completion_tokens": int(translation_result.success_completion_tokens or 0),
                    "total_tokens": int(translation_result.success_total_tokens or 0),
                    "charged_points": 0,
                },
            },
        )

    translated_variant = dict(variant)
    translated_sentences: list[dict[str, Any]] = []
    translated_texts = list(translation_result.texts or [])
    for idx, sentence in enumerate(_variant_sentences(variant)):
        translated_sentence = dict(sentence)
        translated_sentence["text_zh"] = str(translated_texts[idx] or "") if idx < len(translated_texts) else ""
        translated_sentences.append(translated_sentence)
    translated_variant["sentences"] = translated_sentences
    translated_variant["translate_failed_count"] = 0
    translated_variant["translation_attempt_records"] = [
        dict(item) for item in list(translation_result.attempt_records or []) if isinstance(item, dict)
    ]
    translated_variant["translation_request_count"] = int(translation_result.total_requests or 0)
    translated_variant["translation_success_request_count"] = int(translation_result.success_request_count or 0)
    translated_variant["translation_usage"] = {
        "prompt_tokens": int(translation_result.success_prompt_tokens or 0),
        "completion_tokens": int(translation_result.success_completion_tokens or 0),
        "total_tokens": int(translation_result.success_total_tokens or 0),
        "charged_points": 0,
    }
    translated_variant["latest_translate_error_summary"] = str(translation_result.latest_error_summary or "")
    translated_variant["completed_stages"] = sorted(_checkpoint_stages(translated_variant) | {"build_lesson", "translate_zh"})
    write_checkpoint(
        translation_checkpoint_path,
        stage="translate_zh",
        source_identity=source_identity,
        stage_completed=True,
        payload={
            "source_texts": translation_source_texts,
            "translated_texts": translated_texts,
            "completed_indexes": list(range(len(translated_texts))),
            "attempt_records": translated_variant["translation_attempt_records"],
            "latest_error_summary": translated_variant["latest_translate_error_summary"],
        },
    )
    write_checkpoint(
        spec.work_dir / "variant_result.json",
        stage="build_lesson",
        source_identity=source_identity,
        payload=translated_variant,
    )
    _emit(
        callback,
        stage_key="translate_zh",
        stage_status="completed",
        current_text=f"翻译字幕 {total}/{total}",
        ratio=1.0,
        counters={"translate_done": total, "translate_total": total},
        events=[
            _event("milestone", f"翻译完成，共 {total} 句"),
        ],
    )
    return translated_variant


def _apply_strict_content_options(
    spec: GenerationJobSpec,
    *,
    variant: dict[str, Any],
    owner_level: int,
    callback: ProgressCallback | None,
) -> tuple[list[dict[str, Any]], str, str]:
    runtime_sentences = _variant_sentences(variant)
    if not runtime_sentences:
        raise ValueError("Lesson variant does not contain runtime sentences")
    completed_stages = _checkpoint_stages(variant)

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

    if "vocabulary_annotation" in completed_stages and (
        not spec.generation_options.get("word_explanation") or "word_explanation" in completed_stages
    ):
        _emit(callback, stage_key="vocabulary_annotation", stage_status="completed", current_text="生词标注已生成", ratio=1.0)
        if spec.generation_options.get("word_explanation"):
            _emit(callback, stage_key="word_explanation", stage_status="completed", current_text="讲解已生成", ratio=1.0)
            explanation_state = CONTENT_STATE_GENERATED
        else:
            explanation_state = CONTENT_STATE_SKIPPED
        return runtime_sentences, CONTENT_STATE_GENERATED, explanation_state

    _emit(callback, stage_key="vocabulary_annotation", stage_status="running", current_text="生成生词标注", ratio=0.2, events=[
        _event("info", f"基于 Collins {owner_level}★ 级别分析词汇"),
    ])
    enriched = process_sentences_with_vocabulary(
        sentences=runtime_sentences,
        target_level=owner_level,
        user_level=owner_level,
        include_explanations=bool(spec.generation_options.get("word_explanation")),
    )
    above_level_count = sum(
        1 for s in enriched if (s.get("vocabulary_analysis_json") or {}).get("words_above")
    )
    _emit(callback, stage_key="vocabulary_annotation", stage_status="completed", current_text="生词标注已生成", ratio=1.0, events=[
        _event("milestone", f"生词标注完成，标记 {above_level_count} 句含超纲词汇"),
    ])
    if spec.generation_options.get("word_explanation"):
        _emit(callback, stage_key="word_explanation", stage_status="completed", current_text="讲解已生成", ratio=1.0, events=[
            _event("milestone", "词汇讲解已生成"),
        ])
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


def _load_existing_lesson_from_checkpoint(spec: GenerationJobSpec, *, db: Session) -> Lesson | None:
    checkpoint_payload = load_lesson_result_checkpoint(
        spec.work_dir / "lesson_result.json",
        current_source_identity=_source_identity(spec),
    )
    if not isinstance(checkpoint_payload, dict):
        return None
    lesson_id = int(checkpoint_payload.get("lesson_id") or 0)
    if lesson_id <= 0:
        return None
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        return None
    lesson.subtitle_cache_seed = dict(checkpoint_payload.get("subtitle_cache_seed") or {})
    lesson.translation_debug = dict(checkpoint_payload.get("translation_debug") or {}) or None
    lesson.task_result_meta = dict(checkpoint_payload.get("task_result_meta") or {"result_kind": "full_success", "result_message": "课程生成完成"})
    lesson.requested_generation_options = dict(getattr(lesson, "requested_generation_options_json", None) or spec.generation_options)
    lesson.effective_generation_options = dict(getattr(lesson, "effective_generation_options_json", None) or spec.generation_options)
    lesson.generated_content_status = dict(getattr(lesson, "generated_content_status_json", None) or {})
    return lesson


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
    _emit(callback, stage_key="write_lesson", stage_status="running", current_text="保存课程", ratio=0.2, events=[
        _event("info", f"正在写入课程数据，共 {len(runtime_sentences)} 句"),
    ])
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
    write_checkpoint(
        spec.work_dir / "lesson_result.json",
        stage="write_lesson",
        source_identity=_source_identity(spec),
        payload={
            "lesson_id": int(lesson.id),
            "subtitle_cache_seed": subtitle_cache_seed,
            "translation_debug": lesson.translation_debug,
            "task_result_meta": lesson.task_result_meta,
        },
    )
    _emit(callback, stage_key="write_lesson", stage_status="completed", current_text="课程生成完成", ratio=1.0, translation_debug=translation_debug, events=[
        _event("milestone", f"课程生成完成！lesson_id={lesson.id}"),
    ])
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
        existing_lesson = _load_existing_lesson_from_checkpoint(normalized_spec, db=db)
        if existing_lesson is not None:
            _emit(progress_callback, stage_key="write_lesson", stage_status="completed", current_text="课程生成完成", ratio=1.0, events=[
                _event("milestone", f"课程缓存命中，lesson_id={existing_lesson.id}"),
            ])
            return existing_lesson
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
        variant = _build_variant(
            normalized_spec,
            opus_path=opus_path,
            asr_payload=asr_result["asr_payload"],
            callback=progress_callback,
            db=db,
        )
        variant = _translate_variant_if_needed(
            normalized_spec,
            variant=variant,
            callback=progress_callback,
        )
        owner_level = _resolve_owner_user_collins_level(db, normalized_spec.owner_id) if normalized_spec.generation_options.get("vocabulary_annotation") else 0
        runtime_sentences, vocabulary_state, explanation_state = _apply_strict_content_options(
            normalized_spec,
            variant=variant,
            owner_level=owner_level,
            callback=progress_callback,
        )
        variant["sentences"] = runtime_sentences
        variant["completed_stages"] = sorted(
            _checkpoint_stages(variant)
            | {"build_lesson"}
            | ({"translate_zh"} if normalized_spec.generation_options.get("zh_translation") else set())
            | ({"vocabulary_annotation"} if vocabulary_state == CONTENT_STATE_GENERATED else set())
            | ({"word_explanation"} if explanation_state == CONTENT_STATE_GENERATED else set())
        )
        write_checkpoint(
            normalized_spec.work_dir / "variant_result.json",
            stage="build_lesson",
            source_identity=_source_identity(normalized_spec),
            payload=variant,
        )
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
