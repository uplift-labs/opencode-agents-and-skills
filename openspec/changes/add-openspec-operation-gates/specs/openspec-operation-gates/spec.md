# OpenSpec Operation Gates Spec

## ADDED Requirements

### Requirement: OpenSpec Operations Have Deterministic Gates

OpenSpec lifecycle operations SHALL expose deterministic operation gates with stable JSON output.

#### Scenario: Operation gate runs

- **GIVEN** an operation name and optional change id
- **WHEN** `openspec:gate` evaluates the operation
- **THEN** it returns a stable JSON envelope with `schemaVersion`, `operation`, `status`, `checks[]`, and `nextActions[]`
- **AND** checks are sorted deterministically
- **AND** unsupported evidence is reported as `unknown`, `blocked`, or `not-applicable` instead of guessed

#### Scenario: Gate report is persisted

- **GIVEN** the caller passes an explicit persist option
- **WHEN** the operation gate completes for a change-scoped operation
- **THEN** it writes `openspec/changes/<change>/automation/operation-gates/<operation>.json`
- **AND** it does not write Markdown wrapper reports

### Requirement: Proposal And Apply Gates Protect Scope Quality

OpenSpec proposal and apply operations SHALL be checked before implementation starts.

#### Scenario: Proposal gate evaluates new change

- **GIVEN** a new OpenSpec change exists
- **WHEN** the propose gate runs
- **THEN** it validates safe change id, required OpenSpec documents, spec deltas when behavior changes, test-first tasks, and JSON retrospective archive tail

#### Scenario: Apply gate evaluates implementation readiness

- **GIVEN** an OpenSpec change is selected for implementation
- **WHEN** the apply gate runs
- **THEN** it verifies scope, blockers, requirements, test strategy, and routing to Autopilot when a task ledger owns the flow

### Requirement: Task And Ledger Gates Prevent Stale Or Unsafe Work

Task updates and ledger materialization SHALL be checked before they change actionability.

#### Scenario: Task checkbox is marked complete

- **GIVEN** a `tasks.md` checkbox changes from unchecked to checked
- **WHEN** the task-update gate evaluates the change
- **THEN** completion evidence is required
- **AND** validation tasks require command/result evidence

#### Scenario: Active change becomes fully checked

- **GIVEN** all tasks in an active change are checked
- **WHEN** task-update or prepush gate runs
- **THEN** the gate reports archive/retro readiness requirements
- **AND** stale non-terminal ledgers for that completed change are blocked or warned according to policy

#### Scenario: Ledger is materialized

- **GIVEN** Autopilot materializes `automation/task.json`
- **WHEN** the ledger-materialize gate runs
- **THEN** the active change has unchecked work, safe scopes, forbidden protected paths, validation commands, and a valid ledger schema

### Requirement: Worker Dispatch And Collect Gates Require Plugin-Owned Evidence

Worker dispatch and report collection SHALL require plugin-owned runtime evidence and legal transition checks.

#### Scenario: Worker dispatch is requested

- **GIVEN** a Ready or phase-eligible ledger task is selected
- **WHEN** the worker-dispatch gate runs
- **THEN** worker dispatch is explicitly enabled, session capability exists, runtime store is valid, dependencies are satisfied, blockers and MR waits are absent, scope is safe, and stale-ledger checks pass

#### Scenario: Worker report is collected

- **GIVEN** a worker report marker or idle event is observed
- **WHEN** the collect gate runs
- **THEN** session, report id, run id, task id, ledger path, ledger revision, status, and legal transition evidence match plugin-owned runtime state
- **AND** duplicates are idempotent or rejected without protected ledger mutation

### Requirement: Review And Acceptance Gates Require Evidence Before Terminal Readiness

Review and acceptance operations SHALL require validation, reviewer, MR, and fan-in evidence where applicable.

#### Scenario: Review gate runs

- **GIVEN** an implementation slice is ready for review
- **WHEN** the review gate runs
- **THEN** required reviewer outputs, test coverage evidence, code-quality evidence, docs/spec sync, and deployment/config review evidence are present or explicitly skipped with reason

#### Scenario: Acceptance gate runs

- **GIVEN** a change or ledger task is approaching terminal readiness
- **WHEN** the acceptance gate runs
- **THEN** MR policy, fan-in validation, unresolved feedback, docs/spec sync, and final validation evidence are checked before `Done` or archive-ready handoff

### Requirement: Archive And Post-Archive Gates Close The Lifecycle

Archive and post-archive operations SHALL validate retrospectives, follow-ups, freshness, and cleanup state.

#### Scenario: Archive gate runs

- **GIVEN** archive is requested for an OpenSpec change
- **WHEN** the archive gate runs
- **THEN** tasks are complete or routed, `automation/retro.json` passes, follow-up changes exist, freshness gates pass, OpenSpec validation passes, and no active runtime or stale ledger references remain

#### Scenario: Post-archive gate runs

- **GIVEN** a change was archived
- **WHEN** the post-archive gate runs
- **THEN** active directories no longer contain the change, active ledgers/runs no longer reference it, follow-up changes are still valid, docs are synchronized when public behavior changed, and OpenSpec validation still passes

### Requirement: Prepush Gate Composes OpenSpec Operation Checks

Pre-push validation SHALL include OpenSpec operation gates for changed OpenSpec and Autopilot artifacts.

#### Scenario: OpenSpec files changed

- **GIVEN** changed files include active OpenSpec documents or automation JSON
- **WHEN** pre-push validation runs
- **THEN** it runs scoped OpenSpec operation checks appropriate to the changed files
- **AND** stale completed changes, invalid ledgers, missing JSON retros, and archive/post-archive inconsistencies block or warn according to the configured gate level

### Requirement: Programmatic Triggers Use Operation Gates Safely

Autopilot programmatic triggers SHALL use operation gates as read-only checkpoints unless controlled runtime evidence allows stronger action.

#### Scenario: Passive file event changes OpenSpec state

- **GIVEN** a passive file event updates `tasks.md`, spec deltas, `automation/task.json`, `automation/retro.json`, or operation-gate JSON
- **WHEN** observe-mode triggers evaluate the event
- **THEN** Autopilot may schedule a cheap read-only operation gate or status check
- **AND** it does not call claim-capable `autopilot_run_next` from the passive event
