# Proposal: Activate Autopilot Runtime Liveness

## Why

A whole-code reachability audit found that most Autopilot TypeScript modules are import-reachable, but several high-value Autopilot capabilities are not live in normal operation. The result is a control plane that is safe and well-tested, but still underused: prompt-intake logic is deterministic only in tests, live worker dispatch depends on manual packaging/config, controlled and autonomous triggers rely on runtime evidence that is not durably persisted, and the current queue can be captured by stale ledgers.

The immediate symptom is visible in current runtime evidence: `autopilot_status` selects `openspec/changes/enable-autopilot-worker-dispatch/automation/task.json` as a `Ready` primary task even though that change's `tasks.md` is fully checked. At the same time, an unfinished follow-up change with unchecked tasks has no materialized ledger and is not selected. This makes Autopilot spend attention on stale work instead of driving useful next work.

This change turns the audit findings into an implementation-ready backlog for making Autopilot code run regularly in appropriate scenarios and retire or explicitly mark code that should remain test-only or contract-only.

## What Changes

- Add stale-ledger and queue-liveness behavior so completed OpenSpec changes cannot remain selected as `Ready` Autopilot work, and unfinished active changes are not hidden by stale ledgers.
- Wire deterministic `/autopilot <free-form prompt>` intake into a plugin-owned read-only runtime path instead of relying only on long instruction text and tests.
- Add a repeatable Autopilot live-runtime install/config path that packages skill, plugin, command, dependency, options, and restart guidance together.
- Persist the runtime evidence required by controlled and autonomous trigger branches before those branches are treated as live production behavior.
- Resolve production-dead or test-only Autopilot APIs such as the TUI classifier and worker-session `dispatch()` wrapper.
- Classify remaining contract-only exports and remove unrelated dead helper code found by the audit.
- Tighten discovery, routing, and validation so Autopilot is installed and invoked as a complete system rather than a skill-only blocker.

## Goals

- Make current Autopilot queues reflect useful unfinished work, not stale completed changes.
- Make prompt intake, worker dispatch, controlled triggers, and queue checks executable through plugin-owned or validator-owned code paths.
- Preserve safe defaults: passive events must not claim work by default, protected ledger paths remain plugin-owned, and live worker dispatch remains explicit opt-in until single-runtime ownership is proven.
- Make dead-code decisions explicit: wire useful code into runtime, move/mark test utilities, or delete unused helpers.
- Keep implementation test-first and split into small reversible slices.

## Non-Goals

- Do not enable worker dispatch globally by default without explicit configuration and single-runtime ownership evidence.
- Do not auto-archive, auto-merge, push, deploy, force-push, or destructively clean worktrees.
- Do not mutate `automation/task.json` directly from agents, workers, or model-facing tools.
- Do not build Desktop/Web UI extensions; terminal TUI remains a separate optional surface.
- Do not replace existing worker-dispatch implementation; this change activates, packages, validates, and cleans up around it.
- Do not use fuzzy model scoring to decide liveness, scope safety, stale state, or prompt family.

## Source Evidence

- `autopilot_status` currently reports one selected `Ready` ledger: `enable-autopilot-worker-dispatch`.
- `openspec/changes/enable-autopilot-worker-dispatch/tasks.md` has all checklist items checked while `automation/task.json` remains `Ready`.
- `tools/openspec-autopilot-output.ts` falls back to active `tasks.md` only when no ledgers exist, so one stale ledger can hide unfinished active changes.
- `tools/autopilot-prompt-intake.ts` is imported by tests but not by production plugin/controller paths.
- `.opencode/plugins/openspec-autopilot.ts` creates durable runtime store and worker-session adapter only when `workerDispatch.enabled === true`.
- `tools/install-opencode-global.ts` installs skills, agents, and `AGENTS.md`, but not the Autopilot plugin, command, dependency, or live options bundle.
- `tools/autopilot-runtime-store.ts` durable snapshot currently stores runs and consumed report ids, while controlled/autonomous triggers need blocker, permission, workspace/worktree wait, and last-run-next evidence.
- `classifyAutopilotTuiCommand()`, `AutopilotWorkerSessionAdapter.dispatch()`, `summarizeSchedulerSnapshot()`, contract constants, and `safeSelectSessionCount()` have no production consumers or need explicit classification.

## Impact

- Autopilot should stop selecting stale completed changes as live work.
- `/autopilot <free-form prompt>` should become safer and more deterministic because code, not just prose, performs the first routing decision.
- Live worker dispatch should become installable and testable as a coherent bundle while staying opt-in.
- Controlled event triggers should become live only when durable runtime evidence proves ownership.
- The repository should have less misleading dead or dormant Autopilot surface area.

## Validation

- Add focused tests before each behavior-changing implementation slice.
- Run `npm run validate`.
- Run `npm test`.
- Run `npm run openspec:validate`.
- Run `npm run autopilot:check -- --level cheap` after queue-liveness changes.
- Run `npm run autopilot:check -- --level prepush` before implementation handoff.
- Run relevant reviewer gates: code quality, test coverage, instruction artifact, and deployment/config review.
