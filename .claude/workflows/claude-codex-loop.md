# Claude Code <-> Codex 自动协作工作流

这个工作流把两位代理的职责拆清楚：

- Claude Code：提出问题、拆任务、写实现提示词、审查 Codex 的代码。
- Codex：按照 Claude Code 的提示词修改仓库、运行验证、提交实现摘要。

当前机器可以直接调用 `codex exec`，但没有检测到可用的 `claude` CLI。所以这里采用文件交接协议：Claude Code 通过 VS Code 读写 `.claude/handoff/*` 文件完成审查，脚本负责推进状态。

## 文件

- `.claude/task-state.json`：任务列表和状态。
- `.claude/handoff/current-task.md`：发给 Codex 的当前实现提示词。
- `.claude/handoff/codex-result.md`：Codex 完成后的最终说明。
- `.claude/handoff/current-review-prompt.md`：发给 Claude Code 的审查提示词。
- `.claude/handoff/current-review-result.json`：Claude Code 写回的审查结论。

## 状态

- `pending`：等待 Codex 实现。
- `in_progress`：Codex 正在执行。
- `implemented_pending_review`：Codex 已完成，等待 Claude Code 审查。
- `completed`：Claude Code 审查通过。
- `failed`：达到最大重试次数仍未通过。

## 日常用法

在仓库根目录运行：

```powershell
node .claude/workflows/claude-codex-loop.js status
node .claude/workflows/claude-codex-loop.js run-codex
node .claude/workflows/claude-codex-loop.js prepare-review
```

然后在 Claude Code 中发送：

```text
请读取 .claude/handoff/current-review-prompt.md，审查 Codex 的实现。
请把结论写入 .claude/handoff/current-review-result.json，格式必须符合文件中的 JSON schema。
```

Claude Code 写好审查结果后，运行：

```powershell
node .claude/workflows/claude-codex-loop.js apply-review
```

如果审查通过，任务会标记为 `completed`。如果审查失败，任务会回到 `pending`，并把 Claude Code 的反馈拼进下一轮 Codex 提示词。

## 单轮循环

```powershell
node .claude/workflows/claude-codex-loop.js run-codex
node .claude/workflows/claude-codex-loop.js prepare-review
# 让 Claude Code 写 current-review-result.json
node .claude/workflows/claude-codex-loop.js apply-review
```

重复这组命令，直到 `status` 显示没有 `pending` 任务。

## 审查结果格式

`.claude/handoff/current-review-result.json` 必须是严格 JSON：

```json
{
  "verdict": "FAIL",
  "score": 55,
  "feedback": "整体方向正确，但缺少测试，且一个边界条件未处理。",
  "issues": [
    {
      "severity": "major",
      "file": "packages/example/src/index.ts",
      "line": 42,
      "description": "空数组输入会抛出异常。",
      "suggestion": "在聚合前处理空数组并添加单元测试。"
    }
  ]
}
```

`verdict` 可选：

- `PASS`：完全通过。
- `PASS_WITH_MINOR`：通过，有非阻塞建议。
- `FAIL`：必须交回 Codex 修改。

## 如果之后安装了 Claude CLI

这个脚本已经把交接文件和状态机做好了。后续只需要把 `prepare-review` 之后的人工 Claude Code 步骤替换成 CLI 调用，就可以实现无人值守闭环。
