# Phase 20: wordbook-entry-enhancements - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 20-wordbook-entry-enhancements
**Areas discussed:** 卡片布局 + 高度策略, 翻译区块样式, 发音按钮, 发音状态处理, 发音来源

---

## 卡片布局

| Option | Description | Selected |
|--------|-------------|----------|
| 上下堆叠（翻译→单词→语境） | 翻译在最上，单词在中，语境在下 | |
| 上下堆叠（单词→翻译→语境） | 单词在最上，翻译在单词下方，语境在下 | ✓ |

**User's choice:** 上下堆叠，单词在翻译上方
**Notes:** 用户明确要求"单词下面才是翻译不是翻译下面是单词" — 单词是主要信息，翻译是辅助信息，位置应反映这个优先级

---

## 翻译区块样式

| Option | Description | Selected |
|--------|-------------|----------|
| 独立背景色 | 浅色背景（如 `bg-muted/20`），明确区域边界感 | ✓ |
| 无背景但上下分隔线 | 上下有细线分隔，更轻盈 | |
| 折叠区（默认折叠，点击展开） | 节省空间但增加交互步骤 | |

**User's choice:** 独立背景色
**Notes:** "采用独立的视觉区块"是需求明确要求，背景色是实现这一目标最直接的方式

---

## 卡片高度策略

| Option | Description | Selected |
|--------|-------------|----------|
| 固定高度（min-h-[8rem]，内容溢出滚动） | 视觉整齐，列表美观 | |
| 自适应高度（min-h-[4rem]，内容超出调整高度） | 更紧凑，不浪费空间 | ✓ |

**User's choice:** 自适应高度，内容超出调整高度不需要截断
**Notes:** 用户不需要截断行为，内容长短不同导致高度不同是可以接受的

---

## 发音按钮样式

| Option | Description | Selected |
|--------|-------------|----------|
| 内置播放图标 | 发音图标内嵌在单词右侧（同 inline），更紧凑 | |
| lucide Volume2 单独按钮 | 独立的可点击按钮，适合显示加载中/错误状态 | ✓ |

**User's choice:** lucide Volume2 按钮
**Notes:** 用户明确选择 Volume2 按钮，并且要求"按钮动态自适应紧挨尾部而不是常驻在容器最右侧"

---

## 发音状态处理

| Option | Description | Selected |
|--------|-------------|----------|
| 按钮状态变化 | 点击后按钮变 spinner，发音结束后恢复，失败时短暂错误态 | ✓ |
| 按钮保持原样 + Toast | 按钮不变，失败时页面顶部 Toast 错误提示 | |

**User's choice:** 按钮状态变化
**Notes:** 用户明确要求"发音按钮显示加载中状态"，按钮本身需要有状态反馈

---

## 发音来源

| Option | Description | Selected |
|--------|-------------|----------|
| Web Speech API（lang='en-US'） | 浏览器原生 API，无需额外成本 | ✓ |
| 句子 audio_url（fallback to TTS） | 使用句子音频文件，真实人声发音 | |

**User's choice:** Web Speech API（主要方案）
**Notes:** 用户确认 Web Speech API 作为主要方案（与 WB-02 要求一致），备选句子 audio_url

---

## Claude's Discretion

- 具体翻译区块背景色（`bg-muted/20` vs 其他）
- 卡片最���高度具体值
- 发音按钮的尺寸和间距
- 错误态的具体样式（图标、颜色、持续时间）

---

## Deferred Ideas

None — discussion stayed within phase scope

---

*Log created: 2026-04-02*