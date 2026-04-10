"""OCR infrastructure providers."""
from app.infra.ocr.base import OCRConfig, OCRProvider, OCRResult, OCRWordInfo
from app.infra.ocr.dashscope_ocr import (
    DEFAULT_MODEL,
    SUPPORTED_MODELS,
    DashScopeOCRProvider,
    OCRError,
    extract_ocr,
    setup_dashscope,
)

__all__ = [
    "DEFAULT_MODEL",
    "SUPPORTED_MODELS",
    "DashScopeOCRProvider",
    "OCRConfig",
    "OCRError",
    "OCRProvider",
    "OCRResult",
    "OCRWordInfo",
    "extract_ocr",
    "setup_dashscope",
]
