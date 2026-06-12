# Autopilot Ledger Validation Spec

## ADDED Requirements

### Requirement: Bugfix Reproduction Gate

Bugfix ledgers SHALL record reproduction, characterization, or an explicit infeasible reason before implementation.

#### Scenario: Bugfix enters implementation

- **GIVEN** a task ledger has `taskType` `bugfix`
- **WHEN** the ledger transitions from `Analyze` to `Implementation`
- **THEN** validation requires structured reproduction, characterization, or skipped-infeasible evidence

### Requirement: Tooling And Config Deterministic Gate

Tooling and config ledgers SHALL record deterministic fixture, schema, validator, generated-config, or equivalent validation evidence before review.

#### Scenario: Config implementation enters review

- **GIVEN** a task ledger has `taskType` `config`
- **WHEN** the ledger transitions from `Implementation` to `Review`
- **THEN** validation requires deterministic config gate evidence in addition to generic validation status

#### Scenario: Tooling implementation enters review

- **GIVEN** a task ledger has `taskType` `tooling`
- **WHEN** the ledger transitions from `Implementation` to `Review`
- **THEN** validation requires deterministic tooling gate evidence in addition to generic validation status

### Requirement: Performance Evidence Gate

Performance ledgers SHALL record benchmark, profile, load-test, or explicit infeasible evidence before review.

#### Scenario: Performance implementation enters review

- **GIVEN** a task ledger has `taskType` `performance`
- **WHEN** the ledger transitions from `Implementation` to `Review`
- **THEN** validation requires benchmark/profile evidence or an explicit skipped-infeasible reason

### Requirement: Protocol Evidence Gate

Protocol ledgers SHALL record golden-vector, negative-case, compatibility, or explicit infeasible evidence before review.

#### Scenario: Protocol implementation enters review

- **GIVEN** a task ledger has `taskType` `protocol`
- **WHEN** the ledger transitions from `Implementation` to `Review`
- **THEN** validation requires protocol-specific evidence in addition to generic validation status
