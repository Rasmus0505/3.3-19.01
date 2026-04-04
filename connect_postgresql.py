"""
连接远程 PostgreSQL 数据库并检查 / 修复 app.soe_results 表。

凭据仅从环境变量读取，勿在仓库中硬编码密码。

环境变量（与 app 常用 DATABASE_URL 对齐时可二选一）:
  POSTGRES_HOST      默认 127.0.0.1（本地）；公网诊断见 AGENTS.md 中的 NodePort 说明
  POSTGRES_PORT      默认 5432
  POSTGRES_USER      默认 root
  POSTGRES_PASSWORD  必填（或 DATABASE_URL 中含密码）
  POSTGRES_DB        默认 zeabur
  DATABASE_URL       若设置则优先于上述分项（postgresql://...）
"""
import sys
import os
from urllib.parse import urlparse, unquote

def _load_conn_params():
    url = (os.getenv("DATABASE_URL") or "").strip()
    if url:
        parsed = urlparse(url)
        if parsed.scheme not in ("postgresql", "postgres"):
            raise SystemExit("DATABASE_URL 必须是 postgresql:// 或 postgres://")
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


DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME = _load_conn_params()

if not DB_PASSWORD:
    print("缺少 POSTGRES_PASSWORD（或 DATABASE_URL 中未包含密码）。")
    print("示例: $env:POSTGRES_PASSWORD='你的密码'; python connect_postgresql.py")
    sys.exit(1)

print("=" * 70)
print("PostgreSQL 数据库诊断")
print("=" * 70)
print()
print(f"数据库: {DB_NAME}")
print(f"主机:   {DB_HOST}")
print(f"端口:   {DB_PORT}")
print(f"用户:   {DB_USER}")
print()

try:
    import psycopg2
    print("✅ psycopg2 库已加载")
except ImportError:
    print("❌ psycopg2 未安装")
    sys.exit(1)

# 连接数据库
try:
    print()
    print("正在连接数据库...")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=int(DB_PORT),
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        connect_timeout=15,
    )
    conn.autocommit = True
    print("✅ 数据库连接成功！")
except psycopg2.OperationalError as e:
    print(f"❌ 连接失败: {e}")
    print()
    print("可能原因：")
    print("  1. 主机/端口错误：容器内用内网主机名 + 5432；外网运维用 Zeabur 面板的 NodePort（如 IP:30835）")
    print("  2. 安全组 / 防火墙未放行该 NodePort")
    print("  3. 密码或库名不正确；或未设置 POSTGRES_PASSWORD / DATABASE_URL")
    sys.exit(1)

cursor = conn.cursor()

# 1. 检查 PostgreSQL 版本
print()
print("-" * 70)
print("1. PostgreSQL 版本")
print("-" * 70)
cursor.execute("SELECT version();")
version = cursor.fetchone()[0]
print(version)

# 2. 列出所有 schema
print()
print("-" * 70)
print("2. 所有 Schema")
print("-" * 70)
cursor.execute("""
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
    ORDER BY schema_name;
""")
schemas = cursor.fetchall()
for s in schemas:
    print(f"  - {s[0]}")

# 3. 列出 app schema 的所有表
print()
print("-" * 70)
print("3. app schema 中的所有表")
print("-" * 70)
cursor.execute("""
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'app'
    ORDER BY table_name;
""")
tables = cursor.fetchall()
print(f"共 {len(tables)} 个表:")
for t in tables:
    print(f"  - {t[0]}")

# 4. 检查 soe_results 表
print()
print("-" * 70)
print("4. 检查 soe_results 表")
print("-" * 70)

cursor.execute("""
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'app' AND table_name = 'soe_results'
    );
""")
soe_exists = cursor.fetchone()[0]

if soe_exists:
    print("✅ soe_results 表存在！")

    # 检查表结构
    print()
    print("  表结构:")
    cursor.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'soe_results'
        ORDER BY ordinal_position;
    """)
    columns = cursor.fetchall()
    for col in columns:
        nullable = "NULL" if col[2] == 'YES' else "NOT NULL"
        default = f" DEFAULT {col[3]}" if col[3] else ""
        print(f"    - {col[0]}: {col[1]} ({nullable}){default}")

    # 检查索引
    print()
    print("  索引:")
    cursor.execute("""
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'app' AND tablename = 'soe_results'
        ORDER BY indexname;
    """)
    indexes = cursor.fetchall()
    for idx in indexes:
        print(f"    - {idx[0]}")

    # 检查外键
    print()
    print("  外键:")
    cursor.execute("""
        SELECT
            tc.constraint_name,
            kcu.column_name,
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'app'
            AND tc.table_name = 'soe_results';
    """)
    fks = cursor.fetchall()
    if fks:
        for fk in fks:
            print(f"    - {fk[0]}: {fk[1]} -> {fk[3]}.{fk[4]}")
    else:
        print("    (无外键)")

    # 检查数据行数
    print()
    print("  数据行数:")
    cursor.execute("SELECT COUNT(*) FROM app.soe_results;")
    count = cursor.fetchone()[0]
    print(f"    {count} 行")

else:
    print("❌ soe_results 表不存在！")
    print()
    print("需要创建表。执行创建...")

    # 创建表
    create_sql = """
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
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """
    cursor.execute(create_sql)
    print("✅ soe_results 表已创建")

    # 创建索引
    indexes = [
        "CREATE INDEX ix_soe_results_user_id ON app.soe_results (user_id);",
        "CREATE INDEX ix_soe_results_lesson_id ON app.soe_results (lesson_id);",
        "CREATE INDEX ix_soe_results_sentence_id ON app.soe_results (sentence_id);",
        "CREATE INDEX ix_soe_results_voice_id ON app.soe_results (voice_id);",
        "CREATE INDEX ix_soe_results_created_at ON app.soe_results (created_at);",
    ]
    for idx_sql in indexes:
        cursor.execute(idx_sql)
    print("✅ 所有索引已创建")

    # 创建外键
    fks = [
        ("fk_soe_results_user_id", "user_id", "users", "id", "CASCADE"),
        ("fk_soe_results_lesson_id", "lesson_id", "lessons", "id", "SET NULL"),
        ("fk_soe_results_sentence_id", "sentence_id", "lesson_sentences", "id", "SET NULL"),
    ]
    for fk_name, col, ref_table, ref_col, on_delete in fks:
        try:
            fk_sql = f"""
            ALTER TABLE app.soe_results
            ADD CONSTRAINT {fk_name}
            FOREIGN KEY ({col}) REFERENCES app.{ref_table}({ref_col}) ON DELETE {on_delete};
            """
            cursor.execute(fk_sql)
            print(f"✅ 外键 {fk_name} 已创建")
        except psycopg2.errors.DuplicateObject:
            print(f"⚠️  外键 {fk_name} 已存在，跳过")

    # 更新 alembic 版本
    try:
        cursor.execute("SELECT version_num FROM public.alembic_version ORDER BY version_num DESC LIMIT 1;")
        current_version = cursor.fetchone()
        if current_version:
            print(f"当前 alembic 版本: {current_version[0]}")
    except:
        pass

    print()
    print("✅ 数据库修复完成！")

# 关闭连接
cursor.close()
conn.close()

print()
print("=" * 70)
print("数据库诊断完成")
print("=" * 70)
