# Autopilot Runtime Liveness Spec

## ADDED Requirements

### Requirement: Autopilot Queues Exclude Stale Completed Work

Autopilot SHALL detect when a non-terminal task ledger belongs to an OpenSpec change whose `tasks.md` checklist is complete, and it SHALL NOT select that ledger as live `Ready` work without an explicit reconciliation step.

#### Scenario: Completed change has stale Ready ledger

- **GIVEN** `openspec/changes/<change>/tasks.md` has no unchecked checklist items
- **AND** `openspec/changes/<change>/automation/task.json` exists with a non-terminal status such as `Ready`
- **WHEN** Autopilot builds queue status or selects a primary task
- **THEN** the ledger is reported as stale completed-change evidence
- **AND** it is not selected as the primary `Ready` task
- **AND** the output recommends archive, ledger-status reconciliation, or approved automation cleanup

#### Scenario: Stale ledger and unfinished active change coexist
- **GIVEN** one active change has a stale completed non-terminal ledger
- **AND** another active OpenSpec change has unchecked tasks and no applicable ledger
- **WHEN** Autopilot builds queue status without an explicit task scope
- **THEN** the unfinished active change remains visible as actionable handoff work
- **AND** the stale ledger does not hide the unfinished active change

### Requirement: Prompt Intake Is Code-Backed Before Claim-Capable Advancement

Autopilot SHALL use deterministic prompt-intake logic before claim-capable advancement for explicit `/autopilot <arguments>` flows.

#### Scenario: Exact scope arguments are accepted
- **GIVEN** `/autopilot <arguments>` resolves exactly to one known `changeId` or `taskId`
- **WHEN** prompt intake completes
- **THEN** the first claim-capable action may be scoped `autopilot_run_next`
- **AND** the scope is passed only as `changeId`, `taskId`, or a validated compatible pair

#### Scenario: Free-form prompt is not a scope
- **GIVEN** `/autopilot <arguments>` contains free-form task text that does not exactly resolve to a known scope
- **WHEN** prompt intake completes
- **THEN** no `autopilot_run_next` call is recommended with that text as scope
- **AND** queue inventory is read-only before any handoff
- **AND** raw prompt text is not echoed or persisted by default

#### Scenario: Ambiguous scope blocks
- **GIVEN** command arguments resolve to multiple scopes or incompatible `changeId` and `taskId` values
- **WHEN** prompt intake completes
- **THEN** Autopilot reports an ambiguity blocker or user-choice requirement
- **AND** no task is started or advanced until the ambiguity is resolved

### Requirement: Live Worker Dispatch Is Installed As A Complete Opt-In Bundle

Autopilot SHALL provide a repeatable opt-in install/config path for live worker dispatch that includes the required skill, plugin, command, dependency, options, and restart guidance.

#### Scenario: Live bundle dry run
- **GIVEN** the user requests an Autopilot live-runtime install preview
- **WHEN** the installer runs in dry-run mode against a temp config directory
- **THEN** it reports every skill, plugin, command/config, dependency/package, and option file it would install or update
- **AND** it does not write files

#### Scenario: Skill-only Autopilot install lacks plugin surface
- **GIVEN** `openspec-autopilot` is installed without the plugin and `/autopilot` command bundle
- **WHEN** the user invokes Autopilot or the model attempts to use `autopilot_*` tools
- **THEN** guidance reports a missing plugin tool-surface blocker rather than searching for CLI/script substitutes

#### Scenario: Worker dispatch remains opt-in
- **GIVEN** no explicit live-runtime bundle or plugin options enable worker dispatch
- **WHEN** Autopilot inspects Ready work
- **THEN** it keeps safe deferred behavior
- **AND** it does not create worker sessions or durable runtime claims by default

### Requirement: Controlled And Autonomous Triggers Require Durable Ownership Evidence

Autopilot SHALL persist the evidence needed for controlled and autonomous event handling before treating those event branches as live production behavior.

#### Scenario: Controlled blocker answer uses persisted question evidence
- **GIVEN** a plugin-owned blocker question is persisted with its request id and task scope
- **WHEN** a matching `question.replied` event is observed in controlled mode
- **THEN** Autopilot may schedule blocker-answer handling and status follow-up
- **AND** unknown question replies are ignored

#### Scenario: Permission and workspace events use persisted waits
- **GIVEN** plugin-owned pending permission or workspace/worktree wait evidence is persisted
- **WHEN** a matching event is observed in controlled mode
- **THEN** Autopilot schedules only the corresponding status or scoped stop action
- **AND** unrelated permission, workspace, or worktree events are ignored

#### Scenario: Autonomous run-next uses persisted loop-guard evidence
- **GIVEN** autonomous mode and `runNextEvents.enabled` are explicitly configured
- **AND** durable runtime evidence proves active ownership, valid locks, no blockers, no MR wait, one task scope, and last run-next progress
- **WHEN** an eligible owned session event occurs
- **THEN** Autopilot may schedule scoped `autopilot_run_next`
- **AND** missing or stale evidence suppresses autonomous advancement

### Requirement: Dormant Runtime APIs Are Removed Or Classified

Autopilot SHALL avoid production-dead public or exported APIs unless they are explicitly marked as contract/test utilities or connected to diagnostics.

#### Scenario: TUI command classifier has no production consumer
- **GIVEN** a TUI command classifier is exported from runtime trigger code
- **WHEN** production TUI plugin code does not call it
- **THEN** the classifier is either wired into the TUI path or removed with equivalent behavior preserved

#### Scenario: Worker-session dispatch wrapper bypasses ownership recording
- **GIVEN** a worker-session adapter exposes a one-call dispatch wrapper
- **AND** the controller needs to record durable ownership between session creation and prompt submission
- **WHEN** the adapter interface is reviewed
- **THEN** production code uses the safer two-step create/prompt contract
- **AND** the unused dispatch wrapper is removed or explicitly test-only

#### Scenario: Contract-only exports remain
- **GIVEN** an exported helper or constant has no production consumer
- **WHEN** it is retained for contract or test evidence
- **THEN** its role is explicit and validation proves it remains synchronized with the production contract

### Requirement: Autopilot Discovery Surfaces Stay Complete

Autopilot SHALL be discoverable as a complete runtime/control-plane bundle when live behavior is expected.

#### Scenario: Profile or installer exposes live Autopilot
- **GIVEN** a profile or installer option claims to enable live Autopilot runtime behavior
- **WHEN** validation inspects the install set
- **THEN** the skill, plugin, command, dependency, and required option guidance are present
- **AND** missing pieces produce a validation failure or explicit warning

#### Scenario: Routing documentation drifts
- **GIVEN** README, skill, command, or profile guidance describes Autopilot liveness behavior
- **WHEN** repository validation runs
- **THEN** deterministic drift checks fail if required surfaces omit or contradict the behavior
