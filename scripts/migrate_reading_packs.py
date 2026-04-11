"""
迁移脚本：在 PostgreSQL 中创建 reading_packs 表。

使用方式：
  设置 DATABASE_URL 环境变量后运行：
  python scripts/migrate_reading_packs.py

  或者在 Zeabur 容器内运行。
"""
import os
import sys
from urllib.parse import urlparse, unquote


def _load_conn_params():
    url = (os.getenv("DATABASE_URL") or "").strip()
    if url:
        parsed = urlparse(url)
        host = parsed.hostname or "127.0.0.1"
        port = str(parsed.port or 5432)
        user = unquote(parsed.username or "")
        password = unquote(parsed.password or "") if parsed.password else ""
        db = (parsed.path or "/").lstrip("/") or "zeabur"
        return host, port, user, password, db

    host = os.getenv("POSTGRES_HOST", "127.0.0.1").strip()
    port = os.getenv("POSTGRES_PORT", "5432").strip()
    user = os.getenv("POSTGRES_USER", "root").strip()
    password = os.getenv("POSTGRES_PASSWORD", "").strip()
    db = os.getenv("POSTGRES_DB", "zeabur").strip()
    return host, port, user, password, db


def main():
    DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME = _load_conn_params()

    if not DB_PASSWORD:
        print("缺少数据库密码。设置 DATABASE_URL 或 POSTGRES_PASSWORD 环境变量。")
        sys.exit(1)

    try:
        import psycopg2
    except ImportError:
        print("需要 psycopg2: pip install psycopg2-binary")
        sys.exit(1)

    print(f"连接 PostgreSQL: {DB_HOST}:{DB_PORT}/{DB_NAME}")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=int(DB_PORT),
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        connect_timeout=15,
    )
    conn.autocommit = True
    cursor = conn.cursor()

    # 检查表是否已存在
    cursor.execute("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'reading_packs'
        );
    """)
    exists = cursor.fetchone()[0]

    if exists:
        print("✅ reading_packs 表已存在，跳过创建。")
    else:
        print("创建 reading_packs 表...")
        cursor.execute("""
            CREATE TABLE app.reading_packs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                article_id VARCHAR(255) NOT NULL,
                title VARCHAR(255) NOT NULL DEFAULT '',
                original_text TEXT NOT NULL DEFAULT '',
                rewritten_text TEXT NOT NULL DEFAULT '',
                target_level VARCHAR(10) NOT NULL DEFAULT 'B1',
                flow_status VARCHAR(32) NOT NULL DEFAULT 'idle',
                mappings_json JSONB,
                word_levels_json JSONB,
                valid_i1_words_json JSONB,
                valid_above_i1_words_json JSONB,
                removed_words_json JSONB,
                diagnostic_json JSONB,
                quiz_json JSONB,
                vocab_cards_json JSONB,
                course_data_json JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_reading_pack_user_article UNIQUE (user_id, article_id)
            );
        """)
        print("✅ 表已创建")

        # 创建索引
        cursor.execute("CREATE INDEX ix_reading_packs_user_id ON app.reading_packs (user_id);")
        cursor.execute("CREATE INDEX ix_reading_packs_article_id ON app.reading_packs (article_id);")
        print("✅ 索引已创建")

        # 创建外键
        try:
            cursor.execute("""
                ALTER TABLE app.reading_packs
                ADD CONSTRAINT fk_reading_packs_user_id
                FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;
            """)
            print("✅ 外键已创建")
        except psycopg2.errors.DuplicateObject:
            print("⚠️  外键已存在，跳过")

        print("\n✅ reading_packs 迁移完成！")

    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()
