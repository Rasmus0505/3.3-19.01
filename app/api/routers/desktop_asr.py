from __future__ import annotations

from datetime import datetime, timezone
import json
import mimetypes
import os
from pathlib import Path
import re
import subprocess
import threading
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.config import BASE_TMP_DIR, UPLOAD_MAX_BYTES
from app.db import SessionLocal
from app.infra.runtime_tools import get_ytdlp_command
from app.services.asr_dashscope import AsrError, transcribe_audio_file
from app.services.faster_whisper_asr import FASTER_WHISPER_ASR_MODEL
from app.services.lesson_service import LessonService
from app.services.media import MediaError, cleanup_dir, create_request_dir, extract_audio_for_asr, probe_audio_duration_ms, save_upload_file_stream, validate_suffix


router = APIRouter(prefix="/api/desktop-asr", tags=["desktop-asr"])
_URL_IMPORT_TASKS: dict[str, dict[str, Any]] = {}
_SUPPORTED_DIRECT_MEDIA_SUFFIXES = {
    ".mp3",
    ".mp4",
    ".m4a",
    ".wav",
    ".flac",
    ".ogg",
    ".aac",
    ".webm",
    ".mkv",
    ".mov",
}
_SUPPORTED_VIDEO_SUFFIXES = {
    ".mp4",
    ".m4v",
    ".mov",
    ".mkv",
    ".webm",
    ".avi",
}
_URL_TOKEN_PATTERN = re.compile(r"https?://[^\s<>'\"，。；！？、））\]\}]+", re.IGNORECASE)
_URL_IMPORT_INVALID_MESSAGE = "未识别到可导入链接。"
_URL_IMPORT_INVALID_DETAIL = "未识别到可导入链接。请粘贴公开视频页链接，例如 YouTube/B站视频页链接，或改用 SnapAny"
_URL_IMPORT_RESTRICTED_MESSAGE = "该链接可能需要登录或平台限制，建议改用 SnapAny"
_URL_IMPORT_UNSUPPORTED_MESSAGE = "当前桌面工具暂不支持该链接，建议改用 SnapAny"


def _sanitize_source_url(raw_value: str) -> str:
    text = str(raw_value or "").strip()
    if not text:
        return ""
    for match in _URL_TOKEN_PATTERN.finditer(text):
        candidate = str(match.group(0) or "").strip().rstrip(".,!?;:)]}>\"'，。；！？、")
        if candidate:
            return candidate
    return text if text.lower().startswith(("http://", "https://")) else ""


def _looks_like_direct_media_url(source_url: str) -> bool:
    parsed = urlparse(str(source_url or "").strip())
    suffix = Path(parsed.path or "").suffix.lower()
    return suffix in _SUPPORTED_DIRECT_MEDIA_SUFFIXES


def _classify_ytdlp_error(stderr_text: str) -> tuple[str, str]:
    normalized = str(stderr_text or "").strip()
    lowered = normalized.lower()
    if not normalized:
        return ("URL_IMPORT_FAILED", "链接导入失败，请稍后重试")
    if "sign in" in lowered or "login" in lowered or "cookies" in lowered or "members-only" in lowered:
        return ("URL_IMPORT_RESTRICTED", _URL_IMPORT_RESTRICTED_MESSAGE)
    if "unsupported url" in lowered or "unsupported" in lowered or "extractor" in lowered:
        return ("URL_IMPORT_UNSUPPORTED", _URL_IMPORT_UNSUPPORTED_MESSAGE)
    if "private video" in lowered or "unavailable" in lowered or "forbidden" in lowered:
        return ("URL_IMPORT_RESTRICTED", _URL_IMPORT_RESTRICTED_MESSAGE)
    return ("URL_IMPORT_FAILED", "链接导入失败，请稍后重试")


def _probe_ytdlp_metadata(source_url: str) -> dict[str, Any]:
    ytdlp_command = get_ytdlp_command()
    if not ytdlp_command:
        raise MediaError("URL_IMPORT_UNSUPPORTED", _URL_IMPORT_UNSUPPORTED_MESSAGE, "yt-dlp unavailable")
    try:
        completed = subprocess.run(
            [
                ytdlp_command,
                "--dump-single-json",
                "--no-playlist",
                source_url,
            ],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
        payload = json.loads(str(completed.stdout or "{}"))
        return payload if isinstance(payload, dict) else {}
    except subprocess.CalledProcessError as exc:
        code, message = _classify_ytdlp_error(exc.stderr or exc.stdout or "")
        raise MediaError(code, message, str(exc.stderr or exc.stdout or "")[:1200]) from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError("URL_IMPORT_FAILED", "链接导入超时，请稍后重试", str(exc)[:1200]) from exc
    except json.JSONDecodeError as exc:
        raise MediaError("URL_IMPORT_FAILED", "链接解析失败，请稍后重试", str(exc)[:1200]) from exc


def _download_media_with_ytdlp(
    source_url: str,
    output_dir: Path,
    *,
    progress_callback=None,
    cancel_event: threading.Event | None = None,
) -> dict[str, Any]:
    ytdlp_command = get_ytdlp_command()
    if not ytdlp_command:
        raise MediaError("URL_IMPORT_UNSUPPORTED", _URL_IMPORT_UNSUPPORTED_MESSAGE, "yt-dlp unavailable")
    metadata = _probe_ytdlp_metadata(source_url)
    # Only title is promoted into the primary user workflow; other metadata stays helper-side.
    title = str(metadata.get("title") or "").strip()
    duration_seconds = max(0, int(metadata.get("duration") or 0))
    extractor_key = str(metadata.get("extractor_key") or metadata.get("extractor") or "").strip()
    webpage_url = str(metadata.get("webpage_url") or metadata.get("original_url") or source_url).strip() or source_url
    before_files = {path.resolve(strict=False) for path in output_dir.glob("*") if path.is_file()}
    command = [
        ytdlp_command,
        "--no-playlist",
        "--newline",
        "--restrict-filenames",
        "--no-progress",
        "-P",
        str(output_dir),
        "-o",
        "%(title).160B [%(id)s].%(ext)s",
        source_url,
    ]
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    stdout_lines: list[str] = []
    stderr_lines: list[str] = []
    while True:
        if cancel_event is not None and cancel_event.is_set():
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
            raise MediaError("URL_IMPORT_CANCELLED", "已取消链接下载", "cancelled during yt-dlp download")
        if process.stdout is not None:
            line = process.stdout.readline()
            if line:
                stdout_lines.append(line)
                if callable(progress_callback):
                    progress_callback(
                        {
                            "status": "running",
                            "progress_percent": max(5, min(95, int(len(stdout_lines) * 8))),
                            "status_text": "正在下载素材",
                        }
                    )
        if process.poll() is not None:
            break
    if process.stdout is not None:
        stdout_lines.extend(process.stdout.readlines())
    if process.stderr is not None:
        stderr_lines.extend(process.stderr.readlines())
    if process.returncode != 0:
        code, message = _classify_ytdlp_error("".join(stderr_lines) or "".join(stdout_lines))
        raise MediaError(code, message, ("".join(stderr_lines) or "".join(stdout_lines))[:1200])
    after_files = [path.resolve(strict=False) for path in output_dir.glob("*") if path.is_file() and path.resolve(strict=False) not in before_files]
    candidate_files = [path for path in after_files if path.suffix.lower() != ".part"]
    if not candidate_files:
        raise MediaError("URL_IMPORT_FAILED", "链接导入失败，请稍后重试", "yt-dlp completed without output file")
    target_path = max(candidate_files, key=lambda path: path.stat().st_mtime)
    content_type = mimetypes.guess_type(target_path.name)[0] or "application/octet-stream"
    return {
        "source_url": source_url,
        "source_path": str(target_path),
        "source_filename": target_path.name,
        "content_type": content_type,
        "extractor_key": extractor_key,
        "webpage_url": webpage_url,
        "duration_seconds": duration_seconds,
        "title": title,
    }


def _raise_media_http_error(exc: MediaError) -> None:
    status_code = 404 if str(getattr(exc, "code", "") or "").endswith("_NOT_FOUND") else 400
    raise HTTPException(
        status_code=status_code,
        detail={
            "ok": False,
            "error_code": str(getattr(exc, "code", "") or "MEDIA_ERROR"),
            "message": str(getattr(exc, "message", "") or "媒体处理失败"),
            "detail": str(getattr(exc, "detail", "") or ""),
        },
    )


def _resolve_source_path(source_path: str) -> Path:
    normalized = str(source_path or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="source_path is required")
    resolved = Path(normalized).expanduser().resolve(strict=False)
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="source_path does not exist")
    return resolved


def _guess_media_content_type(source_path: Path, source_filename: str = "") -> str:
    guessed = mimetypes.guess_type(str(source_filename or source_path.name).strip() or source_path.name)[0]
    return str(guessed or "application/octet-stream").strip() or "application/octet-stream"


def _looks_like_video_source(source_path: Path, source_filename: str = "", content_type: str = "") -> bool:
    normalized_content_type = str(content_type or "").strip().lower()
    if normalized_content_type.startswith("video/"):
        return True
    suffix = Path(str(source_filename or source_path.name).strip() or source_path.name).suffix.lower()
    return suffix in _SUPPORTED_VIDEO_SUFFIXES


def _run_desktop_transcribe(*, source_path: Path, source_filename: str, model_key: str, runtime_kind: str) -> dict[str, Any]:
    request_dir = create_request_dir(BASE_TMP_DIR)
    audio_path = request_dir / "desktop_input.opus"
    try:
        validate_suffix(source_filename or source_path.name)
        source_duration_ms = max(1, probe_audio_duration_ms(source_path))
        extract_audio_for_asr(source_path, audio_path)
        result = transcribe_audio_file(
            str(audio_path),
            model=str(model_key or FASTER_WHISPER_ASR_MODEL).strip() or FASTER_WHISPER_ASR_MODEL,
            known_duration_ms=source_duration_ms,
        )
        asr_payload = dict(result.get("asr_result_json") or {})
        return {
            "ok": True,
            "runtime_kind": runtime_kind,
            "source_path": str(source_path),
            "source_filename": str(source_filename or source_path.name).strip() or source_path.name,
            "source_duration_ms": source_duration_ms,
            "preview_text": str(result.get("preview_text") or "").strip(),
            "usage_seconds": int(result.get("usage_seconds") or 0),
            "asr_result_json": asr_payload,
            "asr_payload": asr_payload,
        }
    except MediaError as exc:
        _raise_media_http_error(exc)
    except AsrError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "ok": False,
                "error_code": exc.code,
                "message": exc.message,
                "detail": exc.detail,
            },
        ) from exc
    finally:
        cleanup_dir(request_dir)


def _build_local_generation_payload(transcription: dict[str, Any], runtime_kind: str, model_key: str) -> dict[str, Any]:
    asr_payload = dict(transcription.get("asr_result_json") or {})
    local_generation_result = _build_local_generation_result(
        asr_payload=asr_payload,
        runtime_kind=runtime_kind,
        asr_model=model_key,
        source_duration_ms=int(transcription.get("source_duration_ms") or 0),
    )
    combined_asr_payload = dict(asr_payload)
    combined_asr_payload["__local_generation_result__"] = local_generation_result
    return {
        **transcription,
        "asr_payload": combined_asr_payload,
        "local_generation_result": local_generation_result,
    }


def _build_fallback_local_generation_result(
    *,
    asr_payload: dict[str, Any],
    runtime_kind: str,
    asr_model: str,
    source_duration_ms: int,
) -> dict[str, Any]:
    transcript = list(asr_payload.get("transcripts") or [])
    first_transcript = transcript[0] if transcript and isinstance(transcript[0], dict) else {}
    sentence_items = []
    for idx, item in enumerate(list(first_transcript.get("sentences") or [])):
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        begin_ms = max(0, int(item.get("begin_time") or 0))
        end_ms = max(begin_ms, int(item.get("end_time") or 0))
        if not text:
            continue
        sentence_items.append(
            {
                "idx": idx,
                "begin_ms": begin_ms,
                "end_ms": end_ms,
                "text_en": text,
                "text_zh": "",
                "tokens": text.split(),
                "audio_url": None,
            }
        )
    variant = {
        "semantic_split_enabled": False,
        "split_mode": "asr_sentences",
        "source_word_count": sum(len(item["tokens"]) for item in sentence_items),
        "strategy_version": 2,
        "sentences": sentence_items,
        "translate_failed_count": len(sentence_items),
        "translation_usage": {"total_tokens": 0},
    }
    translation_debug = {
        "total_sentences": len(sentence_items),
        "failed_sentences": len(sentence_items),
        "request_count": 0,
        "success_request_count": 0,
        "usage": {"total_tokens": 0, "charged_points": 0, "charged_amount_cents": 0, "actual_cost_amount_cents": 0},
        "latest_error_summary": "desktop helper fallback without cloud translation",
    }
    return {
        "runtime_kind": runtime_kind,
        "lesson_status": "partial_ready" if sentence_items else "ready",
        "duration_ms": max(source_duration_ms, max((item["end_ms"] for item in sentence_items), default=0)),
        "source_duration_ms": max(1, int(source_duration_ms or 0)),
        "variant": variant,
        "translation_debug": translation_debug,
        "task_result_meta": {
            "result_kind": "asr_only" if sentence_items else "full_success",
            "result_message": "课程已生成完成",
            "partial_failure_stage": "translate_zh" if sentence_items else "",
            "partial_failure_code": "TRANSLATION_UNAVAILABLE" if sentence_items else "",
            "partial_failure_message": "Desktop helper generated subtitles without server translation." if sentence_items else "",
        },
        "subtitle_cache_seed": {
            "semantic_split_enabled": False,
            "split_mode": "asr_sentences",
            "source_word_count": variant["source_word_count"],
            "strategy_version": 2,
            "runtime_kind": runtime_kind,
            "asr_payload": asr_payload,
            "sentences": sentence_items,
        },
        "asr_model": asr_model,
    }


def _build_local_generation_result(
    *,
    asr_payload: dict[str, Any],
    runtime_kind: str,
    asr_model: str,
    source_duration_ms: int,
) -> dict[str, Any]:
    try:
        if os.getenv("DATABASE_URL", "").strip():
            with SessionLocal() as db:
                return LessonService.build_local_generation_result(
                    asr_payload=asr_payload,
                    runtime_kind=runtime_kind,
                    asr_model=asr_model,
                    source_duration_ms=source_duration_ms,
                    db=db,
                    semantic_split_enabled=False,
                )
        return LessonService.build_local_generation_result(
            asr_payload=asr_payload,
            runtime_kind=runtime_kind,
            asr_model=asr_model,
            source_duration_ms=source_duration_ms,
            db=None,
            semantic_split_enabled=False,
        )
    except Exception:
        return _build_fallback_local_generation_result(
            asr_payload=asr_payload,
            runtime_kind=runtime_kind,
            asr_model=asr_model,
            source_duration_ms=source_duration_ms,
        )


def _build_url_import_task(task_id: str, source_url: str, output_dir: Path) -> dict[str, Any]:
    return {
        "ok": True,
        "task_id": task_id,
        "source_url": source_url,
        "status": "queued",
        "progress_percent": 0,
        "status_text": "等待下载素材",
        "downloaded_bytes": 0,
        "total_bytes": 0,
        "source_filename": "",
        "source_path": "",
        "title": "",
        "content_type": "",
        "duration_seconds": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "_cancel_event": threading.Event(),
        "_output_dir": output_dir,
    }


def _update_url_import_task(task_id: str, **updates: Any) -> dict[str, Any]:
    task = _URL_IMPORT_TASKS[task_id]
    task.update(updates)
    task["updated_at"] = datetime.now(timezone.utc).isoformat()
    return task


def download_public_media(
    source_url: str,
    output_dir: Path,
    *,
    progress_callback=None,
    cancel_event: threading.Event | None = None,
) -> dict[str, Any]:
    import requests

    normalized_source_url = _sanitize_source_url(source_url)
    parsed = urlparse(normalized_source_url)
    if parsed.scheme not in {"http", "https"}:
        raise MediaError("URL_IMPORT_INVALID_URL", _URL_IMPORT_INVALID_DETAIL, source_url)

    if not _looks_like_direct_media_url(normalized_source_url):
        return _download_media_with_ytdlp(
            normalized_source_url,
            output_dir,
            progress_callback=progress_callback,
            cancel_event=cancel_event,
        )

    filename = Path(parsed.path or "").name or "downloaded-media"
    if not Path(filename).suffix:
        filename = f"{filename}.mp4"
    target_path = output_dir / filename
    with requests.get(normalized_source_url, stream=True, timeout=60) as response:
        response.raise_for_status()
        total_bytes = max(0, int(response.headers.get("content-length", "0") or 0))
        downloaded_bytes = 0
        with target_path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 512):
                if cancel_event is not None and cancel_event.is_set():
                    raise MediaError("URL_IMPORT_CANCELLED", "已取消链接下载", "cancelled during download")
                if not chunk:
                    continue
                handle.write(chunk)
                downloaded_bytes += len(chunk)
                if callable(progress_callback):
                    progress_callback(
                        {
                            "status": "running",
                            "progress_percent": int(downloaded_bytes / total_bytes * 100) if total_bytes > 0 else 0,
                            "status_text": "正在下载素材",
                            "downloaded_bytes": downloaded_bytes,
                            "total_bytes": total_bytes,
                            "source_filename": target_path.name,
                        }
                    )
    content_type = mimetypes.guess_type(target_path.name)[0] or "application/octet-stream"
    return {
        "source_url": normalized_source_url,
        "source_path": str(target_path),
        "source_filename": target_path.name,
        "content_type": content_type,
        "extractor_key": "DirectHttp",
        "webpage_url": normalized_source_url,
        "duration_seconds": 0,
        "title": Path(target_path.name).stem,
    }


def _run_url_import_task(task_id: str) -> None:
    task = _URL_IMPORT_TASKS.get(task_id)
    if not task:
        return
    cancel_event = task["_cancel_event"]
    output_dir = task["_output_dir"]
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        _update_url_import_task(task_id, status="running", status_text="正在下载素材")

        def _on_progress(payload: dict[str, Any]) -> None:
            _update_url_import_task(
                task_id,
                status=str(payload.get("status") or "running"),
                progress_percent=int(payload.get("progress_percent") or 0),
                status_text=str(payload.get("status_text") or "正在下载素材"),
                downloaded_bytes=int(payload.get("downloaded_bytes") or 0),
                total_bytes=int(payload.get("total_bytes") or 0),
                source_filename=str(payload.get("source_filename") or ""),
            )

        result = download_public_media(
            str(task["source_url"]),
            output_dir,
            progress_callback=_on_progress,
            cancel_event=cancel_event,
        )
        if cancel_event.is_set():
            raise MediaError("URL_IMPORT_CANCELLED", "已取消链接下载", "cancelled")
        _update_url_import_task(
            task_id,
            status="succeeded",
            progress_percent=100,
            status_text="素材下载完成",
            source_path=str(result.get("source_path") or ""),
            source_filename=str(result.get("source_filename") or ""),
            title=str(result.get("title") or ""),
            content_type=str(result.get("content_type") or ""),
            extractor_key=str(result.get("extractor_key") or ""),
            webpage_url=str(result.get("webpage_url") or ""),
            duration_seconds=int(result.get("duration_seconds") or 0),
        )
    except MediaError as exc:
        next_status = "cancelled" if str(exc.code or "").upper() == "URL_IMPORT_CANCELLED" else "failed"
        _update_url_import_task(
            task_id,
            status=next_status,
            error_code=exc.code,
            error_message=exc.message,
            status_text=exc.message,
        )
    except Exception as exc:  # pragma: no cover - defensive path
        _update_url_import_task(
            task_id,
            status="failed",
            error_code="URL_IMPORT_FAILED",
            error_message=str(exc)[:1200],
            status_text="素材下载失败",
        )


@router.post("/transcribe")
def desktop_transcribe(payload: dict[str, Any]) -> dict[str, Any]:
    source_path = _resolve_source_path(str(payload.get("source_path") or ""))
    source_filename = str(payload.get("source_filename") or source_path.name).strip() or source_path.name
    model_key = str(payload.get("model_key") or FASTER_WHISPER_ASR_MODEL).strip() or FASTER_WHISPER_ASR_MODEL
    return _run_desktop_transcribe(
        source_path=source_path,
        source_filename=source_filename,
        model_key=model_key,
        runtime_kind="desktop_local",
    )


@router.post("/generate")
def desktop_generate(payload: dict[str, Any]) -> dict[str, Any]:
    source_path = _resolve_source_path(str(payload.get("source_path") or ""))
    source_filename = str(payload.get("source_filename") or source_path.name).strip() or source_path.name
    model_key = str(payload.get("model_key") or FASTER_WHISPER_ASR_MODEL).strip() or FASTER_WHISPER_ASR_MODEL
    runtime_kind = str(payload.get("runtime_kind") or "desktop_local").strip() or "desktop_local"
    transcription = _run_desktop_transcribe(
        source_path=source_path,
        source_filename=source_filename,
        model_key=model_key,
        runtime_kind=runtime_kind,
    )
    return _build_local_generation_payload(transcription, runtime_kind, model_key)


@router.post("/prepare-upload-source")
def desktop_prepare_upload_source(payload: dict[str, Any]) -> dict[str, Any]:
    source_path = _resolve_source_path(str(payload.get("source_path") or ""))
    source_filename = str(payload.get("source_filename") or source_path.name).strip() or source_path.name
    validate_suffix(source_filename or source_path.name)
    content_type = _guess_media_content_type(source_path, source_filename)
    if not _looks_like_video_source(source_path, source_filename, content_type):
        return {
            "ok": True,
            "prepared": False,
            "source_path": str(source_path),
            "source_filename": source_filename,
            "content_type": content_type,
            "source_size_bytes": max(0, int(source_path.stat().st_size or 0)),
            "source_duration_ms": max(1, probe_audio_duration_ms(source_path)),
        }

    request_dir = create_request_dir(BASE_TMP_DIR)
    prepared_filename = f"{Path(source_filename).stem}.opus"
    prepared_path = request_dir / prepared_filename
    try:
        extract_audio_for_asr(source_path, prepared_path)
        prepared_content_type = _guess_media_content_type(prepared_path, prepared_filename)
        return {
            "ok": True,
            "prepared": True,
            "source_path": str(prepared_path),
            "source_filename": prepared_filename,
            "content_type": prepared_content_type,
            "source_size_bytes": max(0, int(prepared_path.stat().st_size or 0)),
            "source_duration_ms": max(1, probe_audio_duration_ms(prepared_path)),
            "original_source_path": str(source_path),
            "original_source_filename": source_filename,
        }
    except MediaError as exc:
        _raise_media_http_error(exc)


@router.post("/transcribe-upload")
def desktop_transcribe_upload(
    video_file: UploadFile = File(...),
    model_key: str = Form(FASTER_WHISPER_ASR_MODEL),
    runtime_kind: str = Form("browser_local"),
) -> dict[str, Any]:
    request_dir = create_request_dir(BASE_TMP_DIR)
    try:
        source_suffix = Path(video_file.filename or "").suffix or ".bin"
        source_path = request_dir / f"upload{source_suffix}"
        save_upload_file_stream(video_file, source_path, max_bytes=UPLOAD_MAX_BYTES)
        return _run_desktop_transcribe(
            source_path=source_path,
            source_filename=str(video_file.filename or source_path.name),
            model_key=str(model_key or FASTER_WHISPER_ASR_MODEL),
            runtime_kind=str(runtime_kind or "browser_local").strip() or "browser_local",
        )
    finally:
        cleanup_dir(request_dir)


@router.post("/url-import/tasks")
def create_url_import_task(payload: dict[str, Any]) -> dict[str, Any]:
    source_url = _sanitize_source_url(str(payload.get("source_url") or ""))
    if not source_url:
        raise HTTPException(status_code=400, detail={"ok": False, "error_code": "URL_IMPORT_INVALID_URL", "message": _URL_IMPORT_INVALID_MESSAGE})
    task_id = uuid4().hex
    output_dir = create_request_dir(BASE_TMP_DIR) / "url-import"
    task = _build_url_import_task(task_id, source_url, output_dir)
    _URL_IMPORT_TASKS[task_id] = task
    threading.Thread(target=_run_url_import_task, args=(task_id,), daemon=True, name=f"url-import-{task_id}").start()
    return {"ok": True, "task_id": task_id, "status": "queued"}


@router.get("/url-import/tasks/{task_id}")
def get_url_import_task(task_id: str) -> dict[str, Any]:
    task = _URL_IMPORT_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return {key: value for key, value in task.items() if not key.startswith("_")}


@router.post("/url-import/tasks/{task_id}/cancel")
def cancel_url_import_task(task_id: str) -> dict[str, Any]:
    task = _URL_IMPORT_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    task["_cancel_event"].set()
    current_status = str(task.get("status") or "")
    if current_status not in {"succeeded", "failed", "cancelled"}:
        _update_url_import_task(task_id, status="cancelling", status_text="正在取消下载")
    return {"ok": True, "task_id": task_id, "status": str(task.get("status") or "cancelling")}


@router.get("/url-import/tasks/{task_id}/file")
def get_url_import_task_file(task_id: str):
    task = _URL_IMPORT_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    source_path = Path(str(task.get("source_path") or "")).resolve(strict=False)
    if str(task.get("status") or "") != "succeeded" or not source_path.exists():
        raise HTTPException(status_code=404, detail="downloaded file is unavailable")
    filename = str(task.get("source_filename") or source_path.name).strip() or source_path.name
    return FileResponse(source_path, media_type=str(task.get("content_type") or "application/octet-stream"), filename=filename)
