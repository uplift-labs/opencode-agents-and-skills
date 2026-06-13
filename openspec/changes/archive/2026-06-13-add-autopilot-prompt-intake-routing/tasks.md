# Tasks: Add Autopilot Prompt Intake Routing

## Tests First

- [x] Add TypeScript tests for scope resolution covering empty arguments, whitespace arguments, exact `changeId`, exact `taskId`, combined exact scopes, ambiguous scopes, and free-form prompt text. Evidence: `tools/test-autopilot-prompt-intake.ts` covers empty/whitespace, exact change, bare/flagged task, task-to-change intersection-proven combined scope, ambiguous shared/duplicate/unresolved/mixed scopes, and fuzzy/free-form text; `node tools/test-autopilot-prompt-intake.ts` passed.
- [x] Add tests proving free-form prompt text is never passed to `autopilot_run_next` as `changeId` or `taskId`. Evidence: prompt-intake tests assert free-form outputs have no `runNextArgs` and `claimCapableAction === false`; unknown queue command-intake plan returns first tool `autopilot_status`.
- [x] Add tests proving free-form prompt intake does not start or advance unrelated ready queue work when existing ledgers or active changes are present. Evidence: prompt-intake tests cover present unrelated queue with `unrelatedQueuePolicy: "do_not_advance_without_scope_selection"`; ambiguous/incompatible combined scopes block without `runNextArgs`.
- [x] Add tests for bugfix, feature, research/planning, docs/typo, tooling/config, performance, protocol, and unclear prompt-family routing evidence. Evidence: prompt-intake tests cover canonical `bugfix`, `feature`, `refactor`, `research`, `planning`, `docs`, `typo`, `tooling`, `config`, `performance`, `protocol`, `unclear`, and mixed-risk prompts; instruction drift checks all `autopilotTaskTypes` labels.
- [x] Add instruction drift tests covering `/autopilot <free-form prompt>` behavior in `opencode.json`, `openspec-autopilot`, and README routing. Evidence: `tools/test-autopilot-instruction-drift.ts` now checks exact/free-form/ambiguous prompt intake, read-only `autopilot_status`, no unrelated `autopilot_run_next`, no raw prompt echo/persistence, derived fields, and canonical family labels; test passed.

## Implementation

- [x] Add a deterministic TypeScript prompt-intake helper or equivalent command/runtime contract with explicit inputs, stable outputs, exact scope matching, and no fuzzy prompt-to-change matching. Evidence: `tools/autopilot-prompt-intake.ts` implements deterministic exact matching, source-equivalent command planning, queue `unknown`/`none`/`present`, and conservative family routing; tests passed.
- [x] Wire the intake helper or contract into the `/autopilot` command path so non-empty arguments are resolved before `autopilot_run_next` is called. Evidence: `opencode.json` command template, `openspec-autopilot` skill, README, and drift tests define the prompt-command contract; OpenSpec design/spec explicitly scope this MVP to instruction-mediated command routing guarded by deterministic helper/drift tests.
- [x] Ensure claim-capable Autopilot advancement is not used for unresolved free-form prompts; use read-only status/intake evidence until a scope is selected. Evidence: `planAutopilotPromptIntake` returns first tool `autopilot_status` for unknown free-form queue state; present queue free-form prompts have no claim-capable action; docs instruct read-only status first.
- [x] Add structured next-action evidence for free-form prompts: existing exact scope, unscheduled prompt, ambiguous scope, direct small-edit handoff, `openspec-explore`, `openspec-propose`, or `openspec-apply-change`. Evidence: helper output includes `recommendedWorkflow`, optional `handoffWorkflow`, `queueState`, `queueSummary`, `unrelatedQueuePolicy`, `ambiguities`, and `nextActions` using derived fields only.
- [x] Keep active-change fallback and ledger-backed precedence unchanged for exact scopes and empty arguments. Evidence: helper resolves exact active-change/ledger queue ids without fuzzy matching; existing controller/materialization tests in `npm test` still pass.
- [x] Ensure helper/tool output avoids raw prompt persistence by default and uses derived intake fields for automation. Evidence: helper output excludes raw prompt text; tests assert serialized outputs/plans do not include raw prompt strings; docs and drift tests prohibit raw prompt echo/persistence by default.

## Documentation And Routing

- [x] Update `openspec-autopilot` skill eligibility, first-action, and escape-hatch guidance for free-form prompt intake. Evidence: `.opencode/skills/openspec-autopilot/SKILL.md` documents `/autopilot <free-form prompt>`, exact scopes, ambiguity blocking, read-only status, derived fields, no raw prompt echo/persistence, and family handoffs.
- [x] Update `/autopilot` command wording in `opencode.json` so natural-language arguments are not treated as scope ids. Evidence: `opencode.json` classifies `$ARGUMENTS`, blocks ambiguous/incompatible scopes, requires intersection evidence for combined scopes, and routes free-form prompts without passing them as `changeId`/`taskId`.
- [x] Update README Routing Map and Skill Catalog guidance to distinguish empty Autopilot, scoped Autopilot, active-change handoff, and free-form prompt handoff. Evidence: README manual command, routing map, and OpenSpec skill catalog include prompt-intake guidance and canonical family handoffs.
- [x] Review relevant artifact frontmatter and command descriptions for discoverability after wording changes. Evidence: skill frontmatter description includes `/autopilot <free-form prompt>`; bundle/instruction drift tests passed.

## Review Gates

- [x] Run `instruction-artifact-reviewer` after skill, command, or README wording changes. Evidence: final instruction-artifact re-review passed with no material findings after raw prompt, ambiguity, combined-scope, and family-label fixes.
- [x] Run `code-quality-reviewer` if TypeScript helper/control-plane changes are non-trivial. Evidence: final code-quality re-review passed with no findings; non-blocking attention-band residual noted for future growth only.
- [x] Run `test-coverage-reviewer` for prompt-intake scenario coverage before acceptance. Evidence: final test-coverage re-review passed with no material findings; optional known-empty queue oracle was added and `node tools/test-autopilot-prompt-intake.ts` passed.
- [x] Run `openspec-consistency-review` before archive because this changes Autopilot/OpenSpec lifecycle routing. Evidence: final OpenSpec consistency/archive-readiness review found only this gate-recording checkbox incomplete; after recording it, reviewer stated archive readiness should be sound if validation remains current.

## Validation

- [x] `npm run validate`. Evidence: passed on 2026-06-13 with existing warning: top-level OpenCode permission `allow` in `opencode.json`.
- [x] `npm test`. Evidence: passed on 2026-06-13, including `tools/test-autopilot-prompt-intake.ts` and instruction drift tests.
- [x] `npm run openspec:validate`. Evidence: passed on 2026-06-13 with 15 passed, 0 failed.
- [x] `openspec validate --all`. Evidence: passed on 2026-06-13 with 15 passed, 0 failed.
- [x] `npm run autopilot:validate -- <task-ledger.json>` for any new or modified Autopilot ledger fixtures, or record not-applicable when no ledger fixtures changed. Evidence: not applicable; this change did not add or modify Autopilot `automation/task.json` ledger fixtures.

## Acceptance Criteria

- [x] `/autopilot <free-form bug prompt>` routes to reproduction/exploration/proposal evidence instead of `no_ledgers` dead-end or unrelated queue advancement. Evidence: helper routes `bugfix` to `openspec-explore`, unknown queue first to `autopilot_status`, and present unrelated queue without claim-capable `runNextArgs`.
- [x] `/autopilot <free-form feature prompt>` routes to OpenSpec proposal/exploration or direct small-edit handoff according to existing workflow boundaries. Evidence: helper routes stable `feature` to `openspec-propose`; docs match.
- [x] `/autopilot <free-form research prompt>` routes to research/planning workflow and does not start product-code implementation without accepted scope. Evidence: helper routes `research`/`planning` to `openspec-explore`; no `runNextArgs` for free-form prompts.
- [x] Exact `changeId` and `taskId` behavior remains backward-compatible and covered by tests. Evidence: prompt-intake tests cover exact change and bare/flagged task; existing Autopilot controller tests still pass in `npm test`.
- [x] Existing ledger-backed and active-change fallback flows remain unchanged for empty or exact-scope invocations. Evidence: full `npm test` passed existing materialization, active-change, and ledger precedence tests after helper addition.
- [x] Command, skill, README, and tests agree on prompt-intake behavior. Evidence: instruction drift tests passed and cover command/skill/README prompt-intake contract.

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, and token-heavy steps. Evidence: `retrospective.md` includes evidence reviewed and problems found.
- [x] Write `retrospective.md` with evidence, problems, improvements, and archive gate decision. Evidence: `openspec/changes/add-autopilot-prompt-intake-routing/retrospective.md` created.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings. Evidence: no actionable project-local follow-up findings remained; material findings were fixed in scope.
- [x] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval. Evidence: reusable findings were implemented in this repository-owned change; no cross-repo handoff needed.
- [x] Run `npm run openspec:retro-followups -- add-autopilot-prompt-intake-routing` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive. Evidence: command passed with `changes: []` and `retrospectiveUpdated: false`.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded. Evidence: `npm run openspec:retro-gate -- add-autopilot-prompt-intake-routing` passed with `archiveAllowed: true`.
