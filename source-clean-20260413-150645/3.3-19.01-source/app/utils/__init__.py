"""QRL 工具模块。

统一管理项目中的通用工具函数，按功能划分：

- text: 文本处理工具
- time: 时间处理工具
- file: 文件操作工具
- json: JSON 处理工具
"""

from app.utils.text import (
    normalize_whitespace,
    truncate_text,
    remove_control_characters,
    remove_zero_width_chars,
)
from app.utils.time import (
    now_shanghai_naive,
    to_shanghai_aware,
    to_shanghai_naive,
    format_duration_ms,
    parse_duration_ms,
)
from app.utils.file import (
    ensure_dir,
    get_file_extension,
    sanitize_filename,
)
from app.utils.json import (
    to_dict,
    safe_json_dumps,
)

__all__ = [
    # text
    "normalize_whitespace",
    "truncate_text",
    "remove_control_characters",
    "remove_zero_width_chars",
    # time
    "now_shanghai_naive",
    "to_shanghai_aware",
    "to_shanghai_naive",
    "format_duration_ms",
    "parse_duration_ms",
    # file
    "ensure_dir",
    "get_file_extension",
    "sanitize_filename",
    # json
    "to_dict",
    "safe_json_dumps",
]
