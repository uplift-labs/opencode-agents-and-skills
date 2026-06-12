# Proposal: Enable Autopilot Active Change Queue

## Why

Autopilot currently discovers only plugin-owned task ledgers at `openspec/changes/*/automation/task.json` and `.autopilot/prototype/tasks/*.json`. When a repository has normal active OpenSpec changes with unfinished `tasks.md` items but no Autopilot ledger, `/autopilot` returns `no_ledgers` and stops, even though `openspec list` shows actionable work.

That makes Autopilot feel broken for the most common OpenSpec workflow: accepted changes are tracked in `openspec/changes/<change>/tasks.md`, and the agent should be able to pick up the next unfinished change without a manually created protected ledger.

## What Changes

- Add a read-only active OpenSpec change queue fallback for Autopilot when no applicable task ledger exists.
- Discover active changes from `openspec/changes/<change>/tasks.md`, excluding `openspec/changes/archive/**` and completed changes with no unchecked tasks.
- Preserve ledger authority: when a valid or invalid Autopilot task ledger exists for a scope, ledger-backed behavior and validation remain authoritative.
- Return a distinct reason code, task/actionability summaries, selection evidence, and next action for active-change handoff instead of `no_ledgers`.
- Update `/autopilot` and `openspec-autopilot` guidance so the agent immediately continues the selected active change via `openspec-apply-change` instead of stopping after reporting the fallback output.
- Add deterministic tests and contract coverage so active-change queue behavior cannot drift from the plugin, helper, README, or skill surfaces.

## Goals

- Make `/autopilot` useful in repositories that have active OpenSpec changes but no Autopilot task ledgers.
- Avoid manual or model-authored writes to protected Autopilot ledger paths.
- Keep selection deterministic and explainable when several unfinished changes exist.
- Let scoped calls such as `/autopilot add-autopilot-continuous-validation-gates` select that change even when it has no ledger.
- Keep the MVP honest: active-change fallback is a handoff to `openspec-apply-change`, not a false claim that plugin-owned worker dispatch or ledger mutation occurred.

## Non-Goals

- Do not generate, edit, or migrate `automation/task.json` ledgers in this change.
- Do not implement provider-backed worker dispatch, commits, pushes, MR creation, merge, deploy, or secret access.
- Do not make active-change fallback override an existing ledger, blocker, MR wait, invalid ledger, or dependency gate.
- Do not implement auto parallelism; `add-autopilot-auto-parallel-claims` remains the owner for automatic WIP decisions.
- Do not replace `next-step`; this change only gives explicit `/autopilot` a safe continuation path when OpenSpec changes already exist.

## Impact

- `/autopilot` will no longer report `no_ledgers` when unfinished active OpenSpec changes are available.
- Agents get a structured, reason-coded handoff to implement the selected OpenSpec change directly.
- Users can scope Autopilot to a specific change id without first creating a protected ledger.
- Existing ledger-backed Autopilot safety and runtime-deferred behavior stay intact.

## Validation

- Add failing tests for active-change discovery, selection, scoped handoff, ledger precedence, completed-change exclusion, archived-change exclusion, and no-work output.
- Run `npm run validate`.
- Run `npm test`.
- Run `npm run openspec:validate` or `openspec validate --all`.
- Run `npm run autopilot:validate -- <task-ledger.json>` only for ledger fixtures touched by the implementation.
