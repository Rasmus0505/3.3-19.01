# Phase 23: 字幕遮挡板与链接恢复 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 23-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 23-subtitle-mask-and-link-restore
**Areas discussed:** 遮挡板记忆边界、遮挡板居中基准、链接恢复入口、链接恢复行为

---

## 遮挡板"同课程"边界（Gray Area 1）

| Option | Description | Selected |
|--------|-------------|----------|
| 同课同 session | 遮挡板在课程内跨句子保持，换 lesson 居中 | |
| 换 lesson 即居中 | 只要 lesson ID 改变，遮挡板就居中 | |
| 开关跨课 + 位置仅 session | 开关状态跨课程记忆，位置只在 session 内保持 | |
| **水平居中 + 宽度自适应（用户澄清）** | **遮挡板始终水平居中；宽度在每次刷新时自动扩大到最宽句子，防止跑到答题区下方后拉不出来** | **✓** |

**User's choice:** 遮挡板始终水平居中，不记忆绝对位置；每次进入新 lesson 时遮挡板宽度从默认 58% 开始，在同 session 内只向上扩展到当前句子字幕最宽值（只变宽不变窄）

---

## 遮挡板居中位置计算基准（Gray Area 2）

| Option | Description | Selected |
|--------|-------------|----------|
| 视频容器居中（推荐） | 遮挡板宽度 58% 视频宽，水平居中于视频容器，距底部 12px | ✓ |
| 全屏容器居中 | 以影院全屏容器为基准，居中不受视频宽高比影响 | |

**User's choice:** 视频容器居中（当前代码中的已有逻辑）

---

## 链接恢复入口呈现（Gray Area 3）

| Option | Description | Selected |
|--------|-------------|----------|
| 菜单中二按钮 | 同时显示"恢复本地视频"和"按链接恢复"两个按钮 | |
| 统一入口 + 内部区分 | 单一入口，点击后根据 lesson 是否有 source_url 弹窗选择 | ✓ |
| 链接优先 | 有 source_url 时只显示"按链接恢复"，无 URL 时降级到本地文件 | |

**User's choice:** 统一入口 + 内部区分（有 URL 时弹窗二选一，无 URL 时直接打开文件选择器）

---

## 链接恢复网络行为（Gray Area 4）

| Option | Description | Selected |
|--------|-------------|----------|
| 直接覆盖（推荐） | yt-dlp 下载完成后直接覆盖，不检查本地缓存 | |
| 先检查本地 | 先检查 IndexedDB 缓存，有则弹窗确认"是否覆盖"，无则直接下载 | ✓ |
| 下载新副本 | 下载后存为新 lesson，不覆盖原 lesson | |

**User's choice:** 先检查本地缓存，有则弹窗确认，无则直接下载

---

## Deferred Ideas

None — discussion stayed within phase scope.

---
