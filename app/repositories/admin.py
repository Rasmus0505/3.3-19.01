from __future__ import annotations

from datetime import datetime
import logging
from types import SimpleNamespace

from sqlalchemy import case, delete, desc, func, inspect, select, update
from sqlalchemy.orm import Session

from app.db import APP_SCHEMA
from app.models import (
    AdminOperationLog,
    BillingModelRate,
    Lesson,
    LessonGenerationTask,
    RedeemCode,
    RedeemCodeAttempt,
    RedeemCodeBatch,
    TranslationRequestLog,
    User,
    WalletAccount,
    WalletLedger,
)

logger = logging.getLogger(__name__)


def _schema_name(db: Session) -> str | None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name == "sqlite":
        return None
    return APP_SCHEMA


def _qualified_table(table_name: str, schema: str | None) -> str:
    return f"{schema}.{table_name}" if schema else table_name


def admin_storage_ready(
    db: Session,
    *,
    scope: str,
    table_name: str,
    required_columns: tuple[str, ...] = (),
) -> bool:
    bind = db.get_bind()
    if bind is None:
        logger.warning("[DEBUG] admin_storage.not_ready scope=%s reason=missing_bind", scope)
        return False

    schema = _schema_name(db)
    qualified_table = _qualified_table(table_name, schema)
    inspector = inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        logger.warning("[DEBUG] admin_storage.not_ready scope=%s reason=missing_table table=%s", scope, qualified_table)
        return False

    existing_columns = {
        str(item.get("name") or "").strip()
        for item in inspector.get_columns(table_name, schema=schema)
    }
    missing_columns = [name for name in required_columns if name not in existing_columns]
    if missing_columns:
        logger.warning(
            "[DEBUG] admin_storage.not_ready scope=%s reason=missing_columns table=%s missing=%s",
            scope,
            qualified_table,
            ",".join(missing_columns),
        )
        return False

    return True


def list_admin_users(
    db: Session,
    *,
    keyword: str,
    page: int,
    page_size: int,
    sort_by: str,
    sort_dir: str,
) -> tuple[int, list[tuple[int, str, bool, datetime, int, datetime | None]]]:
    balance_col = func.coalesce(WalletAccount.balance_amount_cents, 0)
    base_stmt = select(
        User.id,
        User.email,
        User.is_admin,
        User.created_at,
        balance_col.label("balance_points"),
        User.last_login_at,
    ).outerjoin(WalletAccount, WalletAccount.user_id == User.id)
    count_stmt = select(func.count(User.id))

    if keyword.strip():
        pattern = f"%{keyword.strip().lower()}%"
        base_stmt = base_stmt.where(func.lower(User.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(User.email).like(pattern))

    sort_key = (sort_by or "created_at").strip().lower()
    sort_desc = (sort_dir or "desc").strip().lower() != "asc"
    if sort_key == "email":
        col = User.email
    elif sort_key == "last_login_at":
        col = User.last_login_at
    elif sort_key == "balance_points":
        col = balance_col
    else:
        col = User.created_at
    order_col = desc(col) if sort_desc else col.asc()

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base_stmt.order_by(order_col, desc(User.id)).offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = [
        (row.id, row.email, bool(row.is_admin), row.created_at, int(row.balance_points or 0), row.last_login_at)
        for row in rows
    ]
    return total, items


def list_wallet_logs(
    db: Session,
    *,
    user_email: str,
    event_type: str,
    page: int,
    page_size: int,
    date_from: datetime | None,
    date_to: datetime | None,
) -> dict[str, object]:
    base = select(WalletLedger, User.email).join(User, User.id == WalletLedger.user_id)
    count_stmt = select(func.count(WalletLedger.id)).join(User, User.id == WalletLedger.user_id)

    if user_email.strip():
        pattern = f"%{user_email.strip().lower()}%"
        base = base.where(func.lower(User.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(User.email).like(pattern))

    normalized_event = event_type.strip().lower()
    if normalized_event and normalized_event != "all":
        base = base.where(WalletLedger.event_type == normalized_event)
        count_stmt = count_stmt.where(WalletLedger.event_type == normalized_event)

    if date_from:
        base = base.where(WalletLedger.created_at >= date_from)
        count_stmt = count_stmt.where(WalletLedger.created_at >= date_from)
    if date_to:
        base = base.where(WalletLedger.created_at <= date_to)
        count_stmt = count_stmt.where(WalletLedger.created_at <= date_to)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(WalletLedger.created_at.desc(), WalletLedger.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    inflow_points = int(
        db.scalar(
            base.with_only_columns(
                func.coalesce(func.sum(case((WalletLedger.delta_amount_cents > 0, WalletLedger.delta_amount_cents), else_=0)), 0)
            )
        )
        or 0
    )
    outflow_points = int(
        db.scalar(
            base.with_only_columns(
                func.coalesce(func.sum(case((WalletLedger.delta_amount_cents < 0, -WalletLedger.delta_amount_cents), else_=0)), 0)
            )
        )
        or 0
    )
    event_breakdown = db.execute(
        base.with_only_columns(WalletLedger.event_type, func.count(WalletLedger.id))
        .group_by(WalletLedger.event_type)
        .order_by(desc(func.count(WalletLedger.id)))
        .limit(6)
    ).all()
    timeline = db.execute(
        base.with_only_columns(
            func.date(WalletLedger.created_at),
            func.coalesce(func.sum(case((WalletLedger.delta_amount_cents > 0, WalletLedger.delta_amount_cents), else_=0)), 0).label("inflow_points"),
            func.coalesce(func.sum(case((WalletLedger.delta_amount_cents < 0, -WalletLedger.delta_amount_cents), else_=0)), 0).label("outflow_points"),
        )
        .group_by(func.date(WalletLedger.created_at))
        .order_by(func.date(WalletLedger.created_at))
    ).all()
    return {
        "total": total,
        "rows": rows,
        "summary_cards": [
            {"label": "匹配流水", "value": total, "hint": "当前筛选条件下的流水总数", "tone": "info"},
            {"label": "累计入账金额", "value": inflow_points, "hint": "筛选范围内所有正向入账", "tone": "success"},
            {"label": "累计扣减金额", "value": outflow_points, "hint": "筛选范围内所有消耗与扣减", "tone": "warning"},
        ],
        "charts": [
            {
                "title": "流水金额趋势",
                "description": "把入账和扣减放在同一张图里，方便看异常波动。",
                "type": "line",
                "x_key": "label",
                "series": [
                    {"key": "入账金额", "name": "入账金额", "color": "#10b981"},
                    {"key": "扣减金额", "name": "扣减金额", "color": "#f59e0b"},
                ],
                "data": [
                    {"label": str(bucket)[5:] if bucket else "-", "入账金额": int(inflow or 0), "扣减金额": int(outflow or 0)}
                    for bucket, inflow, outflow in timeline
                ],
            },
            {
                "title": "事件类型分布",
                "description": "看哪类流水最活跃，方便继续定位到业务链路。",
                "type": "bar",
                "x_key": "label",
                "series": [{"key": "value", "name": "记录数", "color": "#2563eb"}],
                "data": [{"label": event_type_item or "-", "value": int(count or 0)} for event_type_item, count in event_breakdown],
            },
        ],
    }


def list_translation_logs(
    db: Session,
    *,
    user_email: str,
    task_id: str,
    lesson_id: int | None,
    success: str,
    page: int,
    page_size: int,
    date_from: datetime | None,
    date_to: datetime | None,
) -> dict[str, object]:
    bind = db.get_bind()
    inspector = inspect(bind)
    schema = None if bind.dialect.name == "sqlite" else APP_SCHEMA
    if not inspector.has_table(TranslationRequestLog.__tablename__, schema=schema):
        logger.warning("[DEBUG] translation_logs.table_missing table=%s", TranslationRequestLog.__tablename__)
        return {"total": 0, "rows": [], "summary_cards": [], "charts": []}

    base = select(TranslationRequestLog, User.email).outerjoin(User, User.id == TranslationRequestLog.user_id)
    count_stmt = select(func.count(TranslationRequestLog.id)).outerjoin(User, User.id == TranslationRequestLog.user_id)

    if user_email.strip():
        pattern = f"%{user_email.strip().lower()}%"
        base = base.where(func.lower(User.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(User.email).like(pattern))

    if task_id.strip():
        base = base.where(TranslationRequestLog.task_id == task_id.strip())
        count_stmt = count_stmt.where(TranslationRequestLog.task_id == task_id.strip())

    if lesson_id is not None:
        base = base.where(TranslationRequestLog.lesson_id == lesson_id)
        count_stmt = count_stmt.where(TranslationRequestLog.lesson_id == lesson_id)

    normalized_success = success.strip().lower()
    if normalized_success in {"success", "true", "1"}:
        base = base.where(TranslationRequestLog.success.is_(True))
        count_stmt = count_stmt.where(TranslationRequestLog.success.is_(True))
    elif normalized_success in {"failed", "false", "0"}:
        base = base.where(TranslationRequestLog.success.is_(False))
        count_stmt = count_stmt.where(TranslationRequestLog.success.is_(False))

    if date_from:
        base = base.where(TranslationRequestLog.created_at >= date_from)
        count_stmt = count_stmt.where(TranslationRequestLog.created_at >= date_from)
    if date_to:
        base = base.where(TranslationRequestLog.created_at <= date_to)
        count_stmt = count_stmt.where(TranslationRequestLog.created_at <= date_to)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(TranslationRequestLog.created_at.desc(), TranslationRequestLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    success_count = int(db.scalar(base.with_only_columns(func.count(TranslationRequestLog.id)).where(TranslationRequestLog.success.is_(True))) or 0)
    failed_count = int(db.scalar(base.with_only_columns(func.count(TranslationRequestLog.id)).where(TranslationRequestLog.success.is_(False))) or 0)
    total_tokens = int(db.scalar(base.with_only_columns(func.coalesce(func.sum(TranslationRequestLog.total_tokens), 0))) or 0)
    provider_breakdown = db.execute(
        base.with_only_columns(TranslationRequestLog.provider, func.count(TranslationRequestLog.id), func.coalesce(func.sum(TranslationRequestLog.total_tokens), 0))
        .group_by(TranslationRequestLog.provider)
        .order_by(desc(func.count(TranslationRequestLog.id)))
        .limit(6)
    ).all()
    timeline = db.execute(
        base.with_only_columns(
            func.date(TranslationRequestLog.created_at),
            func.count(TranslationRequestLog.id),
            func.sum(case((TranslationRequestLog.success.is_(False), 1), else_=0)),
        )
        .group_by(func.date(TranslationRequestLog.created_at))
        .order_by(func.date(TranslationRequestLog.created_at))
    ).all()
    success_rate = round((success_count / total) * 100, 1) if total else 0.0
    return {
        "total": total,
        "rows": rows,
        "summary_cards": [
            {"label": "匹配请求", "value": total, "hint": "当前筛选条件下的翻译请求总数", "tone": "info"},
            {"label": "成功率", "value": f"{success_rate}%", "hint": f"成功 {success_count} / 失败 {failed_count}", "tone": "success" if failed_count == 0 else "warning"},
            {"label": "累计 Tokens", "value": total_tokens, "hint": "方便和计费日志一起对账", "tone": "default"},
        ],
        "charts": [
            {
                "title": "翻译请求趋势",
                "description": "同时看请求量和失败量，定位是量峰值还是链路异常。",
                "type": "line",
                "x_key": "label",
                "series": [
                    {"key": "请求数", "name": "请求数", "color": "#2563eb"},
                    {"key": "失败数", "name": "失败数", "color": "#ef4444"},
                ],
                "data": [{"label": str(bucket)[5:] if bucket else "-", "请求数": int(count or 0), "失败数": int(failed or 0)} for bucket, count, failed in timeline],
            },
            {
                "title": "Provider 分布",
                "description": "对比各 Provider 的请求量和 Tokens 消耗。",
                "type": "bar",
                "x_key": "label",
                "series": [
                    {"key": "请求数", "name": "请求数", "color": "#8b5cf6"},
                    {"key": "Tokens", "name": "Tokens", "color": "#06b6d4"},
                ],
                "data": [{"label": provider or "-", "请求数": int(count or 0), "Tokens": int(tokens or 0)} for provider, count, tokens in provider_breakdown],
            },
        ],
    }


def _effective_batch_status(batch: RedeemCodeBatch, now: datetime) -> str:
    if batch.status == "expired" or now >= batch.expire_at:
        return "expired"
    return batch.status


def _effective_code_status(code: RedeemCode, batch: RedeemCodeBatch, now: datetime) -> str:
    if code.status == "redeemed":
        return "redeemed"
    if code.status == "abandoned":
        return "abandoned"
    if code.status == "disabled" or batch.status == "paused":
        return "disabled"
    if batch.status == "expired" or now >= batch.expire_at:
        return "expired"
    return "unredeemed"


def list_redeem_batches(
    db: Session,
    *,
    keyword: str,
    status: str,
    page: int,
    page_size: int,
    now: datetime,
) -> tuple[int, list[tuple[RedeemCodeBatch, int, str]]]:
    if not admin_storage_ready(
        db,
        scope="admin.redeem_batches.batch_table",
        table_name=RedeemCodeBatch.__tablename__,
        required_columns=(
            "id",
            "batch_name",
            "face_value_points",
            "generated_count",
            "active_from",
            "expire_at",
            "daily_limit_per_user",
            "status",
            "remark",
            "created_by_user_id",
            "created_at",
            "updated_at",
        ),
    ):
        return 0, []
    if not admin_storage_ready(
        db,
        scope="admin.redeem_batches.code_table",
        table_name=RedeemCode.__tablename__,
        required_columns=("id", "batch_id", "status"),
    ):
        return 0, []

    batch_table = RedeemCodeBatch.__table__
    code_table = RedeemCode.__table__
    base_stmt = select(
        batch_table.c.id.label("id"),
        batch_table.c.batch_name.label("batch_name"),
        batch_table.c.face_value_points.label("face_value_points"),
        batch_table.c.generated_count.label("generated_count"),
        batch_table.c.active_from.label("active_from"),
        batch_table.c.expire_at.label("expire_at"),
        batch_table.c.daily_limit_per_user.label("daily_limit_per_user"),
        batch_table.c.status.label("status"),
        batch_table.c.remark.label("remark"),
        batch_table.c.created_by_user_id.label("created_by_user_id"),
        batch_table.c.created_at.label("created_at"),
        batch_table.c.updated_at.label("updated_at"),
    )
    count_stmt = select(func.count(batch_table.c.id))

    if keyword.strip():
        pattern = f"%{keyword.strip().lower()}%"
        base_stmt = base_stmt.where(func.lower(batch_table.c.batch_name).like(pattern))
        count_stmt = count_stmt.where(func.lower(batch_table.c.batch_name).like(pattern))

    normalized_status = status.strip().lower()
    if normalized_status in {"active", "paused"}:
        base_stmt = base_stmt.where(batch_table.c.status == normalized_status)
        count_stmt = count_stmt.where(batch_table.c.status == normalized_status)
    elif normalized_status == "expired":
        base_stmt = base_stmt.where((batch_table.c.status == "expired") | (batch_table.c.expire_at <= now))
        count_stmt = count_stmt.where((batch_table.c.status == "expired") | (batch_table.c.expire_at <= now))

    total = int(db.scalar(count_stmt) or 0)
    batch_rows = db.execute(
        base_stmt.order_by(batch_table.c.created_at.desc(), batch_table.c.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    batch_ids = [int(row.id) for row in batch_rows]
    if not batch_ids:
        return total, []

    redeemed_map = {
        int(row.batch_id): int(row.redeemed_count)
        for row in db.execute(
            select(code_table.c.batch_id, func.count(code_table.c.id).label("redeemed_count"))
            .where(code_table.c.batch_id.in_(batch_ids), code_table.c.status == "redeemed")
            .group_by(code_table.c.batch_id)
        ).all()
    }

    items: list[tuple[RedeemCodeBatch, int, str]] = []
    for row in batch_rows:
        batch = SimpleNamespace(
            id=int(row.id),
            batch_name=str(row.batch_name or ""),
            face_value_points=int(row.face_value_points or 0),
            generated_count=int(row.generated_count or 0),
            active_from=row.active_from,
            expire_at=row.expire_at,
            daily_limit_per_user=row.daily_limit_per_user,
            status=str(row.status or ""),
            remark=str(row.remark or ""),
            created_by_user_id=row.created_by_user_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        redeemed_count = redeemed_map.get(batch.id, 0)
        items.append((batch, redeemed_count, _effective_batch_status(batch, now)))
    return total, items


def list_redeem_codes(
    db: Session,
    *,
    batch_id: int | None,
    status: str,
    redeem_user_email: str,
    created_from: datetime | None,
    created_to: datetime | None,
    redeemed_from: datetime | None,
    redeemed_to: datetime | None,
    page: int,
    page_size: int,
    now: datetime,
) -> tuple[int, list[tuple[RedeemCode, RedeemCodeBatch, str | None]]]:
    if not admin_storage_ready(
        db,
        scope="admin.redeem_codes.batch_table",
        table_name=RedeemCodeBatch.__tablename__,
        required_columns=("id", "batch_name", "face_value_points", "status", "expire_at"),
    ):
        return 0, []
    if not admin_storage_ready(
        db,
        scope="admin.redeem_codes.code_table",
        table_name=RedeemCode.__tablename__,
        required_columns=(
            "id",
            "batch_id",
            "masked_code",
            "status",
            "created_by_user_id",
            "redeemed_by_user_id",
            "redeemed_at",
            "created_at",
        ),
    ):
        return 0, []

    batch_table = RedeemCodeBatch.__table__
    code_table = RedeemCode.__table__
    redeemed_user = User.__table__.alias("redeemed_user")

    base = (
        select(
            code_table.c.id.label("code_id"),
            code_table.c.batch_id.label("code_batch_id"),
            code_table.c.masked_code.label("code_masked_code"),
            code_table.c.code_plain.label("code_plain"),  # 新增 per D-10
            code_table.c.status.label("code_status"),
            code_table.c.created_by_user_id.label("code_created_by_user_id"),
            code_table.c.redeemed_by_user_id.label("code_redeemed_by_user_id"),
            code_table.c.redeemed_at.label("code_redeemed_at"),
            code_table.c.created_at.label("code_created_at"),
            batch_table.c.id.label("batch_id"),
            batch_table.c.batch_name.label("batch_name"),
            batch_table.c.face_value_points.label("batch_face_value_points"),
            batch_table.c.status.label("batch_status"),
            batch_table.c.expire_at.label("batch_expire_at"),
            redeemed_user.c.email.label("redeemed_email"),
        )
        .join(batch_table, batch_table.c.id == code_table.c.batch_id)
        .outerjoin(redeemed_user, redeemed_user.c.id == code_table.c.redeemed_by_user_id)
    )
    count_stmt = select(func.count(code_table.c.id)).join(batch_table, batch_table.c.id == code_table.c.batch_id).outerjoin(
        redeemed_user, redeemed_user.c.id == RedeemCode.redeemed_by_user_id
    )

    if batch_id is not None:
        base = base.where(code_table.c.batch_id == batch_id)
        count_stmt = count_stmt.where(code_table.c.batch_id == batch_id)

    normalized_status = status.strip().lower()
    if normalized_status == "redeemed":
        base = base.where(code_table.c.status == "redeemed")
        count_stmt = count_stmt.where(code_table.c.status == "redeemed")
    elif normalized_status == "disabled":
        base = base.where((code_table.c.status.in_(["disabled", "abandoned"])) | (batch_table.c.status == "paused"))
        count_stmt = count_stmt.where((code_table.c.status.in_(["disabled", "abandoned"])) | (batch_table.c.status == "paused"))
    elif normalized_status == "expired":
        base = base.where(
            code_table.c.status == "active",
            ((batch_table.c.status == "expired") | (batch_table.c.expire_at <= now)),
        )
        count_stmt = count_stmt.where(
            code_table.c.status == "active",
            ((batch_table.c.status == "expired") | (batch_table.c.expire_at <= now)),
        )
    elif normalized_status == "unredeemed":
        base = base.where(
            code_table.c.status == "active",
            batch_table.c.status == "active",
            batch_table.c.expire_at > now,
        )
        count_stmt = count_stmt.where(
            code_table.c.status == "active",
            batch_table.c.status == "active",
            batch_table.c.expire_at > now,
        )
    elif normalized_status == "abandoned":
        base = base.where(code_table.c.status == "abandoned")
        count_stmt = count_stmt.where(code_table.c.status == "abandoned")

    if redeem_user_email.strip():
        pattern = f"%{redeem_user_email.strip().lower()}%"
        base = base.where(func.lower(redeemed_user.c.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(redeemed_user.c.email).like(pattern))

    if created_from:
        base = base.where(code_table.c.created_at >= created_from)
        count_stmt = count_stmt.where(code_table.c.created_at >= created_from)
    if created_to:
        base = base.where(code_table.c.created_at <= created_to)
        count_stmt = count_stmt.where(code_table.c.created_at <= created_to)

    if redeemed_from:
        base = base.where(code_table.c.redeemed_at >= redeemed_from)
        count_stmt = count_stmt.where(code_table.c.redeemed_at >= redeemed_from)
    if redeemed_to:
        base = base.where(code_table.c.redeemed_at <= redeemed_to)
        count_stmt = count_stmt.where(code_table.c.redeemed_at <= redeemed_to)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(code_table.c.created_at.desc(), code_table.c.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    return total, [
        (
            SimpleNamespace(
                id=int(row.code_id),
                batch_id=int(row.code_batch_id),
                masked_code=str(row.code_masked_code or ""),
                code_plain=str(row.code_plain or ""),  # 新增 per D-10
                status=str(row.code_status or ""),
                created_by_user_id=row.code_created_by_user_id,
                redeemed_by_user_id=row.code_redeemed_by_user_id,
                redeemed_at=row.code_redeemed_at,
                created_at=row.code_created_at,
            ),
            SimpleNamespace(
                id=int(row.batch_id),
                batch_name=str(row.batch_name or ""),
                face_value_points=int(row.batch_face_value_points or 0),
                status=str(row.batch_status or ""),
                expire_at=row.batch_expire_at,
            ),
            row.redeemed_email,
        )
        for row in rows
    ]


def list_unredeemed_codes_for_export(db: Session, *, batch_id: int | None, now: datetime) -> list[tuple[RedeemCode, RedeemCodeBatch]]:
    if not admin_storage_ready(
        db,
        scope="admin.redeem_export.batch_table",
        table_name=RedeemCodeBatch.__tablename__,
        required_columns=("id", "batch_name", "face_value_points", "active_from", "expire_at", "status"),
    ):
        return []
    if not admin_storage_ready(
        db,
        scope="admin.redeem_export.code_table",
        table_name=RedeemCode.__tablename__,
        required_columns=("id", "batch_id", "code_plain", "masked_code", "status"),
    ):
        return []

    stmt = (
        select(
            RedeemCode.__table__.c.id.label("code_id"),
            RedeemCode.__table__.c.batch_id.label("code_batch_id"),
            RedeemCode.__table__.c.code_plain.label("code_plain"),
            RedeemCode.__table__.c.masked_code.label("masked_code"),
            RedeemCodeBatch.__table__.c.id.label("batch_id"),
            RedeemCodeBatch.__table__.c.batch_name.label("batch_name"),
            RedeemCodeBatch.__table__.c.face_value_points.label("face_value_points"),
            RedeemCodeBatch.__table__.c.active_from.label("active_from"),
            RedeemCodeBatch.__table__.c.expire_at.label("expire_at"),
        )
        .join(RedeemCodeBatch.__table__, RedeemCodeBatch.__table__.c.id == RedeemCode.__table__.c.batch_id)
        .where(
            RedeemCode.__table__.c.status == "active",
            RedeemCodeBatch.__table__.c.status == "active",
            RedeemCodeBatch.__table__.c.expire_at > now,
        )
    )
    if batch_id is not None:
        stmt = stmt.where(RedeemCode.__table__.c.batch_id == batch_id)

    rows = db.execute(stmt.order_by(RedeemCodeBatch.__table__.c.id.asc(), RedeemCode.__table__.c.id.asc())).all()
    return [
        (
            SimpleNamespace(
                id=int(row.code_id),
                batch_id=int(row.code_batch_id),
                code_plain=str(row.code_plain or ""),
                masked_code=str(row.masked_code or ""),
            ),
            SimpleNamespace(
                id=int(row.batch_id),
                batch_name=str(row.batch_name or ""),
                face_value_points=int(row.face_value_points or 0),
                active_from=row.active_from,
                expire_at=row.expire_at,
            ),
        )
        for row in rows
    ]


def list_redeem_audit_rows(
    db: Session,
    *,
    user_email: str,
    batch_id: int | None,
    date_from: datetime | None,
    date_to: datetime | None,
    page: int,
    page_size: int,
) -> tuple[int, list[tuple[RedeemCodeAttempt, str | None, str | None]]]:
    if not admin_storage_ready(
        db,
        scope="admin.redeem_audit.attempt_table",
        table_name=RedeemCodeAttempt.__tablename__,
        required_columns=("id", "user_id", "batch_id", "code_id", "code_mask", "success", "failure_reason", "created_at"),
    ):
        return 0, []
    if not admin_storage_ready(
        db,
        scope="admin.redeem_audit.batch_table",
        table_name=RedeemCodeBatch.__tablename__,
        required_columns=("id", "batch_name"),
    ):
        return 0, []

    user_table = User.__table__.alias("audit_user")
    base = (
        select(RedeemCodeAttempt, user_table.c.email.label("user_email"), RedeemCodeBatch.batch_name.label("batch_name"))
        .outerjoin(user_table, user_table.c.id == RedeemCodeAttempt.user_id)
        .outerjoin(RedeemCodeBatch, RedeemCodeBatch.id == RedeemCodeAttempt.batch_id)
    )
    count_stmt = (
        select(func.count(RedeemCodeAttempt.id))
        .outerjoin(user_table, user_table.c.id == RedeemCodeAttempt.user_id)
        .outerjoin(RedeemCodeBatch, RedeemCodeBatch.id == RedeemCodeAttempt.batch_id)
    )

    if user_email.strip():
        pattern = f"%{user_email.strip().lower()}%"
        base = base.where(func.lower(user_table.c.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(user_table.c.email).like(pattern))

    if batch_id is not None:
        base = base.where(RedeemCodeAttempt.batch_id == batch_id)
        count_stmt = count_stmt.where(RedeemCodeAttempt.batch_id == batch_id)

    if date_from:
        base = base.where(RedeemCodeAttempt.created_at >= date_from)
        count_stmt = count_stmt.where(RedeemCodeAttempt.created_at >= date_from)
    if date_to:
        base = base.where(RedeemCodeAttempt.created_at <= date_to)
        count_stmt = count_stmt.where(RedeemCodeAttempt.created_at <= date_to)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(RedeemCodeAttempt.created_at.desc(), RedeemCodeAttempt.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return total, [(row[0], row.user_email, row.batch_name) for row in rows]


def list_all_redeem_audit_rows(
    db: Session,
    *,
    user_email: str,
    batch_id: int | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> list[tuple[RedeemCodeAttempt, str | None, str | None]]:
    if not admin_storage_ready(
        db,
        scope="admin.redeem_audit_export.attempt_table",
        table_name=RedeemCodeAttempt.__tablename__,
        required_columns=("id", "user_id", "batch_id", "code_id", "code_mask", "success", "failure_reason", "created_at"),
    ):
        return []
    if not admin_storage_ready(
        db,
        scope="admin.redeem_audit_export.batch_table",
        table_name=RedeemCodeBatch.__tablename__,
        required_columns=("id", "batch_name"),
    ):
        return []

    user_table = User.__table__.alias("audit_user")
    stmt = (
        select(RedeemCodeAttempt, user_table.c.email.label("user_email"), RedeemCodeBatch.batch_name.label("batch_name"))
        .outerjoin(user_table, user_table.c.id == RedeemCodeAttempt.user_id)
        .outerjoin(RedeemCodeBatch, RedeemCodeBatch.id == RedeemCodeAttempt.batch_id)
    )

    if user_email.strip():
        pattern = f"%{user_email.strip().lower()}%"
        stmt = stmt.where(func.lower(user_table.c.email).like(pattern))

    if batch_id is not None:
        stmt = stmt.where(RedeemCodeAttempt.batch_id == batch_id)

    if date_from:
        stmt = stmt.where(RedeemCodeAttempt.created_at >= date_from)
    if date_to:
        stmt = stmt.where(RedeemCodeAttempt.created_at <= date_to)

    rows = db.execute(stmt.order_by(RedeemCodeAttempt.created_at.desc(), RedeemCodeAttempt.id.desc())).all()
    return [(row[0], row.user_email, row.batch_name) for row in rows]


def list_lesson_ids_for_user(db: Session, user_id: int) -> list[int]:
    return [int(value) for value in db.scalars(select(Lesson.id).where(Lesson.user_id == user_id)).all()]


def clear_wallet_ledger_operator_refs(db: Session, user_id: int) -> int:
    stmt = (
        update(WalletLedger)
        .where(WalletLedger.operator_user_id == user_id, WalletLedger.user_id != user_id)
        .values(operator_user_id=None)
    )
    result = db.execute(stmt)
    return int(result.rowcount or 0)


def clear_redeem_related_user_refs(db: Session, user_id: int) -> int:
    affected = 0

    affected += int(
        db.execute(update(RedeemCodeBatch).where(RedeemCodeBatch.created_by_user_id == user_id).values(created_by_user_id=None)).rowcount
        or 0
    )
    affected += int(
        db.execute(update(RedeemCode).where(RedeemCode.created_by_user_id == user_id).values(created_by_user_id=None)).rowcount or 0
    )
    affected += int(
        db.execute(update(RedeemCode).where(RedeemCode.redeemed_by_user_id == user_id).values(redeemed_by_user_id=None)).rowcount or 0
    )
    affected += int(
        db.execute(update(RedeemCodeAttempt).where(RedeemCodeAttempt.user_id == user_id).values(user_id=None)).rowcount or 0
    )
    affected += int(
        db.execute(update(AdminOperationLog).where(AdminOperationLog.operator_user_id == user_id).values(operator_user_id=None)).rowcount
        or 0
    )
    return affected


def delete_wallet_ledger_for_user(db: Session, user_id: int) -> int:
    result = db.execute(delete(WalletLedger).where(WalletLedger.user_id == user_id))
    return int(result.rowcount or 0)


def clear_billing_rate_updated_by_refs(db: Session, user_id: int) -> int:
    result = db.execute(
        update(BillingModelRate).where(BillingModelRate.updated_by_user_id == user_id).values(updated_by_user_id=None)
    )
    return int(result.rowcount or 0)


def clear_lesson_generation_task_refs(db: Session, user_id: int) -> int:
    result = db.execute(delete(LessonGenerationTask).where(LessonGenerationTask.owner_user_id == user_id))
    return int(result.rowcount or 0)
