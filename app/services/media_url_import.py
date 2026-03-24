from __future__ import annotations

import json
import logging
import subprocess
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

from app.infra.runtime_tools import get_ytdlp_command
from app.services.media import MediaError, validate_suffix

try:
    from yt_dlp import YoutubeDL
    from yt_dlp.utils import DownloadError
except Exception:  # pragma: no cover - exercised when dependency is absent at runtime.
    YoutubeDL = None
    DownloadError = Exception


logger = logging.getLogger(__name__)

URL_IMPORT_TIMEOUT_SECONDS = 15 * 60
URL_IMPORT_OUTPUT_TEMPLATE = "%(title).180B [%(id)s].%(ext)s"
URL_IMPORT_MEDIA_CONTENT_TYPES = {
    ".aac": "audio/aac",
    ".avi": "video/x-msvideo",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "video/webm",
}


class UrlImportCancelled(RuntimeError):
    """Raised when the caller cancels an in-flight download."""


def validate_public_media_url(raw_url: str) -> str:
    normalized = str(raw_url or "").strip()
    if not normalized:
        raise MediaError("URL_IMPORT_EMPTY", "请输入公开视频链接", "source_url is empty")
    if len(normalized) > 4096:
        raise MediaError("URL_IMPORT_TOO_LONG", "链接长度超出限制", f"url length={len(normalized)}")

    try:
        parsed = urlparse(normalized)
    except Exception as exc:
        raise MediaError("URL_IMPORT_INVALID", "链接格式无效", str(exc)[:400]) from exc

    if parsed.scheme not in {"http", "https"}:
        raise MediaError("URL_IMPORT_INVALID", "链接格式无效", f"unsupported scheme: {parsed.scheme or 'empty'}")
    if not parsed.netloc:
        raise MediaError("URL_IMPORT_INVALID", "链接格式无效", "missing hostname")
    return normalized


def guess_media_content_type(file_name: str) -> str:
    suffix = Path(file_name or "").suffix.lower()
    return URL_IMPORT_MEDIA_CONTENT_TYPES.get(suffix, "application/octet-stream")


def _raise_if_cancelled(cancel_event: threading.Event | None) -> None:
    if cancel_event and cancel_event.is_set():
        raise UrlImportCancelled("已取消链接下载")


def _resolve_downloaded_media_file(output_dir: Path) -> Path:
    supported_files: list[Path] = []
    for candidate in output_dir.iterdir():
        if not candidate.is_file():
            continue
        if candidate.suffix.lower() in {".part", ".ytdl", ".tmp"}:
            continue
        try:
            validate_suffix(candidate.name)
        except MediaError:
            continue
        supported_files.append(candidate)

    if not supported_files:
        raise MediaError("URL_IMPORT_NO_MEDIA", "下载完成但未找到可用媒体文件", str(output_dir))
    if len(supported_files) > 1:
        supported_files.sort(key=lambda item: (item.stat().st_size, item.name), reverse=True)
    return supported_files[0]


def _normalize_download_error_message(message: str) -> MediaError:
    detail = str(message or "").strip()
    lowered = detail.lower()

    if "playlist" in lowered:
        return MediaError("URL_IMPORT_PLAYLIST_NOT_SUPPORTED", "暂不支持播放列表或批量链接", detail[:1000])
    if "private" in lowered or "login" in lowered or "sign in" in lowered or "cookies" in lowered or "members only" in lowered:
        return MediaError("URL_IMPORT_AUTH_REQUIRED", "当前链接需要登录或 cookies，第一版暂不支持", detail[:1000])
    if "unsupported url" in lowered or "unsupported site" in lowered or "no suitable extractor" in lowered:
        return MediaError("URL_IMPORT_UNSUPPORTED", "当前链接暂不支持导入", detail[:1000])
    if "timed out" in lowered or "timeout" in lowered:
        return MediaError("URL_IMPORT_TIMEOUT", "下载超时，请稍后重试", detail[:1000])
    if "not found" in lowered or "404" in lowered:
        return MediaError("URL_IMPORT_NOT_FOUND", "未找到可访问的公开视频", detail[:1000])
    return MediaError("URL_IMPORT_FAILED", "下载链接素材失败", detail[:1000])


def _parse_ytdlp_progress_line(line: str) -> dict[str, object] | None:
    prefix = "download:"
    if not line.startswith(prefix):
        return None
    payload = line[len(prefix) :].strip()
    parts = payload.split(":", 2)
    if len(parts) != 3:
        return None
    downloaded_raw, total_raw, file_name = parts
    try:
        downloaded_bytes = max(0, int(float(downloaded_raw or 0)))
    except Exception:
        downloaded_bytes = 0
    try:
        total_bytes = max(downloaded_bytes, int(float(total_raw or 0)))
    except Exception:
        total_bytes = 0
    progress_percent = int(round((downloaded_bytes / total_bytes) * 100)) if total_bytes > 0 else 0
    return {
        "status": "running",
        "progress_percent": min(99, max(1, progress_percent)) if total_bytes > 0 else 10,
        "status_text": "正在下载素材",
        "downloaded_bytes": downloaded_bytes,
        "total_bytes": total_bytes,
        "source_filename": Path(file_name).name if file_name else "",
    }


def _tail_progress_log(progress_log: Path, *, last_offset: int) -> tuple[int, list[str]]:
    if not progress_log.exists():
        return last_offset, []
    with progress_log.open("r", encoding="utf-8", errors="replace") as handle:
        handle.seek(last_offset)
        text = handle.read()
        next_offset = handle.tell()
    if not text:
        return next_offset, []
    return next_offset, [line.strip() for line in text.splitlines() if line.strip()]


def _probe_public_media_with_executable(executable: str, source_url: str) -> dict[str, object]:
    command = [
        executable,
        "--quiet",
        "--no-warnings",
        "--no-playlist",
        "--dump-single-json",
        "--skip-download",
        source_url,
    ]
    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
    except subprocess.TimeoutExpired as exc:
        raise MediaError("URL_IMPORT_TIMEOUT", "下载超时，请稍后重试", str(exc)[:1000]) from exc
    except FileNotFoundError as exc:
        raise MediaError("URL_IMPORT_DEPENDENCY_MISSING", "链接导入依赖未安装", str(exc)[:1000]) from exc

    if proc.returncode != 0:
        detail = (proc.stdout or "") + "\n" + (proc.stderr or "")
        raise _normalize_download_error_message(detail)

    payload_text = (proc.stdout or "").strip()
    if not payload_text:
        raise MediaError("URL_IMPORT_UNSUPPORTED", "当前链接暂不支持导入", "yt-dlp probe returned empty payload")
    try:
        info = json.loads(payload_text)
    except json.JSONDecodeError as exc:
        raise MediaError("URL_IMPORT_UNSUPPORTED", "当前链接暂不支持导入", payload_text[:1000]) from exc
    if not isinstance(info, dict):
        raise MediaError("URL_IMPORT_UNSUPPORTED", "当前链接暂不支持导入", "yt-dlp returned non-dict info")
    if info.get("_type") == "playlist" or isinstance(info.get("entries"), list):
        raise MediaError("URL_IMPORT_PLAYLIST_NOT_SUPPORTED", "暂不支持播放列表或批量链接", source_url)
    return info


def _download_public_media_with_executable(
    executable: str,
    source_url: str,
    output_dir: Path,
    *,
    progress_callback=None,
    cancel_event: threading.Event | None = None,
) -> dict[str, object]:
    info = _probe_public_media_with_executable(executable, source_url)
    output_dir.mkdir(parents=True, exist_ok=True)

    def emit_progress(payload: dict[str, object]) -> None:
        if callable(progress_callback):
            progress_callback(payload)

    progress_log = output_dir / ".yt-dlp-progress.log"
    command = [
        executable,
        "--newline",
        "--no-warnings",
        "--no-playlist",
        "--windows-filenames",
        "--retries",
        "2",
        "--fragment-retries",
        "2",
        "--socket-timeout",
        "30",
        "-P",
        str(output_dir),
        "-o",
        URL_IMPORT_OUTPUT_TEMPLATE,
        "-f",
        "bv*+ba/b",
        "--progress-template",
        "download:%(progress.downloaded_bytes)s:%(progress.total_bytes_estimate)s:%(progress.filename)s",
        source_url,
    ]
    emit_progress({"status": "running", "progress_percent": 0, "status_text": "正在解析链接"})
    emit_progress({"status": "running", "progress_percent": 1, "status_text": "链接解析完成，开始下载"})

    with progress_log.open("w", encoding="utf-8", errors="replace") as log_handle:
        process = subprocess.Popen(
            command,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        last_offset = 0
        last_emit_at = 0.0
        while True:
            return_code = process.poll()
            last_offset, lines = _tail_progress_log(progress_log, last_offset=last_offset)
            for line in lines:
                payload = _parse_ytdlp_progress_line(line)
                if payload:
                    emit_progress(payload)
            if return_code is not None:
                break
            if cancel_event and cancel_event.is_set():
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                raise UrlImportCancelled("已取消链接下载")
            if time.monotonic() - last_emit_at >= 1.0:
                emit_progress({"status": "running", "progress_percent": 10, "status_text": "正在下载素材"})
                last_emit_at = time.monotonic()
            time.sleep(0.2)

    if process.returncode != 0:
        _, lines = _tail_progress_log(progress_log, last_offset=0)
        detail = "\n".join(lines[-20:])
        raise _normalize_download_error_message(detail)

    emit_progress({"status": "running", "progress_percent": 100, "status_text": "素材下载完成，正在校验文件"})
    media_file = _resolve_downloaded_media_file(output_dir)
    source_filename = media_file.name
    logger.info("[DEBUG] media_url_import.ytdlp_download_done executable=%s media_file=%s", executable, media_file)
    return {
        "source_url": source_url,
        "source_path": str(media_file.resolve()),
        "source_filename": source_filename,
        "content_type": guess_media_content_type(source_filename),
        "extractor_key": str(info.get("extractor_key") or ""),
        "webpage_url": str(info.get("webpage_url") or source_url),
        "duration_seconds": max(0, int(info.get("duration") or 0)),
    }


def _download_public_media_with_python_api(
    source_url: str,
    output_dir: Path,
    *,
    progress_callback=None,
    cancel_event: threading.Event | None = None,
) -> dict[str, object]:
    if YoutubeDL is None:
        raise MediaError("URL_IMPORT_DEPENDENCY_MISSING", "链接导入依赖未安装", "yt-dlp is unavailable")

    normalized_url = validate_public_media_url(source_url)
    output_dir.mkdir(parents=True, exist_ok=True)

    def emit_progress(payload: dict[str, object]) -> None:
        if callable(progress_callback):
            progress_callback(payload)

    def progress_hook(status: dict[str, object]) -> None:
        _raise_if_cancelled(cancel_event)
        status_name = str(status.get("status") or "").strip().lower()
        info = status.get("info_dict") if isinstance(status.get("info_dict"), dict) else {}
        file_name = (
            str(info.get("_filename") or "")
            or str(status.get("filename") or "")
            or str(info.get("filepath") or "")
        )
        downloaded_bytes = max(0, int(status.get("downloaded_bytes") or 0))
        total_bytes = max(downloaded_bytes, int(status.get("total_bytes") or status.get("total_bytes_estimate") or 0))
        progress_percent = int(round((downloaded_bytes / total_bytes) * 100)) if total_bytes > 0 else 0
        if status_name == "finished":
            emit_progress(
                {
                    "status": "running",
                    "progress_percent": 100,
                    "status_text": "素材下载完成，正在校验文件",
                    "downloaded_bytes": downloaded_bytes,
                    "total_bytes": total_bytes,
                    "source_filename": Path(file_name).name if file_name else "",
                }
            )
            return
        if status_name == "downloading":
            emit_progress(
                {
                    "status": "running",
                    "progress_percent": min(99, max(1, progress_percent)),
                    "status_text": "正在下载素材",
                    "downloaded_bytes": downloaded_bytes,
                    "total_bytes": total_bytes,
                    "source_filename": Path(file_name).name if file_name else "",
                }
            )

    ydl_options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "outtmpl": {"default": str(output_dir / URL_IMPORT_OUTPUT_TEMPLATE)},
        "paths": {"home": str(output_dir)},
        "windowsfilenames": True,
        "retries": 2,
        "fragment_retries": 2,
        "socket_timeout": 30,
        "http_chunk_size": 10485760,
        "format": "bv*+ba/b",
        "progress_hooks": [progress_hook],
    }

    try:
        with YoutubeDL(ydl_options) as ydl:
            _raise_if_cancelled(cancel_event)
            emit_progress({"status": "running", "progress_percent": 0, "status_text": "正在解析链接"})
            info = ydl.extract_info(normalized_url, download=False)
            _raise_if_cancelled(cancel_event)

            if not isinstance(info, dict):
                raise MediaError("URL_IMPORT_UNSUPPORTED", "当前链接暂不支持导入", "yt-dlp returned non-dict info")
            if info.get("_type") == "playlist" or isinstance(info.get("entries"), list):
                raise MediaError("URL_IMPORT_PLAYLIST_NOT_SUPPORTED", "暂不支持播放列表或批量链接", normalized_url)

            emit_progress({"status": "running", "progress_percent": 1, "status_text": "链接解析完成，开始下载"})
            ydl.download([normalized_url])
            _raise_if_cancelled(cancel_event)

            media_file = _resolve_downloaded_media_file(output_dir)
            source_filename = media_file.name
            return {
                "source_url": normalized_url,
                "source_path": str(media_file.resolve()),
                "source_filename": source_filename,
                "content_type": guess_media_content_type(source_filename),
                "extractor_key": str(info.get("extractor_key") or ""),
                "webpage_url": str(info.get("webpage_url") or normalized_url),
                "duration_seconds": max(0, int(info.get("duration") or 0)),
            }
    except UrlImportCancelled as exc:
        raise MediaError("URL_IMPORT_CANCELLED", "已取消链接下载", str(exc)) from exc
    except MediaError:
        raise
    except DownloadError as exc:
        raise _normalize_download_error_message(str(exc)) from exc
    except Exception as exc:
        raise _normalize_download_error_message(str(exc)) from exc


def download_public_media(
    source_url: str,
    output_dir: Path,
    *,
    progress_callback=None,
    cancel_event: threading.Event | None = None,
) -> dict[str, object]:
    normalized_url = validate_public_media_url(source_url)
    executable = get_ytdlp_command()
    if executable:
        return _download_public_media_with_executable(
            executable,
            normalized_url,
            output_dir,
            progress_callback=progress_callback,
            cancel_event=cancel_event,
        )
    return _download_public_media_with_python_api(
        normalized_url,
        output_dir,
        progress_callback=progress_callback,
        cancel_event=cancel_event,
    )
