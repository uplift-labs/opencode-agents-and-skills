# Design: Add Autopilot Programmatic Triggers

## Current Evidence

- `.opencode/plugins/openspec-autopilot.ts` exposes model-facing tools, server event/tool hooks, and optional TUI status/check/fallback commands for Autopilot.
- `opencode.json` defines `/autopilot` as a prompt-flow command, so selecting it enters a normal LLM turn before the tools are called.
- OpenCode server plugins can observe bus events through `event`, register tools through `tool`, and enforce blocking guardrails through trigger hooks such as `tool.execute.before` and `tool.execute.after`.
- OpenCode TUI plugins can register zero-LLM commands through `api.keymap.registerLayer({ commands })`, while server slash/custom commands plus `command.execute.before` remain prompt-flow surfaces.
- OpenCode event streams include `file.watcher.updated`, `session.status`, `message.updated`, `message.part.updated`, `question.replied`, `permission.replied`, `workspace.*`, `worktree.*`, `session.error`, and `session.next.*` lifecycle events.
- `add-autopilot-continuous-validation-gates` plans cheap/standard/prepush/final checks and machine-readable output suitable for future hooks and plugin wrappers, but it does not define the OpenCode event bridge.

## Architecture

Autopilot should use one shared controller behind all public entrypoints:

```ts
type AutopilotController = {
  runNext(scope: AutopilotScope, source: TriggerSource): Promise<AutopilotOutput>;
  status(scope: AutopilotScope, source: TriggerSource): Promise<AutopilotOutput>;
  collect(scope: AutopilotScope, source: TriggerSource): Promise<AutopilotOutput>;
  answerBlocker(args: BlockerAnswer, source: TriggerSource): Promise<AutopilotOutput>;
  stop(args: StopArgs, source: TriggerSource): Promise<AutopilotOutput>;
};
```

Existing plugin tool handlers should delegate to this controller. Event hooks, trigger hooks, and future TUI/SDK bridges should also delegate to it rather than duplicating output or transition logic.

The controller must preserve the current output contract: `reasonCode`, `taskSummaries`, `nextActions`, `selection`, `loopGuard`, `tasksStarted`, `tasksAdvanced`, blockers, questions, and metadata remain the authoritative machine-readable surface.

## Trigger Scheduler

Introduce a deterministic scheduler for event-driven actions:

```ts
type AutopilotTriggerJob = {
  id: string;
  kind: "status" | "check" | "collect" | "answer_blocker" | "stop" | "run_next";
  scope?: { changeId?: string; taskId?: string; sessionID?: string; requestID?: string };
  sourceEvent: string;
  sourceID?: string;
  debounceMs: number;
  cooldownMs: number;
  requiresRuntimeOwnership: boolean;
};
```

Scheduler rules:

- Debounce by `kind`, normalized scope, and source path or session id.
- Use single-flight execution so duplicate events attach to one pending job instead of spawning parallel checks.
- Apply cooldowns to noisy sources such as `message.updated`, `session.status`, `file.watcher.updated`, and `vcs.branch.updated`.
- Tag jobs with `source: "autopilot-trigger"` and suppress recursive scheduling from Autopilot-generated events.
- Drop or downgrade jobs when the relevant runtime state is missing, stale, already consumed, or not plugin-owned.
- Log compact summaries through `client.app.log`; do not emit raw prompts, command values, or secrets.
- Unref timers/watchers where possible and cancel pending work on plugin dispose.

## Configuration

Use safe defaults. Passive observation is allowed; claim-capable advancement is not.

```ts
type AutopilotTriggerOptions = {
  triggerMode?: "off" | "observe" | "controlled" | "autonomous";
  fileWatch?: { enabled?: boolean; debounceMs?: number; cooldownMs?: number };
  postToolCheckpoints?: { enabled?: boolean; debounceMs?: number; cooldownMs?: number };
  workerCollect?: { enabled?: boolean; debounceMs?: number };
  blockerReplies?: { enabled?: boolean };
  permissionReplies?: { enabled?: boolean };
  protectedPathGuard?: { enabled?: boolean };
  tuiCommands?: { enabled?: boolean };
  runNextEvents?: { enabled?: boolean; cooldownMs?: number };
};
```

Recommended default interpretation:

- `off`: no event or hook scheduling; explicit tools still work.
- `observe`: file-change status/checks, post-tool cheap checkpoints, protected-path guard, no controlled state transitions.
- `controlled`: observe mode plus collect/blocker/permission triggers when plugin-owned runtime evidence exists.
- `autonomous`: controlled mode plus opt-in `run_next` event triggers, still requiring active-run ownership, no blockers, no MR wait, cooldown, and loop-guard compliance.

## Event Mapping

### File And Evidence Changes

`file.watcher.updated` should classify only supported paths:

- `openspec/changes/*/tasks.md`: schedule status or `autopilot:check --level cheap` when available.
- `openspec/changes/*/automation/**`: schedule ledger/evidence validation or status; never edit protected automation state from the event path.
- `openspec/changes/*/retrospective.md`, evidence reports, validation reports, and `live-regression-report.md`: schedule freshness advisory at standard/final levels when those helpers exist.

Unsupported paths should be ignored. File events should never call `autopilot_run_next` by default.

### Post-Tool Checkpoints

`tool.execute.after` should inspect only Autopilot tool outputs and shape-check defensively:

- After `autopilot_run_next` returns `advanced`, schedule a cheap status/check before any further dispatch or collection.
- After `autopilot_collect` returns `advanced`, schedule a cheap check for affected task ids and runtime conflicts.
- After `runtime_evidence_conflict`, schedule status or report a blocker summary, but do not retry the same tool automatically.
- For `ready_runtime_deferred`, `no_ledgers`, `active_change_handoff`, `collect_deferred`, or no-progress loop guards, do not schedule equivalent repeated calls.

### Worker Completion

`session.status` should trigger collection only for plugin-owned worker sessions recorded in runtime state:

1. Worker session reaches `busy`: mark active.
2. Worker session reaches `idle`: if a complete worker report marker exists or the runtime expects a report, schedule `autopilot_collect` for the related task.
3. Repeated idle events for the same consumed report id are ignored.
4. `retry`, `session.error`, and richer worker failure recovery are deferred from the current MVP; unsupported worker failure signals must not guess a stop/blocker transition without a follow-up spec.

`message.updated` and `message.part.updated` may record report markers, but they must not collect until the worker is idle or the report marker is explicitly complete. Partial stream deltas are not final evidence.

### Blockers And Permissions

`question.replied` should call `autopilot_answer_blocker` only when `requestID` or question metadata matches a plugin-owned pending blocker. Unknown question replies are ignored. `question.rejected` leaves the blocker unresolved and schedules status.

`permission.replied` should update only plugin-owned pending actions. The current MVP schedules status-only evidence for plugin-owned permission replies; richer reject-to-blocker/stop handling requires a follow-up spec before implementation.

### Workspace And Worktree Readiness

`workspace.ready`, `workspace.failed`, `worktree.ready`, and `worktree.failed` are controlled triggers only when Autopilot runtime state is waiting for that workspace/worktree id or name.

- Ready events can schedule status or configured continuation.
- Failed events create a blocker/stop path.
- Unknown workspace/worktree events are ignored.

### TUI Commands

TUI commands should be a separate entrypoint from the server plugin when implemented.

Initial commands:

- `autopilot.status`: zero-LLM status or cheap check with toast/dialog output.
- `autopilot.check`: zero-LLM cheap/standard check when the check helper exists.
- `autopilot.stop`: explicit user action for plugin-owned active runtime state.
- `autopilot.run`: explicit user action; may use a supported server bridge or fall back to prompt-mediated `/autopilot <scope>` until a direct server action is proven.

The TUI command `run()` does not receive raw slash arguments reliably, so scoped arguments should be collected through a TUI dialog or prompt-mediated flow.

## Protected Path Guard

Use `tool.execute.before` or permissions for blocking behavior. The guard should block or ask before model/user tools directly mutate:

- `.autopilot/**`
- `openspec/changes/*/automation/**`

Plugin-owned controller code remains the only allowed writer for protected Autopilot runtime state. The guard must shape-check `bash`, `apply_patch`, and edit/write tool arguments and fail closed when the target cannot be classified safely.

## Implementation Slices

1. Shared controller extraction while preserving existing `autopilot_*` tool tests and output shape.
2. Scheduler module with debounce, single-flight, cooldown, source tags, and recursion guard.
3. Observe-mode server `event` hook for active OpenSpec file changes and safe status/check scheduling.
4. `tool.execute.after` post-tool checkpoints for advanced/conflict Autopilot outputs.
5. Controlled worker idle collect for plugin-owned worker sessions.
6. Controlled blocker and permission reply handling.
7. Protected path guard through `tool.execute.before` or repository permission policy.
8. Optional TUI read-only status/check commands.
9. Explicit TUI run/stop commands after a supported bridge is proven.
10. Autonomous `run_next` event policy only after opt-in config, active-run ownership, locks, no blockers, cooldowns, and tests exist.

## Alternatives Considered

- Keep everything model-facing: rejected because worker completion, blocker replies, and file-change checks are deterministic runtime events that should not require a new LLM turn.
- Trigger `autopilot_run_next` on every relevant file or session event: rejected because it can cause surprise claim/dispatch and no-progress loops.
- Use server `event` hook for enforcement: rejected because event hooks are fire-and-forget; blocking belongs in trigger hooks or permissions.
- Build Desktop/Web UI first: rejected because no general local Desktop/Web plugin surface is available; TUI commands and server tools are the practical first slice.

## Risks

- Event storms can slow the plugin or UI. Mitigation: debounce, cooldown, single-flight, and cheap default actions.
- Recursion can occur when Autopilot-generated outputs trigger Autopilot again. Mitigation: source tagging and loop-guard suppression.
- Worker report parsing can race streaming output. Mitigation: wait for `session.status: idle` or complete report markers.
- Protected path guard can block legitimate plugin writes if ownership is not tagged. Mitigation: keep plugin-owned writes inside controller paths and avoid routing them through model tools.
- TUI/server bridge behavior may vary by OpenCode version. Mitigation: start with read-only TUI status/check and prompt-mediated run fallback.
