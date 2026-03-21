# Database Migrations

使用 Alembic 管理数据库结构变更。

## 常用命令

```bash
python -m alembic -c alembic.ini upgrade head
python -m alembic -c alembic.ini downgrade -1
python -m alembic -c alembic.ini revision -m "your change"
```

## 生产环境规则

- 不要把生产环境默认建立在 SQLite 回退上
- 生产环境需要 `APP_ENV=production`
- 首次部署前先完成 Alembic 迁移
- `users.is_admin` 等关键列未迁移到位时，`GET /health/ready` 会失败
- `ADMIN_EMAILS` 只用于初始化/补管理员，不是运行时鉴权

## 推荐的生产迁移方式

默认把 Zeabur `web` 服务设置为：

```text
AUTO_MIGRATE_ON_START=0
```

然后在本地或受控机器执行：

```bash
python scripts/run_prod_migration.py
```

只检查 revision 是否已经到位：

```bash
python scripts/run_prod_migration.py --check-only
```

脚本会优先读取：

1. `PROD_DATABASE_URL`
2. `DATABASE_URL`

如果两者都没有，会直接报错，不会私自回退到 SQLite。
