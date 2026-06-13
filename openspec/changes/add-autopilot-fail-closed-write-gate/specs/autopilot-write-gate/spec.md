# Autopilot Write Gate Spec

## ADDED Requirements

### Requirement: Active Autopilot Ownership Blocks Main-Session Mutations

When an explicit Autopilot run owns a task through a plugin-owned run lock or intent lock, Autopilot SHALL block repository mutations from non-worker sessions.

#### Scenario: Main session attempts direct edit during active run lock

- **GIVEN** durable Autopilot runtime state contains an active write lock for a task
- **AND** the current session is not the plugin-owned worker session for that lock
- **WHEN** the session invokes a mutating file tool such as patch, edit, write, rename, delete, insert, or replace
- **THEN** the plugin blocks the tool call before mutation
- **AND** the error identifies active Autopilot ownership and the safe continuation path without exposing raw prompts or secrets

#### Scenario: Main session attempts shell write during active run lock

- **GIVEN** durable Autopilot runtime state contains an active write lock for a task
- **AND** the current session is not the plugin-owned worker session for that lock
- **WHEN** the session invokes a shell command containing repository write behavior, redirection, removal, move/copy, script-generated writes, or unclassifiable shell control syntax
- **THEN** the plugin blocks the command before mutation
- **AND** no task files or protected Autopilot files are changed

#### Scenario: No active Autopilot lock exists

- **GIVEN** durable Autopilot runtime state has no active write lock
- **WHEN** a non-worker session invokes a mutating tool for ordinary repository files
- **THEN** the write gate does not block solely because Autopilot is installed
- **AND** existing protected-path and repository safety rules still apply

### Requirement: Plugin-Owned Workers Can Write Only Assigned Scope

Autopilot SHALL allow mutations from plugin-owned worker sessions only while the matching run is actively `running` and only inside the assigned write scope.

#### Scenario: Active worker writes inside assigned scope

- **GIVEN** durable runtime state contains a running worker run with a matching worker session id
- **AND** the target path is inside `scope.write`
- **AND** the target path is outside `scope.forbidden`, `.autopilot/**`, and `openspec/changes/*/automation/**`
- **WHEN** the worker invokes a mutating tool
- **THEN** the write gate allows the mutation

#### Scenario: Active worker writes outside assigned scope

- **GIVEN** durable runtime state contains a running worker run with a matching worker session id
- **WHEN** the worker invokes a mutating tool targeting a path outside `scope.write`
- **THEN** the write gate blocks the mutation
- **AND** the block is enforced by the plugin hook rather than worker prompt text

#### Scenario: Inactive worker attempts mutation

- **GIVEN** durable runtime state contains a worker session whose run status is `collecting`, `blocked`, `waiting_mr`, `stopped`, `failed`, or `done`
- **WHEN** that worker session invokes a mutating tool
- **THEN** the write gate blocks the mutation
- **AND** the diagnostic explains that worker write ownership expired

### Requirement: Runtime Evidence Failures Fail Closed

Autopilot SHALL block repository mutations when active Autopilot ownership cannot be safely verified.

#### Scenario: Runtime state is corrupt

- **GIVEN** the durable Autopilot runtime store exists but cannot be parsed or validated
- **WHEN** any session invokes a mutating tool that can affect repository files
- **THEN** the write gate blocks the mutation
- **AND** the diagnostic reports runtime recovery failure and a safe recovery action

#### Scenario: Tool classification is unknown under active lock

- **GIVEN** durable runtime state contains an active write lock
- **WHEN** a tool or shell command cannot be classified as safely read-only or safely scoped
- **THEN** the write gate blocks the tool call
- **AND** unsupported evidence is reported as blocked instead of guessed safe

### Requirement: Intent Locks Prevent Manual Autopilot Fallback

When explicit Autopilot selection proves a valid task is owned by Autopilot but worker dispatch cannot start safely, Autopilot SHALL prevent silent direct implementation under the Autopilot label unless an explicit stop or handoff releases ownership.

#### Scenario: Worker dispatch unavailable after task selection

- **GIVEN** `autopilot_run_next` is invoked for explicit Autopilot continuation
- **AND** a valid task is deterministically selected
- **AND** worker dispatch is disabled or capability is unavailable
- **WHEN** fail-closed write-gate mode is enabled
- **THEN** Autopilot records an intent lock or equivalent active ownership evidence
- **AND** main-session mutating tools are blocked while the intent lock remains active
- **AND** output next actions include stop, wait, enable dispatch, or explicit non-Autopilot handoff rather than silent manual implementation

#### Scenario: Autopilot ownership is stopped

- **GIVEN** an active run lock or intent lock exists
- **WHEN** `autopilot_stop` successfully stops or releases that ownership
- **THEN** the lock is no longer active
- **AND** ordinary non-protected repository mutations are no longer blocked by the Autopilot write gate

### Requirement: Write-Gate State Is Observable And Validated

Autopilot SHALL expose compact active write-gate evidence through status and validation commands.

#### Scenario: Status reports active write lock

- **GIVEN** an active Autopilot write lock exists
- **WHEN** `autopilot_status` runs
- **THEN** the output includes compact lock evidence such as lock kind, status, task id, run id, worker session ids, and whether main-session writes are blocked
- **AND** it does not include raw prompts, secrets, or full report payloads

#### Scenario: Autopilot check validates locks

- **GIVEN** active runtime lock state exists
- **WHEN** `npm run autopilot:check -- --level cheap` or a stricter level runs
- **THEN** the check validates lock schema, run/session references, scope normalization, and archived-change references
- **AND** corrupt, stale, or contradictory lock evidence is reported as blocking at the appropriate gate level
