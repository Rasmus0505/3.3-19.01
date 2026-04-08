"""计费相关异常定义。"""


class BillingError(Exception):
    """计费相关异常基类。"""

    def __init__(self, code: str, message: str, detail: str = ""):
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)


class InsufficientBalanceError(BillingError):
    """余额不足异常。"""

    def __init__(self, available: int, required: int):
        super().__init__(
            code="INSUFFICIENT_BALANCE",
            message=f"余额不足：当前 {available} 点，需要 {required} 点",
            detail={"available": available, "required": required},
        )


class RateNotFoundError(BillingError):
    """费率未找到异常。"""

    def __init__(self, model_name: str):
        super().__init__(
            code="BILLING_RATE_NOT_FOUND",
            message=f"未找到模型 {model_name} 的费率配置",
            detail={"model_name": model_name},
        )


class RedeemCodeError(BillingError):
    """兑换码相关异常基类。"""

    pass


class RedeemCodeNotFoundError(RedeemCodeError):
    """兑换码不存在。"""

    def __init__(self, code: str):
        super().__init__(
            code="REDEEM_CODE_NOT_FOUND",
            message=f"兑换码 {code} 不存在",
            detail={"code": code},
        )


class RedeemCodeAlreadyUsedError(RedeemCodeError):
    """兑换码已被使用。"""

    def __init__(self, code: str):
        super().__init__(
            code="REDEEM_CODE_ALREADY_USED",
            message=f"兑换码 {code} 已被使用",
            detail={"code": code},
        )


class RedeemCodeExpiredError(RedeemCodeError):
    """兑换码已过期。"""

    def __init__(self, code: str):
        super().__init__(
            code="REDEEM_CODE_EXPIRED",
            message=f"兑换码 {code} 已过期",
            detail={"code": code},
        )


class RedeemCodeDisabledError(RedeemCodeError):
    """兑换码已禁用。"""

    def __init__(self, code: str):
        super().__init__(
            code="REDEEM_CODE_DISABLED",
            message=f"兑换码 {code} 已禁用",
            detail={"code": code},
        )


class RedeemBatchNotFoundError(BillingError):
    """兑换批次不存在。"""

    def __init__(self, batch_id: str):
        super().__init__(
            code="REDEEM_BATCH_NOT_FOUND",
            message=f"兑换批次 {batch_id} 不存在",
            detail={"batch_id": batch_id},
        )


class InvalidPointsError(BillingError):
    """无效的点数。"""

    def __init__(self, points: int):
        super().__init__(
            code="INVALID_POINTS",
            message=f"无效的点数：{points}",
            detail={"points": points},
        )


class InvalidQuantityError(BillingError):
    """无效的数量。"""

    def __init__(self, quantity: int):
        super().__init__(
            code="INVALID_QUANTITY",
            message=f"无效的数量：{quantity}",
            detail={"quantity": quantity},
        )
