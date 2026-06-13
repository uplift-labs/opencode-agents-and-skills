# Traceability: Enable Autopilot Worker Dispatch

## Source Evidence

| Evidence | Use In This Change |
| --- | --- |
| `.opencode/plugins/openspec-autopilot.ts` delegates public tools to `createAutopilotController`, creates the durable runtime store only when `workerDispatch.enabled`, wires the OpenCode worker-session adapter, and enforces protected-path/worker-scope hooks. | Confirms plugin adapter stays thin while runtime services and worker dispatch live behind the controller. |
| `tools/openspec-autopilot-controller.ts` centralizes `runNext`, `status`, `collect`, `answerBlocker`, and `stop`. | Defines the integration point for dispatch, durable state, collection, and stop behavior. |
| `tools/openspec-autopilot-output.ts` returns `ready_runtime_deferred` unless claim-capable runtime state is injected. | Confirms the current live boundary and the compatibility fallback that must remain. |
| `tools/openspec-autopilot-runtime.ts` already validates claim/collect transitions, consumed report ids, active state, and fan-in conflicts. | Provides reusable business logic for live dispatch and collection. |
| `tools/autopilot-programmatic-triggers.ts` and `tools/autopilot-trigger-scheduler.ts` classify owned worker events and debounce jobs. | Confirms event handling should consume durable worker evidence instead of duplicating scheduler logic. |
| Local OpenCode docs mirror `D:/uplift-labs/docs` documents server plugin context, event hooks, session/workspace APIs, and plugin best practices. | Supports use of server-plugin session APIs and event-driven collection, not UI automation. |

## Requirement To Task Map

| Requirement | Tests | Implementation |
| --- | --- | --- |
| Durable Plugin-Owned Runtime State | Runtime-store tests; controller active status tests; stop tests | `AutopilotRuntimeStore`, controller runtime integration, stop state updates |
| Serial Worker Dispatch | Worker-session adapter tests; controller `runNext` tests; restart/reload duplicate-claim tests; source-equivalent plugin worker smoke | `workerDispatch.enabled`, SDK-shaped worker-session adapter, prompt builder, serialized run-next claim/create/persist/prompt flow |
| Strict Worker Report Protocol | Report-parser tests; collect positive/negative tests; prompt-echo filtering tests; role-less prompt-marker rejection; messages-throw tests | Report parser, typed report validation, SDK explicit assistant-message filtering, collect integration |
| Plugin-Owned Ledger Transition Writes | Temp-repo ledger writer tests; stale revision tests | `LedgerTransitionWriter`, refactored transition helper, atomic protected writes |
| Phase-Aware Continuation | Phase dispatcher tests; implementation/review/acceptance collect tests | Phase policy, controller actionability updates, task-type gate integration |
| Worker Scope And Protected Path Enforcement | Protected-path/scope guard tests; source-equivalent worker hook tests for out-of-scope, stopped/done/failed terminal-session, and corrupt-runtime writes | Plugin tool/permission guard, path normalization, validation-command classification, worker identity/status checks, fail-closed corrupt runtime handling |
| Event-Driven Collection Uses Owned Worker Evidence | Event/scheduler integration tests | Runtime evidence exported to trigger layer, controlled collect jobs, passive no-claim behavior |

## Completed Slice Evidence

| Slice | Evidence | Residual Boundary |
| --- | --- | --- |
| Runtime store | `tools/autopilot-runtime-store.ts` and `tools/test-autopilot-runtime-store.ts` provide strict schema validation, validate-before-normalize rejection of unknown fields, optional `null` rejection, clean missing-state first-run behavior, corrupt/invalid-state recovery diagnostics, cloned in-memory behavior, full active-run persistence, consumed report id normalization, temp-file atomic save, rollback/cleanup, and same-store overlapping save serialization. Focused, full, OpenSpec, and standard Autopilot checkpoint validation passed. | Serialization is guaranteed for one plugin runtime store instance; README and skill document the single-instance boundary until an external lock/CAS layer exists. |
| Worker report parser | `tools/autopilot-worker-report-parser.ts` and `tools/test-autopilot-worker-report-parser.ts` provide strict standalone complete-marker parsing, JSON payload extraction, allowed-key/schema validation, duplicate/consumed report id rejection, stored run evidence matching, optional target-status handling, non-empty blocker and nested evidence preservation, and structured rejection reason codes. Focused, full, OpenSpec, and reviewer validation passed. | Parser validates envelope shape and stored-run evidence only; legal phase transition and protected ledger mutation remain out of scope for the ledger writer and phase-policy slices. |
| Ledger transition writer | `tools/autopilot-ledger-transition-writer.ts` and `tools/test-autopilot-ledger-transition-writer.ts` provide active OpenSpec ledger path safety, symlink/junction rejection, current/next/post-write validation, stale revision/status detection, exact duplicate report id idempotency, temp-file atomic writes, blocked-state blocker clearing, and byte-preservation checks for rejection paths. `tools/openspec-autopilot-controller.ts` wires the writer into live `autopilot_collect` after a serialized `collecting` claim, and tests cover valid, malformed, repeated, overlapping, and read-error collect paths. | Cross-process/multi-server ledger write serialization remains out of scope under the documented single-instance runtime boundary. |
| Phase dispatcher | `tools/autopilot-phase-dispatcher.ts` and `tools/test-autopilot-phase-dispatcher.ts` provide deterministic decisions for Ready, Analyze, Implementation, Review, Acceptance, Blocked, and terminal states across feature, typo, planning, bugfix, and research examples. Controller dispatch uses this policy for Ready and non-terminal continuation, and prompt builder includes phase goals and evidence requirements. | Later parallel/worktree dispatch policies remain in separate OpenSpec changes. |
| Worker session adapter and source-equivalent plugin smoke | `tools/autopilot-worker-session-adapter.ts`, `tools/test-autopilot-worker-session-adapter.ts`, and `tools/test-autopilot-plugin-worker-dispatch-smoke.ts` prove SDK-shaped `session.create`, `promptAsync`, and `messages` requests, worktree directory preference, create/prompt/messages thrown-error handling, prompt/user/role-less message filtering, live dispatch, durable idle collect, repeated idle no double advance, compact log redaction, and worker-scope hook fail-closed behavior for out-of-scope, corrupt-runtime, stopped, failed, and done sessions. | These are source-equivalent fake-client checks, not a restarted live OpenCode E2E against external provider credentials. |
| Reviewer-fix coverage | Focused reviewer-fix tests added coverage for stale ledger collect rejection without report consumption, stopped `recentRuns[]` status evidence without active claim ownership, byte preservation for disabled/unavailable/dependency/create-failure/prompt-failure dispatch paths, safe validation command allowlisting, compound shell fail-closed handling, and raw report/log redaction. | Protected `automation/task.json` remains plugin-owned; manual session evidence is recorded in `tasks.md` but the materialized ledger itself is not manually edited. |

## Out-Of-Scope Follow-Ups

| Future Area | Existing Or Future Tracking |
| --- | --- |
| Auto parallel implementation and fan-in policy | `add-autopilot-auto-parallel-claims` |
| Broad programmatic trigger scheduler policy and passive/controlled event mapping beyond owned worker collect evidence | `add-autopilot-programmatic-triggers`; this change completes the owned worker idle/report collect integration needed for live worker dispatch. |
| Prompt intake that creates or resolves changes before materialization | `add-autopilot-prompt-intake-routing` |
| Materializing missing `automation/task.json` from active OpenSpec changes | `materialize-autopilot-task-ledgers` |
| MR provider actions, merge, deployment, destructive cleanup | Future scoped change after serial dispatch is proven |
