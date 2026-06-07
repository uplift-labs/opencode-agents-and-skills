---
name: openspec-archive-change
description: Archive a completed OpenSpec change after verifying tasks, specs, docs, tests, validation, traceability, and residual risks.
license: MIT
---

# OpenSpec Archive Change

Use this skill when the user wants to finalize/archive a completed OpenSpec change.

Do not archive on task checkboxes alone. Archive only when implementation and validation evidence support the final spec state.

## Archive Gate

- All scoped tasks are completed or explicitly moved to follow-up with reason.
- Stable specs reflect the accepted behavior.
- Proposal/design/tasks do not contain unresolved blockers hidden as done.
- Tests, benchmarks, manual gates, or reviewer evidence cover acceptance criteria.
- Behavior-changing implementation has test-first/TDD evidence or an explicit exception; do not infer chronology when evidence is unavailable.
- Docs and README do not contradict the archived behavior.
- Validation passes or failures are explicitly triaged.

## Workflow

- Run `openspec-consistency-review` first for material changes.
- Execute the repository's OpenSpec validation command if available.
- Archive using the repository's standard OpenSpec CLI/process.
- Re-run validation after archive.
- Update docs only when the archived change affects public behavior or navigation.

## Output

Return archived change id, changed files, validation results, evidence summary, follow-up items, and residual risks.
