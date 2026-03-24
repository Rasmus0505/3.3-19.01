"""Infrastructure layer - external service abstractions."""
from app.infra.asr.base import ASRProvider, ASRResult, ASRConfig
from app.infra.asr import DashScopeASRProvider, FasterWhisperASRProvider
from app.infra.translation.base import TranslationProvider, TranslationResult, TranslationRequest
from app.infra.translation import QwenMTProvider

__all__ = [
    "ASRProvider",
    "ASRResult",
    "ASRConfig",
    "DashScopeASRProvider",
    "FasterWhisperASRProvider",
    "TranslationProvider",
    "TranslationResult",
    "TranslationRequest",
    "QwenMTProvider",
]
