# Project Agent Instructions

This project uses the Universal Development Loop from `opencode-dev-kit`.

## Universal Development Loop

Apply the same process for every task, scaled to the size and risk of the change:

1. `Intake`: clarify goal, constraints, success criteria, non-goals, and likely validation path.
2. `Evidence`: inspect source, tests, schemas, scripts, config, generated artifacts, and live command output before trusting prose.
3. `Baseline Proof`: reproduce or characterize current behavior before behavior changes when feasible.
4. `Small Slice`: choose the smallest reviewable change that proves value.
5. `Test First`: add or update a focused failing, acceptance, or characterization test before behavior-changing implementation unless infeasible.
6. `Implement`: make the smallest correct change without unrelated cleanup or speculative abstractions.
7. `Focused Validation`: run the nearest validation command first.
8. `Review Gate`: use relevant read-only reviewers only when risk justifies them.
9. `Final Validation`: broaden validation when boundaries, APIs, data, deployment, or compatibility are affected.
10. `Handoff`: report changed files, evidence, validation, residual risks, and ready-to-land status.
11. `Process Improvement`: convert repeated friction into helpers, validators, fixtures, reports, or templates.

## Project Adapter

- Keep project-specific commands in `opencode-dev-kit/adapter.json` or this repository's documented validation section.
- Technology choices change commands and constraints, not the development loop.
- If validation commands are unknown, discover them from project files and report `unknown` rather than guessing.

## Autonomy

- Continue autonomously when local evidence or a safe reversible default is enough.
- Ask the user only for real blockers: credentials, missing external systems, destructive or remote actions, owner/product/security/legal decisions, or MR/PR outcomes.
- Preserve user and teammate changes. Never revert files you did not change unless explicitly requested.

## Process Control

- Keep clear small tasks direct and cheap.
- Use `openspec-autopilot` when a ready OpenSpec task ledger/queue exists, the user explicitly invokes Autopilot, strict task-type phases must be enforced, or safe independent OpenSpec work can be advanced in parallel until blocker/MR/limit.
- Use prompt-only orchestration only when Autopilot is unavailable or not the right control plane.

## Quality

- Treat source, tests, schemas, scripts, generated artifacts, and live output as primary evidence.
- Keep TDD proportional: one smallest useful test or gate is enough unless risk requires more. If test-first work is infeasible, state why and name the closest substitute evidence.
- Prefer deterministic helpers, validators, fixtures, or generated reports over repeated manual inspection.
- Reviewer agents are read-only leaf validators by default.
