from __future__ import annotations

import json
import logging
import math
import re
import shutil
import subprocess
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import (
    ASR_SEGMENT_SEARCH_WINDOW_SECONDS,
    ASR_SEGMENT_TARGET_SECONDS,
    BASE_DATA_DIR,
    DASHSCOPE_API_KEY,
    UPLOAD_MAX_BYTES,
)
from app.infra.dashscope_storage import (
    get_file_signed_url,
    normalize_dashscope_file_url,
)
from app.models import Lesson, LessonSentence, MediaAsset, TranslationRequestLog
from app.models.billing import BillingModelRate
from app.repositories.progress import create_progress
from app.services.asr_dashscope import (
    AsrError,
    transcribe_audio_file,
    transcribe_signed_url,
)
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
    compose_text_from_words,
    estimate_duration_ms,
    extract_sentences,
    extract_word_items,
)
from app.services.lesson_task_manager import (
    persist_lesson_workspace_summary,
)
from app.services.lessons.content_options import (
    CONTENT_STATE_GENERATED,
    CONTENT_STATE_PENDING_REGENERATE,
    CONTENT_STATE_SKIPPED,
    build_generated_content_status,
    clear_sentence_generated_content,
    normalize_generated_content_status,
    normalize_generation_options,
)
from app.services.lessons.persistence import (
    attach_task_result_metadata as _attach_task_result_metadata_impl,
)
from app.services.lessons.persistence import (
    build_one_lesson as _build_one_lesson_impl,
)
from app.services.lessons.persistence import (
    create_lesson_from_local_generation_result as _create_lesson_from_local_generation_result_impl,
)
from app.services.lessons.variants import (
    build_local_generation_result as _build_local_generation_result_impl,
)
from app.services.lessons.variants import (
    build_subtitle_cache_seed as _build_subtitle_cache_seed_impl,
)
from app.services.lessons.variants import (
    build_subtitle_variant as _build_subtitle_variant_impl,
)
from app.services.lessons.variants import (
    build_task_result_meta as _build_task_result_meta_impl,
)
from app.services.lessons.variants import (
    normalize_runtime_sentences as _normalize_runtime_sentences_impl,
)
from app.services.lessons.vocabulary import (
    extract_vocabulary_analysis_from_sentences as _extract_vocabulary_analysis_from_sentences_impl,
)
from app.services.lessons.vocabulary import (
    generate_vocabulary_explanation as _generate_vocabulary_explanation_impl,
)
from app.services.lessons.vocabulary import (
    process_sentences_with_vocabulary as _process_sentences_with_vocabulary_impl,
)
from app.services.llm_usage_service import log_llm_usage
from app.services.media import (
    MediaError,
    extract_audio_for_asr,
    probe_audio_duration_ms,
    resolve_media_command,
    run_cmd,
    save_upload_file_stream,
    validate_suffix,
)
from app.services.translation_qwen_mt import (
    MT_MODEL,
    TranslationError,
    translate_sentences_to_zh,
)

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict[str, Any]], None]
_SILENCE_START_RE = re.compile(r"silence_start:\s*(?P<value>-?\d+(?:\.\d+)?)")
_SILENCE_END_RE = re.compile(r"silence_end:\s*(?P<value>-?\d+(?:\.\d+)?)\s*\|\s*silence_duration:\s*(?P<duration>-?\d+(?:\.\d+)?)")
_TRANSLATION_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
_TRANSLATION_ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200D\uFEFF]")
_ASR_RESULT_FILE = "asr_result.json"
_VARIANT_RESULT_FILE = "variant_result.json"
_TRANSLATION_CHECKPOINT_FILE = "translation_checkpoint.json"
_LESSON_RESULT_FILE = "lesson_result.json"
_SEGMENT_RESULT_DIR = "asr_segment_results"


def _resolve_dashscope_asr_source_url(*, dashscope_file_id: str, dashscope_file_url: str | None = None) -> str:
    normalized_file_id = str(dashscope_file_id or "").strip()
    normalized_file_url = str(dashscope_file_url or "").strip()

    if normalized_file_url.startswith("oss://"):
        return normalized_file_url

    if normalized_file_id:
        try:
            return normalize_dashscope_file_url(get_file_signed_url(normalized_file_id))
        except AsrError:
            if normalized_file_url:
                logger.warning(
                    "[DEBUG] lesson.generate_dashscope signed_url_lookup_failed file_id=%s fallback_to_client_url=1",
                    normalized_file_id,
                )
                return normalize_dashscope_file_url(normalized_file_url)
            raise

    if normalized_file_url:
        return normalize_dashscope_file_url(normalized_file_url)

    raise MediaError("DASHSCOPE_FILE_ID_REQUIRED", "dashscope_file_id is required", "")


def _parse_asr_error_detail(detail: str) -> dict[str, Any]:
    try:
        payload = json.loads(str(detail or "").strip())
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _extract_dashscope_403_failure_message(error: AsrError) -> str:
    detail_payload = _parse_asr_error_detail(getattr(error, "detail", ""))
    provider_message = str(detail_payload.get("subtask_message") or "").strip()
    if provider_message:
        return provider_message
    return str(getattr(error, "message", "") or str(error) or "").strip()


def _is_dashscope_file_access_forbidden(error: AsrError) -> bool:
    if str(getattr(error, "code", "") or "").strip() != "ASR_TASK_FAILED":
        return False
    detail_payload = _parse_asr_error_detail(getattr(error, "detail", ""))
    return str(detail_payload.get("subtask_code") or "").strip() == "FILE_403_FORBIDDEN"


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


def _emit_progress(callback: ProgressCallback | None, **payload: Any) -> None:
    if not callback:
        return
    try:
        callback(payload)
    except Exception:
        logger.exception("[DEBUG] lesson.progress.emit_failed payload=%s", payload)


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


def _call_transcribe_audio_file(
    audio_path: str,
    *,
    model: str,
    known_duration_ms: int | None = None,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    kwargs: dict[str, Any] = {"model": model}
    if known_duration_ms is not None:
        kwargs["known_duration_ms"] = max(1, int(known_duration_ms))
    if progress_callback is not None:
        kwargs["progress_callback"] = progress_callback
    try:
        return transcribe_audio_file(audio_path, **kwargs)
    except TypeError as exc:
        if "unexpected keyword argument" not in str(exc):
            raise
        legacy_kwargs: dict[str, Any] = {"model": model}
        if progress_callback is not None:
            legacy_kwargs["progress_callback"] = progress_callback
        try:
            return transcribe_audio_file(audio_path, **legacy_kwargs)
        except TypeError as fallback_exc:
            if "unexpected keyword argument" not in str(fallback_exc):
                raise
            return transcribe_audio_file(audio_path, model=model)


def _progress_percent_by_stage(stage_key: str, ratio: float = 1.0) -> int:
    ratio = max(0.0, min(1.0, ratio))
    if stage_key == "convert_audio":
        return int(12 * ratio)
    if stage_key == "asr_transcribe":
        return int(12 + 36 * ratio)
    if stage_key == "build_lesson":
        return int(48 + 20 * ratio)
    if stage_key == "translate_zh":
        return int(68 + 17 * ratio)
    if stage_key == "vocabulary_annotation":
        return int(85 + 5 * ratio)
    if stage_key == "word_explanation":
        return int(90 + 5 * ratio)
    if stage_key == "write_lesson":
        return int(95 + 5 * ratio)
    return 0


def _apply_generation_content_selection(
    *,
    sentences: list[dict[str, Any]],
    user_level: int,
    generation_options: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], str, str]:
    normalized_generation_options = normalize_generation_options(generation_options)
    if not normalized_generation_options["vocabulary_annotation"]:
        return [
            clear_sentence_generated_content(
                sentence,
                clear_translation=False,
                clear_vocabulary=True,
                clear_explanation=True,
            )
            for sentence in sentences
        ], CONTENT_STATE_SKIPPED, CONTENT_STATE_SKIPPED

    vocabulary_state = CONTENT_STATE_GENERATED
    explanation_state = CONTENT_STATE_GENERATED if normalized_generation_options["word_explanation"] else CONTENT_STATE_SKIPPED
    try:
        enriched = process_sentences_with_vocabulary(
            sentences=sentences,
            target_level=user_level,
            user_level=user_level,
            include_explanations=normalized_generation_options["word_explanation"],
        )
    except Exception:
        logger.exception("[DEBUG] lesson.vocabulary_processing_failed, continuing without explanation")
        fallback = [
            clear_sentence_generated_content(
                sentence,
                clear_translation=False,
                clear_vocabulary=True,
                clear_explanation=True,
            )
            for sentence in sentences
        ]
        return fallback, CONTENT_STATE_PENDING_REGENERATE, (
            CONTENT_STATE_PENDING_REGENERATE if normalized_generation_options["word_explanation"] else CONTENT_STATE_SKIPPED
        )
    return enriched, vocabulary_state, explanation_state


def _single_asr_stage_ratio(elapsed_seconds: int) -> float:
    if elapsed_seconds <= 0:
        return 0.12
    return min(0.84, 0.12 + min(0.72, elapsed_seconds / 120.0 * 0.72))


def _normalize_parallel_runtime_config(
    *,
    asr_model: str,
    source_duration_ms: int,
    parallel_enabled: bool,
    parallel_threshold_seconds: int,
    segment_target_seconds: int,
    max_concurrency: int,
) -> tuple[bool, int, int, int]:
    normalized_parallel_enabled = bool(parallel_enabled)
    normalized_parallel_threshold_seconds = max(1, int(parallel_threshold_seconds or 600))
    normalized_segment_target_seconds = max(1, int(segment_target_seconds or ASR_SEGMENT_TARGET_SECONDS))
    normalized_max_concurrency = max(1, int(max_concurrency or 1))

    return (
        normalized_parallel_enabled,
        normalized_parallel_threshold_seconds,
        normalized_segment_target_seconds,
        normalized_max_concurrency,
    )


def _effective_parallel_threshold_seconds(
    *,
    parallel_enabled: bool,
    parallel_threshold_seconds: int,
) -> int:
    threshold_seconds = max(1, int(parallel_threshold_seconds))
    return threshold_seconds


def _serialize_word_items(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "text": str(item.get("text") or ""),
            "surface": str(item.get("surface") or ""),
            "punctuation": str(item.get("punctuation") or ""),
            "begin_time": int(item["begin_ms"]),
            "end_time": int(item["end_ms"]),
        }
        for item in words
    ]


def _build_parallel_payload(
    duration_ms: int,
    merged_words: list[dict[str, Any]],
    fallback_sentences: list[dict[str, Any]],
) -> dict[str, Any]:
    transcript_sentences: list[dict[str, Any]] = []
    for idx, sentence in enumerate(fallback_sentences):
        transcript_sentences.append(
            {
                "sentence_id": idx,
                "begin_time": int(sentence["begin_ms"]),
                "end_time": int(sentence["end_ms"]),
                "text": str(sentence["text"]),
            }
        )

    transcript_text = compose_text_from_words(merged_words)
    if not transcript_text:
        transcript_text = " ".join(item["text"] for item in fallback_sentences).strip()

    return {
        "properties": {"original_duration_in_milliseconds": int(duration_ms)},
        "transcripts": [
            {
                "channel_id": 0,
                "text": transcript_text,
                "words": _serialize_word_items(merged_words),
                "sentences": transcript_sentences,
            }
        ],
    }


def _detect_silence_ranges(source_audio: Path, search_start_sec: float, search_end_sec: float) -> list[tuple[float, float]]:
    if search_end_sec <= search_start_sec:
        return []
    ffmpeg_executable = resolve_media_command("ffmpeg")
    try:
        proc = subprocess.run(
            [
                ffmpeg_executable,
                "-hide_banner",
                "-ss",
                f"{search_start_sec:.3f}",
                "-to",
                f"{search_end_sec:.3f}",
                "-i",
                str(source_audio),
                "-af",
                "silencedetect=n=-30dB:d=0.35",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
    except FileNotFoundError as exc:
        raise MediaError("COMMAND_MISSING", "媒体处理依赖缺失", str(exc)[:1000]) from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError("COMMAND_TIMEOUT", "静音检测超时", str(exc)[:1000]) from exc

    output = "\n".join(part for part in (proc.stdout, proc.stderr) if part)
    ranges: list[tuple[float, float]] = []
    current_start: float | None = None
    for line in output.splitlines():
        start_match = _SILENCE_START_RE.search(line)
        if start_match:
            current_start = float(start_match.group("value")) + search_start_sec
            continue
        end_match = _SILENCE_END_RE.search(line)
        if end_match and current_start is not None:
            silence_end = float(end_match.group("value")) + search_start_sec
            if silence_end > current_start:
                ranges.append((current_start, silence_end))
            current_start = None
    return ranges


def _choose_segment_cut(
    source_audio: Path,
    segment_start_sec: float,
    target_seconds: int,
    search_window_seconds: int,
    total_seconds: float,
) -> float:
    threshold = min(total_seconds, segment_start_sec + target_seconds)
    if threshold >= total_seconds:
        return total_seconds

    search_start = max(segment_start_sec, threshold - search_window_seconds)
    search_end = min(total_seconds, threshold + search_window_seconds)
    silence_ranges = _detect_silence_ranges(source_audio, search_start, search_end)
    candidate_points: list[float] = []
    for silence_start, silence_end in silence_ranges:
        cut_at = min(silence_end, silence_start + 0.5)
        if cut_at <= segment_start_sec + 1:
            continue
        if total_seconds - cut_at <= 1:
            continue
        candidate_points.append(cut_at)
    if candidate_points:
        return min(candidate_points, key=lambda value: abs(value - threshold))
    return threshold


def _split_audio_segments(
    source_audio: Path,
    segments_dir: Path,
    target_seconds: int,
    search_window_seconds: int,
    duration_ms: int,
) -> list[tuple[int, int, int, Path]]:
    if target_seconds <= 0:
        raise MediaError("ASR_SEGMENT_CONFIG_INVALID", "分段时长配置无效", str(target_seconds))

    total_seconds = max(1.0, duration_ms / 1000.0)
    segments_dir.mkdir(parents=True, exist_ok=True)
    output: list[tuple[int, int, int, Path]] = []

    segment_start_sec = 0.0
    index = 0
    while segment_start_sec < total_seconds:
        if total_seconds - segment_start_sec <= target_seconds:
            segment_end_sec = total_seconds
        else:
            segment_end_sec = _choose_segment_cut(
                source_audio,
                segment_start_sec,
                target_seconds=target_seconds,
                search_window_seconds=search_window_seconds,
                total_seconds=total_seconds,
            )
        segment_end_sec = max(segment_start_sec + 1, min(total_seconds, segment_end_sec))
        segment_path = segments_dir / f"segment_{index:04d}.opus"
        try:
            run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    f"{segment_start_sec:.3f}",
                    "-to",
                    f"{segment_end_sec:.3f}",
                    "-i",
                    str(source_audio),
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-c:a",
                    "libopus",
                    str(segment_path),
                ]
            )
        except MediaError as exc:
            raise MediaError("ASR_SEGMENT_SPLIT_FAILED", "ASR 分段切片失败", exc.detail or exc.message) from exc
        output.append(
            (
                index,
                int(round(segment_start_sec * 1000)),
                int(round(segment_end_sec * 1000)),
                segment_path,
            )
        )
        index += 1
        if segment_end_sec >= total_seconds:
            break
        segment_start_sec = segment_end_sec

    return output


def _shift_words(word_items: list[dict[str, Any]], offset_ms: int) -> list[dict[str, Any]]:
    shifted: list[dict[str, Any]] = []
    for item in word_items:
        shifted.append(
            {
                "text": item["text"],
                "surface": item.get("surface") or item["text"],
                "punctuation": item.get("punctuation") or "",
                "begin_ms": int(item["begin_ms"]) + offset_ms,
                "end_ms": int(item["end_ms"]) + offset_ms,
            }
        )
    return shifted


def _shift_sentences(sentence_items: list[dict[str, Any]], offset_ms: int) -> list[dict[str, Any]]:
    shifted: list[dict[str, Any]] = []
    for item in sentence_items:
        shifted.append(
            {
                "text": item["text"],
                "begin_ms": int(item["begin_ms"]) + offset_ms,
                "end_ms": int(item["end_ms"]) + offset_ms,
            }
        )
    return shifted


def _segment_result_to_payload(
    segment_index: int,
    segment_words: list[dict[str, Any]],
    segment_sentences: list[dict[str, Any]],
    usage_seconds: int | None,
    raw_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "segment_index": int(segment_index),
        "segment_words": list(segment_words),
        "segment_sentences": list(segment_sentences),
        "usage_seconds": int(usage_seconds) if isinstance(usage_seconds, int) and usage_seconds > 0 else None,
    }
    if isinstance(raw_result, dict) and raw_result:
        payload["raw_result"] = dict(raw_result)
    return payload


def _build_asr_cache_meta(
    *,
    opus_path: Path,
    source_duration_ms: int,
    parallel_enabled: bool,
    parallel_threshold_seconds: int,
    segment_target_seconds: int,
    max_concurrency: int,
) -> dict[str, Any]:
    return {
        "opus_path": str(opus_path),
        "source_duration_ms": int(source_duration_ms),
        "parallel_enabled": bool(parallel_enabled),
        "parallel_threshold_seconds": int(parallel_threshold_seconds),
        "segment_target_seconds": int(segment_target_seconds),
        "max_concurrency": int(max_concurrency),
    }


def _is_asr_cache_compatible(
    cached_result: dict[str, Any] | None,
    *,
    opus_path: Path,
    source_duration_ms: int,
    parallel_enabled: bool,
    parallel_threshold_seconds: int,
    segment_target_seconds: int,
    max_concurrency: int,
) -> bool:
    if not isinstance(cached_result, dict):
        return False
    cache_meta = cached_result.get("cache_meta")
    if not isinstance(cache_meta, dict):
        return False
    expected = _build_asr_cache_meta(
        opus_path=opus_path,
        source_duration_ms=source_duration_ms,
        parallel_enabled=parallel_enabled,
        parallel_threshold_seconds=parallel_threshold_seconds,
        segment_target_seconds=segment_target_seconds,
        max_concurrency=max_concurrency,
    )
    return all(cache_meta.get(key) == value for key, value in expected.items())


def _load_segment_result(result_path: Path) -> tuple[int, list[dict[str, Any]], list[dict[str, Any]], int | None, dict[str, Any] | None] | None:
    payload = _read_json_file(result_path)
    if not payload:
        return None
    return (
        int(payload.get("segment_index", 0)),
        [dict(item) for item in list(payload.get("segment_words") or []) if isinstance(item, dict)],
        [dict(item) for item in list(payload.get("segment_sentences") or []) if isinstance(item, dict)],
        int(payload["usage_seconds"]) if isinstance(payload.get("usage_seconds"), int) and int(payload.get("usage_seconds")) > 0 else None,
        dict(payload.get("raw_result") or {}) if isinstance(payload.get("raw_result"), dict) else None,
    )


def _transcribe_segment(
    segment_index: int,
    segment_start_ms: int,
    segment_end_ms: int,
    segment_path: Path,
    asr_model: str,
    result_path: Path | None = None,
) -> tuple[int, list[dict[str, Any]], list[dict[str, Any]], int | None, dict[str, Any] | None]:
    if result_path:
        cached = _load_segment_result(result_path)
        if cached:
            return cached
    asr_result = _call_transcribe_audio_file(
        str(segment_path),
        model=asr_model,
        known_duration_ms=max(1, int(segment_end_ms) - int(segment_start_ms)),
    )
    segment_payload = asr_result["asr_result_json"]
    usage_seconds = asr_result.get("usage_seconds")
    segment_words = _shift_words(extract_word_items(segment_payload), segment_start_ms)
    segment_sentences = _shift_sentences(extract_sentences(segment_payload), segment_start_ms)
    payload = (
        segment_index,
        segment_words,
        segment_sentences,
        int(usage_seconds) if isinstance(usage_seconds, int) and usage_seconds > 0 else None,
        dict(asr_result),
    )
    if result_path:
        _write_json_file(result_path, _segment_result_to_payload(*payload))
    return payload


def _call_transcribe_segment(
    segment_index: int,
    segment_start_ms: int,
    segment_end_ms: int,
    segment_path: Path,
    asr_model: str,
    result_path: Path | None = None,
) -> tuple[int, list[dict[str, Any]], list[dict[str, Any]], int | None, dict[str, Any] | None]:
    try:
        return _transcribe_segment(
            segment_index,
            segment_start_ms,
            segment_end_ms,
            segment_path,
            asr_model,
            result_path=result_path,
        )
    except TypeError as exc:
        if result_path is None or "unexpected keyword argument" not in str(exc):
            raise
        payload = _transcribe_segment(segment_index, segment_start_ms, segment_end_ms, segment_path, asr_model)
        _write_json_file(result_path, _segment_result_to_payload(*payload))
        return payload


def _resolve_owner_user_collins_level(db: Session, owner_id: int, fallback: int = 3) -> int:
    try:
        from app.models import User

        user = db.get(User, int(owner_id))
        normalized = normalize_collins_level(getattr(user, "collins_level", None), default=None)
        if normalized is not None:
            return normalized
    except Exception:
        logger.warning("[DEBUG] lesson.collins_level.resolve_failed owner_id=%s", owner_id, exc_info=True)
    return normalize_collins_level(fallback, default=3) or 3


class LessonService:
    @staticmethod
    def _attach_task_result_metadata(
        lesson: Lesson,
        *,
        translation_debug: dict[str, Any] | None = None,
        result_kind: str = "full_success",
        result_message: str = "",
        partial_failure_stage: str = "",
        partial_failure_code: str = "",
        partial_failure_message: str = "",
    ) -> Lesson:
        return _attach_task_result_metadata_impl(
            lesson,
            translation_debug=translation_debug,
            result_kind=result_kind,
            result_message=result_message,
            partial_failure_stage=partial_failure_stage,
            partial_failure_code=partial_failure_code,
            partial_failure_message=partial_failure_message,
        )

    @staticmethod
    def _normalize_runtime_sentences(sentences: list[dict[str, Any]], zh_list: list[str]) -> list[dict[str, Any]]:
        return _normalize_runtime_sentences_impl(sentences, zh_list)

    @staticmethod
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
    ) -> dict[str, Any]:
        return _build_subtitle_variant_impl(
            asr_payload=asr_payload,
            db=db,
            task_id=task_id,
            generation_options=generation_options,
            allow_partial_translation=allow_partial_translation,
            progress_callback=progress_callback,
            before_translate_callback=before_translate_callback,
            translation_progress_callback=translation_progress_callback,
            translation_checkpoint_path=translation_checkpoint_path,
            normalize_runtime_sentences_fn=LessonService._normalize_runtime_sentences,
        )

    @staticmethod
    def build_subtitle_cache_seed(*, asr_payload: dict[str, Any], variant: dict[str, Any], runtime_kind: str = "") -> dict[str, Any]:
        return _build_subtitle_cache_seed_impl(asr_payload=asr_payload, variant=variant, runtime_kind=runtime_kind)

    @staticmethod
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
    ) -> dict[str, Any]:
        return _build_local_generation_result_impl(
            asr_payload=asr_payload,
            runtime_kind=runtime_kind,
            asr_model=asr_model,
            source_duration_ms=source_duration_ms,
            db=db,
            task_id=task_id,
            progress_callback=progress_callback,
            generation_options=generation_options,
            build_subtitle_variant_fn=LessonService.build_subtitle_variant,
            build_task_result_meta_fn=LessonService._build_task_result_meta,
            build_subtitle_cache_seed_fn=LessonService.build_subtitle_cache_seed,
        )

    @staticmethod
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
    ) -> Lesson:
        return _create_lesson_from_local_generation_result_impl(
            asr_payload=asr_payload,
            source_filename=source_filename,
            source_duration_ms=source_duration_ms,
            runtime_kind=runtime_kind,
            owner_id=owner_id,
            asr_model=asr_model,
            local_generation_result=local_generation_result,
            db=db,
            build_task_result_meta_fn=LessonService._build_task_result_meta,
            build_subtitle_cache_seed_fn=LessonService.build_subtitle_cache_seed,
        )

    @staticmethod
    def _build_task_result_meta(*, variant: dict[str, Any], translation_debug: dict[str, Any]) -> dict[str, Any]:
        return _build_task_result_meta_impl(variant=variant, translation_debug=translation_debug)

    @staticmethod
    def _build_one_lesson(
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
        progress_callback: ProgressCallback | None = None,
    ) -> SimpleNamespace:
        return _build_one_lesson_impl(
            lesson,
            owner_id=owner_id,
            asr_payload=asr_payload,
            variant=variant,
            db=db,
            source_filename=source_filename,
            asr_model=asr_model,
            source_duration_ms=source_duration_ms,
            media_storage=media_storage,
            translation_trace_id=translation_trace_id,
            task_id=task_id,
            translation_usage=translation_usage,
            translation_debug=translation_debug,
            duration_ms=duration_ms,
            lesson_status=lesson_status,
            reserved_points=reserved_points,
            actual_points=actual_points,
            translation_cost_amount_cents=translation_cost_amount_cents,
            settle_note=settle_note,
            translation_consume_note=translation_consume_note,
            translation_rate=translation_rate,
            progress_callback=progress_callback,
        )

    @staticmethod
    def generate_from_upload(
        upload_file: UploadFile,
        req_dir: Path,
        owner_id: int,
        asr_model: str,
        db: Session,
        progress_callback: ProgressCallback | None = None,

    ) -> Lesson:
        source_filename = (upload_file.filename or "unknown")[:255]
        suffix = validate_suffix(source_filename)
        original_path = req_dir / f"source{suffix}"
        save_upload_file_stream(upload_file, original_path, max_bytes=UPLOAD_MAX_BYTES)

        return LessonService.generate_from_saved_file(
            source_path=original_path,
            source_filename=source_filename,
            req_dir=req_dir,
            owner_id=owner_id,
            asr_model=asr_model,
            db=db,
            progress_callback=progress_callback,

        )

    @staticmethod
    def generate_from_local_asr_payload(
        *,
        asr_payload: dict[str, Any],
        source_filename: str,
        source_duration_ms: int,
        generation_options: dict[str, Any] | None = None,
        runtime_kind: str = "local_browser",
        req_dir: Path,
        owner_id: int,
        asr_model: str,
        db: Session,
        progress_callback: ProgressCallback | None = None,
        task_id: str | None = None,

    ) -> Lesson:
        asr_result_path = req_dir / _ASR_RESULT_FILE
        variant_result_path = req_dir / _VARIANT_RESULT_FILE
        translation_checkpoint_path = req_dir / _TRANSLATION_CHECKPOINT_FILE
        lesson_result_path = req_dir / _LESSON_RESULT_FILE

        lesson_checkpoint = _read_json_file(lesson_result_path)
        if isinstance(lesson_checkpoint, dict) and lesson_checkpoint.get("lesson_id"):
            existing_lesson = db.get(Lesson, int(lesson_checkpoint["lesson_id"]))
            if existing_lesson:
                subtitle_cache_seed = lesson_checkpoint.get("subtitle_cache_seed")
                if isinstance(subtitle_cache_seed, dict):
                    existing_lesson.subtitle_cache_seed = dict(subtitle_cache_seed)
                task_result_meta = lesson_checkpoint.get("task_result_meta")
                if isinstance(task_result_meta, dict):
                    LessonService._attach_task_result_metadata(
                        existing_lesson,
                        translation_debug=getattr(existing_lesson, "task_translation_debug", None),
                        result_kind=str(task_result_meta.get("result_kind") or "full_success"),
                        result_message=str(task_result_meta.get("result_message") or ""),
                        partial_failure_stage=str(task_result_meta.get("partial_failure_stage") or ""),
                        partial_failure_code=str(task_result_meta.get("partial_failure_code") or ""),
                        partial_failure_message=str(task_result_meta.get("partial_failure_message") or ""),
                    )
                return existing_lesson
        if task_id:
            existing_lesson_id = db.scalar(
                select(TranslationRequestLog.lesson_id)
                .where(
                    TranslationRequestLog.task_id == task_id,
                    TranslationRequestLog.lesson_id.is_not(None),
                )
                .limit(1)
            )
            if existing_lesson_id:
                existing_lesson = db.get(Lesson, int(existing_lesson_id))
                if existing_lesson:
                    cached_asr = _read_json_file(asr_result_path)
                    cached_variant = _read_json_file(variant_result_path)
                    if cached_asr and cached_variant:
                        existing_lesson.subtitle_cache_seed = LessonService.build_subtitle_cache_seed(
                            asr_payload=dict(cached_asr.get("asr_payload") or {}),
                            variant=dict(cached_variant),
                            runtime_kind=str(runtime_kind or "local_browser"),
                        )
                    return existing_lesson

        if not isinstance(asr_payload, dict):
            raise MediaError("ASR_PAYLOAD_INVALID", "本地 ASR 结果无效", "asr_payload 必须是对象")

        reserved_points = 0
        reserved_duration_ms = max(1, int(source_duration_ms or 0))
        reserve_ledger_id: int | None = None
        translation_trace_id = uuid4().hex
        local_runtime_kind = str(runtime_kind or "local_browser").strip().lower() or "local_browser"
        normalized_generation_options = normalize_generation_options(generation_options)

        try:
            rate = get_model_rate(db, asr_model)
            reserved_points = calculate_points(
                reserved_duration_ms,
                rate.points_per_minute,
                price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
            )
            logger.info(
                "[DEBUG] lesson.generate.local reserve owner_id=%s model=%s duration_ms=%s amount_cents=%s",
                owner_id,
                asr_model,
                reserved_duration_ms,
                reserved_points,
            )
            reserve_ledger = reserve_points(
                db,
                user_id=owner_id,
                points=reserved_points,
                model_name=asr_model,
                duration_ms=reserved_duration_ms,
                note=f"本地均衡生成预扣，模型={asr_model}",
            )
            reserve_ledger_id = reserve_ledger.id
            db.commit()

            actual_sentence_count = max(1, len(extract_sentences(asr_payload)))
            asr_progress_counters = {
                "asr_done": actual_sentence_count,
                "asr_estimated": actual_sentence_count,
                "segment_done": 0,
                "segment_total": 0,
            }
            try:
                _write_json_file(
                    asr_result_path,
                    {
                        "asr_payload": dict(asr_payload),
                        "usage_seconds": max(1, math.ceil(reserved_duration_ms / 1000)),
                        "raw_result": {
                            "mode": local_runtime_kind,
                            "model_name": asr_model,
                            "source_duration_ms": reserved_duration_ms,
                            "asr_result_json": dict(asr_payload),
                        },
                        "progress_counters": dict(asr_progress_counters),
                    },
                )
            except Exception:
                logger.exception("[DEBUG] lesson.local_asr.checkpoint.write_failed path=%s", asr_result_path)

            _emit_progress(
                progress_callback,
                stage_key="convert_audio",
                stage_status="completed",
                overall_percent=_progress_percent_by_stage("convert_audio", 1.0),
                current_text="本地模型已就绪",
                counters={"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            )
            _emit_progress(
                progress_callback,
                stage_key="asr_transcribe",
                stage_status="completed",
                overall_percent=_progress_percent_by_stage("asr_transcribe", 1.0),
                current_text=f"识别字幕 {actual_sentence_count}/{actual_sentence_count}",
                counters={
                    "asr_done": actual_sentence_count,
                    "asr_estimated": actual_sentence_count,
                    "translate_done": 0,
                    "translate_total": 0,
                    "segment_done": 0,
                    "segment_total": 0,
                },
                asr_raw={"mode": local_runtime_kind, "model_name": asr_model},
            )

            usage_seconds = max(1, math.ceil(reserved_duration_ms / 1000))
            runtime_sentences: list[dict[str, Any]] = []
            translate_total = 0

            _emit_progress(
                progress_callback,
                stage_key="build_lesson",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("build_lesson", 0.08),
                current_text="生成课程结构",
                counters={
                    "asr_done": asr_progress_counters["asr_done"],
                    "asr_estimated": asr_progress_counters["asr_estimated"],
                    "translate_done": 0,
                    "translate_total": 0,
                    "segment_done": asr_progress_counters["segment_done"],
                    "segment_total": asr_progress_counters["segment_total"],
                },
            )

            def _on_before_translation(total: int) -> None:
                nonlocal translate_total
                translate_total = max(0, int(total))
                _emit_progress(
                    progress_callback,
                    stage_key="build_lesson",
                    stage_status="completed",
                    overall_percent=_progress_percent_by_stage("build_lesson", 1.0),
                    current_text="生成课程结构完成",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": 0,
                        "translate_total": translate_total,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                )
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("translate_zh", 0.0),
                    current_text=f"翻译字幕 0/{translate_total}",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": 0,
                        "translate_total": translate_total,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                )

            def _on_translation_progress(done: int, total: int) -> None:
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("translate_zh", done / max(total, 1)),
                    current_text=f"翻译字幕 {done}/{total}",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": done,
                        "translate_total": total,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                )

            if variant_result_path.exists():
                variant = _read_json_file(variant_result_path)
                if not isinstance(variant, dict):
                    variant = None
            else:
                variant = None

            if not isinstance(variant, dict):
                variant = LessonService.build_subtitle_variant(
                    asr_payload=asr_payload,
                    db=db,
                    task_id=task_id,
                    generation_options=normalized_generation_options,
                    allow_partial_translation=True,
                    before_translate_callback=_on_before_translation,
                    translation_progress_callback=_on_translation_progress,
                    translation_checkpoint_path=translation_checkpoint_path,
                )
                _write_json_file(variant_result_path, variant)
            runtime_sentences = list(variant["sentences"])
            translate_total = len(runtime_sentences)
            translation_rate = get_model_rate(db, MT_MODEL)
            translation_usage = dict(variant.get("translation_usage") or {})
            translation_cost_amount_cents = calculate_token_points(
                int(translation_usage.get("total_tokens", 0) or 0),
                int(getattr(translation_rate, "points_per_1k_tokens", 0) or 0),
            )
            translation_usage["charged_points"] = translation_cost_amount_cents
            translation_usage["charged_amount_cents"] = translation_cost_amount_cents
            translation_usage["actual_cost_amount_cents"] = translation_cost_amount_cents
            translation_debug = {
                "total_sentences": translate_total,
                "failed_sentences": int(variant.get("translate_failed_count", 0)),
                "request_count": int(variant.get("translation_request_count", 0)),
                "success_request_count": int(variant.get("translation_success_request_count", 0)),
                "usage": translation_usage,
                "latest_error_summary": str(variant.get("latest_translate_error_summary") or ""),
            }
            failed_count = int(variant.get("translate_failed_count", 0))
            partial_translation = failed_count > 0
            translation_state = CONTENT_STATE_GENERATED
            if not normalized_generation_options["zh_translation"]:
                translation_state = CONTENT_STATE_SKIPPED
            elif failed_count > 0:
                translation_state = CONTENT_STATE_PENDING_REGENERATE
            if False and int(translation_debug["failed_sentences"] or 0) > 0:
                raise TranslationError(
                    "翻译阶段失败，请重试",
                    code="TRANSLATION_INCOMPLETE",
                    detail=str(translation_debug.get("latest_error_summary") or "翻译存在失败句子"),
                    translation_debug=translation_debug,
                )
            if normalized_generation_options["zh_translation"]:
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="failed" if failed_count > 0 else "completed",
                    overall_percent=_progress_percent_by_stage("translate_zh", 1.0),
                    current_text="翻译阶段部分失败，已保留原文字幕" if partial_translation else f"翻译字幕 {translate_total}/{translate_total}",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": max(0, translate_total - failed_count),
                        "translate_total": translate_total,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                    translation_debug=translation_debug,
                )

            lesson_status = "partial_ready" if failed_count > 0 else "ready"
            duration_ms = estimate_duration_ms(asr_payload, runtime_sentences)
            actual_duration_ms = reserved_duration_ms
            actual_points = calculate_points(
                actual_duration_ms,
                rate.points_per_minute,
                price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
            )
            actual_cost_amount_cents = calculate_points(
                actual_duration_ms,
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
            task_result_meta = LessonService._build_task_result_meta(variant=variant, translation_debug=translation_debug)
            points_diff = int(actual_points) - int(reserved_points)

            _emit_progress(
                progress_callback,
                stage_key="write_lesson",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("write_lesson", 0.2),
                current_text="写入课程",
                counters={
                    "asr_done": asr_progress_counters["asr_done"],
                    "asr_estimated": asr_progress_counters["asr_estimated"],
                    "translate_done": max(0, translate_total - failed_count),
                    "translate_total": translate_total,
                    "segment_done": asr_progress_counters["segment_done"],
                    "segment_total": asr_progress_counters["segment_total"],
                },
            )

            lesson = Lesson(
                user_id=owner_id,
                title=Path(source_filename or "lesson").stem[:200] or "lesson",
                source_filename=source_filename,
                asr_model=asr_model,
                duration_ms=duration_ms,
                media_storage="client_indexeddb",
                source_duration_ms=reserved_duration_ms,
                status=lesson_status,
            )
            resolved_user_level = _resolve_owner_user_collins_level(db, owner_id)
            lesson.user_collins_level = resolved_user_level
            lesson.requested_generation_options_json = normalized_generation_options
            lesson.effective_generation_options_json = normalized_generation_options
            db.add(lesson)
            db.flush()

            vocabulary_state = CONTENT_STATE_SKIPPED
            explanation_state = CONTENT_STATE_SKIPPED
            if normalized_generation_options["vocabulary_annotation"]:
                _emit_progress(
                    progress_callback,
                    stage_key="vocabulary_annotation",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("vocabulary_annotation", 0.0),
                    current_text="生成生词标注",
                )
                runtime_sentences, vocabulary_state, explanation_state = _apply_generation_content_selection(
                    sentences=runtime_sentences,
                    user_level=resolved_user_level,
                    generation_options=normalized_generation_options,
                )
                _emit_progress(
                    progress_callback,
                    stage_key="vocabulary_annotation",
                    stage_status="completed" if vocabulary_state == CONTENT_STATE_GENERATED else "failed",
                    overall_percent=_progress_percent_by_stage("vocabulary_annotation", 1.0),
                    current_text="生词标注生成完成" if vocabulary_state == CONTENT_STATE_GENERATED else "生词标注待补生成",
                )
                if normalized_generation_options["word_explanation"]:
                    _emit_progress(
                        progress_callback,
                        stage_key="word_explanation",
                        stage_status="completed" if explanation_state == CONTENT_STATE_GENERATED else "failed",
                        overall_percent=_progress_percent_by_stage("word_explanation", 1.0),
                        current_text="讲解内容生成完成" if explanation_state == CONTENT_STATE_GENERATED else "讲解内容待补生成",
                    )

            for sentence in runtime_sentences:
                db.add(
                    LessonSentence(
                        lesson_id=lesson.id,
                        idx=int(sentence["idx"]),
                        begin_ms=int(sentence["begin_ms"]),
                        end_ms=int(sentence["end_ms"]),
                        text_en=str(sentence["text_en"]),
                        text_zh=str(sentence["text_zh"]),
                        tokens_json=[str(item) for item in list(sentence.get("tokens") or [])],
                        audio_clip_path=None,
                        # 词汇分级字段
                        vocabulary_analysis_json=sentence.get("vocabulary_analysis_json"),
                        needs_explanation=sentence.get("needs_explanation", False),
                        explanation_text=sentence.get("explanation_text"),
                        simplified_sentence=sentence.get("simplified_sentence"),
                        explanation_audio_url=sentence.get("explanation_audio_url"),
                        key_explanations_json=sentence.get("key_explanations_json"),
                    )
                )

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
                model_name=asr_model,
                reserved_points=reserved_points,
                actual_points=actual_points,
                duration_ms=actual_duration_ms,
                note=(
                    f"本地均衡生成结算，预扣流水#{reserve_ledger_id}，预扣金额={reserved_points}分，实耗金额={actual_points}分，差额={points_diff}分，"
                    f"usage_seconds={usage_seconds}"
                ),
            )
            consume_points(
                db,
                user_id=owner_id,
                points=int(translation_cost_amount_cents),
                model_name=MT_MODEL,
                lesson_id=lesson.id,
                event_type=EVENT_CONSUME_TRANSLATE,
                note=f"本地课程生成翻译扣费，total_tokens={int(translation_usage.get('total_tokens', 0) or 0)}",
            )
            log_llm_usage(
                db,
                user_id=owner_id,
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
                charge_cents=int(translation_cost_amount_cents),
                lesson_id=lesson.id,
                enable_thinking=False,
                input_text_preview="",
            )
            consume_points(
                db,
                user_id=owner_id,
                points=int(actual_points),
                model_name=asr_model,
                duration_ms=actual_duration_ms,
                lesson_id=lesson.id,
                note=(
                    f"本地均衡生成完成，预扣流水#{reserve_ledger_id}，预扣金额={reserved_points}分，实耗金额={actual_points}分，差额={points_diff}分，"
                    f"usage_seconds={usage_seconds}"
                ),
            )
            db.commit()
            db.refresh(lesson)
            lesson.generated_content_status_json = build_generated_content_status(
                effective_options=normalized_generation_options,
                translation_state=translation_state,
                vocabulary_state=vocabulary_state,
                explanation_state=explanation_state,
            )
            db.add(lesson)
            db.commit()
            db.refresh(lesson)
            lesson.subtitle_cache_seed = LessonService.build_subtitle_cache_seed(
                asr_payload=asr_payload,
                variant=variant,
                runtime_kind=local_runtime_kind,
            )
            lesson.requested_generation_options = normalized_generation_options
            lesson.effective_generation_options = normalized_generation_options
            lesson.generated_content_status = dict(lesson.generated_content_status_json or {})
            lesson.task_result_meta = dict(task_result_meta)
            lesson.translation_debug = dict(translation_debug) if normalized_generation_options["zh_translation"] else None
            try:
                _write_json_file(
                    lesson_result_path,
                    {
                        "lesson_id": int(lesson.id),
                        "subtitle_cache_seed": lesson.subtitle_cache_seed,
                        "task_result_meta": dict(task_result_meta),
                    },
                )
            except Exception:
                logger.exception("[DEBUG] lesson.local_asr.lesson_checkpoint.write_failed path=%s", lesson_result_path)

            _emit_progress(
                progress_callback,
                stage_key="write_lesson",
                stage_status="completed",
                overall_percent=100,
                current_text="课程生成完成",
                counters={
                    "asr_done": asr_progress_counters["asr_done"],
                    "asr_estimated": asr_progress_counters["asr_estimated"],
                    "translate_done": max(0, translate_total - failed_count),
                    "translate_total": translate_total,
                    "segment_done": asr_progress_counters["segment_done"],
                    "segment_total": asr_progress_counters["segment_total"],
                },
                translation_debug=translation_debug,
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
                        note=f"本地均衡生成失败，退回预扣金额，预扣流水#{reserve_ledger_id}",
                    )
                    db.commit()
                except Exception:
                    db.rollback()
            raise

    @staticmethod
    def _transcribe_with_optional_parallel(
        *,
        opus_path: Path,
        req_dir: Path,
        asr_model: str,
        source_duration_ms: int,
        parallel_enabled: bool,
        parallel_threshold_seconds: int,
        segment_target_seconds: int,
        max_concurrency: int,
        progress_callback: ProgressCallback | None,
    ) -> dict[str, Any]:
        asr_result_path = req_dir / _ASR_RESULT_FILE
        (
            parallel_enabled,
            parallel_threshold_seconds,
            segment_target_seconds,
            max_concurrency,
        ) = _normalize_parallel_runtime_config(
            asr_model=asr_model,
            source_duration_ms=source_duration_ms,
            parallel_enabled=parallel_enabled,
            parallel_threshold_seconds=parallel_threshold_seconds,
            segment_target_seconds=segment_target_seconds,
            max_concurrency=max_concurrency,
        )
        effective_parallel_threshold_seconds = _effective_parallel_threshold_seconds(
            parallel_enabled=parallel_enabled,
            parallel_threshold_seconds=parallel_threshold_seconds,
        )
        cached_result = _read_json_file(asr_result_path)
        if _is_asr_cache_compatible(
            cached_result,
            opus_path=opus_path,
            source_duration_ms=source_duration_ms,
            parallel_enabled=parallel_enabled,
            parallel_threshold_seconds=effective_parallel_threshold_seconds,
            segment_target_seconds=segment_target_seconds,
            max_concurrency=max_concurrency,
        ):
            return {
                "asr_payload": dict(cached_result.get("asr_payload") or {}),
                "usage_seconds": int(cached_result["usage_seconds"])
                if isinstance(cached_result.get("usage_seconds"), int) and int(cached_result.get("usage_seconds")) > 0
                else None,
                "progress_counters": dict(cached_result.get("progress_counters") or {}),
                "asr_raw": dict(cached_result.get("raw_result") or {}) if isinstance(cached_result.get("raw_result"), dict) else None,
            }

        duration_seconds = max(1, math.ceil(source_duration_ms / 1000))

        should_parallel = (
            parallel_enabled
            and duration_seconds >= effective_parallel_threshold_seconds
            and segment_target_seconds > 0
            and max_concurrency > 1
        )

        if not should_parallel:
            last_single_segment_done = 0
            last_single_segment_change_elapsed = 0

            def _on_single_asr_progress(payload: dict[str, Any]) -> None:
                nonlocal last_single_segment_done, last_single_segment_change_elapsed
                elapsed_seconds = max(0, int(payload.get("elapsed_seconds", 0) or 0))
                segment_done = max(0, int(payload.get("segment_done", 0) or 0))
                raw_segment_total = max(0, int(payload.get("segment_total", 0) or 0))
                segment_total = max(segment_done, raw_segment_total) if raw_segment_total > 0 else 0
                if segment_done != last_single_segment_done:
                    last_single_segment_done = segment_done
                    last_single_segment_change_elapsed = elapsed_seconds
                if segment_total > 0:
                    wait_text = f"识别中 {segment_done}/{segment_total}"
                    stage_ratio = min(0.98, max(segment_done / max(segment_total, 1), 0.02))
                elif segment_done > 0:
                    waited_seconds = max(0, elapsed_seconds - last_single_segment_change_elapsed)
                    wait_text = f"识别中，已识别 {segment_done} 段"
                    if waited_seconds > 0:
                        wait_text = f"{wait_text}，已等待 {waited_seconds} 秒"
                    stage_ratio = _single_asr_stage_ratio(elapsed_seconds)
                else:
                    wait_text = "识别中" if elapsed_seconds <= 0 else f"识别中，已等待 {elapsed_seconds} 秒"
                    stage_ratio = _single_asr_stage_ratio(elapsed_seconds)
                _emit_progress(
                    progress_callback,
                    stage_key="asr_transcribe",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("asr_transcribe", stage_ratio),
                    current_text=wait_text,
                    counters={
                        "asr_done": segment_done,
                        "asr_estimated": segment_total,
                        "translate_done": 0,
                        "translate_total": 0,
                        "segment_done": segment_done,
                        "segment_total": segment_total,
                    },
                )

            _emit_progress(
                progress_callback,
                stage_key="asr_transcribe",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("asr_transcribe", _single_asr_stage_ratio(0)),
                current_text="识别中",
                counters={
                    "asr_done": 0,
                    "asr_estimated": 0,
                    "translate_done": 0,
                    "translate_total": 0,
                    "segment_done": 0,
                    "segment_total": 0,
                },
            )
            asr_result = _call_transcribe_audio_file(
                str(opus_path),
                model=asr_model,
                known_duration_ms=source_duration_ms,
                progress_callback=_on_single_asr_progress,
            )
            asr_payload = asr_result["asr_result_json"]
            actual_sentence_count = max(1, len(extract_sentences(asr_payload)))
            raw_generate_result = dict(asr_result.get("raw_generate_result") or {}) if isinstance(asr_result.get("raw_generate_result"), dict) else {}
            single_segment_total = max(actual_sentence_count, int(raw_generate_result.get("segment_count", 0) or 0))
            payload = {
                "asr_payload": asr_payload,
                "usage_seconds": int(asr_result.get("usage_seconds"))
                if isinstance(asr_result.get("usage_seconds"), int) and int(asr_result.get("usage_seconds")) > 0
                else None,
                "raw_result": dict(asr_result),
                "cache_meta": _build_asr_cache_meta(
                    opus_path=opus_path,
                    source_duration_ms=source_duration_ms,
                    parallel_enabled=parallel_enabled,
                    parallel_threshold_seconds=effective_parallel_threshold_seconds,
                    segment_target_seconds=segment_target_seconds,
                    max_concurrency=max_concurrency,
                ),
                "progress_counters": {
                    "asr_done": actual_sentence_count,
                    "asr_estimated": single_segment_total,
                    "segment_done": single_segment_total,
                    "segment_total": single_segment_total,
                },
            }
            _emit_progress(
                progress_callback,
                stage_key="asr_transcribe",
                stage_status="completed",
                overall_percent=_progress_percent_by_stage("asr_transcribe", 1.0),
                current_text=(
                    f"识别完成 {single_segment_total}/{single_segment_total}"
                    if single_segment_total > 0
                    else "识别完成"
                ),
                counters={
                    "asr_done": actual_sentence_count,
                    "asr_estimated": actual_sentence_count,
                    "translate_done": 0,
                    "translate_total": 0,
                    "segment_done": single_segment_total,
                    "segment_total": single_segment_total,
                },
                asr_raw=payload["raw_result"],
            )
            _write_json_file(asr_result_path, payload)
            return {
                "asr_payload": payload["asr_payload"],
                "usage_seconds": payload["usage_seconds"],
                "progress_counters": dict(payload.get("progress_counters") or {}),
                "asr_raw": dict(payload["raw_result"]),
            }

        segments = _split_audio_segments(
            opus_path,
            req_dir / "asr_segments",
            segment_target_seconds,
            ASR_SEGMENT_SEARCH_WINDOW_SECONDS,
            source_duration_ms,
        )
        total_segments = len(segments)
        if total_segments <= 0:
            raise MediaError("ASR_SEGMENT_EMPTY", "ASR 分段失败", "未生成任何分段")

        logger.info(
            "[DEBUG] lesson.parallel_asr enabled=true duration_seconds=%s threshold=%s target_seconds=%s search_window=%s concurrency=%s total_segments=%s",
            duration_seconds,
            effective_parallel_threshold_seconds,
            segment_target_seconds,
            ASR_SEGMENT_SEARCH_WINDOW_SECONDS,
            max_concurrency,
            total_segments,
        )

        _emit_progress(
            progress_callback,
            stage_key="asr_transcribe",
            stage_status="running",
            overall_percent=_progress_percent_by_stage("asr_transcribe", 0.1),
            current_text=f"识别分段 0/{total_segments}",
            counters={
                "asr_done": 0,
                "asr_estimated": total_segments,
                "translate_done": 0,
                "translate_total": 0,
                "segment_done": 0,
                "segment_total": total_segments,
            },
        )

        merged: list[tuple[int, list[dict[str, Any]], list[dict[str, Any]], int | None, dict[str, Any] | None]] = []
        completed_segments = 0
        segment_results_dir = req_dir / _SEGMENT_RESULT_DIR
        segment_results_dir.mkdir(parents=True, exist_ok=True)
        pending_segments: list[tuple[int, int, int, Path, Path]] = []
        for segment_index, segment_start_ms, segment_end_ms, segment_path in segments:
            result_path = segment_results_dir / f"segment_{segment_index:04d}.json"
            cached_segment = _load_segment_result(result_path)
            if cached_segment:
                merged.append(cached_segment)
                completed_segments += 1
                continue
            pending_segments.append((segment_index, segment_start_ms, segment_end_ms, segment_path, result_path))

        if completed_segments:
            ratio = completed_segments / total_segments
            _emit_progress(
                progress_callback,
                stage_key="asr_transcribe",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("asr_transcribe", ratio),
                current_text=f"识别分段 {completed_segments}/{total_segments}",
                counters={
                    "asr_done": completed_segments,
                    "asr_estimated": total_segments,
                    "translate_done": 0,
                    "translate_total": 0,
                    "segment_done": completed_segments,
                    "segment_total": total_segments,
                },
            )

        with ThreadPoolExecutor(max_workers=max(1, min(max_concurrency, max(1, len(pending_segments))))) as executor:
            future_map = {
                executor.submit(_call_transcribe_segment, segment_index, segment_start_ms, segment_end_ms, segment_path, asr_model, result_path): segment_index
                for segment_index, segment_start_ms, segment_end_ms, segment_path, result_path in pending_segments
            }
            for future in as_completed(future_map):
                segment_index, segment_words, segment_sentences, usage_seconds, raw_result = future.result()
                merged.append((segment_index, segment_words, segment_sentences, usage_seconds, raw_result))
                completed_segments += 1
                ratio = completed_segments / total_segments
                _emit_progress(
                    progress_callback,
                    stage_key="asr_transcribe",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("asr_transcribe", ratio),
                    current_text=f"识别分段 {completed_segments}/{total_segments}",
                    counters={
                        "asr_done": completed_segments,
                        "asr_estimated": total_segments,
                        "translate_done": 0,
                        "translate_total": 0,
                        "segment_done": completed_segments,
                        "segment_total": total_segments,
                    },
                )
                logger.info(
                    "[DEBUG] lesson.parallel_asr.segment_done idx=%s done=%s total=%s words=%s sentences=%s",
                    segment_index,
                    completed_segments,
                    total_segments,
                    len(segment_words),
                    len(segment_sentences),
                )

        merged.sort(key=lambda item: item[0])
        ordered_words: list[dict[str, Any]] = []
        fallback_sentences: list[dict[str, Any]] = []
        usage_values: list[int] = []
        raw_segments: list[dict[str, Any]] = []
        for segment_index, segment_words, segment_sentences, usage_seconds, raw_result in merged:
            ordered_words.extend(segment_words)
            fallback_sentences.extend(segment_sentences)
            if isinstance(usage_seconds, int) and usage_seconds > 0:
                usage_values.append(usage_seconds)
            raw_segments.append(
                {
                    "segment_index": int(segment_index),
                    "usage_seconds": int(usage_seconds) if isinstance(usage_seconds, int) and usage_seconds > 0 else None,
                    "raw_result": dict(raw_result) if isinstance(raw_result, dict) else None,
                }
            )

        ordered_words.sort(key=lambda item: (int(item["begin_ms"]), int(item["end_ms"])))
        fallback_sentences.sort(key=lambda item: (int(item["begin_ms"]), int(item["end_ms"])))

        if not ordered_words and not fallback_sentences:
            raise MediaError("ASR_SENTENCE_MISSING", "ASR 返回结果缺少句级信息", "并发分段后未提取到任何词或句子")

        usage_total_seconds = sum(usage_values) if len(usage_values) == total_segments else None
        merged_asr_payload = _build_parallel_payload(source_duration_ms, ordered_words, fallback_sentences)
        payload = {
            "asr_payload": merged_asr_payload,
            "usage_seconds": usage_total_seconds,
            "raw_result": {
                "mode": "parallel",
                "segment_count": total_segments,
                "usage_seconds": usage_total_seconds,
                "segments": raw_segments,
                "asr_result_json": merged_asr_payload,
            },
            "cache_meta": _build_asr_cache_meta(
                opus_path=opus_path,
                source_duration_ms=source_duration_ms,
                parallel_enabled=parallel_enabled,
                parallel_threshold_seconds=effective_parallel_threshold_seconds,
                segment_target_seconds=segment_target_seconds,
                max_concurrency=max_concurrency,
            ),
            "progress_counters": {
                "asr_done": total_segments,
                "asr_estimated": total_segments,
                "segment_done": total_segments,
                    "segment_total": total_segments,
                },
            }
        _emit_progress(
            progress_callback,
            stage_key="asr_transcribe",
            stage_status="completed",
            overall_percent=_progress_percent_by_stage("asr_transcribe", 1.0),
            current_text=f"识别完成 {total_segments}/{total_segments}",
            counters={
                "asr_done": total_segments,
                "asr_estimated": total_segments,
                "translate_done": 0,
                "translate_total": 0,
                "segment_done": total_segments,
                "segment_total": total_segments,
            },
            asr_raw=payload["raw_result"],
        )
        _write_json_file(asr_result_path, payload)
        return {
            "asr_payload": payload["asr_payload"],
            "usage_seconds": payload["usage_seconds"],
            "progress_counters": dict(payload.get("progress_counters") or {}),
            "asr_raw": dict(payload["raw_result"]),
        }

    @staticmethod
    def generate_from_saved_file(
        *,
        source_path: Path,
        source_filename: str,
        req_dir: Path,
        owner_id: int,
        asr_model: str,
        generation_options: dict[str, Any] | None = None,
        db: Session,
        progress_callback: ProgressCallback | None = None,
        task_id: str | None = None,
        media_storage: str = "client_indexeddb",

    ) -> Lesson:
        opus_path = req_dir / "lesson_input.opus"
        asr_result_path = req_dir / _ASR_RESULT_FILE
        variant_result_path = req_dir / _VARIANT_RESULT_FILE
        translation_checkpoint_path = req_dir / _TRANSLATION_CHECKPOINT_FILE
        lesson_result_path = req_dir / _LESSON_RESULT_FILE

        lesson_checkpoint = _read_json_file(lesson_result_path)
        if isinstance(lesson_checkpoint, dict) and lesson_checkpoint.get("lesson_id"):
            existing_lesson = db.get(Lesson, int(lesson_checkpoint["lesson_id"]))
            if existing_lesson:
                subtitle_cache_seed = lesson_checkpoint.get("subtitle_cache_seed")
                if isinstance(subtitle_cache_seed, dict):
                    existing_lesson.subtitle_cache_seed = dict(subtitle_cache_seed)
                task_result_meta = lesson_checkpoint.get("task_result_meta")
                if isinstance(task_result_meta, dict):
                    LessonService._attach_task_result_metadata(
                        existing_lesson,
                        translation_debug=getattr(existing_lesson, "task_translation_debug", None),
                        result_kind=str(task_result_meta.get("result_kind") or "full_success"),
                        result_message=str(task_result_meta.get("result_message") or ""),
                        partial_failure_stage=str(task_result_meta.get("partial_failure_stage") or ""),
                        partial_failure_code=str(task_result_meta.get("partial_failure_code") or ""),
                        partial_failure_message=str(task_result_meta.get("partial_failure_message") or ""),
                    )
                return existing_lesson
        if task_id:
            existing_lesson_id = db.scalar(
                select(TranslationRequestLog.lesson_id)
                .where(
                    TranslationRequestLog.task_id == task_id,
                    TranslationRequestLog.lesson_id.is_not(None),
                )
                .limit(1)
            )
            if existing_lesson_id:
                existing_lesson = db.get(Lesson, int(existing_lesson_id))
                if existing_lesson:
                    cached_asr = _read_json_file(asr_result_path)
                    cached_variant = _read_json_file(variant_result_path)
                    if cached_asr and cached_variant:
                        existing_lesson.subtitle_cache_seed = LessonService.build_subtitle_cache_seed(
                            asr_payload=dict(cached_asr.get("asr_payload") or {}),
                            variant=dict(cached_variant),
                        )
                    return existing_lesson

        if opus_path.exists():
            _emit_progress(
                progress_callback,
                stage_key="convert_audio",
                stage_status="completed",
                overall_percent=_progress_percent_by_stage("convert_audio", 1.0),
                current_text="转换音频格式完成",
                counters={"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            )
        else:
            _emit_progress(
                progress_callback,
                stage_key="convert_audio",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("convert_audio", 0.1),
                current_text="转换音频格式",
                counters={"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            )
            extract_audio_for_asr(source_path, opus_path)
            _emit_progress(
                progress_callback,
                stage_key="convert_audio",
                stage_status="completed",
                overall_percent=_progress_percent_by_stage("convert_audio", 1.0),
                current_text="转换音频格式完成",
                counters={"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            )

        reserved_points = 0
        reserved_duration_ms = 0
        reserve_ledger_id: int | None = None
        translation_trace_id = uuid4().hex
        normalized_generation_options = normalize_generation_options(generation_options)
        normalized_media_storage = "server" if str(media_storage or "").strip().lower() == "server" else "client_indexeddb"

        try:
            reserved_duration_ms = probe_audio_duration_ms(opus_path)
            rate = get_model_rate(db, asr_model)
            reserved_points = calculate_points(
                reserved_duration_ms,
                rate.points_per_minute,
                price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
            )
            logger.info(
                "[DEBUG] lesson.generate reserve owner_id=%s model=%s duration_ms=%s points=%s",
                owner_id,
                asr_model,
                reserved_duration_ms,
                reserved_points,
            )
            reserve_ledger = reserve_points(
                db,
                user_id=owner_id,
                points=reserved_points,
                model_name=asr_model,
                duration_ms=reserved_duration_ms,
                note=f"课程生成预扣，模型={asr_model}",
            )
            reserve_ledger_id = reserve_ledger.id
            db.commit()

            segment_target_seconds = max(
                1,
                int(getattr(rate, "segment_seconds", ASR_SEGMENT_TARGET_SECONDS) or ASR_SEGMENT_TARGET_SECONDS),
            )
            asr_transcribe = LessonService._transcribe_with_optional_parallel(
                opus_path=opus_path,
                req_dir=req_dir,
                asr_model=asr_model,
                source_duration_ms=reserved_duration_ms,
                parallel_enabled=bool(getattr(rate, "parallel_enabled", False)),
                parallel_threshold_seconds=max(1, int(getattr(rate, "parallel_threshold_seconds", 600))),
                segment_target_seconds=segment_target_seconds,
                max_concurrency=max(1, int(getattr(rate, "max_concurrency", 2))),
                progress_callback=progress_callback,
            )
            asr_payload = asr_transcribe["asr_payload"]
            usage_seconds = asr_transcribe.get("usage_seconds")
            asr_progress_counters = {
                "asr_done": int((asr_transcribe.get("progress_counters") or {}).get("asr_done", 0) or 0),
                "asr_estimated": int((asr_transcribe.get("progress_counters") or {}).get("asr_estimated", 0) or 0),
                "segment_done": int((asr_transcribe.get("progress_counters") or {}).get("segment_done", 0) or 0),
                "segment_total": int((asr_transcribe.get("progress_counters") or {}).get("segment_total", 0) or 0),
            }
            runtime_sentences: list[dict[str, Any]] = []
            translate_total = 0

            def _on_before_translation(total: int) -> None:
                nonlocal translate_total
                translate_total = max(0, int(total))
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("translate_zh", 0.0),
                    current_text=f"翻译字幕 0/{translate_total}",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": 0,
                        "translate_total": translate_total,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                )

            def _on_translation_progress(done: int, total: int) -> None:
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("translate_zh", done / max(total, 1)),
                    current_text=f"翻译字幕 {done}/{total}",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": done,
                        "translate_total": total,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                )

            variant = _read_json_file(variant_result_path)
            if not variant:
                variant = LessonService.build_subtitle_variant(
                    asr_payload=asr_payload,
                    db=db,
                    task_id=task_id,
                    generation_options=normalized_generation_options,
                    allow_partial_translation=True,
                    before_translate_callback=_on_before_translation,
                    translation_progress_callback=_on_translation_progress,
                    translation_checkpoint_path=translation_checkpoint_path,
                )
                _write_json_file(variant_result_path, variant)
            else:
                _emit_progress(
                    progress_callback,
                    stage_key="build_lesson",
                    stage_status="completed",
                    overall_percent=_progress_percent_by_stage("build_lesson", 1.0),
                    current_text="生成课程结构完成",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": 0,
                        "translate_total": 0,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                )
            runtime_sentences = list(variant["sentences"])
            translate_total = len(runtime_sentences)
            translation_rate = get_model_rate(db, MT_MODEL)
            translation_usage = dict(variant.get("translation_usage") or {})
            translation_cost_amount_cents = calculate_token_points(
                int(translation_usage.get("total_tokens", 0) or 0),
                int(getattr(translation_rate, "points_per_1k_tokens", 0) or 0),
            )
            translation_usage["charged_points"] = translation_cost_amount_cents
            translation_usage["charged_amount_cents"] = translation_cost_amount_cents
            translation_usage["actual_cost_amount_cents"] = translation_cost_amount_cents
            translation_debug = {
                "total_sentences": translate_total,
                "failed_sentences": int(variant.get("translate_failed_count", 0)),
                "request_count": int(variant.get("translation_request_count", 0)),
                "success_request_count": int(variant.get("translation_success_request_count", 0)),
                "usage": translation_usage,
                "latest_error_summary": str(variant.get("latest_translate_error_summary") or ""),
            }
            failed_count = int(variant.get("translate_failed_count", 0))
            partial_translation = failed_count > 0
            translation_state = CONTENT_STATE_GENERATED
            if not normalized_generation_options["zh_translation"]:
                translation_state = CONTENT_STATE_SKIPPED
            elif failed_count > 0:
                translation_state = CONTENT_STATE_PENDING_REGENERATE
            if False and int(translation_debug["failed_sentences"] or 0) > 0:
                raise TranslationError(
                    "翻译阶段失败，请重试",
                    code="TRANSLATION_INCOMPLETE",
                    detail=str(translation_debug.get("latest_error_summary") or "翻译存在失败句子"),
                    translation_debug=translation_debug,
                )
            if normalized_generation_options["zh_translation"]:
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="failed" if failed_count > 0 else "completed",
                    overall_percent=_progress_percent_by_stage("translate_zh", 1.0),
                    current_text=f"翻译字幕 {translate_total}/{translate_total}",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": max(0, translate_total - failed_count),
                        "translate_total": translate_total,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                    translation_debug=translation_debug,
                )

            failed_count = int(variant.get("translate_failed_count", 0))
            partial_translation = failed_count > 0
            lesson_status = "partial_ready" if partial_translation else "ready"
            duration_ms = estimate_duration_ms(asr_payload, runtime_sentences)
            usage_hit = isinstance(usage_seconds, int) and usage_seconds > 0
            actual_duration_ms = int(usage_seconds * 1000) if usage_hit else int(duration_ms)
            actual_points = calculate_points(
                actual_duration_ms,
                rate.points_per_minute,
                price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
            )
            actual_cost_amount_cents = calculate_points(
                actual_duration_ms,
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
            task_result_meta = LessonService._build_task_result_meta(variant=variant, translation_debug=translation_debug)
            points_diff = int(actual_points) - int(reserved_points)
            logger.info(
                "[DEBUG] lesson.generate settle owner_id=%s model=%s usage_hit=%s reserved_amount_cents=%s actual_amount_cents=%s diff=%s actual_cost_amount_cents=%s",
                owner_id,
                asr_model,
                usage_hit,
                reserved_points,
                actual_points,
                points_diff,
                actual_cost_amount_cents,
            )

            _emit_progress(
                progress_callback,
                stage_key="write_lesson",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("write_lesson", 0.2),
                current_text="写入课程",
                counters={
                    "asr_done": asr_progress_counters["asr_done"],
                    "asr_estimated": asr_progress_counters["asr_estimated"],
                    "translate_done": max(0, translate_total - failed_count),
                    "translate_total": translate_total,
                    "segment_done": asr_progress_counters["segment_done"],
                    "segment_total": asr_progress_counters["segment_total"],
                },
            )

            lesson = Lesson(
                user_id=owner_id,
                title=Path(source_filename or "lesson").stem[:200] or "lesson",
                source_filename=source_filename,
                asr_model=asr_model,
                duration_ms=duration_ms,
                media_storage=normalized_media_storage,
                source_duration_ms=reserved_duration_ms,
                status=lesson_status,
            )
            resolved_user_level = _resolve_owner_user_collins_level(db, owner_id)
            lesson.user_collins_level = resolved_user_level
            lesson.requested_generation_options_json = normalized_generation_options
            lesson.effective_generation_options_json = normalized_generation_options
            db.add(lesson)
            db.flush()
            if normalized_media_storage == "server":
                lesson_dir = BASE_DATA_DIR / f"lesson_{lesson.id}"
                lesson_dir.mkdir(parents=True, exist_ok=True)
                source_suffix = Path(source_filename or "").suffix.lower() or Path(source_path).suffix.lower() or ".bin"
                stored_source_path = lesson_dir / f"source{source_suffix}"
                stored_opus_path = lesson_dir / "lesson_input.opus"
                shutil.copy2(source_path, stored_source_path)
                shutil.copy2(opus_path, stored_opus_path)
                db.add(
                    MediaAsset(
                        lesson_id=lesson.id,
                        original_path=str(stored_source_path),
                        opus_path=str(stored_opus_path),
                    )
                )
            logger.info(
                "[DEBUG] lesson.generate mode=%s lesson_id=%s source_duration_ms=%s",
                normalized_media_storage,
                lesson.id,
                reserved_duration_ms,
            )

            vocabulary_state = CONTENT_STATE_SKIPPED
            explanation_state = CONTENT_STATE_SKIPPED
            if normalized_generation_options["vocabulary_annotation"]:
                _emit_progress(
                    progress_callback,
                    stage_key="vocabulary_annotation",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("vocabulary_annotation", 0.0),
                    current_text="生成生词标注",
                )
                runtime_sentences, vocabulary_state, explanation_state = _apply_generation_content_selection(
                    sentences=runtime_sentences,
                    user_level=resolved_user_level,
                    generation_options=normalized_generation_options,
                )
                _emit_progress(
                    progress_callback,
                    stage_key="vocabulary_annotation",
                    stage_status="completed" if vocabulary_state == CONTENT_STATE_GENERATED else "failed",
                    overall_percent=_progress_percent_by_stage("vocabulary_annotation", 1.0),
                    current_text="生词标注生成完成" if vocabulary_state == CONTENT_STATE_GENERATED else "生词标注待补生成",
                )
                if normalized_generation_options["word_explanation"]:
                    _emit_progress(
                        progress_callback,
                        stage_key="word_explanation",
                        stage_status="completed" if explanation_state == CONTENT_STATE_GENERATED else "failed",
                        overall_percent=_progress_percent_by_stage("word_explanation", 1.0),
                        current_text="讲解内容生成完成" if explanation_state == CONTENT_STATE_GENERATED else "讲解内容待补生成",
                    )

            for sentence in runtime_sentences:
                db.add(
                    LessonSentence(
                        lesson_id=lesson.id,
                        idx=int(sentence["idx"]),
                        begin_ms=int(sentence["begin_ms"]),
                        end_ms=int(sentence["end_ms"]),
                        text_en=str(sentence["text_en"]),
                        text_zh=str(sentence["text_zh"]),
                        tokens_json=[str(item) for item in list(sentence.get("tokens") or [])],
                        audio_clip_path=None,
                        vocabulary_analysis_json=sentence.get("vocabulary_analysis_json"),
                        needs_explanation=sentence.get("needs_explanation", False),
                        explanation_text=sentence.get("explanation_text"),
                        simplified_sentence=sentence.get("simplified_sentence"),
                        explanation_audio_url=sentence.get("explanation_audio_url"),
                        key_explanations_json=sentence.get("key_explanations_json"),
                    )
                )

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
                model_name=asr_model,
                reserved_points=reserved_points,
                actual_points=actual_points,
                duration_ms=actual_duration_ms,
                note=(
                    f"课程生成结算，预扣流水#{reserve_ledger_id}，预扣金额={reserved_points}分，实耗金额={actual_points}分，差额={points_diff}分，"
                    f"usage_seconds={usage_seconds if usage_hit else 'fallback'}"
                ),
            )
            consume_points(
                db,
                user_id=owner_id,
                points=int(translation_cost_amount_cents),
                model_name=MT_MODEL,
                lesson_id=lesson.id,
                event_type=EVENT_CONSUME_TRANSLATE,
                note=f"课程生成翻译扣费，total_tokens={int(translation_usage.get('total_tokens', 0) or 0)}",
            )
            log_llm_usage(
                db,
                user_id=owner_id,
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
                charge_cents=int(translation_cost_amount_cents),
                lesson_id=lesson.id,
                enable_thinking=False,
                input_text_preview="",
            )
            logger.info(
                "[DEBUG] lesson.generate translate_cost owner_id=%s lesson_id=%s model=%s total_tokens=%s actual_cost_amount_cents=%s failed=%s requests=%s",
                owner_id,
                lesson.id,
                MT_MODEL,
                int(translation_usage.get("total_tokens", 0) or 0),
                translation_cost_amount_cents,
                failed_count,
                int(variant.get("translation_request_count", 0) or 0),
            )
            consume_points(
                db,
                user_id=owner_id,
                points=int(actual_points),
                model_name=asr_model,
                duration_ms=actual_duration_ms,
                lesson_id=lesson.id,
                note=(
                    f"课程生成完成，预扣流水#{reserve_ledger_id}，预扣金额={reserved_points}分，实耗金额={actual_points}分，差额={points_diff}分，"
                    f"usage_seconds={usage_seconds if usage_hit else 'fallback'}"
                ),
            )
            db.commit()
            db.refresh(lesson)
            lesson.generated_content_status_json = build_generated_content_status(
                effective_options=normalized_generation_options,
                translation_state=translation_state,
                vocabulary_state=vocabulary_state,
                explanation_state=explanation_state,
            )
            db.add(lesson)
            db.commit()
            db.refresh(lesson)
            lesson.subtitle_cache_seed = LessonService.build_subtitle_cache_seed(asr_payload=asr_payload, variant=variant)
            lesson.requested_generation_options = normalized_generation_options
            lesson.effective_generation_options = normalized_generation_options
            lesson.generated_content_status = dict(lesson.generated_content_status_json or {})
            lesson.task_result_meta = dict(task_result_meta)
            lesson.translation_debug = dict(translation_debug) if normalized_generation_options["zh_translation"] else None
            try:
                _write_json_file(
                    lesson_result_path,
                    {
                        "lesson_id": int(lesson.id),
                        "subtitle_cache_seed": lesson.subtitle_cache_seed,
                        "task_result_meta": dict(task_result_meta),
                    },
                )
            except Exception:
                logger.exception("[DEBUG] lesson.checkpoint.write_failed path=%s", lesson_result_path)

            _emit_progress(
                progress_callback,
                stage_key="write_lesson",
                stage_status="completed",
                overall_percent=100,
                current_text="课程生成完成",
                counters={
                    "asr_done": asr_progress_counters["asr_done"],
                    "asr_estimated": asr_progress_counters["asr_estimated"],
                    "translate_done": translate_total,
                    "translate_total": translate_total,
                    "segment_done": asr_progress_counters["segment_done"],
                    "segment_total": asr_progress_counters["segment_total"],
                },
                translation_debug=translation_debug,
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
                        note=f"课程生成失败，退回预扣点数，预扣流水#{reserve_ledger_id}",
                    )
                    db.commit()
                except Exception:
                    db.rollback()
            raise

    @staticmethod
    def generate_from_dashscope_file_id(
        *,
        dashscope_file_id: str,
        dashscope_file_url: str | None = None,
        source_filename: str,
        req_dir: Path,
        owner_id: int,
        asr_model: str,
        generation_options: dict[str, Any] | None = None,
        db: Session,
        progress_callback: ProgressCallback | None = None,
        task_id: str | None = None,

    ) -> Lesson:
        """Generate a lesson from a file already uploaded to DashScope OSS.

        This method is the counterpart of ``generate_from_saved_file`` for the
        pre-signed upload flow.  The file has already been transferred to DashScope
        storage by the front end, so this method skips the local audio conversion
        stage and uses ``get_file_signed_url`` to obtain a signed URL that is
        passed directly to the ASR inference pipeline.

        Args:
            dashscope_file_id: The OSS object path (upload_dir) returned by the
                pre-signed upload policy endpoint, e.g. ``uploads/20240115/xxx.mp4``.
            dashscope_file_url: Optional direct HTTP(S) file URL for the same
                uploaded object. When provided, ASR uses this URL directly and
                skips ``Files.get`` lookup.
            source_filename: Human-readable filename to include in the lesson title.
            req_dir: Working directory for intermediate result files.
            owner_id: User ID who owns the resulting lesson.
            asr_model: ASR model name.
            db: SQLAlchemy database session.
            progress_callback: Optional progress callback (same as generate_from_saved_file).
            task_id: Optional task ID for resuming from a checkpoint.

        Returns:
            The created or resumed ``Lesson`` instance.
        """
        asr_result_path = req_dir / _ASR_RESULT_FILE
        variant_result_path = req_dir / _VARIANT_RESULT_FILE
        translation_checkpoint_path = req_dir / _TRANSLATION_CHECKPOINT_FILE
        lesson_result_path = req_dir / _LESSON_RESULT_FILE

        # Check lesson-level checkpoint (skip convert_audio stage – no local file)
        lesson_checkpoint = _read_json_file(lesson_result_path)
        if isinstance(lesson_checkpoint, dict) and lesson_checkpoint.get("lesson_id"):
            existing_lesson = db.get(Lesson, int(lesson_checkpoint["lesson_id"]))
            if existing_lesson:
                subtitle_cache_seed = lesson_checkpoint.get("subtitle_cache_seed")
                if isinstance(subtitle_cache_seed, dict):
                    existing_lesson.subtitle_cache_seed = dict(subtitle_cache_seed)
                task_result_meta = lesson_checkpoint.get("task_result_meta")
                if isinstance(task_result_meta, dict):
                    LessonService._attach_task_result_metadata(
                        existing_lesson,
                        translation_debug=getattr(existing_lesson, "task_translation_debug", None),
                        result_kind=str(task_result_meta.get("result_kind") or "full_success"),
                        result_message=str(task_result_meta.get("result_message") or ""),
                        partial_failure_stage=str(task_result_meta.get("partial_failure_stage") or ""),
                        partial_failure_code=str(task_result_meta.get("partial_failure_code") or ""),
                        partial_failure_message=str(task_result_meta.get("partial_failure_message") or ""),
                    )
                return existing_lesson

        # Check task-level checkpoint
        if task_id:
            existing_lesson_id = db.scalar(
                select(TranslationRequestLog.lesson_id)
                .where(
                    TranslationRequestLog.task_id == task_id,
                    TranslationRequestLog.lesson_id.is_not(None),
                )
                .limit(1)
            )
            if existing_lesson_id:
                existing_lesson = db.get(Lesson, int(existing_lesson_id))
                if existing_lesson:
                    cached_asr = _read_json_file(asr_result_path)
                    cached_variant = _read_json_file(variant_result_path)
                    if cached_asr and cached_variant:
                        existing_lesson.subtitle_cache_seed = LessonService.build_subtitle_cache_seed(
                            asr_payload=dict(cached_asr.get("asr_payload") or {}),
                            variant=dict(cached_variant),
                        )
                    return existing_lesson

        # Skip convert_audio: file is already on DashScope, get signed URL
        _emit_progress(
            progress_callback,
            stage_key="convert_audio",
            stage_status="completed",
            overall_percent=_progress_percent_by_stage("convert_audio", 1.0),
            current_text="音频已在 DashScope（跳过转换）",
            counters={"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
        )

        reserved_points = 0
        reserved_duration_ms = 0
        reserve_ledger_id: int | None = None
        translation_trace_id = uuid4().hex
        actual_duration_ms: int | None = None
        actual_points: int | None = None
        usage_seconds: int | None = None
        usage_hit = False
        normalized_generation_options = normalize_generation_options(generation_options)

        try:
            # Browser direct-upload may provide an oss:// resource URL.
            # Prefer that fast path when available, otherwise refresh from file_id.
            signed_url = _resolve_dashscope_asr_source_url(
                dashscope_file_id=dashscope_file_id,
                dashscope_file_url=dashscope_file_url,
            )

            rate = get_model_rate(db, asr_model)
            max(
                1,
                int(getattr(rate, "segment_seconds", ASR_SEGMENT_TARGET_SECONDS) or ASR_SEGMENT_TARGET_SECONDS),
            )

            # First ASR call to determine duration for reservation
            _emit_progress(
                progress_callback,
                stage_key="asr_transcribe",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("asr_transcribe", _single_asr_stage_ratio(0)),
                current_text="识别中",
                counters={"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            )

            dashscope_recovery: dict[str, Any] | None = None
            try:
                asr_raw = transcribe_signed_url(
                    signed_url,
                    model=asr_model,
                    requests_timeout=300,
                    audio_path_for_cancel=None,
                    progress_callback=None,
                )
            except AsrError as exc:
                if not _is_dashscope_file_access_forbidden(exc):
                    raise

                dashscope_recovery = {
                    "dashscope_file_id": str(dashscope_file_id or "").strip(),
                    "first_failure_stage": "asr_transcribe",
                    "first_failure_code": str(getattr(exc, "code", "") or "ASR_TASK_FAILED").strip() or "ASR_TASK_FAILED",
                    "first_failure_message": _extract_dashscope_403_failure_message(exc),
                    "retry_attempted": True,
                    "retry_outcome": "pending",
                    "final_outcome": "pending",
                }
                retry_signed_url = _resolve_dashscope_asr_source_url(
                    dashscope_file_id=dashscope_file_id,
                    dashscope_file_url=dashscope_file_url,
                )
                try:
                    asr_raw = transcribe_signed_url(
                        retry_signed_url,
                        model=asr_model,
                        requests_timeout=300,
                        audio_path_for_cancel=None,
                        progress_callback=None,
                    )
                except AsrError as retry_exc:
                    if _is_dashscope_file_access_forbidden(retry_exc):
                        dashscope_recovery["retry_outcome"] = "failed"
                        dashscope_recovery["final_outcome"] = "cloud_file_access_failed"
                        raise AsrError(
                            "DASHSCOPE_FILE_ACCESS_FORBIDDEN",
                            "DashScope 云端文件访问失败",
                            json.dumps(dashscope_recovery, ensure_ascii=False),
                        ) from retry_exc
                    raise

                dashscope_recovery["retry_outcome"] = "succeeded"
                dashscope_recovery["final_outcome"] = "recovered"
            asr_payload: dict[str, Any] = {"transcripts": asr_raw.get("asr_result_json", {}).get("transcripts", [])}
            usage_seconds = asr_raw.get("usage_seconds")
            if usage_seconds:
                usage_hit = True
                reserved_duration_ms = int(usage_seconds * 1000)
                actual_duration_ms = reserved_duration_ms
            else:
                reserved_duration_ms = 0
                actual_duration_ms = None

            reserved_points = calculate_points(
                reserved_duration_ms,
                rate.points_per_minute,
                price_per_minute_yuan=getattr(rate, "price_per_minute_yuan", None),
            )
            actual_points = reserved_points
            points_diff = 0
            logger.info(
                "[DEBUG] lesson.generate_dashscope reserve owner_id=%s model=%s duration_ms=%s points=%s",
                owner_id,
                asr_model,
                reserved_duration_ms,
                reserved_points,
            )
            reserve_ledger = reserve_points(
                db,
                user_id=owner_id,
                points=reserved_points,
                model_name=asr_model,
                duration_ms=reserved_duration_ms,
                note=f"课程生成预扣（DashScope直传），模型={asr_model}",
            )
            reserve_ledger_id = reserve_ledger.id
            db.commit()

            asr_progress_counters = {
                "asr_done": 0,
                "asr_estimated": 0,
                "segment_done": 0,
                "segment_total": 0,
            }
            runtime_sentences: list[dict[str, Any]] = []
            translate_total = 0

            _emit_progress(
                progress_callback,
                stage_key="asr_transcribe",
                stage_status="completed",
                overall_percent=_progress_percent_by_stage("asr_transcribe", 1.0),
                current_text="识别完成",
                counters={
                    "asr_done": 0,
                    "asr_estimated": 0,
                    "translate_done": 0,
                    "translate_total": 0,
                    "segment_done": 0,
                    "segment_total": 0,
                },
            )

            # Write ASR result checkpoint
            _write_json_file(
                asr_result_path,
                {
                    "asr_payload": asr_payload,
                    "usage_seconds": usage_seconds,
                    "progress_counters": {},
                    "raw_result": asr_raw,
                },
            )

            def _on_before_translation(total: int) -> None:
                nonlocal translate_total
                translate_total = max(0, int(total))
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("translate_zh", 0.0),
                    current_text=f"翻译字幕 0/{translate_total}",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": 0,
                        "translate_total": translate_total,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                )

            def _on_translation_progress(done: int, total: int) -> None:
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("translate_zh", done / max(total, 1)),
                    current_text=f"翻译字幕 {done}/{total}",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": done,
                        "translate_total": total,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                )

            variant = _read_json_file(variant_result_path)
            if not variant:
                variant = LessonService.build_subtitle_variant(
                    asr_payload=asr_payload,
                    db=db,
                    task_id=task_id,
                    generation_options=normalized_generation_options,
                    allow_partial_translation=True,
                    before_translate_callback=_on_before_translation,
                    translation_progress_callback=_on_translation_progress,
                    translation_checkpoint_path=translation_checkpoint_path,
                )
                _write_json_file(variant_result_path, variant)
            else:
                _emit_progress(
                    progress_callback,
                    stage_key="build_lesson",
                    stage_status="completed",
                    overall_percent=_progress_percent_by_stage("build_lesson", 1.0),
                    current_text="生成课程结构完成",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": 0,
                        "translate_total": 0,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                )
            runtime_sentences = list(variant["sentences"])
            translate_total = len(runtime_sentences)
            translation_rate = get_model_rate(db, MT_MODEL)
            translation_usage = dict(variant.get("translation_usage") or {})
            translation_cost_amount_cents = calculate_token_points(
                int(translation_usage.get("total_tokens", 0) or 0),
                int(getattr(translation_rate, "points_per_1k_tokens", 0) or 0),
            )
            translation_usage["charged_points"] = translation_cost_amount_cents
            translation_usage["charged_amount_cents"] = translation_cost_amount_cents
            translation_usage["actual_cost_amount_cents"] = translation_cost_amount_cents
            translation_debug = {
                "total_sentences": translate_total,
                "failed_sentences": int(variant.get("translate_failed_count", 0)),
                "request_count": int(variant.get("translation_request_count", 0)),
                "success_request_count": int(variant.get("translation_success_request_count", 0)),
                "usage": translation_usage,
                "latest_error_summary": str(variant.get("latest_translate_error_summary") or ""),
            }
            failed_count = int(variant.get("translate_failed_count", 0) or 0)
            partial_translation = failed_count > 0
            translation_state = CONTENT_STATE_GENERATED
            if not normalized_generation_options["zh_translation"]:
                translation_state = CONTENT_STATE_SKIPPED
            elif failed_count > 0:
                translation_state = CONTENT_STATE_PENDING_REGENERATE
            lesson_status = "partial_ready" if partial_translation else "ready"
            duration_ms = estimate_duration_ms(asr_payload, runtime_sentences)
            task_result_meta = LessonService._build_task_result_meta(variant=variant, translation_debug=translation_debug)
            if normalized_generation_options["zh_translation"]:
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="completed",
                    overall_percent=_progress_percent_by_stage("translate_zh", 1.0),
                    current_text=f"翻译字幕完成 {translate_total} 句",
                    counters={
                        "asr_done": asr_progress_counters["asr_done"],
                        "asr_estimated": asr_progress_counters["asr_estimated"],
                        "translate_done": translate_total,
                        "translate_total": translate_total,
                        "segment_done": asr_progress_counters["segment_done"],
                        "segment_total": asr_progress_counters["segment_total"],
                    },
                )
            lesson: Lesson = Lesson()
            lesson.title = Path(source_filename or "lesson").stem[:200] or "lesson"
            resolved_user_level = _resolve_owner_user_collins_level(db, owner_id)
            lesson.user_collins_level = resolved_user_level
            lesson.requested_generation_options_json = normalized_generation_options
            lesson.effective_generation_options_json = normalized_generation_options
            vocabulary_state = CONTENT_STATE_SKIPPED
            explanation_state = CONTENT_STATE_SKIPPED
            if normalized_generation_options["vocabulary_annotation"]:
                _emit_progress(
                    progress_callback,
                    stage_key="vocabulary_annotation",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("vocabulary_annotation", 0.0),
                    current_text="生成生词标注",
                )
                variant["sentences"], vocabulary_state, explanation_state = _apply_generation_content_selection(
                    sentences=list(variant["sentences"]),
                    user_level=resolved_user_level,
                    generation_options=normalized_generation_options,
                )
                _emit_progress(
                    progress_callback,
                    stage_key="vocabulary_annotation",
                    stage_status="completed" if vocabulary_state == CONTENT_STATE_GENERATED else "failed",
                    overall_percent=_progress_percent_by_stage("vocabulary_annotation", 1.0),
                    current_text="生词标注生成完成" if vocabulary_state == CONTENT_STATE_GENERATED else "生词标注待补生成",
                )
                if normalized_generation_options["word_explanation"]:
                    _emit_progress(
                        progress_callback,
                        stage_key="word_explanation",
                        stage_status="completed" if explanation_state == CONTENT_STATE_GENERATED else "failed",
                        overall_percent=_progress_percent_by_stage("word_explanation", 1.0),
                        current_text="讲解内容生成完成" if explanation_state == CONTENT_STATE_GENERATED else "讲解内容待补生成",
                    )

            _emit_progress(
                progress_callback,
                stage_key="build_lesson",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("build_lesson", 0.0),
                current_text="生成课程结构",
                counters={
                    "asr_done": asr_progress_counters["asr_done"],
                    "asr_estimated": asr_progress_counters["asr_estimated"],
                    "translate_done": translate_total,
                    "translate_total": translate_total,
                    "segment_done": asr_progress_counters["segment_done"],
                    "segment_total": asr_progress_counters["segment_total"],
                },
            )
            build_result = LessonService._build_one_lesson(
                lesson,
                owner_id=owner_id,
                asr_payload=asr_payload,
                variant=variant,
                db=db,
                source_filename=source_filename,
                asr_model=asr_model,
                source_duration_ms=actual_duration_ms or duration_ms,
                media_storage="client_indexeddb",
                translation_trace_id=translation_trace_id,
                task_id=task_id,
                translation_usage=translation_usage,
                translation_debug=translation_debug,
                duration_ms=duration_ms,
                lesson_status=lesson_status,
                reserved_points=reserved_points,
                actual_points=int(actual_points or 0),
                translation_cost_amount_cents=translation_cost_amount_cents,
                settle_note=(
                    f"课程生成结算（DashScope直传），预扣流水#{reserve_ledger_id}，预扣金额={reserved_points}分，"
                    f"实耗金额={actual_points}分，差额={points_diff}分，usage_seconds={usage_seconds if usage_hit else 'fallback'}"
                ),
                translation_consume_note=(
                    f"课程生成翻译扣费（DashScope直传），total_tokens={int(translation_usage.get('total_tokens', 0) or 0)}"
                ),
                translation_rate=translation_rate,
                progress_callback=progress_callback,
            )
            if build_result.errors:
                task_result_meta = {
                    "result_kind": "partial_failure",
                    "result_message": str(build_result.errors[0]) if build_result.errors else "",
                    "partial_failure_stage": "build_lesson",
                    "partial_failure_code": "BUILD_ERROR",
                    "partial_failure_message": "; ".join(str(e) for e in build_result.errors),
                }
            if isinstance(dashscope_recovery, dict):
                task_result_meta["dashscope_recovery"] = dict(dashscope_recovery)
            _emit_progress(
                progress_callback,
                stage_key="build_lesson",
                stage_status="completed",
                overall_percent=_progress_percent_by_stage("build_lesson", 1.0),
                current_text="生成课程结构完成",
                counters={
                    "asr_done": asr_progress_counters["asr_done"],
                    "asr_estimated": asr_progress_counters["asr_estimated"],
                    "translate_done": translate_total,
                    "translate_total": translate_total,
                    "segment_done": asr_progress_counters["segment_done"],
                    "segment_total": asr_progress_counters["segment_total"],
                },
            )
            lesson.subtitle_cache_seed = LessonService.build_subtitle_cache_seed(asr_payload=asr_payload, variant=variant)
            logger.info(
                "[DEBUG] lesson.generate translate_cost owner_id=%s lesson_id=%s model=%s total_tokens=%s actual_cost_amount_cents=%s failed=%s requests=%s",
                owner_id,
                lesson.id,
                MT_MODEL,
                int(translation_usage.get("total_tokens", 0) or 0),
                translation_cost_amount_cents,
                int(variant.get("translate_failed_count", 0)),
                int(variant.get("translation_request_count", 0) or 0),
            )
            consume_points(
                db,
                user_id=owner_id,
                points=int(actual_points),
                model_name=asr_model,
                duration_ms=actual_duration_ms or 0,
                lesson_id=lesson.id,
                note=(
                    f"课程生成完成（DashScope直传），预扣流水#{reserve_ledger_id}，"
                    f"预扣金额={reserved_points}分，实耗金额={actual_points}分，差额={points_diff}分，"
                    f"usage_seconds={usage_seconds if usage_hit else 'fallback'}"
                ),
            )
            db.commit()
            db.refresh(lesson)
            lesson.generated_content_status_json = build_generated_content_status(
                effective_options=normalized_generation_options,
                translation_state=translation_state,
                vocabulary_state=vocabulary_state,
                explanation_state=explanation_state,
            )
            db.add(lesson)
            db.commit()
            db.refresh(lesson)
            lesson.task_result_meta = dict(task_result_meta)
            lesson.requested_generation_options = normalized_generation_options
            lesson.effective_generation_options = normalized_generation_options
            lesson.generated_content_status = dict(lesson.generated_content_status_json or {})
            lesson.translation_debug = dict(translation_debug) if normalized_generation_options["zh_translation"] else None
            lesson.workspace_summary = persist_lesson_workspace_summary(
                owner_user_id=owner_id,
                lesson_id=int(lesson.id),
                source_filename=source_filename,
                source_duration_ms=int(actual_duration_ms or 0),
                input_mode="upload",
                runtime_kind="cloud_api",
                task_id=str(task_id or ""),
                status="succeeded",
                current_text=str(task_result_meta.get("result_message") or "课程已生成完成"),
                subtitle_cache_seed=lesson.subtitle_cache_seed,
                translation_debug=translation_debug,
            )
            try:
                _write_json_file(
                    lesson_result_path,
                    {
                        "lesson_id": int(lesson.id),
                        "subtitle_cache_seed": lesson.subtitle_cache_seed,
                        "task_result_meta": dict(task_result_meta),
                    },
                )
            except Exception:
                logger.exception("[DEBUG] lesson.checkpoint.write_failed path=%s", lesson_result_path)

            _emit_progress(
                progress_callback,
                stage_key="write_lesson",
                stage_status="completed",
                overall_percent=100,
                current_text="课程生成完成",
                counters={
                    "asr_done": asr_progress_counters["asr_done"],
                    "asr_estimated": asr_progress_counters["asr_estimated"],
                    "translate_done": translate_total,
                    "translate_total": translate_total,
                    "segment_done": asr_progress_counters["segment_done"],
                    "segment_total": asr_progress_counters["segment_total"],
                },
                translation_debug=translation_debug,
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
                        note=f"课程生成失败（DashScope直传），退回预扣点数，预扣流水#{reserve_ledger_id}",
                    )
                    db.commit()
                except Exception:
                    db.rollback()
            raise

    @staticmethod
    def generate_missing_content(
        *,
        lesson: Lesson,
        requested_options: dict[str, Any],
        db: Session,
    ) -> Lesson:
        requested_generation_options = normalize_generation_options(
            getattr(lesson, "requested_generation_options_json", None),
        )
        effective_generation_options = normalize_generation_options(
            getattr(lesson, "effective_generation_options_json", None),
            defaults=requested_generation_options,
        )
        normalized_request = {
            "core_subtitles": True,
            "zh_translation": bool(requested_options.get("zh_translation")),
            "vocabulary_annotation": bool(requested_options.get("vocabulary_annotation")),
            "word_explanation": bool(requested_options.get("word_explanation")),
        }
        if normalized_request["word_explanation"]:
            normalized_request["vocabulary_annotation"] = True
        if not any(normalized_request[key] for key in ("zh_translation", "vocabulary_annotation", "word_explanation")):
            return lesson

        for key in ("zh_translation", "vocabulary_annotation", "word_explanation"):
            if normalized_request[key]:
                requested_generation_options[key] = True
                effective_generation_options[key] = True

        sentences = list(
            db.scalars(select(LessonSentence).where(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc())).all()
        )
        runtime_sentences = [
            {
                "idx": int(item.idx),
                "begin_ms": int(item.begin_ms),
                "end_ms": int(item.end_ms),
                "text_en": str(item.text_en),
                "text_zh": str(item.text_zh or ""),
                "tokens": [str(token) for token in list(item.tokens_json or [])],
                "vocabulary_analysis_json": item.vocabulary_analysis_json,
                "needs_explanation": bool(item.needs_explanation),
                "explanation_text": item.explanation_text,
                "simplified_sentence": item.simplified_sentence,
                "explanation_audio_url": item.explanation_audio_url,
                "key_explanations_json": item.key_explanations_json,
            }
            for item in sentences
        ]
        generated_content_status = normalize_generated_content_status(getattr(lesson, "generated_content_status_json", None))

        if normalized_request["zh_translation"] and generated_content_status["zh_translation"] != CONTENT_STATE_GENERATED:
            translation_result = translate_sentences_to_zh([item["text_en"] for item in runtime_sentences], api_key=DASHSCOPE_API_KEY)
            for index, runtime_sentence in enumerate(runtime_sentences):
                runtime_sentence["text_zh"] = str(translation_result.texts[index] or "") if index < len(translation_result.texts) else ""
            failed_count = int(translation_result.failed_count or 0)
            generated_content_status["zh_translation"] = (
                CONTENT_STATE_GENERATED if failed_count <= 0 else CONTENT_STATE_PENDING_REGENERATE
            )
            translation_rate = get_model_rate(db, MT_MODEL)
            translation_cost_amount_cents = calculate_token_points(
                int(translation_result.success_total_tokens or 0),
                int(getattr(translation_rate, "points_per_1k_tokens", 0) or 0),
            )
            if translation_cost_amount_cents > 0:
                consume_points(
                    db,
                    user_id=int(lesson.user_id),
                    points=int(translation_cost_amount_cents),
                    model_name=MT_MODEL,
                    lesson_id=int(lesson.id),
                    event_type=EVENT_CONSUME_TRANSLATE,
                    note=f"课程补生成翻译扣费，total_tokens={int(translation_result.success_total_tokens or 0)}",
                )
                log_llm_usage(
                    db,
                    user_id=int(lesson.user_id),
                    model_name=MT_MODEL,
                    category="mt",
                    prompt_tokens=int(translation_result.success_prompt_tokens or 0),
                    completion_tokens=int(translation_result.success_completion_tokens or 0),
                    total_tokens=int(translation_result.success_total_tokens or 0),
                    input_cost_cents=calculate_llm_cost_by_tokens(
                        prompt_tokens=int(translation_result.success_prompt_tokens or 0),
                        completion_tokens=int(translation_result.success_completion_tokens or 0),
                        cost_per_1k_tokens_input_cents=translation_rate.cost_per_1k_tokens_input_cents,
                        cost_per_1k_tokens_output_cents=translation_rate.cost_per_1k_tokens_output_cents,
                    ),
                    charge_cents=int(translation_cost_amount_cents),
                    lesson_id=int(lesson.id),
                    enable_thinking=False,
                    input_text_preview="",
                )

        if normalized_request["vocabulary_annotation"] or normalized_request["word_explanation"]:
            user_level = _resolve_owner_user_collins_level(db, lesson.user_id)
            runtime_sentences, vocabulary_state, explanation_state = _apply_generation_content_selection(
                sentences=runtime_sentences,
                user_level=user_level,
                generation_options={
                    **effective_generation_options,
                    "vocabulary_annotation": effective_generation_options["vocabulary_annotation"],
                    "word_explanation": effective_generation_options["word_explanation"],
                },
            )
            generated_content_status["vocabulary_annotation"] = vocabulary_state
            generated_content_status["word_explanation"] = explanation_state

        for sentence, runtime_sentence in zip(sentences, runtime_sentences, strict=False):
            sentence.text_zh = str(runtime_sentence.get("text_zh") or "")
            sentence.vocabulary_analysis_json = runtime_sentence.get("vocabulary_analysis_json")
            sentence.needs_explanation = bool(runtime_sentence.get("needs_explanation"))
            sentence.explanation_text = runtime_sentence.get("explanation_text")
            sentence.simplified_sentence = runtime_sentence.get("simplified_sentence")
            sentence.explanation_audio_url = runtime_sentence.get("explanation_audio_url")
            sentence.key_explanations_json = runtime_sentence.get("key_explanations_json")

        lesson.requested_generation_options_json = requested_generation_options
        lesson.effective_generation_options_json = effective_generation_options
        lesson.generated_content_status_json = build_generated_content_status(
            effective_options=effective_generation_options,
            translation_state=generated_content_status["zh_translation"],
            vocabulary_state=generated_content_status["vocabulary_annotation"],
            explanation_state=generated_content_status["word_explanation"],
        )
        if CONTENT_STATE_PENDING_REGENERATE in set(lesson.generated_content_status_json.values()):
            lesson.status = "partial_ready"
        else:
            lesson.status = "ready"
        db.add(lesson)
        db.commit()
        db.refresh(lesson)
        lesson.requested_generation_options = dict(lesson.requested_generation_options_json or {})
        lesson.effective_generation_options = dict(lesson.effective_generation_options_json or {})
        lesson.generated_content_status = dict(lesson.generated_content_status_json or {})
        return lesson


def extract_vocabulary_analysis_from_sentences(sentences: list[str], target_level: int) -> list[dict]:
    return _extract_vocabulary_analysis_from_sentences_impl(sentences, target_level)


def generate_vocabulary_explanation(
    sentence: str,
    words_above: list[dict],
    target_level: int
) -> dict:
    return _generate_vocabulary_explanation_impl(sentence, words_above, target_level)


def process_sentences_with_vocabulary(
    sentences: list[dict],
    target_level: int,
    user_level: int | None = None,
    include_explanations: bool = True,
) -> list[dict]:
    return _process_sentences_with_vocabulary_impl(sentences, target_level, user_level, include_explanations)

