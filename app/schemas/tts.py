"""Pydantic schemas for TTS and voice cloning."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class VoiceProfileResponse(BaseModel):
    """Response schema for a voice profile."""
    voice: str = Field(description="Voice name from the API")
    preferred_name: str = Field(description="User-friendly name")
    target_model: str = Field(description="Target TTS model")
    language: str | None = Field(None, description="Audio language")
    gmt_create: datetime = Field(description="Creation timestamp")
    gmt_used: datetime | None = Field(None, description="Last used timestamp")
    is_custom: bool = Field(True, description="Whether this is a custom voice")

    class Config:
        from_attributes = True


class VoiceProfileListResponse(BaseModel):
    """Response schema for listing voice profiles."""
    ok: bool = True
    voices: list[VoiceProfileResponse] = Field(default_factory=list)
    total: int = Field(0, description="Total number of voices")


class TTSRequest(BaseModel):
    """Request schema for TTS synthesis."""
    text: str = Field(..., min_length=1, max_length=2000, description="Text to synthesize")
    voice: str = Field(..., description="Voice name")
    model: str | None = Field(None, description="TTS model (optional)")
    language_type: str | None = Field("Auto", description="Language hint")


class TTSResponse(BaseModel):
    """Response schema for TTS synthesis."""
    ok: bool = True
    audio_url: str | None = Field(None, description="Audio file URL (valid for 24 hours)")
    model: str = Field(description="Model used")
    voice: str = Field(description="Voice used")
    characters: int = Field(0, description="Input characters count")
    finish_reason: str | None = Field(None, description="Finish reason")


class VoiceInfoResponse(BaseModel):
    """Response schema for voice info."""
    voice: str
    name: str
    language: str | None = None
    target_model: str | None = None
    is_custom: bool = False
    is_platform: bool = False


class VoiceListResponse(BaseModel):
    """Response schema for available voices list."""
    ok: bool = True
    voices: list[VoiceInfoResponse] = Field(default_factory=list)
    total: int = Field(0, description="Total number of voices")


class CreateVoiceRequest(BaseModel):
    """Request schema for creating a voice profile."""
    preferred_name: str = Field(
        ...,
        min_length=1,
        max_length=16,
        pattern=r"^[a-zA-Z0-9_]+$",
        description="User-friendly name (alphanumeric + underscore, max 16 chars)"
    )
    target_model: str | None = Field(
        None,
        description="Target TTS model (defaults to qwen3-tts-vc-2026-01-22)"
    )
    language: str | None = Field(
        None,
        description="Audio language (zh, en, de, it, pt, es, ja, ko, fr, ru)"
    )


class CreateVoiceResponse(BaseModel):
    """Response schema for creating a voice profile."""
    ok: bool = True
    voice: str = Field(description="Created voice name")
    preferred_name: str = Field(description="Preferred name")
    target_model: str = Field(description="Target model used")
    message: str = Field("音色创建成功")
