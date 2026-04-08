"""翻译请求日志服务 - 计费模块。

提供翻译请求日志的记录功能。

此文件是从 app/services/billing.py 中提取的翻译请求日志相关逻辑。
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import TranslationRequestLog
from app.core.timezone import now_shanghai_naive


logger = logging.getLogger(__name__)


def _now() -> datetime:
    return now_shanghai_naive()


def append_translation_request_logs(
    db: Session,
    *,
    trace_id: str,
    user_id: int | None,
    task_id: str | None,
    lesson_id: int | None,
    records: Iterable[dict[str, object]],
) -> int:
    """批量写入翻译请求日志。

    Args:
        db: 数据库会话
        trace_id: 追踪 ID
        user_id: 用户 ID
        task_id: 任务 ID
        lesson_id: 课程 ID
        records: 翻译请求记录列表

    Returns:
        成功插入的记录数
    """
    inserted = 0
    for item in records:
        row = TranslationRequestLog(
            trace_id=str(trace_id or "").strip(),
            task_id=str(item.get("task_id") or task_id or "").strip() or None,
            lesson_id=int(item["lesson_id"]) if item.get("lesson_id") is not None else lesson_id,
            user_id=int(item["user_id"]) if item.get("user_id") is not None else user_id,
            sentence_idx=int(item.get("sentence_idx", 0)),
            attempt_no=max(1, int(item.get("attempt_no", 1))),
            provider=str(item.get("provider") or "dashscope_compatible"),
            model_name=str(item.get("model_name") or ""),
            base_url=str(item.get("base_url") or ""),
            input_text_preview=str(item.get("input_text_preview") or ""),
            provider_request_id=str(item.get("provider_request_id") or "").strip() or None,
            status_code=int(item["status_code"]) if item.get("status_code") is not None else None,
            finish_reason=str(item.get("finish_reason") or "").strip() or None,
            prompt_tokens=max(0, int(item.get("prompt_tokens", 0) or 0)),
            completion_tokens=max(0, int(item.get("completion_tokens", 0) or 0)),
            total_tokens=max(0, int(item.get("total_tokens", 0) or 0)),
            success=bool(item.get("success")),
            error_code=str(item.get("error_code") or "").strip() or None,
            error_message=str(item.get("error_message") or ""),
            raw_request_text=str(item.get("raw_request_text") or ""),
            raw_response_text=str(item.get("raw_response_text") or ""),
            raw_error_text=str(item.get("raw_error_text") or ""),
            started_at=item.get("started_at") or _now(),
            finished_at=item.get("finished_at") or _now(),
            created_at=item.get("created_at") or item.get("finished_at") or _now(),
        )
        db.add(row)
        inserted += 1
    if inserted:
        db.flush()
    return inserted


__all__ = [
    "append_translation_request_logs",
]
