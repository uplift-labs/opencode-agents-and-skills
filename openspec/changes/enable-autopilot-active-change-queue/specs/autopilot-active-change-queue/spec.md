# Autopilot Active Change Queue Spec

## ADDED Requirements

### Requirement: Active OpenSpec Changes Are Discoverable Without Ledgers

Autopilot SHALL discover unfinished active OpenSpec changes when no applicable plugin-owned task ledger exists.

#### Scenario: Active changes exist but ledgers do not

- **GIVEN** `openspec/changes/<change>/tasks.md` exists outside `openspec/changes/archive/**`
- **AND** at least one active change contains unchecked checklist items
- **AND** no applicable `automation/task.json` or prototype task ledger exists
- **WHEN** `autopilot_run_next` is called without an explicit scope
- **THEN** the output does not use `no_ledgers` as the stop reason
- **AND** it reports a distinct active-change handoff reason code
- **AND** it includes task/actionability summaries for unfinished active changes
- **AND** it includes deterministic selection evidence for one selected primary change

#### Scenario: No active work exists

- **GIVEN** no applicable Autopilot ledgers exist
- **AND** no active OpenSpec change has unchecked checklist items
- **WHEN** `autopilot_run_next` is called
- **THEN** the output may use `no_ledgers` or `no_actionable_tasks` according to the final contract
- **AND** the summary states that no unfinished active OpenSpec change was found

### Requirement: Ledger-Backed State Remains Authoritative

Autopilot SHALL prefer plugin-owned task ledgers over active-change fallback when both exist for the same scope.

#### Scenario: Scoped change has a ledger and tasks file

- **GIVEN** an active change has both `automation/task.json` and `tasks.md`
- **WHEN** `autopilot_run_next` is called with that `changeId`
- **THEN** Autopilot evaluates the ledger-backed task state
- **AND** invalid ledgers, blockers, MR waits, terminal states, runtime-deferred states, and dependency gates are preserved
- **AND** active-change fallback does not hide or override ledger evidence

#### Scenario: Other changes have ledgers but scoped change does not

- **GIVEN** at least one active change has a ledger
- **AND** the caller scopes `autopilot_run_next` to an unfinished active change with no ledger
- **WHEN** Autopilot evaluates the scope
- **THEN** it may use active-change fallback for the scoped change
- **AND** it does not silently select an unrelated ledger-backed task outside the scope

### Requirement: Active-Change Selection Is Deterministic And Scoped

Autopilot SHALL select active-change fallback candidates using deterministic repository evidence and explicit scope when provided.

#### Scenario: Explicit change scope selects unfinished change

- **GIVEN** an active change `C` has unchecked `tasks.md` items and no applicable ledger
- **WHEN** `autopilot_run_next` is called with `changeId` `C`
- **THEN** the selected task or change id is `C`
- **AND** `selection.candidates` explains the scoped selection
- **AND** next actions instruct the agent to apply change `C`

#### Scenario: Explicit change scope is unavailable

- **GIVEN** the caller scopes Autopilot to change `C`
- **AND** `C` is missing, archived, complete, unreadable, or otherwise unsupported for fallback
- **WHEN** `autopilot_run_next` evaluates the scope
- **THEN** it reports a clear no-actionable or blocked result for `C`
- **AND** it does not choose a different unscoped change without user intent

#### Scenario: Multiple unfinished changes exist

- **GIVEN** multiple active changes have unchecked `tasks.md` items and no applicable ledgers
- **WHEN** unscoped `autopilot_run_next` evaluates the queue
- **THEN** it selects exactly one primary change by deterministic ranking
- **AND** it reports the non-selected changes with stable rank or non-selection evidence
- **AND** it does not start parallel workstreams through active-change fallback

### Requirement: Active-Change Handoff Continues Through OpenSpec Apply

Autopilot SHALL provide enough structured next-action evidence for the agent to continue selected active changes through the normal OpenSpec apply workflow.

#### Scenario: Handoff output is actionable but not advanced

- **GIVEN** Autopilot selected an unfinished active change without a ledger
- **WHEN** the output is returned
- **THEN** `tasksStarted` and `tasksAdvanced` are empty
- **AND** no protected Autopilot state is mutated
- **AND** `nextActions[0]` instructs the agent to apply the selected OpenSpec change
- **AND** the agent is expected to continue via `openspec-apply-change` rather than repeat the same no-progress tool call

#### Scenario: Status explains active-change queue state

- **GIVEN** unfinished active changes exist without ledgers
- **WHEN** `autopilot_status` is called
- **THEN** the status output includes active-change summaries or equivalent queue evidence
- **AND** it explains whether a selected change is available, complete, blocked, unsupported, or absent

### Requirement: Active-Change Discovery Is Read-Only And Safe

Autopilot SHALL NOT create or mutate protected task ledgers while discovering active OpenSpec changes.

#### Scenario: Fallback scans active changes

- **GIVEN** Autopilot scans `openspec/changes/**` for active-change fallback candidates
- **WHEN** discovery completes
- **THEN** it has not written `.autopilot/**`
- **AND** it has not written `openspec/changes/*/automation/**`
- **AND** it has not read secrets or invoked remote-state commands
- **AND** unsupported evidence is reported as unknown, blocked, or no-actionable instead of being guessed
