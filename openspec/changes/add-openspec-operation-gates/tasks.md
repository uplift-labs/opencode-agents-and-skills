# Tasks: Add OpenSpec Operation Gates

## Tests First: Shared Gate Contract

- [x] Add fixtures for passed, warning, failed, blocked, unknown, and not-applicable gate results.
- [x] Add tests for stable JSON output, deterministic ordering, redaction, safe change id validation, and `--persist` output paths.
- [x] Add tests proving gate reports are written as JSON under `automation/operation-gates/<operation>.json` only when persistence is requested.

## Tests First: Operation Coverage

- [ ] Add `propose` gate tests for safe id, required artifacts, spec delta, duplicate id, test-first tasks, and JSON retro tail.
- [ ] Add `apply` gate tests for accepted/selected change readiness, unresolved blockers, missing test plan, stale all-checked work, and Autopilot ledger handoff.
- [ ] Add `task-update` gate tests for checkbox evidence, validation evidence, final JSON retro tail preservation, and all-checked active change warnings/blockers.
- [ ] Add `ledger-materialize` gate tests for unchecked tasks, safe scopes, forbidden protected paths, validation commands, and post-materialization ledger validation.
- [ ] Add `worker-dispatch` gate tests for worker dispatch option, session capability, runtime store validity, serial active worker conflict, blockers, MR wait, scope, and stale ledger state.
- [ ] Add `collect` gate tests for plugin-owned session/report evidence, complete marker, duplicate idempotency, stale ledger revision, legal transition, and mismatched report rejection.
- [ ] Add `review` gate tests for reviewer outputs, test coverage, code quality, deployment/config review, docs/spec sync, and unresolved blocker handling.
- [ ] Add `acceptance` gate tests for terminal readiness, MR policy, fan-in evidence, feedback, and docs/spec sync.
- [ ] Add `archive` gate tests for complete tasks, `automation/retro.json`, follow-up ids, freshness, OpenSpec validation, no active runtime, and no active stale ledger.
- [ ] Add `post-archive` gate tests for archive directory state, no active ledgers/runs, valid follow-ups, docs update signal, and OpenSpec validation.
- [ ] Add `prepush` gate tests for changed-file scoped operation checks and stale ledger detection.

## Implementation

- [x] Add `tools/openspec-operation-gate.ts` with a typed operation registry and shared JSON output contract.
- [x] Add `npm run openspec:gate` script.
- [ ] Reuse existing validators: `openspec validate`, `autopilot:validate`, `autopilot:check`, freshness checks, and JSON retro gate.
- [x] Implement cheap read-only gates first, then full gates where existing validators are available.
- [x] Add optional `--persist` support for `automation/operation-gates/<operation>.json` reports.
- [x] Integrate `openspec:gate -- --operation prepush` into `tools/pre-push-validate.ts` without duplicating existing gates unnecessarily.
- [ ] Update Autopilot programmatic triggers to schedule cheap operation gates for relevant OpenSpec file changes when trigger mode allows observe checks.
- [x] Update skills and README to call operation gates before sensitive lifecycle operations.

## Operation-Specific Implementation Notes

- [ ] `propose`: validate `proposal.md`, `tasks.md`, spec deltas, safe id, and JSON retro task tail.
- [ ] `apply`: validate implementation readiness and route ledger-owned changes to Autopilot.
- [ ] `task-update`: validate evidence-backed checkbox updates and all-checked active-change state.
- [ ] `ledger-materialize`: validate scope, task type, validation commands, and ledger output.
- [ ] `worker-dispatch`: validate runtime ownership, capability, blockers, MR wait, dependencies, and stale state.
- [ ] `collect`: validate report/session/ledger evidence and legal transition prerequisites.
- [ ] `review`: validate reviewer/test/docs/deployment gates.
- [ ] `acceptance`: validate terminal readiness, MR/fan-in, and unresolved feedback.
- [ ] `archive`: validate JSON retro, follow-ups, freshness, no active runtime, no stale ledger, and OpenSpec validation.
- [ ] `post-archive`: validate archive result and cleanup readiness.
- [ ] `prepush`: compose repository, OpenSpec, Autopilot, freshness, stale-state, and operation-specific changed-file checks.

## Review Gates

- [ ] Run `code-quality-reviewer` for operation registry, command composition, and trigger integration.
- [ ] Run `test-coverage-reviewer` for operation coverage and negative cases.
- [ ] Run `instruction-artifact-reviewer` after skill/README/routing updates.
- [ ] Run `deployment-config-reviewer` if hook or installer behavior changes.
- [ ] Run `performance-reliability-reviewer` if operation gates become part of hot trigger paths.

## Validation

- [x] `npm run validate`
- [x] `npm test`
- [x] `npm run openspec:validate`
- [x] `npm run openspec:gate -- --operation prepush`
- [x] `npm run prepush:validate`

## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [ ] Write `openspec/changes/add-openspec-operation-gates/automation/retro.json` with evidence, problems, root causes, improvements, follow-up ids, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- add-openspec-operation-gates` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the JSON retro gate passes or an approved skip reason is recorded in `automation/retro.json`.
