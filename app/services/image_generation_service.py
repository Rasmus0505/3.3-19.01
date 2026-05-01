"""Service layer for image generation operations."""
from __future__ import annotations

from typing import Optional

from app.core.config import (
    QWEN_IMAGE_DEFAULT_SIZE,
    QWEN_IMAGE_MODEL,
)
from app.infra.image_generation import (
    ImageGenerationConfig,
    ImageGenerationError,
    ImageGenerationResult,
)
from app.services.ai_platform import AiPlatformError, generate_image_asset


class ImageGenerationServiceError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = str(code or "IMAGE_GENERATION_SERVICE_ERROR").strip() or "IMAGE_GENERATION_SERVICE_ERROR"


def get_default_image_generation_config() -> ImageGenerationConfig:
    """Build the default image generation config from app settings."""
    return ImageGenerationConfig(
        model_name=QWEN_IMAGE_MODEL,
        size=QWEN_IMAGE_DEFAULT_SIZE,
        image_count=1,
        prompt_extend=True,
        watermark=False,
    )


def generate_image(
    prompt: str,
    *,
    config: Optional[ImageGenerationConfig] = None,
    api_key: Optional[str] = None,
) -> ImageGenerationResult:
    """Generate images without exposing provider-specific details to callers."""
    try:
        effective_config = config or get_default_image_generation_config()
        return generate_image_asset(
            prompt=prompt,
            model_key=effective_config.model_name,
            size=effective_config.size,
            image_count=effective_config.image_count,
            api_key=api_key,
        )
    except (ImageGenerationError, AiPlatformError) as exc:
        raise ImageGenerationServiceError(exc.code, exc.message) from exc


__all__ = [
    "ImageGenerationServiceError",
    "generate_image",
    "get_default_image_generation_config",
]
