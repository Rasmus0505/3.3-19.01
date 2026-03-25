"""ASR providers."""
from app.infra.asr.base import ASRProvider, ASRResult, ASRConfig
from app.infra.asr.dashscope import DashScopeASRProvider

__all__ = [
    "ASRProvider",
    "ASRResult",
    "ASRConfig",
    "DashScopeASRProvider",
]
