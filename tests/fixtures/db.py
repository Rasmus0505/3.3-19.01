"""pytest fixtures: 数据库。"""
from __future__ import annotations

import os
from typing import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base


@pytest.fixture(scope="function")
def db_engine():
    """创建测试用数据库引擎（SQLite 内存）。"""
    database_url = os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False} if database_url.startswith("sqlite") else {},
        poolclass=StaticPool if database_url == "sqlite:///:memory:" else None,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(db_engine) -> Generator[Session, None, None]:
    """创建测试用数据库会话（每个测试函数自动回滚）。"""
    connection = db_engine.connect()
    transaction = connection.begin()
    SessionLocal = sessionmaker(bind=connection)
    session = SessionLocal()

    yield session

    session.close()
    transaction.rollback()
    connection.close()
