# Traceability: Add Autopilot Intake Lock And Process E2E

## Source Evidence

| Evidence | Implication |
| --- | --- |
| `tools/autopilot-phase-dispatcher.ts` computes expected phase and evidence requirements. | Scenario e2e should assert that controller-selected transitions, not worker preference, decide the next phase. |
| `tools/autopilot-ledger.ts` validates legal transitions and transition evidence. | Process guarantees should extend existing ledger validation rather than duplicate it only in tests. |
| `tools/openspec-autopilot-controller.ts` persists run/report/session/revision evidence before worker prompts. | Fake workers can exercise the real runtime ownership path without live LLM calls. |
| `tools/test-openspec-autopilot-controller-worker-dispatch.ts` already uses fake worker adapters. | Scenario e2e can build on proven adapter seams. |
| `openspec/changes/improve-autopilot-runtime-e2e-harness` completed runtime harness scope. | New scope should focus on full process scenarios and immutable intake, not duplicate baseline runtime tests. |
| `openspec/changes/activate-autopilot-runtime-liveness` plans plugin-reachable prompt intake. | Intake lock should integrate with live intake but own locked execution semantics. |
| User context: LLM influences Autopilot only at initial task classification; later execution must be strict. | Intake lock is a first-class requirement, not documentation-only guidance. |

## Requirement Mapping

| Requirement | Tests First | Implementation | Validation |
| --- | --- | --- | --- |
| Initial Classification Is Locked Before Claim-Capable Execution | Intake-lock materialization tests | Intake ledger schema; materializer/prompt-intake integration | `node tools/test-autopilot-scenario-e2e.ts`, `npm test` |
| Worker Reports Cannot Weaken Locked Intake | Worker downgrade/weakening negative tests | Locked-contract verifier before transition writes | Scenario e2e negative gates |
| Reclassification Fails Closed | Classification mismatch tests | Reclassification blocker/runtime conflict output | `autopilot:check` when supported |
| Reviewer Outcomes Control Review Progression | Reviewer-loop tests | Reviewer result handling and review policy projection | Reviewer gate tests plus scenario e2e |
| Scenario E2E Uses Real Autopilot Runtime With Mocked LLM | Full feature scenario test | `autopilot-scenario-e2e-harness.ts` | `test:e2e`, `npm test` decision |
| Mandatory Phase Evidence Is Enforced End To End | Missing analyze/implementation/acceptance evidence tests | Phase-evidence verifier from dispatcher requirements | Ledger validation and scenario e2e |
| Artifacts And Changed Files Are Real And In Scope | Artifact/scope negative tests | Artifact/scope verifier | Scenario e2e temp-project checks |
| Bugfix Scenario Enforces Regression Evidence | Bugfix regression tests | Type-specific evidence gate integration | Bugfix scenario e2e |
| Collect Is Idempotent In Scenario E2E | Repeated collect tests | Runtime consumed-report enforcement remains authoritative | Runtime store assertions |
| Process E2E Documents Its Boundary | Documentation/drift tests | README/skill updates | `npm run validate` |

## Related Changes

| Change | Relationship |
| --- | --- |
| `activate-autopilot-runtime-liveness` | Supplies live/read-only prompt intake and runtime liveness surfaces that can feed locked intake. |
| `add-autopilot-fail-closed-write-gate` | Complements locked process by blocking main-session mutation bypass during active Autopilot ownership. |
| `require-autopilot-json-artifacts` | Governs JSON-backed automation evidence such as `automation/retro.json` for this change. |
| `improve-autopilot-runtime-e2e-harness` | Predecessor baseline for runtime harness and worker dispatch/collect behavior. |

## Open Questions

- Should legacy ledgers without `intake` be blocked from claim-capable execution immediately, or should a compatibility mode materialize deterministic intake defaults with warnings first?
- Should reclassification use a new reason code such as `reclassification_required`, or reuse `runtime_evidence_conflict` with structured blocker evidence?
- Should plugin-owned validation commands be executed during scenario e2e in this slice, or should reported validation evidence remain sufficient until a dedicated continuous-validation change owns command execution?
