"""Lazy compatibility exports for the lessons package.

This package is imported by task/runtime modules during backend startup.
Keep package initialization lightweight so refactor facades do not create
startup-time circular imports.
"""

from __future__ import annotations

from importlib import import_module

_EXPORT_MAP = {
    "LessonGenerationService": ("app.services.lessons.generation", "LessonGenerationService"),
    "resolve_dashscope_asr_source_url": ("app.services.lessons.asr_handler", "resolve_dashscope_asr_source_url"),
    "parse_asr_error_detail": ("app.services.lessons.asr_handler", "parse_asr_error_detail"),
    "extract_dashscope_403_failure_message": ("app.services.lessons.asr_handler", "extract_dashscope_403_failure_message"),
    "is_dashscope_file_access_forbidden": ("app.services.lessons.asr_handler", "is_dashscope_file_access_forbidden"),
    "detect_silence_ranges": ("app.services.lessons.asr_handler", "detect_silence_ranges"),
    "choose_segment_cut": ("app.services.lessons.asr_handler", "choose_segment_cut"),
    "split_audio_segments": ("app.services.lessons.asr_handler", "split_audio_segments"),
    "normalize_parallel_runtime_config": ("app.services.lessons.asr_handler", "normalize_parallel_runtime_config"),
    "sanitize_translation_text": ("app.services.lessons.translation", "sanitize_translation_text"),
    "prepare_translation_sentences": ("app.services.lessons.translation", "prepare_translation_sentences"),
    "build_translation_failure_debug": ("app.services.lessons.translation", "build_translation_failure_debug"),
    "emit_progress": ("app.services.lessons.translation", "emit_progress"),
    "get_translation_batch_chars_scope": ("app.services.lessons.translation", "get_translation_batch_chars_scope"),
    "estimate_translation_cost": ("app.services.lessons.translation", "estimate_translation_cost"),
    "CheckpointManager": ("app.services.lessons.checkpoint", "CheckpointManager"),
    "create_checkpoint_manager": ("app.services.lessons.checkpoint", "create_checkpoint_manager"),
    "read_json_file": ("app.services.lessons.checkpoint", "read_json_file"),
    "write_json_file": ("app.services.lessons.checkpoint", "write_json_file"),
}

__all__ = list(_EXPORT_MAP)


def __getattr__(name: str):
    target = _EXPORT_MAP.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attr_name = target
    module = import_module(module_name)
    value = getattr(module, attr_name)
    globals()[name] = value
    return value
