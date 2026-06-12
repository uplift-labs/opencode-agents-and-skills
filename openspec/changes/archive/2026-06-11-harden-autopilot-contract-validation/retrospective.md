# Retrospective: Harden Autopilot Contract Validation

## Scope And Coverage

- Change reviewed: `harden-autopilot-contract-validation`.
- Artifacts reviewed: proposal, design, spec, tasks, changed TypeScript helpers/tests, Autopilot plugin, `openspec-autopilot` skill, README, `opencode.json`, validation output, and reviewer reports.
- Session coverage: current implementation session evidence only; no historical transcript archive mining was required for this change-specific archive gate.

## Completed Work Reviewed

- Added shared public Autopilot contract values in `tools/autopilot-contract.ts` and drift checks against ledger/output/plugin surfaces.
- Added plugin-server execution coverage for every public `autopilot_*` tool.
- Added plugin tool arg-schema key checks so direct `execute(args)` tests do not bypass model-facing schema drift.
- Added sanitized `metadata.argumentContext` for MVP no-op `autopilot_answer_blocker` and `autopilot_stop` without echoing ignored argument values.
- Added instruction drift checks for primary output fields, fallback semantics, no-op metadata wording, and public value lists in `openspec-autopilot` skill guidance.
- Added `openspec:validate`, structural validation for documented Autopilot/OpenSpec scripts, fake-runner pre-push coverage, freshness helper/tests, and source-equivalent bundle smoke.
- Updated README validation/manual Autopilot sections and `/autopilot` command routing after executable checks existed.

## Validation Evidence

- `node tools/test-autopilot-contract.ts`: passed, 7 tests.
- `node tools/test-autopilot-instruction-drift.ts`: passed, 7 tests.
- `npm test`: passed.
- `npm run validate`: passed with `skills=34 agents=12 markdown=104 warnings=0` after adding archive/retrospective artifacts.
- `npm run openspec:validate`: passed, 8 OpenSpec items.
- `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json`: passed with `valid: true`.
- `npm run prepush:validate`: passed.
- `git diff --check`: passed with no output.

## Reviewer Evidence

- `instruction-artifact-reviewer`: initial README/manual sync clean; later no-op metadata wording clean after tuning.
- `test-coverage-reviewer`: initially found missing instruction public-value drift coverage and plugin arg-schema key coverage; both were fixed and re-reviewed clean.
- `code-quality-reviewer`: initially found brittle ignored-value literals, broad drift matching, and LF-only markdown parsing; all were fixed and re-reviewed clean.
- `openspec-consistency-review`: pre-archive review found model-facing Autopilot wording that still sounded like live dispatch/MR-sync/parallel mutation behavior; wording and this retrospective evidence were updated before archive retry.

## Findings And Improvements

1. Finding: Reviewer gates caught material gaps after the first green validation pass.
   Evidence: test coverage review identified missing instruction-surface public-value drift checks and plugin arg-schema key checks.
   Improvement applied: added deterministic checks in `tools/test-autopilot-instruction-drift.ts` and `tools/test-autopilot-contract.ts`.

2. Finding: Repeated full validation and reviewer waves were token-heavy but useful for this high-contract-risk change.
   Evidence: full gates were rerun after README sync, no-op metadata, coverage fixes, and test-hardening edits.
   Improvement routing: broader generated evidence aggregation remains covered by `add-autopilot-evidence-pack-workflow` and the retro gate automation remains covered by `require-openspec-change-retro-gate`.

3. Finding: Live OpenCode restart/loader behavior remains outside this source-equivalent smoke boundary.
   Evidence: README explicitly says bundle smoke does not prove live OpenCode restart or external target dependency installation.
   Improvement routing: live runtime and loader-style E2E belongs to `improve-autopilot-runtime-e2e-harness`; no new follow-up change is needed here.

4. Finding: Current Autopilot runtime remains MVP/no-op for blocker answer, stop, worker dispatch, MR sync, and ledger mutation.
   Evidence: plugin output uses `ready_runtime_deferred`, `collect_deferred`, `stop_no_active_state`, and `metadata.argumentContext.mutation: "none"`.
   Improvement routing: runtime expansion belongs to `improve-autopilot-runtime-e2e-harness`; this change intentionally hardened the public contract only.

5. Finding: Pre-archive consistency review caught model-facing wording that overclaimed deferred runtime behavior.
   Evidence: skill/README routing mentioned safe parallel work and current claim/dispatch/MR-sync semantics while source remained read-only/no-op.
   Improvement applied: updated `openspec-autopilot` skill and README routing to describe current inspect/classify/deferred behavior and route runtime mutation to future runtime slices.

## Finding Routing

- No new OpenSpec follow-up changes were created.
- Existing follow-up coverage is sufficient:
  - `improve-autopilot-runtime-e2e-harness` for live runtime state, loader-style E2E, blocker persistence, MR wait/sync, stop behavior, and parallel queue behavior.
  - `add-autopilot-evidence-pack-workflow` for richer generated evidence packs and retrospective-ready sections.
  - `require-openspec-change-retro-gate` for reusable archive-retro validation and policy integration.

## Residual Risks

- `opencode.json`, skill, and plugin changes require an OpenCode restart before the running app/session uses the new command/template/plugin wording.
- Bundle smoke remains source-equivalent, not a live OpenCode restart/loader E2E proof. This is documented and accepted for this change's scope.
- Runtime mutation semantics remain intentionally deferred to a separate OpenSpec change.

## Archive Gate Decision

- Decision: passed.
- Reason: all scoped implementation, documentation, validation, and reviewer tasks have executable evidence; residual risks are documented and routed to existing OpenSpec changes.
- Approved skip: none.
