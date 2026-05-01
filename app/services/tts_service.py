"""TTS (Text-to-Speech) synthesis service."""
from __future__ import annotations

import json
from typing import Optional

from app.core.config import (
    TTS_PLATFORM_VOICES_JSON,
)
from app.infra.tts import TTSError as InfraTTSError, TTSResult
from app.infra.tts.base import VoiceInfo
from app.services.ai_platform import resolve_default_model, synthesize_tts


class TTSError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _parse_platform_voices() -> list[VoiceInfo]:
    """Parse platform predefined voices from JSON config."""
    if not TTS_PLATFORM_VOICES_JSON:
        return []
    try:
        voices_data = json.loads(TTS_PLATFORM_VOICES_JSON)
        if not isinstance(voices_data, list):
            return []
        return [
            VoiceInfo(
                voice=item.get("voice", ""),
                name=item.get("name", item.get("voice", "")),
                language=item.get("language"),
                target_model=item.get("target_model"),
                is_platform=True,
                is_custom=False,
            )
            for item in voices_data
            if item.get("voice")
        ]
    except Exception:
        return []


def get_available_voices() -> list[VoiceInfo]:
    """Get list of all available voices (platform + custom).

    Returns:
        List of VoiceInfo objects
    """
    platform_voices = _parse_platform_voices()
    return platform_voices


def synthesize_speech(
    text: str,
    voice: str,
    model: Optional[str] = None,
    language_type: str = "Auto",
) -> TTSResult:
    """Synthesize speech from text.

    Args:
        text: Text to synthesize
        voice: Voice name
        model: TTS model (defaults to TTS_VC_TARGET_MODEL)
        language_type: Language hint

    Returns:
        TTSResult with audio URL or data
    """
    if not model:
        model = resolve_default_model("tts")

    try:
        return synthesize_tts(
            text=text,
            voice=voice,
            model_key=model,
            language_type=language_type,
        )
    except InfraTTSError as e:
        raise TTSError("TTS_SYNTHESIS_FAILED", str(e))


def get_default_tts_model(is_realtime: bool = False) -> str:
    """Get the default TTS model.

    Args:
        is_realtime: Whether to use the realtime streaming model

    Returns:
        Model name
    """
    if is_realtime:
        return "qwen3-tts-vc-realtime-2026-01-15"
    return resolve_default_model("tts")


__all__ = [
    "TTSError",
    "get_available_voices",
    "synthesize_speech",
    "get_default_tts_model",
]
