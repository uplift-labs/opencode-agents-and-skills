# Proposal: Add Autopilot Fail-Closed Write Gate

## Why

Autopilot now has code-backed ledger validation, worker dispatch, report parsing, protected-ledger writes, and worker scope enforcement. Those guarantees still leave one important escape path: while an explicit Autopilot run is active, the main assistant session can still mutate ordinary repository files directly unless a worker-owned runtime claim exists and the plugin hook blocks that write.

That means strict `task.json` phase control can be bypassed by direct implementation edits that never came from a plugin-owned worker phase, even though protected Autopilot state itself remains guarded. The missing capability is a fail-closed write gate that turns active Autopilot ownership into an executable mutation policy for the whole repository.

## What Changes

- Add an Autopilot write-gate decision helper that classifies tool calls as read-only, mutating, shell-like mutating, or unknown.
- Extend durable runtime evidence with active Autopilot write locks or intent locks tied to task/run/session/scope evidence.
- Enforce active-lock policy in the plugin `tool.execute.before` hook: main-session mutations are blocked during active Autopilot ownership, while plugin-owned worker sessions may mutate only their assigned write scope.
- Fail closed when runtime state is corrupt, missing required ownership evidence, or tool/path classification is unknown.
- Expose compact lock evidence in `autopilot_status` and validation checks so users can audit who is allowed to write.
- Add validation and smoke tests proving ordinary direct edits cannot bypass Autopilot phases.

## Goals

- Make strict Autopilot phase execution algorithmic, not instruction-dependent.
- Prevent main-session code/docs edits during active Autopilot task ownership unless Autopilot is explicitly stopped or handed off.
- Preserve existing worker-scope enforcement for plugin-owned worker sessions.
- Keep `automation/task.json` mutation plugin-only through the existing transition writer.
- Keep normal non-Autopilot work unaffected when no active Autopilot lock exists.

## Non-Goals

- Do not implement cross-process distributed locking or CAS for multiple OpenCode server runtimes in this change.
- Do not make shell command classification a general sandbox; it is a repository mutation gate for Autopilot ownership.
- Do not auto-merge, push, deploy, clean worktrees, or alter remote state.
- Do not rely on prompts, skill text, or worker instructions as the enforcement boundary.
- Do not block read/search/status/validation tooling needed to inspect or recover an Autopilot run.

## Evidence

- `tools/autopilot-ledger.ts` already enforces legal task-status transitions and phase evidence gates for `task.json`.
- `tools/autopilot-ledger-transition-writer.ts` already applies worker reports through validated plugin-owned protected-ledger writes.
- `tools/autopilot-worker-report-parser.ts` already rejects stale, duplicate, malformed, or mismatched worker reports before ledger mutation.
- `tools/autopilot-protected-path-guard.ts` already blocks protected-path writes and worker out-of-scope writes, but it does not block main-session writes to ordinary source/docs files during active Autopilot ownership.
- `.opencode/plugins/openspec-autopilot.ts` already centralizes plugin hook enforcement through `tool.execute.before`, making it the correct integration point for a repository-wide fail-closed write gate.

## Impact

- Explicit Autopilot runs become harder to bypass accidentally because direct main-session edits are rejected while a lock is active.
- Worker dispatch and collect flows gain stronger proof that implementation edits came from the assigned phase worker.
- Users get clearer status when Autopilot is blocked by unavailable worker dispatch, stale runtime evidence, or an active lock that requires `autopilot_stop`/collect/manual release.
- Some currently allowed manual fallback paths will become explicit handoffs or stops instead of silent direct edits.

## Validation

- Add focused write-gate unit tests before implementation.
- Add source-equivalent plugin hook smoke tests for main-session block and worker-scope allow/block behavior.
- Extend runtime-store and `autopilot:check` tests for lock schema, stale/corrupt lock recovery, and active-lock diagnostics.
- Run `npm run validate`.
- Run `npm test`.
- Run `npm run openspec:validate`.
- Run `npm run autopilot:check -- --level standard --change add-autopilot-fail-closed-write-gate` after implementation changes Autopilot runtime behavior.
