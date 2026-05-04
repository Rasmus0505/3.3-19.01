"""Abstract base class and data structures for image generation providers."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class GeneratedImage:
    """A single generated image."""

    url: str


@dataclass
class ImageGenerationConfig:
    """Configuration for text-to-image generation."""

    model_name: str = "qwen-image-2.0-pro"
    size: str = "2048*2048"
    image_count: int = 1
    prompt_extend: bool = True
    watermark: bool = False
    negative_prompt: str | None = None
    seed: int | None = None
    request_timeout: int = 180


@dataclass
class ImageGenerationResult:
    """Result of image generation."""

    images: list[GeneratedImage] = field(default_factory=list)
    provider: str = ""
    model: str = ""
    request_id: str = ""
    width: int | None = None
    height: int | None = None
    raw_result: dict[str, Any] | None = None


class ImageGenerationProvider(ABC):
    """Abstract base class for image generation providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return provider name."""
        pass

    @abstractmethod
    def generate(
        self,
        prompt: str,
        config: ImageGenerationConfig | None = None,
    ) -> ImageGenerationResult:
        """Generate one or more images from a text prompt."""
        pass

    @abstractmethod
    def supports_model(self, model_name: str) -> bool:
        """Check whether this provider supports the given model."""
        pass

    @abstractmethod
    def _default_model_name(self) -> str:
        """Return the default model name for this provider."""
        pass

    def get_default_config(self) -> ImageGenerationConfig:
        """Return the default configuration."""
        return ImageGenerationConfig(model_name=self._default_model_name())


__all__ = [
    "GeneratedImage",
    "ImageGenerationConfig",
    "ImageGenerationProvider",
    "ImageGenerationResult",
]
