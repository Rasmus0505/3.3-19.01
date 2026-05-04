"""文件操作工具。"""
from __future__ import annotations

import re
from pathlib import Path


def ensure_dir(path: str | Path) -> Path:
    """确保目录存在，不存在则创建。"""
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_file_extension(path: str | Path) -> str:
    """获取文件扩展名（小写，不含点）。"""
    p = Path(path)
    return p.suffix.lstrip(".").lower()


def sanitize_filename(filename: str, replacement: str = "_") -> str:
    """清理文件名，移除或替换非法字符。"""
    if not filename:
        return "unnamed"

    # Windows 非法字符
    illegal_chars = r'[<>:"/\\|?*\x00-\x1f]'
    filename = re.sub(illegal_chars, replacement, filename)

    # 移除前后空格和点
    filename = filename.strip(". ")

    # 确保不为空
    if not filename:
        return "unnamed"

    return filename


def get_file_size(path: str | Path) -> int:
    """获取文件大小（字节）。"""
    return Path(path).stat().st_size


def get_file_size_mb(path: str | Path) -> float:
    """获取文件大小（MB）。"""
    return get_file_size(path) / (1024 * 1024)


def is_file_exists(path: str | Path) -> bool:
    """检查文件是否存在。"""
    return Path(path).is_file()


def is_dir_exists(path: str | Path) -> bool:
    """检查目录是否存在。"""
    return Path(path).is_dir()


def join_path(*parts: str | Path) -> Path:
    """拼接路径。"""
    return Path(*parts)


def get_absolute_path(path: str | Path, base_dir: str | Path | None = None) -> Path:
    """获取绝对路径。"""
    p = Path(path)
    if p.is_absolute():
        return p
    if base_dir:
        return Path(base_dir) / p
    return p.resolve()


def list_files(
    directory: str | Path,
    pattern: str = "*",
    recursive: bool = False,
) -> list[Path]:
    """列出目录下的文件。"""
    d = Path(directory)
    if not d.is_dir():
        return []

    if recursive:
        return sorted(d.rglob(pattern))
    return sorted(d.glob(pattern))


def read_text_file(path: str | Path, encoding: str = "utf-8") -> str:
    """读取文本文件内容。"""
    return Path(path).read_text(encoding=encoding)


def write_text_file(path: str | Path, content: str, encoding: str = "utf-8") -> None:
    """写入文本文件内容。"""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding=encoding)


def read_bytes_file(path: str | Path) -> bytes:
    """读取二进制文件内容。"""
    return Path(path).read_bytes()


def write_bytes_file(path: str | Path, content: bytes) -> None:
    """写入二进制文件内容。"""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(content)


def delete_file(path: str | Path) -> bool:
    """删除文件。"""
    p = Path(path)
    if p.is_file():
        p.unlink()
        return True
    return False


def delete_dir(path: str | Path, recursive: bool = False) -> bool:
    """删除目录。"""
    p = Path(path)
    if not p.is_dir():
        return False
    if recursive:
        import shutil
        shutil.rmtree(p)
    else:
        p.rmdir()
    return True
