"""add usernames and profile api fields

Revision ID: 20260328_0030
Revises: 20260327_0029
Create Date: 2026-03-28 20:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

from app.db import APP_SCHEMA


revision = "20260328_0030"
down_revision = "20260327_0029"
branch_labels = None
depends_on = None


def _schema_name() -> str | None:
    bind = op.get_bind()
    return None if bind.dialect.name == "sqlite" else APP_SCHEMA


def _has_column(table_name: str, column_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return False
    return column_name in {column.get("name") for column in inspector.get_columns(table_name, schema=schema)}


def _has_index(table_name: str, index_name: str, schema: str | None) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name, schema=schema):
        return False
    return any(index.get("name") == index_name for index in inspector.get_indexes(table_name, schema=schema))


def upgrade() -> None:
    schema = _schema_name()

    with op.batch_alter_table("users", schema=schema) as batch_op:
        if not _has_column("users", "username", schema):
            batch_op.add_column(sa.Column("username", sa.String(length=255), nullable=True))
        if not _has_column("users", "username_normalized", schema):
            batch_op.add_column(sa.Column("username_normalized", sa.String(length=255), nullable=True))

    users_table = sa.table(
        "users",
        sa.column("id", sa.Integer()),
        sa.column("username", sa.String(length=255)),
        sa.column("username_normalized", sa.String(length=255)),
    )
    bind = op.get_bind()
    rows = bind.execute(sa.select(users_table.c.id, users_table.c.username, users_table.c.username_normalized)).all()
    for row in rows:
        user_id = int(row.id)
        username = str(row.username or "").strip() or f"user-{user_id}"
        username_normalized = str(row.username_normalized or "").strip() or username.casefold()
        bind.execute(
            users_table.update()
            .where(users_table.c.id == user_id)
            .values(username=username, username_normalized=username_normalized)
        )

    with op.batch_alter_table("users", schema=schema) as batch_op:
        batch_op.alter_column("username", existing_type=sa.String(length=255), nullable=False)
        batch_op.alter_column("username_normalized", existing_type=sa.String(length=255), nullable=False)

    index_name = op.f("ix_users_username_normalized")
    if not _has_index("users", index_name, schema):
        op.create_index(index_name, "users", ["username_normalized"], unique=True, schema=schema)


def downgrade() -> None:
    schema = _schema_name()
    index_name = op.f("ix_users_username_normalized")
    if _has_index("users", index_name, schema):
        op.drop_index(index_name, table_name="users", schema=schema)
    with op.batch_alter_table("users", schema=schema) as batch_op:
        if _has_column("users", "username_normalized", schema):
            batch_op.drop_column("username_normalized")
        if _has_column("users", "username", schema):
            batch_op.drop_column("username")
