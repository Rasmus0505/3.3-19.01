from __future__ import annotations

from typing import TypeVar, Generic, Type, Optional, List

from sqlalchemy.orm import Session

from app.db.base import Base


T = TypeVar("T", bound=Base)


class Repository(Generic[T]):
    """Generic Repository base class for SQLAlchemy models."""

    def __init__(self, model: Type[T], session: Session):
        self._model = model
        self._session = session

    @property
    def session(self) -> Session:
        return self._session

    def get(self, id) -> Optional[T]:
        return self._session.get(self._model, id)

    def get_all(self, skip: int = 0, limit: int = 100) -> List[T]:
        return self._session.query(self._model).offset(skip).limit(limit).all()

    def create(self, **kwargs) -> T:
        instance = self._model(**kwargs)
        self._session.add(instance)
        self._session.flush()
        return instance

    def update(self, id, **kwargs) -> Optional[T]:
        instance = self.get(id)
        if instance:
            for key, value in kwargs.items():
                setattr(instance, key, value)
            self._session.flush()
        return instance

    def delete(self, id) -> bool:
        instance = self.get(id)
        if instance:
            self._session.delete(instance)
            self._session.flush()
            return True
        return False

    def first(self, **kwargs) -> Optional[T]:
        return self._session.query(self._model).filter_by(**kwargs).first()

    def filter(self, skip: int = 0, limit: int = 100, **kwargs) -> List[T]:
        return self._session.query(self._model).filter_by(**kwargs).offset(skip).limit(limit).all()
