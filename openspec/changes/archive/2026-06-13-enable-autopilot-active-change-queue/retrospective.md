# Retrospective: enable-autopilot-active-change-queue

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, active-change queue spec, traceability, tasks, README routing guidance, `openspec-autopilot` skill guidance, and `/autopilot` command template.
- Source and tests: `tools/openspec-autopilot-active-change-queue.ts`, `tools/openspec-autopilot-output.ts`, `tools/openspec-autopilot-controller.ts`, `.opencode/plugins/openspec-autopilot.ts`, `tools/test-openspec-autopilot-active-change-output.ts`, `tools/test-autopilot-contract.ts`, `tools/test-autopilot-ledger-materialization.ts`, and `tools/test-autopilot-instruction-drift.ts`.
- Validation: `npm run validate`, `npm test`, `npm run openspec:validate`, and `openspec validate --all` passed on 2026-06-13 during the current validation cycle. `npm run validate` retained the existing warning about top-level OpenCode permission `allow` in `opencode.json`.
- Reviewer gates: test coverage, code quality, instruction artifact, and OpenSpec consistency review evidence were reviewed; final consistency review found stale materialization-boundary wording and an active-change path-safety gap, both fixed in scope before archive-gate validation.
- Smoke boundary: source-equivalent plugin/controller smoke passed in tests; live restarted `/autopilot` command smoke was not run because this noninteractive session cannot safely restart the active OpenCode process and re-enter the command.

## Problems Found

| Problem | Evidence | Impact | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- |
| `/autopilot` stopped at `no_ledgers` despite unfinished active OpenSpec changes | Original finding recorded in `traceability.md` and proposal; active changes existed but no `automation/task.json` ledgers existed | Explicit Autopilot looked idle while normal OpenSpec work was available | Add active-change discovery, read-only `active_change_handoff` evidence, and compatibility with plugin-owned `ledger_materialized` starts | high | none |
| Active-change `tasks.md` discovery could follow symlinked change directories | OpenSpec consistency review found change-directory/task-file path safety was not guarded before reading `tasks.md` | Status/fallback discovery could read outside intended OpenSpec scope | Add lstat/realpath guards for active change directories and `tasks.md`, plus a symlink/junction regression test that verifies target content is not read | high | none |
| Active-change docs overstated read-only behavior after materialization was added | OpenSpec consistency review compared this change with materialization tests and controller behavior | Archive would preserve false claims that materialization-capable `run_next` can only hand off | Reconcile proposal/design/spec/tasks/traceability with the separate materialization contract: read-only/status paths hand off, materialization-capable starts may return `ledger_materialized` | high | none |
| Blank command scope arguments could suppress fallback | Regression tests were added for empty-string and whitespace scope args | Prompt command `$ARGUMENTS` expansion could make empty args behave differently from omitted args | Normalize optional `changeId`/`taskId` filters before discovery and test empty/whitespace cases | high | none |
| Plugin context with blank `worktree` could miss repository root | Plugin context regression tests were added for directory fallback | Source-equivalent smoke could fail when OpenCode supplied blank worktree path | Fall back to `directory` when `worktree` is blank and keep plugin tool tests | high | none |
| Coverage review prompt was too diff-centric | `test-coverage-reviewer` contract was updated to require task/repro/runtime-envelope baseline review | Reviewer could miss acceptance gaps outside changed code | Update reviewer guidance and validator regression coverage | medium | none |
| Live command smoke requires restart outside this session | Tasks and traceability record source-equivalent smoke passed but live `/autopilot` restart smoke was skipped | Archive evidence could overstate live-loader coverage | Record an explicit skip reason and rely on source-equivalent plugin/controller smoke plus restart guidance | high | none |

## Outputs

- Project follow-up changes: none; material findings were fixed in scope and covered by deterministic tests or documented skip evidence.
- `opencode-dev-kit` proposals/changes: none; reusable active-change queue behavior is implemented in this repository-owned change.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Evidence reviewed, material findings fixed in scope, source-equivalent validation passed, live restart smoke skip is explicit, OpenSpec docs/spec/tasks were synchronized, and no actionable follow-up findings remain.
- Approver, if skipped: none
