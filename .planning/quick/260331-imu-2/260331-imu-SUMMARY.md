# Quick Task 260331-imu — Summary

## Done

- `ImmersiveLessonPage.jsx`: 入口轻提示面板仅保留三条快捷键 chip，其下增加「快捷键可在首页修改」；移除 `getImmersivePhaseLabel`。
- 新增 `useEffect`：overlay 显示时 2 秒后 `setShowEntryHintOverlay(false)`，cleanup 清除定时器。
- `immersive.css`: 删除 eyebrow/title/mode 样式，调整 chips 边距，新增 `immersive-entry-hint__settings-note`。

## Files

- `frontend/src/features/immersive/ImmersiveLessonPage.jsx`
- `frontend/src/features/immersive/immersive.css`
