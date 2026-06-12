# Retrospective: Improve Autopilot Actionable Output

## Scope And Coverage

- Change reviewed: `improve-autopilot-actionable-output`.
- Artifacts reviewed: proposal, design, spec delta, tasks, Autopilot output helper, plugin output surfaces, tests, README/skill routing, and reviewer reports.
- Archive target: stable reason-coded, compact Autopilot control output with per-task actionability and no-progress loop guard evidence.

## Completed Work Reviewed

- Added `reasonCode`, `taskSummaries`, `nextActions`, and `loopGuard` to the public output shape.
- Preserved existing top-level output fields while making `nextActions[]` the preferred guidance surface.
- Added reason-coded handling for no-ledger, invalid-ledger, Ready-runtime-deferred, MR-wait, collect-deferred, and stop-no-active-state cases.
- Added compact output tests to avoid raw ledger dumps by default.

## Validation Evidence

- `npm run validate`: passed during reviewer wave.
- `npm test`: passed during reviewer wave.
- `npm run openspec:validate`: passed during reviewer wave.
- `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json`: passed during reviewer wave.
- `git diff --check`: passed during reviewer wave.

## Reviewer Evidence

- `openspec-architecture-reviewer`: ready after validation rerun; scoped non-goals are respected.
- `test-coverage-reviewer`: ready from coverage perspective for this output-contract scope.
- `instruction-artifact-reviewer`: found one model-facing wording issue around parallel safety evidence; it was fixed in `openspec-autopilot` skill wording during the closing pass.

## Findings And Routing

- No new OpenSpec follow-up change is required for this output-contract scope.
- Runtime persistence, claim/collect idempotency, blocker-answer recording, and parallel worktree proof remain in `improve-autopilot-runtime-e2e-harness` and are intentionally not archived here.

## Residual Risks

- Live OpenCode sessions need restart/new session before command, skill, and plugin wording changes are loaded.
- Runtime mutation semantics remain intentionally governed by the active runtime harness change.

## Archive Gate Decision

- Decision: passed after final validation rerun in the closing/archive pass.
- Approved skip: none.
