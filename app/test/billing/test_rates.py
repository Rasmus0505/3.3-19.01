"""费率服务单元测试。"""
import pytest
from decimal import Decimal

from app.services.billing.rates import (
    normalize_rate_yuan,
    yuan_to_compat_cents,
    build_rate_payload,
)


class TestRateNormalization:
    """费率规范化测试。"""

    def test_normalize_rate_yuan_with_valid_decimal(self):
        """测试有效的 Decimal 输入。"""
        result = normalize_rate_yuan(Decimal("1.30"))
        assert result == Decimal("1.30")

    def test_normalize_rate_yuan_with_valid_float(self):
        """测试有效的浮点数输入。"""
        result = normalize_rate_yuan(1.30)
        assert result > 0

    def test_normalize_rate_yuan_with_valid_int(self):
        """测试有效的整数输入。"""
        result = normalize_rate_yuan(5)
        assert result > 0

    def test_normalize_rate_yuan_with_none(self):
        """测试 None 输入使用 fallback。"""
        result = normalize_rate_yuan(None, fallback_cents=100)
        assert result == Decimal("1.00")  # 100 cents = 1 yuan

    def test_normalize_rate_yuan_with_empty_string(self):
        """测试空字符串输入使用 fallback。"""
        result = normalize_rate_yuan("", fallback_cents=50)
        assert result == Decimal("0.50")

    def test_normalize_rate_yuan_fallback_priority(self):
        """测试 fallback 的优先级（当值无效时使用）。"""
        # 当值为 0 且 fallback_cents <= 0 时，使用 fallback
        result = normalize_rate_yuan(0, fallback_cents=100)
        assert result == Decimal("1.00")

    def test_yuan_to_compat_cents_with_decimal(self):
        """测试 Decimal 转 cents。"""
        result = yuan_to_compat_cents(Decimal("1.30"))
        assert result == 130

    def test_yuan_to_compat_cents_with_float(self):
        """测试浮点数转 cents。"""
        result = yuan_to_compat_cents(1.30)
        assert result == 130

    def test_yuan_to_compat_cents_with_int(self):
        """测试整数转 cents。"""
        result = yuan_to_compat_cents(5)
        assert result == 500

    def test_yuan_to_compat_cents_with_none(self):
        """测试 None 返回零。"""
        result = yuan_to_compat_cents(None)
        assert result == 0

    def test_yuan_to_compat_cents_rounds(self):
        """测试四舍五入。"""
        result = yuan_to_compat_cents(Decimal("1.255"))
        assert result == 126  # 1.255 -> 126 cents


class TestBuildRatePayload:
    """构建费率负载测试。"""

    def test_build_rate_payload_minimal(self):
        """测试最小输入。"""
        result = build_rate_payload({"model_name": "test-model"})
        assert result["model_name"] == "test-model"
        assert result["points_per_minute"] == 0
        assert result["points_per_1k_tokens"] == 0

    def test_build_rate_payload_full(self):
        """测试完整输入。"""
        payload = {
            "model_name": "qwen3-asr-flash-filetrans",
            "points_per_minute": 130,
            "price_per_minute_yuan": Decimal("1.30"),
            "points_per_1k_tokens": 0,
            "cost_per_1k_tokens_input_cents": 1,
            "cost_per_1k_tokens_output_cents": 20,
            "billing_unit": "minute",
            "parallel_enabled": True,
        }
        result = build_rate_payload(payload)

        assert result["model_name"] == "qwen3-asr-flash-filetrans"
        assert result["points_per_minute"] == 130
        assert result["price_per_minute_yuan"] == Decimal("1.30")
        assert result["points_per_1k_tokens"] == 0
        assert result["billing_unit"] == "minute"
        assert result["parallel_enabled"] is True

    def test_build_rate_payload_defaults(self):
        """测试默认值填充。"""
        payload = {
            "model_name": "test",
            "billing_unit": "minute",
        }
        result = build_rate_payload(payload)

        assert result["cost_per_1k_tokens_input_cents"] == 0
        assert result["cost_per_1k_tokens_output_cents"] == 0
        assert result["parallel_enabled"] is False
        assert result["max_concurrency"] == 1

    def test_build_rate_payload_string_values(self):
        """测试字符串数值输入。"""
        payload = {
            "model_name": "test",
            "points_per_minute": "130",
            "price_per_minute_yuan": "1.30",
        }
        result = build_rate_payload(payload)

        assert result["points_per_minute"] == 130
        assert result["price_per_minute_yuan"] == Decimal("1.30")
