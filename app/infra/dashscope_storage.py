"""DashScope file storage utilities.

Provides utilities to interact with DashScope OSS storage:
- Get signed URL for a file already uploaded to DashScope
- Verify file existence in DashScope
"""
from __future__ import annotations

import logging
from typing import Any

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


def _resolve_signed_url_from_meta(meta_out: dict[str, Any]) -> str:
    candidate = _resolve_signed_url(meta_out)
    if candidate:
        return candidate

    direct_candidates = (
        "signed_url",
        "file_url",
        "download_url",
        "http_url",
    )
    for key in direct_candidates:
        value = str(meta_out.get(key) or "").strip()
        if value:
            return value

    nested_candidates = meta_out.get("file")
    if isinstance(nested_candidates, dict):
        nested_candidate = _resolve_signed_url(nested_candidates)
        if nested_candidate:
            return nested_candidate
        for key in direct_candidates:
            value = str(nested_candidates.get(key) or "").strip()
            if value:
                return value

    urls_payload = meta_out.get("urls")
    if isinstance(urls_payload, dict):
        for key in ("signed", "https", "http", "url"):
            value = str(urls_payload.get(key) or "").strip()
            if value:
                return value
    elif isinstance(urls_payload, list):
        for item in urls_payload:
            if isinstance(item, dict):
                nested_candidate = _resolve_signed_url(item)
                if nested_candidate:
                    return nested_candidate
                for key in direct_candidates:
                    value = str(item.get(key) or "").strip()
                    if value:
                        return value
            else:
                value = str(item or "").strip()
                if value:
                    return value

    return ""


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
    signed_url = _resolve_signed_url_from_meta(meta_out)
    if signed_url:
        return signed_url

    # Some DashScope file-meta responses do not expose signed URLs directly.
    # In that case, ASR APIs can still consume an oss:// object key.
    oss_url = f"oss://{file_id}"
    logger.warning(
        "[DEBUG] dashscope_storage.signed_url_missing file_id=%s meta_keys=%s fallback=%s",
        file_id,
        sorted(list(meta_out.keys())),
        oss_url,
    )
    return oss_url


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
