"""Infrastructure layer - external service abstractions."""
from app.infra.asr.base import ASRProvider, ASRResult, ASRConfig
from app.infra.asr import DashScopeASRProvider
from app.infra.image_generation.base import (
    GeneratedImage,
    ImageGenerationConfig,
    ImageGenerationProvider,
    ImageGenerationResult,
)
from app.infra.image_generation import QwenImageProvider
from app.infra.ocr.base import OCRConfig, OCRProvider, OCRResult, OCRWordInfo
from app.infra.ocr import DashScopeOCRProvider
from app.infra.translation.base import TranslationProvider, TranslationResult, TranslationRequest
from app.infra.translation import QwenMTProvider

__all__ = [
    "ASRProvider",
    "ASRResult",
    "ASRConfig",
    "DashScopeASRProvider",
    "GeneratedImage",
    "ImageGenerationConfig",
    "ImageGenerationProvider",
    "ImageGenerationResult",
    "QwenImageProvider",
    "OCRConfig",
    "OCRProvider",
    "OCRResult",
    "OCRWordInfo",
    "DashScopeOCRProvider",
    "TranslationProvider",
    "TranslationResult",
    "TranslationRequest",
    "QwenMTProvider",
]
