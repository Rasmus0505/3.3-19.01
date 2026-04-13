from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps.auth import get_current_user
from app.core.errors import error_response
from app.models import User
from app.schemas import AsrModelListResponse, AsrModelPrepareResponse, AsrModelStatusResponse, ErrorResponse
from app.services.asr_model_registry import (
    get_asr_model_status,
    get_supported_asr_model_keys,
    list_asr_models_with_status,
    prepare_asr_model as prepare_registered_asr_model,
    verify_asr_model,
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
            "supported_models": list(get_supported_asr_model_keys()),
        },
    )


@router.get(
    "",
    response_model=AsrModelListResponse,
    responses={401: {"model": ErrorResponse}},
)
def list_asr_models(current_user: User = Depends(get_current_user)):
    _ = current_user
    return AsrModelListResponse(ok=True, models=list_asr_models_with_status())


@router.get(
    "/{model_key}/status",
    response_model=AsrModelStatusResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def get_registered_model_status(
    model_key: str,
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    normalized_model_key = _normalize_model_key(model_key)
    if normalized_model_key not in set(get_supported_asr_model_keys()):
        return _unsupported_model_response(model_key)
    return AsrModelStatusResponse(ok=True, **get_asr_model_status(normalized_model_key))


@router.post(
    "/{model_key}/prepare",
    response_model=AsrModelPrepareResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
)
def prepare_registered_model(
    model_key: str,
    force_refresh: bool = Query(False, description="是否强制刷新模型缓存"),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    normalized_model_key = _normalize_model_key(model_key)
    if normalized_model_key not in set(get_supported_asr_model_keys()):
        return _unsupported_model_response(model_key)
    try:
        payload = prepare_registered_asr_model(normalized_model_key, force_refresh=bool(force_refresh))
        return AsrModelPrepareResponse(ok=True, **payload)
    except Exception as exc:
        return error_response(
            502,
            "ASR_MODEL_PREPARE_FAILED",
            "模型准备失败",
            {
                "model_key": normalized_model_key,
                "status": get_asr_model_status(normalized_model_key),
                "error": str(exc)[:1200],
            },
        )


@router.post(
    "/{model_key}/verify",
    response_model=AsrModelStatusResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def verify_registered_model(
    model_key: str,
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    normalized_model_key = _normalize_model_key(model_key)
    if normalized_model_key not in set(get_supported_asr_model_keys()):
        return _unsupported_model_response(model_key)
    return AsrModelStatusResponse(ok=True, **verify_asr_model(normalized_model_key))
