# Tasks: Add Autopilot Evidence Pack Workflow

## Tests First

- [x] Add fixture tests for evidence-pack JSON shape and stable ordering.
- [x] Add tests for collect mode proving no protected-path writes occur.
- [x] Add tests for validation planning without command execution.
- [x] Add tests for validation result summarization with fake command outputs.
- [x] Add tests for reviewer planning across task types and changed-file signals.
- [x] Add tests for freshness and active-change consistency evidence items, including unsupported inputs returning `unknown`.
- [x] Add tests for retrospective-ready evidence sections and candidate follow-up routing without claiming the retro gate passed.
- [x] Add tests for deterministic Markdown report rendering.
- [x] Add redaction tests for absolute paths and secret-like inputs.

## Implementation

- [x] Add a TypeScript evidence-pack library module.
- [x] Add a CLI entrypoint and `package.json` script after tests define the contract.
- [x] Implement ledger discovery and validator summary collection.
- [x] Implement validation plan generation.
- [x] Implement optional validation execution with compact summaries.
- [x] Implement reviewer plan generation from deterministic signals.
- [x] Implement freshness and active-change consistency evidence collection with explicit `unknown`/handoff output when dedicated freshness validation is not executed.
- [x] Implement retrospective evidence checklist and candidate follow-up routing sections.
- [x] Implement report rendering to an explicit approved path.
- [x] Keep raw output storage outside protected Autopilot paths unless plugin-owned.

## Documentation And Review

- [x] Document command shape in README only after implementation is stable.
- [x] Update Autopilot regression prompt/report workflow if this replaces manual steps.
- [x] Run `test-coverage-reviewer` for evidence-pack tests.
- [x] Run `code-quality-reviewer` for non-trivial automation code.
- [x] Run `instruction-artifact-reviewer` if skills, commands, README, or prompts change.

## Validation

- [x] `npm run validate:strict`
- [x] `npm test`
- [x] `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json` (no change-local ledger exists)
- [x] `openspec validate --all`

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [x] Write `retrospective.md` with evidence, problems, root causes, improvements, and archive gate decision.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings; none required after fixed findings.
- [x] Create or update reusable `opencode-dev-kit` OpenSpec proposals/changes for Autopilot, skill, agent, instruction, validator, or evidence-pack findings; none required after fixed findings.
- [x] Run `npm run openspec:retro-followups -- add-autopilot-evidence-pack-workflow`; no additional follow-up changes were required after fixed findings.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
