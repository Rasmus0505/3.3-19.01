"""根级 pytest 配置 - 导入所有 fixtures。"""
from tests.fixtures import (
    admin_user,
    authenticated_client,
    db_engine,
    db_session,
    test_billing_rate,
    test_lesson,
    test_lesson_with_sentences,
    test_redeem_batch,
    test_redeem_code,
    test_sentence,
    test_user,
    test_wallet,
)

__all__ = [
    "db_engine",
    "db_session",
    "test_user",
    "admin_user",
    "authenticated_client",
    "test_lesson",
    "test_lesson_with_sentences",
    "test_sentence",
    "test_wallet",
    "test_billing_rate",
    "test_redeem_batch",
    "test_redeem_code",
]
