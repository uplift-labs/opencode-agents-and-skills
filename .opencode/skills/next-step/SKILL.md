---
name: next-step
description: Choose the next concrete implementation, documentation, review, or validation step in a spec/doc-first workflow without immediately writing code.
license: MIT
---

# Next Step Planner

Use this skill when the user asks what to do next, how to continue a change, or how to choose the next reviewable slice.

## Workflow

- Inspect the current repository state, active specs/tasks, recent diffs, and validation evidence if available.
- Do not re-plan the whole project unless the next step depends on it.
- Prefer steps that reduce uncertainty, unblock implementation, or produce a reviewable slice.
- Avoid speculative polish and unrelated cleanup.

## Output

Return:

- `Recommended Next Step`: one action with why it is best now.
- `Scope`: files, specs, tests, or commands likely involved.
- `Success Criteria`: observable completion signal.
- `Validation`: commands or reviewer gates to run.
- `Alternatives`: 1-3 lower-priority options with trade-offs.
- `Do Not Start Yet`: adjacent work that should remain out of scope.
