"""DashScope TTS provider implementation with voice cloning support."""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Any, Generator, Optional

import dashscope
import requests

from app.core.config import TTS_VC_ENROLLMENT_MODEL, TTS_VC_REALTIME_MODEL, TTS_VC_TARGET_MODEL
from app.infra.tts.base import (
    TTSConfig,
    TTSProvider,
    TTSResult,
    VoiceCloningResult,
)


class TTSError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail


def setup_dashscope(api_key: str) -> None:
    """Initialize DashScope API key and base URL."""
    dashscope.api_key = (api_key or "").strip()
    dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"


def _ensure_dashscope_api_key() -> str:
    api_key = str(getattr(dashscope, "api_key", "") or "").strip()
    if api_key:
        return api_key
    raise TTSError("TTS_API_KEY_MISSING", "DASHSCOPE_API_KEY 未配置")


def _get_default_api_key() -> str:
    from app.core.config import DASHSCOPE_API_KEY
    return DASHSCOPE_API_KEY


def _to_dict(value: Any) -> dict[str, Any]:
    """Convert response object to dict."""
    if isinstance(value, dict):
        return value
    if hasattr(value, "to_dict"):
        try:
            res = value.to_dict()
            if isinstance(res, dict):
                return res
        except Exception:
            pass
    if value is None:
        return {}
    try:
        return json.loads(json.dumps(value, ensure_ascii=False, default=str))
    except Exception:
        return {"raw": str(value)}


def _audio_file_to_data_uri(file_path: str, mime_type: str = "audio/mpeg") -> str:
    """Convert audio file to base64 data URI."""
    path = Path(file_path)
    if not path.exists():
        raise TTSError("AUDIO_FILE_NOT_FOUND", f"音频文件不存在: {file_path}")
    base64_str = base64.b64encode(path.read_bytes()).decode()
    return f"data:{mime_type};base64,{base64_str}"


# Voice Cloning APIs

def create_voice(
    audio_file_path: str,
    preferred_name: str,
    target_model: str = TTS_VC_TARGET_MODEL,
    language: Optional[str] = None,
    api_key: Optional[str] = None,
) -> VoiceCloningResult:
    """Create a voice profile from audio file.

    Args:
        audio_file_path: Path to the audio file (10-60 seconds, 24kHz, mono)
        preferred_name: User-friendly name for the voice (max 16 chars, alphanumeric + underscore)
        target_model: Target TTS model (must match the synthesis model later)
        language: Audio language (zh, en, de, it, pt, es, ja, ko, fr, ru)
        api_key: Optional API key override

    Returns:
        VoiceCloningResult with voice name and metadata
    """
    key = api_key or _get_default_api_key() or _ensure_dashscope_api_key()

    url = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization"
    payload = {
        "model": TTS_VC_ENROLLMENT_MODEL,
        "input": {
            "action": "create",
            "target_model": target_model,
            "preferred_name": preferred_name,
            "audio": {
                "data": _audio_file_to_data_uri(audio_file_path)
            }
        }
    }

    if language:
        payload["input"]["language"] = language

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=120)
    if resp.status_code != 200:
        raise TTSError(
            "VOICE_CLONE_FAILED",
            f"创建音色失败: {resp.status_code}",
            resp.text[:500]
        )

    try:
        data = resp.json()
        output = data.get("output", {})
        return VoiceCloningResult(
            voice=output.get("voice", ""),
            target_model=output.get("target_model", target_model),
            request_id=data.get("request_id", ""),
            raw_result=data,
        )
    except Exception as e:
        raise TTSError("VOICE_CLONE_PARSE_ERROR", f"解析音色响应失败: {e}", resp.text[:500])


def list_voices(
    page_size: int = 10,
    page_index: int = 0,
    api_key: Optional[str] = None,
) -> list[dict[str, Any]]:
    """List voice profiles.

    Args:
        page_size: Number of results per page
        page_index: Page index (0-based)
        api_key: Optional API key override

    Returns:
        List of voice profile dicts
    """
    key = api_key or _get_default_api_key() or _ensure_dashscope_api_key()

    url = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization"
    payload = {
        "model": TTS_VC_ENROLLMENT_MODEL,
        "input": {
            "action": "list",
            "page_size": page_size,
            "page_index": page_index,
        }
    }

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=30)
    if resp.status_code != 200:
        raise TTSError("VOICE_LIST_FAILED", f"查询音色列表失败: {resp.status_code}", resp.text[:500])

    data = resp.json()
    return data.get("output", {}).get("voice_list", [])


def delete_voice(
    voice_name: str,
    api_key: Optional[str] = None,
) -> bool:
    """Delete a voice profile.

    Args:
        voice_name: The voice name to delete
        api_key: Optional API key override

    Returns:
        True if deleted successfully
    """
    key = api_key or _get_default_api_key() or _ensure_dashscope_api_key()

    url = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization"
    payload = {
        "model": TTS_VC_ENROLLMENT_MODEL,
        "input": {
            "action": "delete",
            "voice": voice_name,
        }
    }

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=30)
    if resp.status_code != 200:
        raise TTSError("VOICE_DELETE_FAILED", f"删除音色失败: {resp.status_code}", resp.text[:500])
    return True


# TTS Synthesis APIs

def synthesize_text(
    text: str,
    voice: str,
    model: str = TTS_VC_TARGET_MODEL,
    language_type: str = "Auto",
    stream: bool = False,
    api_key: Optional[str] = None,
) -> TTSResult:
    """Synthesize speech from text using DashScope API.

    Args:
        text: Text to synthesize (max 512 tokens for qwen-tts, 600 chars for others)
        voice: Voice name (from cloning or system preset)
        model: TTS model name
        language_type: Language hint (Auto, Chinese, English, etc.)
        stream: Whether to return streaming result
        api_key: Optional API key override

    Returns:
        TTSResult with audio URL or data
    """
    key = api_key or _get_default_api_key()

    dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

    response = dashscope.MultiModalConversation.call(
        model=model,
        api_key=key,
        text=text,
        voice=voice,
        language_type=language_type,
        stream=stream,
    )

    raw = _to_dict(response)
    status_code = raw.get("status_code", 200)

    if status_code >= 400:
        raise TTSError(
            "TTS_SYNTHESIS_FAILED",
            f"语音合成失败: {raw.get('code', 'Unknown')}",
            raw.get("message", ""),
        )

    audio_info = raw.get("output", {}).get("audio", {})
    usage_info = raw.get("usage", {})

    return TTSResult(
        audio_url=audio_info.get("url"),
        audio_data=audio_info.get("data"),
        model=model,
        voice=voice,
        characters=usage_info.get("characters", 0),
        finish_reason=raw.get("output", {}).get("finish_reason"),
        provider="dashscope",
        raw_result=raw,
    )


def synthesize_text_stream(
    text: str,
    voice: str,
    model: str = TTS_VC_TARGET_MODEL,
    language_type: str = "Auto",
    api_key: Optional[str] = None,
) -> Generator[dict[str, Any], None, None]:
    """Synthesize speech from text with streaming (yields base64 audio chunks).

    Args:
        text: Text to synthesize
        voice: Voice name
        model: TTS model name
        language_type: Language hint
        api_key: Optional API key override

    Yields:
        dict with audio chunks and metadata
    """
    key = api_key or _get_default_api_key()

    dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

    response = dashscope.MultiModalConversation.call(
        model=model,
        api_key=key,
        text=text,
        voice=voice,
        language_type=language_type,
        stream=True,
    )

    for chunk in response:
        chunk_dict = _to_dict(chunk)
        yield chunk_dict


class DashScopeTTSProvider(TTSProvider):
    """DashScope TTS provider implementation."""

    def __init__(self, api_key: Optional[str] = None):
        if api_key:
            setup_dashscope(api_key)

    @property
    def provider_name(self) -> str:
        return "dashscope"

    def _default_model_name(self) -> str:
        return TTS_VC_TARGET_MODEL

    def synthesize(
        self,
        text: str,
        config: Optional[TTSConfig] = None,
    ) -> TTSResult:
        if config is None:
            config = self.get_default_config()

        return synthesize_text(
            text=text,
            voice=config.voice,
            model=config.model_name,
            language_type=config.language_type,
            stream=config.stream,
        )

    def synthesize_stream(
        self,
        text: str,
        config: Optional[TTSConfig] = None,
    ):
        if config is None:
            config = self.get_default_config()

        return synthesize_text_stream(
            text=text,
            voice=config.voice,
            model=config.model_name,
            language_type=config.language_type,
        )


__all__ = [
    "TTSError",
    "setup_dashscope",
    "create_voice",
    "list_voices",
    "delete_voice",
    "synthesize_text",
    "synthesize_text_stream",
    "DashScopeTTSProvider",
]
