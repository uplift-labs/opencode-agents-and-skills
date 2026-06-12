# Tasks: Enable Autopilot Active Change Queue

## Tests First

- [x] Add active-change discovery tests covering no `openspec/changes`, active changes with unchecked tasks, active changes with all tasks checked, archived changes, unreadable or malformed task files, and deterministic ordering.
- [x] Add scoped selection tests proving `changeId` selects an unfinished active change without a ledger and reports a clear non-selection result when the scoped change is missing, archived, or complete.
- [x] Add precedence tests proving existing Autopilot ledgers remain authoritative over `tasks.md` fallback for the same change.
- [x] Add output contract tests for `active_change_handoff`, active-change task summaries, selection candidates, loop guard behavior, and next action wording.
- [x] Add plugin tool tests proving `autopilot_run_next` and `autopilot_status` expose active-change fallback output through `.opencode/plugins/openspec-autopilot.ts`.
- [x] Add regression tests proving empty-string and whitespace scope arguments from live tool calls do not suppress active-change fallback.
- [x] Add regression tests proving plugin context falls back to `directory` when `worktree` is blank.
- [x] Add validator regression coverage requiring `test-coverage-reviewer` to review task/repro/runtime-envelope baseline scenarios.
- [x] Add instruction drift tests proving `/autopilot`, `openspec-autopilot`, and README routing describe active-change handoff and do not tell agents to stop at `no_ledgers` when unfinished active changes exist.

## Implementation

- [x] Add a TypeScript active OpenSpec change queue helper that discovers active changes read-only from `openspec/changes/<change>/tasks.md` and excludes `archive/**`.
- [x] Parse Markdown checklist state deterministically and expose checked, unchecked, total, and unsupported/unknown evidence without fuzzy inference.
- [x] Extend Autopilot public contract values with `active_change_handoff` or the final chosen reason code, plus any explicit source-kind field required by task summaries.
- [x] Extend `readLedgerSummaries`/control-plane composition or add a sibling helper so `autopilot_run_next` can evaluate active-change fallback candidates when no applicable ledger exists.
- [x] Implement deterministic default active-change selection with explicit-scope precedence and stable tie-breakers.
- [x] Ensure fallback output never emits `tasksStarted` or `tasksAdvanced` and never mutates protected Autopilot paths.
- [x] Ensure `no_ledgers` remains reserved for the state where neither applicable ledgers nor unfinished active OpenSpec changes exist.
- [x] Wire fallback summaries and selection evidence into `autopilot_status` so users can inspect why a change was or was not selected.
- [x] Normalize optional `changeId` and `taskId` filters before ledger and active-change discovery so blank arguments are equivalent to omitted arguments.
- [x] Split-or-justify for touched split-candidate files: `tools/validate-library.ts` and `tools/test-library.ts` were touched only to add a narrow validator contract and regression test; local bloat was reduced with a named text-contract table and README catalog helper, while broader validator/test harness splitting remains outside this Autopilot fix.

## Documentation And Routing

- [x] Update `openspec-autopilot` skill guidance so `active_change_handoff` immediately continues through `openspec-apply-change` for the selected change.
- [x] Update `/autopilot` command wording in `opencode.json` so active-change handoff is treated as actionable continuation, not a final stop.
- [x] Update `test-coverage-reviewer` so coverage review starts from the user task, logs/repro, runtime envelope, and fresh-session baseline scenario instead of only the code diff.
- [x] Update README routing/catalog guidance to distinguish ledger-backed Autopilot, active-change handoff, `next-step`, and direct `openspec-apply-change`.
- [x] Review relevant artifact frontmatter and command descriptions for discoverability after wording changes.

## Review Gates

- [x] Run `test-coverage-reviewer` for active-change discovery, output contract, plugin tool, and instruction drift coverage.
- [x] Run `code-quality-reviewer` for non-trivial TypeScript helper/control-plane changes.
- [x] Run `instruction-artifact-reviewer` after skill, command, or README wording changes.
- [ ] Run `openspec-consistency-review` before archive because this changes Autopilot/OpenSpec lifecycle routing.

## Validation

- [x] `npm run validate`
- [x] `npm test`
- [x] `npm run openspec:validate`
- [x] `openspec validate --all`
- [x] `npm run autopilot:validate -- <task-ledger.json>` for any new or modified Autopilot ledger fixtures; not applicable because no ledger fixtures were added or modified.
- [ ] Manual smoke: run `/autopilot` in a repository with unfinished active OpenSpec changes and no active Autopilot ledgers; confirm the first output is `active_change_handoff` or the final chosen equivalent, not `no_ledgers`. Source-equivalent plugin smoke passed in the current repo after the empty-scope regression fix; live command smoke requires an OpenCode restart to reload plugin/command files.
- [ ] Manual scoped smoke: run `/autopilot <change-id>` for an unfinished active change with no ledger; confirm the selected id matches the scope and the agent continues via `openspec-apply-change`. Source-equivalent scoped plugin smoke passed for `enable-autopilot-active-change-queue`; live command smoke requires an OpenCode restart.

## Acceptance Criteria

- [x] Explicit `/autopilot` does not return `no_ledgers` when unfinished active OpenSpec changes exist; proven by source-equivalent plugin tests, live restarted-session smoke remains listed below.
- [x] Scoped `/autopilot <change-id>` works for an unfinished active OpenSpec change without requiring `automation/task.json`; proven by source-equivalent plugin tests, live restarted-session smoke remains listed below.
- [x] Existing ledger-backed Autopilot behavior remains unchanged when ledgers exist.
- [x] Output clearly distinguishes active-change handoff from plugin-owned runtime advancement.
- [x] The command/skill path causes the agent to continue selected work through `openspec-apply-change` instead of stopping after reporting the handoff.
- [x] All behavior is covered by deterministic TypeScript tests and OpenSpec validation.

## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, and token-heavy steps.
- [ ] Write `retrospective.md` with evidence, problems, improvements, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- enable-autopilot-active-change-queue` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
