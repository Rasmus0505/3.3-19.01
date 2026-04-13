from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LessonProgress


def get_progress_for_user(db: Session, lesson_id: int, user_id: int) -> LessonProgress | None:
    return db.scalar(select(LessonProgress).where(LessonProgress.lesson_id == lesson_id, LessonProgress.user_id == user_id))


def create_progress(db: Session, lesson_id: int, user_id: int) -> LessonProgress:
    progress = LessonProgress(lesson_id=lesson_id, user_id=user_id, current_sentence_idx=0, completed_indexes_json=[], last_played_at_ms=0)
    db.add(progress)
    db.flush()
    return progress
