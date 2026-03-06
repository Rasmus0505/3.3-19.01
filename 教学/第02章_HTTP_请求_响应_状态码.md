# 第02章：HTTP、请求、响应、状态码

## 2.1 HTTP 是什么

HTTP（HyperText Transfer Protocol）是浏览器与服务器通信最核心的应用层协议。

你可以把一次 HTTP 调用理解为：

- 请求（Request）：客户端问问题
- 响应（Response）：服务器给结果

---

## 2.2 URL 与路径结构

一个完整 URL 示例：

```text
https://api.example.com:443/api/transcribe/file?model=paraformer-v2
```

拆解：

- `https`：协议
- `api.example.com`：域名
- `443`：端口（HTTPS 默认可省略）
- `/api/transcribe/file`：路径（路由）
- `model=...`：查询参数

---

## 2.3 请求（Request）详解

一个请求通常包含：

1. 方法（Method）
2. 路径（Path）
3. 请求头（Headers）
4. 请求体（Body，可选）

### 常见方法

- `GET`：查询资源
- `POST`：创建资源
- `PATCH`：局部更新资源
- `DELETE`：删除资源

本项目典型例子：

- `POST /api/transcribe/file`：上传文件并生成课程
- `GET /health`：检查服务存活

### 常见请求头

- `Authorization: Bearer <token>`：登录态
- `Content-Type`：请求体格式
- `Accept`：可接受响应类型

### 请求体

- JSON 请求：常见于管理、提交参数
- 表单/文件请求：上传媒体文件时常见（`multipart/form-data`）

---

## 2.4 响应（Response）详解

响应通常包含：

1. 状态码（Status Code）
2. 响应头
3. 响应体

响应体在 API 中一般是 JSON：

```json
{
  "ok": true,
  "data": {}
}
```

---

## 2.5 状态码速查（最常用）

### 2xx 成功

- `200 OK`：请求成功
- `201 Created`：资源已创建

### 4xx 客户端问题

- `400 Bad Request`：参数错误
- `401 Unauthorized`：未登录或 token 无效
- `403 Forbidden`：无权限
- `404 Not Found`：资源不存在
- `409 Conflict`：冲突（如重复资源）

### 5xx 服务端问题

- `500 Internal Server Error`：服务内部异常
- `502 Bad Gateway`：上游服务故障（常见于第三方依赖问题）
- `503 Service Unavailable`：服务暂不可用（常见于未就绪）
- `504 Gateway Timeout`：超时

---

## 2.6 `/health` 与 `/health/ready` 的差异

本项目明确区分两种健康检查：

- `/health`：只表示 Web 进程活着（liveness）
- `/health/ready`：表示数据库和业务表可用（readiness）

这对排障非常关键：

- 如果 `/health` 正常、`/health/ready` 失败，说明“进程在，但业务不可用”

---

## 2.7 鉴权与 Token（入门版）

登录后，前端会拿到 token（通常是 JWT）。

后续请求把 token 放到请求头：

```text
Authorization: Bearer <token>
```

后端校验 token 并识别当前用户身份，决定是否允许访问接口。

---

## 2.8 本项目里如何看懂一个接口

建议按这个顺序读代码：

1. 先看路由文件（`app/api/routers/*.py`）
2. 看入参/出参 schema（`app/schemas/`）
3. 看业务服务（`app/services/`）
4. 看数据访问层（`app/repositories/`）
5. 看模型（`app/models/`）

---

## 2.9 常见误区

- 误区：`200` 就等于业务成功  
  纠正：有些系统即使返回 `200`，`ok` 仍可能是 `false`。

- 误区：`401` 和 `403` 是一回事  
  纠正：`401` 通常是“你没登录/凭证无效”，`403` 是“你登录了但没权限”。

---

## 2.10 本章自测

1. 说出一个请求由哪些部分组成。
2. 解释 `503` 常见意味着什么。
3. 说出 `/health` 与 `/health/ready` 的功能差异。

