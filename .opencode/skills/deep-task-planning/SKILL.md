---
name: deep-task-planning
description: Build an execution-grade plan for complex, risky, or unclear software tasks before implementation, including scope, evidence, tests, risks, and stop conditions.
license: MIT
---

# Deep Task Planning

Use this skill when the user asks for a plan, when implementation would be risky without decomposition, or when a task spans architecture, tests, data migration, deployment, performance, security, or multiple repositories.

Do not use it for routine single-file changes, simple questions, or tasks where the user clearly expects immediate implementation.

If the user gives a broad or unclear end-to-end delivery task and has not already chosen planning-only mode, use `adaptive-delivery` first to decide whether planning, OpenSpec, architecture, orchestration, or direct execution is the smallest useful lane.

## Planning Contract

- Define `Goal`, `Scope`, `Non-goals`, `Assumptions`, `Risks`, `Success Criteria`, and `Stop Line`.
- Identify primary evidence: source, tests, schemas, scripts, live output, product docs, external specs, or owner decisions.
- Prefer the smallest reversible implementation slice that proves value.
- Include test strategy before implementation strategy.
- Separate confirmed facts from assumptions and open questions.
- Do not invent unavailable tools, APIs, or requirements.
- If the plan exposes independent workstreams with bounded evidence and validation, recommend `orchestrator` for execution; keep tightly coupled or decision-blocked work serial.

## Plan Shape

Return:

- `Goal`: one bounded outcome.
- `Current Evidence`: what was checked and what remains unverified.
- `Implementation Slices`: ordered steps with validation for each step.
- `Test Plan`: unit, integration, acceptance, negative, performance, or manual gates as applicable.
- `Risk Register`: risk, impact, mitigation, owner or blocker.
- `Decision Points`: choices that need evidence or owner input.
- `Ready To Start`: yes/no with blockers.

If the user asks to execute after planning, continue from the first safe slice instead of asking routine follow-up questions.
