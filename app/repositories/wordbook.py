from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.models import Lesson, WordbookEntry, WordbookEntrySource


def get_wordbook_entry_by_identity(db: Session, *, user_id: int, normalized_text: str, entry_type: str) -> WordbookEntry | None:
    return db.scalar(
        select(WordbookEntry).where(
            WordbookEntry.user_id == user_id,
            WordbookEntry.normalized_text == normalized_text,
            WordbookEntry.entry_type == entry_type,
        )
    )


def get_wordbook_entry_for_user(db: Session, *, entry_id: int, user_id: int) -> WordbookEntry | None:
    return db.scalar(select(WordbookEntry).where(WordbookEntry.id == entry_id, WordbookEntry.user_id == user_id))


def get_wordbook_source_link(db: Session, *, entry_id: int, lesson_id: int, sentence_idx: int) -> WordbookEntrySource | None:
    return db.scalar(
        select(WordbookEntrySource).where(
            WordbookEntrySource.entry_id == entry_id,
            WordbookEntrySource.lesson_id == lesson_id,
            WordbookEntrySource.sentence_idx == sentence_idx,
        )
    )


def list_wordbook_entries(
    db: Session,
    *,
    user_id: int,
    status: str = "active",
    source_lesson_id: int | None = None,
    sort: str = "recent",
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    entry_filters: list[object] = [WordbookEntry.user_id == user_id, WordbookEntry.status == status]
    if source_lesson_id:
        entry_filters.append(
            exists(
                select(1).where(
                    WordbookEntrySource.entry_id == WordbookEntry.id,
                    WordbookEntrySource.lesson_id == int(source_lesson_id),
                )
            )
        )

    source_count_sq = (
        select(
            WordbookEntrySource.entry_id.label("entry_id"),
            func.count(WordbookEntrySource.id).label("source_count"),
        )
        .group_by(WordbookEntrySource.entry_id)
        .subquery()
    )

    stmt = (
        select(
            WordbookEntry,
            Lesson.title.label("source_lesson_title"),
            func.coalesce(source_count_sq.c.source_count, 0).label("source_count"),
        )
        .outerjoin(Lesson, Lesson.id == WordbookEntry.latest_lesson_id)
        .outerjoin(source_count_sq, source_count_sq.c.entry_id == WordbookEntry.id)
        .where(*entry_filters)
    )
    if str(sort or "").lower() == "oldest":
        stmt = stmt.order_by(WordbookEntry.latest_collected_at.asc(), WordbookEntry.id.asc())
    else:
        stmt = stmt.order_by(WordbookEntry.latest_collected_at.desc(), WordbookEntry.id.desc())

    rows: Sequence[tuple[WordbookEntry, str | None, int]] = db.execute(stmt).all()
    items = [
        {
            "entry": entry,
            "source_lesson_title": str(source_lesson_title or ""),
            "source_count": int(source_count or 0),
        }
        for entry, source_lesson_title, source_count in rows
    ]

    available_lesson_rows = db.execute(
        select(Lesson.id, Lesson.title)
        .join(WordbookEntrySource, WordbookEntrySource.lesson_id == Lesson.id)
        .join(WordbookEntry, WordbookEntry.id == WordbookEntrySource.entry_id)
        .where(WordbookEntry.user_id == user_id, WordbookEntry.status == status)
        .distinct()
        .order_by(Lesson.title.asc(), Lesson.id.asc())
    ).all()
    available_lessons = [{"lesson_id": int(lesson_id), "title": str(title or f"课程 {lesson_id}")} for lesson_id, title in available_lesson_rows]
    return items, available_lessons


def build_wordbook_entry_payload(db: Session, *, entry_id: int, user_id: int) -> dict[str, object] | None:
    source_count_sq = (
        select(
            WordbookEntrySource.entry_id.label("entry_id"),
            func.count(WordbookEntrySource.id).label("source_count"),
        )
        .group_by(WordbookEntrySource.entry_id)
        .subquery()
    )
    row = db.execute(
        select(
            WordbookEntry,
            Lesson.title.label("source_lesson_title"),
            func.coalesce(source_count_sq.c.source_count, 0).label("source_count"),
        )
        .outerjoin(Lesson, Lesson.id == WordbookEntry.latest_lesson_id)
        .outerjoin(source_count_sq, source_count_sq.c.entry_id == WordbookEntry.id)
        .where(WordbookEntry.id == entry_id, WordbookEntry.user_id == user_id)
    ).one_or_none()
    if not row:
        return None
    entry, source_lesson_title, source_count = row
    return {
        "entry": entry,
        "source_lesson_title": str(source_lesson_title or ""),
        "source_count": int(source_count or 0),
    }
