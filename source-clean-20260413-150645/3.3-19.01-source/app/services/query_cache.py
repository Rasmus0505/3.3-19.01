from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass
from typing import Callable, TypeVar


CacheValue = TypeVar("CacheValue")


@dataclass(slots=True)
class _CacheEntry:
    value: object
    expires_at: float


class QueryCache:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._namespaces: dict[str, dict[str, _CacheEntry]] = {}

    def _serialize_key(self, key: object) -> str:
        return json.dumps(key, ensure_ascii=False, sort_keys=True, default=str)

    def get(self, namespace: str, key: object) -> object | None:
        serialized = self._serialize_key(key)
        now = time.monotonic()
        with self._lock:
            bucket = self._namespaces.get(namespace)
            if not bucket:
                return None
            entry = bucket.get(serialized)
            if entry is None:
                return None
            if entry.expires_at <= now:
                bucket.pop(serialized, None)
                if not bucket:
                    self._namespaces.pop(namespace, None)
                return None
            return entry.value

    def set(self, namespace: str, key: object, value: CacheValue, ttl_seconds: int) -> CacheValue:
        serialized = self._serialize_key(key)
        expires_at = time.monotonic() + max(1, int(ttl_seconds or 1))
        with self._lock:
            bucket = self._namespaces.setdefault(namespace, {})
            bucket[serialized] = _CacheEntry(value=value, expires_at=expires_at)
        return value

    def get_or_set(self, namespace: str, key: object, ttl_seconds: int, loader: Callable[[], CacheValue]) -> CacheValue:
        cached = self.get(namespace, key)
        if cached is not None:
            return cached  # type: ignore[return-value]
        value = loader()
        return self.set(namespace, key, value, ttl_seconds)

    def invalidate_namespace(self, namespace: str) -> None:
        with self._lock:
            self._namespaces.pop(namespace, None)

    def clear(self) -> None:
        with self._lock:
            self._namespaces.clear()


query_cache = QueryCache()


def clear_query_caches() -> None:
    query_cache.clear()
