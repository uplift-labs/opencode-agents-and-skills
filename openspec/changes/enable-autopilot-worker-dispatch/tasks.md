# Tasks: Enable Autopilot Worker Dispatch

## Tests First

- [ ] Add runtime-store tests for schema validation, atomic save/load behavior, corrupt or missing state recovery, active-run reconciliation, and consumed report id persistence.
- [ ] Add report-parser tests covering one complete valid `AUTOPILOT_WORKER_REPORT` envelope and negative cases for missing, partial, duplicate, invalid JSON, unknown report id, and mismatched run/task/session/status evidence.
- [ ] Add ledger-transition-writer tests using temp OpenSpec repositories for valid protected ledger mutation, invalid next-ledger rollback, stale revision rejection, duplicate report id idempotency, and post-write validation.
- [ ] Add phase-dispatcher tests for `Ready`, `Analyze`, `Implementation`, `Review`, `Acceptance`, `Blocked`, and terminal statuses across representative task types.
- [ ] Add worker-prompt-builder tests proving prompts include phase goal, task type, scope read/write/forbidden boundaries, protected-path prohibition, validation expectations, and strict report contract.
- [ ] Add fake worker-session adapter tests proving `autopilot_run_next` creates one child worker session only when capability is available and dispatch is explicitly enabled.
- [ ] Add controller integration tests proving enabled serial dispatch returns `advanced` with `tasksStarted[]`, active status evidence, and no additional claim while a serial worker is active.
- [ ] Add controller integration tests proving disabled or unavailable worker dispatch preserves `ready_runtime_deferred` or a specific blocker without protected ledger mutation.
- [ ] Add `autopilot_collect` integration tests proving complete matching reports advance the protected ledger, repeated reports are idempotent, malformed reports block, and stale reports return `runtime_evidence_conflict`.
- [ ] Add protected-path and scope-guard tests for worker-originated patch/edit/write/bash paths including Windows separators, absolute paths, traversal, `scope.forbidden`, and protected Autopilot paths.
- [ ] Add event/scheduler integration tests proving owned idle worker report evidence schedules exactly one scoped collect, while passive or unrelated events cannot claim work.
- [ ] Add source-equivalent plugin adapter tests with fake OpenCode client/session APIs and clear capability-missing behavior when APIs are unavailable.

## Implementation

- [ ] Add `AutopilotRuntimeStore` interfaces plus in-memory and durable implementations with stable JSON schema, atomic writes, validation, and recovery behavior.
- [ ] Extend `AutopilotOptions` and plugin option parsing with an explicit safe default such as `workerDispatch.enabled: false`.
- [ ] Refactor existing in-memory claim/collect helpers so live runtime can obtain a validated next-ledger object and transition evidence without duplicating validator logic.
- [ ] Implement `LedgerTransitionWriter` that performs read-current, validate-current, verify revision/status/path, apply transition, validate-next, atomic write, and post-write validation.
- [ ] Implement strict worker report parser and typed report validation against stored run, worker, session, task, ledger path, status, and report id evidence.
- [ ] Implement phase-aware dispatch policy for `Ready`, `Analyze`, `Implementation`, `Review`, and `Acceptance`, preserving terminal, blocker, and MR-wait stops.
- [ ] Implement worker prompt builder from task ledger fields and phase policy, including explicit report-envelope and protected-path instructions.
- [ ] Implement OpenCode worker-session adapter behind a small interface; keep raw session/workspace APIs out of model-facing tools.
- [ ] Update `createAutopilotController` so `runNext`, `status`, `collect`, and `stop` use durable runtime services when dispatch is enabled and fall back safely when disabled/unavailable.
- [ ] Ensure active serial runtime state prevents duplicate claims and produces safe next actions for collect, status, stop, wait, blocker, or MR states.
- [ ] Implement worker-origin permission/scope/protected-path guard in plugin hook or equivalent OpenCode permission surface.
- [ ] Wire controlled worker-idle/report-marker event handling to existing scheduler/controller paths using durable worker session evidence.
- [ ] Keep passive observe-mode events read-only and claim-disabled.
- [ ] Add compact structured plugin logs for dispatch, collect, conflict, stop, and capability-missing events without logging raw prompts, secrets, or full report payloads.

## Documentation And Routing

- [ ] Update `README.md` Autopilot bundle/runtime guidance with worker dispatch prerequisites, default disabled policy, restart requirements, and safe fallback states.
- [ ] Update the README routing map so explicit `/autopilot` with enabled worker dispatch is distinguished from `ready_runtime_deferred`, `active_change_handoff`, and manual `openspec-apply-change` paths.
- [ ] Update `openspec-autopilot` skill guidance so agents know when `tasksStarted[]`/`tasksAdvanced[]` prove real dispatch or ledger mutation and when `ready_runtime_deferred` still means manual handoff.
- [ ] Update drift/contract tests for any new reason codes, output fields, options, or wording introduced by live dispatch.
- [ ] Document worker report format, protected-path boundaries, runtime-store ownership, and recovery/stop behavior.
- [ ] Review relevant artifact frontmatter, plugin descriptions, command wording, and install guidance for discoverability after runtime behavior changes.

## Review Gates

- [ ] Run `code-quality-reviewer` for runtime store, ledger writer, controller changes, report parser, plugin adapter, and guard code.
- [ ] Run `test-coverage-reviewer` for dispatch, collect, stale evidence, protected path, event scheduling, and disabled/unavailable capability paths.
- [ ] Run `instruction-artifact-reviewer` after README, skill, command, or routing wording changes.
- [ ] Run `deployment-config-reviewer` if plugin options, package/install guidance, runtime store location, or OpenCode config shape changes materially.
- [ ] Run `openspec-consistency-review` before implementation handoff or archive because this change affects Autopilot runtime, routing, and protected-state semantics.

## Validation

- [ ] `npm run validate`
- [ ] `npm test`
- [ ] `openspec validate --all`
- [ ] `npm run autopilot:check -- --level standard --change enable-autopilot-worker-dispatch`
- [ ] `npm run autopilot:check -- --level prepush` or `npm run prepush:validate` before ready-to-land handoff
- [ ] Source-equivalent plugin smoke: fake worker dispatch starts one session and reports active runtime state
- [ ] Source-equivalent plugin smoke: fake worker report collect updates only the temp protected ledger through plugin-owned writer
- [ ] Manual/live smoke after OpenCode restart only when worker-session APIs and safe plugin options are available; otherwise record capability-missing fallback evidence

## Acceptance Criteria

- [ ] With worker dispatch disabled or unavailable, current safe `ready_runtime_deferred` behavior remains compatible and loop-guarded.
- [ ] With worker dispatch enabled and capability available, one valid dispatchable ledger can be claimed and started as exactly one worker session.
- [ ] `autopilot_status` reports compact active runtime state for claimed/running/stopped/blocked runs without leaking raw prompts or secrets.
- [ ] `autopilot_collect` accepts only complete matching worker reports and rejects malformed, duplicate, stale, or mismatched evidence without protected ledger mutation.
- [ ] Legal report transitions are validated and written atomically to `automation/task.json` only by plugin-owned code.
- [ ] Non-terminal phases can continue or block through phase-aware policy instead of generic no-actionable output.
- [ ] Worker-originated writes to protected Autopilot paths and out-of-scope paths are blocked by runtime enforcement, not only by prompt instructions.
- [ ] Controlled event-triggered collection uses only plugin-owned worker evidence and cannot start claim-capable work from passive or unrelated events.
- [ ] No automatic merge, deploy, protected-branch push, force-push, or destructive cleanup is introduced.

## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, and token-heavy steps.
- [ ] Write `retrospective.md` with evidence, problems, improvements, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- enable-autopilot-worker-dispatch` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
