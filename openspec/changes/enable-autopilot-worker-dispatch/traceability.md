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

## Out-Of-Scope Follow-Ups

| Future Area | Existing Or Future Tracking |
| --- | --- |
| Auto parallel implementation and fan-in policy | `add-autopilot-auto-parallel-claims` |
| Programmatic trigger scheduler and passive/controlled event mapping | `add-autopilot-programmatic-triggers` |
| Prompt intake that creates or resolves changes before materialization | `add-autopilot-prompt-intake-routing` |
| Materializing missing `automation/task.json` from active OpenSpec changes | `materialize-autopilot-task-ledgers` |
| MR provider actions, merge, deployment, destructive cleanup | Future scoped change after serial dispatch is proven |
