# Tasks: Require OpenSpec Change Retrospective Gate

## OpenSpec Design

- [x] Confirm the retrospective gate scope covers mandatory archive gating, final task-list retro, evidence review, token/workflow analysis, finding routing, `opencode-dev-kit` proposal flow, and deterministic helper design.
- [x] Validate the OpenSpec change with `openspec validate --all`.

## Tests First For Future Implementation

- [x] Add focused tests or fixtures proving new `tasks.md` templates include a final retrospective section.
- [x] Add tests for a future `openspec:retro-gate` helper that fail when `retrospective.md` is missing.
- [x] Add tests for approved skip handling with reason and approver.
- [x] Add tests for project-local finding routing and `opencode-dev-kit` finding routing.
- [x] Add tests that Autopilot no-progress, runtime-deferred, stale-evidence, and routing/escape-hatch friction are captured as retrospective evidence when present.
- [x] Add tests for concise `No findings` retrospectives.
- [x] Add tests proving actionable retrospective findings create follow-up OpenSpec changes and update `retrospective.md` outputs.

## Future Implementation

- [x] Update `openspec-archive-change` so archive is blocked until the retrospective gate passes or an approved skip is recorded.
- [x] Update `openspec-propose` so every new `tasks.md` includes a final retrospective section.
- [x] Update `openspec-apply-change` so completed changes hand off to retrospective before archive.
- [x] Update `openspec-autopilot` so acceptance/archive flow treats missing retro as a blocker and asks only returned blocker questions.
- [x] Update `next-step` so completed-but-not-retroed OpenSpec changes appear as available work.
- [x] Add `retrospective.md` template guidance to OpenSpec documentation or README after implementation is ready.
- [x] Add the deterministic TypeScript retro-gate helper and package script if test coverage proves the contract.
- [x] Add the deterministic TypeScript retro-followups helper and package script so actionable findings create or reuse OpenSpec follow-up changes before archive.
- [x] Integrate retrospective evidence sections into the future Autopilot evidence-pack workflow.
- [x] Integrate Autopilot routing/escape-hatch outcomes into retrospective templates and evidence-pack generated sections.

## Apply To Existing Active Changes

- [x] Add final retrospective tasks to existing active OpenSpec changes when implementation of this gate is approved.
- [x] Before archiving completed currently active changes, write `retrospective.md` and route findings according to this policy; live regression remains blocked before archive.

## Review Gates For Future Implementation

- [x] Run `instruction-artifact-reviewer` for skill, template, README, or instruction changes.
- [x] Run `test-coverage-reviewer` for helper/template validation coverage.
- [x] Run `code-quality-reviewer` for non-trivial TypeScript helper changes.
- [x] Run `openspec-consistency-review` before archive because this changes OpenSpec lifecycle policy.

## Validation

- [x] `npm run validate:strict`
- [x] `npm test`
- [x] `openspec validate --all`
- [x] `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json` when an Autopilot ledger is in scope.

## Retrospective Before Archive

- [x] Review the completed work on this retrospective-gate change, including validation, reviewer gates, repeated operations, wait time, token-heavy steps, and likely root causes.
- [x] Write `retrospective.md` for this change with evidence, problems, improvement ideas, and archive gate decision.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings; none required after fixed findings.
- [x] Create or update reusable `opencode-dev-kit` OpenSpec proposals/changes for Autopilot, skill, agent, instruction, validator, or evidence-pack findings; none required after fixed findings.
- [x] Run `npm run openspec:retro-followups -- require-openspec-change-retro-gate`; no additional follow-up changes were required after fixed findings.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
