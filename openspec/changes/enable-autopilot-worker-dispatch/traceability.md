# Traceability: Enable Autopilot Worker Dispatch

## Source Evidence

| Evidence | Use In This Change |
| --- | --- |
| `.opencode/plugins/openspec-autopilot.ts` delegates tools to `createAutopilotController` but does not launch workers. | Confirms plugin adapter should stay thin while runtime services are added behind the controller. |
| `tools/openspec-autopilot-controller.ts` centralizes `runNext`, `status`, `collect`, `answerBlocker`, and `stop`. | Defines the integration point for dispatch, durable state, collection, and stop behavior. |
| `tools/openspec-autopilot-output.ts` returns `ready_runtime_deferred` unless claim-capable runtime state is injected. | Confirms the current live boundary and the compatibility fallback that must remain. |
| `tools/openspec-autopilot-runtime.ts` already validates claim/collect transitions, consumed report ids, active state, and fan-in conflicts. | Provides reusable business logic for live dispatch and collection. |
| `tools/autopilot-programmatic-triggers.ts` and `tools/autopilot-trigger-scheduler.ts` classify owned worker events and debounce jobs. | Confirms event handling should consume durable worker evidence instead of duplicating scheduler logic. |
| Local OpenCode docs mirror `D:/uplift-labs/docs` documents server plugin context, event hooks, session/workspace APIs, and plugin best practices. | Supports use of server-plugin session APIs and event-driven collection, not UI automation. |

## Requirement To Task Map

| Requirement | Tests | Implementation |
| --- | --- | --- |
| Durable Plugin-Owned Runtime State | Runtime-store tests; controller active status tests; stop tests | `AutopilotRuntimeStore`, controller runtime integration, stop state updates |
| Serial Worker Dispatch | Fake adapter tests; controller `runNext` tests; disabled capability tests | `workerDispatch.enabled`, worker-session adapter, prompt builder, run-next claim/dispatch flow |
| Strict Worker Report Protocol | Report-parser tests; collect positive/negative tests | Report parser, typed report validation, collect integration |
| Plugin-Owned Ledger Transition Writes | Temp-repo ledger writer tests; stale revision tests | `LedgerTransitionWriter`, refactored transition helper, atomic protected writes |
| Phase-Aware Continuation | Phase dispatcher tests; implementation/review/acceptance collect tests | Phase policy, controller actionability updates, task-type gate integration |
| Worker Scope And Protected Path Enforcement | Protected-path/scope guard tests | Plugin tool/permission guard, path normalization, worker identity checks |
| Event-Driven Collection Uses Owned Worker Evidence | Event/scheduler integration tests | Runtime evidence exported to trigger layer, controlled collect jobs, passive no-claim behavior |

## Completed Slice Evidence

| Slice | Evidence | Residual Boundary |
| --- | --- | --- |
| Runtime store | `tools/autopilot-runtime-store.ts` and `tools/test-autopilot-runtime-store.ts` provide strict schema validation, validate-before-normalize rejection of unknown fields, optional `null` rejection, missing/corrupt/invalid-state recovery, cloned in-memory behavior, full active-run persistence, consumed report id normalization, temp-file atomic save, rollback/cleanup, and same-store overlapping save serialization. Focused, full, OpenSpec, and standard Autopilot checkpoint validation passed. | Serialization is guaranteed for one plugin runtime store instance; cross-process or multi-store writes remain out of scope until controller integration proves a single writer or adds a stronger coordination mechanism. |
| Worker report parser | `tools/autopilot-worker-report-parser.ts` and `tools/test-autopilot-worker-report-parser.ts` provide strict standalone complete-marker parsing, JSON payload extraction, allowed-key/schema validation, duplicate/consumed report id rejection, stored run evidence matching, optional target-status handling, non-empty blocker and nested evidence preservation, and structured rejection reason codes. Focused, full, OpenSpec, and reviewer validation passed. | Parser validates envelope shape and stored-run evidence only; legal phase transition and protected ledger mutation remain out of scope for the ledger writer and phase-policy slices. |
| Ledger transition writer | `tools/autopilot-ledger-transition-writer.ts` and `tools/test-autopilot-ledger-transition-writer.ts` provide active OpenSpec ledger path safety, symlink/junction rejection, current/next/post-write validation, stale revision/status detection, exact duplicate report id idempotency, temp-file atomic writes, blocked-state blocker clearing, and byte-preservation checks for rejection paths. Focused, full, OpenSpec, and reviewer validation passed. | Writer is not yet wired into `autopilot_collect`; controller/runtime integration must still serialize plugin-owned writers per ledger and connect parsed reports to durable runtime state. |
| Phase dispatcher | `tools/autopilot-phase-dispatcher.ts` and `tools/test-autopilot-phase-dispatcher.ts` provide deterministic decisions for Ready, Analyze, Implementation, Review, Acceptance, Blocked, and terminal states across feature, typo, planning, bugfix, and research examples. Focused, full, OpenSpec, and standard Autopilot checkpoint validation passed. | The policy is pure and not yet wired into `createAutopilotController`, worker prompt generation, or live worker-session dispatch. |

## Out-Of-Scope Follow-Ups

| Future Area | Existing Or Future Tracking |
| --- | --- |
| Auto parallel implementation and fan-in policy | `add-autopilot-auto-parallel-claims` |
| Programmatic trigger scheduler and passive/controlled event mapping | `add-autopilot-programmatic-triggers` |
| Prompt intake that creates or resolves changes before materialization | `add-autopilot-prompt-intake-routing` |
| Materializing missing `automation/task.json` from active OpenSpec changes | `materialize-autopilot-task-ledgers` |
| MR provider actions, merge, deployment, destructive cleanup | Future scoped change after serial dispatch is proven |
