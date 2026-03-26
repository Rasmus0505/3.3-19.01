"""DashScope pre-signed upload policy router for Bottle 2.0 direct upload."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import requests
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps.auth import get_current_user
from app.core.config import DASHSCOPE_API_KEY
from app.core.errors import error_response
from app.models import User
from app.schemas import ErrorResponse

router = APIRouter(prefix="/api/dashscope-upload", tags=["dashscope-upload"])
logger = logging.getLogger(__name__)

DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/api/v1"
POLICY_ENDPOINT = f"{DASHSCOPE_BASE_URL}/uploads"
REQUEST_TIMEOUT_SECONDS = 30


class DashScopeUploadUrlRequest(BaseModel):
    filename: str = Field(..., description="Original filename with extension")
    content_type: str = Field(default="audio/mpeg", description="MIME type")


class DashScopeUploadUrlResponse(BaseModel):
    ok: bool = True
    upload_url: str
    upload_host: str
    upload_dir: str
    oss_fields: dict[str, Any]
    file_id: str
    expires_in_seconds: int


@dataclass
class _PolicyError(Exception):
    status_code: int
    error_code: str
    message: str
    detail: str = ""


def _require_api_key() -> str:
    api_key = str(DASHSCOPE_API_KEY or "").strip()
    if api_key:
        return api_key
    raise _PolicyError(
        status_code=503,
        error_code="ASR_API_KEY_MISSING",
        message="Bottle 2.0 未配置 DASHSCOPE_API_KEY",
        detail="DASHSCOPE_API_KEY is empty",
    )


def _request_policy(*, api_key: str) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    params = {
        "action": "getPolicy",
        "model": "qwen-audio",
    }
    try:
        resp = requests.get(
            POLICY_ENDPOINT,
            headers=headers,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise _PolicyError(
            status_code=502,
            error_code="DASHSCOPE_POLICY_REQUEST_FAILED",
            message="请求云端上传策略失败",
            detail=str(exc)[:500],
        ) from exc

    try:
        payload = resp.json()
    except Exception as exc:
        raise _PolicyError(
            status_code=502,
            error_code="DASHSCOPE_POLICY_INVALID_RESPONSE",
            message="云端上传策略响应格式错误",
            detail=f"HTTP {resp.status_code}, body={resp.text[:300]}",
        ) from exc

    if resp.status_code >= 400:
        sub_code = str(payload.get("code") or f"HTTP_{resp.status_code}").strip()
        sub_message = str(payload.get("message") or "DashScope policy request failed").strip()
        raise _PolicyError(
            status_code=502,
            error_code="DASHSCOPE_POLICY_FAILED",
            message="获取云端上传策略失败",
            detail=f"{sub_code}: {sub_message}",
        )

    data = payload.get("data")
    if not isinstance(data, dict):
        raise _PolicyError(
            status_code=502,
            error_code="DASHSCOPE_POLICY_INVALID_RESPONSE",
            message="云端上传策略响应缺少 data",
            detail=str(payload)[:500],
        )
    return data


@router.post(
    "/request-url",
    response_model=DashScopeUploadUrlResponse,
    responses={
        401: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
def request_dashscope_upload_url(
    payload: DashScopeUploadUrlRequest,
    current_user: User = Depends(get_current_user),
):
    _ = payload
    try:
        api_key = _require_api_key()
        data = _request_policy(api_key=api_key)
        upload_host = str(data.get("upload_host") or "").strip()
        upload_dir = str(data.get("upload_dir") or "").strip()
        oss_fields = data.get("oss_fields") or {}
        expires_in = int(data.get("expires_in_seconds") or data.get("expires_in") or 3600)
        if not upload_host or not upload_dir:
            raise _PolicyError(
                status_code=502,
                error_code="DASHSCOPE_POLICY_INVALID_RESPONSE",
                message="云端上传策略缺少 upload_host 或 upload_dir",
                detail=str(data)[:500],
            )
        upload_url = f"{upload_host.rstrip('/')}/{upload_dir.lstrip('/')}"
        logger.info(
            "[DEBUG] dashscope_upload.policy_ok user_id=%s upload_dir=%s",
            current_user.id,
            upload_dir,
        )
        return DashScopeUploadUrlResponse(
            ok=True,
            upload_url=upload_url,
            upload_host=upload_host,
            upload_dir=upload_dir,
            oss_fields=dict(oss_fields) if isinstance(oss_fields, dict) else {},
            file_id=upload_dir,
            expires_in_seconds=max(1, expires_in),
        )
    except _PolicyError as exc:
        logger.warning(
            "[DEBUG] dashscope_upload.policy_fail user_id=%s code=%s detail=%s",
            getattr(current_user, "id", "unknown"),
            exc.error_code,
            exc.detail,
        )
        return error_response(exc.status_code, exc.error_code, exc.message, exc.detail)

