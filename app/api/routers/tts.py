"""TTS (Text-to-Speech) synthesis API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.errors import error_response
from app.db import get_db
from app.models import User
from app.schemas import ErrorResponse
from app.schemas.tts import (
    TTSRequest,
    TTSResponse,
    VoiceInfoResponse,
    VoiceListResponse,
)
from app.services.ai_platform import (
    AiPlatformError,
    build_tts_data_uri,
    resolve_default_model,
    synthesize_tts_streaming,
)
from app.services.tts_service import (
    TTSError,
    get_available_voices,
)

router = APIRouter(prefix="/api/tts", tags=["tts"])


@router.get(
    "/voices",
    response_model=VoiceListResponse,
)
async def get_voices():
    """Get all available voices (platform + user custom voices).

    Returns a list of all available TTS voices that can be used for synthesis.
    Platform voices are predefined by the administrator, while custom voices
    are created by users through the voice cloning API.
    """
    voices = get_available_voices()

    return VoiceListResponse(
        ok=True,
        voices=[
            VoiceInfoResponse(
                voice=v.voice,
                name=v.name,
                language=v.language,
                target_model=v.target_model,
                is_custom=v.is_custom,
                is_platform=v.is_platform,
            )
            for v in voices
        ],
        total=len(voices),
    )


@router.post(
    "/synthesize",
    response_model=TTSResponse,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
async def synthesize_text(
    request: TTSRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Synthesize speech from text using the specified voice.

    - **text**: Text to synthesize (1-2000 characters)
    - **voice**: Voice name (from get_voices endpoint)
    - **model**: TTS model (optional, defaults to qwen3-tts-vc-2026-01-22)
    - **language_type**: Language hint (Auto, Chinese, English, etc.)

    Returns an audio URL that is valid for 24 hours.
    """
    model = request.model or resolve_default_model("tts") or "cosyvoice-v1"
    voice = request.voice or "longxiaochun"

    try:
        audio_url = build_tts_data_uri(text=request.text, voice=voice, model_key=model)
        return TTSResponse(
            ok=True,
            audio_url=audio_url,
            model=model,
            voice=voice,
            characters=len(request.text),
            finish_reason="complete",
        )
    except (TTSError, AiPlatformError) as exc:
        return error_response(502, exc.code, exc.message, {})
    except Exception as exc:
        return error_response(502, "INTERNAL_ERROR", "服务内部错误", str(exc)[:500])


@router.post(
    "/synthesize-stream",
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
async def synthesize_text_stream(
    request: TTSRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Synthesize speech from text with streaming audio output.

    - **text**: Text to synthesize (1-2000 characters)
    - **voice**: Voice name (from get_voices endpoint)
    - **model**: TTS model (optional, defaults to qwen3-tts-vc-2026-01-22)
    - **language_type**: Language hint (Auto, Chinese, English, etc.)

    Returns Server-Sent Events (SSE) with base64 encoded audio chunks.
    Each chunk contains a 'data' field with the base64 audio data.
    """
    try:
        audio_stream = synthesize_tts_streaming(
            text=request.text,
            voice=request.voice,
            model_key=request.model or resolve_default_model("tts") or "qwen3-tts-vc-2026-01-22",
            language_type=request.language_type or "Auto",
        )

        async def generate_sse():
            import json

            for chunk in audio_stream:
                chunk_data = chunk.get("output", {}).get("audio", {}).get("data")
                if chunk_data:
                    yield f"data: {json.dumps({'audio': chunk_data})}\n\n"
                if chunk.get("output", {}).get("finish_reason") == "stop":
                    break

            yield "data: [DONE]\n\n"

        return StreamingResponse(
            generate_sse(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )

    except (TTSError, AiPlatformError) as exc:
        raise HTTPException(status_code=502, detail=f"{exc.code}: {exc.message}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"INTERNAL_ERROR: {str(exc)[:200]}")
