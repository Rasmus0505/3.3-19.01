"""VoiceProfile — user voice cloning profiles for Qwen TTS VC."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args

if TYPE_CHECKING:
    from app.models import User


class VoiceProfile(Base):
    """User voice cloning profile stored in the database.

    Stores the voice name returned by the DashScope voice cloning API,
    allowing users to use their custom voice for TTS synthesis.
    """

    __tablename__ = "voice_profiles"
    __table_args__ = table_args()

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    voice_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    preferred_name: Mapped[str] = mapped_column(String(64), nullable=False)
    target_model: Mapped[str] = mapped_column(String(100), nullable=False)
    language: Mapped[str] = mapped_column(String(10), nullable=True)
    gmt_create: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    gmt_used: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship(back_populates="voice_profiles")
