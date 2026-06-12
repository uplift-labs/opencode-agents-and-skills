# Retrospective: materialize-autopilot-task-ledgers

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, specs, traceability, tasks, README Autopilot guidance, `openspec-autopilot` skill wording, `/autopilot` command contract, and materialization output contract.
- Tool outputs / validation: `npm run validate`, `npm test`, `npm run openspec:validate`, and `npm run autopilot:check -- --level standard --change materialize-autopilot-task-ledgers` passed on 2026-06-12; `autopilot:check` returned warning status only for no active Autopilot ledgers and unknown freshness advisory, with exit code 0.
- Focused tests: `tools/test-autopilot-ledger-materialization.ts`, `tools/test-autopilot-contract.ts`, `tools/test-autopilot-instruction-drift.ts`, `tools/test-autopilot-check.ts`, and passive trigger tests cover materialization, no-write paths, output contract, drift, and safety guards.
- Reviewer gates: `instruction-artifact-reviewer`, `code-quality-reviewer`, and `test-coverage-reviewer` found issues during implementation; final rechecks found no blockers and acceptance was not blocked.
- Autopilot/runtime events: explicit `autopilot_run_next` initially returned `reasonCode: active_change_handoff`; implementation now returns `ledger_materialized` for eligible explicit starts without claiming implementation work.

## Problems Found

| Problem | Evidence | Impact | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- |
| Publication could clobber or leave partial protected ledger state | Reviewer and focused tests drove no-overwrite, read-back validation, hard-link publish, and cleanup coverage in `tools/openspec-autopilot-materializer.ts` and `tools/test-autopilot-ledger-materialization.ts` | Existing plugin-owned `automation/task.json` could lose authority or failed materialization could leave misleading state | Keep no-clobber publication and failure-cleanup tests as required acceptance evidence for future ledger materialization edits | high | none |
| Path redirection required explicit symlink and junction guards | Final review verified default/custom `ledgerRoot` and `automation` symlink-junction no-write tests plus lstat/realpath guards | Protected writes could be redirected outside the intended OpenSpec change tree | Preserve both root and automation directory path-safety checks and do not replace them with normalization-only checks | high | none |
| Unsupported or unreadable active changes needed machine-readable cause evidence | Coverage review verified missing, archived, completed, invalid, and unreadable `tasks.md` cases report blocker cause evidence without publishing a ledger | Agents could loop on `active_change_handoff` or claim work was blocked without actionable diagnostics | Keep unsupported causes and read-failure evidence in `nextActions`/blocker output whenever materialization cannot safely proceed | high | none |
| Documentation drift could misstate who creates `task.json` | Instruction drift tests and reviewer gates checked README, skill, and `/autopilot` wording for explicit plugin-owned materialization and `<ledgerRoot>` paths | Users or agents could manually create protected ledgers or think `<change-id>` is mandatory for plain `/autopilot` | Keep drift tests tied to public output fields and materialization wording before future Autopilot instruction edits | high | none |

## Outputs

- Project follow-up changes: none; material findings were fixed in this change and covered by focused tests or drift checks.
- `opencode-dev-kit` proposals/changes: none; reusable Autopilot materialization behavior and instructions were implemented in this repository-owned change.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Evidence reviewed, implementation/docs/reviewer/validation tasks are complete, material issues were fixed in scope, final reviewer rechecks found no blockers, and no actionable follow-up findings remain.
- Approver, if skipped: none
