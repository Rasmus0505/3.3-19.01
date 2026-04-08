"""检查点管理服务 - 课程服务模块。

提供课程生成过程中的检查点保存和恢复功能。

此文件是从 app/services/lesson_service.py 中提取的检查点相关逻辑。
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

from app.services.lesson_task_manager import patch_task_artifacts, persist_lesson_workspace_summary


logger = logging.getLogger(__name__)

_ASR_RESULT_FILE = "asr_result.json"
_VARIANT_RESULT_FILE = "variant_result.json"
_TRANSLATION_CHECKPOINT_FILE = "translation_checkpoint.json"
_LESSON_RESULT_FILE = "lesson_result.json"
_SEGMENT_RESULT_DIR = "asr_segment_results"


def read_json_file(path: Path) -> dict[str, Any] | None:
    """读取 JSON 文件。

    Args:
        path: 文件路径

    Returns:
        解析后的字典，读取失败返回 None
    """
    try:
        if not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None
    except Exception:
        logger.warning("[DEBUG] lesson.checkpoint.read_failed path=%s", path)
        return None


def write_json_file(path: Path, payload: dict[str, Any]) -> None:
    """写入 JSON 文件。

    Args:
        path: 文件路径
        payload: 要写入的数据
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")


def _json_default(value: Any) -> str:
    """JSON 序列化默认值处理器。

    Args:
        value: 无法序列化的值

    Returns:
        字符串表示

    Raises:
        TypeError: 无法处理的类型
    """
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


class CheckpointManager:
    """检查点管理器。

    管理课程生成过程中的中间状态保存和恢复。
    """

    def __init__(self, workspace_dir: Path):
        """初始化检查点管理器。

        Args:
            workspace_dir: 工作空间目录
        """
        self.workspace_dir = Path(workspace_dir)
        self.asr_result_file = self.workspace_dir / _ASR_RESULT_FILE
        self.variant_result_file = self.workspace_dir / _VARIANT_RESULT_FILE
        self.translation_checkpoint_file = self.workspace_dir / _TRANSLATION_CHECKPOINT_FILE
        self.lesson_result_file = self.workspace_dir / _LESSON_RESULT_FILE
        self.segment_result_dir = self.workspace_dir / _SEGMENT_RESULT_DIR

    def save_asr_result(self, result: dict[str, Any]) -> None:
        """保存 ASR 结果。

        Args:
            result: ASR 结果数据
        """
        write_json_file(self.asr_result_file, result)

    def load_asr_result(self) -> dict[str, Any] | None:
        """加载 ASR 结果。

        Returns:
            ASR 结果数据，不存在返回 None
        """
        return read_json_file(self.asr_result_file)

    def save_translation_checkpoint(self, result: dict[str, Any]) -> None:
        """保存翻译检查点。

        Args:
            result: 翻译检查点数据
        """
        write_json_file(self.translation_checkpoint_file, result)

    def load_translation_checkpoint(self) -> dict[str, Any] | None:
        """加载翻译检查点。

        Returns:
            翻译检查点数据，不存在返回 None
        """
        return read_json_file(self.translation_checkpoint_file)

    def save_variant_result(self, result: dict[str, Any]) -> None:
        """保存字幕变体结果。

        Args:
            result: 字幕变体结果数据
        """
        write_json_file(self.variant_result_file, result)

    def load_variant_result(self) -> dict[str, Any] | None:
        """加载字幕变体结果。

        Returns:
            字幕变体结果数据，不存在返回 None
        """
        return read_json_file(self.variant_result_file)

    def save_lesson_result(self, result: dict[str, Any]) -> None:
        """保存课程结果。

        Args:
            result: 课程结果数据
        """
        write_json_file(self.lesson_result_file, result)

    def load_lesson_result(self) -> dict[str, Any] | None:
        """加载课程结果。

        Returns:
            课程结果数据，不存在返回 None
        """
        return read_json_file(self.lesson_result_file)

    def get_segment_result_dir(self) -> Path:
        """获取分段结果目录。

        Returns:
            分段结果目录路径
        """
        self.segment_result_dir.mkdir(parents=True, exist_ok=True)
        return self.segment_result_dir

    def has_asr_result(self) -> bool:
        """检查是否存在 ASR 结果。

        Returns:
            是否存在
        """
        return self.asr_result_file.exists()

    def has_translation_checkpoint(self) -> bool:
        """检查是否存在翻译检查点。

        Returns:
            是否存在
        """
        return self.translation_checkpoint_file.exists()

    def clear_translation_checkpoint(self) -> None:
        """清除翻译检查点。

        用于重新翻译时清理旧的检查点。
        """
        if self.translation_checkpoint_file.exists():
            self.translation_checkpoint_file.unlink()
            logger.info("[DEBUG] checkpoint.translation_cleared path=%s", self.translation_checkpoint_file)

    def persist_summary(
        self,
        task_id: str,
        asr_duration_ms: int | None = None,
        translate_duration_ms: int | None = None,
    ) -> None:
        """持久化工作空间摘要。

        Args:
            task_id: 任务 ID
            asr_duration_ms: ASR 耗时（毫秒）
            translate_duration_ms: 翻译耗时（毫秒）
        """
        try:
            persist_lesson_workspace_summary(
                task_id=task_id,
                workspace_dir=self.workspace_dir,
                asr_duration_ms=asr_duration_ms,
                translate_duration_ms=translate_duration_ms,
            )
        except Exception:
            logger.exception("[DEBUG] checkpoint.persist_summary_failed task_id=%s", task_id)

    def patch_artifacts(
        self,
        task_id: str,
        lesson_id: int | None = None,
    ) -> None:
        """更新任务产物。

        Args:
            task_id: 任务 ID
            lesson_id: 课程 ID
        """
        try:
            patch_task_artifacts(
                task_id=task_id,
                workspace_dir=self.workspace_dir,
                lesson_id=lesson_id,
            )
        except Exception:
            logger.exception("[DEBUG] checkpoint.patch_artifacts_failed task_id=%s", task_id)


def create_checkpoint_manager(workspace_dir: Path) -> CheckpointManager:
    """创建检查点管理器。

    Args:
        workspace_dir: 工作空间目录

    Returns:
        检查点管理器实例
    """
    return CheckpointManager(workspace_dir)


__all__ = [
    "CheckpointManager",
    "create_checkpoint_manager",
    "read_json_file",
    "write_json_file",
]
