"""Service layer for image understanding operations."""
from __future__ import annotations

from typing import Optional

from app.core.config import (
    DASHSCOPE_API_KEY,
    QWEN_VISION_MODEL,
    QWEN_VISION_TIMEOUT_SECONDS,
)
from app.infra.vision import QwenVisionProvider, VisionConfig, VisionError, VisionResult


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
    config: Optional[VisionConfig] = None,
    api_key: Optional[str] = None,
) -> VisionResult:
    """Analyze an image without exposing provider-specific details to callers."""
    provider = QwenVisionProvider(api_key=api_key or DASHSCOPE_API_KEY)
    try:
        return provider.analyze(image_source, config=config or get_default_vision_config(prompt=prompt))
    except VisionError as exc:
        raise VisionServiceError(exc.code, exc.message) from exc


__all__ = [
    "VisionServiceError",
    "analyze_image_with_qwen",
    "get_default_vision_config",
]
