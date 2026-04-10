from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models import AdminOperationLog


def append_admin_operation_log(
    db: Session,
    *,
    operator_user_id: int | None,
    action_type: str,
    target_type: str,
    target_id: str,
    before_value: dict | None,
    after_value: dict | None,
    note: str = "",
) -> AdminOperationLog:
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
