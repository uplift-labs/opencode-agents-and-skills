---
name: orchestrator
description: Use when a broad OpenCode task has 2+ independent tracks: split scope into bounded workers, launch task fan-out concurrently, synthesize reports, and use master-created temporary git worktrees when workers could interfere.
license: MIT
---

# Orchestrator

Use this skill to accelerate a large task when the scope is broad and independent tracks are visible. The master session splits the work, launches bounded `task` workers concurrently, decides whether each worker needs isolation, integrates reports, and owns final verification.

Do not use it for one small task, vague goals, serial dependency chains, or routine exploration a single assistant can finish. `task` creates child sessions and native task cards; `todowrite` is only the master's checklist.

Default bias: before doing broad work serially, run a quick fan-out check. If at least two tracks can progress independently with bounded scope and evidence, use this skill unless orchestration overhead or integration risk is higher than the expected speedup.

## Decision Gate

Parallelize only when workers can make progress without waiting on each other.

1. Stay in the master session for a single coherent task or unclear scope.
2. Use read-only fan-out in the current checkout for broad discovery, audits, inventories, and independent reviews; do not create worktrees unless commands have write side effects.
3. Use shared-checkout edit fan-out when write scopes are exact, non-overlapping, low-risk, commands will not mutate shared outputs, and rollback is simple.
4. Use master-prepared git worktrees when isolation would prevent interference, preserve main-checkout state, make review/rollback safer, or let independent risky edits run in parallel.
5. Ask the user before fan-out when the goal is ambiguous, local changes must be preserved across isolated workers, or acceptance/merge/cleanup policy is unclear.

## Cross-Skill Routing

Orchestrator wraps other skills; it does not replace their domain contracts. When another loaded skill exposes independent implementation, evidence, documentation, audit, or reviewer tracks, keep that skill's invariants in the master plan and delegate bounded slices through `orchestrator` workers.

Include relevant domain-skill rules in each worker prompt. Workers must not launch nested orchestration.

## Master Algorithm

The master owns decomposition, worker launch, synthesis, integration, verification, and cleanup.

1. Freeze the objective, constraints, risk level, and final validation command or evidence target.
2. Create a short `runID`, for example `orch-20260607-auth-ui`.
3. Define 2-6 workers with stable IDs (`w01`, `w02`). Prefer 3-5 workers; use more only when the repository naturally shards.
4. Give each worker one bounded mission, exact read scope, exact write scope or `none`, forbidden paths/actions, expected evidence, and success criteria.
5. Choose an execution surface for each worker: `current-checkout` or `temporary-worktree`. Base the choice on interference risk, not on a fixed example list.
6. If a worker needs a temporary worktree, create it in the master session before launch and pass the exact path and branch to the worker.
7. Launch independent workers as separate built-in `task` calls in the same assistant turn. Do not serialize workers that can run concurrently.
8. While workers run, do only non-overlapping master work. Do not duplicate a worker's assignment.
9. Accept only final report envelopes whose `runID` and `workerID` match the launch plan.
10. After each edit worker report, choose one path: accept and integrate, send the work back for focused rework, or deliberately discard it and clean up its temporary worktree.

Use the narrowest useful worker type: `explore` for codebase mapping, `general` for implementation/research, and available reviewer agents for read-only validation gates.

## Task Launch Shape

Put the namespace marker in both `description` and `command`:

```json
{
  "description": "[orch orch-20260607-auth-ui w01] inspect auth tests",
  "command": "orchestrator orch-20260607-auth-ui w01 read-only",
  "subagent_type": "general",
  "prompt": "<worker prompt>"
}
```

Launch all independent workers in one tool batch/message when the host supports it. Rely on native task cards for live status; do not spam polling updates.

## Worker Prompt Contract

Place this contract near the top of every worker prompt:

```text
You are worker <workerID> for orchestrator run <runID>.

Mission: <bounded mission>
Mode: <read-only|edit|review>
Read scope: <paths>
Write scope: <paths or none>
Forbidden: <paths/actions>
Execution surface: <current-checkout|temporary-worktree>
Assigned worktree: <path or n/a>
Assigned branch: <branch or n/a>
Verification: <commands or evidence expected>

Rules:
- Do not start recursive orchestrator runs or unrelated tasks.
- Do not ask the user questions. Return `status: "blocked"` or `status: "needs-review"` with the exact decision needed.
- Do not push, commit, merge, delete worktrees, or change remote state.
- Do not edit outside write scope. If scope is insufficient, return `status: "blocked"`.
- If execution surface is `temporary-worktree`, run all reads, edits, and commands from the assigned worktree path.
- If you edit files, run the most focused relevant verification you can.
- Return exactly one final ORCH_WORKER_REPORT envelope and no extra prose after it.
```

Workers must return:

```text
<ORCH_WORKER_REPORT version="1">
{
  "runID": "orch-20260607-auth-ui",
  "workerID": "w01",
  "status": "done",
  "executionSurface": "current-checkout",
  "summary": "Inspected auth tests and found no blocker.",
  "filesChanged": [],
  "testsRun": ["not run: read-only inspection"],
  "findings": [],
  "blockers": [],
  "worktree": null,
  "branch": null,
  "mergeNotes": "No merge action needed."
}
</ORCH_WORKER_REPORT>
```

Use `status: "blocked"` for missing scope, permissions, setup, or unsafe ambiguity. Use `status: "needs-review"` when the result is useful but needs master judgment.

## Execution Surface Decision

Worktree isolation is a per-worker decision, not a mandatory ceremony. Choose the execution surface immediately before launch.

Use `current-checkout` when the worker is read-only, or when its edits are narrowly scoped, low-risk, non-overlapping with other active writers, and unlikely to trigger shared generated outputs or broad formatting.

Use `temporary-worktree` when any realistic interference risk exists: overlapping files, broad refactors, generated/lock/migration/global files, commands that may mutate unexpected paths, long-running edits that need independent review, rollback-sensitive work, or preserving the main checkout's dirty state.

These are signals, not exhaustive rules. When unsure, either ask the user or isolate the worker if the extra setup cost is lower than the conflict risk.

For each `temporary-worktree` edit worker, the master prepares the worktree before launch:

```text
git status --short
git worktree add -b orchestrator/<runID>/<workerID> <worktree-path> HEAD
git -C <worktree-path> status --short
```

Rules:

- Do not create a worktree from stale `HEAD` if the worker needs uncommitted main-checkout changes; ask the user or avoid worktree isolation.
- Prefer a path outside the main checkout, such as `../<repo-name>-worktrees/<runID>/<workerID>`.
- Pass the exact path and branch to the worker.
- Workers never create, remove, prune, or clean up worktrees.
- The master must not launch a worktree worker before the assigned worktree exists and has a clean `git status --short` baseline.
- Default integration is patch-based: inspect `git -C <worktree> diff --stat`, review `git -C <worktree> diff --binary`, then apply an accepted patch from the main checkout.
- When multiple worktrees changed the same files, integrate one accepted result at a time, rerun focused verification after each integration, and send later workers back for rework if their patch no longer applies cleanly.
- Cherry-pick only master-created or user-requested commits; worker changes normally stay as diffs for master review.
- Cleanup happens in the master session after accepted changes are integrated and verified, or after the master deliberately discards the worker result.

If work needs rework, do not clean up the worktree first. Continue or relaunch the worker with the same worktree path, narrowed instructions, and the concrete review findings.

## Synthesis

After reports arrive, show a compact dashboard:

```text
Orchestrator run: orch-20260607-auth-ui

Workers
w01 done          inspect auth tests        no changes
w02 done          review sidebar UX         changed 2 files
w03 needs-review  regression review         blocker: missing fixture

Integration
1. Resolve blockers or discard blocked worker output.
2. Send incomplete work back for focused rework when the worktree still contains useful partial progress.
3. Review and integrate accepted diffs.
4. Run final verification.
5. Run post-implementation reviewer gates when material changes were made and reviewers are available.
6. Clean up worktrees only after integration and verification, or after deliberate discard.
```

If a task card is still running, say which worker is pending and continue only with non-overlapping work.

## Hard Rules

- Never auto-merge worker changes.
- Never claim a worker finished without a matching report envelope.
- Never widen worker scope silently.
- Never let two workers edit the same target in the same checkout. If independent workers need the same files, isolate them in separate worktrees and integrate serially.
- Never run parallel edits against lockfiles, generated artifacts, migrations, or global config unless each worker is isolated and the master has a clear serial integration plan.
- Never ask workers to create or delete their own temporary worktrees for code changes.
- Never delete a worktree that may need rework or still contains useful unintegrated evidence.
- Prefer fewer workers over unsafe parallel writes; prefer more workers over serial work when scopes are independent.
