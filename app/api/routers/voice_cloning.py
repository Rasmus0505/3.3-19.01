"""Voice cloning API endpoints."""
from __future__ import annotations

import os
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.config import BASE_TMP_DIR, UPLOAD_MAX_BYTES
from app.core.errors import error_response
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse
from app.schemas.tts import (
    CreateVoiceRequest,
    CreateVoiceResponse,
    VoiceProfileListResponse,
    VoiceProfileResponse,
)
from app.services.media import cleanup_dir, create_request_dir
from app.services.voice_cloning_service import (
    VoiceCloningError,
    create_user_voice_profile,
    delete_user_voice_profile,
    list_user_voices,
)


router = APIRouter(prefix="/api/voice-cloning", tags=["voice-cloning"])


ALLOWED_AUDIO_TYPES = {"audio/wav", "audio/mpeg", "audio/mp3", "audio/x-wav", "audio/m4a"}
MAX_AUDIO_SIZE = 10 * 1024 * 1024  # 10MB as per DashScope requirements


def _validate_audio_file(audio_file: UploadFile) -> None:
    """Validate audio file type and size."""
    content_type = audio_file.content_type or ""
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的音频格式: {content_type}。支持的格式: WAV, MP3, M4A"
        )


@router.post(
    "/",
    response_model=CreateVoiceResponse,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        413: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
async def create_voice_profile(
    request: CreateVoiceRequest,
    audio_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new voice profile by uploading an audio sample.

    The audio file should be 10-60 seconds long, 24kHz sample rate, mono channel,
    without background music or noise.

    - **audio_file**: Audio file (WAV, MP3, M4A) - max 10MB
    - **preferred_name**: User-friendly name (alphanumeric + underscore, max 16 chars)
    - **target_model**: Target TTS model (optional, defaults to qwen3-tts-vc-2026-01-22)
    - **language**: Audio language (optional: zh, en, de, it, pt, es, ja, ko, fr, ru)
    """
    _validate_audio_file(audio_file)

    req_dir = create_request_dir(BASE_TMP_DIR)
    audio_path = req_dir / f"voice_sample_{int(time.time())}"

    try:
        suffix = Path(audio_file.filename or "audio.mp3").suffix.lower()
        if suffix not in {".wav", ".mp3", ".m4a"}:
            suffix = ".mp3"
        audio_path = audio_path.with_suffix(suffix)

        with audio_path.open("wb") as buffer:
            written = 0
            while chunk := await audio_file.read(8192):
                written += len(chunk)
                if written > MAX_AUDIO_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="音频文件过大，请确保文件小于10MB"
                    )
                buffer.write(chunk)

        profile = create_user_voice_profile(
            user_id=current_user.id,
            audio_file_path=str(audio_path),
            preferred_name=request.preferred_name,
            target_model=request.target_model or "",
            language=request.language,
            db=db,
        )

        return CreateVoiceResponse(
            ok=True,
            voice=profile.voice_name,
            preferred_name=profile.preferred_name,
            target_model=profile.target_model,
            message="音色创建成功",
        )

    except VoiceCloningError as exc:
        if exc.code == "VOICE_LIMIT_EXCEEDED":
            return error_response(400, exc.code, exc.message, {})
        return error_response(502, exc.code, exc.message, {})
    except HTTPException:
        raise
    except Exception as exc:
        return error_response(502, "INTERNAL_ERROR", "服务内部错误", str(exc)[:500])
    finally:
        cleanup_dir(req_dir)
        await audio_file.close()


@router.get(
    "/",
    response_model=VoiceProfileListResponse,
    responses={401: {"model": ErrorResponse}},
)
async def get_voice_profiles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all voice profiles for the current user.

    Returns a list of custom voice profiles created by the user.
    """
    profiles = list_user_voices(user_id=current_user.id, db=db)

    return VoiceProfileListResponse(
        ok=True,
        voices=[
            VoiceProfileResponse(
                voice=p.voice_name,
                preferred_name=p.preferred_name,
                target_model=p.target_model,
                language=p.language,
                gmt_create=p.gmt_create,
                gmt_used=p.gmt_used,
                is_custom=True,
            )
            for p in profiles
        ],
        total=len(profiles),
    )


@router.delete(
    "/{voice_name}",
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
async def remove_voice_profile(
    voice_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a voice profile.

    - **voice_name**: The voice name to delete
    """
    try:
        delete_user_voice_profile(
            user_id=current_user.id,
            voice_name=voice_name,
            db=db,
        )
        return {"ok": True, "message": "音色删除成功"}

    except VoiceCloningError as exc:
        if exc.code == "VOICE_NOT_FOUND":
            raise HTTPException(status_code=404, detail=exc.message)
        return error_response(502, exc.code, exc.message, {})
    except Exception as exc:
        return error_response(502, "INTERNAL_ERROR", "服务内部错误", str(exc)[:500])
