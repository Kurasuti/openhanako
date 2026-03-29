# ACPX 工具函数使用指南

> 最后更新：2026-03-25

## 概述

`acpx` 是 Hanako 平台的外部编码代理调用接口，支持调用 Codex 和 Claude 代理。

---

## 核心规则（最佳实践）

1. **优先使用 `prompt` 模式 + 命名会话** 进行多轮工作
2. **确保 cwd 是项目根目录**（包含 `.claude/` 的目录），否则自定义斜杠命令无法识别
3. **默认使用 `--approve-reads`**，仅在需要时升级到 `--approve-all`
4. **仅在不依赖会话记忆或项目自定义命令时使用 `exec` 模式**

---

## 推荐命令格式

### 持久会话（推荐）

```bash
# 简洁形式
acpx --cwd <project-root> claude -s <session-name> "<prompt>"

# 显式 prompt 形式
acpx --cwd <project-root> claude -s <session-name> prompt "<prompt>"
```

### 确保会话存在后再调用

```bash
# 1) 确保会话存在
acpx --cwd <project-root> claude sessions ensure --name <session-name>

# 2) 运行持久化提示
acpx --cwd <project-root> claude -s <session-name> "<prompt>"
```

### 一次性执行

```bash
# 仅用于不依赖会话的任务
acpx --cwd <project-root> codex exec "<prompt>"
```

---

## 任务类型

`prompt` 参数支持两种类型：

| 类型 | 示例 | 说明 |
|------|------|------|
| **斜杠命令** | `/start`, `/design-review` | 调用项目自定义 skill |
| **普通文本** | `What is the project status?` | 自然语言描述任务 |

---

## 非交互式权限模式

三种模式互斥，选择其一：

| 参数 | 说明 |
|------|------|
| `--approve-reads` | ✅ **推荐默认**：自动批准读取/搜索，写入需确认 |
| `--approve-all` | 自动批准所有操作 |
| `--deny-all` | 拒绝所有操作 |

### 自动化管道

```bash
acpx --format json --approve-reads --cwd <project-root> claude exec "<prompt>"
```

---

## 会话与 cwd 行为

- 会话作用域 = agent + 绝对 cwd + 可选 session 名称
- 更改 `--cwd` 会更改会话作用域
- 自定义斜杠命令无法识别时，首先检查 cwd 是否正确

---

## Hanako 工具函数调用

```javascript
// 调用自定义 skill
acpx({
  target: "claude",
  mode: "prompt",
  task: "/start",
  timeoutSec: 120
})

// 带命名会话
acpx({
  target: "claude",
  mode: "prompt",
  session: "dev",
  task: "/design-review",
  timeoutSec: 120
})

// 普通文本任务
acpx({
  target: "claude",
  mode: "prompt",
  task: "What is the project status?",
  timeoutSec: 120
})
```

### 参数对照表

| 工具函数参数 | CLI 参数 |
|-------------|----------|
| `target` | `claude` / `codex` |
| `mode` | `prompt` / `exec` |
| `task` | 最后的位置参数 |
| `session` | `-s <name>` |
| `timeoutSec` | `--timeout <seconds>` |

---

## 故障排查清单

| 问题 | 解决方案 |
|------|----------|
| `NO_SESSION` / 会话未找到 | 在相同 cwd 下运行 `acpx <agent> sessions ensure --name <name>` |
| 自定义斜杠命令无法识别 | 检查 `--cwd` 是否指向包含命令定义的仓库根目录 |
| 运行时内部工具错误 | 重试时添加 `--approve-reads` 或 `--approve-all`；或从 `exec` 切换到带会话的 `prompt` |
| Skill 被拒绝 (exit code 5) | Skill 执行可能需要交互式确认，建议在本地终端直接运行 `claude` |
| `Find` 工具 Internal error | Claude CLI 的 `Find` 工具在 Windows 上有已知 bug，可重试或改用本地终端 |
| 需要确定性解析 | 使用 `--format json` 并解析 NDJSON 事件 |

---

## 最小工作流模板

### 通过 acpx（自动化场景）

```bash
# 1) 确保作用域会话
acpx --cwd <repo> --approve-all claude sessions ensure --name work

# 2) 运行持久化提示
acpx --cwd <repo> --approve-all claude -s work "<task>"
```

### 本地终端（交互场景）

当 skill 或工具链在 acpx 中运行不稳定时，推荐直接使用本地终端：

```bash
# 进入项目目录
cd G:/Godot/SlayTheRobot

# 启动 Claude CLI
claude

# 在交互式环境中运行 skill
/start
```

> 💡 **提示**：交互式 skill（如 `/start`）在本地终端中体验最佳。

---

## 完整示例

### Bash 直接调用

```bash
# 调用自定义 skill
acpx --cwd "G:/Godot/SlayTheRobot" --approve-reads claude -s work "/start"

# 普通文本任务
acpx --cwd "G:/Godot/SlayTheRobot" --approve-reads claude -s work "What is the project status?"

# 创建并使用命名会话
acpx --cwd "G:/Godot/SlayTheRobot" claude sessions ensure --name dev
acpx --cwd "G:/Godot/SlayTheRobot" --approve-reads claude -s dev "/design-review"

# 查看会话状态
acpx --cwd "G:/Godot/SlayTheRobot" claude status

# 列出所有会话
acpx claude sessions
```

### Hanako 工具函数调用

```javascript
// 基础调用
acpx({
  target: "claude",
  mode: "prompt",
  session: "work",
  task: "/start",
  timeoutSec: 120
})

// 普通文本任务
acpx({
  target: "claude",
  mode: "prompt",
  session: "work",
  task: "What is the project status?",
  timeoutSec: 120
})
```

---
