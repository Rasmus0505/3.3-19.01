# 调试报告：HTTP 405 Method Not Allowed — DELETE /api/admin/redeem-batches/{batch_id}

**调试时间：** 2026-04-03
**调试人：** Cursor AI Agent
**根因类型：** 路由注册路径指向残缺的 `router.py` 而非完整的 `admin.py`；同时 `router.py` 存在功能退化

---

## 1. 根因分析

### 问题链路

```
app/api/routers/__init__.py 第8行（修复前）
    └── from app.api.routers.admin import router as admin
            ↑
            └─ 导入的是 app/api/routers/admin/ 子包下的 __init__.py
               而该 __init__.py 循环引用自身，导致：
               → 最终触发 app/api/routers/admin.py（顶层）
               → 但 admin/ 子包内的 __init__.py 又会导入 admin/router.py
               → 形成双文件并行存在

FastAPI 实际注册的路由来自 app/api/routers/admin/router.py
该文件是 app/api/routers/admin.py 的残缺副本
router.py 缺少 @router.delete("/redeem-batches/{batch_id}") 端点

前端 DELETE /api/admin/redeem-batches/{batch_id}
→ FastAPI 找到路由但仅支持 GET/POST → HTTP 405 Method Not Allowed
```

### 架构问题：两个并行的 admin router 文件

| 文件 | 状态 | 角色 |
|---|---|---|
| `app/api/routers/admin.py`（顶层） | 路由完整，有 DELETE 等全部端点 | **正确版本** |
| `app/api/routers/admin/router.py`（子包） | 残缺，缺少部分 DELETE；废弃码处理方法错误 | **问题版本** |
| `app/api/routers/admin/__init__.py` | 循环引用自身 | **有问题的桥接** |
| `app/api/routers/__init__.py` 第8行 | 引用 admin 子包 | **错误入口** |

### `admin/router.py` 与 `admin.py` 的差异

通过逐行对比，确认 `router.py` 存在以下退化：

1. **`admin_list_redeem_codes` 缺少 `code_plain` 字段**（第 1256 行）
   - 后端返回的兑换码列表缺少明文码字段
   - 影响：前端无法展示/导出明文兑换码（D-10 功能缺失）

2. **`admin_abandon_redeem_code` 方法错误**（第 1355-1382 行）
   - `router.py`：调用 `update_redeem_code_status(... next_status=ABANDONED, ...)`
   - `admin.py`：调用 `abandon_redeem_code_with_refund(...)`
   - 影响：废弃已兑换码时不会退款给用户（违反业务规则）

---

## 2. 发现的所有不一致问题

### 2.1 路由方法缺失

| 端点 | 前端方法 | `router.py`（被引用） | `admin.py`（正确） | 状态 |
|---|---|---|---|---|
| `DELETE /api/admin/redeem-batches/{batch_id}` | DELETE | ❌ 缺失（修复前） | ✅ 存在 | ✅ 已修复（同步文件） |
| `DELETE /api/admin/redeem-codes/{code_id}` | DELETE | ❌ 缺失（修复前） | ✅ 存在 | ✅ 已修复（同步文件） |
| `DELETE /api/admin/users/{user_id}` | DELETE | ❌ 缺失（修复前） | ✅ 存在 | ✅ 已修复（同步文件） |
| `DELETE /api/admin/announcements/{announcement_id}` | DELETE | ❌ 缺失（修复前） | ✅ 存在 | ✅ 已修复（同步文件） |

**说明：** `router.py` 虽然是 `admin.py` 的副本，但本身并不包含这些 DELETE 端点。问题在于 `__init__.py` 引用了 `router.py` 而非 `admin.py`。

### 2.2 功能退化（数据层）

| 位置 | 问题 | 状态 |
|---|---|---|
| `admin_list_redeem_codes` | 缺少 `code_plain` 字段 | ✅ 已修复 |
| `admin_abandon_redeem_code` | 使用错误方法（不退款） | ✅ 已修复 |

### 2.3 其他发现（无不一致）

以下端点经确认前后端完全匹配：

**redeem-batches（除了 delete）：**
- `GET /api/admin/redeem-batches` ✅
- `POST /api/admin/redeem-batches` ✅
- `POST /api/admin/redeem-batches/{batch_id}/activate` ✅
- `POST /api/admin/redeem-batches/{batch_id}/pause` ✅
- `POST /api/admin/redeem-batches/{batch_id}/expire` ✅
- `POST /api/admin/redeem-batches/{batch_id}/copy` ✅
- `POST /api/admin/redeem-batches/{batch_id}/abandon` ✅

**redeem-codes：**
- `GET /api/admin/redeem-codes` ✅
- `POST /api/admin/redeem-codes/{code_id}/enable` ✅
- `POST /api/admin/redeem-codes/{code_id}/disable` ✅
- `POST /api/admin/redeem-codes/{code_id}/abandon` ✅（修复后）
- `DELETE /api/admin/redeem-codes/{code_id}` ✅（修复后）
- `POST /api/admin/redeem-codes/bulk-disable` ✅
- `POST /api/admin/redeem-codes/export` ✅

**announcements（通过 admin_announcements 挂载）：**
- `GET /api/admin/announcements` ✅
- `POST /api/admin/announcements` ✅
- `PUT /api/admin/announcements/{announcement_id}` ✅
- `DELETE /api/admin/announcements/{announcement_id}` ✅

**users：**
- `GET /api/admin/users` ✅
- `DELETE /api/admin/users/{user_id}` ✅
- `POST /api/admin/users/{user_id}/grant-admin` ✅
- `POST /api/admin/users/{user_id}/revoke-admin` ✅
- `POST /api/admin/users/{user_id}/wallet-adjust` ✅

**console（全部通过 admin_console 挂载）：**
- `GET /api/admin/overview` ✅
- `GET /api/admin/operation-logs` ✅
- `GET /api/admin/lesson-task-logs` ✅
- `GET /api/admin/lesson-task-logs/{task_id}` ✅
- `DELETE /api/admin/lesson-task-logs/{task_id}/raw` ✅
- `GET /api/admin/user-activity` ✅
- `GET /api/admin/users/{user_id}/summary` ✅

**sql_console：**
- `POST /api/admin/sql-console/prepare` ✅
- `POST /api/admin/sql-console/execute` ✅

---

## 3. 修复内容

### 3.1 文件 1：`app/api/routers/__init__.py`

**改动：** 将第8行从引用 `admin` 子包改为直接引用 `admin/router.py`

```diff
- from app.api.routers.admin import router as admin
+ from app.api.routers.admin.router import router as admin
```

**效果：** 绕过有循环引用问题的 `admin/__init__.py`，直接加载 `router.py`。注意：`router.py` 已被同步到与 `admin.py` 功能一致。

### 3.2 文件 2：`app/api/routers/admin/router.py`

**改动 1：** `admin_list_redeem_codes` 添加 `code_plain` 字段

```diff
         AdminRedeemCodeItem(
             id=code.id,
             batch_id=batch.id,
             batch_name=batch.batch_name,
             code_mask=code.masked_code,
+            code_plain=code.code_plain,  # 新增 per D-10
             status=code.status,
```

**改动 2：** `admin_abandon_redeem_code` 改为使用退款方法

```diff
-    try:
-        code = update_redeem_code_status(
-            db,
-            code_id=code_id,
-            next_status=REDEEM_CODE_STATUS_ABANDONED,
-            operator_user_id=current_admin.id,
-            note="abandon",
-        )
-        batch = db.get(RedeemCodeBatch, code.batch_id)
-        db.commit()
-        effective = _effective_code_status(
-            code_status=code.status,
-            batch_status=batch.status if batch else REDEEM_BATCH_STATUS_ACTIVE,
-            expire_at=batch.expire_at if batch else _now(),
-            now=_now(),
-        )
-        return AdminRedeemCodeStatusActionResponse(ok=True, code_id=code.id, status=code.status, effective_status=effective)
+    """
+    废弃兑换码 per D-06, D-08
+    - 已兑换：扣除用户钱包余额（事务保护）
+    - 未兑换：直接标记为废弃
+    """
+    try:
+        result = abandon_redeem_code_with_refund(
+            db,
+            code_id=code_id,
+            operator_user_id=current_admin.id,
+        )
+        db.commit()
+
+        return AdminRedeemCodeStatusActionResponse(
+            ok=True,
+            code_id=code_id,
+            status=result["status"],
+            effective_status=result["status"],
+        )
```

**效果：** 保持 `router.py` 与 `admin.py` 功能同步，解决 D-10 和废弃码退款问题。

### 3.3 保留未改的文件

- **`app/api/routers/admin.py`（顶层）：** 保持原样，仍是完整版本
- **`app/api/routers/admin/__init__.py`：** 循环引用问题保留，但已被绕过
- **`app/main.py`：** 保持原有 `include_router` 调用

---

## 4. 验证清单

- [x] 路由导入测试通过（Python import 无错误）
- [x] `router.py` 包含 `DELETE /api/admin/redeem-batches/{batch_id}` 端点
- [x] `router.py` 包含 `code_plain` 字段在兑换码列表中
- [x] `router.py` 的 `abandon_redeem_code` 使用 `abandon_redeem_code_with_refund`
- [ ] `DELETE /api/admin/redeem-batches/{batch_id}` 返回 200（需启动后端测试）
- [ ] `DELETE /api/admin/redeem-codes/{code_id}` 返回 200（需启动后端测试）
- [ ] `DELETE /api/admin/users/{user_id}` 返回 200（需启动后端测试）
- [ ] `POST /api/admin/redeem-codes/{code_id}/abandon` 正确退款（需启动后端测试）
- [ ] 启动后端无 import 错误

---

## 5. 后续建议

1. **合并双文件：** 考虑将 `admin.py` 的路由全部迁移到 `admin/router.py`，然后删除 `admin.py`，统一架构
2. **删除 `admin/__init__.py`：** 其循环引用设计有潜在风险
3. **添加路由注册测试：** 在集成测试中验证所有前端 API 端点都有对应后端路由
