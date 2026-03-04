BEGIN;

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.wallet_accounts (
    user_id INTEGER PRIMARY KEY REFERENCES app.users(id),
    balance_points BIGINT NOT NULL DEFAULT 0 CHECK (balance_points >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.wallet_ledger (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app.users(id),
    operator_user_id INTEGER NULL REFERENCES app.users(id),
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('reserve','consume','refund','manual_adjust')),
    delta_points BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    model_name VARCHAR(100) NULL,
    duration_ms INTEGER NULL,
    lesson_id INTEGER NULL REFERENCES app.lessons(id),
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.billing_model_rates (
    model_name VARCHAR(100) PRIMARY KEY,
    points_per_minute INTEGER NOT NULL CHECK (points_per_minute > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by_user_id INTEGER NULL REFERENCES app.users(id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created_at ON app.wallet_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_event_created_at ON app.wallet_ledger (event_type, created_at DESC);

INSERT INTO app.wallet_accounts (user_id, balance_points, created_at, updated_at)
SELECT u.id, 0, NOW(), NOW()
FROM app.users u
LEFT JOIN app.wallet_accounts wa ON wa.user_id = u.id
WHERE wa.user_id IS NULL;

INSERT INTO app.billing_model_rates (model_name, points_per_minute, is_active, updated_at)
VALUES
    ('paraformer-v2', 100, TRUE, NOW()),
    ('qwen3-asr-flash-filetrans', 130, TRUE, NOW())
ON CONFLICT (model_name) DO NOTHING;

COMMIT;
