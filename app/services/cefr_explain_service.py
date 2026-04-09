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

# 不规则词形还原映射表（复用 vocabAnalyzer.js 的逻辑）
IRREGULAR_LEMMAS: dict[str, str] = {
    "ran": "run",
    "won": "win",
    "begun": "begin",
    "written": "write",
    "taken": "take",
    "given": "give",
    "seen": "see",
    "been": "be",
    "gone": "go",
    "come": "come",
    "made": "make",
    "known": "know",
    "thought": "think",
    "told": "tell",
    "found": "find",
    "said": "say",
    "got": "get",
    # 常见 B1-B2 动词的不规则 -ing 形式
    "perusing": "peruse",
    "pursuing": "pursue",
    "creating": "create",
    "sharing": "share",
    "moving": "move",
}

# 后缀还原规则（复用 vocabAnalyzer.js 的逻辑）
SUFFIX_RULES: list[tuple[str, str]] = [
    ("ies", "y"),    # stories → story
    ("es", ""),      # watches → watch
    ("ed", ""),      # walked → walk
    ("ing", ""),     # walking → walk
    ("ly", ""),      # quickly → quick
    ("ness", ""),    # happiness → happy
    ("ment", ""),    # development → develop
    ("tion", "t"),   # education → educat
    ("s", ""),       # cats → cat
]

# 非标准缩写映射（不经撇号的缩写，如 dont → do）
NONSTANDARD_CONTRACTIONS: dict[str, str] = {
    "dont": "do",
    "cant": "can",
    "wont": "will",
    "shant": "shall",
    "im": "i",
    "ive": "i",
    "id": "i",
    "ill": "i",
    "theyve": "they",
    "theyll": "they",
    "theyd": "they",
    "weve": "we",
    "well": "we",
    "wed": "we",
    "youll": "you",
    "youd": "you",
    "its": "it",
    "thats": "that",
    "whats": "what",
    "wheres": "where",
    "whos": "who",
    "whens": "when",
    "hows": "how",
    "lets": "let",
    "didnt": "do",
    "doesnt": "do",
    "isnt": "is",
    "wasnt": "be",
    "arent": "be",
    "werent": "be",
    "havent": "have",
    "hasnt": "have",
    "hadnt": "have",
    "couldnt": "can",
    "wouldnt": "will",
    "shouldnt": "shall",
    "mustnt": "must",
    "mightnt": "might",
    "aint": "be",
    "shes": "she",
    "hes": "he",
    "youre": "you",
    "theyre": "they",
    "youve": "you",
    "gonna": "go",
    "wanna": "want",
    "gotta": "get",
    "outta": "out",
    "kinda": "kind",
    "sorta": "sort",
    "lemme": "let",
    "gimme": "give",
    "dunno": "know",
    "shoulda": "should",
    "coulda": "could",
    "woulda": "would",
    "musta": "must",
    "ima": "i",
    "u": "you",
    "ur": "your",
    "r": "are",
    "b": "be",
    "c": "see",
    "y": "why",
    "n": "and",
    "rn": "right",
    "yall": "you",
}


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
        """查询单词的 CEFR 等级（复用 vocabAnalyzer.js 的 5 级查询逻辑）"""
        word_lower = word.lower()
        word_map = self.vocab_data.get("words", {})

        # Step 1: 直接查表
        if word_lower in word_map:
            return word_map[word_lower].get("level")

        # Step 2: 词形还原（不规则映射 + 后缀规则）
        lemma = self._lemmatize(word_lower)
        if lemma != word_lower and lemma in word_map:
            return word_map[lemma].get("level")

        # Step 3: 非标准缩写还原（dont → do, cant → can）
        nonstandard = self._normalize_nonstandard_contraction(word_lower)
        if nonstandard is not None and nonstandard != word_lower and nonstandard in word_map:
            return word_map[nonstandard].get("level")

        # Step 4: 标准缩写还原（don't → don't → do）
        stripped = self._strip_contraction(word_lower)
        if stripped is not None and stripped != word_lower and stripped in word_map:
            return word_map[stripped].get("level")

        return None

    def _lemmatize(self, word: str) -> str:
        """词形还原（复用 vocabAnalyzer.js 的逻辑）"""
        word_lower = word.lower()
        word_map = self.vocab_data.get("words", {})

        # 1. 先查不规则词形还原映射表
        mapped = IRREGULAR_LEMMAS.get(word_lower)
        if mapped and mapped in word_map:
            return mapped

        # 2. 再用后缀规则还原（用小写进行匹配和查找）
        for suffix, replacement in SUFFIX_RULES:
            if word_lower.endswith(suffix) and len(word_lower) > len(suffix) + 2:
                base = word_lower[:-len(suffix)] + replacement
                if len(base) > 1 and base in word_map:
                    return base

        return word_lower

    def _normalize_nonstandard_contraction(self, word: str) -> str | None:
        """非标准缩写还原（不经撇号的缩写，如 dont → do）"""
        return NONSTANDARD_CONTRACTIONS.get(word)

    def _strip_contraction(self, word: str) -> str | None:
        """标准缩写还原（weren't → were, don't → do）"""
        # 处理 n't 结尾
        m = re.match(r"^(.+?)n't$", word, re.IGNORECASE)
        if m:
            base = m.group(1).lower()
            # 特殊映射
            special_map = {"wont": "will"}
            return special_map.get(base, base)
        # 处理 's, 'd, 'm, 're, 've, 'll
        m2 = re.match(r"^(.+?)'(s|d|m|re|ve|ll)$", word, re.IGNORECASE)
        if m2:
            return m2.group(1).lower()
        return None

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

    def filter_words_by_level(self, words_above: list[dict]) -> dict:
        """
        词典二次筛选 - 基于原型词等级进行分类

        分类逻辑：
        - 词典查到且原型等级 <= 目标等级 → 过滤（词典误标/过于简单）
        - 词典查到且原型等级 = 目标等级 → i+1 词汇（保留）
        - 词典查到且原型等级 > 目标等级 → 需简化词汇
        - 词典查不到 → SUPER（需简化）

        Returns:
            dict: {
                "valid_i1_words": [...],       # i+1 词汇（原型等级 == 目标等级）
                "valid_above_i1_words": [...], # 需简化词汇（原型等级 > 目标等级 或 查不到）
                "removed_words": [...],        # 被过滤的词（原型等级 <= 目标等级）
            }
        """
        valid_i1 = []
        valid_above_i1 = []
        removed = []

        for word_info in words_above:
            word = word_info["word"]
            surface_level = word_info["level"]

            # 获取原型词
            lemma = self._lemmatize(word)
            # 尝试查询原型词等级（先直接查，再尝试还原）
            lemma_level = None
            word_map = self.vocab_data.get("words", {})

            if lemma in word_map:
                lemma_level = word_map[lemma].get("level")
            else:
                # 原型词查不到，尝试非标准缩写
                nonstandard = self._normalize_nonstandard_contraction(lemma)
                if nonstandard and nonstandard in word_map:
                    lemma_level = word_map[nonstandard].get("level")

            # 如果原型词查不到，标记为 SUPER
            if lemma_level is None:
                lemma_level = "SUPER"

            lemma_level_num = self._level_num(lemma_level)

            # 分类
            if lemma_level_num <= self.target_num:
                # 原型等级 <= 目标等级，过滤
                removed.append({
                    **word_info,
                    "lemma": lemma,
                    "lemma_level": lemma_level,
                    "reason": "原型等级不高于目标等级"
                })
            elif lemma_level_num == self.target_num:
                # 原型等级 == 目标等级，i+1 词汇
                valid_i1.append({
                    **word_info,
                    "lemma": lemma,
                    "lemma_level": lemma_level
                })
            else:
                # 原型等级 > 目标等级，需简化
                valid_above_i1.append({
                    **word_info,
                    "lemma": lemma,
                    "lemma_level": lemma_level
                })

        return {
            "valid_i1_words": valid_i1,
            "valid_above_i1_words": valid_above_i1,
            "removed_words": removed
        }

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
        from app.core.config import CEFR_EXPLAIN_TTS_VOICE
        from app.services.tts_service import synthesize_speech

        tts_voice = voice or CEFR_EXPLAIN_TTS_VOICE or ""
        if not tts_voice:
            return ""  # 未配置声音，跳过 TTS

        try:
            result = synthesize_speech(
                text=text,
                voice=tts_voice,
                model="qwen3-tts-vc-2026-01-22",
                language_type="mixed",
            )
            return result.audio_url or ""
        except Exception:
            logger.warning(f"TTS synthesis failed for text: {text[:50]}...")
            return ""
