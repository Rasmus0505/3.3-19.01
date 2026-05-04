"""Abstract base class and data structures for OCR providers."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class OCRWordInfo:
    """Single OCR word or line with optional location metadata."""

    text: str
    location: list[float] = field(default_factory=list)
    rotate_rect: list[float] = field(default_factory=list)


@dataclass
class OCRConfig:
    """Configuration for OCR extraction."""

    model_name: str = "qwen-vl-ocr-latest"
    prompt: str = ""
    min_pixels: int = 32 * 32 * 3
    max_pixels: int = 32 * 32 * 8192
    enable_rotate: bool = False
    max_tokens: int | None = None
    temperature: float = 0.01
    top_p: float = 0.001
    seed: int | None = None
    task: str | None = None
    task_config: dict[str, Any] | None = None
    request_timeout: int = 180


@dataclass
class OCRResult:
    """OCR extraction result."""

    text: str = ""
    structured_result: dict[str, Any] | None = None
    words_info: list[OCRWordInfo] = field(default_factory=list)
    provider: str = ""
    model: str = ""
    request_id: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    image_tokens: int = 0
    raw_result: dict[str, Any] | None = None


class OCRProvider(ABC):
    """Abstract base class for OCR providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return provider name."""
        pass

    @abstractmethod
    def extract(
        self,
        image_source: str,
        config: OCRConfig | None = None,
    ) -> OCRResult:
        """Extract text or structured data from an image."""
        pass

    @abstractmethod
    def supports_model(self, model_name: str) -> bool:
        """Check whether this provider supports the given model."""
        pass

    @abstractmethod
    def _default_model_name(self) -> str:
        """Return the default model name for this provider."""
        pass

    def get_default_config(self) -> OCRConfig:
        """Return the default configuration."""
        return OCRConfig(model_name=self._default_model_name())


__all__ = [
    "OCRConfig",
    "OCRProvider",
    "OCRResult",
    "OCRWordInfo",
]
