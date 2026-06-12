# Tasks: Autopilot Live Regression And E2E Evaluation

## Setup

- [x] Use the current explicit `/autopilot` command session in `D:\uplift-labs\agents-and-skills` as command/plugin smoke; do not claim separate fresh-restart proof.
- [x] Confirm `OPENCODE_PURE` is unset or otherwise allows project plugins.
- [x] First substantive behavior loads `openspec-autopilot` and calls `autopilot_run_next`; capture output or blocker.
- [x] Use `live-regression-prompt.md` continuation instructions for the full regression.
- [x] Inspect `git status --short` and preserve existing user/agent changes.
- [x] Run `npm run validate` and `npm test` as baseline proof.
- [x] Run `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json`.
- [x] Run `openspec validate --all`.

## Live Smoke

- [x] Submit `/autopilot` and verify the model loads/uses `openspec-autopilot`.
- [x] Verify the first tool action is `autopilot_run_next` unless the session is blocked by missing plugin/tool availability.
- [x] Record the exact `autopilot_run_next` output shape and outcome.
- [x] Call `autopilot_status` and compare status with discovered ledgers.
- [x] Call `autopilot_collect` and verify no unsafe loop or false advancement occurs.
- [x] Exercise `autopilot_stop` on a safe target and record behavior.

## Scenario Coverage

- [x] P0 scenarios complete or blocked with evidence: command smoke, core tools, current ledger discovery, validation, durable report.
- [x] Bugfix scenario: verify reproduction/characterization-first guidance and follow-up tracking.
- [x] Research scenario: verify evidence artifact/no-product-code flow.
- [x] Small feature scenario: verify whether Autopilot is helpful or too heavy.
- [x] Large epic scenario: verify ready queue/parallel workstream handling and whether prompt-only orchestration is avoided when Autopilot should own state.
- [x] Codebase exploration scenario: verify Autopilot does not over-trigger for casual exploration.
- [x] Docs/typo scenario: verify cheap Analyze, `testDecision: not-applicable`, and reviewer skip reasons.
- [x] Tooling/config scenario: verify fixture/schema/validator expectations and deployment-config reviewer routing.
- [x] Performance/protocol-style scenario: verify benchmark/golden-test expectations and domain reviewer routing without doing fake claims.
- [x] Blocker scenario: verify returned questions have recommended options and are passed through `autopilot_answer_blocker` when a real pending question exists; no question was returned in this run.
- [x] MR wait scenario: verify MR/merge gates stop correctly without auto-merge; live MR was not required for this research ledger.
- [x] For any scenario that needs protected-path fixture creation or unimplemented plugin seeding, record a blocked scenario and create a follow-up change instead of bypassing policy.

## Findings And Follow-Up Changes

- [x] For each confirmed bug or UX friction, capture evidence, impact, recommendation, and confidence.
- [x] Default to follow-up OpenSpec changes; fix implementation/instruction/config issues immediately only after separate user approval for that fix scope.
- [x] Create one or more OpenSpec follow-up changes for remaining findings, grouped by coherent outcome or risk area; no new remaining findings required a new change in this refresh.
- [x] Ensure every follow-up change has `proposal.md` and `tasks.md`; existing follow-ups are completed/archived or active with required files.
- [x] Update `live-regression-report.md` with scenario matrix, evidence, findings, follow-up changes, validation, and residual risks.

## Final Validation And Handoff

- [x] Rerun `npm run validate`.
- [x] Rerun `npm test`.
- [x] Rerun `openspec validate --all`.
- [x] Rerun relevant `npm run autopilot:validate -- <task-ledger.json>` commands.
- [x] Run relevant reviewer gates: `instruction-artifact-reviewer`, `test-coverage-reviewer`, and `code-quality-reviewer` by signal; no deployment-config signal in this slice.
- [x] Report changed files, scenarios completed/skipped, findings fixed, follow-up changes created, validation results, residual risks, and ready-to-land status.

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, and token-heavy steps.
- [x] Write `retrospective.md` with evidence, problems, improvements, and archive gate decision.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings; none required for new findings in this refresh.
- [x] Create or update reusable `opencode-dev-kit` OpenSpec proposals/changes for Autopilot, skill, agent, instruction, validator, or evidence-pack findings; none required for new findings in this refresh.
- [x] Run `npm run openspec:retro-followups -- autopilot-live-regression` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
