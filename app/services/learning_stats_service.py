from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta

from sqlalchemy import case, func, inspect, select, text
from sqlalchemy.orm import Session

from app.core.timezone import now_shanghai_naive, to_shanghai_aware
from app.db import APP_SCHEMA
from app.models.billing import WalletAccount, WalletLedger
from app.models.learning_stats import UserLearningDailyStat
from app.models.lesson import Lesson, LessonProgress, LessonSentence
from app.repositories.learning_stats import apply_learning_daily_activity, list_learning_daily_stats


logger = logging.getLogger(__name__)
SUMMARY_RANGE_DAYS = {7, 30}
STALLED_DAYS_THRESHOLD = 3


def ensure_learning_stats_schema(db: Session) -> bool:
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("learning_stats schema repair missing bind")

    schema = None if bind.dialect.name == "sqlite" else APP_SCHEMA
    inspector = inspect(bind)
    changed = False

    if bind.dialect.name != "sqlite":
        db.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        db.commit()

    if not inspector.has_table(UserLearningDailyStat.__tablename__, schema=schema):
        logger.warning("[DEBUG] learning_stats.schema_repair_create_table")
        UserLearningDailyStat.__table__.create(bind=bind, checkfirst=True)
        db.commit()
        changed = True

    return changed


def record_progress_activity(
    db: Session,
    *,
    user_id: int,
    previous_completed_indexes: list[int] | None,
    next_completed_indexes: list[int] | None,
    event_time: datetime | None = None,
) -> None:
    ensure_learning_stats_schema(db)
    at = event_time or now_shanghai_naive()
    previous = {int(item) for item in list(previous_completed_indexes or []) if isinstance(item, int)}
    current = {int(item) for item in list(next_completed_indexes or []) if isinstance(item, int)}
    completed_delta = max(0, len(current - previous))
    apply_learning_daily_activity(
        db,
        user_id=user_id,
        stat_date=at.date(),
        event_time=at,
        completed_delta=completed_delta,
    )


def record_check_activity(
    db: Session,
    *,
    user_id: int,
    passed: bool,
    event_time: datetime | None = None,
) -> None:
    ensure_learning_stats_schema(db)
    at = event_time or now_shanghai_naive()
    apply_learning_daily_activity(
        db,
        user_id=user_id,
        stat_date=at.date(),
        event_time=at,
        check_attempts_delta=1,
        check_passes_delta=1 if passed else 0,
    )


def _format_percent(value: float) -> str:
    return f"{value:.1f}%"


def _date_label(value: date) -> str:
    return value.strftime("%m-%d")


def _start_of_day(value: date) -> datetime:
    return datetime.combine(value, time.min)


def _end_of_day_exclusive(value: date) -> datetime:
    return _start_of_day(value + timedelta(days=1))


def _build_streak_days(activity_dates: set[date]) -> int:
    if not activity_dates:
        return 0
    cursor = max(activity_dates)
    streak = 0
    while cursor in activity_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _serialize_lesson_target(item: dict | None) -> dict | None:
    if not item:
        return None
    return {
        "lesson_id": int(item["lesson_id"]),
        "title": str(item["title"]),
        "sentence_count": int(item["sentence_count"]),
        "completed_sentence_count": int(item["completed_sentence_count"]),
        "progress_percent": float(item["progress_percent"]),
        "updated_at": to_shanghai_aware(item.get("updated_at")),
    }


def _load_lesson_progress_rows(db: Session, *, user_id: int) -> list[dict[str, object]]:
    sentence_count_sq = (
        select(LessonSentence.lesson_id.label("lesson_id"), func.count(LessonSentence.id).label("sentence_count"))
        .group_by(LessonSentence.lesson_id)
        .subquery()
    )
    progress_sq = (
        select(
            LessonProgress.lesson_id.label("lesson_id"),
            LessonProgress.current_sentence_idx.label("current_sentence_idx"),
            LessonProgress.completed_indexes_json.label("completed_indexes_json"),
            LessonProgress.last_played_at_ms.label("last_played_at_ms"),
            LessonProgress.updated_at.label("updated_at"),
        )
        .where(LessonProgress.user_id == user_id)
        .subquery()
    )
    rows = db.execute(
        select(
            Lesson.id,
            Lesson.title,
            Lesson.created_at,
            func.coalesce(sentence_count_sq.c.sentence_count, 0).label("sentence_count"),
            progress_sq.c.current_sentence_idx,
            progress_sq.c.completed_indexes_json,
            progress_sq.c.last_played_at_ms,
            progress_sq.c.updated_at,
        )
        .outerjoin(sentence_count_sq, sentence_count_sq.c.lesson_id == Lesson.id)
        .outerjoin(progress_sq, progress_sq.c.lesson_id == Lesson.id)
        .where(Lesson.user_id == user_id)
        .order_by(Lesson.created_at.desc(), Lesson.id.desc())
    ).all()
    items: list[dict[str, object]] = []
    for lesson_id, title, created_at, sentence_count, current_sentence_idx, completed_indexes_json, last_played_at_ms, updated_at in rows:
        completed_indexes = [int(item) for item in list(completed_indexes_json or [])]
        completed_sentence_count = min(len(completed_indexes), max(0, int(sentence_count or 0)))
        sentence_total = max(0, int(sentence_count or 0))
        progress_percent = round((completed_sentence_count / sentence_total) * 100, 1) if sentence_total else 0.0
        has_progress = bool(
            completed_sentence_count > 0
            or int(current_sentence_idx or 0) > 0
            or int(last_played_at_ms or 0) > 0
            or updated_at is not None
        )
        items.append(
            {
                "lesson_id": int(lesson_id),
                "title": str(title or ""),
                "created_at": created_at,
                "sentence_count": sentence_total,
                "completed_sentence_count": completed_sentence_count,
                "progress_percent": progress_percent,
                "current_sentence_index": max(0, int(current_sentence_idx or 0)),
                "last_played_at_ms": max(0, int(last_played_at_ms or 0)),
                "updated_at": updated_at,
                "is_completed": sentence_total > 0 and completed_sentence_count >= sentence_total,
                "has_progress": has_progress,
            }
        )
    return items


def _build_primary_recommendation(
    *,
    lesson_total: int,
    continue_lesson: dict | None,
    stalled_lesson: dict | None,
    near_completion_lesson: dict | None,
    today: date,
) -> dict[str, object]:
    if stalled_lesson:
        updated_at = stalled_lesson.get("updated_at")
        gap_days = 0
        if isinstance(updated_at, datetime):
            gap_days = max(1, (today - updated_at.date()).days)
        return {
            "kind": "resume-stalled",
            "title": "这节课停了有点久",
            "description": f"《{stalled_lesson['title']}》已停滞 {gap_days} 天，回去接着学最容易恢复节奏。",
            "action_label": "回到这节课",
            "lesson_id": int(stalled_lesson["lesson_id"]),
        }
    if near_completion_lesson:
        remaining = max(
            0,
            int(near_completion_lesson["sentence_count"]) - int(near_completion_lesson["completed_sentence_count"]),
        )
        return {
            "kind": "finish-near-completion",
            "title": "这节课快完成了",
            "description": f"《{near_completion_lesson['title']}》还差 {remaining} 句，收尾最容易获得完成反馈。",
            "action_label": "继续完成",
            "lesson_id": int(near_completion_lesson["lesson_id"]),
        }
    if lesson_total <= 0:
        return {
            "kind": "start-first-upload",
            "title": "先生成第一节课",
            "description": "你还没有课程，先上传一份素材，面板才会开始积累趋势和建议。",
            "action_label": "去上传素材",
            "lesson_id": None,
        }
    if continue_lesson:
        return {
            "kind": "continue-learning",
            "title": "今天继续这一节最顺手",
            "description": f"《{continue_lesson['title']}》已经推进到 {int(round(float(continue_lesson['progress_percent'])))}%，继续学习最连贯。",
            "action_label": "继续学习",
            "lesson_id": int(continue_lesson["lesson_id"]),
        }
    return {
        "kind": "start-first-lesson",
        "title": "从最近的课程开始",
        "description": "你已经有课程了，先从最近一节开始，面板会逐步形成更准确的学习反馈。",
        "action_label": "去历史记录",
        "lesson_id": None,
    }


def build_learning_progress_summary(
    db: Session,
    *,
    user_id: int,
    range_days: int,
    now: datetime | None = None,
) -> dict[str, object]:
    ensure_learning_stats_schema(db)
    safe_range_days = int(range_days or 7)
    if safe_range_days not in SUMMARY_RANGE_DAYS:
        raise ValueError(f"unsupported range_days: {safe_range_days}")

    current_time = now or now_shanghai_naive()
    end_date = current_time.date()
    start_date = end_date - timedelta(days=safe_range_days - 1)
    start_at = _start_of_day(start_date)
    end_exclusive = _end_of_day_exclusive(end_date)

    daily_stats = list_learning_daily_stats(db, user_id=user_id, start_date=start_date, end_date=end_date)
    daily_map = {item.stat_date: item for item in daily_stats}
    activity_dates = {item.stat_date for item in daily_stats}

    completed_sentences_in_range = sum(int(item.completed_sentences or 0) for item in daily_stats)
    check_attempts_in_range = sum(int(item.check_attempts or 0) for item in daily_stats)
    check_passes_in_range = sum(int(item.check_passes or 0) for item in daily_stats)
    pass_rate_in_range = round((check_passes_in_range / check_attempts_in_range) * 100, 1) if check_attempts_in_range else 0.0
    recent_learning_at = max((item.last_learning_at for item in daily_stats if item.last_learning_at), default=None)

    chart_points: list[dict[str, object]] = []
    for offset in range(safe_range_days):
        current_date = start_date + timedelta(days=offset)
        row = daily_map.get(current_date)
        attempts = int(row.check_attempts or 0) if row else 0
        passes = int(row.check_passes or 0) if row else 0
        chart_points.append(
            {
                "label": _date_label(current_date),
                "完成句子": int(row.completed_sentences or 0) if row else 0,
                "练习尝试": attempts,
                "通过率": round((passes / attempts) * 100, 1) if attempts else 0.0,
            }
        )

    lesson_rows = _load_lesson_progress_rows(db, user_id=user_id)
    lesson_total = len(lesson_rows)
    lesson_completed_total = sum(1 for item in lesson_rows if item["is_completed"])
    lesson_in_progress_rows = [item for item in lesson_rows if item["has_progress"] and not item["is_completed"]]
    lesson_in_progress_total = len(lesson_in_progress_rows)
    sentence_total = sum(int(item["sentence_count"]) for item in lesson_rows)
    sentence_completed_total = sum(int(item["completed_sentence_count"]) for item in lesson_rows)
    completion_rate = round((sentence_completed_total / sentence_total) * 100, 1) if sentence_total else 0.0

    recent_continue_rows = sorted(
        [item for item in lesson_rows if not item["is_completed"]],
        key=lambda item: (
            item["updated_at"] or item["created_at"] or datetime.min,
            float(item["progress_percent"]),
            int(item["lesson_id"]),
        ),
        reverse=True,
    )
    continue_lesson = recent_continue_rows[0] if recent_continue_rows else None

    stalled_before = current_time - timedelta(days=STALLED_DAYS_THRESHOLD)
    stalled_rows = sorted(
        [
            item
            for item in lesson_in_progress_rows
            if isinstance(item.get("updated_at"), datetime) and item["updated_at"] <= stalled_before
        ],
        key=lambda item: (
            item["updated_at"] or datetime.min,
            -float(item["progress_percent"]),
            -int(item["lesson_id"]),
        ),
    )
    stalled_lesson = stalled_rows[0] if stalled_rows else None

    near_completion_rows = sorted(
        [item for item in lesson_in_progress_rows if float(item["progress_percent"]) >= 75.0],
        key=lambda item: (
            float(item["progress_percent"]),
            item["updated_at"] or item["created_at"] or datetime.min,
            int(item["lesson_id"]),
        ),
        reverse=True,
    )
    near_completion_lesson = near_completion_rows[0] if near_completion_rows else None

    consumed_points_in_range = int(
        db.scalar(
            select(
                func.coalesce(
                    func.sum(case((WalletLedger.delta_amount_cents < 0, -WalletLedger.delta_amount_cents), else_=0)),
                    0,
                )
            ).where(
                WalletLedger.user_id == user_id,
                WalletLedger.created_at >= start_at,
                WalletLedger.created_at < end_exclusive,
                WalletLedger.event_type.in_(["consume", "consume_translate"]),
            )
        )
        or 0
    )
    account = db.scalar(select(WalletAccount).where(WalletAccount.user_id == user_id))
    balance_points = int(getattr(account, "balance_points", 0) or 0)

    status_distribution = [
        {"label": "已完成", "value": lesson_completed_total},
        {"label": "进行中", "value": lesson_in_progress_total},
        {"label": "未开始", "value": max(0, lesson_total - lesson_completed_total - lesson_in_progress_total)},
    ]

    return {
        "range_days": safe_range_days,
        "summary": {
            "streak_days": _build_streak_days(activity_dates),
            "active_days_in_range": len(activity_dates),
            "completed_sentences_in_range": completed_sentences_in_range,
            "check_attempts_in_range": check_attempts_in_range,
            "check_passes_in_range": check_passes_in_range,
            "pass_rate_in_range": pass_rate_in_range,
            "lesson_total": lesson_total,
            "lesson_completed_total": lesson_completed_total,
            "lesson_in_progress_total": lesson_in_progress_total,
            "sentence_total": sentence_total,
            "sentence_completed_total": sentence_completed_total,
            "completion_rate": completion_rate,
            "recent_learning_at": to_shanghai_aware(recent_learning_at),
            "points_consumed_in_range": consumed_points_in_range,
            "balance_points": balance_points,
        },
        "focus_cards": [
            {"label": "连续学习天数", "value": _build_streak_days(activity_dates), "hint": "按最近连续活跃日计算", "tone": "info"},
            {
                "label": f"近 {safe_range_days} 天完成句子数",
                "value": completed_sentences_in_range,
                "hint": "只统计新增完成的句子",
                "tone": "success",
            },
            {
                "label": f"近 {safe_range_days} 天练习通过率",
                "value": _format_percent(pass_rate_in_range),
                "hint": "通过次数 / 练习尝试次数",
                "tone": "warning",
            },
            {
                "label": "累计课程完成率",
                "value": _format_percent(completion_rate),
                "hint": "已完成句子 / 全部句子",
                "tone": "default",
            },
        ],
        "charts": [
            {
                "title": f"近 {safe_range_days} 天学习趋势",
                "description": "看完成句子、练习尝试和通过率是否同步增长。",
                "type": "line",
                "x_key": "label",
                "series": [
                    {"key": "完成句子", "name": "完成句子", "color": "#2563eb"},
                    {"key": "练习尝试", "name": "练习尝试", "color": "#10b981"},
                    {"key": "通过率", "name": "通过率", "color": "#f59e0b"},
                ],
                "data": chart_points,
            },
            {
                "title": "课程状态分布",
                "description": "先看进行中和停滞课程，再决定今天从哪一节继续。",
                "type": "bar",
                "x_key": "label",
                "series": [{"key": "value", "name": "课程数", "color": "#8b5cf6"}],
                "data": status_distribution,
            },
        ],
        "continue_lesson": _serialize_lesson_target(continue_lesson),
        "stalled_lesson": _serialize_lesson_target(stalled_lesson),
        "primary_recommendation": _build_primary_recommendation(
            lesson_total=lesson_total,
            continue_lesson=continue_lesson,
            stalled_lesson=stalled_lesson,
            near_completion_lesson=near_completion_lesson,
            today=end_date,
        ),
    }
