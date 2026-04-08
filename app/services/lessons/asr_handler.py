"""ASR 处理服务 - 课程服务模块。

提供 ASR（自动语音识别）相关的处理功能。

此文件是从 app/services/lesson_service.py 中提取的 ASR 相关逻辑。
"""
from __future__ import annotations

import json
import logging
import re
import subprocess
from pathlib import Path
from typing import Any

from app.core.config import ASR_SEGMENT_SEARCH_WINDOW_SECONDS, ASR_SEGMENT_TARGET_SECONDS
from app.services.asr_dashscope import AsrError, transcribe_audio_file, transcribe_signed_url
from app.infra.dashscope_storage import get_file_signed_url, normalize_dashscope_file_url
from app.services.media import MediaError, run_cmd, resolve_media_command


logger = logging.getLogger(__name__)

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


__all__ = [
    "resolve_dashscope_asr_source_url",
    "parse_asr_error_detail",
    "extract_dashscope_403_failure_message",
    "is_dashscope_file_access_forbidden",
    "detect_silence_ranges",
    "choose_segment_cut",
    "split_audio_segments",
    "normalize_parallel_runtime_config",
]
