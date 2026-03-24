"""ASR providers."""
from app.infra.asr.base import ASRProvider, ASRResult, ASRConfig
from app.infra.asr.dashscope import DashScopeASRProvider
from app.infra.asr.faster_whisper import FasterWhisperASRProvider

__all__ = [
    "ASRProvider",
    "ASRResult",
    "ASRConfig",
    "DashScopeASRProvider",
    "FasterWhisperASRProvider",
]
