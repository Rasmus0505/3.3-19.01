-- ============================================================
-- SOE Results 表 - 远程 PostgreSQL 数据库迁移脚本
-- 适用于 Zeabur 等云 PostgreSQL 数据库
-- ============================================================

-- 检查表是否已存在
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'app'
        AND table_name = 'soe_results'
    ) THEN
        RAISE NOTICE '表 app.soe_results 已存在，跳过创建。';
    ELSE
        -- 创建 soe_results 表
        CREATE TABLE app.soe_results (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            lesson_id INTEGER,
            sentence_id INTEGER,
            ref_text TEXT NOT NULL,
            user_text TEXT NOT NULL DEFAULT '',
            total_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            pronunciation_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            fluency_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            completeness_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            audio_duration_ms INTEGER,
            voice_id VARCHAR(64) NOT NULL,
            raw_response_json JSONB,
            word_results_json JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        -- 创建索引
        CREATE INDEX ix_soe_results_user_id ON app.soe_results (user_id);
        CREATE INDEX ix_soe_results_lesson_id ON app.soe_results (lesson_id);
        CREATE INDEX ix_soe_results_sentence_id ON app.soe_results (sentence_id);
        CREATE INDEX ix_soe_results_voice_id ON app.soe_results (voice_id);
        CREATE INDEX ix_soe_results_created_at ON app.soe_results (created_at);

        -- 创建外键
        ALTER TABLE app.soe_results
            ADD CONSTRAINT fk_soe_results_user_id
            FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;

        ALTER TABLE app.soe_results
            ADD CONSTRAINT fk_soe_results_lesson_id
            FOREIGN KEY (lesson_id) REFERENCES app.lessons(id) ON DELETE SET NULL;

        ALTER TABLE app.soe_results
            ADD CONSTRAINT fk_soe_results_sentence_id
            FOREIGN KEY (sentence_id) REFERENCES app.lesson_sentences(id) ON DELETE SET NULL;

        RAISE NOTICE '表 app.soe_results 创建成功！';
    END IF;
END $$;

-- 验证表创建
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'soe_results') as column_count
FROM information_schema.tables
WHERE table_schema = 'app' AND table_name = 'soe_results';

-- 显示表结构
\d app.soe_results
