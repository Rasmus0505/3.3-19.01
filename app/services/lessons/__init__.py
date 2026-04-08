"""课程服务模块。

提供课程生成、ASR 处理、翻译等功能的模块化服务。

模块结构：
- generation: 核心课程生成逻辑
- asr_handler: ASR 处理相关
- translation: 翻译处理相关
- checkpoint: 检查点管理
"""

from app.services.lessons.generation import LessonGenerationService
from app.services.lessons.asr_handler import (
    resolve_dashscope_asr_source_url,
    parse_asr_error_detail,
    extract_dashscope_403_failure_message,
    is_dashscope_file_access_forbidden,
    detect_silence_ranges,
    choose_segment_cut,
    split_audio_segments,
    normalize_parallel_runtime_config,
)
from app.services.lessons.translation import (
    sanitize_translation_text,
    prepare_translation_sentences,
    build_translation_failure_debug,
    emit_progress,
    get_translation_batch_chars_scope,
    estimate_translation_cost,
)
from app.services.lessons.checkpoint import (
    CheckpointManager,
    create_checkpoint_manager,
    read_json_file,
    write_json_file,
)

__all__ = [
    # 主服务
    "LessonGenerationService",
    # ASR 处理
    "resolve_dashscope_asr_source_url",
    "parse_asr_error_detail",
    "extract_dashscope_403_failure_message",
    "is_dashscope_file_access_forbidden",
    "detect_silence_ranges",
    "choose_segment_cut",
    "split_audio_segments",
    "normalize_parallel_runtime_config",
    # 翻译处理
    "sanitize_translation_text",
    "prepare_translation_sentences",
    "build_translation_failure_debug",
    "emit_progress",
    "get_translation_batch_chars_scope",
    "estimate_translation_cost",
    # 检查点管理
    "CheckpointManager",
    "create_checkpoint_manager",
    "read_json_file",
    "write_json_file",
]
