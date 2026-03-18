from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps.auth import get_current_user
from app.core.errors import error_response
from app.models import User
from app.schemas import AsrModelPrepareResponse, AsrModelStatusResponse, ErrorResponse
from app.services.faster_whisper_asr import (
    FASTER_WHISPER_ASR_MODEL,
    get_faster_whisper_model_status,
    prepare_faster_whisper_model,
)


router = APIRouter(prefix="/api/asr-models", tags=["asr-models"])


def _normalize_model_key(model_key: str) -> str:
    return str(model_key or "").strip()


def _unsupported_model_response(model_key: str):
    return error_response(
        400,
        "INVALID_MODEL",
        "不支持的模型",
        {
            "input_model": str(model_key or ""),
            "supported_models": [FASTER_WHISPER_ASR_MODEL],
        },
    )


@router.get(
    "/{model_key}/status",
    response_model=AsrModelStatusResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def get_asr_model_status(
    model_key: str,
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    normalized_model_key = _normalize_model_key(model_key)
    if normalized_model_key != FASTER_WHISPER_ASR_MODEL:
        return _unsupported_model_response(model_key)
    return AsrModelStatusResponse(ok=True, **get_faster_whisper_model_status())


@router.post(
    "/{model_key}/prepare",
    response_model=AsrModelPrepareResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
)
def prepare_asr_model(
    model_key: str,
    force_refresh: bool = Query(False, description="是否强制刷新模型缓存"),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    normalized_model_key = _normalize_model_key(model_key)
    if normalized_model_key != FASTER_WHISPER_ASR_MODEL:
        return _unsupported_model_response(model_key)
    try:
        payload = prepare_faster_whisper_model(force_refresh=bool(force_refresh))
        return AsrModelPrepareResponse(ok=True, **payload)
    except Exception as exc:
        return error_response(
            502,
            "ASR_MODEL_PREPARE_FAILED",
            "模型准备失败",
            {
                "model_key": normalized_model_key,
                "status": get_faster_whisper_model_status(),
                "error": str(exc)[:1200],
            },
        )
