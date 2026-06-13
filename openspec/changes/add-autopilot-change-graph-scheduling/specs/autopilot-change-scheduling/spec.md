# Autopilot Change Scheduling Spec

## ADDED Requirements

### Requirement: Materialized Ledgers Include Scheduling Evidence

Autopilot SHALL infer and write scheduling fields when creating `openspec/changes/<change>/automation/task.json` for an unfinished active OpenSpec change.

#### Scenario: Ledger is materialized with inferred scheduling

- **GIVEN** an unfinished active OpenSpec change has no applicable task ledger
- **WHEN** Autopilot materializes `automation/task.json` for that change
- **THEN** the ledger contains a top-level `priority`
- **AND** the ledger contains a top-level `dependencies` array
- **AND** the ledger contains optional machine-readable `schedule` evidence when inference evidence was available
- **AND** the ledger validates before publication

#### Scenario: No scheduling evidence exists

- **GIVEN** an unfinished active OpenSpec change has no explicit scheduling markers, no structural dependency evidence, and no high- or low-priority classification evidence
- **WHEN** Autopilot materializes the task ledger
- **THEN** the ledger uses `priority` `medium`
- **AND** the ledger uses an empty `dependencies` array
- **AND** the absence of stronger evidence does not block materialization

### Requirement: Priority Inference Is Deterministic

Autopilot SHALL derive change priority from deterministic repository evidence and stable fallback rules.

#### Scenario: Explicit priority marker is present

- **GIVEN** a supported OpenSpec change document contains `Priority: high`, `Priority: critical`, `Priority: medium`, or `Priority: low`
- **WHEN** scheduling inference evaluates the change
- **THEN** the inferred priority matches the marker
- **AND** `schedule.priority.reason` records the source document

#### Scenario: Control-plane change has no explicit marker

- **GIVEN** a change touches Autopilot runtime, ledger validation, materialization, scheduler, controller, output contract, protected path policy, or related tests
- **AND** no explicit priority marker is present
- **WHEN** scheduling inference evaluates the change
- **THEN** the inferred priority is at least `high`
- **AND** the reason references the deterministic control-plane evidence

#### Scenario: Low-risk change has no explicit marker

- **GIVEN** a change is docs, typo, research, planning, or evidence-only work with no implementation-bearing scope
- **AND** no explicit priority marker is present
- **WHEN** scheduling inference evaluates the change
- **THEN** the inferred priority may be `low`
- **AND** implementation-bearing changes without stronger evidence remain `medium`

### Requirement: Dependency Inference Is Conservative

Autopilot SHALL add only confirmed dependency evidence to the authoritative top-level `dependencies` array.

#### Scenario: Explicit depends-on marker is present

- **GIVEN** a supported OpenSpec change document contains `Depends-On: base-change`
- **AND** `base-change` resolves to an active or ledger-backed OpenSpec change whose task ledger id is known
- **WHEN** scheduling inference evaluates the change
- **THEN** top-level `dependencies` includes the resolved dependency task id
- **AND** `schedule.dependencies[]` records the marker source, source change id, resolved task id, and reason

#### Scenario: Reverse blocks marker is present

- **GIVEN** another active change contains `Blocks: dependent-change`
- **WHEN** scheduling inference evaluates `dependent-change`
- **THEN** top-level `dependencies` includes the blocking change's resolved task id
- **AND** `schedule.dependencies[]` records the reverse marker source, source change id, resolved task id, and reason

#### Scenario: Confirmed dependency target is unresolved

- **GIVEN** a ledger contains top-level dependency `missing-task`
- **AND** no active, ledger-backed, or otherwise completed dependency evidence resolves `missing-task`
- **WHEN** Autopilot evaluates the change graph
- **THEN** the dependent change is absent from `changeGraph.parallelReady`
- **AND** `changeGraph.dependencyBlocked[]` reports `missing-task` as an unresolved blocker
- **AND** Autopilot does not treat a missing dependency target as satisfied

#### Scenario: Evidence is ambiguous

- **GIVEN** two active changes touch the same capability or overlapping write scopes
- **AND** no explicit scheduling marker or valid existing schedule metadata proves ordering
- **WHEN** scheduling inference evaluates the queue
- **THEN** Autopilot does not add a top-level dependency from that evidence alone
- **AND** it records conflict or candidate-dependency evidence instead of guessing a blocker

### Requirement: Change Graph Output Shows Parallel-Ready Work

Autopilot SHALL expose a machine-readable change graph in status and run-next output.

#### Scenario: Independent changes are ready

- **GIVEN** multiple valid Ready ledger-backed changes have no incomplete dependencies between them
- **WHEN** `autopilot_status` or `autopilot_run_next` evaluates the queue
- **THEN** `changeGraph.parallelReady` lists the independent ready changes in deterministic priority order
- **AND** `changeGraph.levels[0]` includes the same ready dependency-free change ids
- **AND** existing runtime scope, lock, worktree, MR, and blocker checks still decide whether implementation can actually start in parallel

#### Scenario: Change is dependency-blocked

- **GIVEN** a Ready ledger lists dependency `base-change`
- **AND** `base-change` is not `Done`
- **WHEN** Autopilot evaluates the queue
- **THEN** the dependent change is absent from `changeGraph.parallelReady`
- **AND** `changeGraph.dependencyBlocked[]` records the dependent change and `base-change`
- **AND** selection evidence marks the candidate as dependency-blocked or otherwise not selectable

#### Scenario: Dependency cycle exists

- **GIVEN** active or ledger-backed changes form a dependency cycle
- **WHEN** Autopilot builds the change graph
- **THEN** `changeGraph.cycles[]` reports the cycle
- **AND** changes in the cycle are not reported as parallel-ready
- **AND** output includes blocker evidence sufficient to repair the cycle

### Requirement: Active Changes Have Scheduling Preview Before Ledger Creation

Autopilot SHALL use the same scheduling inference for unfinished active changes that do not yet have `automation/task.json`.

#### Scenario: Active changes have no ledgers

- **GIVEN** multiple unfinished active OpenSpec changes have no applicable ledgers
- **WHEN** Autopilot reports or materializes from the active-change queue
- **THEN** candidate ordering uses inferred priority and dependency evidence
- **AND** selected materialization remains deterministic
- **AND** no implementation worker is claimed solely because active-change preview found several parallel-ready changes

#### Scenario: Ledger exists for a change

- **GIVEN** an active change has a valid `automation/task.json`
- **WHEN** Autopilot evaluates scheduling for that change
- **THEN** ledger-backed priority and dependencies are authoritative
- **AND** active-change preview does not override the ledger

### Requirement: Scheduling Metadata Is Backward Compatible

Autopilot SHALL keep existing task ledgers valid when `schedule` metadata is absent.

#### Scenario: Legacy ledger has no schedule object

- **GIVEN** a valid task ledger contains top-level `priority` and `dependencies` but no `schedule`
- **WHEN** ledger validation runs
- **THEN** validation passes if all existing required fields are valid
- **AND** Autopilot can still include the ledger in change graph output

#### Scenario: Schedule metadata conflicts with authoritative fields

- **GIVEN** a ledger contains `schedule.dependencies[]` that disagrees with top-level `dependencies`
- **WHEN** ledger validation runs
- **THEN** validation reports an error
- **AND** runtime selection continues to use top-level `dependencies` as the blocker authority
