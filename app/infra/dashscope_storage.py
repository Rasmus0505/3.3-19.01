"""DashScope file storage utilities.

Provides utilities to interact with DashScope OSS storage:
- Get signed URL for a file already uploaded to DashScope
- Verify file existence in DashScope
"""
from __future__ import annotations

import logging

import dashscope
from dashscope.files import Files

from app.infra.asr_dashscope import (
    AsrError,
    _call_with_optional_request_timeout,
    _resolve_signed_url,
    _to_dict,
)

logger = logging.getLogger(__name__)


def _ensure_dashscope_api_key() -> str:
    api_key = str(getattr(dashscope, "api_key", "") or "").strip()
    if api_key:
        return api_key
    raise AsrError("ASR_API_KEY_MISSING", "DASHSCOPE_API_KEY 未配置")


def get_file_signed_url(file_id: str, *, request_timeout: int = 30) -> str:
    """Get a pre-signed URL for a file already uploaded to DashScope OSS.

    Args:
        file_id: The DashScope OSS object path (e.g. "uploads/20240115/xxx.mp4").
                 This is the upload_dir returned by the pre-signed upload flow.
        request_timeout: Request timeout in seconds.

    Returns:
        Pre-signed URL that can be passed to QwenTranscription for inference.

    Raises:
        AsrError: If the API key is missing or the file lookup fails.
    """
    _ensure_dashscope_api_key()
    file_id = str(file_id or "").strip()
    if not file_id:
        raise AsrError("DASHSCOPE_STORAGE_INVALID_FILE_ID", "file_id 不能为空", "")

    try:
        meta_resp = _call_with_optional_request_timeout(
            Files.get,
            file_id=file_id,
            request_timeout=request_timeout,
        )
    except Exception as exc:
        raise AsrError("DASHSCOPE_STORAGE_FILE_GET_FAILED", "查询 DashScope 文件失败", str(exc)[:1200]) from exc

    meta_out = _to_dict(getattr(meta_resp, "output", None))
    signed_url = _resolve_signed_url(meta_out)
    if not signed_url:
        raise AsrError(
            "DASHSCOPE_STORAGE_SIGNED_URL_MISSING",
            "查询文件成功但签名 URL 为空",
            f"file_id={file_id}",
        )
    return signed_url


def verify_file_exists(file_id: str, *, request_timeout: int = 30) -> bool:
    """Verify that a file exists in DashScope OSS.

    Args:
        file_id: The DashScope OSS object path.
        request_timeout: Request timeout in seconds.

    Returns:
        True if the file exists, False otherwise.
    """
    try:
        _ensure_dashscope_api_key()
    except AsrError:
        return False

    file_id = str(file_id or "").strip()
    if not file_id:
        return False

    try:
        meta_resp = _call_with_optional_request_timeout(
            Files.get,
            file_id=file_id,
            request_timeout=request_timeout,
        )
        status_code = int(getattr(meta_resp, "status_code", 200) or 200)
        return status_code == 200
    except Exception:
        return False
