# Autopilot Regression Spec

## ADDED Requirements

### Requirement: Fresh Session Autopilot Smoke

A fresh OpenCode session SHALL start with a first user turn containing exactly `/autopilot` and SHALL either call `autopilot_run_next` or report a concrete blocker explaining why the tool is unavailable.

#### Scenario: Autopilot command starts the control plane

- **GIVEN** OpenCode has been restarted in this repository with project plugins enabled
- **WHEN** the user submits `/autopilot`
- **THEN** the model loads/uses `openspec-autopilot`
- **AND** the model calls `autopilot_run_next` unless plugin/tool availability is blocked
- **AND** the session records the exact output or blocker evidence

### Requirement: Tiered Scenario Completion

The regression SHALL classify scenarios as P0, P1, or P2 and SHALL complete, block, or explicitly skip each scenario with evidence.

#### Scenario: Protected-path harness gap blocks safely

- **GIVEN** a scenario requires creating or mutating `.autopilot/**` or `openspec/changes/*/automation/**`
- **WHEN** the plugin does not provide a supported owner path for that setup
- **THEN** the scenario is recorded as blocked
- **AND** a follow-up OpenSpec change is created or updated instead of bypassing protected-path policy

### Requirement: Task-Type Regression Coverage

The regression SHALL evaluate Autopilot usability and gate clarity for bugfix, research, small feature, large epic, codebase exploration, docs/typo, tooling/config, performance/protocol-style, blocker, stop, and MR-wait scenarios.

#### Scenario: Task type gates are assessed from evidence

- **GIVEN** the regression session covers each scenario family in `tasks.md`
- **WHEN** a scenario is executed or skipped
- **THEN** the session records the evidence, observed Autopilot behavior, convenience assessment, and any blocker or skip reason

### Requirement: Findings Become OpenSpec Changes

Every confirmed Autopilot defect, unsafe behavior, confusing workflow, or missing validation path SHALL be fixed in scope or tracked as one or more OpenSpec follow-up changes.

#### Scenario: Regression finding is tracked durably

- **GIVEN** the regression confirms a defect or material usability issue
- **WHEN** the issue is not fixed immediately in the approved scope
- **THEN** the session creates or updates a grouped OpenSpec change with evidence, impact, tasks, and validation expectations

### Requirement: No Unsafe Remote Or Secret Actions

The regression SHALL NOT merge, push protected branches, force-push non-owned branches, deploy, read/edit secrets, or destructively clean outside plugin-owned worktrees without explicit user approval.

#### Scenario: MR or secret gate blocks safely

- **GIVEN** a scenario reaches MR, credential, secret, or protected-branch behavior
- **WHEN** the required approval or credential is unavailable
- **THEN** the regression records a blocker and stops that scenario without bypassing policy

### Requirement: Durable Regression Report

The regression SHALL write a durable report to `openspec/changes/autopilot-live-regression/live-regression-report.md`.

#### Scenario: Regression evidence is stored in the change

- **GIVEN** a live regression session has executed or blocked scenarios
- **WHEN** the session reaches final handoff
- **THEN** `live-regression-report.md` contains the scenario matrix, evidence, findings, follow-up changes, validation results, reviewer gates, residual risks, and ready-to-land status
