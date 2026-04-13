from __future__ import annotations

from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Lesson, LessonProgress, LessonSentence, MediaAsset, LessonGenerationTask
from app.repositories.base import Repository

if TYPE_CHECKING:
    pass


class LessonRepository(Repository[Lesson]):
    """Repository for Lesson model operations."""

    def __init__(self, session: Session):
        super().__init__(Lesson, session)

    def get_by_user(self, user_id: int, skip: int = 0, limit: int = 100) -> List[Lesson]:
        return list(
            self.session.scalars(
                select(Lesson)
                .where(Lesson.user_id == user_id)
                .order_by(Lesson.created_at.desc(), Lesson.id.desc())
                .offset(skip)
                .limit(limit)
            )
        )

    def get_by_user_and_status(self, user_id: int, status: str, skip: int = 0, limit: int = 100) -> List[Lesson]:
        return list(
            self.session.scalars(
                select(Lesson)
                .where(Lesson.user_id == user_id, Lesson.status == status)
                .order_by(Lesson.created_at.desc(), Lesson.id.desc())
                .offset(skip)
                .limit(limit)
            )
        )

    def get_with_sentences(self, lesson_id: int) -> Optional[Lesson]:
        return self.session.scalar(
            select(Lesson).options(joinedload(Lesson.sentences)).where(Lesson.id == lesson_id)
        )

    def count_by_user(self, user_id: int) -> int:
        return int(self.session.scalar(select(func.count(Lesson.id)).where(Lesson.user_id == user_id)) or 0)

    def get_sentences_for_lesson(self, lesson_id: int) -> List[LessonSentence]:
        return list(
            self.session.scalars(
                select(LessonSentence)
                .where(LessonSentence.lesson_id == lesson_id)
                .order_by(LessonSentence.idx.asc())
            )
        )

    def update_status(self, lesson_id: int, status: str) -> Optional[Lesson]:
        lesson = self.get(lesson_id)
        if lesson:
            lesson.status = status
            self.session.add(lesson)
            self.session.flush()
        return lesson

    def delete_cascade(self, lesson_id: int) -> bool:
        lesson = self.get(lesson_id)
        if not lesson:
            return False
        self.session.execute(delete(LessonSentence).where(LessonSentence.lesson_id == lesson_id))
        self.session.execute(delete(LessonProgress).where(LessonProgress.lesson_id == lesson_id))
        self.session.execute(delete(MediaAsset).where(MediaAsset.lesson_id == lesson_id))
        self.session.delete(lesson)
        self.session.flush()
        return True

    def get_for_user(self, lesson_id: int, user_id: int) -> Optional[Lesson]:
        return self.session.scalar(
            select(Lesson).where(Lesson.id == lesson_id, Lesson.user_id == user_id)
        )

    def get_progress(self, lesson_id: int, user_id: int) -> Optional[LessonProgress]:
        return self.session.scalar(
            select(LessonProgress).where(
                LessonProgress.lesson_id == lesson_id,
                LessonProgress.user_id == user_id
            )
        )

    def get_generation_tasks_for_user(self, user_id: int, skip: int = 0, limit: int = 50) -> List[LessonGenerationTask]:
        return list(
            self.session.scalars(
                select(LessonGenerationTask)
                .where(LessonGenerationTask.owner_user_id == user_id)
                .order_by(LessonGenerationTask.created_at.desc())
                .offset(skip)
                .limit(limit)
            )
        )

    def get_generation_task(self, task_id: str) -> Optional[LessonGenerationTask]:
        return self.session.scalar(
            select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id)
        )

    def update_progress(
        self,
        lesson_id: int,
        user_id: int,
        current_sentence_idx: int,
        completed_indexes: list[int],
        last_played_at_ms: int,
    ) -> LessonProgress:
        progress = self.get_progress(lesson_id, user_id)
        if progress:
            progress.current_sentence_idx = current_sentence_idx
            progress.completed_indexes_json = completed_indexes
            progress.last_played_at_ms = last_played_at_ms
        else:
            progress = LessonProgress(
                lesson_id=lesson_id,
                user_id=user_id,
                current_sentence_idx=current_sentence_idx,
                completed_indexes_json=completed_indexes,
                last_played_at_ms=last_played_at_ms,
            )
            self.session.add(progress)
        self.session.flush()
        return progress
