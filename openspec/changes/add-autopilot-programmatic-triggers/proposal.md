# Proposal: Add Autopilot Programmatic Triggers

## Why

Autopilot currently exposes model-facing plugin tools and a prompt-flow `/autopilot` command. That is useful for explicit agent turns, but it leaves several high-signal OpenCode events unused: active OpenSpec files can change without an immediate cheap check, worker sessions can finish without automatic report collection, blocker questions can be answered without a follow-up status check, and users cannot run a quick Autopilot status command from the TUI without entering a normal LLM turn.

OpenCode already provides server events, trigger hooks, TUI keymap commands, and SDK/TUI control primitives. Autopilot needs a safe programmatic trigger layer that uses those surfaces for read-only status/checks, controlled collection, blocker-answer handling, and explicit user-invoked run actions without creating surprise autonomous work.

## What Changes

- Add a programmatic trigger contract for Autopilot that maps selected OpenCode events, hooks, and TUI actions to safe Autopilot controller actions.
- Factor the Autopilot tool execution path behind a shared controller so model-facing tools, event handlers, and future TUI/SDK bridges use the same output contract and safety checks.
- Add a debounced single-flight trigger scheduler with cooldowns, recursion guards, source tagging, and safe logging.
- Implement observe-mode triggers for active OpenSpec file changes and post-Autopilot tool checkpoints using read-only status or cheap checks.
- Implement controlled triggers for plugin-owned worker session idle events, blocker question replies, permission replies, and failure/stop signals only when plugin-owned runtime evidence ties the event to an Autopilot run.
- Define explicit TUI commands for zero-LLM status/check and user-initiated run/stop actions without treating passive events as consent to advance work.
- Preserve the current safe default: passive events may inspect or validate, but `autopilot_run_next` remains explicit or opt-in because future runtime slices may claim or dispatch work.

## Goals

- Make Autopilot responsive to real OpenCode runtime signals without relying on the model to remember every follow-up call.
- Catch invalid ledgers, stale active-change evidence, and post-transition conflicts earlier than pre-push.
- Automatically collect plugin-owned worker reports when a worker session finishes.
- Apply blocker answers and permission outcomes promptly when they correspond to plugin-owned pending state.
- Provide fast TUI actions for Autopilot status and safe explicit continuation.
- Keep all trigger decisions deterministic, debounced, idempotent, and auditable.

## Non-Goals

- Do not make Autopilot run automatically for ordinary codebase questions or passive file/message noise.
- Do not run claim-capable `autopilot_run_next` from passive events by default.
- Do not implement worker dispatch, protected ledger mutation, branch/worktree creation, MR creation, merge, deploy, or remote provider actions in this change.
- Do not parse partial streaming message deltas as final worker reports.
- Do not rely on server `event` hooks for blocking enforcement; use trigger hooks or permissions for guardrails.
- Do not build a broad Desktop/Web UI extension; TUI commands are optional and separate from server plugin logic.

## Trigger Policy Summary

| Surface | Default Mode | Allowed Action |
| --- | --- | --- |
| `file.watcher.updated` for `tasks.md`, `automation/task.json`, reports, or retrospectives | observe | Debounced status or cheap check only |
| `tool.execute.after` for `autopilot_run_next` or `autopilot_collect` | observe | Cheap checkpoint when output advanced or reported conflict risk |
| `session.status: idle` for plugin-owned worker sessions | controlled | `autopilot_collect` once per completed worker/report evidence |
| `message.updated` / `message.part.updated` for plugin-owned worker report markers | controlled | Schedule collect after worker idle, never on partial stream alone |
| `question.replied` / `question.rejected` for plugin-owned blocker questions | controlled | `autopilot_answer_blocker` or unresolved-blocker status |
| `permission.replied` for plugin-owned pending actions | controlled | Status or blocked/stop handling according to reply |
| `workspace.ready` / `worktree.ready` for plugin-owned runtime waits | controlled | Continue waiting run through status or explicit configured continuation |
| TUI `autopilot-status` command | explicit user action | Zero-LLM status/check |
| TUI `autopilot-run` command | explicit user action | Scoped explicit `autopilot_run_next` or prompt-mediated `/autopilot` |
| Passive events with no plugin-owned state | observe/off | No advancement; optional debounced status/check only |

## Impact

- Autopilot becomes more ergonomic for long-running OpenSpec work because status, cheap checks, and collection can happen at the right runtime moments.
- Event storms are controlled through debounce, cooldown, and single-flight execution instead of repeated no-progress tool calls.
- Programmatic triggers get a documented safety boundary, reducing the chance that future plugin work accidentally turns passive events into autonomous dispatch.
- Existing prompt-flow `/autopilot`, active-change fallback, runtime-deferred behavior, and continuous validation work remain compatible.

## Validation

- Add failing TypeScript tests for trigger classification, scheduler debounce/single-flight/cooldown, recursion guards, and config modes before implementation.
- Add plugin-level tests for server `event`, `tool.execute.after`, and `tool.execute.before` behavior with fake OpenCode events and tool outputs.
- Add tests proving passive events never call claim-capable `autopilot_run_next` unless explicit opt-in policy and plugin-owned active-run evidence are present.
- Add tests proving worker idle events schedule `autopilot_collect` only for plugin-owned worker sessions and only once per report evidence.
- Add tests proving protected Autopilot paths are blocked from direct model writes outside plugin-owned code.
- Run `npm run validate`.
- Run `npm test`.
- Run `npm run openspec:validate` or `openspec validate --all`.
- Run `instruction-artifact-reviewer` after README, skill, command, or TUI-command wording changes.
