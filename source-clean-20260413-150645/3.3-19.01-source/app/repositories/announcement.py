from __future__ import annotations

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.models.announcement import Announcement


def list_announcements(db: Session, skip: int = 0, limit: int = 20) -> dict:
    """返回公告列表（按置顶+创建时间倒序）"""
    total = db.execute(select(func.count(Announcement.id))).scalar_one()
    rows = (
        db.execute(
            select(Announcement)
            .order_by(desc(Announcement.is_pinned), desc(Announcement.created_at))
            .offset(skip)
            .limit(limit)
        )
    ).scalars().all()
    return {"items": list(rows), "total": total}


def get_announcement(db: Session, announcement_id: int) -> Announcement | None:
    """按 ID 获取单条公告"""
    return db.execute(select(Announcement).where(Announcement.id == announcement_id)).scalar_one_or_none()


def create_announcement(db: Session, title: str, content: str, type: str, is_active: bool, is_pinned: bool) -> Announcement:
    """创建公告"""
    ann = Announcement(title=title, content=content, type=type, is_active=is_active, is_pinned=is_pinned)
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return ann


def update_announcement(db: Session, announcement_id: int, **fields) -> Announcement | None:
    """更新公告字段"""
    ann = get_announcement(db, announcement_id)
    if not ann:
        return None
    for key, value in fields.items():
        if value is not None and hasattr(ann, key):
            setattr(ann, key, value)
    db.commit()
    db.refresh(ann)
    return ann


def delete_announcement(db: Session, announcement_id: int) -> bool:
    """删除公告"""
    ann = get_announcement(db, announcement_id)
    if not ann:
        return False
    db.delete(ann)
    db.commit()
    return True


def list_active_announcements(db: Session) -> list[Announcement]:
    """获取所有已启用公告（按置顶+创建时间倒序）"""
    return (
        db.execute(
            select(Announcement)
            .where(Announcement.is_active == True)
            .order_by(desc(Announcement.is_pinned), desc(Announcement.created_at))
        )
    ).scalars().all()
