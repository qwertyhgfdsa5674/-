#!/usr/bin/env node
/**
 * Claude Code <-> Codex handoff loop.
 *
 * Claude Code owns task design and review.
 * Codex owns implementation.
 *
 * Usage:
 *   node .claude/workflows/claude-codex-loop.js status
 *   node .claude/workflows/claude-codex-loop.js run-codex
 *   node .claude/workflows/claude-codex-loop.js prepare-review
 *   node .claude/workflows/claude-codex-loop.js apply-review [result.json]
 *   node .claude/workflows/claude-codex-loop.js run-claude-review
 *   node .claude/workflows/claude-codex-loop.js run-cycle
 *   node .claude/workflows/claude-codex-loop.js run-loop
 *   node .claude/workflows/claude-codex-loop.js reset-task <id>
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import cp from 'node:child_process'

const repoRoot = process.cwd()
const claudeDir = path.join(repoRoot, '.claude')
const stateFile = path.join(claudeDir, 'task-state.json')
const handoffDir = path.join(claudeDir, 'handoff')
const currentTaskFile = path.join(handoffDir, 'current-task.md')
const currentReviewPromptFile = path.join(handoffDir, 'current-review-prompt.md')
const currentReviewResultFile = path.join(handoffDir, 'current-review-result.json')
const codexResultFile = path.join(handoffDir, 'codex-result.md')

// ── Claude CLI detection (from VS Code extension) ──────────────────────

function resolveClaudeCli() {
  const extensionsDir = path.join(os.homedir(), '.vscode', 'extensions')
  if (!fs.existsSync(extensionsDir)) return null
  const entries = fs.readdirSync(extensionsDir)
    .filter(n => n.startsWith('anthropic.claude-code-'))
    .sort()
  if (!entries.length) return null
  const cli = path.join(extensionsDir, entries.pop(),
    'resources', 'native-binary', 'claude.exe')
  return fs.existsSync(cli) ? cli : null
}

const CLAUDE_CLI = resolveClaudeCli()

const command = process.argv[2] || 'status'

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exit(1)
})
