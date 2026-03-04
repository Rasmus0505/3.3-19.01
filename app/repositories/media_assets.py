from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MediaAsset


def get_media_asset_for_lesson(db: Session, lesson_id: int) -> MediaAsset | None:
    return db.scalar(select(MediaAsset).where(MediaAsset.lesson_id == lesson_id))
