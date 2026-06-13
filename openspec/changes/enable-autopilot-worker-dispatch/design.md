# Design: Enable Autopilot Worker Dispatch

## Summary

The current Autopilot plugin correctly separates discovery, selection, and no-progress states, but it lacks a live executor. This design adds a conservative serial execution loop:

1. Read and validate task ledgers.
2. Select one deterministic primary task.
3. Claim the task in durable plugin-owned runtime state.
4. Launch one worker session with a scoped prompt and expected report id.
5. Collect exactly one complete worker report.
6. Validate the legal transition against current ledger state.
7. Atomically update `automation/task.json` through plugin-owned code.
8. Continue or stop according to phase policy, blockers, MR wait, or validation failures.

Parallel implementation, worktree fan-out, MR automation, and cleanup remain later layers built on the same runtime state.

## Current Architecture

The existing architecture is the right foundation and should be extended, not replaced.

| Layer | Current Role | Change Needed |
| --- | --- | --- |
| `.opencode/plugins/openspec-autopilot.ts` | Thin OpenCode server-plugin adapter exposing tools. | Add event/hook wiring and pass a durable runtime service into the controller. |
| `tools/openspec-autopilot-controller.ts` | Shared controller for `runNext`, `status`, `collect`, `answerBlocker`, and `stop`. | Call runtime dispatch/store/transition services instead of only formatting outputs. |
| `tools/openspec-autopilot-output.ts` | Reason-coded output and deterministic selection. | Preserve output contract; add live dispatch results when runtime services advance state. |
| `tools/openspec-autopilot-runtime.ts` | In-memory claim/collect transition validation helpers. | Refactor helpers so live runtime can reuse validation and produce next-ledger state. |
| `tools/autopilot-programmatic-triggers.ts` | Pure event classification. | Consume durable worker session evidence when plugin event hooks are wired. |
| `tools/autopilot-trigger-scheduler.ts` | Deterministic debounce/single-flight/cooldown scheduler. | Execute controller jobs from plugin events without recursive no-progress loops. |
| `tools/autopilot-ledger.ts` | Task ledger validator and legal transition gates. | Remain final authority before any protected ledger write. |

## Proposed Modules

### Runtime Store

Add a small interface with in-memory and durable implementations:

```ts
type AutopilotRuntimeStore = {
  load(): Promise<AutopilotRuntimeSnapshot>;
  save(mutator: (draft: AutopilotRuntimeSnapshot) => void): Promise<AutopilotRuntimeSnapshot>;
};
```

Minimum state:

```ts
type AutopilotRuntimeSnapshot = {
  schemaVersion: 1;
  runs: Record<string, AutopilotRunRecord>;
  consumedWorkerReportIds: string[];
};

type AutopilotRunRecord = {
  runId: string;
  status: "claiming" | "dispatching" | "running" | "collecting" | "blocked" | "waiting_mr" | "stopped" | "failed" | "done";
  createdAt: string;
  updatedAt: string;
  taskId: string;
  ledgerPath: string;
  fromStatus: string;
  expectedToStatus?: string;
  expectedReportId: string;
  workerId: string;
  workerSessionId?: string;
  ledgerRevision?: { number?: number; contentHash?: string };
  scope: { read: string[]; write: string[]; forbidden: string[] };
  blockers?: Array<{ reason: string; questionId?: string }>;
  mr?: { status: string; url?: string };
  stopReason?: string;
};
```

The durable implementation should prefer OpenCode/plugin-private state when available. If unavailable, use a clearly protected repo-local fallback such as `.autopilot/runtime/state.json` with atomic writes and validation. The fallback is plugin-owned and must not be edited by agents or workers.

### Ledger Transition Writer

Add a writer that owns protected ledger mutation:

```ts
type LedgerTransitionWriter = {
  applyReport(report: AutopilotWorkerReport, claim: AutopilotRunRecord): Promise<LedgerTransitionResult>;
};
```

Algorithm:

1. Read current ledger from `claim.ledgerPath`.
2. Validate current ledger with `validateTaskLedger`.
3. Verify `taskId`, `fromStatus`, `ledgerPath`, and revision/content hash match claim evidence.
4. Clone current ledger and apply exactly one history transition from worker report evidence.
5. Validate the next ledger with `validateTaskLedger`.
6. Write to a temp file in the same directory.
7. Replace the original atomically.
8. Re-read and validate the written ledger.
9. Return `tasksAdvanced[]` evidence including mutation `plugin-owned-protected-ledger`.

No ledger write occurs when any step fails.

### Worker Session Adapter

Add an adapter that hides OpenCode API details from runtime business logic:

```ts
type AutopilotWorkerSessionAdapter = {
  capability(): Promise<{ available: boolean; reason?: string }>;
  createSession(input: AutopilotWorkerDispatchInput): Promise<AutopilotWorkerCreateResult>;
  promptSession(input: AutopilotWorkerDispatchInput & { sessionId: string }): Promise<AutopilotWorkerPromptResult>;
  dispatch(input: AutopilotWorkerDispatchInput): Promise<AutopilotWorkerDispatchResult>;
  readFinalReport(input: { sessionId: string; reportId: string }): Promise<AutopilotReportReadResult>;
};
```

The plugin adapter should use SDK-shaped OpenCode session APIs, not UI automation. `session.create` uses only supported `body.parentID/title` plus `query.directory`; runtime metadata such as `autopilotRunId`, `taskId`, `workerId`, and `reportId` is carried in prompt text-part metadata and the strict worker prompt. The controller creates the child session, persists `workerSessionId` to durable runtime state, and only then sends the worker prompt asynchronously so hook-based scope ownership exists before worker execution begins.

If the OpenCode API is unavailable or incompatible, including missing `session.messages`, `autopilot_run_next` must return a clear blocked/deferred capability reason and must not claim the task.

### Worker Prompt Builder

Prompts should be deterministic and generated from ledger fields:

- task id, type, phase/status, priority, dependencies;
- read/write/forbidden scopes;
- phase-specific evidence requirements;
- validation expectations;
- report envelope format;
- explicit prohibition on editing protected Autopilot paths;
- no commit/push/merge unless later policy explicitly allows it.

The first serial slice may dispatch only the next legal phase for the current ledger. It should not ask the worker to complete the whole change unless phase policy proves that is safe.

### Worker Report Protocol

Use a strict complete marker plus parseable JSON payload:

```text
AUTOPILOT_WORKER_REPORT <reportId> COMPLETE
```

```json
{
  "schemaVersion": 1,
  "reportId": "...",
  "runId": "...",
  "workerId": "...",
  "sessionId": "...",
  "taskId": "...",
  "ledgerPath": "openspec/changes/<change>/automation/task.json",
  "fromStatus": "Analyze",
  "toStatus": "Implementation",
  "changedFiles": [],
  "validation": [{ "command": "npm test", "status": "passed" }],
  "testDecision": "required",
  "secretScan": { "status": "passed" },
  "evidence": { "summary": "..." },
  "blockers": [],
  "mr": { "status": "none" }
}
```

The parser must reject:

- missing marker;
- partial marker;
- more than one complete report envelope;
- non-JSON payload;
- unknown report id;
- mismatched run, worker, session, task, ledger path, or status;
- duplicate report id;
- missing required phase evidence.

### Phase-Aware Dispatch Policy

Autopilot currently treats `Ready` as the main dispatchable state and reports other non-terminal states as no actionable work. Live dispatch needs explicit phase handling.

| Current Status | Next Runtime Action |
| --- | --- |
| `Ready` | Claim and dispatch Analyze worker, unless task type allows direct minimal implementation through existing validator policy. |
| `Analyze` | Dispatch planning/evidence worker or continue to `Implementation`/`Review` when report evidence satisfies the gate. |
| `Implementation` | Dispatch implementation worker, then require changed files or no-op reason, validation evidence, and secret scan status. |
| `Review` | Dispatch reviewer worker or collect reviewer evidence; return blocker on failed/needs-work review. |
| `Acceptance` | Verify MR/no-MR policy, validation, retrospective/archive gates where applicable; stop at MR wait or blocker. |
| `Blocked` | Ask only plugin-owned blocker questions or wait for `autopilot_answer_blocker`. |
| `Done`, `Failed`, `Cancelled` | Terminal; no dispatch. |

The validator remains the final authority. Phase policy chooses an action; it does not bypass `validateTaskLedger`.

## Runtime Flow

### `autopilot_run_next`

1. Load runtime snapshot.
2. Reconcile active run state against current ledgers.
3. If an active worker is running, return status instead of claiming another task.
4. Read queue summaries and compute deterministic selection.
5. If selected task cannot legally advance, return existing reason-coded no-progress output.
6. If worker dispatch capability is disabled or unavailable, return `ready_runtime_deferred` or a more specific blocked reason without mutation.
7. Create a claim record with ledger revision evidence inside serialized runtime save.
8. Create the worker session through the adapter.
9. Persist `workerSessionId` before prompting so scope guards can identify the worker session.
10. Build and send the worker prompt asynchronously.
11. Update the claim record to status `running` only after prompt acceptance.
12. Return `advanced` with `tasksStarted[]`, `selection`, active runtime evidence, and `nextActions[]` recommending status/collect.

### `autopilot_collect`

1. Load runtime snapshot.
2. Claim one collectable active worker by marking it `collecting` inside serialized runtime save.
3. Read final report from session adapter or runtime report buffer, returning structured no-progress output and restoring `running` state on read errors.
4. Parse and validate report envelope, ignoring prompt/user message text and failing closed on role-less SDK message entries when reading SDK message history; only explicit assistant output is report input.
5. Reject stale, duplicate, mismatched, or illegal reports with `runtime_evidence_conflict` and no protected ledger mutation.
6. Apply ledger transition through `LedgerTransitionWriter`.
7. Mark report id consumed.
8. Update or close active run state according to the new phase, preserving `blocked` and `waiting_mr` as active serial ownership states until stop/resolution.
9. Return `advanced` with `tasksAdvanced[]` or a blocked/waiting state.

### `autopilot_status`

Status output should include compact active runtime state, worker session ids, current phase, pending blocker ids, MR wait status, and scheduler summary when available. It must not leak prompts, secrets, full report payloads, or raw ledger bodies by default.

### `autopilot_stop`

Stop updates durable runtime state and prevents future collect/run-next from treating the stopped claim as active. It should not delete worker sessions or destroy worktrees in the serial MVP. Destructive cleanup remains out of scope.

## Permission And Scope Enforcement

Worker prompts are not a security boundary. The plugin must enforce worker restrictions through OpenCode permission/tool hooks when available.

Required guards:

- block model-facing writes to `.autopilot/**` and `openspec/changes/*/automation/**` unless the call is from plugin-owned ledger writer code;
- block worker writes outside the claimed task's `scope.write`;
- block worker writes to `scope.forbidden`;
- normalize Windows and POSIX separators before comparisons;
- reject absolute, traversal, empty, or unsupported write paths when they cannot be compared safely;
- allow simple no-control-syntax validation commands such as repository test/validate scripts without widening write scope;
- fail closed for worker sessions when scope ownership cannot be established;
- block writes from known worker sessions whose run is no longer actively `running` (`stopped`, `failed`, `done`, `blocked`, `waiting_mr`, or `collecting`).

## Event And Scheduler Integration

This change should not duplicate the trigger scheduler. It should provide durable worker-session evidence that existing trigger classification can consume.

Integration points:

- `session.status: idle` for a plugin-owned worker session may schedule `autopilot_collect`.
- `message.updated` and `message.part.updated` may record complete report markers but should not collect until the worker is idle or completion is explicit.
- no-progress outputs such as `ready_runtime_deferred`, `collect_deferred`, `no_ledgers`, and loop-guarded outputs must not schedule equivalent repeat calls.
- passive observe-mode file events remain status/check only.

## Rollout Strategy

1. Keep live dispatch disabled by default behind explicit plugin option, for example `workerDispatch.enabled: true`.
2. Implement and validate in-memory/fake-adapter tests first.
3. Add durable store and ledger writer with temp-repo integration tests.
4. Add fake OpenCode client tests for session creation and report collection.
5. Add live smoke guidance after restart, with capability fallback when session APIs are unavailable.
6. Only after serial dispatch is stable should later changes enable parallel/worktree dispatch by default policy.

## Alternatives Considered

| Alternative | Rejection Reason |
| --- | --- |
| Keep manual `openspec-apply-change` handoff only | Safe but does not satisfy explicit Autopilot execution semantics. |
| Let workers edit `automation/task.json` directly | Violates plugin-owned protected-state boundary and makes legal transitions unauditable. |
| Use shell scripts to launch OpenCode workers | Harder to secure, test, and recover than a server-plugin adapter using OpenCode APIs. |
| Implement parallel dispatch first | Raises conflict, recovery, and fan-in risk before the serial execution loop is proven. |
| Treat any idle worker as completed | `idle` only proves no active turn; structured report validation is still required. |

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| OpenCode session API is unavailable or drifts | Worker dispatch cannot start or breaks after upgrade. | Use adapter layer, feature probe, local docs/source verification, fake-client contract tests, and clear capability blocker output. |
| Runtime state is lost on restart | Duplicate claims, orphaned workers, or stuck tasks. | Durable atomic store, recovery reconciliation, consumed report ids, active-run status output, idempotent stop/collect. |
| Worker returns malformed output | False progress or stuck collect. | Strict report envelope, parser negative tests, no transition on parse failure, needs-review/blocker output. |
| Stale report targets old ledger status | Invalid ledger mutation. | Verify task id, path, fromStatus, revision/content hash, and current validator result before writing. |
| Ledger write corrupts protected state | Broken Autopilot queue. | Validate before/after, atomic same-directory replace, no write on conflict, temp-repo integration tests. |
| Worker edits protected paths | State drift or security issue. | Permission/tool guard, fail-closed worker session checks, protected path tests for patch/edit/write/bash. |
| Event loop repeats no-progress calls | Noisy runaway automation. | Existing loopGuard, scheduler cooldowns, source-tag recursion suppression, no-progress scheduling tests. |
| Same-workspace worker collides with user edits | Lost work or confusing diffs. | Serial default, dirty-worktree/status warnings, scope guard, optional later worktree escalation. |
| Remote actions occur too early | Unsafe push/MR/merge/deploy. | No merge/deploy in scope, MR wait is read-only unless explicit later policy, missing credentials become blockers. |

## Test Strategy

- Unit-test runtime store schema validation, atomic save behavior, and recovery from missing/corrupt state.
- Unit-test report parser positive and negative envelopes.
- Unit-test phase dispatcher for each task status and task type gate.
- Unit-test ledger transition writer with valid, stale, invalid, and duplicate report scenarios.
- Unit-test worker prompt builder for required scope, forbidden-path, phase, and report-contract instructions.
- Unit-test permission guard path normalization and scope enforcement.
- Integration-test controller run-next/collect/status/stop with fake runtime store and fake worker adapter.
- Integration-test protected ledger writes in temp OpenSpec repos only.
- Source-equivalent plugin tests should verify the OpenCode adapter calls session creation/prompt APIs through a fake client and fails clearly when unavailable.

## Compatibility

- Existing no-dispatch behavior remains available when `workerDispatch.enabled` is false or session capability is missing.
- Existing `ready_runtime_deferred` semantics remain valid for disabled/unavailable runtime paths.
- Existing materialization, selection, auto-parallel, and trigger scheduler contracts should not change except where they consume new active runtime evidence.
- The default remains serial unless a separate explicit parallel policy is enabled.
