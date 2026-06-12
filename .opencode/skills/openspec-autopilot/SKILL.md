---
name: openspec-autopilot
description: Use when the user explicitly says /autopilot or autopilot, asks to inspect or continue an Autopilot/OpenSpec queue with ready ledgers, has unfinished active changes during explicit Autopilot handoff, needs strict typed phases, safe parallel OpenSpec work with plugin/runtime selection evidence, or says работай inside an active Autopilot context.
license: MIT
---

# OpenSpec Autopilot

Use this skill when OpenSpec work should be controlled by the Autopilot plugin rather than by ad-hoc model decisions.

## Eligibility

Use it for explicit `/autopilot` or `autopilot`, active-context `работай`, ready OpenSpec task ledgers/queues, unfinished active OpenSpec changes in `tasks.md` during explicit Autopilot handoff, strict task-type phase enforcement, safe parallel OpenSpec work when plugin/runtime selection evidence is available, or ready research/planning ledger tasks that need durable evidence and gates. Current MVP may stop with `reasonCode: "ready_runtime_deferred"` or return `reasonCode: "active_change_handoff"` when ordinary active OpenSpec changes exist without plugin-owned ledgers.

Do not use it for casual codebase questions, one obvious small edit, OpenSpec discovery with no ready work (`next-step`), a single accepted change that `openspec-apply-change` can finish directly, or non-OpenSpec fan-out where prompt-only `orchestrator` is enough. If the user directly asks to implement one accepted OpenSpec change and did not invoke `/autopilot`, route directly to `openspec-apply-change`.

## Escape Hatch

Do not keep Autopilot alive only because this skill was loaded. When `reasonCode` is `active_change_handoff`, report the selected unfinished active OpenSpec change from `selection.selectedTaskId`, do not repeat an equivalent no-progress `autopilot_run_next`, and immediately continue via `openspec-apply-change` for that selected change. When `reasonCode` is `ready_runtime_deferred`, `no_ledgers`, or `no_actionable_tasks`, report the stop condition, do not repeat an equivalent no-progress `autopilot_run_next`, and hand off to the named safer workflow from `nextActions[]`, `next-step`, `openspec-apply-change`, manual direct work, or `orchestrator` as appropriate. `no_ledgers` means neither applicable Autopilot ledgers nor unfinished active OpenSpec changes in `tasks.md` were found.

When local stale evidence or an evidence conflict appears, stop and report the mismatch. Prefer source, tests, plugin output, and current validation over stale prose reports; do not manually mutate protected Autopilot state to make the flow appear complete.

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
| `autopilot_run_next` | Main control-plane call: discover/classify current ledgers or unfinished active OpenSpec changes in `tasks.md` and return authoritative actionability. Default MVP behavior stops with deferred/no-op output when mutation would be needed; `active_change_handoff` routes to `openspec-apply-change`; explicit claim, fixed parallel, or auto parallel harness state may return `advanced`/`tasksStarted` evidence and record active runtime state without protected-file mutation. |
| `autopilot_status` | Concise tasks/runs/workers/blockers/MRs status, including active-change handoff summaries when no applicable ledger exists. |
| `autopilot_collect` | Gather plugin-owned worker reports, validate legal advancement, and track consumed report ids for idempotent repeated calls; may return validation-only `advanced` evidence for accepted in-memory report transitions, `collect_deferred` when scoped reports were already consumed, or `runtime_evidence_conflict` without protected mutation when report evidence is stale or invalid. |
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
  "reasonCode": "no_ledgers|invalid_ledgers|ready_runtime_deferred|active_change_handoff|waiting_for_mr|blocked_for_user|collect_deferred|stop_no_active_state|stop_applied|runtime_evidence_conflict|no_actionable_tasks|advanced",
  "taskSummaries": [
    {
      "taskId": "...",
      "path": "openspec/changes/<change>/automation/task.json|openspec/changes/<change>/tasks.md",
      "sourceKind": "ledger|active-change",
      "taskType": "feature|bugfix|refactor|docs|typo|research|planning|tooling|config|performance|protocol",
      "status": "Ready|Analyze|Implementation|Review|Acceptance|Done|Blocked|Failed|Cancelled",
      "valid": true,
      "mrStatus": "none|created|updated|waiting-review|merged|not-required",
      "actionability": "actionable|invalid|waiting_for_mr|blocked_for_user|runtime_deferred|terminal|not_selected",
      "reasonCode": "...",
      "checkedTasks": 0,
      "uncheckedTasks": 1,
      "totalTasks": 1
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
    "mode": "serial_default|parallel_implementation|auto_parallel_implementation",
    "selectedTaskId": "...",
    "maxImplementationClaims": 1,
    "autoDecision": {
      "policy": "auto",
      "resolvedMaxImplementationClaims": 2,
      "maxAutoClaims": 3,
      "conflictTolerance": "none|small",
      "fanInValidationRequired": true,
      "decisionReason": "...",
      "riskClass": "serial_required|standard_parallel|low_risk_parallel|soft_conflict_parallel",
      "acceptedSoftConflictScopes": [],
      "rejectedReasons": []
    },
    "candidates": [
      {
        "taskId": "...",
        "path": "openspec/changes/<change>/automation/task.json|openspec/changes/<change>/tasks.md",
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

When `reasonCode` is `active_change_handoff`, continue the selected unfinished active OpenSpec change through `openspec-apply-change`; do not repeat the equivalent no-progress tool call. When `reasonCode` is `ready_runtime_deferred`, `collect_deferred`, `stop_no_active_state`, `no_ledgers`, or `no_actionable_tasks`, do not repeat the equivalent no-progress tool call unless `nextActions[]` explicitly says it is safe. Use `selection` to identify the deterministic primary Ready task or active change and serial-default non-selected candidates; use `taskSummaries[]` to explain which discovered task is actionable, invalid, blocked, waiting for MR, terminal, or runtime-deferred without re-reading full ledgers.

Current MVP-vNext default selection is `serial_default` with `maxImplementationClaims: 1`; no explicit fixed or auto policy still means serial implementation. The selected primary candidate has `parallelDecision: "not_evaluated"`; non-selected Ready candidates may be `parallel_ready` when deterministic write-scope prefixes are disjoint or `not_parallel_safe` when scopes overlap, are empty, or cannot be compared safely. `parallel_ready` is visibility evidence only and does not prove dispatch, claims, worker starts, or ledger mutation.

Explicit plugin-owned fixed parallel state may return `parallel_implementation`. Explicit auto policy, via `parallelImplementation.enabled: true` plus either `parallelImplementation.mode: "auto"` or `parallelImplementation.maxImplementationClaims: "auto"`, may return `auto_parallel_implementation`; `selection.maxImplementationClaims` remains the resolved numeric WIP, while `selection.autoDecision` explains `riskClass`, `maxAutoClaims`, `conflictTolerance`, accepted soft conflict scopes, rejected reasons, and whether fan-in validation is required. `standard_parallel` uses disjoint implementation scopes, `low_risk_parallel` is bounded for docs/typo/research/planning/fixture/example-like work, `soft_conflict_parallel` is capped at `2` and only accepts configured `softConflictScopes`, and `serial_required` preserves WIP `1` for central/protected/source/config/unknown/guard-risk cases. Treat `parallel_started` as authoritative start evidence only when returned with matching `tasksStarted` evidence; started parallel candidates must include task-to-`worktreePath` evidence for fan-in, MR, archive, and cleanup gates. Treat `scope_conflict`, `missing_parallel_guard`, and `wip_limit` as authoritative not-started safety decisions in `selection.candidates[]`.

When auto mode starts more than one task or accepts a soft conflict, terminal readiness requires passed fan-in integration evidence; `autopilot_collect` must block `Done` advancement with `runtime_evidence_conflict` if that evidence is missing. Archive-ready and MR-ready handoffs must require the same fan-in evidence through agent/reviewer gates until a first-class plugin archive/MR readiness surface exists. Fan-in evidence must prove combined validation, idempotent worker-report collection, no protected ledger mutation by agents/workers, and soft-conflict resolution when accepted soft scopes exist. Parallel implementation streams must be isolated in one owned `autopilot/...` git worktree per stream before implementation, integrated back through MR, and cleaned up only after MR merged evidence and archived-change evidence exist; use programmatic lifecycle helpers/actions instead of relying on prose reminders.

Tool result metadata may include `metadata.argumentContext` for no-op/runtime-only tools such as `autopilot_answer_blocker` and `autopilot_stop`. Treat `acknowledged`, `ignored`, and `mutation` as a sanitized argument-handling note only; ignored argument values are not echoed. `mutation: "none"` means no ledger/runtime mutation occurred. `mutation: "plugin-owned-runtime-only"` means the tool used only plugin-owned in-memory runtime state without protected-file mutation; read `summary`, `tasksStarted`, and `tasksAdvanced` to distinguish validation-only evidence from an observable active-state change. `autopilot_answer_blocker` may return `outcome: "failed"` when the `questionId`, `taskId`, label, or action does not match a plugin-owned pending question.

`actionable` is used for `active_change_handoff` summaries that point at unfinished active OpenSpec changes in `tasks.md`; it does not imply plugin-owned worker dispatch. `not_selected` remains reserved for future runtime dispatch/selection behavior. `advanced` is a current `outcome`/`reasonCode` value for explicit in-memory harness claim, collect, or stop outputs. Claim `advanced` means the selected task claim was validated and may be observable through plugin-owned active runtime state; collect `advanced` means an accepted in-memory worker report transition was validated and its report id was consumed, not that protected ledger files were mutated. Current MVP output may include top-level `selection` evidence while still returning deferred/no-op reasons when protected-file mutation would be required.

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
- Auto-parallel runs that started multiple tasks or accepted soft conflict scopes need passed fan-in integration evidence before `Done`; archive-ready and MR-ready handoffs require the same evidence through agent/reviewer gates until first-class plugin handoff checks exist.
- Parallel implementation worktrees need MR merged evidence plus archived-change evidence before cleanup; cleanup must be limited to owned `autopilot/...` worktrees.
- Any transition to `Blocked` needs blocker reason and recommended options when user action is required.

## Retrospective Archive Gate

Before archive or archive-ready acceptance, require `retrospective.md`, generated follow-up OpenSpec changes for actionable retrospective findings, and the repository retro gate when available. If a completed change lacks a passed `Archive Gate Decision`, `No findings` evidence, generated follow-up changes for `Target` `project-local` or `opencode-dev-kit`, or an approved skip with reason and approver, treat the missing retrospective/follow-up as an archive gate blocker and ask only blocker questions returned by the plugin/runtime.

When `npm run openspec:retro-followups -- <change-id>` exists, run it before the gate so actionable `Problems Found` rows create or update OpenSpec follow-up changes. Then use `npm run openspec:retro-gate -- <change-id>` as deterministic evidence. If either command fails or is unavailable, report the archive gate status manually instead of mutating protected Autopilot state.

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
