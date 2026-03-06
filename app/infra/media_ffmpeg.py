from __future__ import annotations

import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from uuid import uuid4


class MediaError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail


ALLOWED_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".mkv",
    ".avi",
    ".webm",
    ".mp3",
    ".wav",
    ".m4a",
    ".flac",
    ".aac",
    ".ogg",
}

SUBPROCESS_TIMEOUT_SECONDS = 300


def create_request_dir(base_tmp_dir: Path) -> Path:
    req_dir = base_tmp_dir / f"req_{uuid4().hex}"
    req_dir.mkdir(parents=True, exist_ok=False)
    return req_dir


def cleanup_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)


def validate_suffix(file_name: str) -> str:
    suffix = Path(file_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise MediaError(
            "INVALID_FILE_TYPE",
            "不支持的文件类型",
            f"当前后缀: {suffix or '无'}; 支持: {allowed}",
        )
    return suffix


def _ensure_command_exists(cmd: str) -> None:
    if shutil.which(cmd) is None:
        raise MediaError("COMMAND_MISSING", "媒体处理依赖缺失", f"{cmd} 未安装或不可执行")


@lru_cache(maxsize=1)
def ensure_ffmpeg_for_transcribe() -> None:
    _ensure_command_exists("ffmpeg")
    try:
        proc = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except subprocess.TimeoutExpired as exc:
        raise MediaError("COMMAND_TIMEOUT", "媒体处理依赖检查超时", str(exc)[:1000]) from exc
    except Exception as exc:
        raise MediaError("COMMAND_FAILED", "媒体处理依赖检查失败", str(exc)[:1000]) from exc

    output = (proc.stdout or "") + "\n" + (proc.stderr or "")
    if "libopus" not in output:
        raise MediaError("FFMPEG_LIBOPUS_MISSING", "ffmpeg 缺少 libopus 编码器支持", output[:1000])


@lru_cache(maxsize=1)
def ensure_ffprobe_available() -> None:
    _ensure_command_exists("ffprobe")


def get_media_runtime_status() -> dict[str, str | bool]:
    status: dict[str, str | bool] = {
        "ffmpeg_ready": True,
        "ffprobe_ready": True,
        "detail": "",
    }
    try:
        ensure_ffmpeg_for_transcribe()
    except MediaError as exc:
        status["ffmpeg_ready"] = False
        status["detail"] = exc.detail or exc.message
    try:
        ensure_ffprobe_available()
    except MediaError as exc:
        status["ffprobe_ready"] = False
        status["detail"] = status["detail"] or exc.detail or exc.message
    return status


def run_cmd(cmd: list[str], *, timeout_seconds: int = SUBPROCESS_TIMEOUT_SECONDS, cwd: Path | None = None) -> None:
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except FileNotFoundError as exc:
        raise MediaError("COMMAND_MISSING", "媒体处理依赖缺失", str(exc)[:1000]) from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError("COMMAND_TIMEOUT", "媒体处理命令执行超时", str(exc)[:1000]) from exc

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise MediaError("COMMAND_FAILED", "媒体处理命令执行失败", detail[:1000])


def save_upload_file_stream(upload_file, dst_path: Path, *, max_bytes: int) -> int:
    total = 0
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    with dst_path.open("wb") as out:
        while True:
            chunk = upload_file.file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise MediaError(
                    "FILE_TOO_LARGE",
                    "上传文件超过大小限制",
                    f"限制 {max_bytes} bytes",
                )
            out.write(chunk)
    if total <= 0:
        raise MediaError("EMPTY_FILE", "上传文件为空")
    return total


def extract_audio_for_asr(input_path: Path, output_audio: Path) -> None:
    ensure_ffmpeg_for_transcribe()
    output_audio.parent.mkdir(parents=True, exist_ok=True)
    try:
        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(input_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "libopus",
                str(output_audio),
            ],
            timeout_seconds=SUBPROCESS_TIMEOUT_SECONDS,
        )
    except MediaError as exc:
        raise MediaError("FFMPEG_EXTRACT_FAILED", "音频提取失败", exc.detail or exc.message) from exc


def probe_audio_duration_ms(audio_path: Path) -> int:
    ensure_ffprobe_available()
    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(audio_path),
            ],
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
        )
    except FileNotFoundError as exc:
        raise MediaError("COMMAND_MISSING", "媒体处理依赖缺失", str(exc)[:1000]) from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError("COMMAND_TIMEOUT", "媒体时长探测超时", str(exc)[:1000]) from exc

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise MediaError("FFPROBE_FAILED", "媒体时长探测失败", detail[:1000])
    text = (proc.stdout or "").strip()
    try:
        seconds = float(text)
    except ValueError as exc:
        raise MediaError("FFPROBE_FAILED", "媒体时长探测失败", f"invalid duration output: {text[:120]}") from exc
    if seconds < 0:
        return 0
    return int(seconds * 1000)
