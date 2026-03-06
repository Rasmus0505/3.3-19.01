# 第05章：数据库基础（SQL、表、字段、关系）

## 5.1 为什么要数据库

没有数据库，系统无法稳定保存：

- 用户账号
- 课程与句子
- 学习进度
- 钱包账本与兑换码

内存里的数据会随着进程重启丢失，数据库负责持久化。

---

## 5.2 术语精讲

### 表（Table）

- 同类数据的集合
- 例：`users`、`lessons`

### 行（Row）

- 一条记录
- 例如某个用户、某节课程

### 列（Column）

- 字段定义
- 例如 `id`、`title`、`created_at`

### 主键（Primary Key）

- 唯一标识一行
- 常见用 `id`

### 外键（Foreign Key）

- 建立表与表关系
- 例如 `lessons.user_id -> users.id`

### 索引（Index）

- 提升查询速度
- 代价是写入时额外维护成本

### 约束（Constraint）

- 保证数据合法性
- 如唯一约束、非空约束

### 事务（Transaction）

- 一组操作要么都成功，要么都失败回滚
- 避免“写了一半”造成脏数据

---

## 5.3 本项目数据库约定

### 核心数据库

- 生产：Postgres
- 本地快速开发：SQLite（可选）

### schema 约定

- 业务表统一在 `app` schema 下
- 不依赖 `search_path` 模糊行为

### 迁移策略

- 生产优先 Alembic 迁移
- SQLite 本地可用 `create_all` 快速起步

---

## 5.4 本项目主要业务表（认知版）

- `users`：用户账号与权限基础
- `lessons`：课程主表
- `lesson_sentences`：课程句子明细
- `lesson_progress`：学习进度
- `media_assets`：媒体资源路径
- `wallet_accounts` / `wallet_ledger`：钱包账户与流水
- `billing_model_rates`：模型计费费率
- `redeem_code_*`：兑换码批次、码值、尝试记录

---

## 5.5 一条“课程数据”如何落库

当上传转写成功后，通常会写入：

1. `lessons` 新增一条课程主记录
2. `lesson_sentences` 批量写句子数据
3. `media_assets` 写媒体路径信息
4. 计费相关流水进入钱包账本

如果中途失败，事务应回滚，避免出现孤儿数据。

---

## 5.6 SQL 入门最小语句

### 查询

```sql
SELECT id, title, created_at
FROM app.lessons
WHERE user_id = 1
ORDER BY id DESC
LIMIT 20;
```

### 更新

```sql
UPDATE app.lessons
SET title = '新标题'
WHERE id = 1001 AND user_id = 1;
```

### 删除

```sql
DELETE FROM app.lessons
WHERE id = 1001 AND user_id = 1;
```

---

## 5.7 常见数据库坑

### 坑 1：只改 ORM，不做迁移

生产库不会自动跟你本地结构一致，必须做迁移。

### 坑 2：没有用户条件直接更新/删除

可能误伤其他用户数据。用户隔离条件必须带上。

### 坑 3：把业务表和系统表混看

在可视化工具里应优先看业务 schema（本项目是 `app`）。

---

## 5.8 本章自测

1. 解释主键与外键的作用。
2. 解释为什么事务对上传转写链路很重要。
3. 解释为什么生产环境不能只靠 `create_all`。

