---
status: complete
phase: 03-lesson-output-consistency
source:
  - 03-01-SUMMARY.md
  - 03-02-SUMMARY.md
  - 03-03-SUMMARY.md
started: 2026-03-27T13:10:00Z
updated: 2026-03-27T13:31:00Z
---

## Current Test

[testing complete]

## Tests

### 1. 历史记录不再暴露来源差异
expected: 打开历史记录后，课程卡片不再显示“本地课程”或“云端课程”这类来源 badge；只保留统一课程信息、进度和操作入口。
result: pass

### 2. 三点菜单可手动标记学完
expected: 在历史记录卡片的三点菜单里点击“标记学完”后，操作成功，课程进度刷新为完成态，不需要离开历史记录页手动刷新。
result: pass
note: 复测通过；历史记录中现在可即时刷新，且已完成课程同位置显示“标记未完成”

### 3. 降级课程可从三点菜单补翻译
expected: 对 `partial_ready` / 仅原文字幕的课程，三点菜单中会出现“补翻译”；点击后不会阻塞历史记录主流程，成功后进入课程即可使用补充后的翻译内容。
result: skipped
reason: 当前没有仅原文字幕课程可测试

### 4. 降级成功结果仍可继续学习
expected: 当生成结果是部分成功时，上传面板显示明确的降级成功提示，并保留“去学习”入口，而不是只显示失败态。
result: pass

### 5. 学习流程不关心生成来源
expected: 从历史记录进入课程后，学习页直接基于课程句子和进度继续工作；用户不需要知道课程来自本地还是云端生成。
result: pass

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps
