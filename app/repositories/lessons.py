from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.models import Lesson, LessonProgress, LessonSentence


def list_lessons_for_user(db: Session, user_id: int) -> list[Lesson]:
    return list(db.scalars(select(Lesson).where(Lesson.user_id == user_id).order_by(Lesson.created_at.desc(), Lesson.id.desc())).all())


def list_lesson_catalog_for_user(
    db: Session,
    *,
    user_id: int,
    page: int,
    page_size: int,
    query: str = "",
) -> tuple[list[dict[str, object]], int]:
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(int(page_size or 20), 100))
    offset = (safe_page - 1) * safe_page_size

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

    filters: list[object] = [Lesson.user_id == user_id]
    normalized_query = str(query or "").strip().lower()
    if normalized_query:
        pattern = f"%{normalized_query}%"
        filters.append(
            or_(
                func.lower(Lesson.title).like(pattern),
                func.lower(Lesson.source_filename).like(pattern),
                func.lower(Lesson.asr_model).like(pattern),
            )
        )

    base_stmt = (
        select(
            Lesson,
            func.coalesce(sentence_count_sq.c.sentence_count, 0).label("sentence_count"),
            progress_sq.c.current_sentence_idx,
            progress_sq.c.completed_indexes_json,
            progress_sq.c.last_played_at_ms,
            progress_sq.c.updated_at,
        )
        .outerjoin(sentence_count_sq, sentence_count_sq.c.lesson_id == Lesson.id)
        .outerjoin(progress_sq, progress_sq.c.lesson_id == Lesson.id)
        .where(and_(*filters))
    )

    total = int(db.scalar(select(func.count(Lesson.id)).where(and_(*filters))) or 0)
    rows: Sequence[tuple[Lesson, int, int | None, list[int] | None, int | None, object | None]] = db.execute(
        base_stmt.order_by(Lesson.created_at.desc(), Lesson.id.desc()).offset(offset).limit(safe_page_size)
    ).all()

    items: list[dict[str, object]] = []
    for lesson, sentence_count, current_sentence_idx, completed_indexes_json, last_played_at_ms, updated_at in rows:
        completed_indexes = list(completed_indexes_json or [])
        progress_summary = None
        if current_sentence_idx is not None or completed_indexes or last_played_at_ms:
            progress_summary = {
                "current_sentence_index": int(current_sentence_idx or 0),
                "completed_sentence_count": len(completed_indexes),
                "last_played_at_ms": int(last_played_at_ms or 0),
                "updated_at": updated_at,
            }
        items.append(
            {
                "lesson": lesson,
                "sentence_count": int(sentence_count or 0),
                "progress_summary": progress_summary,
            }
        )
    return items, total


def get_lesson_for_user(db: Session, lesson_id: int, user_id: int) -> Lesson | None:
    lesson = db.get(Lesson, lesson_id)
    if not lesson or lesson.user_id != user_id:
        return None
    return lesson


def get_lesson_sentences(db: Session, lesson_id: int) -> list[LessonSentence]:
    return list(db.scalars(select(LessonSentence).where(LessonSentence.lesson_id == lesson_id).order_by(LessonSentence.idx.asc())).all())


def get_sentence(db: Session, lesson_id: int, idx: int) -> LessonSentence | None:
    return db.scalar(select(LessonSentence).where(LessonSentence.lesson_id == lesson_id, LessonSentence.idx == idx))


def update_lesson_title_for_user(db: Session, lesson_id: int, user_id: int, title: str) -> Lesson | None:
    lesson = get_lesson_for_user(db, lesson_id, user_id)
    if not lesson:
        return None
    lesson.title = title
    db.add(lesson)
    return lesson
