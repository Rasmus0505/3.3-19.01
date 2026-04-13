from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.repositories.announcement import list_active_announcements
from app.schemas.announcement import AnnouncementItem

router = APIRouter(prefix="/api/announcements", tags=["public"])


@router.get("/active", response_model=list[AnnouncementItem])
def get_active_announcements(db: Session = Depends(get_db)):
    """获取当前有效公告列表（登录用户专属）"""
    announcements = list_active_announcements(db)
    return [AnnouncementItem.model_validate(a) for a in announcements]
