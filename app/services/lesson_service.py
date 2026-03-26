from __future__ import annotations

import json
import logging
import math
import re
import subprocess
import threading
import time
from datetime import date, datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import (
    ASR_SEGMENT_SEARCH_WINDOW_SECONDS,
    ASR_SEGMENT_TARGET_SECONDS,
    DASHSCOPE_API_KEY,
    UPLOAD_MAX_BYTES,
)
from app.models import Lesson, LessonSentence, TranslationRequestLog
from app.repositories.progress import create_progress
from app.services.asr_dashscope import AsrError, transcribe_audio_file, transcribe_signed_url
from app.infra.dashscope_storage import get_file_signed_url, normalize_dashscope_file_url
from app.services.billing_service import (
    EVENT_CONSUME_TRANSLATE,
    append_translation_request_logs,
    calculate_points,
    calculate_token_points,
    consume_points,
    get_model_rate,
    get_subtitle_settings_snapshot,
    record_consume,
    refund_points,
    reserve_points,
    settle_reserved_points,
)
from app.services.lesson_builder import (
    build_lesson_sentences,
    compose_text_from_words,
    estimate_duration_ms,
    extract_sentences,
    extract_word_items,
    normalize_learning_english_text,
    sentences_from_word_chunks,
    split_words_by_semantic_segments,
    tokenize_learning_sentence,
    tokenize_sentence,
)
from app.services.lesson_task_manager import patch_task_artifacts, persist_lesson_workspace_summary
from app.services.media import MediaError, extract_audio_for_asr, probe_audio_duration_ms, resolve_media_command, run_cmd, save_upload_file_stream, validate_suffix
from app.services.translation_qwen_mt import (
    MT_MODEL,
    SemanticSplitError,
    TranslationError,
    split_sentence_by_semantic,
    translate_sentences_to_zh,
    translation_batch_chars_scope,
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
        logger.warning("[DEBUG] lesson.checkpoint.read_failed path=%s", path)
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


def _append_translation_request_logs_safe(
    db: Session,
    *,
    trace_id: str,
    user_id: int | None,
    task_id: str | None,
    lesson_id: int | None,
    records: list[dict[str, Any]] | None,
) -> None:
    try:
        with db.begin_nested():
            append_translation_request_logs(
                db,
                trace_id=trace_id,
                user_id=user_id,
                task_id=task_id,
                lesson_id=lesson_id,
                records=list(records or []),
            )
    except Exception as exc:
        logger.exception(
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


def _progress_percent_by_stage(stage_key: str, ratio: float = 1.0) -> int:
    ratio = max(0.0, min(1.0, ratio))
    if stage_key == "convert_audio":
        return int(12 * ratio)
    if stage_key == "asr_transcribe":
        return int(12 + 36 * ratio)
    if stage_key == "build_lesson":
        return int(48 + 20 * ratio)
    if stage_key == "translate_zh":
        return int(68 + 24 * ratio)
    if stage_key == "write_lesson":
        return int(92 + 8 * ratio)
    return 0


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


def _apply_semantic_split(
    chunks: list[list[dict[str, Any]]],
    *,
    enabled: bool,
    threshold_words: int,
    model: str,
    timeout_seconds: int,
) -> tuple[list[list[dict[str, Any]]], bool]:
    if not enabled or not chunks:
        return chunks, False

    final_chunks: list[list[dict[str, Any]]] = []
    semantic_applied = False
    for chunk in chunks:
        chunk_text = compose_text_from_words(chunk)
        chunk_word_count = len(tokenize_sentence(chunk_text))
        if chunk_word_count <= max(1, threshold_words):
            final_chunks.append(chunk)
            continue
        try:
            semantic_segments = split_sentence_by_semantic(
                chunk_text,
                api_key=DASHSCOPE_API_KEY,
                model=model,
                timeout_seconds=timeout_seconds,
            )
            semantic_chunks = split_words_by_semantic_segments(chunk, semantic_segments)
        except SemanticSplitError as exc:
            logger.warning(
                "[DEBUG] lesson.generate semantic_split_failed words=%s detail=%s",
                chunk_word_count,
                str(exc)[:240],
            )
            final_chunks.append(chunk)
            continue
        if len(semantic_chunks) <= 1:
            final_chunks.append(chunk)
            continue
        semantic_applied = True
        final_chunks.extend(semantic_chunks)
    return final_chunks, semantic_applied


def _emit_subtitle_variant_progress(
    callback: Callable[[dict[str, Any]], None] | None,
    *,
    stage: str,
    message: str,
    semantic_split_enabled: bool,
    translate_done: int = 0,
    translate_total: int = 0,
) -> None:
    if not callback:
        return
    if stage in {"prepare", "semantic_split"}:
        stage_key = "build_lesson"
        stage_status = "running"
        stage_ratio = 0.08 if stage == "prepare" else 0.55
        overall_percent = _progress_percent_by_stage("build_lesson", stage_ratio)
    elif stage == "translate":
        stage_key = "translate_zh"
        stage_status = "running"
        stage_ratio = 0.0 if translate_total <= 0 else max(0.0, min(1.0, translate_done / max(translate_total, 1)))
        overall_percent = _progress_percent_by_stage("translate_zh", stage_ratio)
    elif stage == "completed":
        stage_key = "translate_zh"
        stage_status = "completed"
        overall_percent = _progress_percent_by_stage("translate_zh", 1.0)
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
                "semantic_split_enabled": bool(semantic_split_enabled),
            }
        )
    except Exception:
        logger.exception("[DEBUG] lesson.subtitle_variant_progress.emit_failed stage=%s", stage)


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
        lesson.task_translation_debug = dict(translation_debug) if isinstance(translation_debug, dict) else None
        lesson.task_result_kind = str(result_kind or "full_success").strip() or "full_success"
        lesson.task_result_message = str(result_message or "").strip()
        lesson.task_partial_failure_stage = str(partial_failure_stage or "").strip()
        lesson.task_partial_failure_code = str(partial_failure_code or "").strip()
        lesson.task_partial_failure_message = str(partial_failure_message or "").strip()
        return lesson

    @staticmethod
    def _normalize_runtime_sentences(sentences: list[dict[str, Any]], zh_list: list[str]) -> list[dict[str, Any]]:
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

    @staticmethod
    def build_subtitle_variant(
        *,
        asr_payload: dict[str, Any],
        db: Session,
        task_id: str | None = None,
        semantic_split_enabled: bool | None = None,
        allow_partial_translation: bool = False,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
        before_translate_callback: Callable[[int], None] | None = None,
        translation_progress_callback: Callable[[int, int], None] | None = None,
        translation_checkpoint_path: Path | None = None,
    ) -> dict[str, Any]:
        if not isinstance(asr_payload, dict):
            raise MediaError("ASR_PAYLOAD_INVALID", "字幕源数据无效", "asr_payload 必须是对象")

        subtitle_settings = get_subtitle_settings_snapshot(db)
        effective_semantic_split_enabled = (
            subtitle_settings.semantic_split_default_enabled
            if semantic_split_enabled is None
            else bool(semantic_split_enabled)
        )
        _emit_subtitle_variant_progress(
            progress_callback,
            stage="prepare",
            message="正在重切分句",
            semantic_split_enabled=effective_semantic_split_enabled,
        )

        if effective_semantic_split_enabled:
            sentence_result = build_lesson_sentences(
                asr_payload,
                split_enabled=subtitle_settings.subtitle_split_enabled,
                target_words=subtitle_settings.subtitle_split_target_words,
                max_words=subtitle_settings.subtitle_split_max_words,
            )
            sentences = sentence_result["sentences"]
            chunks = sentence_result.get("chunks") or []
            split_mode = sentence_result["mode"]
        else:
            sentences = extract_sentences(asr_payload)
            chunks = []
            split_mode = "asr_sentences"
            if not sentences:
                sentence_result = build_lesson_sentences(
                    asr_payload,
                    split_enabled=subtitle_settings.subtitle_split_enabled,
                    target_words=subtitle_settings.subtitle_split_target_words,
                    max_words=subtitle_settings.subtitle_split_max_words,
                )
                sentences = sentence_result["sentences"]
                split_mode = sentence_result["mode"]
        semantic_split_applied = False
        if effective_semantic_split_enabled and chunks:
            _emit_subtitle_variant_progress(
                progress_callback,
                stage="semantic_split",
                message="正在执行语义分句",
                semantic_split_enabled=effective_semantic_split_enabled,
            )
            chunks, semantic_split_applied = _apply_semantic_split(
                chunks,
                enabled=True,
                threshold_words=subtitle_settings.semantic_split_max_words_threshold,
                model=MT_MODEL,
                timeout_seconds=subtitle_settings.semantic_split_timeout_seconds,
            )
            if semantic_split_applied:
                sentences = sentences_from_word_chunks(chunks)
                split_mode = "word_level_split+semantic"
            _emit_subtitle_variant_progress(
                progress_callback,
                stage="semantic_split",
                message="语义分句完成",
                semantic_split_enabled=effective_semantic_split_enabled,
            )
        if not sentences:
            raise MediaError("ASR_SENTENCE_MISSING", "ASR 返回结果缺少句级信息", "未找到有效句子")

        source_word_count = len(extract_word_items(asr_payload))
        logger.info(
            "[DEBUG] lesson.subtitle_variant split_mode=%s split_enabled=%s semantic_split_enabled=%s semantic_split_applied=%s source_words=%s output_sentences=%s",
            split_mode,
            subtitle_settings.subtitle_split_enabled,
            effective_semantic_split_enabled,
            semantic_split_applied,
            source_word_count,
            len(sentences),
        )
        if (
            effective_semantic_split_enabled
            and split_mode not in {"word_level_split", "word_level_split+semantic"}
            and subtitle_settings.subtitle_split_enabled
        ):
            logger.warning("[DEBUG] lesson.subtitle_variant split_fallback mode=%s output_sentences=%s", split_mode, len(sentences))

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

        if before_translate_callback:
            before_translate_callback(len(sentences))
        _emit_subtitle_variant_progress(
            progress_callback,
            stage="translate",
            message=f"正在翻译 0/{len(sentences)}",
            semantic_split_enabled=effective_semantic_split_enabled,
            translate_done=0,
            translate_total=len(sentences),
        )
        translation_source_texts = [str(x["text"]) for x in sentences]
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
                semantic_split_enabled=effective_semantic_split_enabled,
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
                [x["text"] for x in sentences],
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
        normalized_sentences = LessonService._normalize_runtime_sentences(sentences, translation_result.texts)
        _emit_subtitle_variant_progress(
            progress_callback,
            stage="completed",
            message="字幕重新生成完成",
            semantic_split_enabled=effective_semantic_split_enabled,
            translate_done=len(sentences),
            translate_total=len(sentences),
        )
        return {
            "semantic_split_enabled": bool(effective_semantic_split_enabled),
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

    @staticmethod
    def build_subtitle_cache_seed(*, asr_payload: dict[str, Any], variant: dict[str, Any], runtime_kind: str = "") -> dict[str, Any]:
        payload = {
            "semantic_split_enabled": bool(variant.get("semantic_split_enabled")),
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

    @staticmethod
    def build_local_generation_result(
        *,
        asr_payload: dict[str, Any],
        runtime_kind: str,
        asr_model: str,
        source_duration_ms: int,
        db: Session,
        task_id: str | None = None,
        semantic_split_enabled: bool | None = None,
        progress_callback: ProgressCallback | None = None,
    ) -> dict[str, Any]:
        normalized_runtime_kind = str(runtime_kind or "local_browser").strip().lower() or "local_browser"
        variant = LessonService.build_subtitle_variant(
            asr_payload=asr_payload,
            db=db,
            task_id=task_id,
            semantic_split_enabled=semantic_split_enabled,
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
            "task_result_meta": LessonService._build_task_result_meta(variant=variant, translation_debug=translation_debug),
            "subtitle_cache_seed": LessonService.build_subtitle_cache_seed(
                asr_payload=asr_payload,
                variant=variant,
                runtime_kind=normalized_runtime_kind,
            ),
            "asr_model": str(asr_model or "").strip(),
        }

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
        if not isinstance(asr_payload, dict):
            raise MediaError("ASR_PAYLOAD_INVALID", "本地 ASR 结果无效", "asr_payload 必须是对象")
        if not isinstance(local_generation_result, dict):
            raise MediaError("LOCAL_GENERATION_RESULT_INVALID", "本地生成结果无效", "local_generation_result 必须是对象")

        variant = dict(local_generation_result.get("variant") or {})
        runtime_sentences = [dict(item) for item in list(variant.get("sentences") or []) if isinstance(item, dict)]
        if not runtime_sentences:
            raise MediaError("LOCAL_GENERATION_RESULT_EMPTY", "本地生成结果缺少字幕", "variant.sentences is empty")

        reserved_duration_ms = max(1, int(source_duration_ms or local_generation_result.get("source_duration_ms") or 0))
        normalized_runtime_kind = str(
            local_generation_result.get("runtime_kind") or runtime_kind or "local_browser"
        ).strip().lower() or "local_browser"
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
            task_result_meta = LessonService._build_task_result_meta(variant=variant, translation_debug=translation_debug)
        subtitle_cache_seed = dict(local_generation_result.get("subtitle_cache_seed") or {})
        if not subtitle_cache_seed:
            subtitle_cache_seed = LessonService.build_subtitle_cache_seed(
                asr_payload=asr_payload,
                variant=variant,
                runtime_kind=normalized_runtime_kind,
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
            db.add(lesson)
            db.flush()

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
                    )
                )

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
            record_consume(
                db,
                user_id=owner_id,
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
            lesson.task_result_meta = dict(task_result_meta)
            lesson.translation_debug = dict(translation_debug)
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
                        note=f"本地生成结果入库失败，退回预扣金额，预扣流水#{reserve_ledger_id}",
                    )
                    db.commit()
                except Exception:
                    db.rollback()
            raise

    @staticmethod
    def _build_task_result_meta(*, variant: dict[str, Any], translation_debug: dict[str, Any]) -> dict[str, Any]:
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

    @staticmethod
    def generate_from_upload(
        upload_file: UploadFile,
        req_dir: Path,
        owner_id: int,
        asr_model: str,
        db: Session,
        progress_callback: ProgressCallback | None = None,
        semantic_split_enabled: bool | None = None,
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
            semantic_split_enabled=semantic_split_enabled,
        )

    @staticmethod
    def generate_from_local_asr_payload(
        *,
        asr_payload: dict[str, Any],
        source_filename: str,
        source_duration_ms: int,
        runtime_kind: str = "local_browser",
        req_dir: Path,
        owner_id: int,
        asr_model: str,
        db: Session,
        progress_callback: ProgressCallback | None = None,
        task_id: str | None = None,
        semantic_split_enabled: bool | None = None,
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
                    semantic_split_enabled=semantic_split_enabled,
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
            partial_translation = failed_count > 0
            if False and int(translation_debug["failed_sentences"] or 0) > 0:
                raise TranslationError(
                    "翻译阶段失败，请重试",
                    code="TRANSLATION_INCOMPLETE",
                    detail=str(translation_debug.get("latest_error_summary") or "翻译存在失败句子"),
                    translation_debug=translation_debug,
                )
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
            db.add(lesson)
            db.flush()

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
            record_consume(
                db,
                user_id=owner_id,
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
            lesson.subtitle_cache_seed = LessonService.build_subtitle_cache_seed(
                asr_payload=asr_payload,
                variant=variant,
                runtime_kind=local_runtime_kind,
            )
            lesson.task_result_meta = dict(task_result_meta)
            lesson.translation_debug = dict(translation_debug)
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
        db: Session,
        progress_callback: ProgressCallback | None = None,
        task_id: str | None = None,
        semantic_split_enabled: bool | None = None,
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
                    semantic_split_enabled=semantic_split_enabled,
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
            if False and int(translation_debug["failed_sentences"] or 0) > 0:
                raise TranslationError(
                    "翻译阶段失败，请重试",
                    code="TRANSLATION_INCOMPLETE",
                    detail=str(translation_debug.get("latest_error_summary") or "翻译存在失败句子"),
                    translation_debug=translation_debug,
                )
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
                media_storage="client_indexeddb",
                source_duration_ms=reserved_duration_ms,
                status=lesson_status,
            )
            db.add(lesson)
            db.flush()
            logger.info(
                "[DEBUG] lesson.generate mode=client_indexeddb lesson_id=%s source_duration_ms=%s",
                lesson.id,
                reserved_duration_ms,
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
            record_consume(
                db,
                user_id=owner_id,
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
            lesson.subtitle_cache_seed = LessonService.build_subtitle_cache_seed(asr_payload=asr_payload, variant=variant)
            if isinstance(dashscope_recovery, dict):
                lesson.subtitle_cache_seed["dashscope_recovery"] = dict(dashscope_recovery)
                if task_id:
                    patch_task_artifacts(
                        task_id,
                        artifacts_patch={"dashscope_recovery": dict(dashscope_recovery)},
                        db=db,
                    )
            lesson.task_result_meta = dict(task_result_meta)
            lesson.translation_debug = dict(translation_debug)
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
        db: Session,
        progress_callback: ProgressCallback | None = None,
        task_id: str | None = None,
        semantic_split_enabled: bool | None = None,
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
            semantic_split_enabled: Optional semantic segmentation flag.

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

        try:
            # Resolve a fresh signed URL from the canonical file_id first.
            # Client-provided URLs are only a fallback for older artifacts.
            signed_url = _resolve_dashscope_asr_source_url(
                dashscope_file_id=dashscope_file_id,
                dashscope_file_url=dashscope_file_url,
            )

            rate = get_model_rate(db, asr_model)
            segment_target_seconds = max(
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
                    semantic_split_enabled=semantic_split_enabled,
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
            task_result_meta: dict[str, Any] = {}
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
                translation_trace_id=translation_trace_id,
                task_id=task_id,
                translation_usage=translation_usage,
                translation_debug=translation_debug,
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
            persist_lesson_workspace_summary(
                lesson_id=lesson.id,
                trace_id=translation_trace_id,
                variant_result_path=variant_result_path,
                translation_checkpoint_path=translation_checkpoint_path,
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
            record_consume(
                db,
                user_id=owner_id,
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
            lesson.task_result_meta = dict(task_result_meta)
            lesson.translation_debug = dict(translation_debug)
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
