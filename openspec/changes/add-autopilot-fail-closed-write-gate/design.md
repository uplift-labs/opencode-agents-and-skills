# Design: Autopilot Fail-Closed Write Gate

## Summary

Autopilot must treat active task ownership as a repository mutation lock. When an explicit Autopilot run owns a task, the main assistant session can inspect status, collect reports, answer blockers, stop the run, or run validation, but it cannot edit ordinary repository files directly. Only the plugin-owned worker session for the active run can write, and only inside the assigned write scope.

The enforcement boundary is the OpenCode plugin `tool.execute.before` hook, not prompts or instructions. The hook combines existing protected-path and worker-scope guards with a new active-lock gate.

## Runtime Lock Model

Extend durable runtime state with normalized lock records or equivalent derived lock evidence:

```ts
type AutopilotWriteLock = {
  lockId: string;
  kind: "run" | "intent";
  status: "active" | "releasing" | "released" | "failed";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  taskId?: string;
  runId?: string;
  ledgerPath?: string;
  ownerSessionId?: string;
  workerSessionIds: string[];
  reason: string;
  scope: {
    read: string[];
    write: string[];
    forbidden: string[];
  };
};
```

`run` locks are tied to active worker-dispatch records. `intent` locks are optional guard records created when explicit Autopilot selection proves a valid task is owned by Autopilot but worker dispatch cannot start safely. Intent locks prevent the main session from silently performing manual implementation under the Autopilot label.

Lock validation rules:

- `schemaVersion` remains stable and rejects unknown lock fields.
- Active locks must reference either a valid active run or a valid selected task intent.
- `workerSessionIds` must be sorted/unique strings.
- `scope.write` and `scope.forbidden` must be normalized non-empty arrays when a worker may write.
- Runtime recovery conflicts make mutation gating fail closed.

## Gate Algorithm

Add a pure helper, for example `tools/autopilot-write-gate.ts`:

```ts
type AutopilotWriteGateDecision =
  | { action: "allow"; reason: string; paths?: string[] }
  | { action: "block"; reason: string; paths?: string[] };
```

Inputs:

- tool name;
- tool args;
- current session id;
- durable runtime snapshot load result;
- existing protected-path patterns;
- existing worker scope guard.

Decision order:

1. Always run protected-path classification for `.autopilot/**` and `openspec/changes/*/automation/**` mutations.
2. If runtime state is corrupt or recovered with errors, block mutating tools that can affect repository files.
3. If no active Autopilot write lock exists, allow ordinary non-protected mutations under existing repository policy.
4. If an active lock exists and the current session id is not one of the active worker session ids, block mutating tools.
5. If the session is an active worker, require a matching run with status `running`.
6. For active workers, delegate path checks to `guardAutopilotWorkerScopeToolCall` and block writes outside `scope.write`, inside `scope.forbidden`, or inside protected Autopilot state.
7. Allow read-only tools and known validation commands needed for status, checks, tests, and recovery.
8. If tool mutability or shell command safety cannot be classified, block while an active lock exists.

## Tool Classification

The classifier should be deterministic and conservative.

Read-only examples:

- file reads, glob/search, status tools, `autopilot_status`, `autopilot_collect`, `autopilot_stop`, `autopilot_answer_blocker`;
- simple validation commands such as `npm test`, `npm run validate`, `npm run openspec:validate`, `npm run autopilot:check`, and focused `node tools/test-*.ts` when they do not contain shell control syntax or redirection.

Mutating examples:

- `apply_patch`, edit/write/create/delete/rename/insert/replace tools;
- shell commands containing write cmdlets, redirection, temp-file writes, removal, move/copy, `sed -i`, `tee`, `node -e` filesystem writes, or control syntax that prevents reliable path classification.

Unknown examples:

- unsupported tool names that can plausibly mutate files;
- shell commands with aliases, nested interpreters, dynamic script generation, or unparseable path writes.

Unknown under active lock means block.

## Plugin Integration

Update `.opencode/plugins/openspec-autopilot.ts` hook flow:

1. Load durable runtime state.
2. If state load recovered with errors, invoke write gate in corrupt-runtime mode.
3. Evaluate protected-path guard for all sessions.
4. Evaluate active write gate when locks exist or when the session matches a known worker run.
5. Throw a clear plugin error on block, including lock id/run id/task id when safe to disclose.

The error should say that active Autopilot ownership allows mutation only from the plugin-owned worker session and that `autopilot_stop` or `autopilot_collect` is the safe continuation path.

## Lock Lifecycle

### `autopilot_run_next`

- When worker dispatch starts, create or derive a `run` write lock before the worker prompt can execute.
- Persist `workerSessionId` before prompting the worker so hook enforcement can recognize the session.
- If dispatch capability is unavailable after a deterministic task selection and explicit Autopilot continuation, create an `intent` lock only when policy chooses fail-closed no-manual-fallback behavior.
- Do not create locks for read-only `autopilot_status`, no-ledger discovery, invalid-ledger outputs, or ambiguous scope blockers.

### `autopilot_collect`

- Keep worker writes blocked while the run is `collecting`.
- Release or update the active lock only after report parsing, ledger transition, and runtime state updates finish.
- Preserve blocked or MR-wait ownership as active lock states if they still own the task and should prevent direct main-session edits.

### `autopilot_stop`

- Mark matching locks released/stopped.
- Do not delete evidence needed for diagnostics.
- After stop succeeds, ordinary mutations are allowed again unless another active lock remains.

### Expiry And Recovery

- Optional expiry may convert stale intent locks into blocked diagnostics, but must not silently allow writes when runtime evidence is corrupt.
- Corrupt runtime state blocks repository mutations until repaired, stopped, or explicitly reset through a safe plugin-owned recovery path.

## Status And Validation Output

`autopilot_status` should report compact lock evidence:

- active lock count;
- lock kind/status;
- task/run ids;
- worker session ids;
- whether main-session writes are currently blocked;
- next safe actions such as collect, stop, wait, or resolve runtime conflict.

`autopilot:check` should validate lock consistency:

- active locks reference valid runtime runs or selected intent tasks;
- active worker session ids match running worker records;
- scopes are normalized and comparable;
- no active lock references archived changes;
- active lock state is absent or explicitly allowed before pre-push/final claims.

## Compatibility

Normal non-Autopilot development remains unchanged when no active lock exists. Existing protected-path guard behavior remains stricter than the new lock gate for protected Autopilot paths.

The feature should be configurable but safe by default for explicit Autopilot:

```json
{
  "writeGate": {
    "enabled": true,
    "mode": "active-autopilot-fail-closed",
    "allowWhenRuntimeUnavailable": false
  }
}
```

`protect-state-only` may remain available for compatibility, but it must not be advertised as strict phase enforcement.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| False-positive shell blocking | Workers or agents cannot run useful commands | Allow deterministic read-only validation commands and return clear blocked diagnostics. |
| Stale lock blocks normal work | User frustration after failed run | Provide `autopilot_status` and `autopilot_stop` recovery paths with durable diagnostics. |
| Multiple server runtimes race state | Inconsistent enforcement | Keep documented single-runtime boundary and fail closed on corrupt state; cross-process CAS remains separate. |
| Intent locks over-block manual handoff | Manual fallback harder | Require explicit stop/handoff action rather than silent direct edits under Autopilot. |
| Tool API changes bypass classifier | Mutation leak | Fail closed for unknown mutating-looking tools and add contract drift tests. |
