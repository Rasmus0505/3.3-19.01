"""核心错误模块 - 向后兼容 shim。

所有实现已迁移至 app/exceptions/。
此文件保留以支持现有代码导入路径。

建议新代码直接导入：
    from app.exceptions import AppError, AuthError, NotFoundError, ...
    from app.exceptions import BillingError, LessonError, AsrError, ...
"""

from __future__ import annotations

import warnings

from app.exceptions.base import (
    AppError,  # noqa: F401
    BillingError,  # noqa: F401
    error_response,  # noqa: F401
    map_billing_error,  # noqa: F401
    map_media_error,  # noqa: F401
)

warnings.warn(
    "Import from app.core.errors is deprecated, use app.exceptions instead",
    DeprecationWarning,
    stacklevel=2,
)
