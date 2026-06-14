---
name: openspec-apply-change
description: Implement an accepted OpenSpec change through TDD, minimal code/docs updates, task tracking, validation, and reviewer gates.
license: MIT
---

# OpenSpec Apply Change

Use this skill when the user asks to implement, continue, or complete tasks from one existing OpenSpec change.

## Workflow

- Read the selected change: proposal, design, specs, tasks, traceability, and related docs/source/tests.
- Confirm the next implementation slice and non-goals.
- If an accepted change has independent tasks with bounded write scopes, consider `orchestrator` and keep task tracking, integration, validation, and reviewer gates in the master session.
- Use TDD by default for behavior-changing slices: add or update the focused failing, acceptance, or characterization test before code. If infeasible, document the blocker and substitute the closest reproducible evidence gate.
- Keep TDD proportional: stop at the smallest test/gate set that proves the scoped requirement unless the risk profile requires broader coverage.
- Make the smallest correct code/doc changes that satisfy the scoped requirement.
- Update tasks and traceability only when evidence exists.
- Ensure `tasks.md` has a final `Retrospective Before Archive` section; add it when continuing an older active change that lacks the gate. The section must require likely root-cause review before archive.
- Run the closest relevant validation after each meaningful slice.
- Use reviewer agents for material code-quality/maintainability, architecture, concurrency, protocol, deployment, or test-coverage risks.

## Completion Gate

- Requirements have implementation evidence or explicit blockers.
- Tests cover observable behavior and negative/recovery cases where relevant.
- Docs/specs/tasks are synchronized.
- Validation commands have been run or skipped with explicit reason and residual risk.
- Before archive, hand off to the retrospective gate before archive: write or update `openspec/changes/<change-id>/automation/retro.json` with root causes and follow-up ids for actionable problems, run `npm run openspec:retro-followups -- <change-id>` when available to create/update OpenSpec follow-up changes for actionable findings, then run `npm run openspec:retro-gate -- <change-id>`.

## Output

Return changed files, completed tasks, validation results, coverage/evidence notes, blockers, residual risks, retrospective/archive-gate status, and next implementation slice if any.
