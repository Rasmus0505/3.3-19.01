"""Abstract base class for ASR providers."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ASRResult:
    """Result of ASR transcription."""
    text: str
    language: Optional[str] = None
    duration_seconds: Optional[float] = None
    segments: List[dict] = field(default_factory=list)
    provider: str = ""
    model: str = ""
    raw_result: Optional[dict] = None


@dataclass
class ASRConfig:
    """ASR configuration."""
    model_name: str
    language: Optional[str] = None
    requests_timeout: int = 120


class ASRProvider(ABC):
    """Abstract base class for ASR providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return provider name."""
        pass

    @abstractmethod
    def transcribe(
        self,
        audio_path: str,
        config: Optional[ASRConfig] = None,
    ) -> ASRResult:
        """
        Transcribe audio file.

        Args:
            audio_path: Path to audio file
            config: Optional ASR configuration

        Returns:
            ASRResult with transcribed text and segments
        """
        pass

    @abstractmethod
    def supports_model(self, model_name: str) -> bool:
        """Check if this provider supports the given model name."""
        pass

    def get_default_config(self) -> ASRConfig:
        """Return default configuration for this provider."""
        return ASRConfig(model_name=self._default_model_name())

    @abstractmethod
    def _default_model_name(self) -> str:
        """Return the default model name for this provider."""
        pass
