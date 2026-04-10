import pytest
from unittest.mock import MagicMock, patch
from app.services.cefr_explain_service import CefrExplainService, CEFR_LEVEL_NUM
from app.services.lessons.cefr import process_sentences_with_cefr


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
        service.vocab_data = {
            "words": {
                "peruse": {"level": "C1"},
                "jump": {"level": "A2"},
                "cat": {"level": "A1"},
            }
        }
        assert service._lemmatize("perusing") == "peruse"
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

    def test_filter_words_by_level_uses_final_level_for_i_plus_one(self, service):
        service.vocab_data = {
            "words": {
                "remarkable": {"level": "B2"},
                "running": {"level": "B2"},
                "run": {"level": "A2"},
            }
        }

        result = service.filter_words_by_level(
            [
                {"word": "remarkable", "level": "B2"},
                {"word": "running", "level": "B2"},
            ],
            llm_lemmas={"remarkable": "remarkable", "running": "run"},
        )

        assert [item["word"] for item in result["valid_i1_words"]] == ["remarkable"]
        assert [item["word"] for item in result["removed_words"]] == ["running"]
        assert result["valid_i1_words"][0]["final_level"] == "B2"
        assert result["removed_words"][0]["final_level"] == "A2"

    def test_process_sentences_with_cefr_generates_explanation_for_i_plus_one_words(self, monkeypatch):
        vocab_data = {
            "words": {
                "remarkable": {"level": "B2"},
                "running": {"level": "B2"},
                "run": {"level": "A2"},
            }
        }
        explanation_words_seen = []

        monkeypatch.setattr(CefrExplainService, "_load_vocab", lambda self: vocab_data)
        monkeypatch.setattr(
            CefrExplainService,
            "llm_lemmatize",
            lambda self, words: {"Remarkable": "remarkable", "running": "run"},
        )

        def _fake_generate(self, sentence, words_above):
            explanation_words_seen[:] = [item["word"] for item in words_above]
            return {
                "simplified_sentence": None,
                "key_explanations": [{"original_word": "remarkable", "explanation": "较难词"}],
                "listen_tips": "重点听 remarkable",
            }

        monkeypatch.setattr(CefrExplainService, "generate_explanation", _fake_generate)
        monkeypatch.setattr(CefrExplainService, "synthesize_explanation_audio", lambda self, text: "/tts/mock.mp3")

        results = process_sentences_with_cefr(
            [{"text_en": "Remarkable running", "text_zh": "", "tokens": ["Remarkable", "running"]}],
            target_level="B1",
            user_level="B1",
        )

        sentence = results[0]
        word_levels = sentence["cefr_vocab_json"]["word_levels"]
        assert word_levels["Remarkable"]["final_level"] == "B2"
        assert word_levels["running"]["final_level"] == "A2"
        assert sentence["needs_explanation"] is True
        assert explanation_words_seen == ["Remarkable"]
        assert sentence["explanation_audio_url"] == "/tts/mock.mp3"
