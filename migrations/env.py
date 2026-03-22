from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.db import APP_SCHEMA, Base, DATABASE_URL, is_sqlite_url, schema_name_for_url

from app import models  # noqa: F401


config = context.config
config.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
schema_name = schema_name_for_url(DATABASE_URL)
render_as_batch = is_sqlite_url(DATABASE_URL)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        include_schemas=bool(schema_name),
        version_table_schema=schema_name,
        render_as_batch=render_as_batch,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as raw_connection:
        if schema_name and raw_connection.dialect.name == "postgresql":
            raw_connection.exec_driver_sql(f"CREATE SCHEMA IF NOT EXISTS {APP_SCHEMA}")
            if raw_connection.in_transaction():
                raw_connection.commit()

        connection = raw_connection
        if render_as_batch:
            connection = raw_connection.execution_options(schema_translate_map={APP_SCHEMA: None})

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            include_schemas=bool(schema_name),
            version_table_schema=schema_name,
            render_as_batch=render_as_batch,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
