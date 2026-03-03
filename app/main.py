from __future__ import annotations

import asyncio
import os
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.schemas import BilibiliTranscribeRequest, ErrorResponse, SuccessResponse
from app.services.asr_dashscope import AsrError, setup_dashscope, transcribe_audio_file
from app.services.media import (
    MediaError,
    cleanup_dir,
    create_request_dir,
    download_bilibili_audio,
    extract_wav,
    save_upload_file_stream,
    validate_suffix,
)


SERVICE_NAME = "zeabur3.3-min-asr"
REQUEST_TIMEOUT_SECONDS = 480
UPLOAD_MAX_BYTES = 200 * 1024 * 1024
BASE_TMP_DIR = Path(os.getenv("TMP_WORK_DIR", "/tmp/zeabur3.3"))
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"


def _ensure_cmd_exists(cmd: str) -> None:
    if shutil.which(cmd) is None:
        raise RuntimeError(f"missing_dependency: `{cmd}` 未安装或不可执行")


def _is_valid_bilibili_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    host = (parsed.hostname or "").lower().strip()
    return host == "bilibili.com" or host.endswith(".bilibili.com")


def _error(status_code: int, code: str, message: str, detail: str = "") -> JSONResponse:
    payload = ErrorResponse(ok=False, error_code=code, message=message, detail=detail).model_dump()
    return JSONResponse(status_code=status_code, content=payload)


def _map_media_error(exc: MediaError) -> JSONResponse:
    if exc.code == "FILE_TOO_LARGE":
        return _error(413, exc.code, exc.message, exc.detail)
    if exc.code in {"INVALID_FILE_TYPE", "EMPTY_FILE", "BILIBILI_DOWNLOAD_FAILED"}:
        return _error(400, exc.code, exc.message, exc.detail)
    return _error(500, exc.code, exc.message, exc.detail)


@asynccontextmanager
async def lifespan(_: FastAPI):
    _ensure_cmd_exists("ffmpeg")
    _ensure_cmd_exists("yt-dlp")
    if not DASHSCOPE_API_KEY:
        raise RuntimeError("missing_env: `DASHSCOPE_API_KEY` 未配置")
    BASE_TMP_DIR.mkdir(parents=True, exist_ok=True)
    setup_dashscope(DASHSCOPE_API_KEY)
    yield


app = FastAPI(title=SERVICE_NAME, version="0.1.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
def root_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": SERVICE_NAME}


def _sync_transcribe_from_uploaded_file(upload_file: UploadFile, req_dir: Path) -> dict:
    suffix = validate_suffix(upload_file.filename or "")
    input_path = req_dir / f"upload{suffix}"
    save_upload_file_stream(upload_file, input_path, max_bytes=UPLOAD_MAX_BYTES)
    wav_path = req_dir / "input.wav"
    extract_wav(input_path, wav_path)
    return transcribe_audio_file(str(wav_path))


def _sync_transcribe_from_bilibili(url: str, req_dir: Path) -> dict:
    downloaded_audio = download_bilibili_audio(url, req_dir)
    wav_path = req_dir / "input.wav"
    extract_wav(downloaded_audio, wav_path)
    return transcribe_audio_file(str(wav_path))


@app.post(
    "/api/transcribe/file",
    response_model=SuccessResponse,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def transcribe_file(video_file: UploadFile = File(...)):
    started = time.monotonic()
    req_dir = create_request_dir(BASE_TMP_DIR)
    try:
        asr_result = await asyncio.wait_for(
            asyncio.to_thread(_sync_transcribe_from_uploaded_file, video_file, req_dir),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return SuccessResponse(
            ok=True,
            source_type="file",
            model=asr_result["model"],
            task_id=asr_result["task_id"],
            task_status=asr_result["task_status"],
            transcription_url=asr_result["transcription_url"],
            preview_text=asr_result["preview_text"],
            elapsed_ms=elapsed_ms,
        )
    except asyncio.TimeoutError:
        return _error(504, "REQUEST_TIMEOUT", "请求处理超时", f"超过 {REQUEST_TIMEOUT_SECONDS} 秒")
    except MediaError as exc:
        return _map_media_error(exc)
    except AsrError as exc:
        return _error(502, exc.code, exc.message, exc.detail)
    except Exception as exc:
        return _error(500, "INTERNAL_ERROR", "服务内部错误", str(exc)[:1200])
    finally:
        cleanup_dir(req_dir)
        await video_file.close()


@app.post(
    "/api/transcribe/bilibili",
    response_model=SuccessResponse,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def transcribe_bilibili(payload: BilibiliTranscribeRequest):
    url = payload.url.strip()
    if not _is_valid_bilibili_url(url):
        return _error(400, "INVALID_BILIBILI_URL", "仅支持 bilibili.com 域名链接", url[:500])

    started = time.monotonic()
    req_dir = create_request_dir(BASE_TMP_DIR)
    try:
        asr_result = await asyncio.wait_for(
            asyncio.to_thread(_sync_transcribe_from_bilibili, url, req_dir),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return SuccessResponse(
            ok=True,
            source_type="bilibili",
            model=asr_result["model"],
            task_id=asr_result["task_id"],
            task_status=asr_result["task_status"],
            transcription_url=asr_result["transcription_url"],
            preview_text=asr_result["preview_text"],
            elapsed_ms=elapsed_ms,
        )
    except asyncio.TimeoutError:
        return _error(504, "REQUEST_TIMEOUT", "请求处理超时", f"超过 {REQUEST_TIMEOUT_SECONDS} 秒")
    except MediaError as exc:
        return _map_media_error(exc)
    except AsrError as exc:
        return _error(502, exc.code, exc.message, exc.detail)
    except Exception as exc:
        return _error(500, "INTERNAL_ERROR", "服务内部错误", str(exc)[:1200])
    finally:
        cleanup_dir(req_dir)
