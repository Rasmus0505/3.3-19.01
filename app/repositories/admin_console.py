from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy import case, desc, func, select
from sqlalchemy.orm import Session

from app.models import (
    AdminOperationLog,
    Lesson,
    LessonGenerationTask,
    RedeemCodeAttempt,
    RedeemCodeBatch,
    TranslationRequestLog,
    User,
    UserLoginEvent,
    WalletAccount,
    WalletLedger,
)
from app.repositories.admin import list_redeem_batches
from app.services.query_cache import query_cache
from app.services.lesson_task_manager import ensure_lesson_task_storage_ready
from app.services.user_activity import ensure_user_activity_schema

CHART_COLORS = {
    "blue": "#2563eb",
    "green": "#10b981",
    "amber": "#f59e0b",
    "rose": "#ef4444",
    "violet": "#8b5cf6",
    "cyan": "#06b6d4",
}
ADMIN_OVERVIEW_TTL_SECONDS = 600
ADMIN_USER_SUMMARY_TTL_SECONDS = 600


def _start_of_day(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _date_key(value) -> str:
    return str(value)[:10]


def _date_label(value: datetime) -> str:
    return value.strftime("%m-%d")


def _range_end_exclusive(date_to: datetime) -> datetime:
    return date_to + timedelta(days=1)


def _build_daily_points(days: int, now: datetime, series_maps: dict[str, dict[str, int]]) -> list[dict[str, int | str]]:
    start = _start_of_day(now) - timedelta(days=days - 1)
    points: list[dict[str, int | str]] = []
    for offset in range(days):
        current = start + timedelta(days=offset)
        key = current.strftime("%Y-%m-%d")
        item: dict[str, int | str] = {"label": _date_label(current)}
        for series_key, values in series_maps.items():
            item[series_key] = int(values.get(key, 0))
        points.append(item)
    return points


def _count_by_day(db: Session, stmt, id_col, date_col) -> dict[str, int]:
    rows = db.execute(
        stmt.with_only_columns(func.date(date_col).label("bucket"), func.count(id_col)).group_by(func.date(date_col))
    ).all()
    return {_date_key(bucket): int(total or 0) for bucket, total in rows}


def _sum_by_day(db: Session, stmt, value_col, date_col) -> dict[str, int]:
    rows = db.execute(
        stmt.with_only_columns(func.date(date_col).label("bucket"), func.coalesce(func.sum(value_col), 0)).group_by(func.date(date_col))
    ).all()
    return {_date_key(bucket): int(total or 0) for bucket, total in rows}


def _operation_log_base(*, operator_email: str, action_type: str, target_type: str, date_from: datetime | None, date_to: datetime | None):
    operator_user = User.__table__.alias("operator_user")
    base = (
        select(AdminOperationLog, operator_user.c.email.label("operator_email"))
        .outerjoin(operator_user, operator_user.c.id == AdminOperationLog.operator_user_id)
    )
    count_stmt = select(func.count(AdminOperationLog.id)).outerjoin(operator_user, operator_user.c.id == AdminOperationLog.operator_user_id)

    normalized_operator_email = operator_email.strip().lower()
    if normalized_operator_email:
        pattern = f"%{normalized_operator_email}%"
        base = base.where(func.lower(operator_user.c.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(operator_user.c.email).like(pattern))

    normalized_action_type = action_type.strip().lower()
    if normalized_action_type and normalized_action_type != "all":
        base = base.where(func.lower(AdminOperationLog.action_type) == normalized_action_type)
        count_stmt = count_stmt.where(func.lower(AdminOperationLog.action_type) == normalized_action_type)

    normalized_target_type = target_type.strip().lower()
    if normalized_target_type and normalized_target_type != "all":
        base = base.where(func.lower(AdminOperationLog.target_type) == normalized_target_type)
        count_stmt = count_stmt.where(func.lower(AdminOperationLog.target_type) == normalized_target_type)

    if date_from:
        base = base.where(AdminOperationLog.created_at >= date_from)
        count_stmt = count_stmt.where(AdminOperationLog.created_at >= date_from)
    if date_to:
        base = base.where(AdminOperationLog.created_at <= date_to)
        count_stmt = count_stmt.where(AdminOperationLog.created_at <= date_to)

    return base, count_stmt, operator_user


def _infer_current_stage(stages: list[dict] | None) -> str:
    safe_stages = [dict(item) for item in list(stages or []) if isinstance(item, dict)]
    for target_status in ("running", "failed", "pending"):
        for item in safe_stages:
            if str(item.get("status") or "") == target_status:
                return str(item.get("key") or "")
    if safe_stages:
        return str(safe_stages[-1].get("key") or "")
    return ""


def _lesson_task_base(
    *,
    status: str,
    user_email: str,
    task_id: str,
    lesson_id: int | None,
    source_filename: str,
    date_from: datetime | None,
    date_to: datetime | None,
):
    owner_user = User.__table__.alias("lesson_task_owner")
    sort_column = func.coalesce(LessonGenerationTask.failed_at, LessonGenerationTask.updated_at, LessonGenerationTask.created_at)
    base = (
        select(LessonGenerationTask, owner_user.c.email.label("user_email"))
        .outerjoin(owner_user, owner_user.c.id == LessonGenerationTask.owner_user_id)
    )
    count_stmt = select(func.count(LessonGenerationTask.id)).outerjoin(owner_user, owner_user.c.id == LessonGenerationTask.owner_user_id)

    normalized_status = status.strip().lower()
    if normalized_status and normalized_status != "all":
        base = base.where(func.lower(LessonGenerationTask.status) == normalized_status)
        count_stmt = count_stmt.where(func.lower(LessonGenerationTask.status) == normalized_status)

    normalized_user_email = user_email.strip().lower()
    if normalized_user_email:
        pattern = f"%{normalized_user_email}%"
        base = base.where(func.lower(owner_user.c.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(owner_user.c.email).like(pattern))

    normalized_task_id = task_id.strip().lower()
    if normalized_task_id:
        pattern = f"%{normalized_task_id}%"
        base = base.where(func.lower(LessonGenerationTask.task_id).like(pattern))
        count_stmt = count_stmt.where(func.lower(LessonGenerationTask.task_id).like(pattern))

    if lesson_id is not None and int(lesson_id) > 0:
        base = base.where(LessonGenerationTask.lesson_id == int(lesson_id))
        count_stmt = count_stmt.where(LessonGenerationTask.lesson_id == int(lesson_id))

    normalized_source_filename = source_filename.strip().lower()
    if normalized_source_filename:
        pattern = f"%{normalized_source_filename}%"
        base = base.where(func.lower(LessonGenerationTask.source_filename).like(pattern))
        count_stmt = count_stmt.where(func.lower(LessonGenerationTask.source_filename).like(pattern))

    if date_from:
        base = base.where(sort_column >= date_from)
        count_stmt = count_stmt.where(sort_column >= date_from)
    if date_to:
        base = base.where(sort_column <= date_to)
        count_stmt = count_stmt.where(sort_column <= date_to)

    return base, count_stmt, sort_column, owner_user


def invalidate_admin_overview_cache() -> None:
    query_cache.invalidate_namespace("admin_overview")


def invalidate_admin_user_activity_summary_cache(user_id: int) -> None:
    query_cache.invalidate_namespace(f"admin_user_summary:{int(user_id)}")


def _get_admin_overview_data_uncached(db: Session, *, now: datetime) -> dict[str, object]:
    today_start = _start_of_day(now)
    last_24_hours = now - timedelta(hours=24)
    seven_days_start = _start_of_day(now) - timedelta(days=6)

    today_new_users = int(db.scalar(select(func.count(User.id)).where(User.created_at >= today_start)) or 0)
    today_redeem_points = int(
        db.scalar(
            select(func.coalesce(func.sum(WalletLedger.delta_amount_cents), 0)).where(
                WalletLedger.created_at >= today_start,
                WalletLedger.event_type == "redeem_code",
            )
        )
        or 0
    )
    today_spent_points = int(
        db.scalar(
            select(func.coalesce(func.sum(case((WalletLedger.delta_amount_cents < 0, -WalletLedger.delta_amount_cents), else_=0)), 0)).where(
                WalletLedger.created_at >= today_start,
                WalletLedger.event_type.in_(["consume", "consume_translate"]),
            )
        )
        or 0
    )
    translation_failures_24h = int(
        db.scalar(
            select(func.count(TranslationRequestLog.id)).where(
                TranslationRequestLog.created_at >= last_24_hours,
                TranslationRequestLog.success.is_(False),
            )
        )
        or 0
    )
    redeem_failures_24h = int(
        db.scalar(
            select(func.count(RedeemCodeAttempt.id)).where(
                RedeemCodeAttempt.created_at >= last_24_hours,
                RedeemCodeAttempt.success.is_(False),
            )
        )
        or 0
    )
    active_batches = int(
        db.scalar(select(func.count(RedeemCodeBatch.id)).where(RedeemCodeBatch.status == "active", RedeemCodeBatch.expire_at > now)) or 0
    )

    _, recent_batch_rows = list_redeem_batches(db, keyword="", status="all", page=1, page_size=5, now=now)
    recent_operation_rows = db.execute(
        select(AdminOperationLog, User.email.label("operator_email"))
        .outerjoin(User, User.id == AdminOperationLog.operator_user_id)
        .order_by(AdminOperationLog.created_at.desc(), AdminOperationLog.id.desc())
        .limit(6)
    ).all()

    user_series = _count_by_day(db, select(User.id).where(User.created_at >= seven_days_start), User.id, User.created_at)
    redeem_series = _sum_by_day(
        db,
        select(WalletLedger.id).where(WalletLedger.created_at >= seven_days_start, WalletLedger.event_type == "redeem_code"),
        WalletLedger.delta_amount_cents,
        WalletLedger.created_at,
    )
    spent_series = _sum_by_day(
        db,
        select(WalletLedger.id).where(
            WalletLedger.created_at >= seven_days_start,
            WalletLedger.event_type.in_(["consume", "consume_translate"]),
            WalletLedger.delta_amount_cents < 0,
        ),
        -WalletLedger.delta_amount_cents,
        WalletLedger.created_at,
    )
    translation_failure_series = _count_by_day(
        db,
        select(TranslationRequestLog.id).where(TranslationRequestLog.created_at >= seven_days_start, TranslationRequestLog.success.is_(False)),
        TranslationRequestLog.id,
        TranslationRequestLog.created_at,
    )
    redeem_failure_series = _count_by_day(
        db,
        select(RedeemCodeAttempt.id).where(RedeemCodeAttempt.created_at >= seven_days_start, RedeemCodeAttempt.success.is_(False)),
        RedeemCodeAttempt.id,
        RedeemCodeAttempt.created_at,
    )

    batch_rows = db.execute(select(RedeemCodeBatch.status, RedeemCodeBatch.expire_at)).all()
    batch_status_counter: Counter[str] = Counter()
    for status, expire_at in batch_rows:
        if status == "expired" or (expire_at and expire_at <= now):
            batch_status_counter["已过期"] += 1
        elif status == "paused":
            batch_status_counter["已暂停"] += 1
        else:
            batch_status_counter["进行中"] += 1

    overview_points = _build_daily_points(
        7,
        now,
        {
            "新增账号": user_series,
            "充值金额": redeem_series,
            "消耗金额": spent_series,
            "异常数": {key: translation_failure_series.get(key, 0) + redeem_failure_series.get(key, 0) for key in set(translation_failure_series) | set(redeem_failure_series)},
        },
    )

    return {
        "metrics": {
            "today_new_users": today_new_users,
            "today_redeem_points": today_redeem_points,
            "today_spent_points": today_spent_points,
            "translation_failures_24h": translation_failures_24h,
            "incidents_24h": translation_failures_24h + redeem_failures_24h,
            "active_batches": active_batches,
        },
        "recent_batches": recent_batch_rows,
        "recent_operations": recent_operation_rows,
        "summary_cards": [
            {"label": "今日新增账号", "value": today_new_users, "hint": "按北京时间今天统计", "tone": "info"},
            {"label": "今日充值金额", "value": today_redeem_points, "hint": "仅统计兑换码入账", "tone": "success"},
            {"label": "今日消耗金额", "value": today_spent_points, "hint": "转写与翻译合计", "tone": "warning"},
            {"label": "近 24 小时异常", "value": translation_failures_24h + redeem_failures_24h, "hint": "翻译失败 + 兑换失败", "tone": "danger"},
        ],
        "charts": [
            {
                "title": "近 7 天核心趋势",
                "description": "同一张图里看新增、充值、消耗和异常，先判断今天该优先处理哪条链路。",
                "type": "line",
                "x_key": "label",
                "series": [
                    {"key": "新增账号", "name": "新增账号", "color": CHART_COLORS["blue"]},
                    {"key": "充值金额", "name": "充值金额", "color": CHART_COLORS["green"]},
                    {"key": "消耗金额", "name": "消耗金额", "color": CHART_COLORS["amber"]},
                    {"key": "异常数", "name": "异常数", "color": CHART_COLORS["rose"]},
                ],
                "data": overview_points,
            },
            {
                "title": "当前批次状态分布",
                "description": "快速判断活动批次是否需要暂停、续期或清理。",
                "type": "bar",
                "x_key": "label",
                "series": [{"key": "value", "name": "批次数", "color": CHART_COLORS["violet"]}],
                "data": [{"label": label, "value": value} for label, value in batch_status_counter.items()],
            },
            {
                "title": "近 24 小时异常来源",
                "description": "异常拆成翻译链路和兑换链路，方便直接分派。",
                "type": "bar",
                "x_key": "label",
                "series": [{"key": "value", "name": "异常数", "color": CHART_COLORS["rose"]}],
                "data": [
                    {"label": "翻译失败", "value": translation_failures_24h},
                    {"label": "兑换失败", "value": redeem_failures_24h},
                ],
            },
        ],
    }


def list_admin_operation_logs(
    db: Session,
    *,
    operator_email: str,
    action_type: str,
    target_type: str,
    date_from: datetime | None,
    date_to: datetime | None,
    page: int,
    page_size: int,
) -> dict[str, object]:
    base, count_stmt, operator_user = _operation_log_base(
        operator_email=operator_email,
        action_type=action_type,
        target_type=target_type,
        date_from=date_from,
        date_to=date_to,
    )
    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(AdminOperationLog.created_at.desc(), AdminOperationLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    filtered = base.with_only_columns(
        AdminOperationLog.id,
        AdminOperationLog.created_at,
        AdminOperationLog.action_type,
        AdminOperationLog.target_type,
        operator_user.c.email.label("operator_email"),
    ).subquery()
    operator_count = int(
        db.scalar(select(func.count(func.distinct(filtered.c.operator_email))).select_from(filtered))
        or 0
    )
    timeline_rows = db.execute(
        base.with_only_columns(func.date(AdminOperationLog.created_at), func.count(AdminOperationLog.id))
        .group_by(func.date(AdminOperationLog.created_at))
        .order_by(func.date(AdminOperationLog.created_at))
    ).all()
    action_rows = db.execute(
        base.with_only_columns(AdminOperationLog.action_type, func.count(AdminOperationLog.id))
        .group_by(AdminOperationLog.action_type)
        .order_by(desc(func.count(AdminOperationLog.id)))
        .limit(6)
    ).all()

    return {
        "total": total,
        "rows": [(row[0], row.operator_email) for row in rows],
        "summary_cards": [
            {"label": "匹配日志", "value": total, "hint": "当前筛选条件下的总记录数", "tone": "info"},
            {"label": "活跃操作员", "value": operator_count, "hint": "去重后的操作员邮箱数", "tone": "default"},
            {"label": "动作类型数", "value": len(action_rows), "hint": "当前条件命中的动作种类", "tone": "warning"},
        ],
        "charts": [
            {
                "title": "操作时间趋势",
                "description": "看最近一段时间后台操作是否突然放大。",
                "type": "line",
                "x_key": "label",
                "series": [{"key": "value", "name": "操作次数", "color": CHART_COLORS["blue"]}],
                "data": [{"label": str(bucket)[5:] if bucket else "-", "value": int(count or 0)} for bucket, count in timeline_rows],
            },
            {
                "title": "动作类型分布",
                "description": "Top 6 动作，帮助快速定位最近的后台热点操作。",
                "type": "bar",
                "x_key": "label",
                "series": [{"key": "value", "name": "记录数", "color": CHART_COLORS["violet"]}],
                "data": [{"label": action or "-", "value": int(count or 0)} for action, count in action_rows],
            },
        ],
    }


def list_admin_lesson_task_logs(
    db: Session,
    *,
    status: str,
    user_email: str,
    task_id: str,
    lesson_id: int | None,
    source_filename: str,
    date_from: datetime | None,
    date_to: datetime | None,
    page: int,
    page_size: int,
) -> dict[str, object]:
    ensure_lesson_task_storage_ready(db)
    base, count_stmt, sort_column, owner_user = _lesson_task_base(
        status=status,
        user_email=user_email,
        task_id=task_id,
        lesson_id=lesson_id,
        source_filename=source_filename,
        date_from=date_from,
        date_to=date_to,
    )
    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(sort_column.desc(), LessonGenerationTask.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    detail_rows = db.execute(
        base.with_only_columns(
            LessonGenerationTask.status,
            LessonGenerationTask.resume_available,
            LessonGenerationTask.stages_json,
            LessonGenerationTask.failure_debug_json,
            func.coalesce(LessonGenerationTask.failed_at, LessonGenerationTask.updated_at, LessonGenerationTask.created_at).label("sort_time"),
        )
    ).all()
    failed_count = 0
    resumable_count = 0
    status_counter: Counter[str] = Counter()
    stage_counter: Counter[str] = Counter()
    timeline_counter: Counter[str] = Counter()
    for row in detail_rows:
        task_status = str(row.status or "-")
        status_counter[task_status] += 1
        if row.resume_available:
            resumable_count += 1
        if task_status == "failed":
            failed_count += 1
        stage_name = ""
        if isinstance(row.failure_debug_json, dict):
            stage_name = str(row.failure_debug_json.get("failed_stage") or "")
        if not stage_name:
            stage_name = _infer_current_stage(row.stages_json)
        if stage_name:
            stage_counter[stage_name] += 1
        if row.sort_time:
            timeline_counter[_date_key(row.sort_time)] += 1

    return {
        "total": total,
        "rows": [(row[0], row.user_email) for row in rows],
        "summary_cards": [
            {"label": "匹配任务", "value": total, "hint": "当前筛选条件下的生成任务数", "tone": "info"},
            {"label": "失败任务", "value": failed_count, "hint": "建议先处理失败且最近更新的任务", "tone": "danger"},
            {"label": "可续跑任务", "value": resumable_count, "hint": "无需重新上传素材即可继续处理", "tone": "success"},
        ],
        "charts": [
            {
                "title": "任务时间趋势",
                "description": "看任务量是否突然升高，先判断是入口问题还是链路问题。",
                "type": "line",
                "x_key": "label",
                "series": [{"key": "value", "name": "任务数", "color": CHART_COLORS["blue"]}],
                "data": [{"label": key[5:], "value": value} for key, value in sorted(timeline_counter.items())],
            },
            {
                "title": "状态分布",
                "description": "快速看失败、处理中和已完成各占多少。",
                "type": "bar",
                "x_key": "label",
                "series": [{"key": "value", "name": "任务数", "color": CHART_COLORS["amber"]}],
                "data": [{"label": key, "value": value} for key, value in status_counter.items()],
            },
            {
                "title": "失败阶段分布",
                "description": "按失败阶段聚类，优先看最集中的问题点。",
                "type": "bar",
                "x_key": "label",
                "series": [{"key": "value", "name": "任务数", "color": CHART_COLORS["rose"]}],
                "data": [{"label": key, "value": value} for key, value in stage_counter.most_common(6)],
            },
        ],
    }


def get_admin_lesson_task_log_detail(db: Session, *, task_id: str) -> dict[str, object] | None:
    ensure_lesson_task_storage_ready(db)
    owner_user = User.__table__.alias("lesson_task_owner")
    row = db.execute(
        select(LessonGenerationTask, owner_user.c.email.label("user_email"))
        .outerjoin(owner_user, owner_user.c.id == LessonGenerationTask.owner_user_id)
        .where(LessonGenerationTask.task_id == task_id)
        .limit(1)
    ).first()
    if row is None:
        return None

    translation_attempts = list(
        db.scalars(
            select(TranslationRequestLog)
            .where(TranslationRequestLog.task_id == task_id)
            .order_by(TranslationRequestLog.created_at.asc(), TranslationRequestLog.id.asc())
        ).all()
    )
    has_raw_debug = bool(getattr(row[0], "asr_raw_json", None)) or any(
        bool(str(getattr(item, "raw_request_text", "") or "").strip())
        or bool(str(getattr(item, "raw_response_text", "") or "").strip())
        or bool(str(getattr(item, "raw_error_text", "") or "").strip())
        for item in translation_attempts
    )
    return {
        "row": row[0],
        "user_email": row.user_email,
        "translation_attempts": translation_attempts,
        "has_raw_debug": has_raw_debug,
    }


def get_admin_overview_data(db: Session, *, now: datetime) -> dict[str, object]:
    return query_cache.get_or_set(
        "admin_overview",
        {"bucket": now.replace(second=0, microsecond=0).isoformat()},
        ADMIN_OVERVIEW_TTL_SECONDS,
        lambda: _get_admin_overview_data_uncached(db, now=now),
    )


def list_admin_user_activity(
    db: Session,
    *,
    keyword: str,
    date_from: datetime,
    date_to: datetime,
    page: int,
    page_size: int,
    sort_by: str,
    sort_dir: str,
) -> dict[str, object]:
    ensure_user_activity_schema(db)
    range_end = _range_end_exclusive(date_to)
    normalized_keyword = keyword.strip().lower()

    login_activity = (
        select(
            UserLoginEvent.user_id.label("user_id"),
            func.count(UserLoginEvent.id).label("login_events"),
            func.count(func.distinct(func.date(UserLoginEvent.created_at))).label("login_days"),
            func.max(UserLoginEvent.created_at).label("last_login_at"),
        )
        .where(UserLoginEvent.created_at >= date_from, UserLoginEvent.created_at < range_end)
        .group_by(UserLoginEvent.user_id)
        .subquery()
    )
    lesson_activity = (
        select(
            Lesson.user_id.label("user_id"),
            func.count(Lesson.id).label("lessons_created"),
        )
        .where(Lesson.created_at >= date_from, Lesson.created_at < range_end)
        .group_by(Lesson.user_id)
        .subquery()
    )
    wallet_activity = (
        select(
            WalletLedger.user_id.label("user_id"),
            func.coalesce(func.sum(case((WalletLedger.delta_amount_cents < 0, -WalletLedger.delta_amount_cents), else_=0)), 0).label("consumed_points"),
            func.coalesce(
                func.sum(case((WalletLedger.event_type == "redeem_code", WalletLedger.delta_amount_cents), else_=0)),
                0,
            ).label("redeemed_points"),
        )
        .where(
            WalletLedger.created_at >= date_from,
            WalletLedger.created_at < range_end,
            WalletLedger.event_type.in_(["consume", "consume_translate", "redeem_code"]),
        )
        .group_by(WalletLedger.user_id)
        .subquery()
    )

    base = (
        select(
            User.id,
            User.email,
            User.created_at,
            User.last_login_at,
            func.coalesce(WalletAccount.balance_amount_cents, 0).label("balance_points"),
            func.coalesce(login_activity.c.login_days, 0).label("login_days"),
            func.coalesce(login_activity.c.login_events, 0).label("login_events"),
            func.coalesce(lesson_activity.c.lessons_created, 0).label("lessons_created"),
            func.coalesce(wallet_activity.c.consumed_points, 0).label("consumed_points"),
            func.coalesce(wallet_activity.c.redeemed_points, 0).label("redeemed_points"),
        )
        .join(login_activity, login_activity.c.user_id == User.id)
        .outerjoin(WalletAccount, WalletAccount.user_id == User.id)
        .outerjoin(lesson_activity, lesson_activity.c.user_id == User.id)
        .outerjoin(wallet_activity, wallet_activity.c.user_id == User.id)
    )
    count_stmt = select(func.count()).select_from(
        select(User.id).join(login_activity, login_activity.c.user_id == User.id).subquery()
    )

    if normalized_keyword:
        pattern = f"%{normalized_keyword}%"
        base = base.where(func.lower(User.email).like(pattern))
        count_stmt = select(func.count()).select_from(
            select(User.id)
            .join(login_activity, login_activity.c.user_id == User.id)
            .where(func.lower(User.email).like(pattern))
            .subquery()
        )

    sort_key = (sort_by or "login_events").strip().lower()
    sort_desc = (sort_dir or "desc").strip().lower() != "asc"
    sort_columns = {
        "email": User.email,
        "created_at": User.created_at,
        "last_login_at": func.coalesce(login_activity.c.last_login_at, User.last_login_at),
        "balance_points": func.coalesce(WalletAccount.balance_amount_cents, 0),
        "login_days": login_activity.c.login_days,
        "login_events": login_activity.c.login_events,
        "lessons_created": lesson_activity.c.lessons_created,
        "consumed_points": wallet_activity.c.consumed_points,
        "redeemed_points": wallet_activity.c.redeemed_points,
    }
    sort_column = sort_columns.get(sort_key, login_activity.c.login_events)
    order_column = desc(sort_column) if sort_desc else sort_column.asc()

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(base.order_by(order_column, desc(User.id)).offset((page - 1) * page_size).limit(page_size)).all()

    login_filter = [UserLoginEvent.created_at >= date_from, UserLoginEvent.created_at < range_end]
    if normalized_keyword:
        login_filter.append(func.lower(User.email).like(f"%{normalized_keyword}%"))
    timeline_rows = db.execute(
        select(
            func.date(UserLoginEvent.created_at).label("bucket"),
            func.count(func.distinct(UserLoginEvent.user_id)).label("active_users"),
            func.count(UserLoginEvent.id).label("login_events"),
        )
        .join(User, User.id == UserLoginEvent.user_id)
        .where(*login_filter)
        .group_by(func.date(UserLoginEvent.created_at))
        .order_by(func.date(UserLoginEvent.created_at))
    ).all()
    new_user_filter = [User.created_at >= date_from, User.created_at < range_end]
    if normalized_keyword:
        new_user_filter.append(func.lower(User.email).like(f"%{normalized_keyword}%"))
    new_user_rows = db.execute(
        select(func.date(User.created_at).label("bucket"), func.count(User.id))
        .where(*new_user_filter)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
    ).all()
    new_user_map = {_date_key(bucket): int(count or 0) for bucket, count in new_user_rows}
    timeline_points = []
    cursor = date_from.replace(hour=0, minute=0, second=0, microsecond=0)
    date_to_day = date_to.replace(hour=0, minute=0, second=0, microsecond=0)
    timeline_map = {_date_key(bucket): {"active_users": int(active_users or 0), "login_events": int(login_events or 0)} for bucket, active_users, login_events in timeline_rows}
    while cursor <= date_to_day:
        key = cursor.strftime("%Y-%m-%d")
        timeline_points.append(
            {
                "label": _date_label(cursor),
                "活跃用户": int(timeline_map.get(key, {}).get("active_users", 0)),
                "登录次数": int(timeline_map.get(key, {}).get("login_events", 0)),
                "新增用户": int(new_user_map.get(key, 0)),
            }
        )
        cursor += timedelta(days=1)

    total_login_events = int(
        db.scalar(
            select(func.count(UserLoginEvent.id))
            .join(User, User.id == UserLoginEvent.user_id)
            .where(*login_filter)
        )
        or 0
    )
    total_new_users = int(db.scalar(select(func.count(User.id)).where(*new_user_filter)) or 0)
    total_consumed_points = int(
        db.scalar(
            select(func.coalesce(func.sum(case((WalletLedger.delta_amount_cents < 0, -WalletLedger.delta_amount_cents), else_=0)), 0))
            .join(User, User.id == WalletLedger.user_id)
            .where(
                WalletLedger.created_at >= date_from,
                WalletLedger.created_at < range_end,
                WalletLedger.event_type.in_(["consume", "consume_translate"]),
                *( [func.lower(User.email).like(f"%{normalized_keyword}%")] if normalized_keyword else [] ),
            )
        )
        or 0
    )

    return {
        "total": total,
        "rows": rows,
        "summary_cards": [
            {"label": "活跃用户", "value": total, "hint": "当前时间范围内至少登录一次的用户数", "tone": "info"},
            {"label": "登录次数", "value": total_login_events, "hint": "同一用户多次登录会累计", "tone": "default"},
            {"label": "新增用户", "value": total_new_users, "hint": "同范围内新注册账号数", "tone": "success"},
            {"label": "区间消耗金额", "value": total_consumed_points, "hint": "登录活跃用户在当前范围内的消耗", "tone": "warning"},
        ],
        "charts": [
            {
                "title": "活跃趋势",
                "description": "按天查看活跃用户、登录次数和新增用户。",
                "type": "line",
                "x_key": "label",
                "series": [
                    {"key": "活跃用户", "name": "活跃用户", "color": CHART_COLORS["blue"]},
                    {"key": "登录次数", "name": "登录次数", "color": CHART_COLORS["cyan"]},
                    {"key": "新增用户", "name": "新增用户", "color": CHART_COLORS["green"]},
                ],
                "data": timeline_points,
            }
        ],
        "range_start": date_from,
        "range_end": date_to,
    }


def _get_admin_user_activity_summary_uncached(
    db: Session,
    *,
    user_id: int,
    now: datetime,
    date_from: datetime | None,
    date_to: datetime | None,
) -> dict[str, object]:
    ensure_user_activity_schema(db)
    since_30_days = now - timedelta(days=30)
    range_start = date_from or since_30_days
    range_end = date_to or now
    range_end_exclusive = _range_end_exclusive(range_end)
    latest_lesson_created_at = db.scalar(select(func.max(Lesson.created_at)).where(Lesson.user_id == user_id))
    latest_wallet_event_at = db.scalar(select(func.max(WalletLedger.created_at)).where(WalletLedger.user_id == user_id))
    latest_redeem_at = db.scalar(
        select(func.max(WalletLedger.created_at)).where(
            WalletLedger.user_id == user_id,
            WalletLedger.event_type == "redeem_code",
        )
    )
    lesson_count = int(db.scalar(select(func.count(Lesson.id)).where(Lesson.user_id == user_id)) or 0)
    consumed_points_30d = int(
        db.scalar(
            select(func.coalesce(func.sum(case((WalletLedger.delta_amount_cents < 0, -WalletLedger.delta_amount_cents), else_=0)), 0)).where(
                WalletLedger.user_id == user_id,
                WalletLedger.created_at >= since_30_days,
                WalletLedger.event_type.in_(["consume", "consume_translate"]),
            )
        )
        or 0
    )
    redeemed_points_30d = int(
        db.scalar(
            select(func.coalesce(func.sum(WalletLedger.delta_amount_cents), 0)).where(
                WalletLedger.user_id == user_id,
                WalletLedger.created_at >= since_30_days,
                WalletLedger.event_type == "redeem_code",
            )
        )
        or 0
    )
    latest_login_at = db.scalar(select(func.max(UserLoginEvent.created_at)).where(UserLoginEvent.user_id == user_id))
    login_events_in_range = int(
        db.scalar(
            select(func.count(UserLoginEvent.id)).where(
                UserLoginEvent.user_id == user_id,
                UserLoginEvent.created_at >= range_start,
                UserLoginEvent.created_at < range_end_exclusive,
            )
        )
        or 0
    )
    login_days_in_range = int(
        db.scalar(
            select(func.count(func.distinct(func.date(UserLoginEvent.created_at)))).where(
                UserLoginEvent.user_id == user_id,
                UserLoginEvent.created_at >= range_start,
                UserLoginEvent.created_at < range_end_exclusive,
            )
        )
        or 0
    )
    lessons_created_in_range = int(
        db.scalar(
            select(func.count(Lesson.id)).where(
                Lesson.user_id == user_id,
                Lesson.created_at >= range_start,
                Lesson.created_at < range_end_exclusive,
            )
        )
        or 0
    )
    consumed_points_in_range = int(
        db.scalar(
            select(func.coalesce(func.sum(case((WalletLedger.delta_amount_cents < 0, -WalletLedger.delta_amount_cents), else_=0)), 0)).where(
                WalletLedger.user_id == user_id,
                WalletLedger.created_at >= range_start,
                WalletLedger.created_at < range_end_exclusive,
                WalletLedger.event_type.in_(["consume", "consume_translate"]),
            )
        )
        or 0
    )
    redeemed_points_in_range = int(
        db.scalar(
            select(func.coalesce(func.sum(WalletLedger.delta_amount_cents), 0)).where(
                WalletLedger.user_id == user_id,
                WalletLedger.created_at >= range_start,
                WalletLedger.created_at < range_end_exclusive,
                WalletLedger.event_type == "redeem_code",
            )
        )
        or 0
    )
    return {
        "user_id": user_id,
        "lesson_count": lesson_count,
        "latest_lesson_created_at": latest_lesson_created_at,
        "latest_wallet_event_at": latest_wallet_event_at,
        "latest_redeem_at": latest_redeem_at,
        "latest_login_at": latest_login_at,
        "consumed_points_30d": consumed_points_30d,
        "redeemed_points_30d": redeemed_points_30d,
        "range_start": range_start,
        "range_end": range_end,
        "login_days_in_range": login_days_in_range,
        "login_events_in_range": login_events_in_range,
        "lessons_created_in_range": lessons_created_in_range,
        "consumed_points_in_range": consumed_points_in_range,
        "redeemed_points_in_range": redeemed_points_in_range,
    }


def get_admin_user_activity_summary(
    db: Session,
    *,
    user_id: int,
    now: datetime,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict[str, object]:
    return query_cache.get_or_set(
        f"admin_user_summary:{int(user_id)}",
        {
            "bucket": now.replace(second=0, microsecond=0).isoformat(),
            "date_from": date_from.isoformat() if date_from else "",
            "date_to": date_to.isoformat() if date_to else "",
        },
        ADMIN_USER_SUMMARY_TTL_SECONDS,
        lambda: _get_admin_user_activity_summary_uncached(db, user_id=user_id, now=now, date_from=date_from, date_to=date_to),
    )
