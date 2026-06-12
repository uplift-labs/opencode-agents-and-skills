# Autopilot Runtime Spec

## ADDED Requirements

### Requirement: Plugin-Owned Runtime Harness

Autopilot SHALL provide a plugin-owned way to test runtime states without requiring agents to manually write protected paths.

#### Scenario: Harness seeds runtime state safely

- **GIVEN** a regression or test needs Ready ledgers, worker reports, blocker questions, or MR waits
- **WHEN** the test uses the Autopilot runtime harness
- **THEN** state is created through plugin-owned code, deterministic in-memory fixtures, or temp-worktree fixture setup owned by the test process
- **AND** agents do not manually write `.autopilot/**` or `openspec/changes/*/automation/**` in the user repository

### Requirement: Ready Ledger Runtime Progress Is Explicit

Autopilot SHALL distinguish no work, valid Ready work that cannot be advanced by the current MVP, and work that was actually advanced.

#### Scenario: Ready ledger cannot be advanced by current runtime

- **GIVEN** a valid Ready task ledger exists
- **WHEN** `autopilot_run_next` cannot claim, dispatch, or advance it
- **THEN** the tool reports a clear deferred/blocked reason instead of ambiguous progress
- **AND** the output includes the task id or ledger evidence needed for the next safe action

#### Scenario: Claim harness records observable active runtime state

- **GIVEN** a valid Ready task ledger exists
- **AND** plugin-owned claim harness mode is enabled
- **WHEN** `autopilot_run_next` validates the selected task claim
- **THEN** it records the selected task in plugin-owned active runtime state
- **AND** a later `autopilot_stop` for that task reports `stop_applied`
- **AND** no protected ledger state is mutated

### Requirement: Default Runtime Selection Is Single-Task And Deterministic

Autopilot SHALL select at most one primary implementation task by default and SHALL explain selection using deterministic ledger evidence.

#### Scenario: Multiple Ready ledgers exist in default mode

- **GIVEN** multiple valid Ready task ledgers exist
- **AND** no explicit parallel implementation mode is enabled
- **WHEN** `autopilot_run_next` evaluates the queue
- **THEN** Autopilot selects no more than one primary task for implementation
- **AND** the selected task is chosen by deterministic ranking keys such as explicit scope, dependency readiness, normalized priority, write-scope size, and stable tie-breakers
- **AND** the output includes top-level selection evidence with the selected task id, candidate ranks, and reasons why other Ready candidates were not selected

#### Scenario: Explicit task scope overrides queue ranking

- **GIVEN** a valid Ready task ledger with id `T` exists
- **AND** task `T` is not blocked, waiting for MR, terminal, invalid, or dependency-blocked
- **WHEN** `autopilot_run_next` is called with `taskId` `T`
- **THEN** Autopilot evaluates `T` as the primary candidate before lower-scoped queue candidates
- **AND** it reports a blocker instead of silently selecting another task if `T` cannot legally advance

### Requirement: Parallel Implementation Is Explicit And Guarded

Autopilot SHALL NOT start multiple implementation workstreams unless explicit parallel implementation mode is enabled and deterministic independence checks pass.

#### Scenario: Additional parallel-ready work is visible but not started by default

- **GIVEN** two valid Ready task ledgers have independent write scopes
- **AND** no explicit parallel implementation mode is enabled
- **WHEN** `autopilot_run_next` evaluates the queue
- **THEN** Autopilot may report that the second task is parallel-ready
- **BUT** default serial implementation starts at most the selected primary task
- **AND** it marks the other task as not selected because serial default is active
- **AND** `selection.mode` remains `serial_default`

#### Scenario: Parallel implementation requires independence proof

- **GIVEN** explicit parallel implementation mode is enabled
- **AND** multiple Ready task ledgers are candidates
- **WHEN** Autopilot considers starting more than one implementation worker
- **THEN** each additional worker starts only if dependencies are complete, write scopes are disjoint, unsupported glob overlap is treated as unsafe, runtime locks are acquired, isolated branches or worktrees are available, and the WIP limit is not exceeded
- **AND** tasks that fail any check remain unstarted with a machine-readable reason
- **AND** `selection.mode` is `parallel_implementation` only when explicit opt-in is active
- **AND** harness worktree evidence is accepted only for relative `autopilot/...` paths owned by the task id

### Requirement: Blocker Answers Match Pending Questions

Autopilot SHALL accept blocker answers only for plugin-owned pending questions.

#### Scenario: Unknown blocker answer is rejected

- **GIVEN** no pending blocker question has id `Q`
- **WHEN** `autopilot_answer_blocker` is called with `questionId` `Q`
- **THEN** the tool returns a clear failed or blocked result
- **AND** no state is advanced

#### Scenario: Pending blocker answer is validation-only in MVP

- **GIVEN** a plugin-owned pending blocker question has matching id, task id, label, and action
- **WHEN** `autopilot_answer_blocker` receives that answer envelope
- **THEN** it accepts the envelope and recommends status inspection
- **AND** it does not record an answered state in MVP
- **AND** no protected ledger state is mutated

### Requirement: Worker Report Collection Is Idempotent And Legal

Autopilot SHALL consume plugin-owned worker reports at most once per report id and SHALL advance only ledger-valid legal transitions.

#### Scenario: Repeated collect does not advance the same report twice

- **GIVEN** a Ready task ledger and a plugin-owned worker report that advances it from `Ready` to `Analyze`
- **WHEN** `autopilot_collect` is called twice against the same plugin-owned runtime state
- **THEN** the first call may report validation-only `advanced` evidence for the accepted in-memory transition
- **AND** the runtime records the worker report id as consumed
- **AND** the second call reports that the worker report was already consumed without adding `tasksAdvanced`
- **AND** no protected ledger state is mutated by either call

#### Scenario: Illegal worker report transition is rejected

- **GIVEN** a Ready task ledger
- **AND** a plugin-owned worker report tries to advance the task from `Ready` to `Review`
- **WHEN** `autopilot_collect` evaluates the report
- **THEN** Autopilot returns `runtime_evidence_conflict` with `Ready -> Review` validation evidence
- **AND** no `tasksAdvanced` entry is emitted
- **AND** no protected ledger state is mutated

#### Scenario: Duplicate worker report ids are rejected in one collect operation

- **GIVEN** two Ready task ledgers
- **AND** two plugin-owned worker reports share the same report id while targeting different tasks
- **WHEN** `autopilot_collect` evaluates the reports in one operation
- **THEN** Autopilot returns `runtime_evidence_conflict` with duplicate report-id evidence
- **AND** no `tasksAdvanced` entry is emitted
- **AND** the shared report id is not recorded as consumed
- **AND** no protected ledger state is mutated

### Requirement: Runtime Evidence Conflicts Stop Advancement

Autopilot SHALL stop instead of claiming, dispatching, collecting, or advancing a task when runtime evidence conflicts with ledger validation, plugin-owned state, or report/task status evidence.

#### Scenario: Ledger validation conflicts with runtime advancement

- **GIVEN** Autopilot has selected a task candidate
- **AND** current ledger validation or plugin-owned runtime state contradicts the transition Autopilot is about to perform
- **WHEN** `autopilot_run_next` or `autopilot_collect` evaluates the task
- **THEN** Autopilot returns a clear failed or blocked result with machine-readable conflict evidence
- **AND** no protected state is mutated

#### Scenario: Report or checklist evidence conflicts with runtime state

- **GIVEN** a report or `tasks.md` claim implies a task is complete or advanced
- **AND** plugin-owned runtime state or ledger status shows the task is still Ready, blocked, invalid, or waiting
- **WHEN** Autopilot evaluates readiness for advancement or archive handoff
- **THEN** it reports the mismatch instead of treating the prose claim as authoritative

### Requirement: MR Wait Stops Without Auto-Merge

Autopilot SHALL expose MR wait evidence and SHALL NOT merge automatically.

#### Scenario: MR waits for user or provider decision

- **GIVEN** a task ledger is waiting for MR review or merge
- **WHEN** Autopilot inspects the task
- **THEN** the output includes MR status and URL when available
- **AND** Autopilot stops at `waiting_for_mr`
- **AND** it does not merge without explicit user approval
