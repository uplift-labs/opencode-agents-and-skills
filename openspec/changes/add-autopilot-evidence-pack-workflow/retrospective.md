# Retrospective: add-autopilot-evidence-pack-workflow

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, tasks, specs, README updates.
- Tool outputs / validation: `npm run validate:strict`, `npm test`, `openspec validate --all`, and `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json` passed on 2026-06-12.
- Reviewer gates: `code-quality-reviewer`, `test-coverage-reviewer`, `instruction-artifact-reviewer`, and targeted architecture rechecks passed after fixes.
- Autopilot/runtime events: `autopilot_run_next` returned `ready_runtime_deferred`, so implementation continued manually without protected Autopilot state edits.

## Problems Found

| Problem | Evidence | Impact | Root Cause | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- | --- |
| Report path boundary was too broad | Code-quality review found `--report` could overwrite arbitrary repo files | Evidence generation could clobber source or docs | Report writer accepted generic repository paths instead of a narrow approved report target | Constrain report writes to new files under the matching change outside automation paths and test blocked paths | high | none |
| Reviewer routing missed git status signals | Reviewer recheck found CLI collect did not derive changed files from full git status and missed `instructions/**` | Evidence packs could omit required reviewer gates | Reviewer routing was derived from limited artifact signals instead of the complete changed-path set | Use full porcelain changed paths and add git-status tests for tools and instruction artifacts | high | none |
| Report contract sections needed stronger proof | Coverage review requested Tool Smoke, Findings, Follow-Up, Validation, Reviewer Gates, Residual Risks, and Ready-To-Land sections | Reports could be incomplete for archive review | Markdown report output lacked schema-like section assertions for reviewer-critical evidence | Add deterministic Markdown sections and assertions | high | none |

## Outputs

- Project follow-up changes: none; findings were fixed in this change.
- `opencode-dev-kit` proposals/changes: none; findings were fixed in this change.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Evidence reviewed, findings fixed, reviewer rechecks clean, and validation passed.
- Approver, if skipped: none
