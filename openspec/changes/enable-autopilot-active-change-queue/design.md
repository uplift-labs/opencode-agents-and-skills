# Design: Enable Autopilot Active Change Queue

## Problem Statement

The current plugin entrypoint calls `readLedgerSummaries()` and classifies only Autopilot task ledgers. A repository can have unfinished active OpenSpec changes visible to `openspec list`, but if none of those changes has `automation/task.json`, `autopilot_run_next` returns `no_ledgers`. The agent then honors the loop guard and stops.

This is technically safe but operationally wrong for explicit `/autopilot`: the user asked the control plane to continue available OpenSpec work, and the repository has such work.

## Scope

Implement a read-only active-change fallback queue. The fallback is not a protected ledger writer and does not pretend to perform plugin-owned worker dispatch. It gives the model enough structured evidence to hand off to `openspec-apply-change` for the deterministic selected change.

## Data Sources

- Ledger-backed tasks: existing `openspec/changes/*/automation/task.json` and `.autopilot/prototype/tasks/*.json` discovery remains unchanged and authoritative.
- Active OpenSpec changes: directories under `openspec/changes/<change-id>/` with `tasks.md`, excluding `openspec/changes/archive/**`.
- Task state: Markdown checklist items in `tasks.md`; unchecked items are actionable implementation/archive tasks, checked items are completed evidence.
- Optional scope: `changeId` passed to `autopilot_run_next` or `autopilot_status` filters both ledgers and active-change fallback candidates.

## Output Contract

Add a reason code such as `active_change_handoff` to mean: no applicable ledger-backed task can be claimed, but at least one unfinished active OpenSpec change exists and should be continued by the agent through the OpenSpec apply workflow.

For active-change fallback output:

- `outcome`: `idle` or another non-advanced safe state; no plugin-owned runtime state changed.
- `tasksStarted`: empty.
- `tasksAdvanced`: empty.
- `taskSummaries[]`: includes active-change summaries with `taskId` equal to `changeId`, `path` pointing to `openspec/changes/<change>/tasks.md`, and `actionability` `actionable`.
- `selection.selectedTaskId`: selected change id.
- `selection.candidates[]`: deterministic candidate ranks and selection reasons.
- `nextActions[]`: first action is `Apply selected OpenSpec change`, with expected result instructing the agent to continue via `openspec-apply-change` for the selected change.
- `loopGuard`: suppresses repeating equivalent no-progress `autopilot_run_next` calls.

If the implementation needs to distinguish ledgers from active changes in machine-readable output, add a small explicit field such as `sourceKind: "ledger" | "active-change"` to task summaries and contract tests. Do not infer source kind from path text in callers when a field is available.

## Selection Rules

Ledger-backed candidates remain authoritative:

- If a scoped change has a ledger, use ledger behavior even when `tasks.md` also exists.
- If unscoped ledgers exist and are invalid, blocked, waiting for MR, terminal, or runtime-deferred, preserve the current ledger reason code and next actions.
- If no applicable ledger exists for the requested scope, evaluate active-change fallback candidates.

Active-change fallback selection:

- Exclude archived changes.
- Exclude changes with no unchecked checklist items from implementation handoff.
- Prefer an explicit `changeId` scope when supplied; if it is missing, return a clear no-actionable or invalid-scope result instead of silently selecting another change.
- For unscoped runs, rank unfinished changes deterministically by stable `changeId` and path. Report checked/unchecked task counts as evidence, but do not use them as priority until a real repository priority source or explicit queue policy exists. If priority or open-task-count ranking is later introduced, update the contract and tests before changing the ranking.
- Select exactly one primary change by default. Additional changes appear as not selected; parallel behavior remains owned by the auto-parallel change.

## Agent Handoff

The skill and `/autopilot` command should treat `active_change_handoff` differently from terminal no-work states:

1. Report the reason code and selected change briefly.
2. Do not repeat `autopilot_run_next`.
3. Load/use `openspec-apply-change` for `selection.selectedTaskId` or the explicit `changeId`.
4. Continue implementation under the normal OpenSpec apply lifecycle: tests first where applicable, minimal implementation, validation, reviewers, task checklist updates, and final handoff.

This keeps the plugin authoritative for discovery/selection while letting the main agent perform the actual work until provider-backed worker dispatch exists.

## Safety And Protected Paths

- The fallback reads `tasks.md`, proposal/design/spec files only as needed for summaries.
- It must not write `.autopilot/**`, `openspec/changes/*/automation/**`, or any protected ledger path.
- It must not create commits, pushes, MRs, merges, deploys, or remote-state changes.
- It must not read secrets.
- It must report unsupported or unreadable active-change state as unknown/blocked instead of guessing.

## Alternatives Considered

### Require Manual Ledger Creation

Rejected. It preserves current safety but leaves `/autopilot` unusable for normal OpenSpec changes and encourages agents to ask users for avoidable setup.

### Generate `automation/task.json` From `tasks.md`

Rejected for this change. Ledger generation is a protected state mutation and would need a separate plugin-owned migration design, schema ownership, and stronger validation gates.

### Route Users To `next-step`

Rejected as the primary fix. `next-step` discovery is useful, but explicit `/autopilot` should not claim no work exists when the active OpenSpec queue is visible locally.

## Implementation Order

1. Add active-change discovery tests and helper contract.
2. Extend output contract values and tests for `active_change_handoff`.
3. Wire fallback into `autopilot_run_next` and `autopilot_status` only after ledger-backed tests still pass.
4. Update command/skill/README wording.
5. Run validation and reviewer gates.

## Risks

- Active-change task parsing can misclassify custom Markdown. Mitigation: support only explicit checkbox lines and report unsupported evidence as unknown.
- Multiple unfinished changes can surprise users if the deterministic primary is not the one they expected. Mitigation: output all candidates and support explicit `changeId` scope.
- Agents may treat handoff as runtime advancement. Mitigation: reason code, empty `tasksStarted`, loop guard, and wording must state that no plugin-owned mutation occurred.
