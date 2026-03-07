from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, File, Form, UploadFile

from app.core.config import BASE_TMP_DIR, REQUEST_TIMEOUT_SECONDS
from app.core.errors import error_response, map_media_error
from app.schemas import ErrorResponse, SuccessResponse
from app.services.asr_dashscope import AsrError, DEFAULT_MODEL, SUPPORTED_MODELS
from app.services.media import cleanup_dir, create_request_dir
from app.services.transcription_service import transcribe_uploaded_file


router = APIRouter(prefix="/api/transcribe", tags=["transcribe"])


@router.post(
    "/file",
    response_model=SuccessResponse,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def transcribe_file_with_model(
    video_file: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL),
    semantic_split_enabled: bool | None = Form(None),
):
    selected_model = (model or "").strip() or DEFAULT_MODEL
    started = time.monotonic()
    req_dir = create_request_dir(BASE_TMP_DIR)
    try:
        asr_result = await asyncio.wait_for(
            asyncio.to_thread(transcribe_uploaded_file, video_file, req_dir, selected_model),
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
            asr_result_json=asr_result["asr_result_json"],
            elapsed_ms=elapsed_ms,
        )
    except asyncio.TimeoutError:
        return error_response(504, "REQUEST_TIMEOUT", "请求处理超时", f"超过 {REQUEST_TIMEOUT_SECONDS} 秒")
    except AsrError as exc:
        if exc.code == "INVALID_MODEL":
            return error_response(400, exc.code, exc.message, {"supported_models": sorted(SUPPORTED_MODELS), "input_model": exc.detail})
        return error_response(502, exc.code, exc.message, exc.detail)
    except Exception as exc:
        from app.services.media import MediaError

        if isinstance(exc, MediaError):
            return map_media_error(exc)
        return error_response(500, "INTERNAL_ERROR", "服务内部错误", str(exc)[:1200])
    finally:
        cleanup_dir(req_dir)
        await video_file.close()
