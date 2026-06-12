# Autopilot Runtime Spec

## ADDED Requirements

### Requirement: Auto Parallel Implementation Policy

Autopilot SHALL support an explicit auto parallel implementation policy that resolves the implementation WIP limit from deterministic ledger and runtime evidence.

#### Scenario: Auto mode resolves to serial for risky queues

- **GIVEN** auto parallel implementation mode is enabled
- **AND** the Ready queue includes central-file writes, unknown write scopes, unsupported glob overlap, dependency gaps, missing locks, invalid worktrees, blockers, MR waits, or runtime evidence conflicts
- **WHEN** `autopilot_run_next` evaluates the queue
- **THEN** Autopilot resolves `selection.maxImplementationClaims` to `1` or starts no tasks according to the blocker state
- **AND** it records machine-readable auto decision evidence explaining the serial or no-start decision
- **AND** no candidate is marked `parallel_started` without matching `tasksStarted` evidence

#### Scenario: Auto mode starts standard disjoint implementation work

- **GIVEN** auto parallel implementation mode is enabled
- **AND** at least two Ready implementation candidates have complete dependencies, comparable disjoint write scopes, no forbidden-scope conflict, valid plugin-owned locks, and owned `autopilot/...` worktrees
- **WHEN** `autopilot_run_next` evaluates the queue
- **THEN** Autopilot may resolve `selection.maxImplementationClaims` to `2`
- **AND** it starts no more than the resolved limit
- **AND** every started candidate has `parallelDecision` `parallel_started` and matching `tasksStarted` evidence

#### Scenario: Auto mode permits larger low-risk fan-out

- **GIVEN** auto parallel implementation mode is enabled
- **AND** the Ready queue contains only low-risk docs, typo, research, planning, test fixture, example, or documentation-only candidates
- **AND** all required locks, worktrees, dependency checks, and scope checks pass
- **WHEN** `autopilot_run_next` evaluates the queue
- **THEN** Autopilot may resolve `selection.maxImplementationClaims` above `2` but not above the configured auto cap
- **AND** fan-in validation is required before terminal readiness when more than one task starts

#### Scenario: Auto mode accepts only bounded small conflicts

- **GIVEN** auto parallel implementation mode is enabled with `conflictTolerance` `small`
- **AND** candidate primary write scopes are independent
- **AND** the only write/write overlap is inside configured soft conflict scopes
- **WHEN** `autopilot_run_next` evaluates the queue
- **THEN** Autopilot may start multiple candidates with a resolved WIP capped at `2`
- **AND** output records accepted soft conflict scopes
- **AND** fan-in validation is required
- **AND** source, runtime, schema, config, package, protected-path, secret-like, unsupported, or undeclared overlaps remain not parallel safe

#### Scenario: Auto mode remains explicit

- **GIVEN** multiple Ready ledgers exist
- **AND** no explicit auto or fixed parallel implementation policy is enabled
- **WHEN** `autopilot_run_next` evaluates the queue
- **THEN** Autopilot remains in default serial selection behavior
- **AND** it may report `parallel_ready` candidates as visibility evidence only
- **AND** it does not start additional implementation workstreams

### Requirement: Auto Parallel Fan-In Gate

Autopilot SHALL require fan-in validation before completing auto-parallel implementation work that started multiple tasks or accepted soft conflict risk.

#### Scenario: Auto-parallel work cannot complete without fan-in evidence

- **GIVEN** auto parallel implementation started more than one task or accepted a soft conflict scope
- **WHEN** Autopilot evaluates `Done` readiness
- **THEN** it requires integration validation evidence for the combined result
- **AND** it requires legal worker report collection and idempotent report consumption evidence
- **AND** it requires accepted soft conflicts to be resolved and recorded
- **AND** missing or failed fan-in evidence blocks terminal readiness instead of being treated as Done

#### Scenario: Archive and MR handoffs require fan-in evidence

- **GIVEN** auto parallel implementation started more than one task or accepted a soft conflict scope
- **WHEN** an agent or reviewer evaluates archive-ready or MR-ready handoff before first-class plugin handoff checks exist
- **THEN** the handoff requires the same fan-in evidence as `Done` readiness
- **AND** missing or failed fan-in evidence blocks the handoff instead of being treated as ready

### Requirement: Parallel Worktree Lifecycle

Autopilot SHALL require every parallel implementation stream to have its own owned git worktree and SHALL require cleanup after the corresponding change is archived.

#### Scenario: Parallel starts carry worktree evidence

- **GIVEN** fixed or auto parallel implementation starts more than one task
- **WHEN** `autopilot_run_next` emits `parallel_started` candidates
- **THEN** every started task has a unique owned `autopilot/...` worktree path
- **AND** `selection.candidates[]`, `tasksStarted[]`, and active runtime state preserve task-to-worktree evidence for fan-in, MR, archive, and cleanup gates
- **AND** missing, duplicate, absolute, traversal-based, or task-mismatched worktree paths block the candidate from starting

#### Scenario: Worktrees are cleaned up only after MR and archive gates

- **GIVEN** a parallel implementation stream has a plugin-owned worktree
- **WHEN** Autopilot evaluates post-archive cleanup
- **THEN** cleanup emits remove/prune actions only after MR merged evidence and archived-change evidence exist
- **AND** missing MR merged evidence or missing archive evidence blocks cleanup
- **AND** cleanup is limited to owned `autopilot/...` worktree paths
