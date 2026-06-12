---
name: openspec-propose
description: "Draft OpenSpec proposal/design/spec/tasks, including lightweight follow-up backlog changes from audit, retro, reviewer, or validation evidence."
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
- Create tasks that map to requirements, tests, docs, and validation gates; order behavior-changing tasks as test/characterization first, implementation second, validation third.
- End every `tasks.md` with the final retrospective section below so archive readiness is checkable.
- Keep future-scope work out unless explicitly accepted for this change.

## Required Task Tail

Every new OpenSpec `tasks.md` must end with:

```md
## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, and token-heavy steps.
- [ ] Write `retrospective.md` with evidence, problems, improvements, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- <change-id>` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
```

Keep this section final because it depends on completed implementation, validation, reviewer, and handoff evidence.

## Follow-Up Backlog Mode

Use this mode when converting several concrete session-scoped follow-ups from an audit, retro, reviewer gate, or validation failure into OpenSpec tracking.

- Do not create one change per tiny note. Group only evidence-backed tasks that are related to the session and outside the current approved scope.
- Prefer one change per coherent outcome, capability, risk area, or artifact family; split only when validation, ownership, or implementation order differs materially.
- `tasks.md` may be the primary backlog surface for lightweight follow-up changes. Keep `proposal.md` brief but explicit about source evidence, scope, non-goals, and why tracking is needed.
- Add spec deltas, scenarios, or `design.md` only when normative behavior, compatibility, architecture, migration, or acceptance criteria need a durable source of truth.
- Carry audit/retro/reviewer evidence into the change so later `next-step` and `openspec-apply-change` runs do not depend on memory or loose final-message bullets.

## Output

Return or create, depending on user mode:

- `proposal.md`: why, what changes, impact, non-goals.
- `design.md`: decisions, alternatives, risks, compatibility, operational model.
- `specs/<capability>/spec.md`: added/modified/removed requirements and scenarios.
- `tasks.md`: implementation and validation checklist ending with `Retrospective Before Archive`.
- `traceability.md` when the repository uses one.
- `Validation`: OpenSpec commands run or skipped with reason.

Do not start implementation until the spec boundary is stable or the user explicitly asks to proceed.
