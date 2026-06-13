# autopilot-worker-dispatch Specification

## ADDED Requirements

### Requirement: Durable Plugin-Owned Runtime State

Autopilot SHALL persist enough plugin-owned runtime state to recover, inspect, stop, and collect active worker-dispatch runs without relying on agents to edit protected files.

#### Scenario: Claim records active runtime state before worker dispatch

- **GIVEN** a valid dispatchable task ledger exists
- **AND** worker dispatch is explicitly enabled
- **WHEN** `autopilot_run_next` claims the selected task
- **THEN** Autopilot records a plugin-owned runtime entry with run id, task id, ledger path, expected report id, worker id, current status, scope evidence, and ledger revision evidence
- **AND** `autopilot_status` exposes a compact active-run summary without leaking raw prompts, secrets, or full ledger contents

#### Scenario: Restart or reload reconciliation prevents duplicate claims

- **GIVEN** durable runtime state contains an active claimed task
- **WHEN** Autopilot starts or `autopilot_run_next` is called again
- **THEN** Autopilot reconciles the active claim with the current ledger before selecting new work
- **AND** it does not claim a second task while a serial active worker is still running
- **AND** it reports whether the existing claim should be collected, stopped, or reviewed

#### Scenario: Stop marks active runtime state without destructive cleanup

- **GIVEN** a serial worker-dispatch run is active
- **WHEN** `autopilot_stop` is called for the run, task, or all active Autopilot work
- **THEN** Autopilot records the stop in plugin-owned runtime state
- **AND** future collect/run-next calls do not treat the stopped claim as active dispatchable work
- **AND** the stop action does not merge, delete worktrees, remove user files, or mutate protected ledgers except through explicit validated transition logic

### Requirement: Serial Worker Dispatch

Autopilot SHALL be able to launch one scoped worker session for the selected dispatchable task when runtime capability and safety gates are satisfied.

#### Scenario: Ready task starts a worker instead of deferring runtime

- **GIVEN** a valid `Ready` task ledger exists
- **AND** worker dispatch is explicitly enabled
- **AND** the OpenCode worker-session adapter reports dispatch capability available
- **AND** no blocker, MR wait, invalid ledger, active serial worker, stale runtime evidence, or unsafe scope exists
- **WHEN** `autopilot_run_next` evaluates the queue
- **THEN** Autopilot selects one deterministic primary task
- **AND** it dispatches exactly one worker session for that task
- **AND** the output has `outcome` `advanced`, `reasonCode` `advanced`, matching `tasksStarted[]` evidence, and the same selected task in `selection.selectedTaskId`

#### Scenario: Runtime capability missing remains a safe no-progress state

- **GIVEN** a valid dispatchable task ledger exists
- **AND** worker dispatch is disabled or the worker-session adapter reports capability unavailable
- **WHEN** `autopilot_run_next` evaluates the queue
- **THEN** Autopilot does not create a worker session
- **AND** it does not mutate protected ledgers
- **AND** it returns `ready_runtime_deferred` or a specific blocker explaining why dispatch is unavailable
- **AND** loop-guard behavior prevents equivalent no-progress retries

#### Scenario: Active serial worker blocks additional claims

- **GIVEN** durable runtime state contains an active serial worker for task `A`
- **AND** another task `B` is Ready
- **WHEN** `autopilot_run_next` is called without stopping or collecting task `A`
- **THEN** Autopilot does not claim task `B`
- **AND** it reports the active worker state and a safe next action such as collect, status, stop, or wait

### Requirement: Strict Worker Report Protocol

Autopilot SHALL accept worker results only through a complete structured report that matches plugin-owned runtime state.

#### Scenario: Complete matching report is accepted for collection

- **GIVEN** a plugin-owned worker run expects report id `R`
- **AND** the worker session is idle or explicitly marked complete
- **AND** the worker output contains exactly one complete `AUTOPILOT_WORKER_REPORT R COMPLETE` marker with a valid JSON payload
- **AND** the payload matches the stored run id, worker id, session id, task id, ledger path, and from-status evidence
- **WHEN** `autopilot_collect` parses the report
- **THEN** Autopilot treats the report as candidate transition evidence
- **AND** it continues to ledger validation before reporting advancement

#### Scenario: Malformed or mismatched report is rejected

- **GIVEN** a plugin-owned worker run expects report id `R`
- **WHEN** `autopilot_collect` observes no complete marker, a partial marker, more than one complete report, invalid JSON, an unknown report id, or mismatched run/task/session/status evidence
- **THEN** Autopilot returns `runtime_evidence_conflict` or a blocked review state
- **AND** it emits no `tasksAdvanced[]` transition
- **AND** it does not mark the report id as consumed
- **AND** it does not mutate protected ledger state

#### Scenario: Duplicate report ids are idempotent

- **GIVEN** a worker report id was already consumed by a successful collect
- **WHEN** `autopilot_collect` sees the same report id again
- **THEN** Autopilot reports that the report was already consumed
- **AND** it does not advance the task a second time

### Requirement: Plugin-Owned Ledger Transition Writes

Autopilot SHALL mutate `automation/task.json` only through validated plugin-owned transition logic.

#### Scenario: Legal report transition updates the protected ledger

- **GIVEN** a current task ledger is valid
- **AND** a collected worker report matches the active claim and proposes a legal transition for the current status
- **WHEN** Autopilot applies the report
- **THEN** it validates the current ledger
- **AND** it verifies task id, ledger path, from-status, and revision evidence before applying the transition
- **AND** it validates the next ledger state with `validateTaskLedger`
- **AND** it atomically writes `automation/task.json` through plugin-owned code
- **AND** `tasksAdvanced[]` records the transition and `mutation` `plugin-owned-protected-ledger`

#### Scenario: Invalid next ledger is not written

- **GIVEN** a collected worker report would create an invalid task ledger
- **WHEN** Autopilot validates the proposed next ledger
- **THEN** validation failure blocks the transition
- **AND** the original ledger file remains unchanged
- **AND** Autopilot returns blocker or conflict evidence with the validation errors

#### Scenario: Stale ledger evidence blocks mutation

- **GIVEN** a worker report was produced from an older claim revision
- **AND** the current ledger status or revision no longer matches the claim evidence
- **WHEN** `autopilot_collect` tries to apply the report
- **THEN** Autopilot returns `runtime_evidence_conflict`
- **AND** it does not write the stale transition
- **AND** the report id is not marked consumed as a successful advancement

### Requirement: Phase-Aware Continuation

Autopilot SHALL evaluate non-terminal task phases as dispatchable, blocked, waiting, or terminal using structured phase policy and ledger validation.

#### Scenario: Analyze phase can continue through implementation or review gates

- **GIVEN** a valid task ledger is in `Analyze`
- **WHEN** `autopilot_run_next` evaluates the task
- **THEN** Autopilot determines whether analysis evidence is required, already sufficient for `Implementation`, or sufficient for `Review` for research/planning work
- **AND** it dispatches or blocks according to task type gates instead of returning generic no-actionable output

#### Scenario: Implementation phase requires validation evidence

- **GIVEN** a valid task ledger is in `Implementation`
- **WHEN** a worker report proposes `Implementation -> Review`
- **THEN** Autopilot requires changed files or a no-op reason, validation evidence or skipped reason, and secret scan status or placeholder required by the ledger validator
- **AND** missing evidence blocks the transition before protected ledger mutation

#### Scenario: Review and Acceptance stop at reviewer, MR, or archive blockers

- **GIVEN** a valid task ledger is in `Review` or `Acceptance`
- **WHEN** Autopilot evaluates the next action
- **THEN** it dispatches reviewer/acceptance work only when required evidence can be produced safely
- **AND** it stops at failed review, user blocker, MR wait, missing credentials, or archive/retro gate blockers without pretending the task is Done

### Requirement: Worker Scope And Protected Path Enforcement

Autopilot SHALL enforce worker write scope and protected Autopilot paths with runtime checks, not prompt wording alone.

#### Scenario: Worker cannot edit protected Autopilot state directly

- **GIVEN** a tool call originates from a plugin-owned Autopilot worker session
- **WHEN** the tool attempts to edit `.autopilot/**` or `openspec/changes/*/automation/**`
- **THEN** the plugin blocks the write unless the operation is the internal plugin-owned ledger writer path
- **AND** the worker is instructed to return report evidence instead

#### Scenario: Worker writes are limited to assigned scope

- **GIVEN** a worker is assigned a task with `scope.write` and `scope.forbidden`
- **WHEN** the worker attempts to write outside the allowed scope, write a forbidden path, or use an absolute/traversal path that cannot be compared safely
- **THEN** Autopilot blocks the write for plugin-owned worker sessions
- **AND** fail-closed blocking applies when worker identity, active write ownership, or scope ownership cannot be verified

### Requirement: Event-Driven Collection Uses Owned Worker Evidence

Autopilot SHALL use programmatic worker-idle/report-marker events only when they match plugin-owned runtime state.

#### Scenario: Owned idle worker schedules collect

- **GIVEN** durable runtime state records worker session `S` for task `T` with expected report id `R`
- **AND** the programmatic trigger layer observes session `S` idle with a complete matching report marker
- **WHEN** trigger mode permits controlled worker collection
- **THEN** the scheduler enqueues one scoped `autopilot_collect` job for task `T`
- **AND** repeated idle events for an already consumed report do not enqueue duplicate advancement

#### Scenario: Passive or unrelated events cannot claim work

- **GIVEN** observe-mode file or session events occur
- **WHEN** the event does not match plugin-owned active worker evidence
- **THEN** Autopilot may schedule status or cheap validation where appropriate
- **AND** it does not call claim-capable `autopilot_run_next`
- **AND** it does not dispatch a worker or mutate protected ledger state
