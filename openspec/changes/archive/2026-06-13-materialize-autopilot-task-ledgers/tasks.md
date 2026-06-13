# Tasks: Materialize Autopilot Task Ledgers

## Plan And Contract

- [x] Add focused failing tests for materialization eligibility, including plain `/autopilot` selected active changes, prompt-resolved starts, internally resolved active changes, existing ledgers, missing changes, archived changes, completed changes, and unreadable `tasks.md`.
- [x] Add output-contract tests for `ledger_materialized` or the final chosen reason code, `tasksAdvanced` creation evidence, selected task evidence, and safe next actions.
- [x] Add read-only safety tests proving `autopilot_status`, `autopilot_collect`, blocker answer, stop, cheap checks, and passive triggers do not create `automation/task.json`.
- [x] Add instruction-drift tests for README, `/autopilot` command guidance, and `openspec-autopilot` skill wording about who creates `task.json`.

## Ledger Builder

- [x] Implement a deterministic TypeScript ledger builder for active OpenSpec changes without adding PowerShell, Python, or JavaScript tooling.
- [x] Derive required schema fields from safe OpenSpec evidence and documented defaults: `id`, `taskType`, `status`, `priority`, `dependencies`, `scope`, `autonomy`, `validation`, `phaseProfile`, `phaseEvidence`, `testDecision`, `plan`, `reviewPolicy`, `mr`, `blockers`, `feedback`, `history`, and `revision`.
- [x] Validate candidate ledgers with `validateTaskLedger` before any final protected-path publication.
- [x] Add fixture tests that run `npm run autopilot:validate -- <materialized-ledger-fixture>` for at least one generated ledger fixture or document why fixture generation is not applicable.

## Plugin-Owned Publication

- [x] Implement plugin/controller-owned publication to `openspec/changes/<change-id>/automation/task.json` with safe path normalization and no traversal or archive writes.
- [x] Use temp-file write, read-back validation, final-path absence check, and atomic publish where supported.
- [x] Ensure failures do not leave a final `task.json`; cleanup only materializer-owned temporary files.
- [x] Ensure existing ledgers are never overwritten, regenerated, or migrated by this materialization path.

## Runtime Integration

- [x] Wire plain `/autopilot` / unscoped explicit `autopilot_run_next()` to materialize the deterministic selected active change when no applicable ledger exists and preflight passes.
- [x] Wire prompt-resolved `/autopilot + prompt` starts so the resolved or newly accepted change is materialized before Autopilot-controlled work begins.
- [x] Keep internal resolved-`changeId` controller calls supported, but document plain `/autopilot` and `/autopilot + prompt` as the expected user materialization paths.
- [x] After successful materialization, re-read ledger-backed state and return machine-readable creation evidence without claiming implementation work started.
- [x] Preserve active-change handoff behavior for read-only discovery and unsupported materialization cases.
- [x] Keep auto-parallel selection ledger-backed only; active changes must materialize before parallel claims are considered.

## Documentation And Instructions

- [x] Update `.opencode/skills/openspec-autopilot/SKILL.md` to explain materialization, protected ownership, output evidence, and read-only paths.
- [x] Update README Autopilot guidance so users know `task.json` is created by explicit plugin-owned materialization when Autopilot starts work on a selected change, not by normal OpenSpec change creation.
- [x] Update any `/autopilot` command or prompt-intake wording that currently implies users must supply `<change-id>` or that active changes can only hand off manually.
- [x] Review relevant artifact frontmatter or catalog entries so the new behavior remains discoverable.

## Validation And Review

- [x] Run `npm run validate`.
- [x] Run `npm test`.
- [x] Run `npm run openspec:validate` or `openspec validate --all`.
- [x] Run `npm run autopilot:validate -- <materialized-ledger-fixture>` for generated fixture ledgers, or record not-applicable with reason.
- [x] Run `instruction-artifact-reviewer` after instruction, README, command, or skill changes.
- [x] Run `test-coverage-reviewer` or record an explicit skip reason after the implementation diff is known.

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, and token-heavy steps. Evidence: `retrospective.md` reviews OpenSpec artifacts, validation, reviewer gates, fixed blockers, and Autopilot runtime behavior.
- [x] Write `retrospective.md` with evidence, problems, improvements, and archive gate decision. Evidence: `openspec/changes/materialize-autopilot-task-ledgers/retrospective.md` added with `Archive Gate Decision: passed`.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings. Evidence: no `project-local` findings remained; `npm run openspec:retro-followups -- materialize-autopilot-task-ledgers` returned `changes: []`.
- [x] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval. Evidence: no `opencode-dev-kit` findings remained; reusable behavior was fixed in this repository-owned change.
- [x] Run `npm run openspec:retro-followups -- <change-id>` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive. Evidence: `npm run openspec:retro-followups -- materialize-autopilot-task-ledgers` passed with `retrospectiveUpdated: false`.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded. Evidence: `npm run openspec:retro-gate -- materialize-autopilot-task-ledgers` returned `valid: true` and `archiveAllowed: true`.
