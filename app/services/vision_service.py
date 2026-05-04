"""Service layer for image understanding operations."""
from __future__ import annotations

from app.core.config import QWEN_VISION_MODEL, QWEN_VISION_TIMEOUT_SECONDS
from app.infra.vision import VisionConfig, VisionError, VisionResult
from app.services.ai_platform import AiPlatformError
from app.services.ai_platform import analyze_image as analyze_image_via_platform


class VisionServiceError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = str(code or "VISION_SERVICE_ERROR").strip() or "VISION_SERVICE_ERROR"


def get_default_vision_config(*, prompt: str = "") -> VisionConfig:
    """Build the default vision config from app settings."""
    return VisionConfig(
        model_name=QWEN_VISION_MODEL,
        prompt=prompt,
        request_timeout=QWEN_VISION_TIMEOUT_SECONDS,
        enable_thinking=False,
    )


def analyze_image_with_qwen(
    image_source: str,
    *,
    prompt: str = "",
    config: VisionConfig | None = None,
    api_key: str | None = None,
) -> VisionResult:
    """Analyze an image without exposing provider-specific details to callers."""
    try:
        effective_config = config or get_default_vision_config(prompt=prompt)
        return analyze_image_via_platform(
            image_source=image_source,
            prompt=effective_config.prompt,
            model_key=effective_config.model_name,
            api_key=api_key,
        )
    except (VisionError, AiPlatformError) as exc:
        raise VisionServiceError(exc.code, exc.message) from exc


__all__ = [
    "VisionServiceError",
    "analyze_image_with_qwen",
    "get_default_vision_config",
]
