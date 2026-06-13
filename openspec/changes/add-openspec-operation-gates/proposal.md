# Proposal: Add OpenSpec Operation Gates

## Why

OpenSpec work currently has several strong validators, but they are not organized as a single lifecycle gate system. Archive has a retrospective gate, pre-push has repository/OpenSpec/Autopilot checks, and Autopilot ledgers have validators. Other operations such as proposal creation, task updates, ledger materialization, worker dispatch, collect, review, acceptance, archive, and post-archive cleanup rely on a mix of skills, prose, manual discipline, and operation-specific scripts.

The result is uneven trigger coverage: some OpenSpec operations are machine-checked, while others can proceed without proving required evidence. Autopilot needs a deterministic operation-gate layer that can be called by agents, CLI scripts, pre-push hooks, and programmatic triggers before sensitive lifecycle transitions.

## What Changes

- Add a deterministic `openspec-operation-gate` helper with a stable JSON output contract.
- Add `npm run openspec:gate -- --operation <operation> --change <change-id>`.
- Define gate checks for proposal, apply, task update, ledger materialization, worker dispatch, collect, review, acceptance, archive, post-archive, and pre-push operations.
- Write operation-gate reports as JSON under `openspec/changes/<change>/automation/operation-gates/<operation>.json` when persistence is requested.
- Integrate operation gates with pre-push validation and Autopilot trigger scheduling where safe.
- Keep passive triggers read-only unless plugin-owned runtime evidence allows controlled or autonomous actions.

## Depends On

- `require-autopilot-json-artifacts`: operation-gate reports and retrospectives must be JSON-backed. This change can start with internal JSON output, but archive/retro gates should align with `automation/retro.json` before full acceptance.

## Goals

- Make every important OpenSpec lifecycle operation have an explicit machine-checkable gate.
- Give Autopilot a single operation registry instead of scattered ad-hoc checks.
- Make gate outcomes stable, deterministic, redacted, and safe for plugin/agent consumption.
- Prevent archive, worker dispatch, collect, acceptance, and post-archive cleanup from proceeding with missing evidence.
- Keep operation gates composable with existing validators such as `openspec validate --all`, `autopilot:validate`, `autopilot:check`, and retro gates.

## Non-Goals

- Do not replace the OpenSpec CLI validator.
- Do not auto-fix failing gates unless a separate operation explicitly owns a safe mutation.
- Do not make passive file events claim work or dispatch workers by default.
- Do not merge, push, deploy, archive, or clean worktrees as a side effect of a gate check.
- Do not use model judgment to decide gate pass/fail; gates use explicit files, JSON schemas, commands, and known status values.

## Operations

- `propose`: validates new change shape, safe id, required docs, spec deltas, and JSON retro task tail.
- `apply`: validates accepted/safe implementation readiness, TDD plan, blockers, and Autopilot ledger handoff conditions.
- `task-update`: validates task checkbox/evidence changes and prevents completed active changes from silently remaining unarchived or stale.
- `ledger-materialize`: validates active change, unchecked tasks, scope safety, validation commands, and post-materialization ledger validity.
- `worker-dispatch`: validates worker-dispatch option, session capability, runtime store, dependencies, blockers, MR wait, scope, and stale-ledger state.
- `collect`: validates plugin-owned worker report evidence, expected report id, ledger freshness, legal transition, and idempotency.
- `review`: validates required reviewer gates, test coverage, code quality, docs/spec sync, and deployment/config reviewers when applicable.
- `acceptance`: validates terminal readiness, MR policy, fan-in evidence, docs/spec sync, and no unresolved blockers.
- `archive`: validates completed tasks, JSON retro, follow-up changes, freshness, OpenSpec validation, and no active runtime/ledger references.
- `post-archive`: validates moved archive state, no active ledgers/runs for archived change, follow-up changes still valid, and docs updated when needed.
- `prepush`: composes repository validation, OpenSpec validation, active ledger validation, freshness, operation-specific checks for changed files, and stale-state detection.

## Impact

- Agents get a single command to ask whether an OpenSpec operation is safe.
- Autopilot triggers can schedule cheap/status gates without inventing operation-specific logic.
- Archive and pre-push become stricter and less dependent on prose.
- Operation-gate JSON reports become durable evidence for retrospectives and future audits.

## Validation

- Add fixtures for each operation gate.
- Add negative tests for missing evidence and unsafe transitions.
- Run `npm run validate`.
- Run `npm test`.
- Run `npm run openspec:validate`.
- Run `npm run openspec:gate -- --operation prepush`.
- Run `npm run prepush:validate`.
