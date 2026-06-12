# Tasks: Improve Autopilot Actionable Output

## Tests First

- [x] Add output contract tests for `reasonCode` on no-ledger, invalid-ledger, Ready-runtime-deferred, MR-wait, collect-deferred, and stop-no-active-state cases.
- [x] Add tests for `taskSummaries[]` actionability values.
- [x] Add tests proving `nextActions[]` avoids repeated no-progress recommendations.
- [x] Add tests proving compact output excludes full raw ledger bodies.

## Implementation

- [x] Extend Autopilot plugin output types with `reasonCode`, `taskSummaries`, `nextActions`, and `loopGuard`.
- [x] Populate reason codes from ledger discovery, validation, MR wait, blockers, collect, and stop paths.
- [x] Keep existing top-level fields while making `nextActions[]` the preferred guidance surface.
- [x] Update `/autopilot` command or skill wording only after output behavior is implemented and validated.

## Review

- [x] Run `test-coverage-reviewer` for output contract coverage.
- [x] Run `code-quality-reviewer` if plugin code changes are non-trivial.
- [x] Run `instruction-artifact-reviewer` if command or skill wording changes.

## Validation

- [x] `npm run validate`
- [x] `npm test`
- [x] `npm run autopilot:validate -- <task-ledger.json>`
- [x] `openspec validate --all`
