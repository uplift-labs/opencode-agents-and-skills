# Retrospective: add-autopilot-prompt-intake-routing

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, prompt-intake spec, traceability, tasks, README Autopilot routing guidance, and `openspec-autopilot` skill guidance.
- Tool outputs / validation: `node tools/test-autopilot-prompt-intake.ts`, `node tools/test-autopilot-instruction-drift.ts`, `npm run validate`, `npm test`, and `openspec validate --all` passed on 2026-06-13. `npm run validate` retained the existing warning about top-level OpenCode permission `allow` in `opencode.json`.
- Reviewer gates: `instruction-artifact-reviewer`, `code-quality-reviewer`, and `test-coverage-reviewer` found material issues in early passes; final rechecks passed after fixes. OpenSpec consistency review found task/traceability/retro bookkeeping gaps that were addressed before archive-gate validation.
- Runtime boundary evidence: `/autopilot` remains an instruction-mediated OpenCode prompt command; deterministic behavior is covered by `tools/autopilot-prompt-intake.ts`, `tools/test-autopilot-prompt-intake.ts`, and instruction drift tests. The plugin `autopilot_run_next` tool remains scoped to `changeId`/`taskId` and does not accept raw prompt text.

## Problems Found

| Problem | Evidence | Impact | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- |
| Free-form prompt routing initially treated missing queue inventory as empty | OpenSpec and architecture review found omitted `existingQueue` returned `queueState: "none"` and could skip read-only status | Unrelated queued work could be hidden by missing status evidence | Add `queueState: "unknown"`, make `autopilot_status` the first planned action, and add unknown/present/empty queue tests | high | none |
| Prompt-family routing was too permissive for mixed docs/typo and missed literal labels | Code/test reviews found typo short-circuiting and missing literal `bugfix`/`refactor` coverage | Mixed or canonical prompts could route inconsistently across helper/docs | Collect all family signals, return `unclear` for risky mixed prompts, add `bugfix`/`refactor` tests, and drift-check canonical family labels | high | none |
| Ambiguous and combined scope handling lacked intersection evidence | Instruction/test reviews found combined `changeId`+`taskId` was allowed when both ids resolved independently | A task from another change could be advanced as if it intersected the selected change | Require task-to-change intersection evidence before combined scope; otherwise block as ambiguous and add negative tests | high | none |
| Raw prompt handling was underspecified in instructions | Instruction review found command/skill/README did not explicitly prohibit raw prompt echo/persistence by default | Prompt text could leak into plugin-owned state or automation evidence in future wording | Add raw prompt non-echo/persistence wording and drift assertions; helper emits derived fields only | high | none |
| Traceability and task evidence lagged implementation | OpenSpec consistency review found pre-fix coverage inventory and unchecked tasks after implementation | Archive readiness could not be audited from OpenSpec artifacts | Refresh traceability, record task evidence, add retrospective, and run retro follow-up/gate commands | high | none |

## Outputs

- Project follow-up changes: none; material findings were fixed in this change and covered by focused tests, drift checks, or OpenSpec docs.
- `opencode-dev-kit` proposals/changes: none; reusable prompt-intake behavior is owned by this repository and implemented in this change.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Evidence reviewed, material reviewer findings fixed in scope, final reviewer rechecks found no implementation blockers, validation passed, OpenSpec docs/spec/tasks were synchronized, and no actionable follow-up findings remain.
- Approver, if skipped: none
