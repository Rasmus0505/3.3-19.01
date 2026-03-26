"""DashScope pre-signed upload policy router for Bottle 2.0 direct upload."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import PurePosixPath
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


def _normalize_filename(filename: str) -> str:
    normalized = str(filename or "").strip().replace("\\", "/")
    parts = [part for part in normalized.split("/") if part]
    return parts[-1] if parts else "upload.bin"


def _resolve_object_key(upload_dir: str, filename: str) -> str:
    normalized_dir = str(upload_dir or "").strip().replace("\\", "/").strip("/")
    normalized_name = _normalize_filename(filename)
    if not normalized_dir:
        return normalized_name
    if "${filename}" in normalized_dir:
        return normalized_dir.replace("${filename}", normalized_name)

    last_segment = normalized_dir.rsplit("/", 1)[-1]
    has_extension = "." in last_segment and not last_segment.endswith(".")
    if has_extension:
        return normalized_dir
    return str(PurePosixPath(normalized_dir) / normalized_name)


def _build_oss_fields(*, policy_data: dict[str, Any], object_key: str, content_type: str) -> dict[str, str]:
    normalized_fields: dict[str, str] = {}

    raw_fields = policy_data.get("oss_fields")
    if isinstance(raw_fields, dict):
        for key, value in raw_fields.items():
            if value is None:
                continue
            normalized_key = str(key or "").strip()
            if not normalized_key:
                continue
            normalized_fields[normalized_key] = str(value)

    alias_pairs: tuple[tuple[str, str], ...] = (
        ("oss_access_key_id", "OSSAccessKeyId"),
        ("signature", "Signature"),
        ("policy", "policy"),
        ("x_oss_object_acl", "x-oss-object-acl"),
        ("x_oss_forbid_overwrite", "x-oss-forbid-overwrite"),
        ("x_oss_security_token", "x-oss-security-token"),
        ("security_token", "x-oss-security-token"),
        ("x_oss_content_type", "x-oss-content-type"),
    )
    for source_key, target_key in alias_pairs:
        if target_key in normalized_fields:
            continue
        candidate = str(policy_data.get(source_key) or "").strip()
        if candidate:
            normalized_fields[target_key] = candidate

    if object_key and not str(normalized_fields.get("key") or "").strip():
        normalized_fields["key"] = object_key
    if content_type and not str(normalized_fields.get("x-oss-content-type") or "").strip():
        normalized_fields["x-oss-content-type"] = content_type
    if not str(normalized_fields.get("success_action_status") or "").strip():
        normalized_fields["success_action_status"] = "200"
    return normalized_fields


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
    try:
        api_key = _require_api_key()
        data = _request_policy(api_key=api_key)
        upload_host = str(data.get("upload_host") or "").strip()
        upload_dir = str(data.get("upload_dir") or "").strip()
        object_key = _resolve_object_key(upload_dir, payload.filename)
        oss_fields = _build_oss_fields(
            policy_data=data,
            object_key=object_key,
            content_type=str(payload.content_type or "").strip(),
        )
        expires_in = int(data.get("expires_in_seconds") or data.get("expires_in") or 3600)
        if not upload_host or not upload_dir:
            raise _PolicyError(
                status_code=502,
                error_code="DASHSCOPE_POLICY_INVALID_RESPONSE",
                message="云端上传策略缺少 upload_host 或 upload_dir",
                detail=str(data)[:500],
            )
        # DashScope policy upload uses form-data POST to upload_host.
        upload_url = upload_host.rstrip("/")
        logger.info(
            "[DEBUG] dashscope_upload.policy_ok user_id=%s upload_host=%s upload_dir=%s file_id=%s field_keys=%s",
            current_user.id,
            upload_host,
            upload_dir,
            object_key,
            sorted(list(oss_fields.keys())) if isinstance(oss_fields, dict) else [],
        )
        return DashScopeUploadUrlResponse(
            ok=True,
            upload_url=upload_url,
            upload_host=upload_host,
            upload_dir=upload_dir,
            oss_fields=dict(oss_fields) if isinstance(oss_fields, dict) else {},
            file_id=object_key or upload_dir,
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

