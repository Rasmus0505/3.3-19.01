from __future__ import annotations

import os
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import is_sqlite_url, sqlite_schema_translate_map


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db").strip()


def create_database_engine(database_url: str, **kwargs):
    connect_args = dict(kwargs.pop("connect_args", {}))
    if is_sqlite_url(database_url):
        connect_args.setdefault("check_same_thread", False)
        connect_args.setdefault("timeout", 30)

    execution_options = dict(kwargs.pop("execution_options", {}))
    schema_translate_map = sqlite_schema_translate_map(database_url)
    if schema_translate_map:
        execution_options["schema_translate_map"] = {
            **schema_translate_map,
            **execution_options.get("schema_translate_map", {}),
        }

    engine = create_engine(
        database_url,
        future=True,
        pool_pre_ping=True,
        connect_args=connect_args,
        execution_options=execution_options,
        **kwargs,
    )
    if is_sqlite_url(database_url):
        @event.listens_for(engine, "connect")
        def _configure_sqlite_connection(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA busy_timeout=30000")
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
            finally:
                cursor.close()
    return engine


engine = create_database_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
