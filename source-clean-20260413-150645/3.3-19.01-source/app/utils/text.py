"""文本处理工具。"""
from __future__ import annotations

import re
import unicodedata
from typing import Any


# 控制字符正则
CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200D\uFEFF]")


def normalize_whitespace(text: str) -> str:
    """规范化空白字符，将多个连续空白合并为一个。"""
    if not text:
        return ""
    return " ".join(text.split())


def truncate_text(text: str, max_length: int, suffix: str = "...") -> str:
    """截断文本到指定长度，添加后缀。"""
    if not text or max_length <= 0:
        return ""
    if len(text) <= max_length:
        return text
    return text[: max_length - len(suffix)] + suffix


def remove_control_characters(text: str) -> str:
    """移除文本中的控制字符（换行符、制表符等除外）。"""
    if not text:
        return ""
    return CONTROL_CHAR_RE.sub("", text)


def remove_zero_width_chars(text: str) -> str:
    """移除文本中的零宽字符。"""
    if not text:
        return ""
    return ZERO_WIDTH_RE.sub("", text)


def clean_text_for_display(text: str) -> str:
    """清理文本用于显示，移除控制字符和零宽字符。"""
    if not text:
        return ""
    text = remove_control_characters(text)
    text = remove_zero_width_chars(text)
    return text.strip()


def normalize_for_search(text: str) -> str:
    """规范化文本用于搜索，转换为小写并移除变音符号。"""
    if not text:
        return ""
    # Unicode 规范化 NFKD，然后移除变音符号
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.lower().strip()


def split_into_chunks(text: str, chunk_size: int, overlap: int = 0) -> list[str]:
    """将文本分割成固定大小的块，可选重叠。"""
    if not text or chunk_size <= 0:
        return []
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be non-negative and less than chunk_size")
    
    chunks = []
    start = 0
    text_len = len(text)
    
    while start < text_len:
        end = start + chunk_size
        chunks.append(text[start:end])
        if end >= text_len:
            break
        start = end - overlap
    
    return chunks


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
        import json
        return json.loads(json.dumps(value, ensure_ascii=False, default=lambda x: getattr(x, "__dict__", str(x))))
    except Exception:
        return {"raw": str(value)}
