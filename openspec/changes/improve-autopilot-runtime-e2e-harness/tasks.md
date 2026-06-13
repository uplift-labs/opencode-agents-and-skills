# Tasks: Improve Autopilot Runtime E2E Harness

## Tests First

- [x] Add a plugin-owned runtime harness or deterministic in-memory fixture path that does not require agents to write `.autopilot/**` or `openspec/changes/*/automation/**` manually.
- [x] Add tests proving `autopilot_run_next` handles valid Ready ledgers without ambiguous idle/no-progress UX.
- [x] Add tests proving multiple Ready ledgers select one deterministic primary task by default and emit top-level `selection` evidence for non-selected candidates.
- [x] Add tests proving explicit `taskId`/`changeId` scope affects selection without bypassing blockers, invalid ledgers, MR waits, or dependency gates.
- [x] Add tests proving `autopilot_collect` consumes plugin-owned worker reports, is idempotent across repeated calls, and advances only legal transitions.
- [x] Add tests proving `autopilot_answer_blocker` rejects unknown question IDs and accepts only pending plugin-owned blocker questions.
- [x] Add tests proving runtime evidence conflicts, including report/task-state mismatches, stop advancement and do not mutate protected state.
- [x] Add tests proving MR wait states stop without auto-merge and expose MR status/URL evidence.
- [x] Add tests proving `autopilot_stop` is non-destructive and reports whether any active runtime state was changed.
- [x] Add tests proving parallel-ready candidates are visible but not implementation-started in default serial mode.
- [x] Add tests proving guarded parallel implementation rejects overlapping or unknown write scopes and enforces the WIP limit when explicit parallel mode is enabled.

## Implementation

- [x] Define the minimal persistent or in-memory runtime state model for MVP-vNext.
- [x] Implement deterministic Ready-ledger ranking with top-level `selection` evidence for selected and non-selected candidates.
- [x] Implement default single-primary Ready-ledger claiming/advancement behavior with observable plugin-owned runtime state or explicitly downgrade claim mode to validation-only dry-run output.
- [x] Implement worker dispatch/collect placeholders or real worker report ingestion with legal transition checks and consumed-report tracking.
- [x] Implement blocker question storage and answer validation, or explicitly defer answer recording while keeping unknown-question rejection.
- [x] Implement evidence-conflict classification before claim, dispatch, collect, or transition writes, including report/task-state mismatch handling; update the public output contract if a new reason code is introduced.
- [x] Implement MR-wait detection and no-auto-merge stop behavior with explicit evidence.
- [x] Add parallel-ready queue visibility for independent task ledgers without starting extra implementation workers by default.
- [x] Add explicit guarded parallel implementation mode only after dependency checks, conservative write-scope overlap checks, runtime locks, isolated branch/worktree naming, and `maxImplementationClaims` enforcement exist.
- [x] Update public output contract and contract-validation fixtures if selection evidence or parallel-decision fields are added.

## Documentation And Review

- [x] Update Autopilot skill/README routing only after runtime behavior changes are implemented.
- [x] Run `instruction-artifact-reviewer` if skill/README wording changes.
- [x] Run `test-coverage-reviewer` for runtime behavior and regression coverage.
- [x] Run `code-quality-reviewer` for non-trivial plugin/runtime code changes.

## Validation

- [x] `npm run validate`
- [x] `npm test`
- [x] `npm run autopilot:validate -- <task-ledger.json>`
- [x] `openspec validate --all`

## Archive Blockers From Reviewer Wave

- [x] Add claim -> status/stop continuity tests or revise output wording so `advanced`/`tasksStarted` cannot imply persisted plugin-owned state when no active claim is observable.
- [x] Add repeated collect tests proving worker reports are consumed or reported as already handled, not advanced repeatedly.
- [x] Harden parallel implementation guard evidence for worktree/lock ownership or rescope current behavior as deterministic harness simulation only.
- [x] Reconcile blocker-answer design with implementation: either record accepted answers in plugin-owned state or document validation-only accepted answers as deferred persistence.
- [x] Re-run relevant reviewer gates after runtime scope is fixed or formally downgraded.

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [x] Write `retrospective.md` with evidence, problems, root causes, improvements, and archive gate decision.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings; none required after fixed findings.
- [x] Create or update reusable `opencode-dev-kit` OpenSpec proposals/changes for Autopilot, skill, agent, instruction, validator, or evidence-pack findings; none required after fixed findings.
- [x] Run `npm run openspec:retro-followups -- improve-autopilot-runtime-e2e-harness`; no additional follow-up changes were required after fixed findings.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
