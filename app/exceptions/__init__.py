"""QRL 异常模块。

统一管理项目中的所有异常类型，按领域划分：

- base: 基础异常类和通用异常
- billing: 计费相关异常
- lesson: 课程相关异常
- asr: 语音识别相关异常
- translation: 翻译相关异常
- media: 媒体处理相关异常
"""

from app.exceptions.asr import AsrCancellationRequested, AsrError
from app.exceptions.base import (
    AdminError,
    AppError,
    AuthError,
    NotFoundError,
    ValidationError,
)
from app.exceptions.billing import BillingError
from app.exceptions.lesson import LessonError

__all__ = [
    # 基础异常
    "AppError",
    "AuthError",
    "NotFoundError",
    "ValidationError",
    "AdminError",
    # 领域异常
    "BillingError",
    "LessonError",
    "AsrError",
    "AsrCancellationRequested",
]
