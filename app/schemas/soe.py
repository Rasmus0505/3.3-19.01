from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SOEPhoneResult(BaseModel):
    """音素（音节）评测结果，如 'f', 'er', 's', 't' 组成 'first'"""
    phone: str = ""                           # 识别的音素，如 "f", "er", "s"
    reference_phone: str = ""                 # 参考音素
    reference_letter: str = ""                # 对应的原文字母，如 "s" 对应字母 "s"（腾讯云新版字段）
    pronunciation_score: float = 0.0           # 音素精准度 [0-100]
    start_time: int = 0                       # 音素开始时间 ms
    end_time: int = 0                        # 音素结束时间 ms
    match_tag: int = 0                        # 0=匹配 1=新增 2=缺少 3=错读 4=未录入
    detected_stress: bool = False             # 是否检测到重音
    is_stress: bool = False                   # 是否应为重音


class SOEWordResult(BaseModel):
    """单词评测结果"""
    word: str = ""                             # 识别出的单词，如 "first"
    reference_word: str = ""                  # 参考文本中的原词，如 "1st"
    pronunciation_score: float = 0.0           # 单词精准度 [0-100]
    fluency_score: float = 0.0               # 单词流利度 [0-100]
    integrity_score: float = 0.0             # 单词完整度 [0-100]
    start_time: int = 0                        # 单词开始时间 ms
    end_time: int = 0                          # 单词结束时间 ms
    match_tag: int = 0                         # 0=匹配 1=新增 2=缺少 3=错读 4=未录入
    is_keyword: bool = False                  # 是否关键词
    phone_results: list[SOEPhoneResult] = Field(default_factory=list)


class SOEAssessResponse(BaseModel):
    ok: bool = True
    voice_id: str
    ref_text: str
    user_text: str
    total_score: float
    pronunciation_score: float
    fluency_score: float
    completeness_score: float
    word_results: list[SOEWordResult] = Field(default_factory=list)
    # 单词匹配统计
    matched_word_count: int = 0
    total_word_count: int = 0
    added_word_count: int = 0
    missing_word_count: int = 0
    misread_word_count: int = 0
    saved_result_id: int | None = None


class SOEHistoryItem(BaseModel):
    id: int
    lesson_id: int | None = None
    sentence_id: int | None = None
    ref_text: str
    user_text: str
    total_score: float
    pronunciation_score: float
    fluency_score: float
    completeness_score: float
    created_at: str


class SOEHistoryResponse(BaseModel):
    ok: bool = True
    items: list[SOEHistoryItem] = Field(default_factory=list)


class SOEErrorResponse(BaseModel):
    ok: bool = False
    error_code: str
    message: str
    detail: Any = ""
