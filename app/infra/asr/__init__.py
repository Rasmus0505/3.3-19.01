"""ASR providers.

提供统一的 ASR 服务接口，支持多种 ASR 提供商。
"""
from app.exceptions.asr import (
    AsrApiKeyMissingError,
    AsrCancellationRequested,
    AsrError,
    AsrInvalidModelError,
    AsrResultError,
    AsrTaskCreateError,
    AsrTaskWaitError,
    AsrUploadError,
)
from app.infra.asr.base import ASRConfig, ASRProvider, ASRResult
from app.infra.asr.dashscope import DashScopeASRProvider

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
