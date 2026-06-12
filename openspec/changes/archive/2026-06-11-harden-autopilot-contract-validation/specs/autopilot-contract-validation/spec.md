# Autopilot Contract Validation Spec

## ADDED Requirements

### Requirement: Public Contract Values Stay Synchronized

Autopilot SHALL keep public task types, statuses, reason codes, actionability values, tool names, MR lifecycle statuses, MR wait statuses, and protected path patterns synchronized across validator, output helper, plugin, and instruction surfaces.

#### Scenario: Contract drift is introduced

- **GIVEN** a developer changes an Autopilot public enum, protected path pattern, or tool name in one source surface
- **WHEN** repository tests run
- **THEN** a deterministic contract test fails unless the corresponding validator/helper/plugin/instruction surface is updated or the drift is explicitly allowed by the test contract

### Requirement: Plugin Tools Have Executable Contract Tests

Every public `autopilot_*` tool SHALL be exercised through the plugin server/tool surface in tests.

#### Scenario: Plugin tool schema or output drifts from helpers

- **GIVEN** `.opencode/plugins/openspec-autopilot.ts` exposes an Autopilot tool
- **WHEN** plugin contract tests execute the tool with representative arguments
- **THEN** the output is parseable JSON with the expected compact Autopilot contract fields
- **AND** the test proves whether provided arguments are preserved in sanitized context or intentionally ignored for MVP no-op behavior

### Requirement: Autopilot Validation Commands Are First-Class Gates

Repository validation SHALL protect documented Autopilot and OpenSpec validation entrypoints from silent removal or drift.

#### Scenario: Documented validation script is removed

- **GIVEN** README or OpenSpec guidance documents an Autopilot or OpenSpec validation script
- **WHEN** `npm run validate` or the equivalent structural validator runs
- **THEN** the validator fails if the script is missing or points at an unsupported non-TypeScript entrypoint

#### Scenario: OpenSpec pre-push validation fails

- **GIVEN** the repository contains `openspec/`
- **WHEN** the pre-push validation plan executes against a failing or missing OpenSpec CLI in a deterministic test harness
- **THEN** failure is propagated with a clear gate label
- **AND** later gates do not hide the OpenSpec failure

### Requirement: Autopilot Evidence Reports Are Fresh Enough For Archive Or Release

Autopilot regression or evidence reports SHALL not be treated as ready-to-land/archive evidence when they visibly contradict current task status, ledger status, or public output contract shape.

#### Scenario: Report contains stale output shape

- **GIVEN** an Autopilot report includes a recorded tool output JSON block
- **WHEN** a freshness check compares it with the current output contract
- **THEN** missing required fields such as `reasonCode`, `taskSummaries`, `nextActions`, or `loopGuard` are reported as freshness errors or warnings according to the check mode

#### Scenario: Report says ready while tasks remain unchecked

- **GIVEN** an Autopilot report says a change is ready-to-land or completed
- **WHEN** related `tasks.md` items remain unchecked or the plugin-owned task ledger remains `Ready`
- **THEN** the freshness check reports the mismatch unless the report records an explicit plugin-owned-state explanation

#### Scenario: Archive-strict freshness mode blocks stale evidence

- **GIVEN** an Autopilot report has stale output shape or contradicts task/ledger state
- **WHEN** the freshness check runs in `archive-strict` mode
- **THEN** stale evidence is reported as a blocking error
- **AND** archive or release evidence is not accepted until the mismatch is corrected or explicitly justified

### Requirement: Active Change State Matches Deterministic Evidence

Autopilot contract validation SHALL surface active OpenSpec changes whose task state, report claims, source/test evidence, or plugin-owned ledger state visibly contradict each other.

#### Scenario: Source tests prove work while tasks remain unchecked

- **GIVEN** deterministic source or test evidence proves a public Autopilot behavior is implemented
- **AND** the related OpenSpec `tasks.md` still marks the corresponding implementation or test task unchecked
- **WHEN** the consistency check runs before archive or release
- **THEN** it reports a freshness or consistency mismatch
- **AND** archive/release evidence is not accepted until the task state is reconciled or an explicit justification is recorded

#### Scenario: Unsupported consistency evidence is unknown

- **GIVEN** a change has prose claims but no stable fixture, test name, source reference, or plugin-owned ledger status
- **WHEN** the consistency check evaluates the change
- **THEN** it reports the state as `unknown` instead of guessing completion

### Requirement: Manual Autopilot Bundle Has A Load/Import Smoke Gate

The documented Autopilot plugin bundle SHALL have an automated or machine-checkable smoke gate before it is advertised as installable outside the repository.

#### Scenario: Manual plugin bundle is validated

- **GIVEN** README documents files needed for `/autopilot` usage outside the repository
- **WHEN** the bundle smoke gate runs
- **THEN** it verifies the skill, plugin, package dependency, command config, and helper import paths are present and executable in a temp or source-equivalent layout
- **AND** it does not require provider credentials or remote state
