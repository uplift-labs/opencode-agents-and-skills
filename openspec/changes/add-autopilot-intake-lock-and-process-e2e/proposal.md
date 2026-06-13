# Proposal: Add Autopilot Intake Lock And Process E2E

## Why

Autopilot has unit and runtime/controller tests for ledger validation, worker dispatch, report parsing, protected ledger writes, and runtime ownership. Those tests prove important pieces, but they do not yet prove the central process invariant: after initial intake, the model must not be able to simplify the task, skip required phases, weaken review gates, or bypass the Autopilot state machine.

The intended control model is that the LLM participates once at the beginning by classifying the task family, size, risk, and required process. After that, Autopilot owns the task contract. Worker sessions may produce evidence and artifacts, but they do not choose the task type, downgrade the process, or decide which gates are optional.

This change adds two durable capabilities:

- An immutable intake lock that records the initial task classification and required gates in the task ledger.
- Scenario-level e2e tests that simulate real project work with mocked LLM/worker output while exercising the real Autopilot controller, runtime store, worker report parser, transition writer, ledger validator, and artifact/scope checks.

## What Changes

- Add a ledger-backed `intake` contract recording task type, task caliber, risk class, required gates, phase profile, review policy, and classification evidence.
- Treat the intake contract as locked after materialization or first claim-capable Autopilot action.
- Reject worker reports that attempt to downgrade `taskType`, reduce caliber/risk, weaken `phaseProfile`, weaken `reviewPolicy`, remove required gates, or skip mandatory artifacts.
- Add an explicit reclassification path that blocks for user/process approval instead of allowing a worker to mutate classification during execution.
- Add deterministic process e2e harness coverage using temp mini-projects and scripted fake worker sessions, with no live LLM/provider calls.
- Prove representative `feature` and `bugfix` flows, negative evidence gates, reviewer-loop behavior, MR wait/no-auto-merge behavior, idempotent collect, and scope/artifact enforcement.

## Goals

- Prove the only LLM-owned decision point is initial intake/classification.
- Prove all later transitions are controlled by Autopilot state, ledger validation, runtime ownership, worker report identity, reviewer gates, and acceptance policy.
- Prove workers cannot legally simplify a task after the intake lock is created.
- Make e2e validation fast, deterministic, local, provider-free, and token-free.
- Keep reusable enforcement in production helpers, not only in test code.

## Non-Goals

- Do not judge the quality, correctness, or creativity of LLM-generated artifacts.
- Do not add real provider, network, GitHub/GitLab, or Desktop restart e2e tests in this slice.
- Do not enable automatic merge, push, deploy, force-push, or destructive cleanup.
- Do not let tests normalize manual writes to `.autopilot/**` or `openspec/changes/*/automation/**` in the user repository.
- Do not replace existing prompt-intake routing, worker dispatch, or write-gate changes; this change layers process guarantees on top of them.

## Source Evidence

- `tools/autopilot-ledger.ts` already validates legal status transitions and many transition evidence fields.
- `tools/autopilot-phase-dispatcher.ts` already derives the next expected phase and required evidence from task type and current status.
- `tools/openspec-autopilot-controller.ts` already records expected `fromStatus`, `toStatus`, worker identity, report id, ledger path, and ledger revision before dispatch.
- `tools/autopilot-worker-report-parser.ts` and `tools/autopilot-ledger-transition-writer.ts` already reject mismatched report/run identity and stale protected ledger writes.
- `tools/test-openspec-autopilot-controller-worker-dispatch.ts` already proves fake worker dispatch/collect can run without live LLM calls.
- `openspec/changes/improve-autopilot-runtime-e2e-harness` established the runtime harness baseline, but it does not yet prove full real-project process scenarios or immutable intake classification.
- `openspec/changes/activate-autopilot-runtime-liveness` is wiring prompt intake and live runtime surfaces; this change depends on that direction but owns the stricter locked-contract/e2e guarantees.

## Impact

- Autopilot task ledgers gain a stricter process contract that may invalidate previously accepted but under-specified ledgers until migrated or materialized with defaults.
- Worker reports that previously advanced with minimal evidence may fail closed when required intake or phase evidence is missing.
- Scenario e2e tests add a higher-confidence regression gate for process behavior without spending model tokens.
- Future changes can build on the locked contract for safer live autonomy, write gating, and archive readiness.

## Validation

- Add focused failing tests before implementation for intake lock, full feature e2e, bugfix gate enforcement, worker downgrade rejection, missing evidence rejection, reviewer loop, artifact/scope checks, MR wait, and collect idempotency.
- Run `node tools/test-autopilot-scenario-e2e.ts`.
- Run `npm test`.
- Run `npm run validate`.
- Run `npm run openspec:validate`.
- Run `npm run autopilot:check -- --level standard --change add-autopilot-intake-lock-and-process-e2e` when ledger/check support exists.
- Run `test-coverage-reviewer` and `code-quality-reviewer` after non-trivial implementation.
