"""Course and CourseScene models for the Unlock Anything course generation engine."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = table_args(Index("ix_courses_user_id_created_at", "user_id", "created_at"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id")), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, comment="素材类型: upload/url/text/ocr")
    source_material_hash: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    material_text: Mapped[str | None] = mapped_column(Text, nullable=True, comment="原始素材文本")
    cefr_level_original: Mapped[str] = mapped_column(String(10), nullable=False, default="", comment="原始素材CEFR难度")
    cefr_level_target: Mapped[str] = mapped_column(String(10), nullable=False, default="", comment="I+1目标CEFR难度")
    outline_json: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="Stage1课程大纲")
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False, comment="draft/outlining/generating/ready/failed")
    scene_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    models_used_json: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False, comment="使用的AI模型列表")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)

    user: Mapped["User"] = relationship(back_populates="courses")
    scenes: Mapped[list["CourseScene"]] = relationship(back_populates="course", cascade="all, delete-orphan", order_by="CourseScene.idx")


class CourseScene(Base):
    __tablename__ = "course_scenes"
    __table_args__ = table_args(Index("ix_course_scenes_course_id_idx", "course_id", "idx"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("courses.id")), nullable=False, index=True)
    idx: Mapped[int] = mapped_column(Integer, nullable=False, comment="场景顺序索引")
    scene_type: Mapped[str] = mapped_column(String(32), nullable=False, comment="dictation/quiz/interactive/discussion")
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    content_json: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="场景内容(类型相关)")
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, comment="pending/generating/ready/failed")
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey(schema_fk("lessons.id")), nullable=True, comment="dictation类型关联的lesson_id")
    models_used_json: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)

    course: Mapped[Course] = relationship(back_populates="scenes")
    lesson: Mapped["Lesson | None"] = relationship()
