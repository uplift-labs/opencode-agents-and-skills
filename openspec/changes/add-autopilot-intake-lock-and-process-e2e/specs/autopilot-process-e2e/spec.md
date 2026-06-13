# Autopilot Process E2E Spec

## ADDED Requirements

### Requirement: Scenario E2E Uses Real Autopilot Runtime With Mocked LLM

Autopilot SHALL provide deterministic scenario e2e tests that exercise the real process engine while replacing live LLM behavior with scripted worker output.

#### Scenario: Feature scenario runs without provider calls

- **GIVEN** a temp mini-project and a locked `feature` task ledger
- **AND** a scripted fake worker adapter returns deterministic phase reports
- **WHEN** the scenario runner repeatedly calls real `autopilot_run_next` and `autopilot_collect`
- **THEN** the task advances only through legal phases from `Ready` to `Done`
- **AND** no live LLM/provider call is made
- **AND** the test proves process sequencing and evidence gates, not LLM artifact quality

#### Scenario: Scenario runner uses protected-state-safe setup

- **GIVEN** a scenario e2e test needs ledgers, runtime state, reports, artifacts, and project files
- **WHEN** it creates test state
- **THEN** it writes only inside an OS temp project owned by the test process or through plugin-owned runtime helpers
- **AND** it does not teach agents or workers to manually edit protected Autopilot paths in the user repository

### Requirement: Mandatory Phase Evidence Is Enforced End To End

Autopilot SHALL reject scenario worker reports that omit required evidence for the selected phase.

#### Scenario: Analyze evidence is required

- **GIVEN** a locked non-minimal task is in `Ready`
- **WHEN** the worker report for `Ready -> Analyze` omits plan summary, slices, scope, or test strategy evidence required by the selected phase
- **THEN** Autopilot rejects the report before ledger mutation
- **AND** the task does not advance to `Analyze`

#### Scenario: Implementation evidence is required

- **GIVEN** a task is in `Implementation`
- **WHEN** the worker report for `Implementation -> Review` omits changed files or no-op reason, validation evidence, test decision, or secret-scan status
- **THEN** Autopilot rejects the report before ledger mutation
- **AND** the report id is not consumed

#### Scenario: Acceptance evidence is required

- **GIVEN** a file-changing task is in `Acceptance`
- **WHEN** the worker report for `Acceptance -> Done` lacks MR merged evidence
- **THEN** Autopilot stops at MR wait or rejects the report
- **AND** it does not auto-merge or mark the task `Done`

### Requirement: Artifacts And Changed Files Are Real And In Scope

Autopilot SHALL verify that worker-claimed artifacts and changed files are safe relative project paths before accepting them as transition evidence.

#### Scenario: Claimed changed file exists and is writable scope

- **GIVEN** a worker report lists `src/pricing.ts` as a changed file
- **AND** `src/pricing.ts` exists under the temp project root
- **AND** the task ledger `scope.write` permits that path
- **WHEN** Autopilot validates implementation evidence
- **THEN** the changed file may satisfy the artifact gate

#### Scenario: Claimed artifact is missing or forbidden

- **GIVEN** a worker report lists a missing artifact, an absolute path, a traversal path, a forbidden path, `.autopilot/**`, or `openspec/changes/*/automation/**`
- **WHEN** Autopilot validates the report
- **THEN** Autopilot rejects the report before ledger mutation
- **AND** the output includes safe diagnostic evidence without exposing secrets

### Requirement: Bugfix Scenario Enforces Regression Evidence

Autopilot SHALL preserve type-specific bugfix gates in scenario e2e flows.

#### Scenario: Bugfix cannot advance without regression evidence

- **GIVEN** a locked `bugfix` task is in `Analyze`
- **WHEN** a worker report attempts `Analyze -> Implementation` without reproduction, characterization, regression test, or accepted infeasible evidence
- **THEN** Autopilot rejects the transition
- **AND** the ledger remains unchanged

#### Scenario: Bugfix cannot become typo to bypass gates

- **GIVEN** a locked `bugfix` task has required regression evidence gates
- **WHEN** a worker report claims the work is actually a `typo` and requests minimal analyze behavior
- **THEN** Autopilot rejects the report as a locked intake conflict
- **AND** bugfix gates remain active

### Requirement: Collect Is Idempotent In Scenario E2E

Autopilot SHALL apply a worker report at most once in scenario e2e flows.

#### Scenario: Repeated collect does not duplicate transition

- **GIVEN** a worker report has already advanced a task and its report id is consumed
- **WHEN** `autopilot_collect` is called again for the same task/report
- **THEN** Autopilot reports no new advancement
- **AND** it does not append a duplicate history entry
- **AND** it does not mutate the protected ledger bytes again

### Requirement: Process E2E Documents Its Boundary

Autopilot SHALL document that scenario e2e tests validate the process engine, not model output quality.

#### Scenario: Test output separates process guarantee from artifact quality

- **GIVEN** scenario e2e validation passes
- **WHEN** validation output or documentation describes the result
- **THEN** it states that phase order, required fields, artifacts, reviewer gates, and transition ownership were validated
- **AND** it does not claim the mocked LLM produced high-quality product decisions or user-ready prose
