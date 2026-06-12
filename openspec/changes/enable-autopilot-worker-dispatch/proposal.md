# Proposal: Enable Autopilot Worker Dispatch

## Why

Autopilot can now materialize `automation/task.json`, validate Ready ledgers, select a deterministic primary task, simulate claim/collect behavior in tests, and expose safe no-progress states such as `ready_runtime_deferred`. That is honest and safe, but it still leaves explicit `/autopilot` without an actual executor: valid work is selected, then the agent must hand off to `openspec-apply-change` or manual work.

The missing capability is a plugin-owned runtime loop that can claim one selected task, launch a worker session, collect a structured report, validate the legal phase transition, and update protected ledger state through plugin-owned code only.

## What Changes

- Add durable plugin-owned runtime state for active Autopilot runs, claimed tasks, worker sessions, expected report ids, ledger revision evidence, locks, consumed report ids, blockers, and stop/cancel state.
- Add a serial worker-dispatch path for the selected ledger task, using OpenCode session APIs through a thin adapter instead of UI automation or ad-hoc shell scripts.
- Add a strict worker report protocol that lets `autopilot_collect` parse one complete machine-readable report and reject malformed, duplicate, stale, or mismatched reports without mutating the ledger.
- Add a plugin-owned ledger transition writer that validates the current ledger, applies the worker report, validates the next ledger state, and atomically writes `automation/task.json` only after all checks pass.
- Extend runtime actionability beyond initial `Ready` selection so `Analyze`, `Implementation`, `Review`, and `Acceptance` phases can continue through legal task-type gates instead of falling back to `no_actionable_tasks` prematurely.
- Add worker-session permission and protected-path guardrails so workers cannot directly edit `.autopilot/**` or `openspec/changes/*/automation/**`, and cannot write outside their assigned scope.
- Integrate with existing programmatic trigger and scheduler helpers for worker-idle collection, without making passive observe-mode events claim work by default.

## Goals

- Turn `task.json` from a typed queue artifact into the authoritative execution ledger for serial Autopilot work.
- Preserve the current safety boundary: plugin owns protected state transitions; agents and workers return reports but do not edit ledgers directly.
- Remove the confusing `ready_runtime_deferred` boundary when runtime capability is explicitly enabled and the selected task can legally start.
- Keep the first production slice serial and recoverable before enabling parallel worker fan-out.
- Make every state transition auditable through structured output, durable runtime state, validation evidence, and tests.

## Non-Goals

- Do not enable default parallel implementation, auto-parallel fan-out, or worktree fan-out in this change; those remain separate guarded capabilities.
- Do not auto-merge MRs, push protected branches, deploy, force-push, or clean worktrees destructively.
- Do not expose raw OpenCode `session.create`, workspace, or prompt APIs as model-facing tools.
- Do not let passive file-watch/status events claim or dispatch work.
- Do not use LLM judgment as the authority for locks, legal transitions, scope safety, report acceptance, or ledger mutation.
- Do not require Desktop/Web UI changes; the server plugin path must work for any OpenCode client that talks to the same server.

## Current Evidence

- `.opencode/plugins/openspec-autopilot.ts` exposes model-facing `autopilot_*` tools and delegates to `createAutopilotController`, but it does not create child worker sessions or durable runtime state.
- `tools/openspec-autopilot-output.ts` can return `advanced` in claim mode when `runtimeState.claimReadyTasks` is supplied, but live plugin options do not enable that mode by default.
- `tools/openspec-autopilot-runtime.ts` already validates in-memory claim and collect transitions, tracks active runtime state, consumes worker report ids, rejects duplicate/stale reports, and checks fan-in evidence for parallel runs.
- `tools/autopilot-programmatic-triggers.ts` and `tools/autopilot-trigger-scheduler.ts` already classify worker-idle/report-marker events and debounce/suppress recursive trigger jobs, but the server plugin has not yet wired them to a real worker runtime.
- `openspec/changes/improve-autopilot-runtime-e2e-harness/` established the harness and selection contract; this change implements the next live runtime layer rather than repeating harness-only behavior.
- `openspec/changes/add-autopilot-programmatic-triggers/` owns scheduler/event-hook work; this change provides the runtime state and worker report data that controlled trigger jobs need.

## Impact

- Explicit Autopilot runs can start and continue real serial work instead of stopping at `ready_runtime_deferred` when dispatch capability is enabled and safe.
- Agents receive authoritative `tasksStarted[]`, `tasksAdvanced[]`, `selection`, `status.activeRun`, blocker, MR-wait, and loop-guard evidence from the plugin.
- Protected ledger writes become possible only through validated plugin-owned code, reducing the chance that workers or agents corrupt Autopilot state.
- Implementation complexity increases because the plugin must own durable state, recovery, worker identity, permissions, and report parsing.

## Validation

- Add focused failing tests for durable runtime state, serial worker dispatch, report parsing, ledger transition writing, stale evidence rejection, protected-path blocking, and phase-aware continuation before implementation.
- Run `npm run validate`.
- Run `npm test`.
- Run `openspec validate --all`.
- Run `npm run autopilot:check -- --level standard --change enable-autopilot-worker-dispatch` after implementation adds or modifies Autopilot runtime behavior.
- Run reviewer gates for code quality, test coverage, instruction artifacts, and deployment/config changes when the corresponding code or documentation changes.
