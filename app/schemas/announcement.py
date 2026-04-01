from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class AnnouncementType(str, Enum):
    CHANGELOG = "changelog"
    BANNER = "banner"
    MODAL = "modal"


class AnnouncementBase(BaseModel):
    title: str = Field(..., max_length=200, description="公告标题")
    content: str = Field(..., description="公告内容，支持 Markdown")
    type: AnnouncementType = Field(default=AnnouncementType.BANNER)
    is_active: bool = Field(default=True)
    is_pinned: bool = Field(default=False)


class AnnouncementCreate(AnnouncementBase):
    pass


class AnnouncementUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = None
    type: AnnouncementType | None = None
    is_active: bool | None = None
    is_pinned: bool | None = None


class AnnouncementItem(BaseModel):
    id: int
    title: str
    content: str
    type: AnnouncementType
    is_active: bool
    is_pinned: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AnnouncementListResponse(BaseModel):
    ok: bool = True
    items: list[AnnouncementItem]
    total: int
