"""DashScope pre-signed upload URL router.

前端云端 ASR 直传流程：
1. POST /api/dashscope-upload/request-url  →  返回 upload_host / upload_dir / oss_fields / file_id
2. 前端直接 PUT 上传到 upload_host（携带 oss_fields 作为 form-data）
3. 上传完成后，将返回的 file_id 随课程创建请求提交

file_id 说明：
DashScope OSS 的 policy 模式下，file_id 在上传完成后才由服务器分配，
因此步骤 1 返回的 file_id 实为 upload_dir（OSS 对象路径），前端 PUT 时记录此路径，
PUT 成功后再将 upload_dir 作为 dashscope_file_id 提交给后端。
"""
from __future__ import annotations

import logging

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps.auth import get_current_user
from app.core.config import DASHSCOPE_API_KEY
from app.infra.asr_dashscope import setup_dashscope
from app.models import User


router = APIRouter(prefix="/api/dashscope-upload", tags=["dashscope-upload"])
logger = logging.getLogger(__name__)

# DashScope base URL (mirrors setup_dashscope in infra)
DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/api/v1"
POLICY_ENDPOINT = f"{DASHSCOPE_BASE_URL}/uploads"
REQUEST_TIMEOUT_SECONDS = 30


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class DashScopeUploadUrlRequest(BaseModel):
    filename: str = Field(..., description="原始文件名（含扩展名）")
    content_type: str = Field(default="audio/mpeg", description="文件的 MIME 类型")


class DashScopeUploadUrlResponse(BaseModel):
    ok: bool = True
    upload_url: str = Field(..., description="前端 PUT 目标地址（upload_host + upload_dir）")
    upload_host: str = Field(..., description="OSS 上传 Host")
    upload_dir: str = Field(..., description="OSS 对象路径（用作 file_id）")
    oss_fields: dict = Field(..., description="OSS 表单上传字段（OSSAccessKeyId、policy、signature 等）")
    file_id: str = Field(..., description="文件标识（与 upload_dir 相同，PUT 后用于提交给后端）")
    expires_in_seconds: int = Field(..., description="上传凭证有效期（秒）")


class DashScopeUploadErrorResponse(BaseModel):
    ok: bool = False
    error_code: str
    message: str
    detail: str = ""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _ensure_dashscope_key() -> str:
    key = str(DASHSCOPE_API_KEY or "").strip()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="DASHSCOPE_API_KEY 未配置，pre-signed upload 不可用",
        )
    return key


def _call_get_policy(api_key: str, filename: str, content_type: str) -> dict:
    """Call DashScope GET /api/v1/uploads?action=getPolicy.

    Returns the parsed JSON dict from the API. Raises HTTPException on failure.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    params = {
        "action": "getPolicy",
        "model": "qwen-audio",  # 固定使用 qwen-audio ASR 模型对应的存储桶
    }

    try:
        resp = requests.get(
            POLICY_ENDPOINT,
            headers=headers,
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.warning("[DEBUG] dashscope_upload.policy_request_failed exc=%s", str(exc)[:300])
        raise HTTPException(
            status_code=502,
            detail=f"DashScope 上传策略请求失败: {str(exc)[:300]}",
        ) from exc

    status = resp.status_code
    try:
        payload = resp.json()
    except Exception:
        raise HTTPException(
            status_code=502,
            detail=f"DashScope 返回非 JSON（HTTP {status}）: {resp.text[:300]}",
        )

    # DashScope 错误格式：{ "code": "...", "message": "..." }
    if status >= 400:
        code = str(payload.get("code") or f"HTTP_{status}")
        message = str(payload.get("message") or "获取上传策略失败")
        logger.warning(
            "[DEBUG] dashscope_upload.policy_error status=%s code=%s message=%s",
            status,
            code,
            message,
        )
        raise HTTPException(
            status_code=502,
            detail=f"DashScope 上传策略错误: {code} {message}",
        )

    # 正常返回：{ "data": { "upload_dir": "...", "upload_host": "...", "oss_fields": {...}, ... } }
    data = payload.get("data")
    if not data:
        raise HTTPException(
            status_code=502,
            detail=f"DashScope 上传策略响应缺少 data 字段: {payload}",
        )

    return data


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post(
    "/request-url",
    response_model=DashScopeUploadUrlResponse,
    responses={
        401: {"model": DashScopeUploadErrorResponse},
        502: {"model": DashScopeUploadErrorResponse},
        503: {"model": DashScopeUploadErrorResponse},
    },
    name="request_dashscope_upload_url",
)
def request_dashscope_upload_url(
    payload: DashScopeUploadUrlRequest,
    current_user: User = Depends(get_current_user),
) -> DashScopeUploadUrlResponse:
    """获取 DashScope OSS pre-signed upload URL。

    前端收到响应后，直接 PUT 文件到 `upload_url`（body = 原始文件二进制，
    headers["Content-Type"] = content_type），PUT 成功后将 `file_id` 字段
    随 `/api/lessons/tasks` 请求一起提交。
    """
    api_key = _ensure_dashscope_key()

    # 确保 dashscope SDK 已初始化（与 main.py startup 保持一致）
    try:
        setup_dashscope(api_key)
    except Exception as exc:
        logger.warning("[DEBUG] dashscope_upload.setup_dashscope failed: %s", str(exc)[:200])

    data = _call_get_policy(api_key, payload.filename, payload.content_type)

    # 提取关键字段
    upload_host = str(data.get("upload_host") or "").strip()
    upload_dir = str(data.get("upload_dir") or "").strip()
    oss_fields: dict = data.get("oss_fields") or {}
    expires_in = int(data.get("expires_in_seconds") or data.get("expires_in") or 3600)

    if not upload_host or not upload_dir:
        logger.warning("[DEBUG] dashscope_upload.invalid_policy_response data_keys=%s", list(data.keys()))
        raise HTTPException(
            status_code=502,
            detail=f"DashScope 上传策略响应缺少 upload_host 或 upload_dir: {data}",
        )

    # 构造 upload_url：前端 PUT 到这个地址
    upload_url = f"{upload_host.rstrip('/')}/{upload_dir.lstrip('/')}"

    logger.info(
        "[DEBUG] dashscope_upload.request_ok user_id=%s upload_dir=%s",
        current_user.id,
        upload_dir,
    )

    return DashScopeUploadUrlResponse(
        ok=True,
        upload_url=upload_url,
        upload_host=upload_host,
        upload_dir=upload_dir,
        oss_fields=dict(oss_fields),
        file_id=upload_dir,  # upload_dir 即为 file_id
        expires_in_seconds=expires_in,
    )
