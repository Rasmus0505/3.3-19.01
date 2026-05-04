"""ASR 处理服务 - 课程服务模块。

提供 ASR（自动语音识别）相关的处理功能。

此文件是从 app/services/lesson_service.py 中提取的 ASR 相关逻辑。
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
from collections.abc import Callable
from datetime import date, datetime
from pathlib import Path
from typing import Any

from app.core.config import (
    ASR_SEGMENT_TARGET_SECONDS,
)
from app.infra.dashscope_storage import (
    get_file_signed_url,
    normalize_dashscope_file_url,
)
from app.services.asr_dashscope import (
    AsrError,
    transcribe_audio_file,
)
from app.services.lesson_builder import (
    compose_text_from_words,
    extract_sentences,
    extract_word_items,
)
from app.services.lessons.content_options import (
    CONTENT_STATE_GENERATED,
    CONTENT_STATE_PENDING_REGENERATE,
    CONTENT_STATE_SKIPPED,
    clear_sentence_generated_content,
    normalize_generation_options,
)
from app.services.lessons.vocabulary import process_sentences_with_vocabulary
from app.services.media import MediaError, resolve_media_command, run_cmd

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict[str, Any]], None]

_SILENCE_START_RE = re.compile(r"silence_start:\s*(?P<value>-?\d+(?:\.\d+)?)")
_SILENCE_END_RE = re.compile(r"silence_end:\s*(?P<value>-?\d+(?:\.\d+)?)\s*\|\s*silence_duration:\s*(?P<duration>-?\d+(?:\.\d+)?)")


def resolve_dashscope_asr_source_url(
    *,
    dashscope_file_id: str,
    dashscope_file_url: str | None = None,
) -> str:
    """解析 DashScope ASR 源文件 URL。

    Args:
        dashscope_file_id: DashScope 文件 ID
        dashscope_file_url: DashScope 文件 URL（可选）

    Returns:
        标准化后的文件 URL

    Raises:
        MediaError: 当缺少必要参数时
    """
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


def parse_asr_error_detail(detail: str) -> dict[str, Any]:
    """解析 ASR 错误详情。

    Args:
        detail: 错误详情字符串

    Returns:
        解析后的错误字典
    """
    try:
        payload = json.loads(str(detail or "").strip())
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def extract_dashscope_403_failure_message(error: AsrError) -> str:
    """提取 DashScope 403 错误消息。

    Args:
        error: ASR 错误对象

    Returns:
        提取的错误消息
    """
    detail_payload = parse_asr_error_detail(getattr(error, "detail", ""))
    provider_message = str(detail_payload.get("subtask_message") or "").strip()
    if provider_message:
        return provider_message
    return str(getattr(error, "message", "") or str(error) or "").strip()


def is_dashscope_file_access_forbidden(error: AsrError) -> bool:
    """判断 ASR 错误是否为文件访问禁止。

    Args:
        error: ASR 错误对象

    Returns:
        是否为文件访问禁止错误
    """
    if str(getattr(error, "code", "") or "").strip() != "ASR_TASK_FAILED":
        return False
    detail_payload = parse_asr_error_detail(getattr(error, "detail", ""))
    return str(detail_payload.get("subtask_code") or "").strip() == "FILE_403_FORBIDDEN"


def detect_silence_ranges(
    source_audio: Path,
    search_start_sec: float,
    search_end_sec: float,
) -> list[tuple[float, float]]:
    """检测音频中的静音区间。

    Args:
        source_audio: 源音频文件路径
        search_start_sec: 搜索起始时间（秒）
        search_end_sec: 搜索结束时间（秒）

    Returns:
        静音区间列表，每个元素为 (起始时间, 结束时间)

    Raises:
        MediaError: 当媒体处理命令失败时
    """
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


def choose_segment_cut(
    source_audio: Path,
    segment_start_sec: float,
    target_seconds: int,
    search_window_seconds: int,
    total_seconds: float,
) -> float:
    """选择分段切割点。

    优先选择静音区间内的切割点，以减少音频伪影。

    Args:
        source_audio: 源音频文件
        segment_start_sec: 分段起始时间
        target_seconds: 目标分段时长
        search_window_seconds: 搜索窗口大小
        total_seconds: 音频总时长

    Returns:
        最佳切割时间点
    """
    threshold = min(total_seconds, segment_start_sec + target_seconds)
    if threshold >= total_seconds:
        return total_seconds

    search_start = max(segment_start_sec, threshold - search_window_seconds)
    search_end = min(total_seconds, threshold + search_window_seconds)
    silence_ranges = detect_silence_ranges(source_audio, search_start, search_end)
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


def split_audio_segments(
    source_audio: Path,
    segments_dir: Path,
    target_seconds: int,
    search_window_seconds: int,
    duration_ms: int,
) -> list[tuple[int, int, int, Path]]:
    """将音频文件分割为多个段落。

    Args:
        source_audio: 源音频文件路径
        segments_dir: 段落输出目录
        target_seconds: 目标分段时长（秒）
        search_window_seconds: 静音搜索窗口大小
        duration_ms: 音频总时长（毫秒）

    Returns:
        分段信息列表，每项为 (段落索引, 起始时间(ms), 结束时间(ms), 段落文件路径)

    Raises:
        MediaError: 当配置无效或处理失败时
    """
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
            segment_end_sec = choose_segment_cut(
                source_audio,
                segment_start_sec,
                target_seconds=target_seconds,
                search_window_seconds=search_window_seconds,
                total_seconds=total_seconds,
            )

        segment_end_sec = max(segment_start_sec + 1, min(total_seconds, segment_end_sec))
        segment_path = segments_dir / f"segment_{index:04d}.opus"

        run_cmd(
            [
                resolve_media_command("ffmpeg"),
                "-hide_banner",
                "-y",
                "-ss",
                f"{segment_start_sec:.3f}",
                "-to",
                f"{segment_end_sec:.3f}",
                "-i",
                str(source_audio),
                "-acodec",
                "libopus",
                "-b:a",
                "32k",
                "-ar",
                "16000",
                "-ac",
                "1",
                str(segment_path),
            ],
            timeout=120,
        )

        segment_start_ms = int(segment_start_sec * 1000)
        segment_end_ms = int(segment_end_sec * 1000)
        output.append((index, segment_start_ms, segment_end_ms, segment_path))
        segment_start_sec = segment_end_sec
        index += 1

    return output


def normalize_parallel_runtime_config(
    *,
    asr_model: str,
    source_duration_ms: int,
    parallel_enabled: bool,
    parallel_threshold_seconds: int,
    segment_target_seconds: int,
    max_concurrency: int,
) -> tuple[bool, int, int, int]:
    """规范化并行运行时配置。

    Args:
        asr_model: ASR 模型名称
        source_duration_ms: 源音频时长（毫秒）
        parallel_enabled: 是否启用并行处理
        parallel_threshold_seconds: 并行阈值（秒）
        segment_target_seconds: 分段目标时长（秒）
        max_concurrency: 最大并发数

    Returns:
        (是否启用并行, 阈值秒数, 分段目标秒数, 最大并发数)
    """
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


def read_json_file(path: Path) -> dict[str, Any] | None:
    try:
        if not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None
    except Exception:
        logger.warning("[DEBUG] lesson.checkpoint.read_failed path=%s", path, exc_info=True)
        return None


def write_json_file(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=json_default), encoding="utf-8")


def json_default(value: Any) -> str:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def emit_progress(callback: ProgressCallback | None, **payload: Any) -> None:
    if not callback:
        return
    try:
        callback(payload)
    except Exception:
        logger.exception("[DEBUG] lesson.progress.emit_failed payload=%s", payload)


def call_transcribe_audio_file(
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


def progress_percent_by_stage(stage_key: str, ratio: float = 1.0) -> int:
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


def apply_generation_content_selection(
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


def single_asr_stage_ratio(elapsed_seconds: int) -> float:
    if elapsed_seconds <= 0:
        return 0.12
    return min(0.84, 0.12 + min(0.72, elapsed_seconds / 120.0 * 0.72))


def effective_parallel_threshold_seconds(
    *,
    parallel_enabled: bool,
    parallel_threshold_seconds: int,
) -> int:
    threshold_seconds = max(1, int(parallel_threshold_seconds))
    return threshold_seconds


def serialize_word_items(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
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


def build_parallel_payload(
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
                "words": serialize_word_items(merged_words),
                "sentences": transcript_sentences,
            }
        ],
    }


def shift_words(word_items: list[dict[str, Any]], offset_ms: int) -> list[dict[str, Any]]:
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


def shift_sentences(sentence_items: list[dict[str, Any]], offset_ms: int) -> list[dict[str, Any]]:
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


def segment_result_to_payload(
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


def build_asr_cache_meta(
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


def is_asr_cache_compatible(
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
    expected = build_asr_cache_meta(
        opus_path=opus_path,
        source_duration_ms=source_duration_ms,
        parallel_enabled=parallel_enabled,
        parallel_threshold_seconds=parallel_threshold_seconds,
        segment_target_seconds=segment_target_seconds,
        max_concurrency=max_concurrency,
    )
    return all(cache_meta.get(key) == value for key, value in expected.items())


def load_segment_result(result_path: Path) -> tuple[int, list[dict[str, Any]], list[dict[str, Any]], int | None, dict[str, Any] | None] | None:
    payload = read_json_file(result_path)
    if not payload:
        return None
    return (
        int(payload.get("segment_index", 0)),
        [dict(item) for item in list(payload.get("segment_words") or []) if isinstance(item, dict)],
        [dict(item) for item in list(payload.get("segment_sentences") or []) if isinstance(item, dict)],
        int(payload["usage_seconds"]) if isinstance(payload.get("usage_seconds"), int) and int(payload.get("usage_seconds")) > 0 else None,
        dict(payload.get("raw_result") or {}) if isinstance(payload.get("raw_result"), dict) else None,
    )


def transcribe_segment(
    segment_index: int,
    segment_start_ms: int,
    segment_end_ms: int,
    segment_path: Path,
    asr_model: str,
    result_path: Path | None = None,
) -> tuple[int, list[dict[str, Any]], list[dict[str, Any]], int | None, dict[str, Any] | None]:
    if result_path:
        cached = load_segment_result(result_path)
        if cached:
            return cached
    asr_result = call_transcribe_audio_file(
        str(segment_path),
        model=asr_model,
        known_duration_ms=max(1, int(segment_end_ms) - int(segment_start_ms)),
    )
    segment_payload = asr_result["asr_result_json"]
    usage_seconds = asr_result.get("usage_seconds")
    segment_words = shift_words(extract_word_items(segment_payload), segment_start_ms)
    segment_sentences = shift_sentences(extract_sentences(segment_payload), segment_start_ms)
    payload = (
        segment_index,
        segment_words,
        segment_sentences,
        int(usage_seconds) if isinstance(usage_seconds, int) and usage_seconds > 0 else None,
        dict(asr_result),
    )
    if result_path:
        write_json_file(result_path, segment_result_to_payload(*payload))
    return payload


def call_transcribe_segment(
    segment_index: int,
    segment_start_ms: int,
    segment_end_ms: int,
    segment_path: Path,
    asr_model: str,
    result_path: Path | None = None,
) -> tuple[int, list[dict[str, Any]], list[dict[str, Any]], int | None, dict[str, Any] | None]:
    try:
        return transcribe_segment(
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
        payload = transcribe_segment(segment_index, segment_start_ms, segment_end_ms, segment_path, asr_model)
        write_json_file(result_path, segment_result_to_payload(*payload))
        return payload


__all__ = [
    "resolve_dashscope_asr_source_url",
    "parse_asr_error_detail",
    "extract_dashscope_403_failure_message",
    "is_dashscope_file_access_forbidden",
    "detect_silence_ranges",
    "choose_segment_cut",
    "split_audio_segments",
    "normalize_parallel_runtime_config",
    "read_json_file",
    "write_json_file",
    "json_default",
    "emit_progress",
    "call_transcribe_audio_file",
    "progress_percent_by_stage",
    "apply_generation_content_selection",
    "single_asr_stage_ratio",
    "effective_parallel_threshold_seconds",
    "serialize_word_items",
    "build_parallel_payload",
    "shift_words",
    "shift_sentences",
    "segment_result_to_payload",
    "build_asr_cache_meta",
    "is_asr_cache_compatible",
    "load_segment_result",
    "transcribe_segment",
    "call_transcribe_segment",
]
