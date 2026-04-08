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
