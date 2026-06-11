---
name: orchestrator
description: Use ONLY for broad OpenCode work with clear independent tracks that need coordinated task fan-out, report synthesis, or edit isolation; skip small, serial, or unclear tasks.
license: MIT
---

# Orchestrator

Use this skill only when broad work has visible independent tracks and coordination overhead is worth it. The main session becomes the master: it splits scope, launches bounded `task` workers, reconciles reports, integrates accepted work, validates, runs reviewer gates, and owns user-facing decisions.

This is prompt-only orchestration. It can coordinate native `task` workers, but it is not a runtime service: it cannot persist authoritative state across restart, enforce path scopes, subscribe to events, recover child sessions, or manage workspaces without a separate plugin/tool layer.

Do not use this skill for small tasks, vague goals, serial dependency chains, single-file work, or routine exploration a single assistant can finish.

If OpenSpec Autopilot is available and the work is a ready OpenSpec task queue, strict typed workflow, or plugin-owned worker/state run, use `openspec-autopilot` instead. Autopilot is the process control plane; this skill is only a prompt-only fallback or non-Autopilot fan-out helper.

## Entry Gate

Enter master-orchestrator posture only when all are true:

- The user asked for broad implementation, audit, migration, documentation hardening, multi-area review, or similar work that naturally splits into independent tracks.
- At least two tracks can be named with bounded read/write scope, success criteria, and verification evidence.
- Fan-out, independent review, or edit isolation improves speed, coverage, safety, or reviewer confidence enough to justify coordination.
- The main session can still own integration, validation, reviewer gates, cleanup decisions, and final synthesis.

Stay serial when goals are unclear, acceptance criteria are missing, write scopes overlap unsafely, or reconciling workers would cost more than doing the work directly.

Ask the user before fan-out only when ambiguity, destructive/remote action, local dirty-state preservation, acceptance policy, or cleanup/merge policy is truly user-owned.

## Cross-Skill Routing

- If lane selection, requirements intake, OpenSpec creation, architecture decisions, or planning are still needed, use `adaptive-delivery`, `deep-task-planning`, OpenSpec, or domain skills first.
- Orchestrator does not replace domain contracts. Include relevant domain-skill constraints in each worker prompt.
- Planning workers must use `deep-task-planning` and report whether it was loaded; otherwise treat the report as `needs-review` or `blocked`.
- Workers must not start nested orchestrator runs.

## Master Algorithm

1. Freeze objective, constraints, non-goals, risk level, and final validation target.
2. Decide serial vs orchestrated and record the reason when entering orchestration.
3. Create a short internal `runID` and 2-6 stable worker IDs.
4. For each worker define mission, read scope, write scope or `none`, forbidden paths/actions, expected evidence, verification, and report status expectations.
5. Choose the cheapest safe execution surface: current checkout for read-only or exact non-overlapping edits; temporary worktree only when isolation materially reduces conflict, rollback, or dirty-state risk.
6. Launch independent workers concurrently via `task`; do not duplicate their assigned work in the master session.
7. Collect only final reports matching the assigned run/worker IDs.
8. Reconcile reports against scope, blockers, tests, changed files, and acceptance criteria.
9. Integrate accepted changes serially; send incomplete work back for focused rework or deliberately discard it.
10. Run focused validation after material integration when practical, then final validation for the whole task.
11. Run relevant read-only reviewer gates after material changes when available and proportional; include `code-quality-reviewer` when integrated code changes affect maintainability, readability, file navigation, or duplication.
12. Report changed files, validation, review gate, residual risks, blockers, and ready-to-land status.

The master may do only initial splitting, non-overlapping shared context reads, integration fixes, validation, reviewer-gate orchestration, and final synthesis. If the master starts doing substantial worker work, delegate it or exit orchestration with a reason.

## Worker Prompt Contract

Place this near the top of each worker prompt:

```text
You are worker <workerID> for orchestrator run <runID>.

Mission: <bounded mission>
Mode: <read-only|edit|review|planning>
Read scope: <paths/evidence>
Write scope: <paths or none>
Forbidden: <paths/actions>
Execution surface: <current-checkout|temporary-worktree|n/a>
Verification: <commands/evidence expected>

Rules:
- Do not start recursive orchestrator runs or unrelated tasks.
- Do not ask the user questions. Return `Status: blocked` or `Status: needs-review` with the exact decision needed.
- Do not commit, push, merge, delete worktrees, or change remote state.
- Do not edit outside write scope. If scope is insufficient, return `Status: blocked`.
- For behavior changes, add/update the focused failing, acceptance, or characterization test before implementation unless infeasible; report the exception and substitute evidence.
- Run the most focused relevant verification you can, or explain the blocker.
- Return exactly one final `ORCH_WORKER_REPORT` envelope.
```

Workers return:

```markdown
<ORCH_WORKER_REPORT>
Run: <runID>
Worker: <workerID>
Status: done | blocked | needs-review
Planning Skill: deep-task-planning loaded | deep-task-planning unavailable | not applicable

**Summary**
- <what was done or found>

**Changed Files**
- <path or none>

**Verification**
- <command/result or skipped reason>

**Findings**
- <finding or none>

**Blockers**
- <blocker or none>

**Handoff**
- <integration/review notes>
</ORCH_WORKER_REPORT>
```

Reject or request focused rework for malformed reports, missing planning-skill status for planning workers, out-of-scope edits, weak evidence, or unreadable findings.

## Isolation Rules

- Use current checkout for read-only workers and narrow low-risk non-overlapping edits.
- Use temporary worktrees only when commands or edits may interfere, broad generated/global files are involved, rollback must be isolated, or preserving main checkout state matters.
- The master creates, tracks, integrates from, and cleans up temporary worktrees. Workers never create or delete their own worktrees.
- Integrate isolated worker diffs one at a time and rerun focused validation after each material integration when practical.
- Never auto-merge worker changes.

## Completion Gate

Before final response, close or explicitly skip with reasons:

- `Scope`: objective, constraints, and non-goals stayed stable, or changes were reported.
- `Workers`: every launched worker has a matching report, is reworked, or is deliberately discarded.
- `Reconciliation`: findings, blockers, changed files, and merge notes were reviewed by the master.
- `Integration`: accepted changes were integrated serially; rejected changes were not silently used.
- `Validation`: focused and final validation ran, or concrete blockers were reported.
- `Review`: reviewer gate ran when material and available, or was skipped with rationale.
- `Cleanup`: temporary worktrees were cleaned up or retained with reason.
- `Handoff`: ask the user only when a real blocker or user-owned decision remains; otherwise report status, validation, residual risks, and ready-to-land state.

## Hard Rules

- Never commit, push, merge, delete source artifacts, or change remote state unless the user explicitly requested it and repository policy allows it.
- Never claim a worker finished without a matching report envelope.
- Never widen worker scope silently.
- Never let two workers edit the same target in the same checkout.
- Never run parallel edits against lockfiles, generated artifacts, migrations, or global config unless isolated and integrated serially.
- Never finish before the Completion Gate is satisfied.
- Prefer fewer workers over unsafe or noisy fan-out.
