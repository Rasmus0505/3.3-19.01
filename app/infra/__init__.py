"""Infrastructure layer - external service abstractions."""
from app.infra.asr import DashScopeASRProvider
from app.infra.asr.base import ASRConfig, ASRProvider, ASRResult
from app.infra.image_generation import QwenImageProvider
from app.infra.image_generation.base import (
    GeneratedImage,
    ImageGenerationConfig,
    ImageGenerationProvider,
    ImageGenerationResult,
)
from app.infra.ocr import DashScopeOCRProvider
from app.infra.ocr.base import OCRConfig, OCRProvider, OCRResult, OCRWordInfo
from app.infra.translation import QwenMTProvider
from app.infra.translation.base import (
    TranslationProvider,
    TranslationRequest,
    TranslationResult,
)
from app.infra.vision import QwenVisionProvider
from app.infra.vision.base import VisionConfig, VisionProvider, VisionResult

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
    "VisionConfig",
    "VisionProvider",
    "VisionResult",
    "QwenVisionProvider",
]
