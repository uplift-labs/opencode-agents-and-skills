# Design: Improve Autopilot Actionable Output

## Output Contract

Keep the current top-level fields so existing prompts and tools continue to work:

```ts
type AutopilotOutput = {
  outcome: "advanced" | "blocked_for_user" | "waiting_for_mr" | "idle" | "failed";
  tasksStarted: unknown[];
  tasksAdvanced: unknown[];
  mrsWaiting: MrWaitSummary[];
  questions: BlockerQuestionSummary[];
  blockers: BlockerSummary[];
  nextRecommendedCall: "autopilot_status" | "autopilot_collect" | "autopilot_answer_blocker" | null;
  summary: string;
  reasonCode?: AutopilotReasonCode;
  taskSummaries?: TaskActionabilitySummary[];
  nextActions?: AutopilotNextAction[];
  loopGuard?: AutopilotLoopGuard;
};
```

`nextRecommendedCall` remains a compatibility field. New agents should prefer `nextActions[]` because it can represent multiple safe actions and can explain why a tool should or should not be called.

## Reason Codes

Start with reason codes that cover observed regression pain:

| Reason Code | Meaning |
| --- | --- |
| `no_ledgers` | No OpenSpec Autopilot task ledgers were found. |
| `invalid_ledgers` | One or more discovered ledgers failed validation. |
| `ready_runtime_deferred` | Valid Ready work exists, but runtime claim/dispatch is not implemented or enabled. |
| `waiting_for_mr` | At least one task is waiting for MR review or merge. |
| `blocked_for_user` | A real user-owned blocker question exists. |
| `collect_deferred` | Collect was called, but worker report collection is not implemented or no reports exist. |
| `stop_no_active_state` | Stop was safe and no active runtime state existed. |
| `no_actionable_tasks` | Ledgers exist, but none can safely advance. |
| `advanced` | At least one task started or advanced. |

Reason codes should be stable enough for deterministic report tooling and tests. The prose `summary` can change, but tests should assert `reasonCode` and structured fields.

## Task Actionability

Each task summary should include task id, ledger path, status, task type, validity, MR status, and actionability:

```ts
type TaskActionabilitySummary = {
  taskId: string;
  path: string;
  taskType: string;
  status: string;
  valid: boolean;
  actionability: "actionable" | "invalid" | "waiting_for_mr" | "blocked_for_user" | "runtime_deferred" | "terminal" | "not_selected";
  reasonCode: AutopilotReasonCode;
};
```

This lets an agent explain why a Ready task did not advance without re-reading the ledger.

## Next Actions

`nextActions[]` should be self-contained:

```ts
type AutopilotNextAction = {
  label: string;
  kind: "tool" | "validation" | "report" | "wait" | "ask_user" | "manual_review";
  tool?: "autopilot_run_next" | "autopilot_status" | "autopilot_collect" | "autopilot_answer_blocker" | "autopilot_stop";
  args?: Record<string, unknown>;
  reason: string;
  safety: "safe" | "requires_user" | "requires_credentials" | "not_available";
  expectedResult: string;
};
```

When runtime advancement is deferred, `nextActions[]` should not recommend another identical `autopilot_run_next`. It should recommend status, evidence-pack generation, follow-up tracking, or stopping with a clear blocker depending on the context.

## Loop Guard

The loop guard prevents tool recommendation loops:

```ts
type AutopilotLoopGuard = {
  repeatedNoProgress: boolean;
  equivalentCall?: string;
  suppressRepeatRecommendation: boolean;
};
```

If `autopilot_status` knows that `autopilot_run_next` cannot advance because runtime is deferred, it should not recommend `autopilot_run_next` as the only next step.

## Compact And Verbose Modes

Default outputs should be compact and token-efficient. A future optional `verbose: true` argument may include validation errors, full ledger paths, and detailed per-task diagnostics. Compact output should include enough structured fields for correct agent decisions.

## Test Strategy

- Test valid Ready ledger with deferred runtime returns `reasonCode: "ready_runtime_deferred"` and no repeated `autopilot_run_next` recommendation.
- Test invalid ledgers return `reasonCode: "invalid_ledgers"` and include task summaries with validation state.
- Test MR wait returns `reasonCode: "waiting_for_mr"`, MR summary, and wait action.
- Test stop with no state returns `reasonCode: "stop_no_active_state"`.
- Test compact mode does not emit raw full ledger contents.
