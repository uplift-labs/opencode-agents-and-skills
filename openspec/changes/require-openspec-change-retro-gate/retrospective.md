# Retrospective: require-openspec-change-retro-gate

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, specs, traceability, tasks, helper tests, and workflow skill updates.
- Tool outputs / validation: `npm run validate:strict`, `npm test`, `openspec validate --all`, and `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json` passed on 2026-06-12.
- Reviewer gates: `instruction-artifact-reviewer`, `test-coverage-reviewer`, `code-quality-reviewer`, and architecture consistency checks passed after fixes.
- Autopilot/runtime events: active completed changes now include final retrospective sections and completed retrospectives; live regression remains blocked before archive by restart and first-turn `/autopilot` evidence.

## Problems Found

| Problem | Evidence | Impact | Root Cause | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- | --- |
| Reusable task tail implied cross-repo writes | Instruction review found mandatory `opencode-dev-kit` wording lacked approval guard | Agents in other repositories could write or imply writes across repos | The reusable template named a shared artifact owner without an explicit current-repository ownership guard | Keep the route but require current-repo ownership or local handoff without explicit cross-repo approval | high | none |
| Evidence-pack determinism wording overclaimed | Instruction review found README said deterministic output while timestamps are generated | Reviewers could expect byte-identical output across runs | Documentation conflated stable schema/order with byte-identical output despite generated timestamps | Reword to stable schema and ordering plus generated timestamp | medium | none |
| Active task checkboxes drifted behind evidence | Instruction review found validation and reviewer items unchecked after passing gates | Archive and next-step could surface completed work as incomplete | Task status updates were not synchronized immediately after validation and reviewer evidence was recorded | Synchronize tasks with validation and reviewer evidence | high | none |
| Follow-up creation was not algorithmically enforced | User review caught that `retrospective.md` could be written without creating OpenSpec changes for actionable findings | Practical retro conclusions could remain prose and be forgotten before archive | The retrospective gate checked for prose evidence before a helper existed to materialize actionable follow-ups | Add `openspec:retro-followups` helper and make `openspec:retro-gate` verify referenced follow-up changes exist | high | none |

## Outputs

- Project follow-up changes: none; findings were fixed in this change.
- `opencode-dev-kit` proposals/changes: none; findings were fixed in this change.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Evidence reviewed, workflow wording and checklist drift fixed, reviewer rechecks clean, and validation passed.
- Approver, if skipped: none
