# Tasks: Enable Autopilot Worker Dispatch

## Tests First

- [x] Add runtime-store tests for schema validation, atomic save/load behavior, corrupt or missing state recovery, active-run evidence persistence, and consumed report id persistence. Evidence: `tools/test-autopilot-runtime-store.ts` covers strict allowed-key schema validation, optional `null` rejection, unknown-field rejection before normalization, missing/corrupt/invalid persisted-state recovery, stable cloned in-memory save/load, in-memory rollback, full active-run round trip, consumed report id sorting/dedup, invalid-save rollback, forced rename-failure cleanup/rollback, same-store recovery after failure, and detached overlapping save serialization. Validation passed: `node tools/test-autopilot-runtime-store.ts`, `npm test`, `npm run validate` (existing warning: top-level `allow` in `opencode.json`), `openspec validate --all`, and `npm run autopilot:check -- --level standard --change enable-autopilot-worker-dispatch` (exit 0 with advisory freshness unknowns).
- [x] Add report-parser tests covering one complete valid `AUTOPILOT_WORKER_REPORT` envelope and negative cases for missing, partial, duplicate, invalid JSON, unknown report id, and mismatched run/task/session/status evidence. Evidence: `tools/test-autopilot-worker-report-parser.ts` covers a complete standalone marker-line plus JSON payload, optional target status behavior, non-empty blocker and nested evidence preservation, missing stored session evidence, missing marker, partial marker, partial-plus-complete marker, split-line and inline marker rejection, duplicate complete markers, invalid JSON, unknown marker report id, already-consumed duplicate report id, mismatched payload identity/status evidence, payload report id mismatch, invalid payload shape, invalid validation status, invalid MR status, and unknown fields. Validation passed: `node tools/test-autopilot-worker-report-parser.ts`, `npm test`, `npm run validate` (existing warning: top-level `allow` in `opencode.json`), and `openspec validate --all`.
- [x] Add ledger-transition-writer tests using temp OpenSpec repositories for valid protected ledger mutation, invalid next-ledger rollback, stale revision rejection, duplicate report id idempotency, and post-write validation. Evidence: `tools/test-autopilot-ledger-transition-writer.ts` covers valid temp-repo protected ledger mutation, post-write validation, stale revision number/content hash rejection with byte preservation, unsafe path rejection, symlinked `automation` path rejection, invalid next-ledger rollback with temp cleanup, wrong current ledger id rejection, stale current status rejection, invalid current ledger rejection, blocked-ledger resolution clearing stale blockers, duplicate report id idempotency with exact byte preservation, duplicate report id with mismatched history evidence rejection, and mismatched report evidence rejection. Validation passed: `node tools/test-autopilot-ledger-transition-writer.ts`, `npm test`, `npm run validate` (existing warning: top-level `allow` in `opencode.json`), and `openspec validate --all`.
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

- [x] Add `AutopilotRuntimeStore` interfaces plus in-memory and durable implementations with stable JSON schema, atomic writes, validation, and recovery behavior. Evidence: `tools/autopilot-runtime-store.ts` defines runtime snapshot/run records, strict runtime validation before normalization, whitelisted normalization, in-memory store, durable file store, corrupt/missing/invalid-state recovery, temp-file atomic save, and per-store-instance write serialization. Reviewer evidence: `code-quality-reviewer` final re-review reported no blocking findings after cleanup; `test-coverage-reviewer` final re-review was clean and independently reran the focused runtime-store test.
- [ ] Extend `AutopilotOptions` and plugin option parsing with an explicit safe default such as `workerDispatch.enabled: false`.
- [ ] Refactor existing in-memory claim/collect helpers so live runtime can obtain a validated next-ledger object and transition evidence without duplicating validator logic.
- [x] Implement `LedgerTransitionWriter` that performs read-current, validate-current, verify revision/status/path, apply transition, validate-next, atomic write, and post-write validation. Evidence: `tools/autopilot-ledger-transition-writer.ts` provides active OpenSpec ledger path safety with symlink/junction guard, current ledger validation, stored run/report evidence checks, stale revision/status detection, exact duplicate report id idempotency checks, next-ledger construction with history/revision/MR/blocker updates, shared next-ledger validation, temp-file write/rename, optimistic pre-rename revision freshness check, and post-write validation. Reviewer evidence: `code-quality-reviewer` final recheck was clean after symlink hardening; `test-coverage-reviewer` final recheck was clean and independently reran the focused writer test.
- [x] Implement strict worker report parser and typed report validation against stored run, worker, session, task, ledger path, status, and report id evidence. Evidence: `tools/autopilot-worker-report-parser.ts` parses exactly one standalone `AUTOPILOT_WORKER_REPORT <reportId> COMPLETE` marker and JSON payload, validates the marker before trusting payload, rejects consumed report ids, enforces schema/version/allowed keys/status values, validates required evidence, compares run/worker/session/task/ledger/status/report-id evidence against `AutopilotRunRecord`, and returns typed parsed reports or structured rejection reason codes without ledger mutation. Reviewer evidence: `code-quality-reviewer` final parser re-review was clean; `test-coverage-reviewer` final review found no blockers, independently reran the focused parser test, and its non-blocking blocker/evidence coverage gap was closed by additional tests.
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
