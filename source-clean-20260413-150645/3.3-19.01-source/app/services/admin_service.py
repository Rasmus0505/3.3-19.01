from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import BASE_DATA_DIR
from app.models import User, WalletAccount
from app.repositories.admin import (
    clear_billing_rate_updated_by_refs,
    clear_lesson_generation_task_refs,
    clear_redeem_related_user_refs,
    clear_wallet_ledger_operator_refs,
    delete_user_owned_lesson_cascade,
    delete_wallet_ledger_for_user,
    list_lesson_ids_for_user,
)


logger = logging.getLogger(__name__)


@dataclass
class AdminUserDeleteError(Exception):
    status_code: int
    code: str
    message: str
    detail: str = ""

    def __str__(self) -> str:  # pragma: no cover
        return self.message


@dataclass
class AdminUserDeleteResult:
    user_id: int
    email: str
    deleted_lessons: int
    deleted_lesson_sentences: int
    deleted_lesson_progress: int
    deleted_media_assets: int
    deleted_ledger_rows: int
    deleted_wallet_account: bool
    cleared_operator_refs: int
    cleared_task_refs: int
    file_cleanup_failed_dirs: list[str]


def _cleanup_lesson_dirs(lesson_ids: list[int], *, base_data_dir: Path = BASE_DATA_DIR) -> list[str]:
    failed_dirs: list[str] = []
    for lesson_id in lesson_ids:
        lesson_dir = base_data_dir / f"lesson_{lesson_id}"
        if not lesson_dir.exists():
            continue
        try:
            shutil.rmtree(lesson_dir)
        except Exception as exc:
            failed_dirs.append(str(lesson_dir))
            logger.warning("admin_delete_user.cleanup_failed lesson_id=%s dir=%s error=%s", lesson_id, lesson_dir, exc)
    return failed_dirs


def delete_user_hard(
    db: Session,
    *,
    target_user_id: int,
    current_admin: User,
) -> AdminUserDeleteResult:
    target_user = db.get(User, target_user_id)
    if not target_user:
        raise AdminUserDeleteError(404, "USER_NOT_FOUND", "用户不存在")

    if target_user.id == current_admin.id:
        raise AdminUserDeleteError(403, "SELF_DELETE_FORBIDDEN", "不允许删除当前登录管理员账号")

    if bool(getattr(target_user, "is_admin", False)):
        raise AdminUserDeleteError(403, "ADMIN_USER_DELETE_FORBIDDEN", "不允许删除管理员账号")

    lesson_ids = list_lesson_ids_for_user(db, target_user.id)
    target_email = target_user.email

    try:
        cleared_operator_refs = clear_wallet_ledger_operator_refs(db, target_user.id)
        clear_redeem_related_user_refs(db, target_user.id)
        deleted_ledger_rows = delete_wallet_ledger_for_user(db, target_user.id)
        clear_billing_rate_updated_by_refs(db, target_user.id)
        cleared_task_refs = clear_lesson_generation_task_refs(db, target_user.id)

        # Explicitly delete lesson subtree before the user so no FK ambiguity occurs
        cascade_counts = delete_user_owned_lesson_cascade(db, target_user.id)

        # WalletAccount has no ONDELETE and uses SQLAlchemy cascade; delete it explicitly
        db.execute(delete(WalletAccount).where(WalletAccount.user_id == target_user.id))
        deleted_wallet_account = True

        db.delete(target_user)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise AdminUserDeleteError(500, "USER_DELETE_FAILED", "删除用户失败", str(exc)[:1200]) from exc

    failed_dirs = _cleanup_lesson_dirs(lesson_ids)
    return AdminUserDeleteResult(
        user_id=target_user_id,
        email=target_email,
        deleted_lessons=cascade_counts["lessons"],
        deleted_lesson_sentences=cascade_counts["lesson_sentences"],
        deleted_lesson_progress=cascade_counts["lesson_progress"],
        deleted_media_assets=cascade_counts["media_assets"],
        deleted_ledger_rows=deleted_ledger_rows,
        deleted_wallet_account=deleted_wallet_account,
        cleared_operator_refs=cleared_operator_refs,
        cleared_task_refs=cleared_task_refs,
        file_cleanup_failed_dirs=failed_dirs,
    )
