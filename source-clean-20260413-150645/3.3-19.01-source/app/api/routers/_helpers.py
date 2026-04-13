from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.repositories.lessons import get_lesson_for_user


def require_lesson_owner(db: Session, lesson_id: int, user_id: int):
    lesson = get_lesson_for_user(db, lesson_id, user_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="课程不存在")
    return lesson
