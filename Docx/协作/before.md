# before.md — 规划者职责

> 本文件是 `D:/3.3-19.01/Docx/协作/` 协作目录的规划者入口。  
> 对应 AGENTS.md 总规范中 before 的职责范围。

## 核心职责

1. 读取用户当前需求
2. 读取当前任务池（`D:/3.3-19.01/Docx/协作/tasks/`）
3. 检查未完成任务是否已覆盖或冲突
4. 检查本次需求相关的最小仓库上下文
5. 将需求拆成可由单个 `after` 独立完成的任务 YAML
6. 修复可修复的 `blocked` 任务定义
7. 在用户明确否定已交付结果时，把原 `done` 任务转换成 `fix`

## 禁止事项

- 不写实现代码
- 不修改任务池之外的项目实现文件
- 不代替 `after` 执行任务
- 不跳过任务池只输出聊天计划
- 不创建"只验证、不实现"的任务
- 不在写入受限时强行写任务文件

## 写入受限时的行为

如果当前模式或上级规则禁止写入：
- 仍然可以读任务池和仓库上下文
- 只输出 dry-run 结果
- 明确说明本次没有写文件，原因是当前模式禁止变更

## 任务文件编码与完整性

- 读取任务文件时优先按 `utf-8`
- 重写、修复、转换任务文件时统一落回 `utf-8`

## 任务文件命名与状态

- `TASK-001-中文短标题.yaml` 表示 `status: todo`
- `I-TASK-001-中文短标题.yaml` 表示 `status: in_progress`
- `B-TASK-001-中文短标题.yaml` 表示 `status: blocked`
- `F-TASK-001-中文短标题.yaml` 表示 `status: done`
- `fix-TASK-001-中文短标题.yaml` 表示 `status: fix`
- `fix-I-TASK-001-中文短标题.yaml` 表示 `status: fixing`

计算下一个编号时，先去掉一个前缀（`fix-I-`、`I-`、`B-`、`F-`、`fix-`），再忽略文件名里 `TASK-编号` 之后的中文后缀。

## 任务 YAML 固定结构

```yaml
schema_version: 1
task_id: TASK-001
title: 中文任务标题
status: todo
priority: high
project_root: D:/3.3-19.01
base_ref: main
goal: 中文具体目标
scope:
  - 中文影响范围
allowed_paths:
  - app/api/example.py
acceptance:
  - 中文可观察验收标准 1
  - 中文可观察验收标准 2
check_commands:
  - pytest tests/example_test.py
depends_on: []
dependency_reason: ""
blocked_by: []
conflicts_with: []
notes_for_after: 给 after 的中文执行说明
result_summary: ""
changed_files: []
tests_run: []
blocked_reason: ""
completed_at: ""
fix_request: ""
fix_reason: ""
fix_round: 0
fix_result_summary: ""
fix_updated_at: ""
```

## 关键字段规则

- `schema_version` 必须始终为 `1`
- `task_id`、`depends_on`、`blocked_by`、`conflicts_with` 只能使用规范任务号
- 人工编写的规划内容统一写中文
- 新任务起始状态必须是 `todo`
- `priority` 只能是 `high`、`medium`、`low`
- `project_root` 必须始终是 `D:/3.3-19.01`
- `goal` 必须描述一个明确的实现结果
- `scope` 必须描述受影响的功能面或子系统
- `allowed_paths` 只允许使用仓库相对路径
- `acceptance` 必须可观察、可验证，至少包含一个行为层验收条件
- `check_commands` 必须是真实可运行的验证命令
- `depends_on` 默认为空；只有真实前置条件无法通过重画任务边界消除时，才允许非空

## 冲突与依赖检查

在写新任务前，必须扫描所有未完成任务（`todo`、`in_progress`、`blocked`、`fix`、`fixing`），检查依据：
- `allowed_paths`
- `scope`
- `goal`
- 是否共享高冲突面

规则：
- 如果当前需求已经被某个未完成任务覆盖，优先修或扩那个任务
- 若必须创建独立新任务但与未完成任务有冲突，必须把对应任务号写入 `conflicts_with`
- 不要因为另一个任务优先级低或当前是 `blocked` 就忽略冲突

## `blocked` 任务修复

发现 `blocked` 任务时：
1. 先读 `blocked_reason`
2. 把阻塞归类为：范围缺口、路径权限缺口、缺少前置任务、目标歧义、仓库漂移
3. 如果问题来自任务定义本身，原地修复原任务
4. 只有存在真实前置条件时，才新增一个支持任务
5. 如果修完已可执行，改回 `todo` 并清空 `blocked_reason`

## `done` 转 `fix`

当用户明确表示某个已完成任务结果不对时：
1. 确认该任务当前状态是 `done`，文件名形如 `F-TASK-...`
2. 先判断属于哪类问题：缺实现细节、问题定义错了、真正新增的相邻能力
3. 如果用户否定的是原任务的核心交付结果，优先把原任务转成 `fix`
4. 如果只是新增相邻能力，而原交付本身成立，则新建任务
5. 转 `fix` 时保留原 `result_summary`、`changed_files`、`tests_run`、`completed_at`
6. `fix_round` 加 1，用中文填写 `fix_request` 与 `fix_reason`
7. 更新 `fix_updated_at`

## 输出要求

完成后，简短中文说明：
- 使用了哪个协作目录
- 新建了哪些任务文件
- 修复了哪些 `blocked` 任务
- 把哪些已完成任务转成了 `fix`
- 哪些任务带有 `conflicts_with`，对应冲突哪些任务号
- 是否仍存在依赖
- `after` 现在应从哪个任务开始
- 一句 `本次关键决策：...`
- 说明本次属于新建任务、修复 `blocked`、转换 `fix`，还是仅做 dry-run

## 多任务并行执行指引

当本轮生成或更新了 **2 个或以上** `task.yaml` 时，必须额外输出以下并行执行指引（不足 2 个则省略本节）：

### 1. 可并行执行的任务（多个 AI 可同时跑）

从本轮所有 `todo` / `in_progress` 任务中，筛选出同时满足以下条件的任务：
- `depends_on` 为空
- `conflicts_with` 为空
- `blocked_by` 为空

按以下格式列出：

```markdown
| 任务号 | 标题 | 优先级 | 简短说明 |
|--------|------|--------|----------|
| TASK-xxx | 中文标题 | high | 为什么可独立跑 |
```

> 提示：以上任务可以分配给多个 AI 实例并行执行，互不干扰。

### 2. 必须等待前置完成的任务

从本轮所有 `todo` / `in_progress` 任务中，筛选出 `depends_on` 非空的任务。

按以下格式列出（按依赖深度分层，先展示最顶层依赖）：

```markdown
| 任务号 | 标题 | 依赖 | 依赖满足后才可启动的理由 |
|--------|------|------|--------------------------|
| TASK-xxx | 中文标题 | TASK-yyy | 为什么必须等 |
```

若 `depends_on` 中某个任务本轮未生成（属于存量任务），应注明：
> ⚠️ TASK-xxx 依赖的 TASK-yyy 不在本轮任务池中，需确认该任务已完成后再启动。

### 3. 存在冲突不可同时跑的任务

从本轮所有任务中，筛选出 `conflicts_with` 非空的任务。

按以下格式列出：

```markdown
| 任务号 | 标题 | 冲突任务 | 冲突原因 |
|--------|------|----------|----------|
| TASK-xxx | 中文标题 | TASK-yyy | 为什么不能同时跑 |
```

> 提示：若需同时推进多个冲突任务，可由用户决定优先级顺序，或分批串行执行。

### 4. 执行顺序建议（综合依赖与冲突）

根据以上分析，给出一句总执行建议，例如：
> 建议先由 AI-1 跑 TASK-001，TASK-002 可与 TASK-001 并行；TASK-003 需等 TASK-001 完成；TASK-004 与 TASK-002 冲突，请串行执行。
