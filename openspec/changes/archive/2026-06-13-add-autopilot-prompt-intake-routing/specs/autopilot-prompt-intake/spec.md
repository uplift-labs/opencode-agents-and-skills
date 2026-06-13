# Autopilot Prompt Intake Spec

## ADDED Requirements

### Requirement: Command Arguments Are Resolved Before Autopilot Advancement

Autopilot SHALL distinguish exact scope arguments from free-form task prompts before calling claim-capable control-plane advancement.

#### Scenario: Empty arguments keep existing Autopilot flow

- **GIVEN** the user invokes `/autopilot` with no non-whitespace arguments
- **WHEN** the skill and plugin tools are available
- **THEN** the agent may call `autopilot_run_next` with no scope arguments
- **AND** existing ledger-backed and active-change fallback behavior remains unchanged

#### Scenario: Exact change scope is used as changeId

- **GIVEN** the user invokes `/autopilot <change-id>`
- **AND** `<change-id>` exactly matches one active OpenSpec change directory or other supported exact change-scope form
- **WHEN** Autopilot starts
- **THEN** the agent passes that value as `changeId`
- **AND** it does not also treat the value as free-form prompt text

#### Scenario: Exact task scope is used as taskId

- **GIVEN** the user invokes `/autopilot <task-id>`
- **AND** `<task-id>` exactly matches one discovered Autopilot task ledger id or supported exact task-scope form
- **WHEN** Autopilot starts
- **THEN** the agent passes that value as `taskId`
- **AND** it does not silently select another unscoped task

#### Scenario: Free-form prompt is not used as a scope id

- **GIVEN** the user invokes `/autopilot fix the login timeout bug`
- **AND** the argument text does not exactly resolve to a known `changeId` or `taskId`
- **WHEN** Autopilot intake evaluates the request
- **THEN** the text is classified as a free-form prompt, not as scope
- **AND** the agent does not call `autopilot_run_next` with that text as `changeId` or `taskId`
- **AND** the agent does not claim that an unrelated selected queue item satisfies the prompt

#### Scenario: Ambiguous exact scopes block instead of guessing

- **GIVEN** command arguments resolve to more than one possible exact scope or mix incompatible exact `changeId` and `taskId` values
- **WHEN** Autopilot intake evaluates the request
- **THEN** the flow reports an ambiguous scope blocker or user-choice options
- **AND** no task is started or advanced until the ambiguity is resolved

### Requirement: Free-Form Autopilot Prompts Have Safe Handoffs

Autopilot SHALL route explicit free-form task prompts to a safe workflow instead of stopping at a generic no-ledger result or advancing unrelated work.

#### Scenario: New bug prompt has no matching scope

- **GIVEN** the user explicitly invokes Autopilot with a bugfix prompt
- **AND** no exact matching active change or Autopilot task ledger exists
- **WHEN** prompt intake completes
- **THEN** the recommended next workflow is reproduction/evidence discovery through `openspec-explore` or a bugfix OpenSpec proposal through `openspec-propose`
- **AND** Autopilot task-type ledger gates are not applied until a valid ledger or accepted OpenSpec change exists

#### Scenario: New feature prompt has no matching scope

- **GIVEN** the user explicitly invokes Autopilot with a feature prompt
- **AND** no exact matching active change or Autopilot task ledger exists
- **WHEN** prompt intake completes
- **THEN** the recommended next workflow is `openspec-propose` when the boundary is stable or `openspec-explore` when requirements are unclear
- **AND** the output explains that no plugin-owned Autopilot runtime state was advanced

#### Scenario: Research prompt has no matching scope

- **GIVEN** the user explicitly invokes Autopilot with a research or planning prompt
- **AND** no exact matching active change or Autopilot task ledger exists
- **WHEN** prompt intake completes
- **THEN** the recommended next workflow is `openspec-explore` or a `research`/`planning` OpenSpec change
- **AND** product-code implementation is not started without a later accepted implementation scope

#### Scenario: Free-form prompt is supplied while unrelated queue work exists

- **GIVEN** a ready Autopilot ledger or unfinished active OpenSpec change exists
- **AND** the user invokes `/autopilot <free-form task prompt>` that does not exactly name that work
- **WHEN** intake evaluates the request
- **THEN** the flow reports the existing queue separately from the new unscheduled prompt
- **AND** it does not continue the queued item as the answer to the prompt unless the user explicitly chooses that queue work or the prompt is resolved to an exact scope

#### Scenario: Free-form prompt requires queue inventory before final handoff

- **GIVEN** the user invokes `/autopilot <free-form task prompt>`
- **AND** no read-only queue inventory snapshot has been supplied
- **WHEN** intake evaluates the request
- **THEN** queue state is reported as unknown rather than empty
- **AND** the first recommended tool action is read-only `autopilot_status`
- **AND** no claim-capable `autopilot_run_next` action is recommended until queue state is known or an exact scope is selected

#### Scenario: One obvious small edit is supplied through Autopilot

- **GIVEN** the user explicitly invokes Autopilot for a one obvious small edit
- **AND** no active Autopilot context or ready ledger requires queue handling
- **WHEN** intake evaluates the request
- **THEN** the flow may hand off to direct edit workflow with a concise explanation
- **AND** it does not create OpenSpec or Autopilot ceremony only because the command name was used

### Requirement: Prompt Type Classification Is Conservative

Autopilot SHALL treat prompt task family as routing evidence, not as authoritative ledger state.

#### Scenario: Supported task family is explicit

- **GIVEN** prompt text clearly names a supported family such as `bugfix`, `feature`, `refactor`, `research`, `planning`, `tooling`, `config`, `performance`, or `protocol`
- **WHEN** prompt intake creates routing evidence
- **THEN** it may expose that family as a recommended workflow signal
- **AND** it does not mark a task ledger as that type unless a valid ledger or accepted OpenSpec artifact records it

#### Scenario: Task family is unclear

- **GIVEN** prompt text mixes several possible task families or omits enough context to choose safely
- **WHEN** prompt intake creates routing evidence
- **THEN** the family is reported as unclear, unknown, or requiring exploration
- **AND** the recommended workflow is `adaptive-delivery`, `openspec-explore`, or a user-choice blocker rather than guessed ledger creation

### Requirement: Prompt Intake Surfaces Stay Synchronized

Autopilot SHALL keep prompt-intake behavior synchronized across command, skill, README, helper, and tests.

The prompt-flow command MVP is instruction-mediated: `/autopilot` enters a normal LLM turn whose contract is guarded by deterministic helper and drift tests. The plugin `autopilot_run_next` tool remains scoped to `changeId` and `taskId`; adding a raw-prompt plugin intake tool is outside this requirement.

#### Scenario: Routing wording drifts

- **GIVEN** one required surface documents how `/autopilot <free-form prompt>` is handled
- **WHEN** repository validation runs
- **THEN** deterministic instruction drift tests fail if the `/autopilot` command, `openspec-autopilot` skill, or README routing omits or contradicts the prompt-intake rule

#### Scenario: Prompt text would be echoed into plugin-owned output

- **GIVEN** prompt-intake evidence is emitted by a helper or future plugin tool
- **WHEN** the output is rendered
- **THEN** raw prompt text is not persisted or echoed by default
- **AND** derived fields such as intake category, resolved scope, task family, and recommended workflow are enough for automation
