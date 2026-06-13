# Traceability: Add Autopilot Fail-Closed Write Gate

## Source Evidence

| Evidence | Use In This Change |
| --- | --- |
| `tools/autopilot-ledger.ts` validates legal task-status transitions and phase evidence gates. | Confirms `task.json` phase transitions are already code-backed and should remain final authority for ledger advancement. |
| `tools/autopilot-ledger-transition-writer.ts` owns protected ledger mutation from validated worker reports. | Confirms the new write gate should not write ledgers directly; it should protect normal repository mutations around this existing writer. |
| `tools/autopilot-worker-report-parser.ts` validates worker report identity, status, report id, and payload shape. | Confirms worker output acceptance is already algorithmic and should be coupled with write-origin enforcement. |
| `tools/autopilot-protected-path-guard.ts` blocks direct protected-path writes and worker out-of-scope writes. | Provides existing guard behavior that the new write gate should compose rather than duplicate. |
| `.opencode/plugins/openspec-autopilot.ts` enforces path/scope hooks through `tool.execute.before`. | Defines the integration point for fail-closed repository-wide mutation blocking. |
| Current `autopilot_status` can return `ready_runtime_deferred` for a valid Ready ledger. | Shows the current gap where Autopilot can identify owned work without live dispatch, leaving a manual-edit temptation path. |

## Requirement To Task Map

| Requirement | Tests | Implementation |
| --- | --- | --- |
| Active Autopilot Ownership Blocks Main-Session Mutations | Write-gate unit tests; plugin hook smoke for main-session block; shell-classification tests | `autopilot-write-gate` helper; plugin `tool.execute.before` integration; lock lifecycle state |
| Plugin-Owned Workers Can Write Only Assigned Scope | Worker scoped allow/block tests; inactive worker tests; protected path tests | Existing worker scope guard composition; worker session/run status evidence checks |
| Runtime Evidence Failures Fail Closed | Corrupt runtime tests; unknown tool classification tests; `autopilot:check` lock diagnostics | Runtime-store validation; corrupt-load mutation blocking; conservative classifier |
| Intent Locks Prevent Manual Autopilot Fallback | Controller disabled/unavailable dispatch tests; stop release tests | Intent lock lifecycle in `autopilot_run_next`, `autopilot_stop`, status next actions |
| Write-Gate State Is Observable And Validated | Status/check tests for compact lock evidence and no leakage | `autopilot_status` output updates; `autopilot:check` lock consistency checks |

## Out-Of-Scope Follow-Ups

| Future Area | Tracking |
| --- | --- |
| Cross-process runtime lock or CAS for multiple OpenCode server instances | Future scoped change after single-runtime fail-closed gate lands. |
| Default parallel/worktree fan-out policy | Existing `add-autopilot-auto-parallel-claims` scope. |
| MR provider merge/deploy/destructive cleanup enforcement | Future MR/deployment scoped changes. |
