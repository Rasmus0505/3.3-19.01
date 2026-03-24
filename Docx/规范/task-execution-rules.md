# 任务执行规则（after）

## 核心职责

- 扫描任务池，选择下一个可执行的未完成任务或修复任务
- 通过 subagent 实施代码、验证结果
- 把执行结果回写到原任务 YAML

## 禁止事项

- 不创建新任务
- 不改变任务目标
- 不绕过任务池直接把口头需求当实现单
- 不擅自把 `blocked` 改回 `todo`
- 不擅自把 `done` 改成 `fix`
- 不在高优先级规则禁止写入时硬做实现
- 不在用户只是讨论策略、复盘 skill 或询问是否该执行时擅自启动任务

## 状态机

六种状态：`todo`、`in_progress`、`blocked`、`done`、`fix`、`fixing`。

流转规则：

1. 选中的 `todo` 先改成 `in_progress`，再把文件重命名为 `I-TASK-...`
2. 选中的 `fix` 先改成 `fixing`，更新 `fix_updated_at`，再把文件重命名为 `fix-I-TASK-...`
3. 已是 `in_progress` 或 `fixing` 的任务可以继续执行，不改目标
4. 成功完成后改成 `done`，保存后把文件重命名为 `F-TASK-...`
5. 无法安全继续时改成 `blocked`，保存后把文件重命名为 `B-TASK-...`

## 任务选择顺序

1. 读取所有前缀形式：`TASK-...`、`I-TASK-...`、`B-TASK-...`、`F-TASK-...`、`fix-TASK-...`、`fix-I-TASK-...`
2. 跳过 `done` 和 `blocked`
3. 必须满足 `depends_on` 全部已经 `done`
4. 必须满足 `conflicts_with` 中每个任务都已经 `done`
5. 若 `conflicts_with` 未解决，不要更改任务状态和文件名，只向用户说明暂时不能安全启动
6. 多可执行时优先级：`fixing` > `in_progress` > `fix` > `todo`，同优先级按 `priority` 倒序（high > medium > low），再按去掉前缀后的文件名顺序

## 执行边界

- 只能修改 `allowed_paths` 内的文件
- 只实现当前任务的 `goal` 和 `acceptance`；若处于 `fix` 或 `fixing`，还必须落实 `fix_request`
- 必须运行或确认 `check_commands`
- 除了当前任务 YAML 的状态回写与重命名，不要改其他任务文件
- 如果需要修改的耦合文件落在 `allowed_paths` 外，不能擅自越界，应直接标记 `blocked`

**严格边界的耦合面**：打包目标、安装器行为、更新机制、bundled runtime 策略、首次启动/安装流程。涉及这些时，要把 manifest、lockfile、构建资源、打包脚本、运行时描述和契约测试视为同一执行面。

## subagent 规则

- 主线程负责任务选择、改状态、改文件名、最终验收与回写
- subagent 负责调查、实现、修复、验证
- 每个 subagent 固定使用模型 `gpt-5.4`
- 只读检查可用 `low` 或 `medium`；会改代码、配置、迁移、脚本的工作默认 `high`；多文件高风险改动、修复轮次、打包/安装器/运行时策略改动默认 `xhigh`
- 只读调查优先 `explorer`；需要修改时优先 `worker`
- modifying subagent 必须被明确告知：它不是唯一在仓库里工作的 agent，不得回滚别人改动，不得超出当前任务边界
- 如果运行环境不支持 subagent，要显式告诉用户这个限制

## 成功回写

```yaml
status: done
result_summary: 中文完成摘要
changed_files:
  - 实际改动文件 1
  - 实际改动文件 2
tests_run:
  - 实际执行命令 1
  - 实际执行命令 2
completed_at: 2026-03-23T15:00:00+08:00
```

修复任务还要额外更新：
```yaml
fix_result_summary: 中文修复摘要
fix_updated_at: 2026-03-23T14:50:00+08:00
```

## 阻塞回写

若任务定义过于模糊、关键必需文件不在 `allowed_paths`、缺少前置条件、仓库当前状态与任务定义冲突、缺少必需测试且无法准备，必须停止并标记：

```yaml
status: blocked
blocked_reason: >
  中文说明卡在哪一步、缺什么边界或前置条件，以及 before 需要补什么。
```

注意：不要因为 `conflicts_with` 未解决就把任务标记为 `blocked`，这种情况要保持任务原状，只向用户报告"当前有冲突任务未完成，暂时不能安全执行"。

## 工作循环

持续清任务池直到：无可执行的未完成任务、所有剩余未完成任务都是 `blocked`、所有剩余任务都在等待未完成依赖或冲突任务。
