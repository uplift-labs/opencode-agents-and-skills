# retro-enable-autopilot-worker-dispatch-01-worker-dispatch-option-diagnostics-remain-a-reus Specification

## ADDED Requirements

### Requirement: Retrospective Finding Follow-Up Is Scoped

This follow-up SHALL resolve, validate, or explicitly reject the retrospective finding generated from `enable-autopilot-worker-dispatch` without expanding beyond the recorded root cause and recommendation unless a separate OpenSpec decision broadens scope.

#### Scenario: Finding is reassessed before implementation

- **GIVEN** the follow-up change is selected for implementation
- **WHEN** the implementer starts work on the generated finding
- **THEN** they review the original problem, evidence, impact, root cause, recommendation, confidence, and target
- **AND** the follow-up preserves root cause: Deployment review identified live-enable diagnostics as intentionally deferred beyond the serial dispatch implementation slice
- **AND** they either implement the smallest valid slice for: Tighten `workerDispatch` option diagnostics and live-enable preflight evidence before recommending target deployment
- **OR** record evidence that the finding is no longer current before closing the change.
