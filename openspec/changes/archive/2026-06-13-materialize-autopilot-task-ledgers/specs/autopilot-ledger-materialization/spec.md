# Autopilot Ledger Materialization Spec

## ADDED Requirements

### Requirement: Explicit Autopilot Starts Materialize Selected Changes

Autopilot SHALL create a plugin-owned task ledger for the selected active OpenSpec change whenever an explicit materialization-capable Autopilot run starts work and no applicable ledger exists.

#### Scenario: Plain Autopilot creates ledger for selected active change

- **GIVEN** unfinished active OpenSpec changes exist in `openspec/changes/**`
- **AND** the deterministic selected primary change has no applicable `automation/task.json`
- **WHEN** the user invokes plain `/autopilot`
- **THEN** Autopilot creates `openspec/changes/<selected-change>/automation/task.json`
- **AND** the created ledger validates against the Autopilot task ledger schema
- **AND** the output identifies the selected change and any non-selected candidates
- **AND** no implementation worker is claimed solely because the ledger was created

#### Scenario: Prompt-driven Autopilot creates ledger after change resolution

- **GIVEN** the user invokes `/autopilot` with task prompt text
- **AND** prompt intake resolves or creates an accepted OpenSpec change for that prompt
- **AND** the resolved change has no applicable `automation/task.json`
- **WHEN** Autopilot starts work on the resolved change
- **THEN** Autopilot creates `openspec/changes/<resolved-change>/automation/task.json`
- **AND** it does not continue an unrelated active queue instead of the prompt-resolved change

#### Scenario: Internally resolved active change creates ledger

- **GIVEN** `openspec/changes/<change-id>/tasks.md` exists outside `openspec/changes/archive/**`
- **AND** the change has at least one unchecked checklist item
- **AND** no applicable `openspec/changes/<change-id>/automation/task.json` exists
- **WHEN** the Autopilot controller starts work with internally resolved `changeId` `<change-id>` under materialization-capable policy
- **THEN** Autopilot creates `openspec/changes/<change-id>/automation/task.json`
- **AND** the created ledger validates against the Autopilot task ledger schema
- **AND** the output includes machine-readable materialization evidence
- **AND** no implementation worker is claimed solely because the ledger was created

#### Scenario: Existing ledger is authoritative

- **GIVEN** an active change already has `openspec/changes/<change-id>/automation/task.json`
- **WHEN** a materialization-capable run is called for `<change-id>`
- **THEN** Autopilot does not overwrite, regenerate, migrate, or delete the ledger
- **AND** Autopilot evaluates the existing ledger-backed state

#### Scenario: Unsupported resolved change does not create ledger

- **GIVEN** the resolved change is missing, archived, complete, unreadable, outside the OpenSpec changes root, or otherwise unsupported
- **WHEN** a materialization-capable run evaluates the resolved change
- **THEN** Autopilot does not create `automation/task.json`
- **AND** the output reports a blocked, failed, or no-actionable result with evidence for the cause

### Requirement: Materialization Is Explicit And Read-Only Paths Stay Read-Only

Autopilot SHALL NOT create protected ledgers from passive or read-only control paths.

#### Scenario: Status is read-only

- **GIVEN** an active change has unfinished `tasks.md` items and no ledger
- **WHEN** `autopilot_status` is called
- **THEN** Autopilot may report active-change or materialization-available evidence
- **AND** it does not create `openspec/changes/<change-id>/automation/task.json`

#### Scenario: Passive triggers are read-only

- **GIVEN** a file watcher, observe hook, session idle event, or cheap validation check sees an active change without a ledger
- **WHEN** the trigger runs
- **THEN** it may schedule read-only status or validation according to trigger policy
- **AND** it does not call a materialization-capable write path
- **AND** it does not create or mutate `.autopilot/**` or `openspec/changes/*/automation/**`

#### Scenario: Free-form prompt does not create protected ledger directly

- **GIVEN** a user invokes Autopilot with free-form task text that is not an accepted OpenSpec change id or task id
- **WHEN** prompt intake routes the request
- **THEN** Autopilot does not create `automation/task.json` from the raw prompt
- **AND** the prompt must first route to exploration, proposal, or an existing accepted scope before materialization is allowed
- **AND** once an accepted change is selected for work, materialization is required before Autopilot-controlled work starts

### Requirement: Generated Ledgers Are Valid Before Publication

Autopilot SHALL validate generated task ledgers before publishing them to protected ledger paths.

#### Scenario: Candidate ledger validates before final write

- **GIVEN** the materializer derives a candidate ledger for an active change
- **WHEN** the candidate is ready to publish
- **THEN** it validates the candidate with the Autopilot ledger validator
- **AND** it validates the serialized file before or immediately after final publication
- **AND** the final `task.json` is valid when read back from disk

#### Scenario: Invalid candidate is not published

- **GIVEN** the materializer cannot produce a valid candidate ledger
- **WHEN** validation fails
- **THEN** no final `openspec/changes/<change-id>/automation/task.json` is published
- **AND** the output includes validation errors or blocker evidence
- **AND** only materializer-owned temporary files may be cleaned up

### Requirement: Materialization Output Is Machine-Readable

Autopilot SHALL report ledger creation as a distinct state change with enough evidence for agents, checks, and users to continue safely.

#### Scenario: Successful creation reports evidence

- **GIVEN** Autopilot successfully creates a ledger for `<change-id>`
- **WHEN** the tool output is returned
- **THEN** `outcome` indicates plugin-owned state advanced
- **AND** the reason code or equivalent field distinguishes ledger materialization from no-progress handoff and worker-report collection
- **AND** `tasksAdvanced` or equivalent evidence includes the created ledger path, task id, change id, action, and validation status
- **AND** `taskSummaries` reports the created task as ledger-backed
- **AND** `nextActions` tells the caller how to continue through ledger-backed Autopilot flow

#### Scenario: Follow-up run uses ledger-backed behavior

- **GIVEN** a materialization run created `automation/task.json`
- **WHEN** `autopilot_run_next` or `autopilot_status` is called again for the same change
- **THEN** Autopilot discovers the ledger-backed task
- **AND** it does not return `active_change_handoff` for that scoped change unless the ledger is removed or invalid in a way that changes discovery evidence

### Requirement: Unscoped Materialization Uses Deterministic Selection

Autopilot SHALL use deterministic selection evidence for plain `/autopilot` materialization so users do not need to supply `<change-id>`.

#### Scenario: Multiple active changes materialize selected primary

- **GIVEN** multiple unfinished active OpenSpec changes have no ledgers
- **WHEN** unscoped `autopilot_run_next` evaluates the queue
- **THEN** Autopilot creates `automation/task.json` for the deterministic selected primary change
- **AND** it returns deterministic candidates and non-selection evidence for the other active changes
- **AND** it does not start parallel workstreams solely because multiple active changes exist

#### Scenario: Single active change follows documented policy

- **GIVEN** exactly one unfinished active OpenSpec change has no ledger
- **WHEN** unscoped `autopilot_run_next` evaluates the queue
- **THEN** Autopilot materializes that single change
- **AND** tests lock the chosen policy so future behavior cannot drift silently
