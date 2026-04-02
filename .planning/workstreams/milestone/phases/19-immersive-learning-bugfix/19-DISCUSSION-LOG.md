# Phase 19: 沉浸式学习 Bug 修复 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 19-immersive-learning-bugfix
**Areas discussed:** Bug 1+4 mechanism, Bug 2 TTS approach, Bug 3 scope

---

## Bug 2 TTS Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Web Speech API | 浏览器原生 API，免费，无需 API key，web + desktop (Chromium/Electron) 均可使用 | ✓ |
| @edge-tts/universal | Edge TTS 效果好，但只在 Edge 浏览器有效，需要 npm 包 | |

**User's choice:** Web Speech API
**Notes:** 用户问桌面端是否能用 Web Speech API，确认 Electron 渲染层基于 Chromium，完全支持 window.speechSynthesis。

## Bug 2: Audio unavailable fallback

**User's choice:** Web Speech API TTS fallback, then main video seek, then error message
**Notes:** 当 previousSentence.audio_url 不存在时，优先级：clip audio → main video seek → Web Speech API TTS → error message

## Bug 1+4: Input clearing mechanism

**Question:** 切换倍速/循环时输入被清空的具体触发路径
**User's choice:** 需要修复，用户在输入句子过程中（sentenceTypingDone=false），点击精听/倍速箭头/固定/重置都会清空输入内容
**Notes:** 用户确认了问题确实存在，精听按钮是关键触发点。根因分析指向 auto-answer-replay 逻辑和 requestReplayCurrentSentence 路径。

## Bug 3: Answer box color differentiation

**Status:** Already decided in ROADMAP.md — no discussion needed
**Notes:** AI content: amber-100 (#FEF3C7), user typed: emerald-100 (#D1FAE5)

## Gray Area Selection

**User's choice:** 全部讨论（4 个灰色地带全部讨论）

---

## Claude's Discretion

- Bug 1+4: autoAdvanceGuard 的具体 guard 条件由 planner 决定
- Bug 3: answerBoxMode 切换逻辑和颜色应用范围由 planner 决定

## Deferred Ideas

None — discussion stayed within phase scope.
