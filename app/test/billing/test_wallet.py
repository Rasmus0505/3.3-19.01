"""钱包服务单元测试。"""
from decimal import Decimal

from app.services.billing.wallet import (
    BillingError,
    calculate_amount_by_duration_ms,
    calculate_cost_by_tokens,
    calculate_llm_charge_by_tokens,
    calculate_llm_cost_by_tokens,
    calculate_points,
    calculate_token_points,
    get_or_create_wallet_account,
)


class TestCalculateFunctions:
    """计算函数测试。"""

    def test_calculate_amount_by_duration_ms_with_valid_input(self):
        """测试正常计算点数。"""
        result = calculate_amount_by_duration_ms(60000, 100)  # 1分钟, 100点/分钟
        assert result == 100

    def test_calculate_amount_by_duration_ms_zero_duration(self):
        """测试零时长返回零。"""
        result = calculate_amount_by_duration_ms(0, 100)
        assert result == 0

    def test_calculate_amount_by_duration_ms_zero_rate(self):
        """测试零费率返回零。"""
        result = calculate_amount_by_duration_ms(60000, 0)
        assert result == 0

    def test_calculate_amount_by_duration_ms_negative_duration(self):
        """测试负时长返回零。"""
        result = calculate_amount_by_duration_ms(-60000, 100)
        assert result == 0

    def test_calculate_amount_by_duration_ms_half_minute(self):
        """测试半分钟计算。"""
        result = calculate_amount_by_duration_ms(30000, 100)  # 0.5分钟
        assert result == 50

    def test_calculate_cost_by_tokens_valid_input(self):
        """测试正常 token 成本计算。"""
        result = calculate_cost_by_tokens(1000, 10)  # 1000 tokens, 10 cents/1k
        assert result == 10

    def test_calculate_cost_by_tokens_zero_tokens(self):
        """测试零 token 返回零。"""
        result = calculate_cost_by_tokens(0, 10)
        assert result == 0

    def test_calculate_cost_by_tokens_zero_cost(self):
        """测试零费率返回零。"""
        result = calculate_cost_by_tokens(1000, 0)
        assert result == 0

    def test_calculate_cost_by_tokens_fractional(self):
        """测试分数 token 计算（向上取整）。"""
        result = calculate_cost_by_tokens(1500, 10)  # 1.5 * 10 = 15
        assert result == 15

    def test_calculate_points_is_alias_of_calculate_amount_by_duration_ms(self):
        """测试 calculate_points 是 calculate_amount_by_duration_ms 的别名。"""
        result = calculate_points(60000, 100)
        assert result == 100

    def test_calculate_points_with_price_per_minute_yuan(self):
        """测试 calculate_points 使用 price_per_minute_yuan 模式。"""
        result = calculate_points(60000, 100, price_per_minute_yuan=Decimal("1.30"))
        assert result == 2

    def test_calculate_points_with_price_per_minute_yuan_decimal(self):
        """测试 calculate_points 使用 Decimal price_per_minute_yuan。"""
        result = calculate_points(30000, 100, price_per_minute_yuan=Decimal("0.0132"))
        assert result == 1

    def test_calculate_points_with_zero_price_per_minute_yuan(self):
        """测试 calculate_points 当 price_per_minute_yuan 为 0 时返回 0。"""
        result = calculate_points(60000, 100, price_per_minute_yuan=Decimal("0"))
        assert result == 0

    def test_calculate_points_without_price_per_minute_yuan(self):
        """测试 calculate_points 不传 price_per_minute_yuan 时使用旧模式。"""
        result = calculate_points(60000, 100)
        assert result == 100

    def test_calculate_points_zero_duration(self):
        """测试 calculate_points 零时长返回零。"""
        result = calculate_points(0, 100)
        assert result == 0

    def test_calculate_token_points_valid_input(self):
        """测试正常 token 点数计算。"""
        result = calculate_token_points(1000, 15)  # 1000 tokens, 15 points/1k
        assert result == 15

    def test_calculate_token_points_zero_tokens(self):
        """测试零 token 返回零。"""
        result = calculate_token_points(0, 15)
        assert result == 0

    def test_calculate_llm_cost_by_tokens_valid_input(self):
        """测试 LLM 成本计算（输入输出分开计费）。"""
        # prompt: 500 tokens, 1 cent/1k
        # completion: 500 tokens, 2 cents/1k
        result = calculate_llm_cost_by_tokens(500, 500, 1, 2)
        # ceil(500/1000)*1 + ceil(500/1000)*2 = 1 + 1 = 2
        assert result == 2

    def test_calculate_llm_cost_by_tokens_zero_tokens(self):
        """测试零 token 返回零。"""
        result = calculate_llm_cost_by_tokens(0, 0, 1, 2)
        assert result == 0

    def test_calculate_llm_charge_by_tokens_valid_input(self):
        """测试 LLM 收费计算（单一费率）。"""
        result = calculate_llm_charge_by_tokens(2000, 15)  # 2000 tokens, 15 points/1k
        assert result == 30

    def test_calculate_llm_charge_by_tokens_zero_tokens(self):
        """测试零 token 返回零。"""
        result = calculate_llm_charge_by_tokens(0, 15)
        assert result == 0


class TestWalletAccountOperations:
    """钱包账户操作测试（需要数据库）。"""

    def test_get_or_create_wallet_account_creates_new(self, db_session):
        """测试为新用户创建钱包账户。"""
        # 使用一个不存在的用户 ID
        account = get_or_create_wallet_account(db_session, user_id=999)
        assert account is not None
        assert account.user_id == 999
        assert account.balance_points == 0

    def test_get_or_create_wallet_account_returns_existing(self, db_session, test_wallet):
        """测试返回已存在的钱包账户。"""
        account = get_or_create_wallet_account(db_session, user_id=test_wallet.user_id)
        assert account.id == test_wallet.id
        assert account.user_id == test_wallet.user_id

    def test_get_or_create_wallet_account_with_for_update(self, db_session, test_wallet):
        """测试带锁的账户查询。"""
        account = get_or_create_wallet_account(
            db_session,
            user_id=test_wallet.user_id,
            for_update=True
        )
        assert account is not None
        assert account.user_id == test_wallet.user_id


class TestBillingError:
    """BillingError 异常测试。"""

    def test_billing_error_creation(self):
        """测试 BillingError 创建。"""
        error = BillingError("TEST_CODE", "Test message", "Test detail")
        assert error.code == "TEST_CODE"
        assert error.message == "Test message"
        assert error.detail == "Test detail"
        assert str(error) == "Test message"

    def test_billing_error_default_detail(self):
        """测试默认 detail。"""
        error = BillingError("TEST_CODE", "Test message")
        assert error.detail == ""

    def test_billing_error_inheritance(self):
        """测试异常继承。"""
        error = BillingError("TEST_CODE", "Test message")
        assert isinstance(error, Exception)
