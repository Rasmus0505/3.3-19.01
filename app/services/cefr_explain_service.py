"""
CEFR 讲解服务 - 听力素材的 CEFR 筛选和讲解生成
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

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
            # 处理双写辅音的情况，如 running -> run
            base = word[:-3]
            if len(base) > 1 and base[-1] == base[-2]:
                return base[:-1]
            return base
        if word.endswith("ed") and len(word) > 4:
            base = word[:-2]
            # 处理双写辅音: jumped -> jump
            if len(base) > 1 and base[-1] == base[-2]:
                return base[:-1]
            return base
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
            content, _ = call_deepseek(
                messages=messages,
                api_key=DASHSCOPE_API_KEY,
                enable_thinking=False,
                stream=False,
                temperature=0.3,
                max_tokens=1000
            )

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
        from app.services.tts_service import synthesize_speech

        result = synthesize_speech(
            text=text,
            voice=voice or "chrome",
            model="qwen3-tts-vc-2026-01-22",
            language_type="mixed",
        )
        return result.audio_url or ""
