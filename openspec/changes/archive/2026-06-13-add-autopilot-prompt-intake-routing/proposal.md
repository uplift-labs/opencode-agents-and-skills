# Proposal: Add Autopilot Prompt Intake Routing

## Why

Autopilot currently has a clear flow for existing plugin-owned task ledgers and for unfinished active OpenSpec changes discovered from `tasks.md`. It does not have a first-class flow for explicit `/autopilot` or `autopilot` invocations that include a free-form task prompt such as "fix this bug", "add a feature", or "research this behavior".

The current `/autopilot` command treats non-empty arguments as a possible `changeId` or `taskId`. If the arguments are not an exact OpenSpec scope, the agent can mis-handle the request by passing natural language as a scope, stopping at `no_ledgers`, or continuing an unrelated active queue while the user's new prompt remains unscheduled.

The gap is especially visible for task-type-specific work. `bugfix`, `feature`, `research`, `planning`, `tooling`, `config`, `performance`, and `protocol` have ledger policies once a task ledger exists, but there is no deterministic intake path from a new free-form prompt into either an existing matching scope, OpenSpec exploration/proposal, or an explicitly accepted Autopilot queue item.

## What Changes

- Add a deterministic prompt-intake contract for explicit Autopilot invocations with command arguments or adjacent user task text.
- Distinguish exact `changeId`/`taskId` scope from free-form prompt text before any claim-capable `autopilot_run_next` action.
- Define safe routing when free-form prompt text is present with no existing queue, with an existing unrelated queue, with a matching active change, or with a matching task ledger.
- Map explicit prompt intent to supported Autopilot task families only as routing evidence; do not apply task-type ledger gates until a valid ledger or accepted OpenSpec change exists.
- Update `/autopilot`, `openspec-autopilot`, and README routing guidance so free-form prompt handling is synchronized and testable.
- Add deterministic tests that prevent natural-language command arguments from being treated as scope ids or from silently continuing unrelated queued work.

## Scenario Matrix Summary

| Input Scenario | Current Flow | Gap |
| --- | --- | --- |
| `/autopilot` with no args, ready ledger exists | `autopilot_run_next` inspects/claims or returns `ready_runtime_deferred` | Covered |
| `/autopilot` with no args, unfinished active change exists and no ledger | `active_change_handoff` to `openspec-apply-change` | Covered |
| `/autopilot <change-id>` where change has active tasks and no ledger | Scoped `active_change_handoff` | Covered |
| `/autopilot <task-id>` where ledger exists | Scoped ledger evaluation | Covered |
| `/autopilot` when no ledgers or active changes exist | `no_ledgers` escape hatch | Covered for empty command, but not for a supplied task prompt |
| `/autopilot fix bug in auth` with no matching scope | No deterministic prompt-intake flow | Missing |
| `/autopilot add feature X` while unrelated active changes exist | May continue queue instead of scheduling prompt | Missing |
| `/autopilot research behavior Y` without an existing change | No route to `openspec-explore`/`openspec-propose` before queue handling | Missing |
| `autopilot status`, `collect`, `stop`, or blocker answer | Dedicated public tools | Covered |
| Active-context `работай` inside known Autopilot context | Skill routes to Autopilot control plane | Covered |
| Plain `работай` without Autopilot context | Should use current session workflow or `next-step`, not Autopilot by default | Covered by eligibility boundary, but should be kept in tests |

## Non-Goals

- Do not add fuzzy semantic matching between arbitrary prompt text and existing changes or ledgers.
- Do not automatically create or mutate `openspec/changes/*/automation/task.json`, `automation/feedback/**`, `automation/artifacts/**`, or `.autopilot/**` from free-form prompt text.
- Do not make Autopilot the default for ordinary bug, feature, or research requests when the user did not explicitly invoke Autopilot.
- Do not bypass `openspec-explore`, `openspec-propose`, `openspec-apply-change`, `next-step`, or direct small-edit routing when they are the safer workflow.
- Do not persist or echo raw prompt text in plugin-owned state beyond what is already present in user-visible OpenSpec artifacts approved by the normal workflow.

## Impact

- Explicit `/autopilot <free-form task>` becomes predictable instead of ambiguous.
- Existing queues remain protected from accidental advancement when the user supplied a new task prompt rather than a scope id.
- New bug/feature/research prompts get routed to exploration/proposal or a known existing scope before Autopilot task-type gates are applied.
- Instruction drift tests can protect the command, skill, and README surfaces from diverging on prompt-intake behavior.

## Validation

- Add failing TypeScript tests for scope resolution, free-form prompt detection, existing-queue separation, and command/instruction drift before implementation.
- Run `npm run validate`.
- Run `npm test`.
- Run `npm run openspec:validate` or `openspec validate --all`.
- Run `instruction-artifact-reviewer` after command, skill, or README wording changes.
