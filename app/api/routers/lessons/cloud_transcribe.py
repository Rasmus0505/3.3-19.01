"""
Bottle 2.0 Cloud Transcribe Router

POST /api/lessons/tasks/cloud-transcribe
  Multipart form: file (UploadFile), file_name (str), file_size (int, optional), file_type (str, optional)
  Response: LessonCreateResponse

The browser sends the file directly to the Bottle server.
The server forwards it to DashScope (Files.upload -> Transcription), extracts the text,
and creates a lesson from the transcription result.

The file is saved only transiently on the server's temp disk and deleted immediately
after the DashScope API call completes. The server never stores the media file.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.serializers import to_lesson_detail_response
from app.core.config import BASE_TMP_DIR, DASHSCOPE_API_KEY, REQUEST_TIMEOUT_SECONDS, UPLOAD_MAX_BYTES
from app.core.errors import error_response, map_billing_error, map_media_error
from app.db import get_db
from app.models import User
from app.repositories.lessons import get_lesson_sentences
from app.schemas import ErrorResponse, LessonCreateResponse
from app.services.asr_dashscope import AsrCancellationRequested, AsrError, transcribe_audio_file
from app.services.billing_service import BillingError
from app.services.lesson_command_service import create_completed_lesson_from_local_generation
from app.services.media import MediaError, cleanup_dir, create_request_dir, save_upload_file_stream

router = APIRouter(prefix="/api/lessons/tasks", tags=["lessons-cloud"])
logger = logging.getLogger(__name__)

# DashScope model used for Bottle 2.0 cloud transcription
CLOUD_ASR_MODEL = "qwen3-asr-flash-filetrans"


def _extract_text_from_dashscope_result(result: dict) -> str:
    """Extract readable text from a DashScope transcription result dict."""
    if not isinstance(result, dict):
        return ""

    r = result

    # Top-level "text" field
    if isinstance(r.get("text"), str) and r["text"].strip():
        return r["text"].strip()

    # "output" wrapper (common in DashScope responses)
    output = r.get("output")
    if isinstance(output, dict):
        if isinstance(output.get("text"), str) and output["text"].strip():
            return output["text"].strip()
        if isinstance(output.get("transcription"), str) and output["transcription"].strip():
            return output["transcription"].strip()
        transcripts = output.get("transcripts")
        if isinstance(transcripts, list):
            texts = [
                t["text"].strip()
                for t in transcripts
                if isinstance(t, dict) and isinstance(t.get("text"), str) and t["text"].strip()
            ]
            joined = " ".join(texts)
            if joined:
                return joined
        results = output.get("results")
        if isinstance(results, list):
            texts = []
            for item in results:
                if isinstance(item, dict):
                    if isinstance(item.get("text"), str):
                        texts.append(item["text"].strip())
                    elif isinstance(item.get("transcription"), str):
                        texts.append(item["transcription"].strip())
            joined = " ".join(t for t in texts if t)
            if joined:
                return joined

    # Direct transcripts / results arrays
    for key in ("transcripts", "results"):
        val = r.get(key)
        if isinstance(val, list):
            texts = []
            for item in val:
                if isinstance(item, dict):
                    if isinstance(item.get("text"), str):
                        texts.append(item["text"].strip())
                    elif isinstance(item.get("transcription"), str):
                        texts.append(item["transcription"].strip())
            joined = " ".join(t for t in texts if t)
            if joined:
                return joined

    return ""


@router.post(
    "/cloud-transcribe",
    response_model=LessonCreateResponse,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        413: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    status_code=status.HTTP_200_OK,
)
async def cloud_transcribe(
    file: UploadFile = File(...),
    file_name: str = Form(...),
    file_size: int | None = Form(None),
    file_type: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Receive a media file, forward it to DashScope for transcription, and return the
    resulting lesson creation response.

    The file is saved transiently on the server's temp disk and deleted immediately
    after the DashScope call completes. No media file is persisted on the server.
    """
    if not DASHSCOPE_API_KEY:
        return error_response(502, "DASHSCOPE_NOT_CONFIGURED", "DashScope API Key 未配置", {})

    # Validate file size to prevent abuse
    content_length = file_size or 0
    if content_length > UPLOAD_MAX_BYTES:
        return error_response(
            413,
            "FILE_TOO_LARGE",
            f"文件大小超过限制（最大 {UPLOAD_MAX_BYTES // (1024 * 1024)} MB）",
            {},
        )

    # Save to a temporary location
    req_dir = create_request_dir(BASE_TMP_DIR)
    suffix = Path(file_name or "file").suffix or ".bin"
    tmp_path = req_dir / f"cloud_asr{suffix}"

    try:
        save_upload_file_stream(file, tmp_path, max_bytes=UPLOAD_MAX_BYTES)
        await file.close()

        # Forward to DashScope transcription
        try:
            result = transcribe_audio_file(
                audio_path=str(tmp_path),
                model=CLOUD_ASR_MODEL,
                requests_timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except AsrError as exc:
            return error_response(502, exc.code, exc.message, exc.detail)
        except AsrCancellationRequested:
            return error_response(502, "ASR_CANCELLED", "ASR 识别被取消", {})

        transcription_text = _extract_text_from_dashscope_result(result)
        if not transcription_text:
            return error_response(502, "ASR_NO_TEXT", "ASR 返回结果为空", {})

        asr_payload = {
            "transcription_text": transcription_text,
            "task_id": str(result.get("task_id", "")),
        }

        # Create a lesson from the transcription result
        try:
            lesson = create_completed_lesson_from_local_generation(
                source_filename=file_name,
                source_duration_ms=int(result.get("usage_seconds", 0) * 1000) if result.get("usage_seconds") else 0,
                runtime_kind="cloud_dashscope",
                asr_payload=asr_payload,
                owner_user_id=current_user.id,
                asr_model=CLOUD_ASR_MODEL,
                db=db,
            )
        except BillingError as exc:
            return map_billing_error(exc)
        except MediaError as exc:
            return map_media_error(exc)
        except Exception as exc:
            db.rollback()
            return error_response(500, "INTERNAL_ERROR", "课程生成失败", str(exc)[:1200])

        sentences = get_lesson_sentences(db, lesson.id)
        return LessonCreateResponse(ok=True, lesson=to_lesson_detail_response(lesson, sentences))

    finally:
        cleanup_dir(req_dir)
