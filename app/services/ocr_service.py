"""Service layer for OCR operations."""
from __future__ import annotations

from app.core.config import (
    DASHSCOPE_API_KEY,
    QWEN_OCR_DEFAULT_MAX_PIXELS,
    QWEN_OCR_DEFAULT_MIN_PIXELS,
    QWEN_OCR_MODEL,
)
from app.infra.ocr import DashScopeOCRProvider, OCRConfig, OCRError, OCRResult


class OCRServiceError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = str(code or "OCR_SERVICE_ERROR").strip() or "OCR_SERVICE_ERROR"


def get_default_ocr_config() -> OCRConfig:
    """Build the default OCR config from app settings."""
    return OCRConfig(
        model_name=QWEN_OCR_MODEL,
        prompt="",
        min_pixels=QWEN_OCR_DEFAULT_MIN_PIXELS,
        max_pixels=QWEN_OCR_DEFAULT_MAX_PIXELS,
        enable_rotate=False,
        temperature=0.01,
        top_p=0.001,
    )


def extract_text_from_image(
    image_source: str,
    *,
    config: OCRConfig | None = None,
    api_key: str | None = None,
) -> OCRResult:
    """Extract text or structured data from an image."""
    provider = DashScopeOCRProvider(api_key=api_key or DASHSCOPE_API_KEY)
    try:
        return provider.extract(image_source, config=config or get_default_ocr_config())
    except OCRError as exc:
        raise OCRServiceError(exc.code, exc.message) from exc


__all__ = [
    "OCRServiceError",
    "extract_text_from_image",
    "get_default_ocr_config",
]
