# Phase 9: 生词本、账号与网页模型边界 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28T21:38:23.6028550+08:00
**Phase:** 09-生词本、账号与网页模型边界
**Areas discussed:** 生词本入口与列表信息、复习反馈与调度、用户名与个人中心、登录/注册界面、网页端 Bottle 命名边界

---

## 生词本入口与列表信息

| Option | Description | Selected |
|--------|-------------|----------|
| A | 在生词本顶部放“开始复习”卡片/按钮，显示到期数量，点进去进入专门复习流 | ✓ |
| B | 仍留在同一列表里，只新增“仅看已到期”筛选 | |
| C | 单独做成新的侧边栏页面 | |

**User's choice:** A  
**Notes:** 用户要求顶部有真正的复习入口，但同时提醒复习流不能太粗糙，应参考成熟同类产品的现有复习模式。列表默认主展示改为“最新中英语境、下次复习时间、复习次数、掌握状态/记忆率”；不显示“单词 / 短语”标签。

---

## 复习反馈与调度

| Option | Description | Selected |
|--------|-------------|----------|
| A | `again = 10 分钟后`，`good = 1天 -> 3天 -> 7天 -> 14天` | |
| B | `again = 留在到期队列`，`good = 固定 +1 天` | |
| C | `again = 1 小时后`，`good = 固定 +3 天` | |
| 自定义 | 联网调研后采用保守版动态调度，而不是固定公开阶梯 | ✓ |

**User's choice:** 自定义  
**Notes:** 用户明确要求联网搜索“最新最科学的复习节奏”，并认为 `again / good` 两档太少。最终锁定的产品反馈按钮为 `重来 / 很吃力 / 想起来了 / 很轻松`。目标记忆率固定为 `0.85`。列表默认不显示文字掌握状态，而是显示预测记忆率百分比；达到或超过 `0.85` 时显示 `已掌握`。

---

## 用户名与个人中心

| Option | Description | Selected |
|--------|-------------|----------|
| A | 用户名仅英文、数字、下划线，`3-20` 位 | |
| B | 用户名允许中文/英文/数字/下划线，`2-20` 位 | |
| C | 用户名允许更自由的昵称字符，但仍要求唯一 | ✓ |

**User's choice:** C  
**Notes:** 用户名必须保留“昵称”属性，而不是技术账号风格；同时保持唯一。用户另外要求新增单独个人中心页面，并把它放到学习侧边栏最上方。

---

## 个人中心与充值入口

| Option | Description | Selected |
|--------|-------------|----------|
| A | 侧边栏新增“账号设置”，只放用户名查看/修改 | |
| B | 放在右上角头像/菜单里 | |
| C | 单独做 `/account` 页面，再从侧边栏或别处进入 | ✓ |

**User's choice:** C  
**Notes:** 用户要求把“兑换码充值”并入个人中心，同时删除当前独立的“兑换码充值”页面和侧边栏入口；个人中心本身放在侧边栏最上方。

---

## 登录 / 注册界面

| Option | Description | Selected |
|--------|-------------|----------|
| A | 同一张卡片改成“登录 / 注册”页签，注册时额外出现用户名字段 | ✓ |
| B | 同页上下两个区块，登录和注册同时可见 | |
| C | 登录与注册彻底分成两个独立页面 | |

**User's choice:** A  
**Notes:** 用户接受继续共用一张认证卡片，但要求用显式页签区分登录和注册；注册页签增加用户名字段。

---

## 网页端 Bottle 命名边界

| Option | Description | Selected |
|--------|-------------|----------|
| A | 主标题只用 `Bottle 1.0 / Bottle 2.0`，旧词降到副文案 | |
| B | 彻底去掉旧词，只保留 Bottle 命名 | ✓ |
| C | 过渡期继续把旧词放主标题，Bottle 放副标题 | |

**User's choice:** B  
**Notes:** 用户明确要求 `本机识别 / 云端识别` 不要再保留成副文案。网页端面对用户的命名只保留 `Bottle 1.0 / Bottle 2.0`；Bottle 1.0 网页不可执行的边界继续沿用前面阶段已锁定的规则。

---

## External Research

- **Finding:** 当前更现代的复习方向是“按目标记忆率动态计算下次复习时间”，而不是对所有词条统一使用固定 `1 天 / 3 天 / 7 天` 公开阶梯。  
  **Source:** [Anki Manual - FSRS](https://docs.ankiweb.net/deck-options#fsrs)  
  **Confidence impact:** 支持把 Phase 9 的默认复习调度定为“保守版动态调度”，并采用明确的目标记忆率。

- **Finding:** FSRS 生态把复习评分建模为 `Again / Hard / Good / Easy` 四档，而不是只有成功/失败两档；这和用户提出“两档太少”的判断一致。  
  **Source:** [py-fsrs](https://github.com/open-spaced-repetition/py-fsrs), [FSRS Algorithm](https://raw.githubusercontent.com/wiki/open-spaced-repetition/awesome-fsrs/The-Algorithm.md)  
  **Confidence impact:** 支持把中文复习按钮定为四档：`重来 / 很吃力 / 想起来了 / 很轻松`。

- **Finding:** 更新、更复杂的在线记忆模型不一定在真实产品里立刻带来更好的用户表现；MaiMemo 2025 公开实验显示，离线更强的新模型不一定在线上体验指标上占优。  
  **Source:** [MaiMemo 2025 Experiment](https://memodocs.maimemo.com/docs/2025_experiment)  
  **Confidence impact:** 支持本阶段先落“保守版动态调度”，不要在 Phase 9 同时引入更激进的算法复杂度或高级参数配置。

