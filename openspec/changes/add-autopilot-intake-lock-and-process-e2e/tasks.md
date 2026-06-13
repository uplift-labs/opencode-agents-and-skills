# Tasks: Add Autopilot Intake Lock And Process E2E

## Tests First

- [ ] Add `tools/test-autopilot-scenario-e2e.ts` with a failing full `feature` happy-path scenario using a temp mini-project, real controller/runtime/ledger code, and scripted fake worker output.
- [ ] Add intake-lock tests proving materialized ledgers record locked task type, caliber, risk class, required gates, required artifacts, phase profile, review policy, and classification evidence.
- [ ] Add negative collect tests proving a worker report cannot downgrade `feature` to `typo`, `docs`, or `research`, cannot weaken `phaseProfile`, cannot remove required reviewers, and cannot remove required gates.
- [ ] Add tests proving worker reports with wrong `toStatus`, missing required phase evidence, or skipped mandatory artifacts fail closed without protected ledger mutation or report consumption.
- [ ] Add `bugfix` scenario tests proving reproduction, characterization, regression test, or accepted infeasible evidence is required before implementation/review progression.
- [ ] Add reviewer-loop tests proving `needs-work` or failed reviewer output returns the task to `Implementation` or blocks it, and `Review -> Acceptance` requires passed/approved required reviewers or explicit policy skips.
- [ ] Add artifact/scope tests proving reported `changedFiles`, `artifact`, and `artifacts` are relative, exist in the temp project, stay inside `scope.write`, and never target forbidden/protected paths.
- [ ] Add MR wait/no-auto-merge tests proving file-changing tasks cannot reach `Done` without MR merged evidence and Autopilot does not merge automatically.
- [ ] Add idempotency tests proving repeated `collect` cannot apply the same report twice and does not append duplicate history entries.

## Implementation

- [ ] Add or extend TypeScript types for the locked `intake` ledger contract, including `schemaVersion`, `locked`, `source`, `classifiedAt`, `classifiedBy`, `taskType`, `taskCaliber`, `riskClass`, `requiredGates`, `requiredArtifacts`, and `classificationEvidence`.
- [ ] Extend ledger validation to require or compatibility-diagnose `intake` for claim-capable Autopilot ledgers without breaking read-only inspection of legacy ledgers prematurely.
- [ ] Extend materialization/prompt-intake integration so newly created ledgers write a locked intake contract from deterministic classification evidence.
- [ ] Add a shared locked-contract verifier that detects weakening of task type, caliber, risk class, required gates, required artifacts, phase profile, review policy, validation commands, MR requirement, and scope boundaries.
- [ ] Add a shared phase-evidence verifier that enforces `resolveAutopilotPhaseDispatch().evidenceRequirements` before protected ledger mutation.
- [ ] Extend `autopilot-ledger-transition-writer` or adjacent transition helpers to project accepted phase evidence into durable phase evidence/plan/review policy fields only when doing so does not weaken the locked contract.
- [ ] Add reviewer result handling so `needs-work`/failed review cannot advance to `Acceptance`, while passed/approved required reviewer evidence can satisfy `reviewPolicy` for `Review -> Acceptance`.
- [ ] Add artifact/scope verification for report evidence and changed files before accepting `Implementation -> Review` or artifact-producing transitions.
- [ ] Add explicit reclassification-blocker output for evidence that suggests the initial classification is too weak or wrong; do not allow worker-owned reclassification during collect.
- [ ] Implement `tools/autopilot-scenario-e2e-harness.ts` with temp project setup, scripted fake worker adapter, phase runner, ledger/runtime assertions, and stable cleanup.
- [ ] Add `test:e2e` script for the scenario harness and decide after runtime evidence whether to include it in `npm test` immediately or keep it as a separate gate until stable.

## Documentation And Discoverability

- [ ] Update README Autopilot guidance to describe locked intake, mocked-LLM process e2e, and the boundary between LLM artifact quality and Autopilot process guarantees.
- [ ] Update `.opencode/skills/openspec-autopilot/SKILL.md` so workers treat locked intake fields as authoritative and do not attempt to simplify task type or gates after materialization.
- [ ] Update relevant instruction drift tests so command/skill/README wording cannot imply workers may reclassify or bypass Autopilot after intake.
- [ ] Review active related OpenSpec changes for references that conflict with immutable intake or scenario e2e terminology.

## Reviewer Gates

- [ ] Run `test-coverage-reviewer` for scenario e2e coverage, negative gate coverage, and residual LLM-quality gaps.
- [ ] Run `code-quality-reviewer` for harness/helper boundaries, duplication, file size, and production-vs-test separation.
- [ ] Run `instruction-artifact-reviewer` if skill, command, README, or agent instructions change.
- [ ] Run `openspec-consistency-review` before implementation handoff or archive because this change crosses prompt intake, runtime, ledger, worker, and documentation contracts.

## Validation

- [ ] `node tools/test-autopilot-scenario-e2e.ts`.
- [ ] `npm run validate`.
- [ ] `npm test`.
- [ ] `npm run openspec:validate`.
- [ ] `npm run autopilot:check -- --level standard --change add-autopilot-intake-lock-and-process-e2e` when the check supports the new intake/process evidence.

## Acceptance Criteria

- [ ] The only model-influenced task-classification point is initial intake/materialization; all later phase transitions use locked ledger/runtime evidence.
- [ ] Workers cannot downgrade task type, caliber, risk, required gates, phase profile, review policy, or required artifacts after the intake lock exists.
- [ ] Missing phase evidence, wrong target status, out-of-scope artifacts, reviewer failures, MR wait, and duplicate reports fail closed without protected ledger mutation.
- [ ] Full feature and bugfix scenario e2e tests run locally without live provider calls or token spend.
- [ ] Process e2e tests prove Autopilot guarantees phase sequence and required artifacts, while explicitly not claiming to validate LLM artifact quality.

## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [ ] Write `openspec/changes/add-autopilot-intake-lock-and-process-e2e/automation/retro.json` with evidence, problems, root causes, improvements, follow-up ids, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- add-autopilot-intake-lock-and-process-e2e` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the JSON retro gate passes or an approved skip reason is recorded in `automation/retro.json`.
