---
name: openspec-propose
description: Draft a complete OpenSpec change package: proposal, design notes, spec deltas, tasks, acceptance criteria, validation plan, and traceability hooks.
license: MIT
---

# OpenSpec Propose

Use this skill when the user wants to create a new OpenSpec change or turn an explored idea into implementation-ready artifacts.

For broad or unclear user work where it is not yet known whether OpenSpec is required, use `adaptive-delivery` first to choose the lane. For unstable requirements, use `openspec-explore` before drafting proposal/spec/tasks.

## Workflow

- Choose a concise change id using the repository's naming convention.
- Read existing capabilities and active changes to avoid duplicate or conflicting scope.
- For broad proposals with independent capability, source, docs, or test evidence tracks, consider `orchestrator` for discovery before drafting; keep small or unstable-scope proposals serial.
- Define problem, goals, non-goals, risks, rollout/migration, and validation.
- Write normative requirements as scenarios with observable outcomes.
- Create tasks that map to requirements, tests, docs, and validation gates.
- Keep future-scope work out unless explicitly accepted for this change.

## Output

Return or create, depending on user mode:

- `proposal.md`: why, what changes, impact, non-goals.
- `design.md`: decisions, alternatives, risks, compatibility, operational model.
- `specs/<capability>/spec.md`: added/modified/removed requirements and scenarios.
- `tasks.md`: implementation and validation checklist.
- `traceability.md` when the repository uses one.
- `Validation`: OpenSpec commands run or skipped with reason.

Do not start implementation until the spec boundary is stable or the user explicitly asks to proceed.
