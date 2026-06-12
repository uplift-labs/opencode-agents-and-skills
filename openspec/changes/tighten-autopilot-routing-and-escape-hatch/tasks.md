# Tasks: Tighten Autopilot Routing And Escape Hatch

## Tests First

- [x] Add instruction/routing drift tests proving `openspec-autopilot`, README routing, and `/autopilot` command text describe eligibility and non-eligibility cases.
- [x] Add tests or fixtures proving no-progress/deferred reason codes document stop or handoff behavior instead of repeated equivalent `autopilot_run_next` calls.
- [x] Add tests or fixtures for stale evidence/evidence-conflict wording so the agent must stop and report mismatch rather than continuing the ritual.
- [x] Add tests for any new public handoff target values if they are introduced. No `handoffTarget` was introduced; drift tests assert command text does not document it before the public contract exposes it.

## Implementation

- [x] Update `openspec-autopilot` skill with an explicit eligibility section near the top.
- [x] Update `openspec-autopilot` skill with an explicit escape-hatch section for `ready_runtime_deferred`, `no_ledgers`, `no_actionable_tasks`, stale evidence, and evidence conflicts.
- [x] Update README routing so `next-step`, `openspec-apply-change`, direct work, and `orchestrator` boundaries are explicit.
- [x] Update `opencode.json` `/autopilot` command wording only if command-level routing text needs to reference the new contract.
- [x] If a structured `handoffTarget` is added to Autopilot output, update public contract validation fixtures in `harden-autopilot-contract-validation`. No `handoffTarget` was added.

## Documentation And Review

- [x] Run `instruction-artifact-reviewer` after skill, README, command, or routing wording changes.
- [x] Run `test-coverage-reviewer` for routing/escape-hatch fixture coverage if new tests are non-trivial.
- [x] Update Autopilot live-regression prompt/report expectations after routing wording changes land.

## Validation

- [x] `npm run validate:strict`
- [x] `npm test`
- [x] `openspec validate --all`
- [x] `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json` when an Autopilot ledger is in scope

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, and token-heavy steps.
- [x] Write `retrospective.md` with evidence, problems, improvements, and archive gate decision.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings; none required.
- [x] Create or update reusable `opencode-dev-kit` OpenSpec proposals/changes for Autopilot, skill, agent, instruction, validator, or evidence-pack findings; none required.
- [x] Run `npm run openspec:retro-followups -- tighten-autopilot-routing-and-escape-hatch`; no follow-up changes were required.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
