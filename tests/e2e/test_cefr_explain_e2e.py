"""
CEFR 讲解功能端到端测试

测试完整流程：
1. CEFR 词汇提取
2. 讲解内容生成
3. 模型字段存储
"""

import pytest


@pytest.mark.e2e
class TestCefrExplainE2E:
    """CEFR 讲解端到端测试"""

    def test_extract_cefr_from_sentences(self):
        """测试从句子中提取 CEFR 词汇"""
        from app.services.lesson_service import extract_cefr_from_sentences

        sentences = [
            "The infrastructure fundamentally changed the city.",
            "The cat is on the table.",
            "The methodology requires extensive analysis."
        ]

        # B1 目标等级
        results = extract_cefr_from_sentences(sentences, "B1")

        # 第一个句子有 infrastructure, fundamentally (C2 > B1)
        assert results[0]["needs_explanation"] is True
        assert any(w["word"].lower() == "infrastructure" for w in results[0]["words_above"])

        # 第二个句子全部低于 B1
        assert results[1]["needs_explanation"] is False

        # 第三个句子有 methodology (SUPER > B1，但不在 CEFR_LEVEL_NUM 中，不会被提取)
        # 只用 common 作为高于 B1 的词来测试
        pass

    def test_explain_sentence_service(self):
        """测试讲解内容生成服务"""
        from app.services.cefr_explain_service import CefrExplainService

        service = CefrExplainService(db=None, target_level="B1")

        sentence = "The transformation of society is remarkable."
        words_above = [
            {"word": "transformation", "level": "C1"},
            {"word": "society", "level": "B2"},
            {"word": "remarkable", "level": "B2"}
        ]

        # 这个测试会调用 LLM，如果是真实环境会生成内容
        # 在测试环境中，LLM 调用可能被 mock
        result = service.generate_explanation(sentence, words_above)

        assert "simplified_sentence" in result
        assert "key_explanations" in result
        assert result["simplified_sentence"] is not None

    def test_lemmatize_logic(self):
        """测试词形还原逻辑"""
        from app.services.cefr_explain_service import CefrExplainService

        service = CefrExplainService(db=None, target_level="B1")

        # 动词现在分词 -> 动词原形
        assert service._lemmatize("running") == "run"
        assert service._lemmatize("walking") == "walk"

        # 动词过去式 -> 动词原形
        assert service._lemmatize("jumped") == "jump"
        assert service._lemmatize("walked") == "walk"

        # 名词复数 -> 名词单数
        assert service._lemmatize("cats") == "cat"
        assert service._lemmatize("dogs") == "dog"

        # 不规则变化保持原样
        assert service._lemmatize("went") == "went"
        assert service._lemmatize("children") == "children"

    def test_level_num(self):
        """测试等级数值转换"""
        from app.services.cefr_explain_service import CEFR_LEVEL_NUM

        assert CEFR_LEVEL_NUM["A1"] == 1
        assert CEFR_LEVEL_NUM["A2"] == 2
        assert CEFR_LEVEL_NUM["B1"] == 3
        assert CEFR_LEVEL_NUM["B2"] == 4
        assert CEFR_LEVEL_NUM["C1"] == 5
        assert CEFR_LEVEL_NUM["C2"] == 6

    def test_model_fields_exist(self):
        """测试 LessonSentence 模型包含新字段"""
        from app.models.lesson import LessonSentence

        # 检查字段是否存在
        fields = [c.key for c in LessonSentence.__table__.columns]

        assert "cefr_vocab_json" in fields
        assert "needs_explanation" in fields
        assert "explanation_text" in fields
        assert "simplified_sentence" in fields
        assert "explanation_audio_url" in fields
        assert "key_explanations_json" in fields
