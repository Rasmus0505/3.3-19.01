"""ASR providers.

提供统一的 ASR 服务接口，支持多种 ASR 提供商。
"""
from app.infra.asr.base import ASRProvider, ASRResult, ASRConfig
from app.infra.asr.dashscope import DashScopeASRProvider
from app.exceptions.asr import (
    AsrError,
    AsrCancellationRequested,
    AsrUploadError,
    AsrTaskCreateError,
    AsrTaskWaitError,
    AsrResultError,
    AsrApiKeyMissingError,
    AsrInvalidModelError,
)

__all__ = [
    # 抽象基类
    "ASRProvider",
    "ASRResult",
    "ASRConfig",
    # 提供商实现
    "DashScopeASRProvider",
    # 异常
    "AsrError",
    "AsrCancellationRequested",
    "AsrUploadError",
    "AsrTaskCreateError",
    "AsrTaskWaitError",
    "AsrResultError",
    "AsrApiKeyMissingError",
    "AsrInvalidModelError",
]
