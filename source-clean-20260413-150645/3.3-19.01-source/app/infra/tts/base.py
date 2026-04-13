"""Abstract base class and data structures for TTS providers."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class TTSConfig:
    """Configuration for TTS synthesis."""

    model_name: str = "qwen3-tts-vc-2026-01-22"
    voice: str = ""
    language_type: str = "Auto"
    instructions: Optional[str] = None
    optimize_instructions: bool = False
    stream: bool = False
    request_timeout: int = 120


@dataclass
class TTSResult:
    """Result of TTS synthesis."""

    audio_url: Optional[str] = None
    audio_data: Optional[str] = None
    model: str = ""
    voice: str = ""
    characters: int = 0
    finish_reason: Optional[str] = None
    provider: str = ""
    raw_result: Optional[dict[str, Any]] = None


@dataclass
class VoiceCloningResult:
    """Result of voice cloning enrollment."""

    voice: str
    target_model: str
    request_id: str = ""
    raw_result: Optional[dict[str, Any]] = None


@dataclass
class VoiceInfo:
    """Information about a voice profile."""

    voice: str
    name: str
    language: Optional[str] = None
    target_model: Optional[str] = None
    is_custom: bool = False
    is_platform: bool = False


class TTSProvider(ABC):
    """Abstract base class for TTS providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return provider name."""
        pass

    @abstractmethod
    def _default_model_name(self) -> str:
        """Return the default model name for this provider."""
        pass

    @abstractmethod
    def synthesize(
        self,
        text: str,
        config: Optional[TTSConfig] = None,
    ) -> TTSResult:
        """Synthesize speech from text."""
        pass

    @abstractmethod
    def synthesize_stream(
        self,
        text: str,
        config: Optional[TTSConfig] = None,
    ):
        """Synthesize speech from text with streaming (yields audio chunks)."""
        pass

    def get_default_config(self) -> TTSConfig:
        """Return the default configuration."""
        return TTSConfig(model_name=self._default_model_name())


__all__ = [
    "TTSConfig",
    "TTSResult",
    "VoiceCloningResult",
    "VoiceInfo",
    "TTSProvider",
]
