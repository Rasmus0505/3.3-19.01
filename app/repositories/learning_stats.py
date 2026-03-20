from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.learning_stats import UserLearningDailyStat


def get_learning_daily_stat(db: Session, *, user_id: int, stat_date: date) -> UserLearningDailyStat | None:
    return db.scalar(
        select(UserLearningDailyStat).where(
            UserLearningDailyStat.user_id == user_id,
            UserLearningDailyStat.stat_date == stat_date,
        )
    )


def get_or_create_learning_daily_stat(
    db: Session,
    *,
    user_id: int,
    stat_date: date,
    event_time: datetime,
) -> UserLearningDailyStat:
    row = get_learning_daily_stat(db, user_id=user_id, stat_date=stat_date)
    if row is not None:
        return row
    row = UserLearningDailyStat(
        user_id=user_id,
        stat_date=stat_date,
        completed_sentences=0,
        check_attempts=0,
        check_passes=0,
        learning_actions=0,
        growth_points=0,
        task_completions=0,
        completed_lessons=0,
        last_learning_at=event_time,
    )
    db.add(row)
    db.flush()
    return row


def apply_learning_daily_activity(
    db: Session,
    *,
    user_id: int,
    stat_date: date,
    event_time: datetime,
    completed_delta: int = 0,
    check_attempts_delta: int = 0,
    check_passes_delta: int = 0,
    learning_actions_delta: int = 0,
    growth_points_delta: int = 0,
    task_completions_delta: int = 0,
    completed_lessons_delta: int = 0,
) -> UserLearningDailyStat:
    row = get_or_create_learning_daily_stat(db, user_id=user_id, stat_date=stat_date, event_time=event_time)
    row.completed_sentences = max(0, int(row.completed_sentences or 0) + max(0, int(completed_delta or 0)))
    row.check_attempts = max(0, int(row.check_attempts or 0) + max(0, int(check_attempts_delta or 0)))
    row.check_passes = max(0, int(row.check_passes or 0) + max(0, int(check_passes_delta or 0)))
    row.learning_actions = max(0, int(row.learning_actions or 0) + max(0, int(learning_actions_delta or 0)))
    row.growth_points = max(0, int(row.growth_points or 0) + max(0, int(growth_points_delta or 0)))
    row.task_completions = max(0, int(row.task_completions or 0) + max(0, int(task_completions_delta or 0)))
    row.completed_lessons = max(0, int(row.completed_lessons or 0) + max(0, int(completed_lessons_delta or 0)))
    if row.last_learning_at is None or event_time >= row.last_learning_at:
        row.last_learning_at = event_time
    db.add(row)
    db.flush()
    return row


def list_learning_daily_stats(
    db: Session,
    *,
    user_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[UserLearningDailyStat]:
    statement = select(UserLearningDailyStat).where(UserLearningDailyStat.user_id == user_id)
    if start_date is not None:
        statement = statement.where(UserLearningDailyStat.stat_date >= start_date)
    if end_date is not None:
        statement = statement.where(UserLearningDailyStat.stat_date <= end_date)
    return list(db.scalars(statement.order_by(UserLearningDailyStat.stat_date.asc(), UserLearningDailyStat.id.asc())).all())
