"""Abstract base class and data structures for vision providers."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class VisionConfig:
    """Configuration for image understanding."""

    model_name: str = "qwen3-vl-flash"
    prompt: str = ""
    min_pixels: int = 65536
    max_pixels: int = 2621440
    enable_thinking: bool = False
    vl_high_resolution_images: bool = False
    max_tokens: Optional[int] = None
    temperature: float = 0.01
    top_p: float = 0.001
    seed: Optional[int] = None
    request_timeout: int = 45


@dataclass
class VisionResult:
    """Result of image understanding."""

    text: str = ""
    provider: str = ""
    model: str = ""
    request_id: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    image_tokens: int = 0
    raw_result: Optional[dict[str, Any]] = None


class VisionProvider(ABC):
    """Abstract base class for vision providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return provider name."""
        pass

    @abstractmethod
    def analyze(
        self,
        image_source: str,
        config: Optional[VisionConfig] = None,
    ) -> VisionResult:
        """Analyze an image and return text output."""
        pass

    @abstractmethod
    def supports_model(self, model_name: str) -> bool:
        """Check whether this provider supports the given model."""
        pass

    @abstractmethod
    def _default_model_name(self) -> str:
        """Return the default model name for this provider."""
        pass

    def get_default_config(self) -> VisionConfig:
        """Return the default configuration."""
        return VisionConfig(model_name=self._default_model_name())


__all__ = [
    "VisionConfig",
    "VisionProvider",
    "VisionResult",
]
