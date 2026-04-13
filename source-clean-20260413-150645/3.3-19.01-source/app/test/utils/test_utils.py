"""工具函数单元测试。"""
import pytest
from datetime import datetime
from pathlib import Path

from app.utils.text import (
    normalize_whitespace,
    truncate_text,
    remove_control_characters,
    remove_zero_width_chars,
    clean_text_for_display,
    normalize_for_search,
    split_into_chunks,
)
from app.utils.file import sanitize_filename, get_file_extension


class TestTextUtils:
    """文本工具测试。"""

    def test_truncate_text_short(self):
        """测试不截断短文本。"""
        text = "Hello"
        result = truncate_text(text, max_length=10)
        assert result == "Hello"

    def test_truncate_text_long(self):
        """测试截断长文本。"""
        text = "Hello World"
        result = truncate_text(text, max_length=5)
        assert result == "Hel..."
        assert len(result) == 6

    def test_truncate_text_exactly_length(self):
        """测试恰好长度的文本。"""
        text = "Hello"
        result = truncate_text(text, max_length=5)
        assert result == "Hello"

    def test_truncate_text_empty(self):
        """测试空文本。"""
        assert truncate_text("", max_length=5) == ""
        assert truncate_text("Hello", max_length=0) == ""

    def test_normalize_whitespace(self):
        """测试空白规范化。"""
        assert normalize_whitespace("Hello  World") == "Hello World"
        assert normalize_whitespace("  Hello  World  ") == "Hello World"
        assert normalize_whitespace("\tHello\nWorld\r") == "Hello World"

    def test_remove_control_characters(self):
        """测试移除控制字符。"""
        text = "Hello\x00World\x07Test"
        result = remove_control_characters(text)
        assert result == "HelloWorldTest"

    def test_remove_zero_width_chars(self):
        """测试移除零宽字符。"""
        text = "Hello\u200BWorld\u200DTest"
        result = remove_zero_width_chars(text)
        assert result == "HelloWorldTest"

    def test_clean_text_for_display(self):
        """测试清理文本用于显示。"""
        text = "  Hello\x00World\u200B  "
        result = clean_text_for_display(text)
        assert result == "HelloWorld"

    def test_normalize_for_search(self):
        """测试搜索规范化。"""
        assert normalize_for_search("Hello World") == "hello world"
        assert normalize_for_search("café") == "cafe"

    def test_split_into_chunks(self):
        """测试文本分块。"""
        text = "HelloWorldTest"
        chunks = split_into_chunks(text, chunk_size=5)
        assert len(chunks) == 3
        assert chunks[0] == "Hello"
        assert chunks[1] == "World"
        assert chunks[2] == "Test"

    def test_split_into_chunks_with_overlap(self):
        """测试带重叠的文本分块。"""
        text = "HelloWorldTest"
        chunks = split_into_chunks(text, chunk_size=5, overlap=2)
        assert len(chunks) == 4
        assert chunks[0] == "Hello"
        assert chunks[1] == "World"
        assert chunks[2] == "ldTes"
        assert chunks[3] == "Test"

    def test_split_into_chunks_empty(self):
        """测试空文本分块。"""
        assert split_into_chunks("", chunk_size=5) == []
        assert split_into_chunks("Hello", chunk_size=0) == []


class TestFileUtils:
    """文件工具测试。"""

    def test_sanitize_filename_normal(self):
        """测试正常文件名。"""
        result = sanitize_filename("document.pdf")
        assert result == "document.pdf"

    def test_sanitize_filename_with_spaces(self):
        """测试带空格的文件名。"""
        result = sanitize_filename("my document.pdf")
        assert " " not in result

    def test_sanitize_filename_with_special_chars(self):
        """测试带特殊字符的文件名。"""
        result = sanitize_filename("file@#$.pdf")
        assert "@" not in result
        assert "#" not in result
        assert "$" not in result

    def test_sanitize_filename_with_path(self):
        """测试带路径的文件名（只保留文件名）。"""
        result = sanitize_filename("/path/to/document.pdf")
        assert "/" not in result

    def test_sanitize_filename_empty(self):
        """测试空文件名。"""
        result = sanitize_filename("")
        assert result == "unnamed"

    def test_get_file_extension(self):
        """测试获取文件扩展名。"""
        assert get_file_extension("document.pdf") == "pdf"
        assert get_file_extension("document.PDF") == "pdf"
        assert get_file_extension("archive.tar.gz") == "gz"
        assert get_file_extension("noextension") == ""

    def test_get_file_extension_with_pathlib(self):
        """测试 pathlib 路径的扩展名获取。"""
        from pathlib import Path
        assert get_file_extension(Path("document.pdf")) == "pdf"
