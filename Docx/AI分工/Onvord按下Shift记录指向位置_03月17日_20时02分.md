文档类型：任务
创建者：Codex
状态：已完成
完整任务目标：将 Onvord 的录制行为扩展为“按下 Shift 时记录当前鼠标所指位置”，使用户无需点击按钮也能对页面上的任意位置打点说明，并保持现有录制链路、SOP 导出和侧栏时间线可用。
修改的文件清单（精确路径）：
- D:\GITHUB\onvord\content.js
- D:\GITHUB\onvord\background.js
- D:\GITHUB\onvord\sidepanel.js
- D:\3.3-19.01\Docx\AI分工\Onvord按下Shift记录指向位置_03月17日_20时02分.md
关联衔接：无
风险：Shift 可能与页面自身快捷键并存；本次实现仅在单独按下 Shift 时记录一次，避免持续触发与组合键误记。
验证：
- `node --check D:\GITHUB\onvord\content.js`
- `node --check D:\GITHUB\onvord\background.js`
- `node --check D:\GITHUB\onvord\sidepanel.js`
- 代码链路自检：按下 Shift 生成 `point` 动作；侧栏时间线与 SOP 导出均能识别该动作；该动作可携带当前位置截图标注。
清理记录：
- 本轮未删除文件：没有我自己创建且满足“已消解/可删除”判定的旧衔接文档或任务文档。
结束时间：2026-03-17 20:09:20
