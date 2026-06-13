# Retrospective: improve-autopilot-runtime-e2e-harness

## Evidence Reviewed

- OpenSpec artifacts: design, runtime spec, tasks, runtime/output helper tests.
- Tool outputs / validation: `npm run validate:strict`, `npm test`, `openspec validate --all`, and `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json` passed on 2026-06-12.
- Reviewer gates: `code-quality-reviewer`, `test-coverage-reviewer`, `instruction-artifact-reviewer`, and targeted coverage recheck passed after fixes.
- Autopilot/runtime events: plugin runtime selection was unavailable through MVP dispatch, so the task proceeded through deterministic helper tests without manual protected-state mutation.

## Problems Found

| Problem | Evidence | Impact | Root Cause | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- | --- |
| Parallel guard missed task-specific forbidden scopes | Coverage review found only write-write overlap was checked | Explicit parallel implementation could start unsafe concurrent tasks | Parallel compatibility checking considered write-write conflicts before task-specific forbidden scopes were propagated | Propagate `scope.forbidden` into ledger summaries and enforce write-vs-forbidden compatibility with a regression test | high | none |
| Claim continuity needed observable runtime state | Reviewer wave found claim output could imply persisted active state without stop continuity evidence | Stop/status behavior could mislead users | Claim output lacked a persisted state-continuity contract linking claim, stop, and status evidence | Add claim to stop continuity tests and plugin-owned active runtime evidence | high | none |
| Collect idempotency needed stronger proof | Reviewer wave found repeated collect could be ambiguous | Worker reports could appear advanced more than once | Report consumption state was not tracked as durable idempotency evidence | Track consumed report ids and test repeated collect behavior | high | none |

## Outputs

- Project follow-up changes: none; findings were fixed in this change.
- `opencode-dev-kit` proposals/changes: none; findings were fixed in this change.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Evidence reviewed, runtime safety findings fixed, reviewer rechecks clean, and validation passed.
- Approver, if skipped: none
