# Proposal: Add Autopilot Change Graph Scheduling

## Why

Autopilot task ledgers already contain `priority` and `dependencies`, and runtime selection already uses both fields. However, newly materialized active OpenSpec changes currently receive hardcoded scheduling values: `priority: "medium"` and `dependencies: []`.

That makes the active queue look flatter than it is. Users cannot see which changes can be implemented independently, which changes are blocked by earlier changes, or why Autopilot selected one change before another.

## What Changes

- Add deterministic Change Graph scheduling for OpenSpec active changes and Autopilot task ledgers.
- Infer `priority` and confirmed `dependencies` when `openspec/changes/<change>/automation/task.json` is created.
- Store scheduling evidence in optional ledger metadata under `schedule` so the priority and blockers are explainable.
- Expose a machine-readable `changeGraph` in Autopilot status/run output with parallel-ready changes, dependency-blocked changes, implementation levels, conflicts, and cycle diagnostics.
- Show inferred scheduling evidence for unfinished active changes before a ledger exists, while keeping ledger-backed state authoritative once present.

## Goals

- Make `automation/task.json` immediately useful for queue ordering when a change is materialized.
- Let users ask Autopilot which changes can be implemented in parallel right now.
- Preserve deterministic, evidence-backed behavior and avoid LLM-guessed blockers.
- Keep existing ledgers valid and preserve current default behavior when no scheduling evidence exists.

## Non-Goals

- Do not make model prose or fuzzy semantic guesses authoritative for blockers.
- Do not auto-start parallel implementation beyond existing guarded runtime policies, locks, and worktree requirements.
- Do not treat ordinary write-scope overlap as a dependency; overlap is conflict evidence unless an explicit or structural order is proven.
- Do not migrate or rewrite existing ledgers unless a separate explicit migration task is approved.
- Do not auto-merge, push, deploy, or bypass reviewer/MR/fan-in gates.

## Impact

- `openspec/changes/<change>/automation/task.json` gains an optional `schedule` evidence object.
- Materialized ledgers use inferred priority/dependencies instead of unconditional `medium`/`[]` when evidence exists.
- Active-change queue previews become more useful before ledger materialization.
- Autopilot output gains a graph-oriented view that is easier to consume by users, tests, and future automation.
- Scheduling logic remains conservative: uncertain dependencies are visible as candidates or conflicts, but do not block work.

## Validation

- Add focused failing tests before implementation for schedule validation, graph inference, materialization, active-change preview, and output shape.
- Run `npm run validate`.
- Run `npm test`.
- Run `npm run openspec:validate` or `openspec validate --all`.
- Run `npm run autopilot:validate -- <task-ledger.json>` for any new or changed ledger fixture.
