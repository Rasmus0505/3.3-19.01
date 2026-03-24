# 任务 YAML 规范

## 固定结构

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

## 字段规则

- `schema_version` 必须始终为 `1`
- `task_id`、`depends_on`、`blocked_by`、`conflicts_with` 只能使用规范任务号，如 `TASK-001`
- 新任务起始状态必须是 `todo`
- `priority` 只允许 `high`、`medium`、`low`
- `project_root` 必须始终为 `D:/3.3-19.01`
- `acceptance` 必须可观察、可验证，至少包含一个行为层验收条件
- `check_commands` 必须是真实可运行、且验证当前任务自身结果的命令
- `depends_on` 默认为空；只有真实前置条件无法通过重画任务边界消除时，才允许非空
- `dependency_reason` 仅在确实存在依赖时填写，用中文解释为什么不能合并
- `conflicts_with` 只记录未完成任务；若无冲突，保持 `[]`
- brand new 任务的 `result_summary`、`changed_files`、`tests_run`、`blocked_reason`、`completed_at`、`fix_request`、`fix_reason`、`fix_result_summary`、`fix_updated_at` 必须为空
- brand new 任务的 `fix_round` 必须为 `0`

## 文件命名与状态

| 文件名 | status |
|--------|--------|
| `TASK-001-中文短标题.yaml` | todo |
| `I-TASK-001-中文短标题.yaml` | in_progress |
| `B-TASK-001-中文短标题.yaml` | blocked |
| `F-TASK-001-中文短标题.yaml` | done |
| `fix-TASK-001-中文短标题.yaml` | fix |
| `fix-I-TASK-001-中文短标题.yaml` | fixing |

规则：

- 文件名中文后缀只用于可读性，`task_id` 必须保持 `TASK-001` 规范形式
- 保留已有 `done` 任务及其结果，不覆盖
- 计算下一个编号时，先去掉一个前缀，再忽略 `TASK-编号` 之后的中文后缀
- 修复 `blocked` 任务使其重新可执行时，改回 `status: todo`，清空 `blocked_reason`，文件名恢复为 `TASK-...`
- 把 `done` 任务转成修复任务时，改成 `status: fix`，文件名改为 `fix-TASK-...`

## 编码与完整性

- 读取任务文件时优先按 `utf-8`；若乱码或损坏，尝试少量常见回退编码
- 重写、修复、转换任务文件时统一落回 `utf-8`
- 若任务文件损坏到无法安全原地修复，可删除坏文件并用相同 `task_id`、正确状态前缀重建
