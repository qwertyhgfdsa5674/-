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

async function main() {
  ensureDirs()

  if (command === 'status') return status()
  if (command === 'next-prompt') return nextPrompt()
  if (command === 'run-codex') return runCodex()
  if (command === 'prepare-review') return prepareReview()
  if (command === 'apply-review') return applyReview(process.argv[3] || currentReviewResultFile)
  if (command === 'run-claude-review') return runClaudeReview(process.argv[3])
  if (command === 'run-cycle') return runCycle()
  if (command === 'run-loop') return runLoop()
  if (command === 'reset-task') return resetTask(process.argv[3])

  throw new Error(`Unknown command: ${command}`)
}

function status() {
  const state = loadState()
  const counts = countByStatus(state.tasks)
  console.log('Claude/Codex workflow status')
  console.log(`State: ${stateFile}`)
  console.log(`Tasks: ${state.tasks.length}`)
  for (const [key, value] of Object.entries(counts)) console.log(`  ${key}: ${value}`)
  console.log(CLAUDE_CLI
    ? `Claude CLI: ${CLAUDE_CLI}  (auto-review ENABLED)`
    : 'Claude CLI: NOT FOUND  (manual review only)')

  const active = findActiveTask(state)
  if (active) {
    console.log('')
    console.log(`Active: [${active.id}] ${active.title}`)
    console.log(`Status: ${active.status}`)
    if (active.lastFeedback) console.log(`Last feedback: ${active.lastFeedback.slice(0, 240)}`)
  } else {
    const next = findNextPendingTask(state)
    console.log('')
    console.log(next ? `Next: [${next.id}] ${next.title}` : 'No pending task.')
  }
}

function nextPrompt() {
  const state = loadState()
  const task = findActiveTask(state) || findNextPendingTask(state)
  if (!task) {
    console.log('No active or pending task.')
    return
  }

  const prompt = buildImplementationPrompt(task)
  fs.writeFileSync(currentTaskFile, prompt, 'utf8')
  console.log(currentTaskFile)
}

function runCodex() {
  const state = loadState()
  const task = findActiveTask(state) || findNextPendingTask(state)
  if (!task) {
    console.log('No pending task for Codex.')
    return
  }

  task.status = 'in_progress'
  task.attempts = Number(task.attempts || 0) + 1
  task.startedAt = new Date().toISOString()
  saveState(state)

  const prompt = buildImplementationPrompt(task)
  fs.writeFileSync(currentTaskFile, prompt, 'utf8')

  console.log(`Running Codex for [${task.id}] ${task.title}`)
  console.log(`Prompt: ${currentTaskFile}`)
  console.log(`Output: ${codexResultFile}`)

  const result = cp.spawnSync(
    'cmd.exe',
    [
      '/c',
      'codex',
      'exec',
      '--cd',
      repoRoot,
      '--sandbox',
      'danger-full-access',
      '--ask-for-approval',
      'never',
      '--output-last-message',
      codexResultFile,
      '-'
    ],
    {
      cwd: repoRoot,
      input: prompt,
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'inherit']
    }
  )

  const fresh = loadState()
  const freshTask = fresh.tasks.find((item) => item.id === task.id)

  if (result.status !== 0) {
    freshTask.status = 'pending'
    freshTask.lastFeedback = [
      `Codex execution failed with exit code ${result.status}.`,
      'Please inspect the terminal output and rerun the task.'
    ].join('\n')
    freshTask.lastRunFailedAt = new Date().toISOString()
    saveState(fresh)
    process.exit(result.status || 1)
  }

  freshTask.status = 'implemented_pending_review'
  freshTask.implementedAt = new Date().toISOString()
  freshTask.codexResultFile = relative(codexResultFile)
  saveState(fresh)

  console.log('')
  console.log('Codex finished. Next step:')
  if (CLAUDE_CLI) {
    console.log('  node .claude/workflows/claude-codex-loop.js run-claude-review')
  } else {
    console.log('  node .claude/workflows/claude-codex-loop.js prepare-review')
  }
}

function prepareReview() {
  const state = loadState()
  const task = state.tasks.find((item) => item.status === 'implemented_pending_review')
  if (!task) {
    console.log('No task is waiting for Claude review.')
    return
  }

  const prompt = buildReviewPrompt(task)
  fs.writeFileSync(currentReviewPromptFile, prompt, 'utf8')
  fs.writeFileSync(
    currentReviewResultFile,
    JSON.stringify(
      {
        verdict: 'FAIL',
        score: 0,
        feedback: 'Replace this placeholder with Claude Code review feedback.',
        issues: [
          {
            severity: 'major',
            file: '',
            line: null,
            description: '',
            suggestion: ''
          }
        ]
      },
      null,
      2
    ) + '\n',
    'utf8'
  )

  console.log(`Review prompt written: ${currentReviewPromptFile}`)
  console.log(`Review result template written: ${currentReviewResultFile}`)
  console.log('')
  console.log('Ask Claude Code to review using current-review-prompt.md, then overwrite current-review-result.json.')
}

function applyReview(reviewPath) {
  const state = loadState()
  const task = state.tasks.find((item) => item.status === 'implemented_pending_review')
  if (!task) {
    console.log('No task is waiting for review application.')
    return
  }

  if (!fs.existsSync(reviewPath)) throw new Error(`Review file not found: ${reviewPath}`)

  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
  if (!['PASS', 'PASS_WITH_MINOR', 'FAIL'].includes(review.verdict)) {
    throw new Error('review.verdict must be PASS, PASS_WITH_MINOR, or FAIL')
  }

  task.lastReviewAt = new Date().toISOString()
  task.reviewScore = Number(review.score || 0)
  task.reviewNotes = review.feedback || ''
  task.reviewIssues = Array.isArray(review.issues) ? review.issues : []

  if (review.verdict === 'PASS' || review.verdict === 'PASS_WITH_MINOR') {
    task.status = 'completed'
    task.completedAt = new Date().toISOString()
    task.finalVerdict = review.verdict
    state.totalCompleted = state.tasks.filter((item) => item.status === 'completed').length
    saveState(state)
    console.log(`Task completed: [${task.id}] ${task.title}`)
    return
  }

  task.lastFeedback = formatReviewFeedback(review)
  if (Number(task.attempts || 0) >= Number(state.strategy?.maxRetriesPerTask || 3)) {
    task.status = 'failed'
    task.failedAt = new Date().toISOString()
    state.totalFailed = state.tasks.filter((item) => item.status === 'failed').length
    saveState(state)
    console.log(`Task failed after ${task.attempts} attempts: [${task.id}] ${task.title}`)
    return
  }

  task.status = 'pending'
  saveState(state)
  console.log(`Task returned to pending with Claude feedback: [${task.id}] ${task.title}`)
  console.log('Next step:')
  console.log('  node .claude/workflows/claude-codex-loop.js run-codex')
}

// ── ★★★ Three new commands ★★★ ───────────────────────────────────────

function runClaudeReview(extraInstruction) {
  if (!CLAUDE_CLI) {
    console.error('ERROR: Claude CLI not found.')
    console.error('Use: node .claude/workflows/claude-codex-loop.js prepare-review')
    console.error('Then review manually in Claude Code + apply-review')
    process.exit(1)
  }

  const state = loadState()
  const task = state.tasks.find(t => t.status === 'implemented_pending_review')
  if (!task) {
    console.log('No task is waiting for Claude review.')
    return
  }

  // Write review context files first
  prepareReview()

  const cliPrompt = [
    'You are a code reviewer. Review the implementation Codex just completed.',
    '',
    'Read .claude/handoff/current-review-prompt.md for the full review context.',
    '',
    'Steps:',
    '1. Run `git diff --stat` and `git diff` to see all changes.',
    '2. Read the changed files to check code quality and completeness.',
    '3. Run typecheck or lint if the project supports it.',
    '4. Write your review verdict as strict JSON to .claude/handoff/current-review-result.json.',
    '',
    'JSON schema:',
    '{',
    '  "verdict": "PASS" | "PASS_WITH_MINOR" | "FAIL",',
    '  "score": <number 0-100>,',
    '  "feedback": "<one-paragraph summary for Codex>",',
    '  "issues": [',
    '    {',
    '      "severity": "blocker" | "major" | "minor",',
    '      "file": "<repo-relative path>",',
    '      "line": <number or null>,',
    '      "description": "<what is wrong>",',
    '      "suggestion": "<how to fix>"',
    '    }',
    '  ]',
    '}',
    'PASS = no fixes needed. PASS_WITH_MINOR = suggestions only. FAIL = must fix.',
    extraInstruction || ''
  ].join('\n')

  console.log(`Running Claude CLI review for [${task.id}] ${task.title}`)
  console.log(`Claude CLI: ${CLAUDE_CLI}`)

  const result = cp.spawnSync(
    CLAUDE_CLI,
    [
      '-p', cliPrompt,
      '--output-format', 'json',
      '--max-turns', '12',
      '--permission-mode', 'bypassPermissions'
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'pipe'],
      timeout: 300_000
    }
  )

  if (result.stderr) {
    console.error('Claude CLI stderr:', result.stderr.slice(0, 500))
  }

  if (result.status !== 0) {
    console.error(`Claude CLI exited with code ${result.status}`)
    console.error('Fall back: prepare-review → manual review → apply-review')
    process.exit(result.status)
  }

  console.log('Claude CLI review completed.')
  applyReview(currentReviewResultFile)
}

function runCycle() {
  const state = loadState()
  const inReview = state.tasks.filter(t => t.status === 'implemented_pending_review').length
  const pending = state.tasks.filter(t => t.status === 'pending').length
  const active = state.tasks.filter(t => t.status === 'in_progress').length

  // Reset stuck in_progress tasks
  if (active > 0 && inReview === 0 && pending === 0) {
    const stuck = state.tasks.find(t => t.status === 'in_progress')
    if (stuck) {
      console.log(`Resetting stuck task: [${stuck.id}] ${stuck.title}`)
      stuck.status = 'pending'
      saveState(state)
      return runCycle()
    }
  }

  // Phase 1: handle review
  if (inReview > 0) {
    console.log('Task awaiting review…')
    if (CLAUDE_CLI) return runClaudeReview()
    prepareReview()
    console.log('Complete manual review, then apply-review.')
    return
  }

  // Phase 2: all done?
  if (pending === 0 && active === 0) {
    console.log('All tasks completed!')
    return status()
  }

  // Phase 3: start next implementation
  console.log(`Starting cycle — ${pending} task(s) remaining.`)
  runCodex()

  // Phase 4: auto-review if Claude CLI available
  if (CLAUDE_CLI) {
    runClaudeReview()
  } else {
    console.log('Manual review: prepare-review → Claude Code → apply-review')
  }
}

function runLoop() {
  const MAX_ITERATIONS = 50

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const state = loadState()
    const pending = state.tasks.filter(t => t.status === 'pending').length
    const inReview = state.tasks.filter(t => t.status === 'implemented_pending_review').length
    const active = state.tasks.filter(t => t.status === 'in_progress').length
    const failed = state.tasks.filter(t => t.status === 'failed').length

    if (pending === 0 && inReview === 0 && active === 0) {
      console.log(`\n=== Loop complete after ${i} iteration(s) ===`)
      console.log(`Completed: ${state.tasks.filter(t => t.status === 'completed').length}`)
      if (failed > 0) console.log(`Failed: ${failed} (needs manual intervention)`)
      return status()
    }

    console.log(`\n=== Iteration ${i + 1} ===`)
    runCycle()
  }

  console.log(`Reached max iterations (${MAX_ITERATIONS}).`)
  status()
}

// ── resetTask ────────────────────────────────────────────────────────

function resetTask(taskId) {
  if (!taskId) throw new Error('Usage: reset-task <task-id>')
  const state = loadState()
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task) throw new Error(`Task not found: ${taskId}`)
  task.status = 'pending'
  delete task.startedAt
  delete task.implementedAt
  delete task.completedAt
  delete task.failedAt
  saveState(state)
  console.log(`Reset task to pending: [${task.id}] ${task.title}`)
}

// ── Prompt builders ───────────────────────────────────────────────────

function buildImplementationPrompt(task) {
  const basePrompt = task.prompt || [
    `Implement this repository task.`,
    '',
    `Task id: ${task.id}`,
    `Module: ${task.module || '(not specified)'}`,
    `Title: ${task.title}`,
    '',
    'Read the repository first, follow existing TypeScript and monorepo patterns, keep changes scoped, and run the relevant checks.',
    'When finished, summarize changed files, behavior, and verification.'
  ].join('\n')

  const feedback = task.lastFeedback
    ? [
        '',
        '## Required fixes from Claude Code review',
        '',
        task.lastFeedback,
        '',
        'Address every review item before reporting completion.'
      ].join('\n')
    : ''

  return [
    '# Codex implementation task',
    '',
    basePrompt,
    feedback,
    '',
    '## Output expectations',
    '',
    '- Make the code changes directly in the repository.',
    '- Do not wait for clarification unless the task is impossible or unsafe.',
    '- Run focused verification commands and report any command that could not be run.',
    '- Keep the final response concise and reviewable.'
  ].join('\n')
}

function buildReviewPrompt(task) {
  const codexSummary = fs.existsSync(codexResultFile)
    ? fs.readFileSync(codexResultFile, 'utf8')
    : '(No Codex result file found.)'

  return [
    '# Claude Code review task',
    '',
    'Review the implementation that Codex just completed.',
    '',
    `Task id: ${task.id}`,
    `Module: ${task.module || '(not specified)'}`,
    `Title: ${task.title}`,
    '',
    '## Original implementation prompt',
    '',
    fs.existsSync(currentTaskFile) ? fs.readFileSync(currentTaskFile, 'utf8') : '(No current task prompt found.)',
    '',
    '## Codex final message',
    '',
    codexSummary,
    '',
    '## Review requirements',
    '',
    '- Inspect the actual git diff and relevant files.',
    '- Run or request the most relevant checks if needed.',
    '- Return strict JSON in `.claude/handoff/current-review-result.json`.',
    '- Use PASS only when no required fixes remain.',
    '- Use PASS_WITH_MINOR only for non-blocking suggestions.',
    '- Use FAIL when Codex must make another implementation pass.',
    '',
    'JSON schema:',
    '',
    JSON.stringify(
      {
        verdict: 'PASS | PASS_WITH_MINOR | FAIL',
        score: 0,
        feedback: 'Short review summary for Codex.',
        issues: [
          {
            severity: 'blocker | major | minor',
            file: 'path/to/file.ts',
            line: 123,
            description: 'What is wrong.',
            suggestion: 'How Codex should fix it.'
          }
        ]
      },
      null,
      2
    )
  ].join('\n')
}

function formatReviewFeedback(review) {
  const issues = Array.isArray(review.issues) ? review.issues : []
  return [
    `Claude Code review verdict: ${review.verdict} (${review.score || 0}/100)`,
    '',
    review.feedback || '',
    '',
    'Issues to fix:',
    ...issues.map((issue) => {
      const location = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : 'no location'
      const suggestion = issue.suggestion ? ` Suggestion: ${issue.suggestion}` : ''
      return `- [${issue.severity || 'major'}] ${location}: ${issue.description || ''}${suggestion}`
    })
  ].join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────

function loadState() {
  if (!fs.existsSync(stateFile)) throw new Error(`State file not found: ${stateFile}`)
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
}

function saveState(state) {
  state.lastRun = new Date().toISOString()
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

function ensureDirs() {
  fs.mkdirSync(handoffDir, { recursive: true })
}

function findActiveTask(state) {
  return state.tasks.find((item) => item.status === 'in_progress')
}

function findNextPendingTask(state) {
  return state.tasks.find((item) => item.status === 'pending')
}

function countByStatus(tasks) {
  return tasks.reduce((acc, task) => {
    acc[task.status || 'unknown'] = (acc[task.status || 'unknown'] || 0) + 1
    return acc
  }, {})
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, '/')
}
