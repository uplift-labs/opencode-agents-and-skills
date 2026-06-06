---
name: openspec-consistency-review
description: Review OpenSpec proposal/design/specs/tasks/docs/tests for synchronization before implementation, archive, release, or merge.
license: MIT
---

# OpenSpec Consistency Review

Use this skill for a focused read-only or fix-enabled consistency pass over OpenSpec artifacts and their source/test evidence.

## Checks

- Proposal, design, spec deltas, tasks, and traceability describe the same scope.
- Every behavior-changing requirement has an acceptance scenario and planned or existing verification.
- Task completion claims have evidence.
- Docs do not claim behavior that the spec excludes or leaves future-scope.
- Source/tests do not implement behavior outside accepted scope unless explicitly documented.
- Terminology, capability names, IDs, and links are consistent.
- Open questions, blockers, and manual gates are visible rather than hidden in prose.

## Output

Return:

- `Verdict`: consistent | minor issues | material findings | blocked.
- `Findings`: severity, evidence, impact, recommendation, confidence.
- `Requirement-To-Test Matrix`: existing/planned/missing.
- `Task Evidence Review`: completed tasks with proof or gaps.
- `Archive/Implementation Readiness`: yes/no and why.
- `Validation`: commands run or skipped with reason.
