"""管理员操作日志服务 - 计费模块。

提供管理员操作日志的记录功能。

此文件是从 app/services/billing.py 中提取的管理员操作日志相关逻辑。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models import AdminOperationLog


logger = logging.getLogger(__name__)


def append_admin_operation_log(
    db: Session,
    *,
    operator_user_id: int | None,
    action_type: str,
    target_type: str,
    target_id: str,
    before_value: dict[str, Any] | None,
    after_value: dict[str, Any] | None,
    note: str = "",
) -> AdminOperationLog:
    """记录管理员操作日志。

    Args:
        db: 数据库会话
        operator_user_id: 操作管理员 ID
        action_type: 操作类型
        target_type: 目标类型
        target_id: 目标 ID
        before_value: 操作前值
        after_value: 操作后值
        note: 备注

    Returns:
        创建的日志记录
    """
    row = AdminOperationLog(
        operator_user_id=operator_user_id,
        action_type=action_type,
        target_type=target_type,
        target_id=str(target_id or ""),
        before_value=json.dumps(before_value or {}, ensure_ascii=False, sort_keys=True),
        after_value=json.dumps(after_value or {}, ensure_ascii=False, sort_keys=True),
        note=(note or "").strip(),
    )
    db.add(row)
    db.flush()
    return row


__all__ = [
    "append_admin_operation_log",
]
