# Design: Add Autopilot Intake Lock And Process E2E

## Control Model

Autopilot has two decision layers:

1. Intake classification: the model or deterministic prompt-intake path classifies the task family, caliber, risk, and required process.
2. Locked execution: Autopilot owns every later phase, transition, evidence gate, reviewer loop, runtime claim, and acceptance rule.

The model may propose initial classification, but once a task ledger is materialized or first claimed, the classification becomes immutable execution contract. Worker sessions can only provide evidence and artifacts for the current expected phase.

## Intake Contract

Add a ledger field equivalent to:

```json
{
  "intake": {
    "schemaVersion": 1,
    "locked": true,
    "source": "llm-initial-classification",
    "classifiedAt": "2026-06-13T00:00:00.000Z",
    "classifiedBy": "autopilot_intake",
    "taskType": "feature",
    "taskCaliber": "medium",
    "riskClass": "standard",
    "requiredGates": ["analyze", "test-first", "implementation", "review", "acceptance"],
    "requiredArtifacts": ["plan", "changedFiles", "validation", "reviewerDecision", "acceptanceEvidence"],
    "classificationEvidence": {
      "summary": "User asked for behavior-changing product functionality requiring tests and review."
    }
  }
}
```

`taskType`, `phaseProfile`, `reviewPolicy`, `testDecision`, `validation.commands`, `scope`, and `mr.required` remain the canonical execution fields. `intake` is the audit/immutability anchor that explains why those fields exist and which parts must not be weakened.

## Locked Fields

After `intake.locked === true`, workers and normal collect/report flows must not weaken these fields:

- `taskType`
- `intake.taskCaliber`
- `intake.riskClass`
- `intake.requiredGates`
- `intake.requiredArtifacts`
- `phaseProfile`
- `reviewPolicy.required`
- `testDecision.decision`
- `validation.commands`
- `mr.required`
- `scope.write` and `scope.forbidden`

Allowed changes are append-only or evidence-producing changes that do not weaken the process, such as adding phase evidence, appending history, recording reviewer decisions, incrementing revision, recording blockers, or updating MR status.

## Reclassification

If later evidence shows the initial classification is too weak or wrong, Autopilot must fail closed:

- It may report a `reclassification_required` blocker or equivalent runtime evidence conflict.
- It may recommend creating or updating an OpenSpec change through an explicit intake/reclassification path.
- It must not let a worker self-downgrade the task during `collect`.
- It must not silently reduce gates to fit the worker report.

Escalation to stricter gates may be allowed only through plugin-owned or user-approved reclassification that records audit history. Downgrade requires the same explicit approval path and must not be inferred from worker prose.

## Worker Report Contract

Worker reports remain evidence envelopes, not task contracts. A report may include context, changed files, validation, reviewer output, blockers, MR evidence, and phase-specific evidence. It must not be authoritative for classification, gate weakening, or next-phase selection.

Before protected ledger mutation, collect should validate:

- report identity matches the active runtime claim;
- `fromStatus` and `toStatus` match the controller-selected transition;
- required evidence for the selected phase is present;
- reported artifacts and changed files exist, are relative to the project root, and stay inside declared `scope.write` when they are writes;
- no reported file is inside `scope.forbidden`, `.autopilot/**`, or `openspec/changes/*/automation/**`;
- locked intake fields are unchanged or only strengthened by an approved reclassification path.

## Process E2E Harness

The scenario harness should run in a temp project outside the repository under test. It should use:

- a tiny generated project fixture, such as a TypeScript module and a small test command;
- real `createAutopilotController`;
- real in-memory or file runtime store;
- real ledger files under the temp project;
- a scripted `AutopilotWorkerSessionAdapter` that records prompts, mutates temp project files only when the phase script says so, and returns strict worker report envelopes;
- real `autopilot_run_next`, `autopilot_collect`, `autopilot_status`, `autopilot_stop`, and blocker/reviewer paths where applicable.

The harness must not call a live provider, spend model tokens, or depend on external services.

## Full Feature Scenario

The first happy-path scenario should prove:

1. Initial intake locks `taskType=feature`, caliber, risk, gates, review policy, and required artifacts.
2. `Ready -> Analyze` accepts only plan/test/scope evidence and records it for later phases.
3. `Analyze -> Implementation` uses the locked plan and does not let the worker skip implementation.
4. `Implementation -> Review` requires changed files or no-op reason, validation evidence, test decision, secret-scan placeholder, and artifact/scope safety.
5. `Review -> Acceptance` requires reviewer decisions or explicit reviewer skip reasons, and required reviewers must pass.
6. Reviewer `needs-work` returns to `Implementation` and prevents `Acceptance`.
7. `Acceptance -> Done` requires MR merged evidence for file-changing work or an explicit no-MR policy only where allowed by task type.
8. Repeated `collect` cannot apply the same report twice.

## Bugfix Scenario

Bugfix e2e should prove type-specific evidence gates:

- `Analyze -> Implementation` requires reproduction, characterization, regression test, or accepted infeasible reason.
- A worker cannot reclassify a bugfix as a typo to use minimal analysis.
- Regression evidence must be present before implementation/review progression.

## Reviewer Loop

Reviewer output is part of the strict process. A reviewer result such as `needs-work` or `failed` must prevent `Review -> Acceptance` and route the task back to `Implementation` or `Blocked` with evidence. Only `passed` or `approved` decisions, or explicit skip reasons allowed by policy, can move to `Acceptance`.

## Compatibility

- Existing ledgers without `intake` may require migration, materializer defaults, or compatibility diagnostics before this change can be strict by default.
- Runtime output shapes should reuse existing `runtime_evidence_conflict` where possible; add a new reason code only if contract tests require distinct handling.
- This change should integrate with `activate-autopilot-runtime-liveness` when prompt intake becomes plugin-reachable.
- This change should integrate with `add-autopilot-fail-closed-write-gate` so active locked runs cannot be bypassed by main-session edits.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Harness overfits scripted happy path | False confidence | Add negative twin scenarios for every mandatory gate. |
| Locked contract breaks legacy ledgers | Autopilot queue stalls | Add migration/default diagnostics and phase in strictness. |
| Evidence checks live only in tests | Production bypass remains | Put checks in shared controller/writer helpers, then assert through e2e. |
| Artifact existence checks are too broad | Flaky tests or project-specific assumptions | Start with temp-project relative paths and scope checks only. |
| Reclassification path becomes a downgrade escape hatch | Gates become optional again | Require explicit blocker/user approval and audit history for all reclassification. |

## Rollout

1. Add e2e harness and failing full-feature/intake-lock tests.
2. Add intake schema/validation with compatibility diagnostics.
3. Add locked-field weakening detection around collect/transition writes.
4. Add phase evidence requirement helper and artifact/scope verifier.
5. Add reviewer-loop and bugfix negative scenarios.
6. Update docs, drift tests, and validation scripts.
7. Run reviewer gates and final validation.
