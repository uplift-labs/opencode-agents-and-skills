# Proposal: Autopilot Live Regression And E2E Evaluation

## Why

The OpenSpec Autopilot MVP now has a skill, `/autopilot` prompt command, server plugin tool skeleton, task ledger validator, fixtures, and routing guidance. It still needs a fresh-session live regression to prove whether the workflow is usable for agents and whether the model-facing control plane behaves well across task types, blockers, MR waits, and parallelizable work.

## What Changes

- Establish a tracked OpenSpec regression task for the Autopilot MVP.
- Provide a ready Autopilot task ledger so a fresh session can discover this change.
- Provide a new-session prompt that drives live regression/e2e testing across bugfix, research, small feature, large epic, codebase exploration, blocker, reviewer, and follow-up tracking scenarios.
- Require all findings to become fixes in scope or new OpenSpec follow-up changes.

## Non-Goals

- Do not merge, push, deploy, or modify protected branches during regression.
- Do not require Desktop/Web visual integration.
- Do not pretend the MVP plugin can perform worker dispatch or ledger mutation if runtime evidence shows it is still no-op.
- Do not create synthetic findings without reproducible evidence.

## Impact

- Adds OpenSpec scaffolding and a regression change to this repository.
- Creates a durable handoff prompt for future sessions.
- Produces evidence about Autopilot usability and defects before deeper runtime implementation.

## Validation

- `npm run validate`
- `npm test`
- `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json`
- `openspec validate --all`
- Fresh OpenCode session smoke: `/autopilot` loads the skill/command/plugin and attempts `autopilot_run_next`.
