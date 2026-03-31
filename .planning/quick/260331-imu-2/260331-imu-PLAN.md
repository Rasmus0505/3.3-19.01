# Quick Task 260331-imu — Plan

## Goal

调整沉浸学习听写入口轻提示：精简文案、重排布局、2 秒自动消失。

## Tasks

1. **UI 与样式** — `frontend/src/features/immersive/ImmersiveLessonPage.jsx`、`frontend/src/features/immersive/immersive.css`  
   - 移除三行标题文案；快捷键 chips 置顶；下方增加「快捷键可在首页修改」。  
   - 删除不再使用的 `getImmersivePhaseLabel` 及相关引用。

2. **行为** — `ImmersiveLessonPage.jsx`  
   - `showEntryHintOverlay === true` 时注册 2000ms 定时器，在 effect cleanup 中 `clearTimeout`；与现有输入关闭逻辑并存。

## Verify

- 进入沉浸学习后出现轻提示；约 2 秒后自动消失（未输入时）。  
- 在消失前按键输入或退格，提示立即消失。  
- 快捷键仍来自 `buildImmersiveEntryHintItems`，与历史页配置一致。
