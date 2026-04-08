"""课程服务模块。

提供课程生成、ASR 处理、翻译等功能的模块化服务。

模块结构：
- generation: 核心课程生成逻辑
- asr_handler: ASR 处理相关
- translation: 翻译处理相关
- audio: 音频处理相关
- cache: 缓存管理相关
"""

from app.services.lessons.generation import LessonGenerationService

__all__ = [
    "LessonGenerationService",
]
