"""add CEFR and explanation fields to LessonSentence

Revision ID: 20260408_0039
Revises: 20260408_0038
Create Date: 2026-04-08 15:35:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260408_0039"
down_revision = "20260408_0038"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def upgrade() -> None:
    schema = _schema_name()
    # CEFR 相关字段
    op.add_column("lesson_sentences", sa.Column("cefr_vocab_json", sa.JSON(), nullable=True), schema=schema)
    op.add_column("lesson_sentences", sa.Column("needs_explanation", sa.Boolean(), nullable=False, server_default="0"), schema=schema)

    # 讲解相关字段
    op.add_column("lesson_sentences", sa.Column("explanation_text", sa.String(), nullable=True), schema=schema)
    op.add_column("lesson_sentences", sa.Column("simplified_sentence", sa.String(), nullable=True), schema=schema)
    op.add_column("lesson_sentences", sa.Column("explanation_audio_url", sa.String(length=500), nullable=True), schema=schema)
    op.add_column("lesson_sentences", sa.Column("key_explanations_json", sa.JSON(), nullable=True), schema=schema)


def downgrade() -> None:
    schema = _schema_name()
    op.drop_column("lesson_sentences", "key_explanations_json", schema=schema)
    op.drop_column("lesson_sentences", "explanation_audio_url", schema=schema)
    op.drop_column("lesson_sentences", "simplified_sentence", schema=schema)
    op.drop_column("lesson_sentences", "explanation_text", schema=schema)
    op.drop_column("lesson_sentences", "needs_explanation", schema=schema)
    op.drop_column("lesson_sentences", "cefr_vocab_json", schema=schema)
