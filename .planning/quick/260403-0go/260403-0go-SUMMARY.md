# Quick Task 260403-0go: Fix Yellow Letter Color for Revealed Letters

## Task Description

沉浸式学习页面中，用户按提示键揭示的字母应该显示黄色（而非绿色）。代码中 `buildLetterSlots` 函数已经正确地将 `revealed` 状态的字母标记为 `state: "revealed"`，但 `revealed` 的 hex 回退色缺失导致浏览器使用 fallback 而显示为棕色。

## Root Cause

`immersive.css` 中 `.immersive-letter-cell--revealed` 只定义了 oklch 颜色，没有 hex 回退值。某些浏览器优先使用 fallback 的棕色值 `#c79600`。

## Fix Applied

在 `immersive.css` 中为 `--revealed` 添加了 hex 颜色 `#f59e0b`（明亮琥珀黄）作为主色值。

## Files Changed

- `frontend/src/features/immersive/immersive.css` — 添加 `--revealed` 的 hex 回退色
- `app/static/index.html` — 更新 JS 引用 hash
- `desktop-client/dist-fixed/` — 已通过 update-win-unpacked.mjs 重新打包

## Verification

- 重新构建后 dist CSS 包含 `.immersive-letter-cell--revealed{color:#f59e0b;...}`
- desktop-client 更新脚本全部 5 步完成，验证通过
