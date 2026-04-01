from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps.auth import get_admin_user
from app.core.errors import error_response
from app.core.timezone import now_shanghai_naive, to_shanghai_aware, to_shanghai_naive
from app.db import get_db
from app.models import Announcement, User
from app.schemas import AnnouncementCreate, AnnouncementItem, AnnouncementListResponse, AnnouncementUpdate

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _to_item(ann: Announcement) -> AnnouncementItem:
    return AnnouncementItem(
        id=ann.id,
        title=ann.title,
        content=ann.content,
        type=ann.type,
        is_active=ann.is_active,
        is_pinned=ann.is_pinned,
        created_at=to_shanghai_aware(ann.created_at),
        updated_at=to_shanghai_aware(ann.updated_at),
    )


@router.get(
    "/announcements",
    response_model=AnnouncementListResponse,
    responses={401: {"model": object}, 403: {"model": object}},
)
def admin_list_announcements(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))

    total = int(db.scalar(select(func.count(Announcement.id))) or 0)

    offset = (page - 1) * page_size
    rows = (
        db.execute(
            select(Announcement)
            .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        .scalars()
        .all()
    )

    return AnnouncementListResponse(
        ok=True,
        page=page,
        page_size=page_size,
        total=total,
        items=[_to_item(r) for r in rows],
    )


@router.post(
    "/announcements",
    response_model=AnnouncementItem,
    responses={400: {"model": object}, 401: {"model": object}, 403: {"model": object}},
)
def admin_create_announcement(
    payload: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    ann = Announcement(
        title=payload.title.strip(),
        content=payload.content.strip(),
        type=payload.type.value if hasattr(payload.type, "value") else str(payload.type),
        is_active=payload.is_active,
        is_pinned=payload.is_pinned,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return _to_item(ann)


@router.put(
    "/announcements/{announcement_id}",
    response_model=AnnouncementItem,
    responses={400: {"model": object}, 401: {"model": object}, 403: {"model": object}, 404: {"model": object}},
)
def admin_update_announcement(
    announcement_id: int,
    payload: AnnouncementUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    ann = db.get(Announcement, announcement_id)
    if not ann:
        return error_response(404, "ANNOUNCEMENT_NOT_FOUND", "公告不存在")

    if payload.title is not None:
        ann.title = payload.title.strip()
    if payload.content is not None:
        ann.content = payload.content.strip()
    if payload.type is not None:
        ann.type = payload.type.value if hasattr(payload.type, "value") else str(payload.type)
    if payload.is_active is not None:
        ann.is_active = payload.is_active
    if payload.is_pinned is not None:
        ann.is_pinned = payload.is_pinned

    ann.updated_at = now_shanghai_naive()
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return _to_item(ann)


@router.delete(
    "/announcements/{announcement_id}",
    responses={401: {"model": object}, 403: {"model": object}, 404: {"model": object}},
)
def admin_delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    ann = db.get(Announcement, announcement_id)
    if not ann:
        return error_response(404, "ANNOUNCEMENT_NOT_FOUND", "公告不存在")

    db.delete(ann)
    db.commit()
    return {"ok": True, "id": announcement_id}
