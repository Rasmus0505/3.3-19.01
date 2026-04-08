"""课程生成服务 - 模块化重构起点。

此文件定义了重构后课程服务的接口和核心逻辑框架。
随着重构的推进，各功能模块将从 lesson_service.py 迁移到此处。

当前状态：定义接口契约，实际逻辑仍在 lesson_service.py 中。

目标模块结构：
    app/services/lessons/
    ├── __init__.py          # 统一导出
    ├── generation.py        # 课程生成主逻辑
    ├── asr_handler.py        # ASR 处理
    ├── translation.py         # 翻译处理
    ├── audio.py              # 音频处理
    └── cache.py              # 缓存管理
"""
from __future__ import annotations

from typing import Any, Callable, Optional
from pathlib import Path

from sqlalchemy.orm import Session


class LessonGenerationService:
    """课程生成服务（重构目标）。"""

    @staticmethod
    async def generate_lesson(
        *,
        media_url: str,
        user_id: int,
        db: Session,
        options: dict[str, Any] | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """
        从媒体文件生成课程。

        Args:
            media_url: 媒体文件 URL
            user_id: 用户 ID
            db: 数据库会话
            options: 生成选项
            progress_callback: 进度回调

        Returns:
            生成结果字典
        """
        # TODO: 迁移 lesson_service.py 中的 generate_lesson 逻辑
        raise NotImplementedError("重构中")

    @staticmethod
    async def build_subtitle_variant(
        *,
        asr_payload: dict[str, Any],
        db: Session,
        task_id: str | None = None,
        allow_partial_translation: bool = False,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """
        构建字幕变体。

        迁移自 LessonService.build_subtitle_variant
        """
        # TODO: 迁移 lesson_service.py 中的 build_subtitle_variant 逻辑
        raise NotImplementedError("重构中")


# 导出兼容层：允许新代码使用新模块，同时保持旧代码兼容
from app.services.lesson_service import LessonService

# 为了向后兼容，提供别名
LegacyLessonService = LessonService

__all__ = [
    "LessonGenerationService",
    "LegacyLessonService",
]
