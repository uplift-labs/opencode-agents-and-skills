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
- **THEN** it verifies scope, blockers, requirements, test strategy, and task evidence

### Requirement: Task Gates Prevent Stale Or Unsafe Work

Task updates SHALL be checked before they change actionability.

#### Scenario: Task checkbox is marked complete

- **GIVEN** a `tasks.md` checkbox changes from unchecked to checked
- **WHEN** the task-update gate evaluates the change
- **THEN** completion evidence is required
- **AND** validation tasks require command/result evidence

#### Scenario: Active change becomes fully checked

- **GIVEN** all tasks in an active change are checked
- **WHEN** task-update or prepush gate runs
- **THEN** the gate reports archive/retro readiness requirements

### Requirement: Review And Acceptance Gates Require Evidence Before Terminal Readiness

Review and acceptance operations SHALL require validation, reviewer, MR, and fan-in evidence where applicable.

#### Scenario: Review gate runs

- **GIVEN** an implementation slice is ready for review
- **WHEN** the review gate runs
- **THEN** required reviewer outputs, test coverage evidence, code-quality evidence, docs/spec sync, and deployment/config review evidence are present or explicitly skipped with reason

#### Scenario: Acceptance gate runs

- **GIVEN** a change is approaching terminal readiness
- **WHEN** the acceptance gate runs
- **THEN** MR policy, fan-in validation, unresolved feedback, docs/spec sync, and final validation evidence are checked before `Done` or archive-ready handoff

### Requirement: Archive And Post-Archive Gates Close The Lifecycle

Archive and post-archive operations SHALL validate retrospectives, follow-ups, freshness, and cleanup state.

#### Scenario: Archive gate runs

- **GIVEN** archive is requested for an OpenSpec change
- **WHEN** the archive gate runs
- **THEN** tasks are complete or routed, `automation/retro.json` passes, follow-up changes exist, freshness gates pass, and OpenSpec validation passes

#### Scenario: Post-archive gate runs

- **GIVEN** a change was archived
- **WHEN** the post-archive gate runs
- **THEN** active directories no longer contain the change, follow-up changes are still valid, docs are synchronized when public behavior changed, and OpenSpec validation still passes

### Requirement: Prepush Gate Composes OpenSpec Operation Checks

Pre-push validation SHALL include OpenSpec operation gates for changed OpenSpec artifacts.

#### Scenario: OpenSpec files changed

- **GIVEN** changed files include active OpenSpec documents or automation JSON
- **WHEN** pre-push validation runs
- **THEN** it runs scoped OpenSpec operation checks appropriate to the changed files
- **AND** stale completed changes, missing JSON retros, and archive/post-archive inconsistencies block or warn according to the configured gate level

### Requirement: Programmatic Triggers Use Operation Gates Safely

Programmatic triggers SHALL use operation gates as read-only checkpoints unless explicit local evidence allows stronger action.

#### Scenario: Passive file event changes OpenSpec state

- **GIVEN** a passive file event updates `tasks.md`, spec deltas, `automation/retro.json`, or operation-gate JSON
- **WHEN** observe-mode triggers evaluate the event
- **THEN** the workflow may schedule a cheap read-only operation gate or status check
- **AND** it does not claim work from the passive event
