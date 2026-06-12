# Tasks: Tighten Autopilot Ledger Type Gates

## Tests First

- [x] Add invalid bugfix fixture that lacks reproduction/characterization evidence and must fail.
- [x] Add valid bugfix fixture with reproduction or characterization evidence.
- [x] Add invalid tooling fixture that lacks fixture/schema/validator gate evidence and must fail.
- [x] Add invalid config fixture that lacks fixture/schema/validator gate evidence and must fail.
- [x] Add valid tooling/config fixtures with deterministic gate evidence.
- [x] Add invalid performance fixture that lacks benchmark/profile evidence and must fail.
- [x] Add valid performance fixture with benchmark/profile evidence or explicit infeasible reason.
- [x] Add invalid protocol fixture that lacks golden/negative protocol evidence and must fail.
- [x] Add valid protocol fixture with golden/negative evidence or explicit infeasible reason.

## Implementation

- [x] Extend `tools/autopilot-ledger.ts` with task-type-specific evidence checks.
- [x] Keep evidence fields deterministic and explicit; do not infer from free-form prose alone when a structured field is practical.
- [x] Update fixture docs or examples if new structured fields are introduced.
- [x] Ensure reviewer routing remains explicit for all affected task types.

## Review

- [x] Run `test-coverage-reviewer` for the validator fixture matrix.
- [x] Run `code-quality-reviewer` for non-trivial validator changes.
- [x] Skip `deployment-config-reviewer`; config runtime semantics did not change materially beyond the ledger evidence gate.

## Validation

- [x] `npm run validate`
- [x] `npm test`
- [x] `npm run autopilot:validate -- <new-or-updated-ledger-fixtures>`
- [x] `openspec validate --all`

## Consistency Before Archive

- [x] Reconcile this checklist with current source, fixture, and test evidence before archive; mark completed items only with direct evidence.
- [x] Confirmed pre-existing tests did not cover these task-type gates; validation evidence now comes from the new focused fixtures and probes.
- [x] Recorded explicit manual consistency review; the freshness/consistency helper now exists, and final archive validation confirmed this change remains reconciled.
