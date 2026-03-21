from __future__ import annotations

import os
import shutil
import subprocess
import re
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from app.core.config import BASE_TMP_DIR, MEDIA_STORAGE_ROOT_DIR, PERSISTENT_DATA_DIR, PROJECT_DIR


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
LOCAL_MEDIA_BIN_DIR = PROJECT_DIR / "tools" / "ffmpeg" / "bin"
_DURATION_RE = re.compile(r"Duration:\s*(?P<hours>\d+):(?P<minutes>\d+):(?P<seconds>\d+(?:\.\d+)?)")


def ensure_local_media_bin_on_path() -> None:
    if not LOCAL_MEDIA_BIN_DIR.exists():
        return
    current_path = os.environ.get("PATH", "")
    local_bin = str(LOCAL_MEDIA_BIN_DIR)
    parts = current_path.split(os.pathsep) if current_path else []
    normalized_parts = {part.lower() for part in parts if part}
    if local_bin.lower() in normalized_parts:
        return
    os.environ["PATH"] = local_bin if not current_path else f"{local_bin}{os.pathsep}{current_path}"


def create_request_dir(base_tmp_dir: Path) -> Path:
    req_dir = base_tmp_dir / f"req_{uuid4().hex}"
    req_dir.mkdir(parents=True, exist_ok=False)
    return req_dir


def _path_is_within_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def get_controlled_media_roots() -> tuple[Path, ...]:
    roots: list[Path] = []
    for raw_root in (MEDIA_STORAGE_ROOT_DIR, BASE_TMP_DIR, PERSISTENT_DATA_DIR):
        try:
            resolved_root = Path(raw_root).resolve(strict=False)
        except Exception:
            continue
        if resolved_root not in roots:
            roots.append(resolved_root)
    return tuple(roots)


def resolve_controlled_media_path(raw_path: str | Path, *, field_name: str = "media_path") -> Path:
    normalized = str(raw_path or "").strip()
    if not normalized:
        raise MediaError("INVALID_MEDIA_PATH", "媒体路径无效", f"{field_name} is empty")

    configured_roots = get_controlled_media_roots()
    stored_path = Path(normalized)
    candidate_paths = [stored_path] if stored_path.is_absolute() else [root / stored_path for root in configured_roots]

    for candidate_path in candidate_paths:
        try:
            resolved_candidate = candidate_path.resolve(strict=False)
        except Exception:
            continue
        if any(_path_is_within_root(resolved_candidate, root) for root in configured_roots):
            return resolved_candidate

    raise MediaError(
        "INVALID_MEDIA_PATH",
        "媒体路径无效",
        f"{field_name} is outside controlled media roots: {', '.join(str(root) for root in configured_roots)}",
    )


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


def resolve_media_command(cmd: str) -> str:
    ensure_local_media_bin_on_path()
    normalized = str(cmd or "").strip()
    if normalized in {"ffmpeg", "ffprobe"}:
        local_match = shutil.which(normalized, path=str(LOCAL_MEDIA_BIN_DIR))
        if local_match:
            return local_match
    return normalized


def _ensure_command_exists(cmd: str) -> str:
    resolved = resolve_media_command(cmd)
    if shutil.which(resolved) is None:
        raise MediaError("COMMAND_MISSING", "媒体处理依赖缺失", f"{cmd} 未安装或不可执行")
    return resolved


@lru_cache(maxsize=1)
def ensure_ffmpeg_for_transcribe() -> None:
    ffmpeg_executable = _ensure_command_exists("ffmpeg")
    try:
        proc = subprocess.run(
            [ffmpeg_executable, "-hide_banner", "-encoders"],
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
    try:
        _ensure_command_exists("ffprobe")
        return
    except MediaError:
        _ensure_command_exists("ffmpeg")


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
    resolved_cmd = list(cmd)
    if resolved_cmd:
        resolved_cmd[0] = resolve_media_command(resolved_cmd[0])
    try:
        proc = subprocess.run(
            resolved_cmd,
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
    ffprobe_executable = resolve_media_command("ffprobe")
    if shutil.which(ffprobe_executable) is not None:
        return _probe_audio_duration_with_ffprobe(audio_path, ffprobe_executable=ffprobe_executable)
    return _probe_audio_duration_with_ffmpeg(audio_path, ffmpeg_executable=resolve_media_command("ffmpeg"))


def _probe_audio_duration_with_ffprobe(audio_path: Path, *, ffprobe_executable: str) -> int:
    try:
        proc = subprocess.run(
            [
                ffprobe_executable,
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


def _probe_audio_duration_with_ffmpeg(audio_path: Path, *, ffmpeg_executable: str) -> int:
    try:
        proc = subprocess.run(
            [ffmpeg_executable, "-hide_banner", "-i", str(audio_path)],
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
        )
    except FileNotFoundError as exc:
        raise MediaError("COMMAND_MISSING", "媒体处理依赖缺失", str(exc)[:1000]) from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError("COMMAND_TIMEOUT", "媒体时长探测超时", str(exc)[:1000]) from exc

    output = "\n".join(part for part in (proc.stdout, proc.stderr) if part)
    match = _DURATION_RE.search(output)
    if not match:
        raise MediaError("FFPROBE_FAILED", "媒体时长探测失败", output[:1000])
    hours = int(match.group("hours"))
    minutes = int(match.group("minutes"))
    seconds = float(match.group("seconds"))
    total_seconds = (hours * 3600) + (minutes * 60) + seconds
    return max(0, int(total_seconds * 1000))


ensure_local_media_bin_on_path()
