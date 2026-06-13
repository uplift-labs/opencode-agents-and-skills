# Autopilot Artifact Format Spec

## ADDED Requirements

### Requirement: Autopilot Automation Artifacts Are JSON

Autopilot-owned and OpenSpec automation wrapper artifacts SHALL be JSON files with explicit schemas.

#### Scenario: Automation artifact is created

- **GIVEN** a tool, plugin, validator, skill workflow, reviewer gate, worker, or retrospective flow creates an Autopilot automation artifact
- **WHEN** the artifact is machine-read or used as gate evidence
- **THEN** it is written as JSON
- **AND** it includes a `schemaVersion` field
- **AND** it is validated before being accepted as gate evidence

#### Scenario: Markdown wrapper artifact is proposed

- **GIVEN** a new Autopilot automation wrapper artifact is proposed with a `.md` extension
- **WHEN** repository validation evaluates the artifact
- **THEN** validation fails unless the file is a canonical OpenSpec document or human-facing documentation
- **AND** the failure explains the canonical JSON location to use instead

### Requirement: Canonical OpenSpec Documents May Remain Markdown

OpenSpec proposal, design, task, and spec documents SHALL remain allowed as Markdown because they are human-reviewed canonical OpenSpec artifacts.

#### Scenario: Canonical OpenSpec Markdown is present

- **GIVEN** `proposal.md`, `design.md`, `tasks.md`, `spec.md`, or human-facing documentation exists
- **WHEN** repository validation checks artifact formats
- **THEN** the Markdown file is allowed
- **AND** any machine-readable automation evidence referenced by the document is stored separately in JSON

### Requirement: Retrospective Source Of Truth Is `automation/retro.json`

OpenSpec archive gates SHALL use `openspec/changes/<change>/automation/retro.json` as the machine-readable retrospective source of truth.

#### Scenario: Archive gate evaluates a completed change

- **GIVEN** archive is requested for `<change>`
- **WHEN** the retrospective gate runs
- **THEN** it validates `openspec/changes/<change>/automation/retro.json`
- **AND** it does not treat `retrospective.md` as sufficient archive evidence

#### Scenario: Actionable retrospective finding exists

- **GIVEN** `automation/retro.json` contains a finding with target `project-local` or `opencode-dev-kit`
- **WHEN** archive is requested
- **THEN** the finding includes a follow-up change id or approved no-follow-up reason
- **AND** referenced follow-up changes exist with proposal, tasks, and spec delta preserving the root cause and recommendation

#### Scenario: Unknown root cause is recorded

- **GIVEN** a retrospective finding records `rootCause` as `unknown`
- **WHEN** the JSON retro gate validates the finding
- **THEN** the recommendation routes investigation or instrumentation before remediation
- **AND** archive is blocked if the recommendation guesses a fix without root-cause evidence

### Requirement: Legacy Markdown Retrospectives Are Transitional Only

Existing `retrospective.md` artifacts SHALL be migrated or explicitly blocked before archive.

#### Scenario: Legacy retrospective can be converted

- **GIVEN** a change has a legacy `retrospective.md` with supported sections and problem rows
- **WHEN** the migration helper runs
- **THEN** it creates equivalent `automation/retro.json`
- **AND** the archive gate validates the JSON artifact

#### Scenario: Legacy retrospective cannot be converted

- **GIVEN** a change has missing or malformed retrospective Markdown
- **WHEN** archive is requested
- **THEN** archive is blocked
- **AND** the output instructs the user to create or repair `automation/retro.json`
