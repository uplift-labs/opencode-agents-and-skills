# Autopilot Control Output Spec

## ADDED Requirements

### Requirement: Reason-Coded Outcomes

Autopilot tool outputs SHALL include stable reason codes for no-progress, blocker, MR wait, failed, and advanced states.

#### Scenario: Ready ledger cannot advance

- **GIVEN** a valid Ready task ledger exists
- **WHEN** `autopilot_run_next` cannot claim, dispatch, or advance it
- **THEN** the output includes a reason code such as `ready_runtime_deferred`
- **AND** the summary explains that valid work exists but runtime advancement is unavailable

### Requirement: Per-Task Actionability

Autopilot outputs SHALL summarize discovered tasks by actionability.

#### Scenario: Mixed ledger states are inspected

- **GIVEN** valid, invalid, MR-waiting, and terminal ledgers exist
- **WHEN** Autopilot returns status or run output
- **THEN** each task summary records task id, status, task type, validity, and actionability
- **AND** the agent can explain why each task can or cannot advance without re-reading every ledger

### Requirement: Actionable Next Actions

Autopilot outputs SHALL provide self-contained next actions when a safe continuation exists.

#### Scenario: No-progress output would otherwise loop

- **GIVEN** a previous call already proved that runtime advancement is deferred
- **WHEN** Autopilot returns the next action list
- **THEN** it does not recommend the same no-progress call as the only next step
- **AND** it recommends a safe alternative such as status inspection, evidence-pack generation, follow-up tracking, waiting, or stopping

### Requirement: Compact Default Output

Autopilot outputs SHALL remain compact by default while preserving enough structured data for correct agent decisions.

#### Scenario: Compact status output

- **GIVEN** an agent requests Autopilot status
- **WHEN** the default output is returned
- **THEN** it includes reason code, task counts, task actionability summaries, blockers, MR waits, and next actions
- **AND** it does not emit full raw ledger contents unless a verbose mode is requested
