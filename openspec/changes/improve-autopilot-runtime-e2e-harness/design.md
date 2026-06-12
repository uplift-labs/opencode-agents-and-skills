# Design: Improve Autopilot Runtime E2E Harness

## Goals

- Prove real Autopilot runtime behavior without agents manually writing protected state.
- Make worker dispatch, worker collection, blocker questions, MR wait, and stop behavior testable before expanding autonomy.
- Preserve the plugin as the only owner of `.autopilot/**` and `openspec/changes/*/automation/**` mutations.
- Keep the first implementation slice small enough to validate locally without provider credentials.

## Runtime State Model

Autopilot runtime state should be explicit and plugin-owned. The minimal model is:

```ts
type RunState = {
  runId: string;
  createdAt: string;
  updatedAt: string;
  scope: { changeId?: string; taskId?: string };
  claimedTasks: ClaimedTask[];
  workerReports: WorkerReport[];
  consumedWorkerReportIds: string[];
  blockerQuestions: BlockerQuestion[];
  mrWaits: MrWait[];
};
```

`ClaimedTask` records the ledger path, task id, status at claim time, worker assignment if any, and the legal next phase. `WorkerReport` records worker id, task id, phase, changed files or no-op reason, validation summary, secret-scan status, reviewer outputs, and errors. `consumedWorkerReportIds` records plugin-owned report ids that already produced accepted in-memory advancement so repeated collect calls are idempotent. `BlockerQuestion` records question id, task id, options, recommended label, requested action, and whether it has been answered. `MrWait` records task id, MR status, URL when available, and the reason Autopilot stopped.

## Default Selection Contract

Autopilot should be deterministic, not model-preference driven. `autopilot_run_next` should select at most one primary implementation task by default. It may report other ready candidates, but it must not start them unless guarded parallel mode is explicitly enabled and all safety checks pass.

The selection pipeline is:

1. Discover ledgers from the configured roots and apply explicit `changeId` or `taskId` filters first.
2. Validate ledgers and classify invalid, blocked, waiting-for-MR, terminal, and Ready candidates.
3. Exclude candidates whose dependencies are not terminal-successful or whose status cannot legally transition from the current phase.
4. Rank remaining candidates with deterministic keys only: explicit `taskId` match, dependency readiness, normalized `priority`, smallest write scope, oldest stable timestamp when available, and lexical task id/path as the final tie-breaker.
5. Claim only the top-ranked candidate for implementation in default mode.
6. Mark unclaimed Ready candidates as not selected in the output with the reason `serial_default`, `dependency_blocked`, `scope_conflict`, `waiting_for_mr`, or another deterministic selection reason.

Priority normalization should be explicit. Known priority values should sort as `critical`, `high`, `medium`, `low`; unknown non-empty priorities should sort after known values with lexical tie-breaking and a warning-style selection reason. Autopilot must not infer business value from proposal prose, filenames, or model judgment.

The public output contract should add a top-level `selection` field while keeping `taskSummaries` as the compact classification view:

```ts
type AutopilotSelection = {
  mode: "serial_default" | "parallel_implementation";
  selectedTaskId?: string;
  maxImplementationClaims: number;
  candidates: Array<{
    taskId: string;
    rank: number | null;
    selected: boolean;
    selectionReason: string;
    parallelDecision: "not_evaluated" | "parallel_ready" | "not_parallel_safe" | "parallel_started";
  }>;
};
```

The implementation slice that adds `selection` must update public contract validation fixtures and docs in the same change. Selection evidence should avoid raw ledger dumps; it should expose stable task ids, ranks, decisions, and reasons only.

## Parallel Work Modes

Parallelism should be separated by risk:

| Mode | Default | Allowed Work | Required Guard |
| --- | --- | --- | --- |
| Serial implementation | On | One primary task can enter implementation. | Deterministic selection and one active implementation claim. |
| Parallel read-only | On when useful | Analyze, review, status inspection, validation planning, evidence-pack generation. | No writes outside plugin-owned runtime state; no ledger mutation by workers. |
| Parallel implementation | Off | Multiple implementation workers. | Explicit user/config opt-in, independent write scopes, locks, separate worktrees/branches, WIP limit, and merge/review gates. |

Guarded parallel implementation should start with `maxImplementationClaims = 2`. Raising the limit requires an explicit configuration or user decision and test coverage proving lock behavior. Absence of explicit parallel opt-in means Autopilot may show a parallel-ready queue but must still claim only one implementation task. In the current harness slice, "parallel started" means deterministic plugin-owned claim evidence for candidates whose locks and worktree names were pre-seeded in runtime state; it does not create OS worktrees, branches, workers, or protected ledger mutations.

## Parallel Independence Checks

Two tasks are parallel-implementation-safe only when all checks pass:

- Neither task depends on the other, and all listed dependencies are already complete.
- Their `scope.write` entries are deterministically disjoint.
- No task writes a path that another task lists as forbidden.
- Unknown or unsupported glob overlap is treated as `not_parallel_safe`, not as safe.
- Each task can use an isolated branch or worktree owned by Autopilot, such as `autopilot/<change>/<task>` or an equivalent collision-resistant name. Harness evidence must be a relative `autopilot/...` path, must not contain `..`, must be unique among started candidates, and must include the task id as a path segment.
- Runtime locks exist for the task ledger path and declared write scope before workers start.
- MR/review output can be produced separately for each task without auto-merge.

Read/write overlap is allowed only for read-only phases. For implementation phases, write/write overlap is always unsafe, and write/read overlap should be treated conservatively unless the runtime can prove the reader is not using mutable generated output.

## Harness Modes

Use two deterministic harness modes so tests do not depend on real provider state:

| Mode | Purpose | State Location |
| --- | --- | --- |
| In-memory | Fast unit tests for classification, transitions, blockers, and MR waits. | Process memory only. |
| Temp-worktree | Integration tests against real ledger files and plugin APIs. | OS temp directory outside the repository, copied from fixtures. |

Both modes must create state through plugin or test-harness code, not by asking an agent to edit protected paths. The harness may copy fixture ledgers into a temp directory because that directory is owned by the test process, not the user repository.

## First Runtime Slice

The first non-MVP slice should avoid broad worker orchestration. It should implement enough behavior to remove ambiguous no-op UX while preserving the serial default:

- Discover valid ledgers and classify each as actionable, blocked, waiting for MR, terminal, or runtime-deferred.
- Add deterministic ranking and selection evidence for all Ready candidates.
- Claim one primary Ready ledger only when the plugin can produce a legal next action, and record that claim in plugin-owned active runtime state so `autopilot_stop` can observe it later in the same plugin runtime.
- Produce a plugin-owned worker instruction or deterministic placeholder report for tests for the selected task only.
- Collect a worker report and advance only if `validateTaskLedger` accepts the resulting ledger state, then record the report id as consumed so repeated collect calls report no new advancement. Report ids are unique within a collect operation; duplicate report ids are runtime evidence conflicts even when they target different tasks.
- Stop at MR wait and user blockers without mutating unrelated state.
- Report parallel-ready candidates without starting them in default mode.
- Return explicit no-progress reason codes when runtime capability is still deferred.
- Detect runtime evidence conflicts before claiming or advancing a task, such as stale ledger revision, validation contradiction, unexpected tool output shape, or task/report status mismatch; return a clear blocker or failed result instead of continuing the flow.

Output-helper calls may produce validation-only advancement evidence without consuming reports. Only plugin-owned runtime calls that explicitly opt in to runtime mutation record consumed report ids or active claim state.

Implementation should be staged:

1. Harness plus deterministic selection output, with no ledger mutation beyond plugin-owned runtime state.
2. Single primary claim and collect path for one Ready task.
3. Blocker question storage, answer validation, MR wait, and stop behavior.
4. Parallel-ready queue visibility with conservative independence decisions.
5. Optional parallel implementation dispatch after locks, isolated branches/worktrees, WIP limits, and conflict tests exist.

## Blocker Answers

`autopilot_answer_blocker` should require a pending `BlockerQuestion` match by `questionId` and task id when present. Unknown question ids should return a clear failed or blocked output and should not recommend continuing as if state changed.

Future persistent blocker-answer handling should record the selected label, action, timestamp, and actor. This MVP slice intentionally implements validation-only acceptance: matching pending answers are acknowledged, unknown or mismatched answers are rejected, and accepted answers recommend `autopilot_status` without mutating blocker state. If an answer option is stale or no longer legal for the task state, the tool should return a blocker explaining the mismatch.

## MR Wait

MR wait handling must be read-only unless explicit user approval and provider credentials are available. The runtime may read MR status, but it must not merge. If provider access is missing, the output should distinguish missing credentials from no MR work.

## Test Strategy

- Unit-test classification from fixture ledgers.
- Unit-test deterministic ranking, explicit scope handling, priority normalization, and stable tie-breakers.
- Unit-test legal transition checks before writing state.
- Unit-test claim-to-stop continuity through plugin-owned active runtime state.
- Unit-test repeated collect idempotency, duplicate report-id conflicts, and illegal worker-report transitions such as `Ready -> Review`.
- Unit-test conservative independence checks for disjoint, overlapping, and unknown `scope.write` patterns, including lock/worktree ownership evidence.
- Integration-test tool outputs through the plugin server with temp-worktree ledgers.
- Test unknown blocker answer rejection before testing accepted answers.
- Test MR wait output with fake MR metadata, not real provider credentials.
- Test stop behavior for no active run, active run, active task, and all-target pause.

## Risks

- A test harness that writes real repository protected paths would normalize unsafe behavior. Keep harness writes outside the real worktree or behind plugin-owned APIs.
- A broad worker implementation could outgrow MVP scope. Keep the first slice to one claim/collect path plus explicit deferred states.
- Scope globs can miss hidden coupling between tasks. Treat ambiguous overlap as unsafe and keep default implementation serial.
- Provider-backed MR tests can become flaky. Use fake MR metadata for local tests and reserve provider checks for P2.
