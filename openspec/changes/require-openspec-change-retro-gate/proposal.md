# Proposal: Require OpenSpec Change Retrospective Gate

## Why

OpenSpec changes currently capture proposals, tasks, specs, validation, and follow-up findings, but there is no mandatory final retrospective before archive. That means workflow friction, token-heavy patterns, repeated manual steps, long waits, weak reviewer gates, and Autopilot/skill/agent/instruction improvement ideas can remain hidden in session context and disappear when a change is archived.

Every completed OpenSpec change should produce a small, evidence-backed retrospective before archive. The retrospective should examine how the change was executed and convert concrete improvement ideas into durable follow-up OpenSpec changes in the current project or reusable proposals for `https://github.com/uplift-labs/opencode-dev-kit`.

## What Changes

- Add an archive gate: an OpenSpec change cannot be archived until a change-specific retrospective is completed or an explicit approved skip reason is recorded.
- Require every new OpenSpec `tasks.md` to end with a final retrospective task before archive.
- Define a standard `retrospective.md` artifact for each change.
- Require retrospectives to inspect the full reachable context of the change: artifacts, task history, validation, reviewer outputs, tool outputs, blockers, waiting time, repeated operations, token-heavy steps, and handoff quality.
- Require retrospectives to produce one of three outcomes: `No findings`, project-local OpenSpec follow-up changes, or reusable improvement proposals for `opencode-dev-kit`, with actionable findings backed by real generated OpenSpec changes before archive.
- Add deterministic helper implementation for generating retrospective follow-up changes and checking the retro archive gate.
- Integrate the retro gate into `openspec-archive-change`, `openspec-propose`, `openspec-apply-change`, `openspec-autopilot`, templates, and evidence-pack workflows.

## Non-Goals

- Do not implement remote PR/MR creation, cross-repository writes, or non-deterministic retrospective summarization.
- Do not require a long narrative retrospective for tiny changes; the artifact can be short when evidence supports `No findings`.
- Do not replace reviewer gates, tests, or validation; retrospectives look for process improvements after those gates have run.
- Do not force all findings into `opencode-dev-kit`; project-local findings stay in the current project.
- Do not create remote PRs/MRs automatically without explicit approval.

## Impact

- Archive becomes a stronger learning loop rather than a simple cleanup step.
- Repeated friction from Autopilot, skills, agents, prompts, validations, and instructions becomes visible and trackable.
- Future changes should consume fewer tokens and fewer manual commands because retrospectives identify candidates for automation and instruction cleanup.
- `opencode-dev-kit` receives higher-quality, evidence-backed proposals for reusable workflow improvements.

## Evidence

- The Autopilot live regression required many manual commands, source reads, fixture probes, report edits, and follow-up grouping before findings became durable.
- The user explicitly requested a mandatory retrospective before archiving every OpenSpec change to optimize Autopilot, skills, agents, instructions, reviewer quality, token usage, and future project work.
- Existing OpenSpec project guidance requires follow-up findings to become changes, but it does not require a systematic retrospective before archive.

## Validation

- `openspec validate --all`
- `npm run validate`
- Run the deterministic retro follow-up and retro-gate helper test suites.
