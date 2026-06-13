# Retrospective: add-autopilot-continuous-validation-gates

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, contract-validation spec, traceability, tasks, README validation guidance, `openspec-autopilot` skill guidance, and package script contracts.
- Tool outputs / validation: `node tools/test-autopilot-check.ts`, `node tools/test-pre-push-validate.ts`, `node tools/test-autopilot-instruction-drift.ts`, `npm run validate`, `npm test`, `npm run openspec:validate`, `npm run autopilot:check -- --level cheap`, `npm run autopilot:check -- --level standard --change add-autopilot-continuous-validation-gates`, `npm run autopilot:check -- --level prepush`, `npm run autopilot:check -- --level final --change add-autopilot-auto-parallel-claims`, and `npm run prepush:validate` passed on 2026-06-12.
- Reviewer gates: `code-quality-reviewer`, `test-coverage-reviewer`, and `instruction-artifact-reviewer` found material issues first, then final rechecks found no P0/P1 blockers after fixes.
- Autopilot/runtime events: `/autopilot` returned `reasonCode: active_change_handoff`, selected `add-autopilot-continuous-validation-gates`, and advanced no plugin-owned runtime state because no applicable Autopilot ledger owns runtime dispatch.

## Problems Found

| Problem | Evidence | Impact | Root Cause | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- | --- |
| Scoped ledger and change scopes could silently mismatch | Code-quality review found explicit `--ledger` could be filtered away by `--change` | A user could receive a successful no-ledger check after targeting the wrong ledger | Scope validation treated `--ledger` and `--change` as independent filters rather than a conflicting user intent signal | Add blocking scope mismatch detection and a regression test | high | none |
| Static scope blockers still ran broad commands | Code-quality review found final without `--change` planned repository validation and tests | Mis-scoped checks could waste time and obscure the real blocker | Blocking scope validation happened after command planning instead of short-circuiting the planner | Short-circuit command execution when blocking scope errors exist | high | none |
| Pre-push freshness was not integrated | Test-coverage review found `pre-push-validate.ts` did not include an Autopilot evidence freshness gate | Changed report/task/ledger artifacts could miss stale-evidence checks before push | Pre-push validation had a separate planning path from Autopilot freshness checks | Add shared freshness planning to pre-push and tests for blocking freshness failures | high | none |
| Scoped-ledger absolute path output leaked local paths | Test-coverage review found outside absolute `--ledger` JSON echoed the host path | Machine-readable failure output could expose local filesystem details | Error serialization reused raw path evidence before applying repository-boundary redaction | Redact outside scoped ledger paths as `<outside-repo>` and add CLI regression coverage | high | none |
| Final checkpoint wording looked read-only | Instruction review found `autopilot:check -- --level final` can create/update retro follow-ups but README/skill presented it as a routine check | Agents could run mutation-capable final gates in read-only or routine ready-to-land contexts | Documentation did not distinguish write-authorized final gates from read-only/status checks | Document final mode as write-authorized only and route routine ready-to-land to prepush | high | none |
| Autopilot check module grew near split threshold | Final code-quality recheck reported `tools/autopilot-check.ts` above 800 lines | Future additions may reduce maintainability | Planner, executor, and CLI responsibilities accumulated in one cohesive module during feature growth | Keep current cohesive module for acceptance; split planner/executor/CLI only if it grows further | medium | none |

## Outputs

- Project follow-up changes: none; material findings were fixed in this change and the remaining split-module item is a nonblocking future-maintenance signal.
- `opencode-dev-kit` proposals/changes: none; reusable Autopilot validation behavior and guidance were implemented in this repository-owned change.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Evidence reviewed, material reviewer findings fixed in scope, final reviewer rechecks found no blockers, validation passed, and no actionable follow-up findings remain.
- Approver, if skipped: none
