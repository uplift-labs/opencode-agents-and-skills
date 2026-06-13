# Proposal: Materialize Autopilot Task Ledgers

## Why

Autopilot can now discover unfinished active OpenSpec changes from `tasks.md`, but that fallback is read-only. It returns `active_change_handoff` and asks the agent to continue through `openspec-apply-change` without creating `openspec/changes/<change>/automation/task.json`.

That keeps protected Autopilot state safe, but it also means explicit Autopilot work often never enters the phase ledger that users expect: `Ready -> Analyze -> Implementation -> Review -> Acceptance -> Done`. Users can start a parallel or long-running session and still see only `tasks.md`, because no plugin-owned materialization path exists.

## What Changes

- Add a plugin-owned materialization path that creates `openspec/changes/<change>/automation/task.json` whenever explicit Autopilot starts work on a selected OpenSpec change.
- Support the actual expected UX: plain `/autopilot` chooses the deterministic primary active change, and `/autopilot + prompt` materializes the change selected or created by prompt intake before work begins.
- Keep discovery/status/check paths read-only; only claim-capable explicit run actions may materialize a ledger.
- Derive a minimal valid ledger from existing OpenSpec artifacts and deterministic defaults, then validate it with the existing ledger validator before publishing it.
- Return machine-readable evidence when a ledger is created, including the change id, ledger path, validation result, and next safe Autopilot action.
- Preserve ledger precedence: if `automation/task.json` already exists, Autopilot evaluates it and never regenerates or overwrites it during materialization.
- Update command, skill, README, and drift tests so users can see who creates `task.json` and when.

## Goals

- Make explicit `/autopilot` create the missing task ledger for the deterministic selected active change before implementation starts.
- Make `/autopilot + prompt` create the missing task ledger after prompt intake resolves the prompt to an accepted OpenSpec change, before Autopilot-controlled work starts.
- Let subsequent Autopilot calls use ledger-backed phases instead of falling back to `active_change_handoff` forever.
- Keep agents and workers out of protected ledger writes; the plugin/controller owns creation, validation, and publication.
- Avoid surprise writes from passive triggers, status calls, cheap checks, or casual codebase questions.
- Make ledger creation idempotent, auditable, deterministic, and rollback-safe on validation failure.

## Non-Goals

- Do not fully implement free-form prompt intake in this change; when prompt intake resolves or creates an accepted change, materialization becomes mandatory before work starts.
- Do not overwrite, migrate, or repair an existing `automation/task.json` in this change.
- Do not implement full worker dispatch, branch/worktree creation, commit, push, MR creation, merge, deploy, or secret access.
- Do not make passive file watcher or status events perform protected writes.
- Do not infer fuzzy task intent from prose beyond documented deterministic sources and safe defaults.

## Materialization Policy Summary

| Scenario | Behavior |
| --- | --- |
| Plain `/autopilot` with unfinished active changes and no selected ledger | Deterministically select the primary active change, create and validate `automation/task.json`, then return creation evidence. |
| `/autopilot + prompt` resolves to an accepted change with no ledger | Create and validate `automation/task.json` for that resolved change before starting work. |
| Internally resolved active change with no ledger | Create and validate `automation/task.json`, then return creation evidence. |
| Internally resolved active change with existing ledger | Do not create; evaluate existing ledger. |
| Internally resolved missing, archived, complete, or unreadable change | Do not create; return blocked or no-actionable evidence. |
| Unscoped explicit run with multiple unfinished active changes and no ledgers | Materialize the deterministic selected primary change and report non-selected candidates as evidence. |
| `autopilot_status`, cheap checks, passive triggers, file watcher events | Read-only; never materialize. |

## Impact

- Users will see `openspec/changes/<change>/automation/task.json` appear when Autopilot explicitly starts work on a selected active change, even when they used plain `/autopilot` without a `changeId`.
- Existing active-change fallback remains useful as a safe pre-materialization discovery and handoff path.
- Ledger-backed validation, phase policy, reviewer gates, MR policy, evidence checks, and future parallel runtime work can operate on newly materialized changes.
- Repository and instruction artifacts need synchronized wording to remove the current ambiguity around who creates `task.json`.

## Validation

- Add focused failing tests for selected-change materialization, prompt-resolved materialization, idempotence, no-write cases, validation rollback, output contract, and read-only trigger safety before implementation.
- Run `npm run validate`.
- Run `npm test`.
- Run `npm run openspec:validate` or `openspec validate --all`.
- Run `npm run autopilot:validate -- <materialized-ledger-fixture>` for generated fixture ledgers.
- Run `instruction-artifact-reviewer` after command, skill, README, or prompt wording changes.
