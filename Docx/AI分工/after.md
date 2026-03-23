---
name: after
description: Execute tasks from the shared task pool and write results back into the original YAML files. Use when an AI needs to continue queued work in the coordination task folder under `D:/3.3-19.01/Docx`, or when the user asks to consume planned or repair-marked tasks without replanning them.
---

# After

把这份文档当作共享任务池工作流中的执行者说明。你只负责执行任务池里现有任务，并把结果回写到原任务 YAML，不负责新建任务或重规划。

## 固定路径

- 项目根目录：`D:/3.3-19.01`
- 协作目录：`D:/3.3-19.01/Docx` 下某个同时包含 `before.md`、`after.md`、`tasks` 的子目录
- 任务池：`<协作目录>/tasks`

## 角色

- 扫描任务池。
- 找到下一个可执行的未完成任务或修复任务。
- 在 `D:/3.3-19.01` 内创建并使用 subagent 完成实现、测试和验证。
- 把结果回写到原任务文件。

## 模式与意图安全

- 优先遵守更高优先级的会话模式和安全规则。
- 如果当前会话模式禁止文件写入或其他变更，不得启动或恢复任务，不得重命名任务文件，也不得执行任何实现工作。
- 这种情况下仍然正常检查任务池，找出理论上的下一个任务，并只输出简短 dry-run，总结本来会选中哪个任务，并明确说明因为当前模式禁止变更，所以没有执行任何工作。
- 区分“要求执行任务池工作”和“只是在讨论任务池”。
- 如果用户在讨论这个 skill、本次或之前的执行质量、询问某个任务是否该跑，或者只是讨论任务策略，不要修改任务池也不要执行实现。
- 只有当用户最新一条消息明确要求消费排队任务时，才真正开始或恢复任务池执行。

## 硬性限制

- 不新建任务。
- 不修改任务目标。
- 不绕过任务池，直接按聊天里的口头需求开做。
- 当任务边界不清时，不要擅自扩 scope。
- 不把 `blocked` 任务私自改回 `todo`。
- 不把 `done` 任务私自改成 `fix`。
- 如果更高优先级模式禁止写入，即使用户显式调用 `$after` 也不能修改任务池或实现文件。
- 当用户只是在讨论策略、复盘结果或讨论这些技能本身时，不执行任务池工作。

## 任务文件命名

- 读取 `TASK-...`、`I-TASK-...`、`B-TASK-...`、`F-TASK-...`、`fix-TASK-...`、`fix-I-TASK-...` 六种前缀形式。
- `fix-I-`、`I-`、`B-`、`F-`、`fix-` 都只是状态前缀，不属于真实任务号。
- `todo` 任务文件必须使用 `TASK-...`。
- `in_progress` 任务文件必须使用 `I-TASK-...`。
- `blocked` 任务文件必须使用 `B-TASK-...`。
- `done` 任务文件必须使用 `F-TASK-...`。
- `fix` 任务文件必须使用 `fix-TASK-...`。
- `fixing` 任务文件必须使用 `fix-I-TASK-...`。
- 排序文件名时，先去掉一个前导状态前缀，再比较剩余规范文件名。

## 与 `before` 的兼容要求

- 以 `before` 写入的任务 YAML 为唯一事实来源。
- 任务中的 `title`、`goal`、`scope`、`acceptance`、`dependency_reason`、`notes_for_after`，以及修复后的 `blocked_reason`，通常都是中文，直接按这些定义执行，不要等待英文重述，也不要自行改写成别的需求。
- 当 `before` 把已完成任务转成修复轮次时，任务中可能包含 `fix_request`、`fix_reason`、`fix_round`、`fix_result_summary`、`fix_updated_at`；执行时要正确兼容这些字段。
- `conflicts_with` 表示必须先完成的未完成任务号；执行前必须遵守它。
- 直接按这些中文任务定义执行，不要因为不是英文就重新解释需求。

## 任务状态

只能使用以下状态机：

- `todo`：等待执行。
- `in_progress`：正在执行。
- `blocked`：无法继续，需要 `before` 修复定义。
- `done`：已完成。
- `fix`：等待修复执行。
- `fixing`：正在修复。

状态更新顺序必须如下：

1. 如果选中的是 `todo`，先改成 `in_progress`，保存，再把文件改名为 `I-TASK-...`。
2. 如果选中的是 `fix`，先改成 `fixing`，更新 `fix_updated_at`，保存，再把文件改名为 `fix-I-TASK-...`。
3. 如果任务已经是 `in_progress`，保持 `in_progress` 并继续执行。
4. 如果任务已经是 `fixing`，保持 `fixing` 并继续执行。
5. 如果任务成功完成，把状态改成 `done`，保存，再把文件改名为 `F-TASK-...`。
6. 如果执行无法安全继续，把状态改成 `blocked`，保存，再把文件改名为 `B-TASK-...`。

## 任务选取

按以下顺序选任务：

1. 扫描任务池里所有任务 YAML，包括六种前缀形式。
2. 跳过 `done`。
3. 跳过 `blocked`。
4. 遵守 `depends_on`；只有当依赖全部 `done` 时，任务才可执行。
5. 遵守 `conflicts_with`；只有当其中列出的任务全部 `done` 时，任务才可执行。
6. 如果 `conflicts_with` 仍未解决，不要启动或恢复该任务，不要改名也不要改状态，只向用户报告当前仍被哪些任务卡住。
7. 如果有多个可执行任务，优先顺序如下：
- `fixing` 优先于 `in_progress`。
- `in_progress` 优先于 `fix`。
- `fix` 优先于 `todo`。
- `priority: high` 优先于 `priority: medium`。
- `priority: medium` 优先于 `priority: low`。
- 最后按去掉一个状态前缀后的规范文件名排序。

如果用户调用 `$after` 来清空任务池，则持续执行所有可执行任务，直到触发停止条件。

## 执行规则

- 只能修改 `allowed_paths` 内的文件。
- 只实现当前任务的 `goal` 和 `acceptance`。
- 如果任务处于 `fix` 或 `fixing`，还必须落实 `fix_request`，但不能顺势添加无关新 scope。
- 必须运行任务自己的 `check_commands`。
- 除了当前任务 YAML 的回写和重命名，不得修改其他任务文件。
- 如果任务涉及打包目标、安装器行为、更新行为、运行时捆绑策略或首次启动/安装流程，要把 `allowed_paths` 内的 manifest、lockfile、构建资源、打包脚本、运行时描述和契约测试视为一个耦合执行面；如果必需的耦合文件落在 `allowed_paths` 外，必须停止并将任务标记为 `blocked`，而不是越界即兴修改。
- 在启动或恢复任务之前，先检查 `conflicts_with` 中列出的任务是否全部已 `done`。
- 如果任何冲突任务仍然未完成，不要重命名当前任务，也不要改状态，只告诉用户是哪一个任务阻止了安全执行。
- 成功完成时，先保存 YAML，再把刚完成的文件重命名成 `F-TASK-...`，如果它还没有该前缀。
- 执行受阻时，先保存 YAML，再把文件重命名成 `B-TASK-...`，如果它还没有该前缀。

在判断另一个任务是否已解决 `conflicts_with` 或下游 `depends_on` 时，把 `todo`、`in_progress`、`blocked`、`fix`、`fixing` 一律视为未完成。

## Subagent 规则

- 在选中并确认一个任务可以安全执行之后，必须先创建并使用至少一个 subagent，再进入实质工作。
- 主线程负责任务池账务：选任务、改 `status`、更新时间戳、重命名任务 YAML、写 `result_summary` 或 `blocked_reason`、回复用户。
- 所有 spawned subagent 固定使用模型 `gpt-5.4`。
- 如果 subagent 任务是只读调查，狭窄读文件或简单检查用 `low`，更广的排查、代码理解或 review 型任务用 `medium`。
- 如果 subagent 会改文件、生成补丁、执行迁移、改配置或做其他变更，默认用 `high`；如果是多文件改动、模糊故障修复、高风险修复或重构，用 `xhigh`。
- 如果任务涉及打包目标、安装器行为、运行时捆绑策略或首次启动流程，主修改 subagent 默认用 `xhigh`。
- 清晰只读调查优先使用 `explorer`。
- 需要实现或修复时优先使用 `worker`。
- 传给 subagent 的上下文至少包括：任务 YAML 路径、`task_id`、项目根目录、`allowed_paths`、`goal`、`acceptance`、`check_commands`，以及必要的 `fix_request`、`depends_on`、`conflicts_with` 信息。
- 对会改文件的 subagent，必须明确说明：它不是仓库里唯一工作的代理，不得回滚无关改动，也不得超出当前任务边界。
- 主线程必须复核 subagent 结果，必要时自己检查改动文件，并自己做最终 `done` 或 `blocked` 判断，不能盲信 subagent。
- 如果运行环境不支持 subagent，要显式告诉用户这个限制，不能静默跳过这条规则。

## 成功回写

任务成功完成后，至少回写以下字段：

```yaml
status: done
result_summary: 中文完成摘要
changed_files:
  - 实际改动文件 1
  - 实际改动文件 2
tests_run:
  - 实际执行命令 1
  - 实际执行命令 2
completed_at: 2026-03-22T18:30:00+08:00
```

如果本次完成的是从 `fix` 或 `fixing` 进入的修复任务，还要额外更新：

```yaml
fix_result_summary: 中文修复摘要
fix_updated_at: 2026-03-22T18:20:00+08:00
```

## 阻塞回写

若出现以下任一情况，必须停止并将任务标记为 `blocked`：

- 任务定义过于模糊，无法安全执行。
- 关键必需文件不在 `allowed_paths`。
- 缺少依赖。
- 仓库当前状态与任务定义冲突。
- 缺少必需的测试或运行前提，且无法合理准备。

此时至少写回：

```yaml
status: blocked
blocked_reason: >
  中文说明卡住的步骤、缺失的依赖或边界，以及 before 需要补充什么。
```

- 不要因为 `conflicts_with` 还没解决就把任务标记成 `blocked`。
- 如果只是冲突任务未完成，要保持当前任务不变，并向用户说明它暂时不能安全执行。
- 不要自己创建新任务，也不要重写任务目标。

## 工作流

1. 读取 `<协作目录>/tasks`。
2. 在任何变更前，确认用户最新一条消息是在要求执行排队任务，而不是讨论策略或 skill 行为。
3. 如果当前模式禁止写入，检查后立即停止，只返回 dry-run，不执行任务。
4. 找到下一个可执行的未完成任务或修复任务。
5. 在启动或恢复之前，确认 `conflicts_with` 中列出的任务都已 `done`。
6. 如果其中任何任务仍未完成，不要启动当前任务；保持原状并向用户说明这个 hold。
7. 如果任务是 `todo` 且可以安全开始，把它改成 `in_progress` 并重命名成 `I-TASK-...`。
8. 如果任务是 `fix` 且可以安全开始，把它改成 `fixing`，更新 `fix_updated_at`，并重命名成 `fix-I-TASK-...`。
9. 为该任务创建主 subagent，模型固定为 `gpt-5.4`，推理级别按任务类型选择。
10. 通过这个 subagent 在 `D:/3.3-19.01` 内完成工作，同时主线程保留任务状态更新与最终核验的所有权。
11. 运行或确认 `check_commands`，并确保 `tests_run` 记录的是本次任务实际执行过的命令。
12. 如果成功，把 `done` 字段回写到 YAML；如果是修复任务，同时写入 `fix_result_summary`，保存后再重命名为 `F-TASK-...`。
13. 如果受阻，把任务标记为 `blocked`，保存后再重命名为 `B-TASK-...`。
14. 继续寻找并执行下一个可执行任务。

## 停止条件

满足任一条件时停止：

- 已经没有可执行的未完成任务。
- 所有剩余未完成任务都是 `blocked`。
- 所有剩余未完成任务都在等待未完成依赖或未完成 `conflicts_with` 任务。

## 输出

执行结束后，用中文简短回复，必须包含：

- 本轮完成了哪些任务。
- 本轮完成了哪些修复任务。
- 哪些任务被标记为 `blocked`。
- 哪些任务因为 `conflicts_with` 仍指向未完成任务而没有启动或恢复。
- 任务池里是否仍然存在可执行工作。
- 一段结果导向的本地更新总结。
- 一行文件列表；如果没有改动，必须写 `本次修改文件：无`。
- 一行独立的 `Zeabur操作：...`；如果不需要平台动作，必须精确写 `Zeabur操作：无`。
- 说明本次为什么是正常执行、因 `blocked` 停止、因 `conflicts_with` 暂停，还是仅返回 dry-run。

如果本轮至少完成了一个任务或修复任务，还必须额外提供：

- 一个以后做同类任务时可复用的中文提示词。
- 紧接着给出一个约 8 到 12 个中文字符的短标题，便于以后检索。

提示词规则：

- 只描述这次刚完成或刚修复的具体任务。
- 写清本次目标、保留或删除要求，以及关键验证点。
- 不要重复 `AGENTS.md` 里已经长期固定的协作规则。

Zeabur 规则：

- 最终回复里必须始终包含一行独立的 `Zeabur操作：...`。
- 如果本次工作只需要普通 GitHub 触发的 redeploy，或者根本不需要平台动作，必须精确写 `Zeabur操作：无`。
- 如果确实需要 Zeabur 动作，就写清楚需要哪个 service、哪个环境变量、哪项数据库操作或哪一步手动平台动作。

不要重规划任务。只有 `before` 可以新增、修复或转换任务，包括把 `done` 改成 `fix`。
