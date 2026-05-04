"""JSON 处理工具。"""
from __future__ import annotations

import json
from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any


def safe_json_dumps(
    obj: Any,
    *,
    default: Callable[[Any], Any] | None = None,
    ensure_ascii: bool = False,
    indent: int | None = None,
    **kwargs,
) -> str:
    """安全的 JSON 序列化，处理特殊类型。"""

    def default_handler(o: Any) -> Any:
        if isinstance(o, datetime):
            return o.isoformat()
        if isinstance(o, date):
            return o.isoformat()
        if isinstance(o, Decimal):
            return float(o)
        if hasattr(o, "__dict__"):
            return o.__dict__
        if default:
            return default(o)
        return str(o)

    return json.dumps(
        obj,
        default=default_handler,
        ensure_ascii=ensure_ascii,
        indent=indent,
        **kwargs,
    )


def safe_json_loads(s: str | bytes) -> Any:
    """安全的 JSON 反序列化。"""
    return json.loads(s)


def read_json_file(path: str | Path) -> Any:
    """读取 JSON 文件。"""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json_file(
    path: str | Path,
    obj: Any,
    *,
    indent: int = 2,
    default: Callable[[Any], Any] | None = None,
) -> None:
    """写入 JSON 文件。"""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    content = safe_json_dumps(obj, indent=indent, default=default)
    p.write_text(content, encoding="utf-8")


def to_dict(value: Any) -> dict[str, Any]:
    """将任意值转换为字典。"""
    if isinstance(value, dict):
        return value
    if hasattr(value, "to_dict"):
        try:
            res = value.to_dict()
            if isinstance(res, dict):
                return res
        except Exception:
            pass
    if value is None:
        return {}
    try:
        return json.loads(json.dumps(value, ensure_ascii=False, default=lambda x: getattr(x, "__dict__", str(x))))
    except Exception:
        return {"raw": str(value)}


class JsonFileCache:
    """简单的 JSON 文件缓存。"""

    def __init__(self, cache_dir: str | Path):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, Any] = {}

    def get(self, key: str) -> Any | None:
        """获取缓存值。"""
        if key in self._cache:
            return self._cache[key]

        cache_file = self.cache_dir / f"{key}.json"
        if cache_file.is_file():
            try:
                value = read_json_file(cache_file)
                self._cache[key] = value
                return value
            except Exception:
                return None
        return None

    def set(self, key: str, value: Any) -> None:
        """设置缓存值。"""
        self._cache[key] = value
        cache_file = self.cache_dir / f"{key}.json"
        write_json_file(cache_file, value)

    def delete(self, key: str) -> bool:
        """删除缓存值。"""
        if key in self._cache:
            del self._cache[key]
        cache_file = self.cache_dir / f"{key}.json"
        if cache_file.is_file():
            cache_file.unlink()
            return True
        return False

    def clear(self) -> None:
        """清空所有缓存。"""
        self._cache.clear()
        for cache_file in self.cache_dir.glob("*.json"):
            cache_file.unlink()
