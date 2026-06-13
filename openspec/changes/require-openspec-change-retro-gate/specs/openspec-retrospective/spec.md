# OpenSpec Retrospective Spec

## ADDED Requirements

### Requirement: Retrospective Required Before Archive

An OpenSpec change SHALL NOT be archived until a change-specific retrospective is completed or an explicit approved skip reason is recorded.

#### Scenario: Change is ready for archive

- **GIVEN** an OpenSpec change has completed implementation, validation, review, and acceptance work
- **WHEN** archive is requested
- **THEN** the archive workflow checks for `retrospective.md`
- **AND** archive proceeds only if the retrospective records a passed archive gate or an approved skip reason

#### Scenario: Retrospective is missing

- **GIVEN** an OpenSpec change has no `retrospective.md`
- **WHEN** archive is requested
- **THEN** archive is blocked
- **AND** the user is told to run the change-specific retrospective first

### Requirement: Retrospective Task Is Final In Task Lists

Every new OpenSpec change task list SHALL include a final retrospective section before archive.

#### Scenario: New change is proposed

- **GIVEN** a new OpenSpec change is created
- **WHEN** `tasks.md` is written
- **THEN** the final task section requires reviewing completed context and likely root causes, writing `retrospective.md`, routing findings, and confirming the archive gate

### Requirement: Retrospective Reviews Full Work Context

The retrospective SHALL inspect the full reachable work context proportionally to the change scope.

#### Scenario: Retrospective is performed

- **GIVEN** a change has artifacts, validation results, reviewer outputs, tool outputs, blockers, reports, or MR context
- **WHEN** the retrospective is written
- **THEN** it records which evidence sources were reviewed
- **AND** it records unavailable sources as `unknown`, `unavailable`, or blocked with reason
- **AND** it does not invent evidence

### Requirement: Retrospective Searches For Workflow And Token Waste

The retrospective SHALL look for process problems that reduce quality or speed or waste tokens.

#### Scenario: Workflow friction exists

- **GIVEN** repeated commands, repeated context reconstruction, manual report synthesis, large outputs, long waits, weak gates, or unclear tool output occurred
- **WHEN** the retrospective evaluates the change
- **THEN** it records the problem with evidence, impact, root cause, recommendation, confidence, and target owner

#### Scenario: Autopilot routing or escape-hatch friction exists

- **GIVEN** an Autopilot run over-triggered, looped on no-progress output, hit runtime-deferred work, encountered stale evidence, or required a manual escape hatch
- **WHEN** the retrospective evaluates the change
- **THEN** it records the Autopilot friction with evidence, impact, root cause, recommendation, confidence, and target owner
- **AND** it routes durable improvements to the current project or reusable Autopilot/OpenCode follow-up changes

### Requirement: Findings Become Durable Follow-Ups

Retrospective findings SHALL become durable follow-up artifacts unless fixed in scope, marked non-actionable with evidence, or explicitly dismissed with reason.

#### Scenario: Project-local finding is confirmed

- **GIVEN** a retrospective finding applies to the current project only
- **WHEN** the finding is not fixed immediately in approved scope
- **THEN** the retrospective follow-up helper creates or reuses a current-project OpenSpec follow-up change
- **AND** `retrospective.md` references the generated change id in `Outputs`

#### Scenario: Reusable workflow finding is confirmed

- **GIVEN** a retrospective finding applies to Autopilot, reusable skills, agents, instructions, validators, evidence packs, or shared OpenCode workflow
- **WHEN** the finding is not fixed immediately in approved scope
- **THEN** the retrospective follow-up helper creates or reuses an `opencode-dev-kit` OpenSpec proposal/change when the current repository owns it, or a local handoff artifact when cross-repo writes are not approved
- **AND** `retrospective.md` references the generated follow-up id in `Outputs`

#### Scenario: Follow-up output is referenced but missing

- **GIVEN** `retrospective.md` has a finding with target `project-local` or `opencode-dev-kit`
- **AND** the finding records a root cause or explicit `unknown` cause requiring investigation or instrumentation
- **AND** `Outputs` names a follow-up id
- **WHEN** archive is requested
- **THEN** the retro gate checks that `openspec/changes/<id>/proposal.md`, `tasks.md`, and `specs/<id>/spec.md` exist and preserve the retrospective evidence
- **AND** archive is blocked when the referenced follow-up change is missing

#### Scenario: No findings are found

- **GIVEN** the retrospective finds no actionable problems
- **WHEN** archive is requested
- **THEN** `retrospective.md` records `No findings` with evidence reviewed
- **AND** archive may proceed

### Requirement: Retro Gate Is Machine-Checkable

The retrospective gate SHALL be enforceable by deterministic validation once the gate implementation is approved.

#### Scenario: Retro gate helper runs

- **GIVEN** a change id
- **WHEN** the retro gate helper runs
- **THEN** it reports whether `tasks.md` includes a final retro task
- **AND** whether `retrospective.md` exists and includes evidence, outputs, and archive decision
- **AND** whether actionable findings reference existing follow-up OpenSpec changes
- **AND** whether actionable findings include root cause evidence or explicit investigation routing
- **AND** whether archive is allowed
- **AND** it returns stable JSON without model-like summarization
