from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Lesson, LessonSentence


def list_lessons_for_user(db: Session, user_id: int) -> list[Lesson]:
    return list(db.scalars(select(Lesson).where(Lesson.user_id == user_id).order_by(Lesson.created_at.desc())).all())


def get_lesson_for_user(db: Session, lesson_id: int, user_id: int) -> Lesson | None:
    lesson = db.get(Lesson, lesson_id)
    if not lesson or lesson.user_id != user_id:
        return None
    return lesson


def get_lesson_sentences(db: Session, lesson_id: int) -> list[LessonSentence]:
    return list(db.scalars(select(LessonSentence).where(LessonSentence.lesson_id == lesson_id).order_by(LessonSentence.idx.asc())).all())


def get_sentence(db: Session, lesson_id: int, idx: int) -> LessonSentence | None:
    return db.scalar(select(LessonSentence).where(LessonSentence.lesson_id == lesson_id, LessonSentence.idx == idx))
