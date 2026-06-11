# Tasks: Autopilot Live Regression And E2E Evaluation

## Setup

- [ ] Restart OpenCode in `D:\uplift-labs\agents-and-skills` so command, skill, and plugin files are reloaded.
- [ ] Confirm `OPENCODE_PURE` is unset or otherwise allows project plugins.
- [ ] First user turn is exactly `/autopilot`; capture whether the first substantive behavior calls `autopilot_run_next` or reports a tool/plugin blocker.
- [ ] Second user turn uses `live-regression-prompt.md` continuation instructions for the full regression.
- [ ] Inspect `git status --short` and preserve existing user/agent changes.
- [ ] Run `npm run validate` and `npm test` as baseline proof.
- [ ] Run `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json`.
- [ ] Run `openspec validate --all`.

## Live Smoke

- [ ] Submit `/autopilot` and verify the model loads/uses `openspec-autopilot`.
- [ ] Verify the first tool action is `autopilot_run_next` unless the session is blocked by missing plugin/tool availability.
- [ ] Record the exact `autopilot_run_next` output shape and outcome.
- [ ] Call `autopilot_status` and compare status with discovered ledgers.
- [ ] Call `autopilot_collect` and verify no unsafe loop or false advancement occurs.
- [ ] Exercise `autopilot_stop` on a safe target and record behavior.

## Scenario Coverage

- [ ] P0 scenarios complete or blocked with evidence: command smoke, core tools, current ledger discovery, validation, durable report.
- [ ] Bugfix scenario: verify reproduction/characterization-first guidance and follow-up tracking.
- [ ] Research scenario: verify evidence artifact/no-product-code flow.
- [ ] Small feature scenario: verify whether Autopilot is helpful or too heavy.
- [ ] Large epic scenario: verify ready queue/parallel workstream handling and whether prompt-only orchestration is avoided when Autopilot should own state.
- [ ] Codebase exploration scenario: verify Autopilot does not over-trigger for casual exploration.
- [ ] Docs/typo scenario: verify cheap Analyze, `testDecision: not-applicable`, and reviewer skip reasons.
- [ ] Tooling/config scenario: verify fixture/schema/validator expectations and deployment-config reviewer routing.
- [ ] Performance/protocol-style scenario: verify benchmark/golden-test expectations and domain reviewer routing without doing fake claims.
- [ ] Blocker scenario: verify returned questions have recommended options and are passed through `autopilot_answer_blocker`.
- [ ] MR wait scenario: verify MR/merge gates stop correctly without auto-merge.
- [ ] For any scenario that needs protected-path fixture creation or unimplemented plugin seeding, record a blocked scenario and create a follow-up change instead of bypassing policy.

## Findings And Follow-Up Changes

- [ ] For each confirmed bug or UX friction, capture evidence, impact, recommendation, and confidence.
- [ ] Default to follow-up OpenSpec changes; fix implementation/instruction/config issues immediately only after separate user approval for that fix scope.
- [ ] Create one or more OpenSpec follow-up changes for remaining findings, grouped by coherent outcome or risk area.
- [ ] Ensure every follow-up change has `proposal.md` and `tasks.md`; add `design.md` or specs only when normative behavior needs it.
- [ ] Update `live-regression-report.md` with scenario matrix, evidence, findings, follow-up changes, validation, and residual risks.

## Final Validation And Handoff

- [ ] Rerun `npm run validate`.
- [ ] Rerun `npm test`.
- [ ] Rerun `openspec validate --all`.
- [ ] Rerun relevant `npm run autopilot:validate -- <task-ledger.json>` commands.
- [ ] Run relevant reviewer gates: `instruction-artifact-reviewer`, `test-coverage-reviewer`, `code-quality-reviewer`, and `deployment-config-reviewer` by signal.
- [ ] Report changed files, scenarios completed/skipped, findings fixed, follow-up changes created, validation results, residual risks, and ready-to-land status.
