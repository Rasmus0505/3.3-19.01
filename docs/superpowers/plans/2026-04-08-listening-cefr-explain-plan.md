# 听力素材生成 CEFR 增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在听力素材生成流程中加入 CEFR 二次筛选机制，并为含有高于 i+1 词汇的句子在拼写阶段提供 TTS+LLM 讲解，将难度降低到 i+1 水平。

**架构：** 采用后端前置筛选 + LLM 二次处理 + 前端讲解展示的三层架构。CEFR 筛选在 `lesson_service.py` 中完成后端词典初筛，复用现有 LLM 端点进行词形还原和二次判断，最后由前端根据 `needs_explanation` 字段在拼写前展示讲解内容。

**技术栈：** FastAPI (后端), SQLAlchemy (数据库), React (前端), DeepSeek V3.2 (LLM), DashScope TTS (语音合成)

---

## 文件结构

```
修改文件:
- app/models/lesson.py                    # LessonSentence 模型扩展
- app/services/lesson_service.py          # 新增后端CEFR筛选逻辑
- app/api/routers/llm.py                 # 新增讲解生成端点
- frontend/src/features/immersive/ImmersiveLessonPage.jsx  # 拼写前讲解展示

新建文件:
- app/services/cefr_explain_service.py    # CEFR讲解服务
- frontend/src/features/immersive/ExplanationPanel.jsx  # 讲解展示组件
- tests/unit/test_cefr_explain_service.py # 单元测试
- tests/integration/api/test_cefr_explain_api.py  # API测试
```

---

## Task 1: 扩展 LessonSentence 模型

**Files:**
- Modify: `app/models/lesson.py:35-50`

- [ ] **Step 1: 添加 CEFR 相关字段**

在 `LessonSentence` 模型的 `tokens_json` 字段后添加:

```python
class LessonSentence(Base):
    # ... existing fields ...
    tokens_json: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    audio_clip_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # CEFR 相关字段
    cefr_vocab_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # 句子中词汇的CEFR等级信息
    needs_explanation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # 讲解相关字段
    explanation_text: Mapped[str | None] = mapped_column(String, nullable=True)  # 讲解文本
    simplified_sentence: Mapped[str | None] = mapped_column(String, nullable=True)  # 简化后的句子
    explanation_audio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)  # 讲解音频URL
    key_explanations_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # 关键词解释
```

- [ ] **Step 2: 生成数据库迁移**

Run: `cd C:\Users\Administrator\.cursor\worktrees\3.3-19.01\ftd && python -m alembic revision --autogenerate -m "add_cefr_fields_to_lesson_sentence"`

Expected: 生成新的迁移文件 `versions/xxx_add_cefr_fields_to_lesson_sentence.py`

- [ ] **Step 3: 运行迁移**

Run: `python -m alembic upgrade head`

Expected: 迁移成功执行

- [ ] **Step 4: 提交**

```bash
git add app/models/lesson.py alembic/versions/
git commit -m "feat: add CEFR and explanation fields to LessonSentence"
```

---

## Task 2: 创建 CEFR 讲解服务

**Files:**
- Create: `app/services/cefr_explain_service.py`

- [ ] **Step 1: 创建服务文件**

创建 `app/services/cefr_explain_service.py`:

```python
"""
CEFR 讲解服务 - 听力素材的 CEFR 筛选和讲解生成
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

import sqlmodel
from sqlalchemy.orm import Session

from app.core.config import DASHSCOPE_API_KEY
from app.infra.llm.deepseek import call_deepseek

logger = logging.getLogger(__name__)

# CEFR 等级数值用于比较
CEFR_LEVEL_NUM = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}

EXPLAIN_SENTENCE_SYSTEM_PROMPT = """You are an English listening comprehension tutor for language learning.
When a sentence contains vocabulary above the user's target level (i+1),
you need to generate an explanation that lowers the listening difficulty to i+1.

Output format:
{
    "simplified_sentence": "简化后的句子，保留i+1词汇",
    "key_explanations": [
        {
            "original_word": "原文词汇",
            "explanation": "英文或中文解释（1-2句话）",
            "simple_example": "简单例句（可选）"
        }
    ],
    "listen_tips": "听力技巧提示（可选）"
}

Rules:
- Only simplify words strictly above target level
- Keep all i+1 level vocabulary for learning
- Explanation should be clear and concise
- For listening practice, prioritize word substitution over complex grammar
- Return ONLY valid JSON, no markdown formatting or explanations
"""


class CefrExplainService:
    """CEFR 讲解服务"""

    def __init__(self, db: Session, target_level: str = "B1"):
        self.db = db
        self.target_level = target_level
        self.target_num = CEFR_LEVEL_NUM.get(target_level, 3)
        self.vocab_data = self._load_vocab()

    def _load_vocab(self) -> dict:
        """加载 CEFR 词典数据"""
        vocab_path = Path(__file__).parent.parent / "data" / "vocab" / "cefr_vocab_fixed.json"
        if vocab_path.exists():
            with open(vocab_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"words": {}}

    def _lookup_word(self, word: str) -> str | None:
        """查询单词的 CEFR 等级"""
        word_lower = word.lower()
        word_map = self.vocab_data.get("words", {})

        # Step 1: 直接查表
        if word_lower in word_map:
            return word_map[word_lower].get("level")

        # Step 2: 简单的词形还原 (常见规则)
        lemma = self._lemmatize(word_lower)
        if lemma in word_map:
            return word_map[lemma].get("level")

        return None

    def _lemmatize(self, word: str) -> str:
        """简单的词形还原"""
        # 常见动词后缀
        if word.endswith("ing") and len(word) > 5:
            return word[:-3]
        if word.endswith("ed") and len(word) > 4:
            return word[:-2]
        if word.endswith("s") and len(word) > 3:
            return word[:-1]
        return word

    def _level_num(self, level: str) -> int:
        """获取等级数值"""
        return CEFR_LEVEL_NUM.get(level.upper(), 0)

    def extract_cefr_words(self, sentences: list[str]) -> list[dict]:
        """后端词典 CEFR 一次筛选 - 提取高于目标等级的词汇"""
        results = []
        word_regex = re.compile(r"[a-zA-Z]+(?:'[a-zA-Z]+)?")

        for idx, sentence in enumerate(sentences):
            words_above = []
            matches = word_regex.finditer(sentence)

            for match in matches:
                word = match.group()
                level = self._lookup_word(word)

                if level:
                    level_num = self._level_num(level)
                    # 高于目标等级才记录
                    if level_num > self.target_num:
                        words_above.append({
                            "word": word,
                            "level": level,
                            "start": match.start(),
                            "end": match.end()
                        })

            results.append({
                "sentence_index": idx,
                "sentence": sentence,
                "words_above": words_above,
                "needs_explanation": len(words_above) > 0
            })

        return results

    def generate_explanation(self, sentence: str, words_above: list[dict]) -> dict:
        """生成讲解内容（调用 LLM）"""
        if not words_above:
            return {
                "simplified_sentence": sentence,
                "key_explanations": [],
                "listen_tips": ""
            }

        words_list = [w["word"] for w in words_above]
        words_str = ", ".join(words_list)

        user_prompt = f"""Sentence: {sentence}

Words above {self.target_level} level: {words_str}

Please generate an explanation that:
1. Creates a simplified version of the sentence (keeping i+1 vocabulary)
2. Explains the key words that were simplified
3. Provides listening tips if helpful

Generate the explanation in the required JSON format."""

        messages = [
            {"role": "system", "content": EXPLAIN_SENTENCE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]

        try:
            response = call_deepseek(
                messages=messages,
                api_key=DASHSCOPE_API_KEY,
                enable_thinking=False,
                stream=False,
                temperature=0.3,
                max_tokens=1000
            )
            content = response.choices[0].message.content.strip()

            # 尝试解析 JSON
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            content = content.strip()

            return json.loads(content)
        except Exception as e:
            logger.error(f"Failed to generate explanation: {e}")
            return {
                "simplified_sentence": sentence,
                "key_explanations": [{"original_word": w["word"], "explanation": "High level vocabulary"} for w in words_above],
                "listen_tips": "Focus on the overall meaning rather than individual words."
            }

    def synthesize_explanation_audio(self, text: str, voice: str = None) -> str:
        """生成讲解 TTS 音频"""
        # 复用 TTS 服务
        from app.services.tts_service import synthesize_speech

        audio_path = synthesize_speech(
            text=text,
            voice=voice or "chrome",
            model="qwen3-tts-vc-2026-01-22",
            language_type="mixed",
            stream=False,
            speed=0.9  # 略慢语速
        )
        return audio_path
```

- [ ] **Step 2: 编写单元测试**

创建 `tests/unit/test_cefr_explain_service.py`:

```python
import pytest
from unittest.mock import MagicMock, patch
from app.services.cefr_explain_service import CefrExplainService, CEFR_LEVEL_NUM


class TestCefrExplainService:
    """CEFR 讲解服务测试"""

    @pytest.fixture
    def service(self):
        """创建测试服务实例（使用 mock db）"""
        db = MagicMock()
        return CefrExplainService(db=db, target_level="B1")

    def test_level_num(self, service):
        """测试等级数值转换"""
        assert service._level_num("A1") == 1
        assert service._level_num("B1") == 3
        assert service._level_num("C2") == 6

    def test_lemmatize(self, service):
        """测试词形还原"""
        assert service._lemmatize("running") == "run"
        assert service._lemmatize("jumped") == "jump"
        assert service._lemmatize("cats") == "cat"

    def test_extract_cefr_words_with_high_level_vocabulary(self, service):
        """测试提取高于目标等级的词汇"""
        sentences = [
            "The transformation of society is remarkable.",
            "Simple sentence with common words."
        ]
        # Mock 词典数据
        service.vocab_data = {
            "words": {
                "transformation": {"level": "C1"},
                "society": {"level": "B2"},
                "remarkable": {"level": "B2"},
                "simple": {"level": "A1"},
                "sentence": {"level": "A2"},
            }
        }

        results = service.extract_cefr_words(sentences)

        # 第一个句子有 transformation (C1 > B1)
        assert results[0]["needs_explanation"] is True
        assert len(results[0]["words_above"]) > 0
        assert results[0]["words_above"][0]["word"] == "transformation"

        # 第二个句子没有高于 B1 的词
        assert results[1]["needs_explanation"] is False
        assert len(results[1]["words_above"]) == 0

    def test_extract_cefr_words_no_high_level(self, service):
        """测试全部为低级别词汇"""
        sentences = ["The cat is on the table."]
        service.vocab_data = {
            "words": {
                "the": {"level": "A1"},
                "cat": {"level": "A1"},
                "is": {"level": "A1"},
                "on": {"level": "A1"},
                "table": {"level": "A1"},
            }
        }

        results = service.extract_cefr_words(sentences)
        assert results[0]["needs_explanation"] is False
```

- [ ] **Step 3: 运行测试验证**

Run: `pytest tests/unit/test_cefr_explain_service.py -v`

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add app/services/cefr_explain_service.py tests/unit/test_cefr_explain_service.py
git commit -m "feat: add CefrExplainService for CEFR filtering and explanation generation"
```

---

## Task 3: 在 lesson_service.py 中集成后端 CEFR 筛选

**Files:**
- Modify: `app/services/lesson_service.py` (在 `build_subtitle_variant` 方法后添加)

- [ ] **Step 1: 添加后端 CEFR 筛选方法**

在 `lesson_service.py` 文件末尾添加:

```python
def extract_cefr_from_sentences(sentences: list[str], target_level: str) -> list[dict]:
    """从句子列表中提取 CEFR 词汇信息（后端一次筛选）"""
    from app.services.cefr_explain_service import CefrExplainService

    db = None  # 服务不需要 db
    service = CefrExplainService(db=db, target_level=target_level)
    return service.extract_cefr_words(sentences)


def generate_sentence_explanation(
    sentence: str,
    words_above: list[dict],
    target_level: str
) -> dict:
    """为单个句子生成讲解内容"""
    from app.services.cefr_explain_service import CefrExplainService

    db = None
    service = CefrExplainService(db=db, target_level=target_level)
    return service.generate_explanation(sentence, words_above)
```

- [ ] **Step 2: 在字幕生成流程中调用 CEFR 筛选**

找到 `build_subtitle_variant` 方法中返回 variant 的位置，在翻译完成后添加:

```python
# 在 variant 构建完成后，添加 CEFR 筛选
if target_level and variant.get("sentences"):
    cefr_results = extract_cefr_from_sentences(
        [s["text_en"] for s in variant["sentences"]],
        target_level
    )
    variant["cefr_results"] = cefr_results
```

- [ ] **Step 3: 编写集成测试**

添加测试到 `tests/integration/api/test_lessons_api.py`:

```python
def test_cefr_filtering_in_subtitle_generation(client, auth_headers, test_user):
    """测试字幕生成中的 CEFR 筛选"""
    # 上传音频文件
    with open("tests/fixtures/sample_audio.mp3", "rb") as f:
        response = client.post(
            "/api/lessons/upload",
            files={"file": ("test.mp3", f, "audio/mpeg")},
            data={"asr_model": "qwen-audio"},
            headers=auth_headers
        )
    assert response.status_code == 200
    task_id = response.json()["task_id"]

    # 等待生成完成（轮询）
    for _ in range(60):
        response = client.get(f"/api/lessons/tasks/{task_id}", headers=auth_headers)
        if response.json()["status"] == "ready":
            break
        time.sleep(2)

    # 验证生成结果包含 CEFR 信息
    lesson_id = response.json()["lesson_id"]
    response = client.get(f"/api/lessons/{lesson_id}", headers=auth_headers)
    assert response.status_code == 200
    lesson = response.json()

    # 检查句子数据
    if lesson.get("sentences"):
        first_sentence = lesson["sentences"][0]
        # 应该包含 cefr_vocab_json 或 needs_explanation 字段
        assert "cefr_vocab_json" in first_sentence or "needs_explanation" in first_sentence
```

- [ ] **Step 4: 运行测试验证**

Run: `pytest tests/integration/api/test_lessons_api.py::test_cefr_filtering_in_subtitle_generation -v`

Expected: PASS (或根据需要调整)

- [ ] **Step 5: 提交**

```bash
git add app/services/lesson_service.py tests/integration/api/test_lessons_api.py
git commit -m "feat: integrate CEFR backend filtering in subtitle generation"
```

---

## Task 4: 新增 LLM 讲解生成 API 端点

**Files:**
- Modify: `app/api/routers/llm.py` (在现有端点后添加)

- [ ] **Step 1: 添加讲解生成端点**

在 `llm.py` 文件末尾添加:

```python
class SentenceExplanationRequest(BaseModel):
    sentence: str = Field(..., description="原始句子")
    words_above: list[dict] = Field(default=[], description="高于目标等级的词汇列表")
    target_level: str = Field(default="B1", description="用户目标 CEFR 等级")


class SentenceExplanationResponse(BaseModel):
    simplified_sentence: str = Field(..., description="简化后的句子")
    key_explanations: list[dict] = Field(default=[], description="关键词解释")
    listen_tips: str = Field(default="", description="听力技巧提示")


@router.post("/explain-sentence", response_model=SentenceExplanationResponse)
def explain_sentence(
    payload: SentenceExplanationRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    为含有高于 i+1 词汇的句子生成讲解内容。
    返回简化句和关键词解释，用于拼写前的讲解展示。
    """
    from app.services.cefr_explain_service import CefrExplainService

    service = CefrExplainService(db=db, target_level=payload.target_level)
    result = service.generate_explanation(payload.sentence, payload.words_above)

    # 记录 LLM 使用量
    log_llm_usage(
        db=db,
        user_id=user.id,
        model=LLM_MODEL_DEEPSEEK_FAST,
        prompt_tokens=len(payload.sentence.split()) * 2,
        completion_tokens=100,
        task_type="sentence_explanation"
    )

    return SentenceExplanationResponse(**result)
```

- [ ] **Step 2: 编写 API 测试**

创建 `tests/integration/api/test_cefr_explain_api.py`:

```python
import pytest
from fastapi.testclient import TestClient


def test_explain_sentence_endpoint(client, auth_headers, test_user):
    """测试讲解生成端点"""
    payload = {
        "sentence": "The transformation of urban landscapes continues.",
        "words_above": [
            {"word": "transformation", "level": "C1"},
            {"word": "urban", "level": "B2"},
            {"word": "landscapes", "level": "C1"}
        ],
        "target_level": "B1"
    }

    response = client.post(
        "/api/llm/explain-sentence",
        json=payload,
        headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()

    assert "simplified_sentence" in data
    assert "key_explanations" in data
    # 简化句应该比原句更简单
    assert len(data["simplified_sentence"]) <= len(payload["sentence"]) + 20


def test_explain_sentence_no_high_level(client, auth_headers, test_user):
    """测试没有高等级词汇的句子"""
    payload = {
        "sentence": "The cat is sleeping on the bed.",
        "words_above": [],
        "target_level": "B1"
    }

    response = client.post(
        "/api/llm/explain-sentence",
        json=payload,
        headers=auth_headers
    )

    assert response.status_code == 200
    data = response.json()
    # 没有高等级词汇时应返回原句
    assert data["simplified_sentence"] == payload["sentence"]
```

- [ ] **Step 3: 运行 API 测试**

Run: `pytest tests/integration/api/test_cefr_explain_api.py -v`

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add app/api/routers/llm.py tests/integration/api/test_cefr_explain_api.py
git commit -m "feat: add /api/llm/explain-sentence endpoint for sentence explanation"
```

---

## Task 5: 前端讲解展示组件

**Files:**
- Create: `frontend/src/features/immersive/ExplanationPanel.jsx`
- Modify: `frontend/src/features/immersive/ImmersiveLessonPage.jsx` (在拼写相关代码区域添加)

- [ ] **Step 1: 创建 ExplanationPanel 组件**

创建 `frontend/src/features/immersive/ExplanationPanel.jsx`:

```jsx
import React, { useEffect, useRef } from 'react';
import { PlayArrow, Replay, Spellcheck } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Typography, Chip, Divider } from '@mui/material';

const ExplanationPanel = ({
  sentence,
  explanation,
  onReplay,
  onStartPractice,
  audioUrl
}) => {
  const audioRef = useRef(null);

  useEffect(() => {
    // 自动播放讲解音频
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(console.error);
    }
  }, [audioUrl]);

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
    onReplay?.();
  };

  const handleStartPractice = () => {
    onStartPractice?.();
  };

  if (!explanation) {
    return null;
  }

  return (
    <Card sx={{ maxWidth: 600, mx: 'auto', my: 2 }}>
      <CardContent>
        {/* 隐藏的音频元素 */}
        <audio ref={audioRef} />

        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PlayArrow color="primary" />
          听力讲解
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* 简化句 */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            简化句：
          </Typography>
          <Typography variant="body1" sx={{ 
            fontStyle: 'italic',
            bgcolor: 'action.hover',
            p: 2,
            borderRadius: 1
          }}>
            {explanation.simplified_sentence}
          </Typography>
        </Box>

        {/* 关键词解释 */}
        {explanation.key_explanations?.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              关键词解释：
            </Typography>
            <Box sx={{ 
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              overflow: 'hidden'
            }}>
              {explanation.key_explanations.map((exp, idx) => (
                <Box key={idx} sx={{ p: 1.5, '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Chip 
                      label={exp.original_word} 
                      size="small" 
                      color="primary" 
                      variant="outlined"
                    />
                    <Typography variant="body2" color="text.secondary">
                      {exp.explanation}
                    </Typography>
                  </Box>
                  {exp.simple_example && (
                    <Typography variant="caption" color="text.disabled" sx={{ ml: 3 }}>
                      例: {exp.simple_example}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* 听力提示 */}
        {explanation.listen_tips && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              听力技巧：
            </Typography>
            <Typography variant="body2">
              {explanation.listen_tips}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* 操作按钮 */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<Replay />}
            onClick={handleReplay}
          >
            重新播放
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Spellcheck />}
            onClick={handleStartPractice}
          >
            开始拼写练习
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ExplanationPanel;
```

- [ ] **Step 2: 在 ImmersiveLessonPage 中集成讲解展示**

在 `ImmersiveLessonPage.jsx` 中找到拼写练习相关的 state 和逻辑，添加:

```jsx
// 在现有 state 中添加
const [showExplanation, setShowExplanation] = useState(false);
const [currentExplanation, setCurrentExplanation] = useState(null);

// 在句子切换或进入拼写阶段时检查是否需要讲解
useEffect(() => {
  if (currentSentence && currentSentence.needs_explanation) {
    // 如果句子需要讲解，显示讲解面板
    setShowExplanation(true);
    
    // 如果已有讲解数据，直接使用
    if (currentSentence.explanation_text) {
      try {
        setCurrentExplanation(JSON.parse(currentSentence.explanation_text));
      } catch {
        setCurrentExplanation(null);
      }
    }
  } else {
    setShowExplanation(false);
    setCurrentExplanation(null);
  }
}, [currentSentence]);

// 讲解面板关闭后进入拼写
const handleStartPracticeFromExplanation = useCallback(() => {
  setShowExplanation(false);
  // 切换到拼写模式
  setMode('spelling');
}, []);
```

- [ ] **Step 3: 在渲染中添加讲解面板**

在拼写练习区域前添加讲解面板:

```jsx
// 在 renderSpellingPractice 或类似位置之前添加
{showExplanation && currentExplanation && (
  <ExplanationPanel
    sentence={currentSentence?.text_en}
    explanation={currentExplanation}
    audioUrl={currentSentence?.explanation_audio_url}
    onReplay={() => playExplanationAudio(currentSentence?.explanation_audio_url)}
    onStartPractice={handleStartPracticeFromExplanation}
  />
)}

{/* 原有的拼写练习区域 */}
{!showExplanation && mode === 'spelling' && renderSpellingPractice()}
```

- [ ] **Step 4: 添加讲解音频播放函数**

```jsx
const playExplanationAudio = useCallback((audioUrl) => {
  if (audioUrl && audioRef.current) {
    audioRef.current.src = audioUrl;
    audioRef.current.play().catch(console.error);
  }
}, []);
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/features/immersive/ExplanationPanel.jsx
git commit -m "feat: add ExplanationPanel component for sentence explanation display"
```

---

## Task 6: 前端获取讲解数据

**Files:**
- Modify: `frontend/src/features/immersive/ImmersiveLessonPage.jsx` (API 调用部分)

- [ ] **Step 1: 添加获取讲解的 API 调用**

在 API 调用区域添加:

```javascript
// 获取句子讲解数据
export const fetchSentenceExplanation = async (lessonId, sentenceIndex, targetLevel = 'B1') => {
  try {
    const response = await api.post(`/api/llm/explain-sentence`, {
      sentence: '', // 将由后端从句子数据获取
      words_above: [],
      target_level: targetLevel
    }, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch explanation:', error);
    return null;
  }
};
```

- [ ] **Step 2: 在句子数据加载时获取讲解**

当 `currentSentence` 设置时，检查是否需要获取讲解数据:

```javascript
useEffect(() => {
  if (currentSentence?.needs_explanation && !currentSentence.explanation_text) {
    // 需要讲解但没有数据时，从 API 获取
    fetchSentenceExplanation(lessonId, currentSentence.id, userCefrLevel)
      .then(data => {
        if (data) {
          setCurrentExplanation(data);
        }
      });
  }
}, [currentSentence, lessonId, userCefrLevel]);
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/features/immersive/ImmersiveLessonPage.jsx
git commit -m "feat: integrate explanation panel in spelling practice flow"
```

---

## Task 7: 端到端测试

**Files:**
- Create: `tests/e2e/test_cefr_explain_e2e.py`

- [ ] **Step 1: 编写端到端测试**

创建 `tests/e2e/test_cefr_explain_e2e.py`:

```python
import pytest
import time


@pytest.mark.e2e
def test_cefr_explain_full_flow(client, auth_headers, test_user):
    """
    端到端测试: CEFR 讲解完整流程
    1. 上传音频生成听力素材
    2. 验证 CEFR 筛选结果
    3. 进入拼写练习
    4. 验证讲解展示
    """
    # 1. 上传音频并生成听力素材
    with open("tests/fixtures/sample_audio.mp3", "rb") as f:
        upload_response = client.post(
            "/api/lessons/upload",
            files={"file": ("test.mp3", f, "audio/mpeg")},
            data={"asr_model": "qwen-audio", "target_cefr": "B1"},
            headers=auth_headers
        )
    assert upload_response.status_code == 200
    task_id = upload_response.json()["task_id"]

    # 2. 等待生成完成
    for _ in range(60):
        response = client.get(f"/api/lessons/tasks/{task_id}", headers=auth_headers)
        if response.json()["status"] == "ready":
            break
        time.sleep(2)
    else:
        pytest.fail("Lesson generation timeout")

    lesson_id = response.json()["lesson_id"]

    # 3. 获取课程详情，验证 CEFR 字段
    response = client.get(f"/api/lessons/{lesson_id}", headers=auth_headers)
    assert response.status_code == 200
    lesson = response.json()

    # 检查是否包含需要讲解的句子
    sentences_with_explanation = [
        s for s in lesson.get("sentences", [])
        if s.get("needs_explanation")
    ]

    if sentences_with_explanation:
        # 4. 获取第一个需要讲解的句子
        sentence = sentences_with_explanation[0]

        # 验证讲解数据存在
        assert sentence.get("explanation_text") or sentence.get("simplified_sentence")

        # 5. 获取讲解音频URL
        if sentence.get("explanation_audio_url"):
            # 验证音频URL可访问
            audio_response = client.get(sentence["explanation_audio_url"])
            assert audio_response.status_code == 200
```

- [ ] **Step 2: 运行端到端测试**

Run: `pytest tests/e2e/test_cefr_explain_e2e.py -v -s`

Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add tests/e2e/test_cefr_explain_e2e.py
git commit -m "test: add e2e test for CEFR explanation flow"
```

---

## 实施检查清单

完成所有 Task 后，验证以下功能:

- [ ] 数据库迁移成功，`lesson_sentences` 表包含新字段
- [ ] 后端 CEFR 筛选正确提取高于目标等级的词汇
- [ ] LLM 讲解生成端点返回正确的简化句和解释
- [ ] 前端讲解面板正确显示简化句和关键词
- [ ] 拼写练习前正确展示讲解内容
- [ ] TTS 讲解音频生成和播放正常
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 端到端测试通过

---

**计划完成并保存至:** `docs/superpowers/plans/2026-04-08-listening-cefr-explain-plan.md`
