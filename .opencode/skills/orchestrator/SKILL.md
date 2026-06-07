---
name: orchestrator
description: Use ONLY for broad OpenCode work with clear independent tracks that need coordinated task fan-out, report synthesis, or edit isolation; skip small, serial, or unclear tasks.
license: MIT
---

# Orchestrator

Use this skill only to accelerate broad work when independent tracks are visible and coordination overhead is worth it. The current main session becomes the master-orchestrator for that work: it splits scope, launches bounded `task` workers concurrently, decides whether each worker needs isolation, integrates reports, and owns final verification.

Do not use it for one small task, vague goals, serial dependency chains, or routine exploration a single assistant can finish. `task` creates child sessions and native task cards; `todowrite` is only the master's checklist.

Default posture: stay serial unless fan-out clearly improves coverage, speed, or isolation. A quick fan-out check is enough; if value is marginal, scope is unstable, or worker coordination would add noise, do not use this skill.

## Auto Master-Orchestrator Gate

The main session may enter master-orchestrator posture on the fly without an explicit user command when all of these are true:

- The user asked for broad implementation, audit, migration, documentation hardening, multi-area review, or another task that naturally splits into independent tracks.
- At least two worker tracks can be named with bounded read/write scope, success criteria, and verification evidence.
- Fan-out, independent review, or edit isolation is likely to improve speed, coverage, safety, or reviewer confidence enough to justify coordination overhead.
- The main session can still own integration, tests, review gates, final validation, and user-facing decisions.

Do not enter master-orchestrator posture for small tasks, single-file changes, tightly coupled reasoning, unclear goals, serial dependency chains, missing acceptance criteria, or work where worker outputs would be harder to reconcile than doing the task directly.

When entering this posture, send one concise progress update before dispatch, for example: `Entering master-orchestrator mode: 3 independent tracks, read-only discovery plus focused implementation and review gates.` Do not announce this mode for routine parallel tool calls.

Exit the posture and continue serially if discovery shows the tracks are dependent, write scopes overlap unsafely, acceptance criteria are unstable, or the remaining work is smaller than the orchestration overhead. State the exit reason briefly.

## Decision Gate

Parallelize only when workers can make progress without waiting on each other.

1. Stay in the master session for a single coherent task or unclear scope.
2. Use read-only fan-out in the current checkout for broad discovery, audits, inventories, and independent reviews; do not create worktrees unless commands have write side effects.
3. Use shared-checkout edit fan-out when write scopes are exact, non-overlapping, low-risk, commands will not mutate shared outputs, and rollback is simple.
4. Use master-prepared git worktrees when isolation would prevent interference, preserve main-checkout state, make review/rollback safer, or let independent risky edits run in parallel.
5. Ask the user before fan-out when the goal is ambiguous, local changes must be preserved across isolated workers, or acceptance/merge/cleanup policy is unclear.

## Cross-Skill Routing

Orchestrator wraps other skills only when their work naturally splits into independent bounded tracks. It does not replace domain contracts; keep the loaded skill's invariants in the master plan and delegate only slices that benefit from coordinated fan-out.

If the task still needs business/requirements intake, lane selection, OpenSpec creation, architecture decisions, or user approval before workstream execution, route through `adaptive-delivery` or the relevant planning/spec skill before entering orchestrator posture.

Include relevant domain-skill rules in each worker prompt. Workers must not launch nested orchestration.

Planning workers are a special case: any worker whose mission is planning, detailed planning, execution planning, or plan-first discovery MUST load/use `deep-task-planning` before producing the plan. Treat `deep-task-planning` as the selected planning contract; planning workers must not re-route to `adaptive-delivery` or nested orchestration. The master must put that requirement in the worker prompt and must require the final report to state `Planning Skill: deep-task-planning loaded`. If a planning worker reports that the skill was unavailable or scope is too unstable, treat the report as `needs-review` or `blocked`, not as a completed normal plan.

## Master Algorithm

The master owns decomposition, worker launch, synthesis, integration, verification, and cleanup.

1. Intake: freeze the objective, constraints, risk level, non-goals, and final validation command or evidence target.
2. Suitability gate: decide whether to stay serial, use simple subagents, or enter master-orchestrator posture. Record the reason in one line when entering or declining orchestration for broad work.
3. Work package plan: create a short internal `runID`, for example `orch-20260607-auth-ui`. Do not put it in user-visible task titles.
4. Define 2-6 workers with stable IDs (`w01`, `w02`). Prefer 3-5 workers; use more only when the repository naturally shards.
5. Give each worker one bounded mission, exact read scope, exact write scope or `none`, forbidden paths/actions, expected evidence, and success criteria.
6. Choose an execution surface for each worker: `current-checkout` or `temporary-worktree`. Base the choice on interference risk, not on a fixed example list.
7. If a worker needs a temporary worktree, create it in the master session before launch and pass the exact path and branch to the worker.
8. Dispatch: launch independent workers as separate built-in `task` calls in the same assistant turn. Do not serialize workers that can run concurrently.
9. Supervise: while workers run, do only non-overlapping master work such as integration prep, validation planning, or reading shared context. Do not duplicate a worker's assignment.
10. Collect: accept only final report envelopes whose `Run` and `Worker` fields match the launch plan.
11. Reconcile: compare worker outputs against scope, conflicts, tests, findings, blockers, and acceptance criteria. Send incomplete work back for focused rework when useful.
12. Integrate: after each edit worker report, choose one path: accept and integrate, send the work back for focused rework, or deliberately discard it and clean up its temporary worktree.
13. Verify: run focused tests after each material integration when practical, then final validation for the whole task.
14. Review gate: run relevant read-only reviewer/subagent gates after material changes when available and proportional; otherwise record why the review gate was skipped.
15. Cleanup and final answer: clean up accepted/discarded worktrees only after integration decisions, then report status, validation, review gate, residual risks, and changed files.

Use the narrowest useful worker type: `explore` for codebase mapping, `general` for implementation/research, and available reviewer agents for read-only validation gates.

## Master Work Boundaries

In master-orchestrator posture, the main session should not perform worker-assigned implementation or review directly. The master may directly do only:

- Initial context gathering needed to split work safely.
- Worker dispatch, status synthesis, conflict resolution, patch integration, and cleanup.
- Tiny integration fixes that are faster and safer than another worker round.
- Final validation, reviewer gate orchestration, and user-facing decisions.
- Serial fallback after explicitly exiting orchestration.

If the master starts doing substantial worker work, either delegate it as a new bounded worker or exit master-orchestrator posture with a reason.

## Task Launch Shape

The `description` is the human task-card title. Keep it short and clean:

- Use 2-6 words.
- Do not include brackets, `runID`, `workerID`, mode names, or orchestration tags.
- Start with the work, for example `Inspect auth tests`, not the routing metadata.
- Put orchestration metadata in `command` and the worker prompt.

```json
{
  "description": "Inspect auth tests",
  "command": "orch orch-20260607-auth-ui w01",
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
- Do not ask the user questions. Return `Status: blocked` or `Status: needs-review` with the exact decision needed.
- Do not push, commit, merge, delete worktrees, or change remote state.
- Do not edit outside write scope. If scope is insufficient, return `Status: blocked`.
- If execution surface is `temporary-worktree`, run all reads, edits, and commands from the assigned worktree path.
- If you edit files, run the most focused relevant verification you can.
- Return exactly one final `ORCH_WORKER_REPORT` envelope using the Markdown shape below. Keep it human-readable; do not return JSON unless the master explicitly asks for machine-readable data.
- Formatting is part of the contract: do not return the report as a single paragraph or inline key/value run. Use blank lines between sections, bullets for multi-item content, and fenced code blocks for long commands or snippets.
- If this is a planning worker, load/use `deep-task-planning` before planning. Include a `Planning Skill` field with one of: `deep-task-planning loaded`, `deep-task-planning unavailable`, `not applicable`. If unavailable, set `Status: blocked` or `Status: needs-review` and explain why.
```

Workers must return:

```markdown
<ORCH_WORKER_REPORT>
Run: orch-20260607-auth-ui
Worker: w01
Status: done
Surface: current-checkout
Planning Skill: deep-task-planning loaded

**Summary**
Inspected auth tests and found no blocker.

**Changed Files**
- none

**Verification**
- Not run; read-only inspection.

**Findings**
- none

**Blockers**
- none

**Handoff**
- No merge action needed.

</ORCH_WORKER_REPORT>
```

Use `Status: blocked` for missing scope, permissions, setup, or unsafe ambiguity. Use `Status: needs-review` when the result is useful but needs master judgment.

The master should reject or request focused rework for malformed reports that collapse sections into one line, omit required planning-skill status for planning workers, or make findings unreadable for the user-facing synthesis.

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

## Test And Review Gates

Testing and review are first-class phases, not optional afterthoughts.

- Each edit worker should run the most focused verification it can and report the exact command or reason for not running it.
- The master reruns focused validation after integrating material worker changes when practical.
- The master runs final validation for the whole task, or records a concrete blocker such as missing credentials, unavailable service, unsupported platform, or user-forbidden command.
- After material code, config, protocol, deployment, or instruction-artifact changes, the master runs the most relevant read-only reviewer/subagent gate when available and proportional.
- If no suitable reviewer is available, the task is too small, or the user mode forbids subagents, record `Review gate: skipped` with the reason.
- A failed test or material reviewer finding reopens integration/rework; do not move to final answer until it is fixed, intentionally deferred with rationale, or blocked.

## Anti-Rush Completion Gate

Before final response, verify all items below are closed or explicitly skipped with reasons:

- `Scope`: objective, constraints, and non-goals stayed stable, or changes were reported.
- `Workers`: every launched worker has a matching report envelope or is explicitly cancelled/discarded.
- `Reconciliation`: findings, blockers, changed files, and merge notes were reviewed by the master.
- `Integration`: accepted changes were integrated serially with conflicts resolved; rejected changes were not silently used.
- `Tests`: focused and final validation were run, or skipped with concrete blockers.
- `Review`: reviewer/subagent gate was run when material and available, or skipped with rationale.
- `Cleanup`: temporary worktrees were cleaned up after integration/discard, or retained with reason.
- `Final`: residual risks and next actions are clear to the user.

## Hard Rules

- Never auto-merge worker changes.
- Never commit, push, merge, delete source artifacts, or change remote state unless the user explicitly requested it and repository policy allows it.
- Never claim a worker finished without a matching report envelope.
- Never widen worker scope silently.
- Never put run IDs, worker IDs, or bracketed orchestration tags in task descriptions; use `command` and the worker prompt for metadata.
- Never finish a master-orchestrator run before the Anti-Rush Completion Gate is satisfied.
- Never let the master silently do substantial worker-assigned implementation while still claiming to orchestrate.
- Never let two workers edit the same target in the same checkout. If independent workers need the same files, isolate them in separate worktrees and integrate serially.
- Never run parallel edits against lockfiles, generated artifacts, migrations, or global config unless each worker is isolated and the master has a clear serial integration plan.
- Never ask workers to create or delete their own temporary worktrees for code changes.
- Never delete a worktree that may need rework or still contains useful unintegrated evidence.
- Prefer fewer workers over unsafe or noisy fan-out; stay serial when independence, evidence value, or integration path is weak.
