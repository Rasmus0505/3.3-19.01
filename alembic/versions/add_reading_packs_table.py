"""add reading_packs table

Revision ID: add_reading_packs
Revises: add_course_tables
Create Date: 2026-04-11
"""

from alembic import op
import sqlalchemy as sa

revision = "add_reading_packs"
down_revision = "add_course_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reading_packs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("article_id", sa.String(255), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("original_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("rewritten_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("target_level", sa.String(10), nullable=False, server_default="B1"),
        sa.Column("flow_status", sa.String(32), nullable=False, server_default="idle"),
        sa.Column("mappings_json", sa.JSON(), nullable=True),
        sa.Column("word_levels_json", sa.JSON(), nullable=True),
        sa.Column("valid_i1_words_json", sa.JSON(), nullable=True),
        sa.Column("valid_above_i1_words_json", sa.JSON(), nullable=True),
        sa.Column("removed_words_json", sa.JSON(), nullable=True),
        sa.Column("diagnostic_json", sa.JSON(), nullable=True),
        sa.Column("quiz_json", sa.JSON(), nullable=True),
        sa.Column("vocab_cards_json", sa.JSON(), nullable=True),
        sa.Column("course_data_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "article_id", name="uq_reading_pack_user_article"),
    )


def downgrade() -> None:
    op.drop_table("reading_packs")
