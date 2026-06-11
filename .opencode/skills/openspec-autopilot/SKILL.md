---
name: openspec-autopilot
description: Use when the user explicitly says /autopilot or autopilot, asks to continue a ready OpenSpec task queue until blocker/MR/limit, needs strict typed phases, safe parallel OpenSpec work, or says работай inside an active Autopilot context.
license: MIT
---

# OpenSpec Autopilot

Use this skill when OpenSpec work should be controlled by the Autopilot plugin rather than by ad-hoc model decisions.

Use it for explicit `/autopilot` or `autopilot`, active-context `работай`, ready OpenSpec task ledgers/queues, strict task-type phase enforcement, large epics with independent OpenSpec tracks, or ready research/planning ledger tasks that need durable evidence and gates.

Do not use it for casual codebase questions, one obvious small edit, OpenSpec discovery with no ready work (`next-step`), a single accepted change that `openspec-apply-change` can finish directly, or non-OpenSpec fan-out where prompt-only `orchestrator` is enough.

## First Action

One high-level call should advance as far as safely possible. Unless the user asked only for status, stop, collect, or blocker-answer, call:

```json
{ "tool": "autopilot_run_next" }
```

Then follow the returned `nextRecommendedCall`, `questions`, `blockers`, and `mrsWaiting`. Do not manually advance ledger state when a tool is unavailable or returns an MVP no-op; report the limitation.

## Authority Boundary

| Owner | Responsibility |
| --- | --- |
| Plugin | Authoritative process/state machine, task status, dependencies, legal transitions, review/MR verdict intake, locks, worker/workspace/session IDs, events, recovery, protected writes. |
| Agent | Calls high-level tools, explains output, asks only returned blocker questions, and performs assigned worker/reviewer work when dispatched. |
| Worker | Executes bounded Analyze/Implementation/Review/Acceptance work and returns reports. Never edits automation ledgers. |
| User | Decides true blockers: credentials, unsafe scope, secrets, MR review/merge, protected branches, deploys, or policy exceptions. |

Protected paths are plugin-owned: `openspec/changes/*/automation/task.json`, `openspec/changes/*/automation/feedback/**`, `openspec/changes/*/automation/artifacts/**`, and `.autopilot/**`.

## Public Tools

| Tool | Use |
| --- | --- |
| `autopilot_run_next` | Main control-plane call: discover, classify, claim, dispatch/collect, transition, MR-sync when safe, and stop only at blocker/MR/limit. |
| `autopilot_status` | Concise tasks/runs/workers/blockers/MRs status. |
| `autopilot_collect` | Gather completed worker reports and let the plugin attempt legal advancement. |
| `autopilot_answer_blocker` | Apply the user's selected blocker option, then continue only if recommended. |
| `autopilot_stop` | Pause or cancel a run/task. |

Expected `autopilot_run_next` output:

```json
{
  "outcome": "advanced|blocked_for_user|waiting_for_mr|idle|failed",
  "tasksStarted": [],
  "tasksAdvanced": [],
  "mrsWaiting": [],
  "questions": [],
  "blockers": [],
  "nextRecommendedCall": "autopilot_status|autopilot_collect|autopilot_answer_blocker|null",
  "summary": "..."
}
```

## Task-Type Policy

Statuses are `Ready`, `Analyze`, `Implementation`, `Review`, `Acceptance`, `Done`, `Blocked`, `Failed`, and `Cancelled`. The plugin and validator own legal transitions; agents only interpret results.

| Task Type | Required Behavior |
| --- | --- |
| `feature` | Deep Analyze, test-first implementation, code/test review, MR. |
| `bugfix` | Reproduction/characterization first, regression test where feasible, implementation, review, MR. |
| `refactor` | Behavior-preserving scope, existing/characterization tests, code-quality review, MR. |
| `docs`/`typo` | Proportional Analyze, minimal docs edit, `testDecision: not-applicable` or docs lint, explicit reviewer skips for tiny typo. |
| `research`/`planning` | Evidence plan/artifact or plan/spec only, no product code, `testDecision: not-applicable`, readiness/evidence review when useful. |
| `tooling`/`config` | TypeScript/schema/config changes with fixture or validator gate; deployment/config review by signal. |
| `performance`/`protocol` | Benchmark/profile or golden/negative protocol evidence plus domain reviewers. |

Critical evidence gates:

- Every task needs `testDecision`.
- Direct `Ready -> Implementation` is only for `typo` or explicit `autoMinimalAnalyze`.
- `Analyze -> Implementation` needs plan summary, slices, scope, and test strategy or no-implementation reason.
- `Analyze -> Review` is only for `research`/`planning` with artifact and no-implementation reason.
- `Implementation -> Review` needs changed files or no-op reason, validation evidence or skipped reason, and secret scan status or placeholder.
- `Review -> Acceptance` needs reviewer decisions or explicit reviewer skip reasons.
- `Acceptance -> Done` needs MR merged evidence, or explicit no-MR policy for non-file-changing research/planning.
- Any transition to `Blocked` needs blocker reason and recommended options when user action is required.

## Reviewer And Test Policy

Do not run every reviewer by default. For each relevant signal, either require the reviewer or record an explicit skip reason.

| Signal | Reviewer |
| --- | --- |
| Non-trivial code diff | `code-quality-reviewer` |
| Behavior/API change | `test-coverage-reviewer` |
| Unclear scope/plan | `implementation-readiness-reviewer` |
| Skills/agents/instructions | `instruction-artifact-reviewer` |
| Config/deploy/package | `deployment-config-reviewer` |
| Performance/SLO/load | `performance-reliability-reviewer` |
| Protocol/API or wire/framing | `protocol-api-reviewer` or `wire-protocol-reviewer` |
| Legacy compatibility evidence | `legacy-client-compatibility-reviewer` or `legacy-evidence-reviewer` |

Behavior changes need a focused failing, acceptance, or characterization test before implementation unless infeasible with reason. Docs typos, research, and planning usually use `not-applicable` with reason.

## Autonomy And Secrets

Allowed only under explicit Autopilot invocation, repository/user policy, and OpenCode permissions: create `autopilot/*` branches, commit, push `autopilot/*`, create/update MR, run validation, and read provider checks/comments.

Never merge, push protected branches, force-push non-owned branches, deploy, edit/read secrets, or destructively clean outside plugin-owned worktrees without explicit approval. Never allow secrets in git; MVP ledgers require secret scan status or placeholder before `Implementation -> Review`.

## Blocker Questions

Ask only questions returned by the plugin. Preserve labels, especially `(Recommended)`, and pass the selected `questionId`, `taskId`, label, and action to `autopilot_answer_blocker`.

If `outcome` is `waiting_for_mr`, summarize MR links and wait for review/merge. If `outcome` is `failed` or blockers mention unsafe state, failed validation, secret finding, missing credentials/tooling, or ledger drift, stop and report the blocker.

## Reused Skills

Worker prompts may reuse `deep-task-planning`, `openspec-apply-change`, `orchestrator`, `next-step`, `merge-request-author`, `merge-request-review-loop`, and relevant reviewers. These guide work only; they do not replace the plugin as process authority.
