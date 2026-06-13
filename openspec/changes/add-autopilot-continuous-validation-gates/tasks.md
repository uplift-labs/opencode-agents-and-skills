# Tasks: Add Autopilot Continuous Validation Gates

## Tests First

- [x] Add planner tests for active change and ledger discovery, including no ledgers, one active ledger, multiple active ledgers, archived ledgers, prototype ledgers, scoped change, and scoped ledger paths. Evidence: `tools/test-autopilot-check.ts` and `tools/test-pre-push-validate.ts` cover no-ledger, active/prototype/archive discovery, scoped change, scoped ledgers, and explicit scope mismatch.
- [x] Add tests proving missing explicitly scoped ledgers fail while unscoped no-ledger runs are not-applicable instead of failing. Evidence: `missing explicitly scoped ledger fails blocking check`, `explicit scoped ledger safety failures are blocking`, and no-ledger cheap/pre-push tests passed.
- [x] Add tests for `cheap`, `standard`, `prepush`, and `final` level expansion. Evidence: `level expansion plans checkpoints and deduplicates commands` plus `npm run autopilot:check` cheap/standard/prepush/final runs passed.
- [x] Add tests proving heavy commands are deduplicated when evidence planning and pre-push planning both request the same command. Evidence: `evidence and prepush duplicate heavy commands execute once` asserts duplicate `npm test` executes once while a unique evidence command still runs.
- [x] Add tests proving pre-push includes `Autopilot ledger validation` in deterministic order when active ledgers exist. Evidence: `pre-push plan includes active Autopilot ledgers in deterministic order` passed.
- [x] Add tests proving pre-push short-circuits on invalid active ledger validation and preserves clear gate labels. Evidence: fake-runner and real-runner invalid ledger tests in `tools/test-pre-push-validate.ts` passed.
- [x] Add tests proving changed report/task/ledger artifacts trigger freshness checks at the appropriate levels. Evidence: `changed active change artifacts trigger freshness checks`, `prepush freshness is planned for changed task report and ledger artifacts`, and pre-push freshness tests passed.
- [x] Add tests proving final validation plans or runs retro follow-ups before the retro gate. Evidence: final plan order test passed; `npm run autopilot:check -- --level final --change add-autopilot-auto-parallel-claims` ran retro follow-ups before retro gate and passed.
- [x] Add JSON output contract tests for status, exit code, check ids, blocking flags, next actions, redaction, warning handling, and `--fail-on-warnings` behavior. Evidence: CLI/default JSON, blocking failure envelope, outside-path redaction, warning strictness, and command-output redaction tests passed.
- [x] Add README/instruction drift tests if new command names or Autopilot checkpoint guidance are documented. Evidence: `tools/test-autopilot-instruction-drift.ts` now asserts `autopilot:check` checkpoint wording, final-mode write authorization, and cheap advanced-only trigger guidance.

## Implementation

- [x] Add a TypeScript validation planner module that inventories active changes, active ledgers, changed files, scoped changes, scoped ledgers, and gate level. Evidence: `tools/autopilot-check.ts` added with planner inventory and tests.
- [x] Add a TypeScript CLI for Autopilot checks and expose it through `package.json` as an executable script. Evidence: `npm run autopilot:check` added and CLI JSON tests passed.
- [x] Implement `cheap` level checks with active ledger validation, no-ledger not-applicable reporting, scoped-ledger failures, and compact task/actionability summaries. Evidence: cheap check passed with active-change inventory and no-ledger `not-applicable`; scoped ledger failures are blocking.
- [x] Implement `standard` level checks with evidence-pack collect integration, advisory freshness checks, and reviewer plan surfacing. Evidence: standard scoped check runs `autopilot:evidence --mode collect` and advisory freshness; `autopilot:evidence` supplies deterministic reviewer plan evidence.
- [x] Implement `prepush` level planning with repository validation, active ledger validation, tests, OpenSpec validation, blocking freshness checks, and command deduplication. Evidence: `autopilot:check -- --level prepush` and `prepush:validate` passed with freshness gates; dedupe tests passed.
- [x] Implement `final` level planning with archive-strict freshness, retro follow-up generation, retro gate, and final reviewer/validation reconciliation. Evidence: final check on `add-autopilot-auto-parallel-claims` passed and ran retro follow-ups before retro gate.
- [x] Refactor `tools/pre-push-validate.ts` to consume the shared planner while preserving current fail-fast behavior and existing gate labels where possible. Evidence: pre-push plan now uses Autopilot ledger/freshness gates; pre-push tests preserve labels and fail-fast behavior.
- [x] Ensure the checker never writes `.autopilot/**` or `openspec/changes/*/automation/**` and never reads secrets or invokes remote-state commands. Evidence: checker only reads inventory/freshness and runs local npm/node validation commands; final writes are limited to OpenSpec retro follow-ups outside protected automation paths and documented as write-authorized only.
- [x] Ensure output is deterministic, compact, redacted by default, and usable by future plugin wrappers. Evidence: JSON contract tests cover schema, status/exit, next actions, redaction including `<outside-repo>`, and warning strictness.

## Documentation And Instruction Updates

- [x] Update README validation guidance with the new Autopilot check command, levels, and recommended trigger points. Evidence: README documents cheap/standard/prepush/final `autopilot:check` commands.
- [x] Update pre-push documentation to state that active Autopilot ledgers and relevant freshness checks are included. Evidence: README pre-push section documents active ledger validation and freshness gates.
- [x] Update `openspec-autopilot` skill guidance so agents run cheap/standard/final executable checkpoints instead of relying on prose reminders. Evidence: skill checkpoint guidance added and instruction drift test passed.
- [x] Update OpenSpec project guidance if the new final gate changes archive-readiness expectations. Evidence: README/skill now state final mode is write-authorized, not read-only, and may create retro follow-ups before retro gate.
- [x] Review relevant artifact frontmatter and README catalog if any skills, agents, or commands are added or renamed. Evidence: no skill/agent frontmatter changed; README catalog and package script validators include `autopilot:check`.

## Reviewer Gates

- [x] Run `code-quality-reviewer` for the new TypeScript planner/checker and pre-push refactor. Evidence: final recheck found no P0/P1 blockers; residual P2 only for future module split/quoting helper reuse.
- [x] Run `test-coverage-reviewer` for the validation-level, pre-push, and freshness coverage. Evidence: final recheck found no P0/P1 blockers and confirmed coverage for scoped ledger redaction, pre-push freshness, dedupe, real invalid ledger, and CLI JSON.
- [x] Run `instruction-artifact-reviewer` if README, skill, command, or instruction wording changes. Evidence: final recheck found no blockers; residual regex-hardening suggestion only.
- [x] Run `implementation-readiness-reviewer` before implementation if scope expands beyond local validation and pre-push gates. Evidence: skipped because scope stayed within the accepted local validation/pre-push gates design.

## Validation

- [x] `npm run validate` — passed with existing warning: top-level `allow` in `opencode.json` allows all tools by default.
- [x] `npm test` — passed after final runner/redaction fixes.
- [x] `npm run openspec:validate` — passed with 14 passed, 0 failed.
- [x] `npm run autopilot:check -- --level cheap` — passed with no-ledger `not-applicable`.
- [x] `npm run autopilot:check -- --level standard --change add-autopilot-continuous-validation-gates` — exited 0 with expected nonblocking freshness `unknown` because no live Autopilot report exists.
- [x] `npm run autopilot:check -- --level prepush` — exited 0 with nonblocking freshness `unknown`; blocking repository validation, tests, OpenSpec validation, and freshness commands passed.
- [x] `npm run autopilot:check -- --level final --change <completed-change-id>` when an archive-ready fixture or completed change is available. Evidence: ran with `add-autopilot-auto-parallel-claims`; exited 0 and passed retro follow-ups/retro gate.
- [x] `npm run autopilot:validate -- <task-ledger.json>` for any new or modified Autopilot ledger fixtures. N/A: no Autopilot ledger fixtures were added or modified; real-runner test invoked `npm run autopilot:validate` against a temp invalid ledger and confirmed failure propagation.

## Acceptance Criteria

- [x] A developer can run a cheap Autopilot check repeatedly without triggering the full repository test suite. Evidence: cheap check has no command execution and passed.
- [x] Pre-push fails if any active Autopilot ledger is invalid. Evidence: fake-runner and real-runner invalid ledger tests passed.
- [x] Pre-push continues cleanly when no active Autopilot ledgers exist. Evidence: pre-push no-ledger not-applicable tests and actual `prepush:validate` passed.
- [x] Final validation blocks archive-ready claims when retrospective, freshness, or follow-up gates fail. Evidence: final planning runs archive-strict freshness and retro follow-ups before retro gate; existing retro-gate failure tests cover blocker behavior.
- [x] The new checks are deterministic, TypeScript-only, and covered by tests. Evidence: TypeScript-only `tools/autopilot-check.ts` plus focused and full test suite passed.
- [x] Documentation explains when to use cheap, standard, prepush, and final levels. Evidence: README and `openspec-autopilot` skill updated; instruction drift tests passed.

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes. Evidence: `retrospective.md` reviews artifacts, validations, reviewers, Autopilot handoff, and root causes.
- [x] Write `retrospective.md` with evidence, problems, root causes, improvements, and archive gate decision. Evidence: `openspec/changes/add-autopilot-continuous-validation-gates/retrospective.md` added.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings. Evidence: no `project-local` findings remained; `npm run openspec:retro-followups -- add-autopilot-continuous-validation-gates` returned `changes: []`.
- [x] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval. Evidence: no `opencode-dev-kit` findings remained; follow-up generator returned `changes: []`.
- [x] Run `npm run openspec:retro-followups -- <change-id>` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive. Evidence: `npm run openspec:retro-followups -- add-autopilot-continuous-validation-gates` passed with `retrospectiveUpdated: false`.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded. Evidence: `npm run openspec:retro-gate -- add-autopilot-continuous-validation-gates` returned `valid: true` and `archiveAllowed: true`.
