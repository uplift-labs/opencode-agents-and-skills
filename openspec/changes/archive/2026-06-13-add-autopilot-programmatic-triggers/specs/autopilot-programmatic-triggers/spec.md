# Autopilot Programmatic Triggers Spec

## ADDED Requirements

### Requirement: Programmatic Triggers Use A Shared Autopilot Controller

Autopilot SHALL route public `autopilot_*` model-facing tools and equivalent event-driven actions through a shared controller that preserves the public Autopilot output contract. Cheap validation check jobs MAY call the deterministic check helper directly because they are not public `autopilot_*` controller actions.

#### Scenario: Existing tools preserve output shape

- **GIVEN** the shared controller is introduced
- **WHEN** `autopilot_run_next`, `autopilot_status`, `autopilot_collect`, `autopilot_answer_blocker`, or `autopilot_stop` is called through the plugin tool surface
- **THEN** the returned output fields, reason codes, task summaries, next actions, selection evidence, and loop guards remain compatible with the existing Autopilot contract

#### Scenario: Event path uses the same controller

- **GIVEN** a supported event schedules an Autopilot status, collect, blocker-answer, stop, or run-next action
- **WHEN** the scheduled job executes
- **THEN** it uses the same controller behavior as the equivalent public tool action
- **AND** it records trigger source metadata without exposing raw prompt text, command values, secrets, or protected state contents

#### Scenario: Event path runs cheap validation helper

- **GIVEN** a supported file or post-tool event schedules a cheap validation check
- **WHEN** the scheduled check job executes
- **THEN** it calls the deterministic check helper without mutating protected Autopilot state
- **AND** it records compact check status metadata instead of a public `autopilot_*` output envelope

### Requirement: Trigger Scheduling Is Debounced, Idempotent, And Recursion-Safe

Autopilot SHALL schedule programmatic trigger actions through deterministic debounce, single-flight, cooldown, and recursion-guard rules.

#### Scenario: Noisy file events are coalesced

- **GIVEN** several `file.watcher.updated` events arrive for the same active OpenSpec `tasks.md` or protected `automation/**` path within the debounce window
- **WHEN** the trigger scheduler runs
- **THEN** it performs at most one equivalent status or cheap-check job for the normalized scope
- **AND** it logs or reports that duplicate events were coalesced without treating coalescing as progress

#### Scenario: Equivalent job is already running

- **GIVEN** a status, check, collect, blocker-answer, stop, or run-next job is already in flight for the same normalized scope
- **WHEN** another equivalent trigger arrives
- **THEN** the new trigger joins, delays, or drops according to the single-flight policy
- **AND** no parallel duplicate controller call is executed

#### Scenario: Autopilot output causes an Autopilot event

- **GIVEN** an Autopilot-triggered job emits tool output, file changes, or session events
- **WHEN** those events are observed by the trigger layer
- **THEN** source tags and loop guards prevent an equivalent no-progress action from being scheduled recursively

### Requirement: Passive Events Never Start Claim-Capable Work By Default

Autopilot SHALL treat passive OpenCode events as observe-mode signals unless explicit configuration and plugin-owned active-run evidence allow a stronger action.

#### Scenario: Active OpenSpec file changes

- **GIVEN** `file.watcher.updated` reports a change to `openspec/changes/<change>/tasks.md`
- **WHEN** observe-mode triggers are enabled
- **THEN** Autopilot schedules a read-only status or cheap check for the affected change
- **AND** it does not call claim-capable `autopilot_run_next` from that passive event

#### Scenario: Autopilot automation evidence changes

- **GIVEN** `file.watcher.updated` reports a change to `openspec/changes/<change>/automation/**`
- **WHEN** observe-mode triggers are enabled
- **THEN** Autopilot schedules ledger/evidence validation or status for that protected automation path
- **AND** it does not mutate protected automation state or advance runtime state from the file event path

#### Scenario: Autonomous run-next is disabled

- **GIVEN** passive events identify ready Autopilot work
- **AND** `runNextEvents.enabled` is absent or false
- **WHEN** the scheduler evaluates the events
- **THEN** it may report actionable status or next actions
- **AND** it does not call `autopilot_run_next`

### Requirement: Controlled Runtime Events Require Plugin-Owned Evidence

Autopilot SHALL run controlled actions such as collect, blocker answer, permission handling, or stop only when runtime state proves the event belongs to a plugin-owned Autopilot run.

#### Scenario: Worker session becomes idle

- **GIVEN** a `session.status` event reports `idle`
- **AND** the session id is recorded as a plugin-owned Autopilot worker session for a task
- **WHEN** the scheduler evaluates the event
- **THEN** it schedules `autopilot_collect` for the related task at most once per unconsumed report evidence
- **AND** repeated idle events do not produce duplicate collection

#### Scenario: Non-Autopilot session becomes idle

- **GIVEN** a `session.status` event reports `idle`
- **AND** the session id is not recorded as a plugin-owned Autopilot worker session
- **WHEN** the scheduler evaluates the event
- **THEN** no collect, stop, blocker, or run-next action is scheduled

#### Scenario: Worker report marker streams before session idle

- **GIVEN** `message.updated` or `message.part.updated` contains a worker report marker for a plugin-owned worker session
- **AND** the worker session is still busy or the report marker is incomplete
- **WHEN** the scheduler evaluates the event
- **THEN** it records the marker as pending evidence
- **AND** it waits for idle or explicit completion before scheduling collection

#### Scenario: Plugin-owned blocker question is answered

- **GIVEN** `question.replied` references a request id recorded as a plugin-owned Autopilot blocker question
- **WHEN** the scheduler evaluates the reply
- **THEN** it calls `autopilot_answer_blocker` with the validated envelope
- **AND** it schedules status after accepted or rejected blocker-answer handling

#### Scenario: Unknown question reply is ignored

- **GIVEN** `question.replied` references a request id unknown to Autopilot runtime state
- **WHEN** the scheduler evaluates the reply
- **THEN** no Autopilot blocker answer or advancement action is scheduled

#### Scenario: Plugin-owned permission reply is observed

- **GIVEN** `permission.replied` references a request id recorded as a plugin-owned pending permission
- **WHEN** the scheduler evaluates the reply
- **THEN** the current MVP schedules status-only evidence for the related task or request
- **AND** it does not call `autopilot_run_next` or stop runtime state from the permission reply itself

#### Scenario: Unknown permission reply is ignored

- **GIVEN** `permission.replied` references a request id unknown to Autopilot runtime state
- **WHEN** the scheduler evaluates the reply
- **THEN** no status, stop, collect, blocker-answer, or run-next action is scheduled

#### Scenario: Plugin-owned workspace or worktree is ready

- **GIVEN** `workspace.ready` or `worktree.ready` references a workspace or worktree recorded in plugin-owned wait state
- **WHEN** the scheduler evaluates the event
- **THEN** it schedules status for the related workspace, worktree, task, or run scope
- **AND** it does not claim implementation work from the readiness event alone

#### Scenario: Plugin-owned workspace or worktree fails

- **GIVEN** `workspace.failed` or `worktree.failed` references a workspace or worktree recorded in plugin-owned wait state
- **WHEN** the scheduler evaluates the event
- **THEN** it schedules a scoped stop when task or run scope is known
- **AND** it schedules status instead of an unscoped stop when no safe scope is available

#### Scenario: Unknown workspace or worktree event is ignored

- **GIVEN** a workspace or worktree ready/failed event references an id or name unknown to Autopilot runtime state
- **WHEN** the scheduler evaluates the event
- **THEN** no status, stop, collect, blocker-answer, or run-next action is scheduled

#### Scenario: Worker failure events are deferred

- **GIVEN** `session.error`, `session.status: retry`, or another worker failure signal is observed
- **WHEN** the event lacks an implemented plugin-owned failure-handling policy
- **THEN** the current MVP does not guess a stop or blocker transition
- **AND** richer worker failure handling requires a follow-up spec before implementation

### Requirement: Post-Tool Checkpoints Run Cheap Validation Without Loops

Autopilot SHALL use trigger hooks after Autopilot tool calls to schedule cheap status/check checkpoints only when the prior output indicates useful new evidence.

#### Scenario: Run-next advanced runtime state

- **GIVEN** `tool.execute.after` observes `autopilot_run_next` output with `reasonCode: "advanced"`
- **WHEN** post-tool checkpoints are enabled
- **THEN** Autopilot schedules a cheap status or validation checkpoint for the affected task or change
- **AND** it does not immediately repeat an equivalent `autopilot_run_next`

#### Scenario: Collect advanced runtime state

- **GIVEN** `tool.execute.after` observes `autopilot_collect` output with `reasonCode: "advanced"`
- **WHEN** post-tool checkpoints are enabled
- **THEN** Autopilot schedules a cheap status or validation checkpoint for the affected task
- **AND** duplicate collect/status loops are suppressed by loop-guard evidence

#### Scenario: No-progress output is observed

- **GIVEN** `tool.execute.after` observes an Autopilot output with `ready_runtime_deferred`, `no_ledgers`, `active_change_handoff`, `collect_deferred`, `stop_no_active_state`, or another no-progress loop guard
- **WHEN** post-tool checkpoints evaluate the output
- **THEN** Autopilot does not schedule the equivalent no-progress tool call again

### Requirement: Protected Autopilot Paths Are Guarded Against Direct Tool Writes

Autopilot SHALL prevent model-facing tools from directly mutating plugin-owned protected state paths unless the action is explicitly plugin-owned.

#### Scenario: Tool attempts protected ledger write

- **GIVEN** a model-facing edit, patch, shell, or write tool attempts to mutate `.autopilot/**` or `openspec/changes/*/automation/**`
- **WHEN** the protected-path guard evaluates the tool call
- **THEN** the guard blocks or asks according to repository policy
- **AND** the message explains that protected Autopilot state must be mutated only by plugin-owned controller paths

#### Scenario: Path cannot be classified safely

- **GIVEN** a model-facing tool call could affect protected Autopilot paths but the target cannot be classified deterministically
- **WHEN** the protected-path guard evaluates the call
- **THEN** it fails closed or asks for explicit approval instead of allowing the write silently

### Requirement: TUI Commands Are Explicit User Actions

Autopilot SHALL treat TUI commands as explicit user actions and keep them separate from passive event triggers.

#### Scenario: User invokes Autopilot status from TUI

- **GIVEN** a TUI Autopilot status command is registered
- **WHEN** the user selects it from the command palette or slash autocomplete
- **THEN** it runs status or a cheap check without requiring an LLM assistant turn
- **AND** it reports the result through TUI feedback or a safe prompt-mediated fallback

#### Scenario: User invokes Autopilot run from TUI

- **GIVEN** a TUI Autopilot run command is registered
- **WHEN** the user selects it
- **THEN** it treats the action as explicit user intent to continue Autopilot work
- **AND** it either uses a proven server-owned bridge for scoped `autopilot_run_next` or falls back to prompt-mediated `/autopilot <scope>` until the bridge is verified

#### Scenario: TUI command needs scope arguments

- **GIVEN** a TUI Autopilot command needs `changeId`, `taskId`, or another free-form argument
- **WHEN** the command runs
- **THEN** it gathers arguments through a TUI dialog or prompt-mediated flow
- **AND** it does not rely on raw slash text as a stable argument transport

### Requirement: Trigger Modes Are Configurable And Safe By Default

Autopilot SHALL expose trigger configuration that defaults to observation and requires explicit opt-in for controlled or autonomous behavior.

#### Scenario: Trigger mode is off

- **GIVEN** trigger mode is configured as `off`
- **WHEN** supported OpenCode events occur
- **THEN** Autopilot does not schedule event-driven status, check, collect, blocker, stop, or run-next jobs
- **AND** explicit model-facing tools still work

#### Scenario: Trigger mode is observe

- **GIVEN** trigger mode is configured as `observe` or omitted
- **WHEN** supported passive events occur
- **THEN** Autopilot may schedule read-only status or cheap checks
- **AND** controlled transitions and claim-capable run-next actions are not scheduled from passive events

#### Scenario: Trigger mode is controlled

- **GIVEN** trigger mode is configured as `controlled`
- **WHEN** plugin-owned worker, blocker, permission, workspace, worktree, or workspace/worktree failure events occur
- **THEN** Autopilot may schedule the corresponding controlled action
- **AND** passive events still do not start claim-capable work by themselves

#### Scenario: Trigger mode is autonomous

- **GIVEN** trigger mode is configured as `autonomous`
- **AND** `runNextEvents.enabled` is true
- **AND** plugin-owned runtime evidence proves an active run, no blockers, no MR wait, valid locks, cooldown eligibility, and loop-guard safety
- **WHEN** an eligible continuation event occurs
- **THEN** Autopilot may schedule scoped `autopilot_run_next`
- **AND** it reports why the autonomous continuation was allowed

#### Scenario: Autonomous prerequisites are missing

- **GIVEN** trigger mode is autonomous but any required runtime ownership, lock, cooldown, blocker, MR, or loop-guard prerequisite is missing
- **WHEN** an eligible-looking event occurs
- **THEN** Autopilot does not call `autopilot_run_next`
- **AND** it reports status, blocked, or no-op evidence instead of guessing
