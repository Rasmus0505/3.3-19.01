# Phase 15: 桌面运行时边界加固 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-01
**Phase:** 15-desktop-runtime-boundary-hardening
**Areas discussed:** Sandbox 策略, openExternalUrl 白名单, preload 暴露面审核, webSecurity 边界验证

---

## Sandbox 策略

|| Option | Description | Selected |
|--------|--------|------------|----------|
| 正式版开启 sandbox（推荐） | 防御性加固，产品无 iframe 嵌入，可安全开启 | ✓ |
| 保持现状（sandbox: false） | 与开发调试一致，但隔离层未启用 | |

**User's choice:** 正式版强制开启 sandbox，开发模式保持关闭
**Notes:** 产品目前没有使用 iframe，开 sandbox 不会影响现有功能。风险由开发团队验证。

---

## openExternalUrl 白名单

|| Option | Description | Selected |
|--------|--------|------------|----------|
| 白名单模式（推荐） | 只允许打开官方认可域名，更安全 | ✓ |
| 保持现状（任意 URL） | 灵活，但权限边界不够清晰 | |

**User's choice:** 白名单模式，当前包含 snapany.com 和官方下载域名
**Notes:** 目前只有 SnapAny fallback 一个调用场景，白名单成本低。可通过 runtime-config 配置扩展。

---

## preload 暴露面审核

|| Option | Description | Selected |
|--------|--------|------------|----------|
| 审核作为明确交付目标（推荐） | Phase 15 系统审核 21 个方法，清理历史遗留 | ✓ |
| 最小化变更，仅修复明显问题 | 保持现有 preload，聚焦 sandbox/webSecurity | |

**User's choice:** 审核所有 preload 方法，最终清理范围由审核结果决定
**Notes:** 用户表示相信 Claude 的判断，不需要逐个讨论方法。

---

## webSecurity 边界验证

|| Option | Description | Selected |
|--------|--------|------------|----------|
| 加测试验证（推荐） | 测试确认 prod 模式 webSecurity: true 无回归 | ✓ |
| 依赖人工验证 | 开发人员手动测试，不写自动化测试 | |

**User's choice:** 加测试验证，结果记录到 15-VALIDATION.md 作为 SECU-02 证据
**Notes:** 测试是安全加固的必要证据，建议自动化。

---

## Deferred Ideas

- preview/internal 分发面恢复（Phase 13/14 deferral）
- staged rollout / forced update 策略（Future Requirement DESK-06）
- 更完整的面向普通用户的技术诊断展开面板（Phase 14 deferral）
- 发音/音标与框选翻译可行性评估（Future Requirements WORD-07/08）
