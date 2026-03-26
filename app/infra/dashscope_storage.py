"""DashScope file storage utilities.

Provides utilities to interact with DashScope OSS storage:
- Get signed URL for a file already uploaded to DashScope
- Verify file existence in DashScope
"""
from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import quote, unquote, urlsplit, urlunsplit

import dashscope
from dashscope.files import Files

from app.infra.asr_dashscope import (
    AsrError,
    _call_with_optional_request_timeout,
    _resolve_signed_url,
    _to_dict,
)

logger = logging.getLogger(__name__)


def normalize_dashscope_file_url(file_url: str) -> str:
    normalized = str(file_url or "").strip()
    if not normalized.startswith(("http://", "https://")):
        return normalized

    try:
        parts = urlsplit(normalized)
    except Exception:
        return normalized

    path = str(parts.path or "")
    if not path:
        return normalized

    encoded_segments: list[str] = []
    for segment in path.split("/"):
        if not segment:
            encoded_segments.append("")
            continue
        try:
            encoded_segments.append(quote(unquote(segment), safe="!$&'()*+,;=:@"))
        except Exception:
            encoded_segments.append(quote(segment, safe="!$&'()*+,;=:@"))

    normalized_path = "/".join(encoded_segments)
    return urlunsplit((parts.scheme, parts.netloc, normalized_path, parts.query, parts.fragment))


def _ensure_dashscope_api_key() -> str:
    api_key = str(getattr(dashscope, "api_key", "") or "").strip()
    if api_key:
        return api_key
    raise AsrError("ASR_API_KEY_MISSING", "DASHSCOPE_API_KEY 未配置")


def _resolve_signed_url_from_meta(meta_out: dict[str, Any]) -> str:
    candidate = _resolve_signed_url(meta_out)
    if candidate:
        return normalize_dashscope_file_url(candidate)

    direct_candidates = (
        "signed_url",
        "file_url",
        "download_url",
        "http_url",
    )
    for key in direct_candidates:
        value = str(meta_out.get(key) or "").strip()
        if value:
            return normalize_dashscope_file_url(value)

    nested_candidates = meta_out.get("file")
    if isinstance(nested_candidates, dict):
        nested_candidate = _resolve_signed_url(nested_candidates)
        if nested_candidate:
            return normalize_dashscope_file_url(nested_candidate)
        for key in direct_candidates:
            value = str(nested_candidates.get(key) or "").strip()
            if value:
                return normalize_dashscope_file_url(value)

    urls_payload = meta_out.get("urls")
    if isinstance(urls_payload, dict):
        for key in ("signed", "https", "http", "url"):
            value = str(urls_payload.get(key) or "").strip()
            if value:
                return normalize_dashscope_file_url(value)
    elif isinstance(urls_payload, list):
        for item in urls_payload:
            if isinstance(item, dict):
                nested_candidate = _resolve_signed_url(item)
                if nested_candidate:
                    return normalize_dashscope_file_url(nested_candidate)
                for key in direct_candidates:
                    value = str(item.get(key) or "").strip()
                    if value:
                        return normalize_dashscope_file_url(value)
            else:
                value = str(item or "").strip()
                if value:
                    return normalize_dashscope_file_url(value)

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
    if file_id.startswith(("http://", "https://")):
        return normalize_dashscope_file_url(file_id)

    try:
        meta_resp = _call_with_optional_request_timeout(
            Files.get,
            file_id=file_id,
            request_timeout=request_timeout,
        )
    except Exception as exc:
        raise AsrError("DASHSCOPE_STORAGE_FILE_GET_FAILED", "查询 DashScope 文件失败", str(exc)[:1200]) from exc

    meta_output = _to_dict(getattr(meta_resp, "output", None))
    meta_full = _to_dict(meta_resp)
    candidate_payloads: list[dict[str, Any]] = []
    for payload in (
        meta_output,
        _to_dict(meta_full.get("output")) if isinstance(meta_full, dict) else {},
        _to_dict(meta_full.get("data")) if isinstance(meta_full, dict) else {},
        _to_dict(meta_full.get("result")) if isinstance(meta_full, dict) else {},
        _to_dict(meta_full.get("file")) if isinstance(meta_full, dict) else {},
        meta_full if isinstance(meta_full, dict) else {},
    ):
        if isinstance(payload, dict) and payload:
            candidate_payloads.append(payload)

    for payload in candidate_payloads:
        signed_url = _resolve_signed_url_from_meta(payload)
        if signed_url:
            return signed_url

    # Some SDK/API combinations only expose usable fields when flattened_output is enabled.
    try:
        flat_resp = _call_with_optional_request_timeout(
            Files.get,
            file_id=file_id,
            request_timeout=request_timeout,
            flattened_output=True,
        )
    except Exception:
        flat_resp = {}
    flat_payload = _to_dict(flat_resp)
    flat_signed_url = _resolve_signed_url_from_meta(flat_payload)
    if flat_signed_url:
        return flat_signed_url

    # Some DashScope file-meta responses do not expose signed URLs directly.
    # Do not silently fallback to oss:// because Qwen ASR may fail with
    # FILE_DOWNLOAD_FAILED for non-public objects.
    detail = json.dumps(
        {
            "file_id": file_id,
            "meta_output_keys": sorted(list(meta_output.keys())),
            "meta_full_keys": sorted(list(meta_full.keys())) if isinstance(meta_full, dict) else [],
            "flat_keys": sorted(list(flat_payload.keys())) if isinstance(flat_payload, dict) else [],
        },
        ensure_ascii=False,
    )
    logger.warning(
        "[DEBUG] dashscope_storage.signed_url_missing file_id=%s output_keys=%s full_keys=%s flat_keys=%s",
        file_id,
        sorted(list(meta_output.keys())),
        sorted(list(meta_full.keys())) if isinstance(meta_full, dict) else [],
        sorted(list(flat_payload.keys())) if isinstance(flat_payload, dict) else [],
    )
    raise AsrError(
        "DASHSCOPE_STORAGE_SIGNED_URL_MISSING",
        "未获取到可用的 DashScope 文件下载地址",
        detail[:1200],
    )


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
