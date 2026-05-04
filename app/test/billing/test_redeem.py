"""兑换码服务单元测试。"""

from app.services.billing.redeem import (
    hash_redeem_code,
    mask_redeem_code,
    normalize_redeem_code_input,
)


class TestRedeemCodeHelpers:
    """兑换码辅助函数测试。"""

    def test_normalize_redeem_code_input_removes_spaces(self):
        """测试规范化兑换码去除空格。"""
        assert normalize_redeem_code_input("ABCD 1234 5678") == "ABCD12345678"
        assert normalize_redeem_code_input("  ABCD1234  ") == "ABCD1234"

    def test_normalize_redeem_code_input_uppercase(self):
        """测试规范化兑换码转为大写。"""
        assert normalize_redeem_code_input("abcd1234") == "ABCD1234"
        assert normalize_redeem_code_input("AbCd1234") == "ABCD1234"

    def test_normalize_redeem_code_input_empty(self):
        """测试空字符串返回空字符串。"""
        assert normalize_redeem_code_input("") == ""
        assert normalize_redeem_code_input("   ") == ""

    def test_hash_redeem_code_returns_string(self):
        """测试哈希返回字符串。"""
        result = hash_redeem_code("ABCD1234")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_hash_redeem_code_deterministic(self):
        """测试哈希是确定性的。"""
        code = "ABCD1234"
        hash1 = hash_redeem_code(code)
        hash2 = hash_redeem_code(code)
        assert hash1 == hash2

    def test_hash_redeem_code_different_inputs(self):
        """测试不同输入产生不同哈希。"""
        hash1 = hash_redeem_code("ABCD1234")
        hash2 = hash_redeem_code("WXYZ5678")
        assert hash1 != hash2

    def test_mask_redeem_code_short(self):
        """测试短码掩码。"""
        result = mask_redeem_code("ABCD")
        assert result.startswith("AB")
        assert result.endswith("CD")
        assert "****" in result

    def test_mask_redeem_code_long(self):
        """测试长码掩码。"""
        result = mask_redeem_code("ABCD12345678")
        assert result.startswith("ABCD")
        assert result.endswith("5678")
        assert "****" in result

    def test_mask_redeem_code_empty(self):
        """测试空码掩码。"""
        result = mask_redeem_code("")
        assert result == "****"

    def test_mask_redeem_code_exactly_8_chars(self):
        """测试正好8位码掩码。"""
        result = mask_redeem_code("ABCD1234")
        assert result.startswith("AB")
        assert result.endswith("34")
        assert "****" in result


class TestRedeemCodeNormalization:
    """兑换码规范化测试。"""

    def test_full_workflow(self):
        """测试完整工作流。"""
        # 原始输入（可能有空格和大写混合）
        raw_input = "  abcd 1234 5678  "
        # 规范化
        normalized = normalize_redeem_code_input(raw_input)
        assert normalized == "ABCD12345678"
        # 哈希
        hashed = hash_redeem_code(normalized)
        assert isinstance(hashed, str)
        # 掩码
        masked = mask_redeem_code(normalized)
        assert masked != normalized  # 掩码不应等于原文
        assert len(masked) < len(normalized)  # 掩码应该更短
