# 终端调用 Codex

## 快速调用 Codex 执行单个指令（非交互式）

### 适用场景

在当前 Cursor 对话中，通过 Shell 工具直接调用 Codex CLI，执行单个指令并获取回复。适合需要让 Codex 独立处理某个任务，而不切换到 Codex 自带的交互式会话中。

### 调用方法

在 PowerShell 环境下，使用 `exec` 子命令：

```powershell
codex exec "你的指令"
```

完整写法（指定工作目录）：

```powershell
& "C:\Users\Administrator\AppData\Local\Programs\node-v24.14.0-win-x64\codex.cmd" exec "你好" -C "D:/3.3-19.01"
```

或在已设置工作目录后直接运行：

```powershell
# 先 cd 到目标目录
cd D:/3.3-19.01
codex exec "你好"
```

### 关键参数

| 参数 | 含义 |
|------|------|
| `exec` | 非交互式执行模式，必选 |
| `"指令"` | 要发送给 Codex 的提示词，用双引号包裹 |
| `-C <目录>` | 指定 Codex 的工作根目录（可选） |
| `-m <模型>` | 指定模型，如 `-m gpt-5.4`（可选） |
| `--full-auto` | 自动执行模式，等价于 `-a on-request --sandbox workspace-write` |

### PowerShell 调用要点

- Codex CLI 路径：`C:\Users\Administrator\AppData\Local\Programs\node-v24.14.0-win-x64\codex.cmd`
- 也可直接使用 `codex` 命令（已加入 PATH）
- 调用示例：`& "C:\Users\Administrator\AppData\Local\Programs\node-v24.14.0-win-x64\codex.cmd" exec "你好" 2>&1`
- PowerShell 中 `2>&1` 可将 stdout 和 stderr 一起捕获到输出中
- 设置 `block_until_ms` 至少 30000ms（Codex 启动 + 推理约需 10 秒左右）

### 输出示例

```
OpenAI Codex v0.116.0 (research preview)

--------
workdir: D:\3.3-19.01
model: gpt-5.4
provider: codex
approval: never
sandbox: danger-full-access
reasoning effort: high
session id: 019d1c0e-54c2-7412-abfa-9b3c98f3d390
--------
user
你好
mcp: playwright starting
mcp: playwright ready
mcp startup: ready: playwright
codex
你好，有什么要处理的？
tokens used
15,476
```

### 与交互式模式的区别

- **交互式**：`codex`（无参数）启动 TUI 界面，需手动输入指令
- **非交互式**：`codex exec "指令"` 直接传入指令并返回结果，适合脚本化调用
- 当前 Cursor 对话中使用 Shell 工具调用 `exec` 模式，结果直接输出到终端

### 常见问题

- **无响应或超时**：增加 `block_until_ms` 到 60000ms
- **需要确认命令**：Codex 默认在危险命令时要求确认，使用 `--full-auto` 可绕过
- **在非 Git 仓库运行**：加 `--skip-git-repo-check` 参数

### 快速调用模板

复制以下模板到 Shell 工具中使用：

```powershell
codex exec "你的指令" -C "D:/3.3-19.01"
```

或完整路径写法：

```powershell
& "C:\Users\Administrator\AppData\Local\Programs\node-v24.14.0-win-x64\codex.cmd" exec "你的指令" -C "D:/3.3-19.01" 2>&1
```
