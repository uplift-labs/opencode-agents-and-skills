---
name: openspec-autopilot
description: Use when the user explicitly says /autopilot or autopilot, asks to inspect or continue a ready OpenSpec task queue until blocker/MR/limit, needs strict typed phases, safe parallel OpenSpec work with plugin/runtime selection evidence, or says работай inside an active Autopilot context; current MVP may return reasonCode ready_runtime_deferred instead of dispatching.
license: MIT
---

# OpenSpec Autopilot

Use this skill when OpenSpec work should be controlled by the Autopilot plugin rather than by ad-hoc model decisions.

Use it for explicit `/autopilot` or `autopilot`, active-context `работай`, ready OpenSpec task ledgers/queues, strict task-type phase enforcement, safe parallel OpenSpec work when plugin/runtime selection evidence is available, or ready research/planning ledger tasks that need durable evidence and gates. Current MVP may stop with `reasonCode: "ready_runtime_deferred"` or another no-op reason code when real claim, dispatch, MR sync, or ledger mutation would be required.

Do not use it for casual codebase questions, one obvious small edit, OpenSpec discovery with no ready work (`next-step`), a single accepted change that `openspec-apply-change` can finish directly, or non-OpenSpec fan-out where prompt-only `orchestrator` is enough.

## First Action

One high-level call should advance as far as safely possible. Unless the user asked only for status, stop, collect, or blocker-answer, call `autopilot_run_next`. If the user or `/autopilot` command supplied an explicit OpenSpec change or Autopilot task scope, pass it as `changeId` or `taskId`; call with no args only when no scope is supplied:

```json
{ "tool": "autopilot_run_next" }
```

```json
{ "tool": "autopilot_run_next", "args": { "changeId": "<change-id>" } }
```

```json
{ "tool": "autopilot_run_next", "args": { "taskId": "<task-id>" } }
```

Pass both `changeId` and `taskId` only when both scopes were explicitly supplied and should intersect.

Then prefer the returned `nextActions[]` guidance, using `nextRecommendedCall` only as a compatibility fallback. Ask only returned `questions`, summarize `blockers` and `mrsWaiting`, and do not manually advance ledger state when a tool is unavailable or returns an MVP no-op; report the limitation and `reasonCode`.

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
| `autopilot_run_next` | Main control-plane call: discover/classify current ledgers and return authoritative actionability. Default MVP behavior stops with deferred/no-op output when mutation would be needed; explicit claim harness state may return validation-only `advanced`/`tasksStarted` evidence for one selected Ready task without protected-file mutation. |
| `autopilot_status` | Concise tasks/runs/workers/blockers/MRs status. |
| `autopilot_collect` | Gather plugin-owned worker reports and validate legal advancement; may return validation-only `advanced` evidence for accepted in-memory report transitions or `runtime_evidence_conflict` without protected mutation when report evidence is stale or invalid. |
| `autopilot_answer_blocker` | Validate the user's selected blocker option envelope against plugin-owned pending questions; current MVP records no mutation and recommends status before continuing. |
| `autopilot_stop` | Acknowledge a pause/cancel request; returns `stop_no_active_state` for no-op stops or `stop_applied`/`outcome: "advanced"` with `tasksAdvanced` when provided plugin-owned active runtime state was changed. |

Expected shared Autopilot tool output. Optional fields such as `taskSummaries[].mrStatus`, `nextActions[].tool`, and `nextActions[].args` may be omitted when they do not apply:

```json
{
  "outcome": "advanced|blocked_for_user|waiting_for_mr|idle|failed",
  "tasksStarted": [],
  "tasksAdvanced": [],
  "mrsWaiting": [],
  "questions": [],
  "blockers": [],
  "nextRecommendedCall": "autopilot_status|autopilot_collect|autopilot_answer_blocker|null",
  "summary": "...",
  "reasonCode": "no_ledgers|invalid_ledgers|ready_runtime_deferred|waiting_for_mr|blocked_for_user|collect_deferred|stop_no_active_state|stop_applied|runtime_evidence_conflict|no_actionable_tasks|advanced",
  "taskSummaries": [
    {
      "taskId": "...",
      "path": "openspec/changes/<change>/automation/task.json",
      "taskType": "feature|bugfix|refactor|docs|typo|research|planning|tooling|config|performance|protocol",
      "status": "Ready|Analyze|Implementation|Review|Acceptance|Done|Blocked|Failed|Cancelled",
      "valid": true,
      "mrStatus": "none|created|updated|waiting-review|merged|not-required",
      "actionability": "actionable|invalid|waiting_for_mr|blocked_for_user|runtime_deferred|terminal|not_selected",
      "reasonCode": "..."
    }
  ],
  "nextActions": [
    {
      "label": "...",
      "kind": "tool|validation|report|wait|ask_user|manual_review",
      "tool": "autopilot_run_next|autopilot_status|autopilot_collect|autopilot_answer_blocker|autopilot_stop",
      "args": {},
      "reason": "...",
      "safety": "safe|requires_user|requires_credentials|not_available",
      "expectedResult": "..."
    }
  ],
  "selection": {
    "mode": "serial_default|parallel_implementation",
    "selectedTaskId": "...",
    "maxImplementationClaims": 1,
    "candidates": [
      {
        "taskId": "...",
        "path": "openspec/changes/<change>/automation/task.json",
        "rank": 1,
        "selected": true,
        "selectionReason": "selected_primary|serial_default|selected_primary_unknown_priority|serial_default_unknown_priority|dependency_blocked|parallel_started|scope_conflict|missing_parallel_guard|wip_limit",
        "parallelDecision": "not_evaluated|parallel_ready|not_parallel_safe|parallel_started"
      }
    ]
  },
  "loopGuard": {
    "repeatedNoProgress": true,
    "equivalentCall": "autopilot_run_next",
    "suppressRepeatRecommendation": true
  }
}
```

When `reasonCode` is `ready_runtime_deferred`, `collect_deferred`, `stop_no_active_state`, `no_ledgers`, or `no_actionable_tasks`, do not repeat the equivalent no-progress tool call unless `nextActions[]` explicitly says it is safe. Use `selection` to identify the deterministic primary Ready task and serial-default non-selected candidates; use `taskSummaries[]` to explain which discovered task is invalid, blocked, waiting for MR, terminal, or runtime-deferred without re-reading full ledgers.

Current MVP-vNext default selection is `serial_default` with `maxImplementationClaims: 1`. The selected primary candidate has `parallelDecision: "not_evaluated"`; non-selected Ready candidates may be `parallel_ready` when deterministic write-scope prefixes are disjoint or `not_parallel_safe` when scopes overlap, are empty, or cannot be compared safely. `parallel_ready` is visibility evidence only and does not prove dispatch, claims, worker starts, or ledger mutation. Explicit plugin-owned parallel implementation harness state may return `parallel_implementation`, `parallel_started`, `scope_conflict`, `missing_parallel_guard`, or `wip_limit`; treat `parallel_started` as authoritative start evidence only when returned with matching `tasksStarted` evidence, and treat non-start safety reasons as authoritative not-started safety decisions when returned in `selection.candidates[]`.

Tool result metadata may include `metadata.argumentContext` for no-op/runtime-only tools such as `autopilot_answer_blocker` and `autopilot_stop`. Treat `acknowledged`, `ignored`, and `mutation` as a sanitized argument-handling note only; ignored argument values are not echoed. `mutation: "none"` means no ledger/runtime mutation occurred. `mutation: "plugin-owned-runtime-only"` means the tool used only plugin-owned in-memory runtime state without protected-file mutation; read `summary`, `tasksStarted`, and `tasksAdvanced` to distinguish validation-only evidence from an observable active-state change. `autopilot_answer_blocker` may return `outcome: "failed"` when the `questionId`, `taskId`, label, or action does not match a plugin-owned pending question.

`actionable` and `not_selected` actionability values are reserved for future runtime dispatch/selection behavior. `advanced` is a current `outcome`/`reasonCode` value for explicit in-memory harness claim, collect, or stop outputs. Until the active `improve-autopilot-runtime-e2e-harness` continuity and idempotency tasks are complete, treat claim/collect `advanced` as validation-only harness evidence unless a later status/stop output confirms observable active runtime state. Current MVP output may include top-level `selection` evidence while still returning deferred/no-op reasons when protected-file mutation would be required.

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
