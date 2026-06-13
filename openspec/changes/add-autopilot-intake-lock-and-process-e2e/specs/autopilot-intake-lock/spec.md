# Autopilot Intake Lock Spec

## ADDED Requirements

### Requirement: Initial Classification Is Locked Before Claim-Capable Execution

Autopilot SHALL record the initial task classification as a locked ledger contract before any claim-capable task execution can proceed.

#### Scenario: Free-form task becomes locked intake contract

- **GIVEN** a free-form task prompt is classified as a supported Autopilot task
- **WHEN** Autopilot materializes or otherwise creates a claim-capable task ledger
- **THEN** the ledger records an `intake` contract with task type, task caliber, risk class, required gates, required artifacts, phase profile, review policy, and classification evidence
- **AND** `intake.locked` is `true`
- **AND** later worker sessions receive the locked contract as execution context, not as optional guidance

#### Scenario: Existing ledger without intake cannot silently become claim-capable

- **GIVEN** an existing task ledger has no locked intake contract
- **WHEN** Autopilot evaluates the ledger for claim-capable worker dispatch or protected ledger advancement
- **THEN** Autopilot either applies a deterministic compatibility path with explicit diagnostics or blocks for intake materialization
- **AND** it does not infer a weaker task type or gate set from worker prose

### Requirement: Worker Reports Cannot Weaken Locked Intake

Autopilot SHALL reject worker reports that attempt to weaken a locked task contract.

#### Scenario: Worker attempts to downgrade task type

- **GIVEN** a task ledger has locked `taskType` `feature`
- **AND** a plugin-owned worker report claims the work should be treated as `typo`, `docs`, `research`, or another simpler type
- **WHEN** `autopilot_collect` validates the report
- **THEN** Autopilot rejects the report as a runtime evidence conflict or reclassification blocker
- **AND** no protected ledger state is mutated
- **AND** the worker report id is not consumed

#### Scenario: Worker attempts to remove required gates

- **GIVEN** a locked intake contract requires analyze, implementation, review, and acceptance gates
- **AND** a worker report claims review, validation, MR evidence, or acceptance can be skipped without an approved policy reason
- **WHEN** Autopilot validates the report
- **THEN** the report is rejected before ledger mutation
- **AND** the output identifies the missing or weakened gate without accepting the worker's simplified process

#### Scenario: Worker attempts to weaken review policy

- **GIVEN** a locked task ledger requires a reviewer such as `code-quality-reviewer` or `test-coverage-reviewer`
- **AND** a worker report removes that reviewer, marks it skipped without a reason, or treats a failed/needs-work decision as passed
- **WHEN** Autopilot validates the report
- **THEN** the task does not advance to `Acceptance`
- **AND** the ledger keeps the required reviewer policy intact

### Requirement: Reclassification Fails Closed

Autopilot SHALL handle discovered classification mismatch through an explicit blocker or approved reclassification path, not worker-owned mutation.

#### Scenario: Evidence shows task is larger than intake classification

- **GIVEN** a locked task was classified as a small task
- **AND** implementation evidence shows the task requires broader scope, stronger gates, or different reviewers
- **WHEN** Autopilot validates the worker report
- **THEN** Autopilot blocks for reclassification or returns a runtime evidence conflict
- **AND** it does not continue under the weaker locked process

#### Scenario: Downgrade requires explicit approval

- **GIVEN** a locked task was classified with stronger gates than later evidence appears to need
- **WHEN** a worker proposes a downgrade
- **THEN** Autopilot does not apply the downgrade during collect
- **AND** downgrade can happen only through an explicit approved reclassification flow with audit evidence

### Requirement: Reviewer Outcomes Control Review Progression

Autopilot SHALL treat reviewer decisions as process gates after implementation.

#### Scenario: Reviewer needs work

- **GIVEN** a task is in `Review`
- **AND** a reviewer decision is `needs-work`, `failed`, or equivalent blocking output
- **WHEN** Autopilot evaluates progression
- **THEN** the task returns to `Implementation` or becomes blocked with reviewer evidence
- **AND** it does not advance to `Acceptance`

#### Scenario: Required reviewers pass

- **GIVEN** a task is in `Review`
- **AND** every required reviewer has `passed` or `approved` evidence, or an explicit allowed skip reason
- **WHEN** Autopilot validates `Review -> Acceptance`
- **THEN** the transition may proceed if all other locked gates remain satisfied
