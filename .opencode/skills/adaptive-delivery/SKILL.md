---
name: adaptive-delivery
description: "Apply the Universal Development Loop proportionally to broad, unclear, high-risk, or process-sensitive work without adding unnecessary ceremony."
license: MIT
---

# Adaptive Delivery

Use this skill when the user gives a broad, unclear, cross-cutting, high-risk, or process-sensitive task and expects the agent to organize the work, not just execute one obvious edit. It is the delivery lead layer for applying the Universal Development Loop across planning, evidence, implementation, validation, and review.

Do not use it for obvious tiny edits, single-file mechanical changes, simple questions, or tasks where the normal assistant can safely inspect, edit, validate, and report without extra ceremony. If loaded and the task is tiny, explicitly exit this skill and continue directly.

## Purpose

Apply the minimum effective slice of the Universal Development Loop for the current task.

- Keep small tasks fast.
- Turn ambiguous work into evidence, assumptions, and only necessary user questions.
- Turn material behavior changes into reviewable requirements, architecture decisions, implementation slices, tests, and validation gates.
- Assemble a temporary task team only when parallel discovery, isolated edits, or independent review improve speed, coverage, or safety.
- Preserve the main session as owner of scope, user decisions, integration, validation, residual risks, and final status.

## Intake Triage

Classify before choosing a process. A quick classification is enough for low-risk work; use deeper discovery only when evidence is missing.

- `Task Size`: tiny | small | medium | large | program.
- `Risk`: low | medium | high.
- `Uncertainty`: clear | needs local evidence | needs user decision.
- `Behavior Impact`: none | internal only | user-visible | API/protocol/data/deployment.
- `Spec Need`: none | update existing | create OpenSpec change | blocked by missing spec system.
- `Architecture Need`: none | local design | service/system design gate.
- `Parallelism`: none | read-only discovery | independent implementation tracks | isolated worktrees.
- `Ceremony Budget`: direct | planned | spec-tracked | orchestrated.

## Ceremony Gate

Use the lightest lane that can produce trustworthy evidence. These lanes are proportional applications of the same Universal Development Loop, not separate workflows.

- `Direct Lane`: use for tiny and small clear tasks. Inspect enough context, add/update the focused test first for behavior changes, make the smallest correct change, run focused validation, and use `code-quality-audit` or `code-quality-reviewer` when the code edit is non-trivial enough to affect maintainability.
- `Planned Lane`: use when implementation needs decomposition, risk review, or test strategy but not a formal spec. Load `deep-task-planning` when appropriate.
- `Explore Lane`: use when the problem, desired behavior, compatibility, or acceptance criteria are unclear. Load `openspec-explore` for spec-shaped product questions; otherwise perform local evidence discovery and ask only blocking questions.
- `Spec-Tracked Lane`: use when the change alters observable behavior, API, protocol, data model, compatibility contract, deployment behavior, or another normative requirement and the repository uses or approves OpenSpec tracking. Load `openspec-propose` to create or update the change package before implementation unless the user explicitly requests code-first work.
- `Architecture Lane`: use when boundaries, ownership, concurrency, failure model, deployment, observability, migration, or operational safety need decisions before coding. Load the relevant architecture/domain skill such as `service-architecture-design`.
- `Autopilot Lane`: use when the repository has ready OpenSpec task ledgers, the user explicitly invokes Autopilot, task-type phase discipline must be enforced, or safe independent OpenSpec work can be advanced faster through a plugin-owned process/state machine. Load `openspec-autopilot` and let `autopilot_run_next` drive until blocker, MR wait, or limit only when the Autopilot plugin tool is visible in the current available tool list; if it is unavailable, report the missing plugin tool surface instead of searching for CLI/script substitutes or simulating plugin-owned state.
- `Orchestrated Lane`: use only when at least two independent workstreams have bounded read/write scope, success criteria, and validation evidence. Load `orchestrator` and keep its worker, isolation, integration, validation, and cleanup rules authoritative.

If a referenced OpenSpec, architecture, domain, or orchestrator skill is not installed in the selected kit profile, do not block solely on the missing skill. Use the Universal Development Loop fallback contract, report the missing specialty skill as a residual risk or continuation item, and lower confidence where appropriate.

Do not create a formal plan, OpenSpec change, architecture document, or worker team just because this skill is loaded. Each ceremony must have a concrete trigger and expected evidence value inside the same loop.

## Question Policy

Ask the user only for decisions that cannot be safely inferred from repository evidence or a reversible default.

- Prefer local evidence over questions: source, tests, specs, schemas, scripts, generated artifacts, logs, and live command output.
- Ask at most 1-3 high-leverage questions before planning or implementation when user input is truly blocking.
- Offer recommended options when asking, unless there is not enough evidence for responsible options.
- In no-questions or read-only mode, do not call interactive tools; return assumptions, blockers, and suggested continuation items.
- Do not ask workers to question the user. Workers return `blocked` or `needs-review` with the exact decision needed.

## Completion Handoff

- Ask the user only when a real blocker or user-owned decision remains: scope/risk, credentials/provider access, owner/product/security/legal decisions, destructive operations, remote-state actions, or MR/PR outcomes.
- When asking, use `question` when available and offer 2-4 self-contained next actions with the recommended option first and labeled `(Recommended)`.
- In read-only/no-question mode, return `Suggested Next Options`; workers and reviewer agents return `Actionable Continuation Items` instead of asking the user directly.
- Continue immediately when the user selects an actionable option that is within the current scope and safety boundaries.
- If no real blocker remains, report status, validation, changed files, and residual risks without interactive handoff.

## Session Follow-Up Tracking

Use OpenSpec as a durable follow-up tracker only when the current session produces a real backlog, not for every incidental note.

- Keep one or two obvious in-scope next actions in the final response or active task list; do not create OpenSpec ceremony for every minor issue.
- When an audit, retro, reviewer gate, failed validation, or broad discovery produces several concrete tasks that are related to this session but outside the current approved scope, group them into one or more OpenSpec changes.
- Prefer one OpenSpec change per coherent outcome, capability, risk area, or artifact family; use `tasks.md` as the backlog surface and add proposal/spec/design detail only when requirements, behavior, compatibility, or acceptance criteria need it.
- Create or update OpenSpec files only when the repository already uses OpenSpec or the user approved adding that workflow; otherwise return grouped candidates as continuation items.
- In read-only/no-write runs, recommend exact follow-up groups or candidate change ids as `Actionable Continuation Items` or `Suggested Next Options` instead of writing files.
- After creating or identifying follow-up changes, use `next-step` to choose the next OpenSpec-backed workstream instead of continuing from loose final-message bullets.

## Business And Requirement Analysis

For medium or larger work, capture just enough product context to prevent wrong implementation.

- `Problem`: what user/business outcome is being pursued.
- `Users/Consumers`: people, clients, APIs, jobs, or systems affected.
- `Current Behavior`: confirmed evidence and unknowns.
- `Desired Behavior`: observable outcomes and acceptance signals.
- `Constraints`: compatibility, migration, performance, security, deployment, timeline, policy, or manual gates.
- `Non-goals`: adjacent work to avoid.
- `Success Criteria`: tests, commands, reviewer gates, demo/manual checks, or acceptance scenarios.
- `TDD Gate`: for behavior-changing implementation, identify the failing, acceptance, or characterization test/fixture to add or update before code; if infeasible, record the blocker and substitute evidence.

Keep this analysis compact. Do not invent business requirements; label assumptions and unresolved decisions.

## Team Assembly

Assemble a temporary team only after the lane is chosen.

- Main session: delivery lead, scope owner, user decision point, integration owner, validation owner, final reporter.
- `explore` subagents: broad read-only mapping, codebase discovery, spec inventory, or evidence collection.
- `general` subagents: bounded implementation or research slices with exact scope.
- Domain skills: method contracts for specific slices, such as protocol, config, legacy, scheduler, benchmark, packaging, or documentation work.
- Reviewer agents: read-only gates after planning or material changes, such as implementation readiness, code quality/maintainability, OpenSpec architecture, test coverage, performance/reliability, deployment/config, protocol, wire, legacy evidence, or compatibility.
- `orchestrator`: execution manager for independent tracks; not a substitute for requirements, spec, architecture, or domain rules.

When fan-out is justified, prefer the smallest useful team. Many tasks need no workers, and material tasks usually need only targeted reviewer gates. Stay serial when reconciliation would cost more than parallelism saves.

## Dependency Graph

For large or orchestrated work, define work packages as a simple dependency graph before dispatch.

Each package needs:

- `ID`: stable short name.
- `Outcome`: reviewable result.
- `Depends On`: package IDs or `none`.
- `Read Scope`: exact paths, specs, commands, or evidence sources.
- `Write Scope`: exact paths or `none`.
- `Success Criteria`: observable completion signal.
- `Validation`: focused command, reviewer gate, manual gate, or explicit blocker.
- `Owner`: main session, worker type, or reviewer agent.

Parallelize only packages with no unmet dependencies and no unsafe write overlap. If two packages need the same write scope, either keep them serial or use isolated worktrees and integrate one result at a time through `orchestrator`.

## OpenSpec Routing

Use existing OpenSpec skills rather than duplicating their contracts.

- Use `openspec-explore` when requirements are not stable enough for proposal/spec/tasks.
- Use `openspec-propose` when the task needs proposal, design, spec deltas, tasks, acceptance criteria, or traceability before implementation.
- Use `openspec-propose` to convert several session-scoped follow-up tasks from audits, retros, reviewer gates, or validation failures into lightweight OpenSpec changes when they pass the follow-up threshold.
- Use `openspec-consistency-review` before implementation, archive, release, or merge when specs/tasks/docs/tests may have drifted.
- Use `openspec-autopilot` when ready OpenSpec task ledgers exist, the user explicitly invokes Autopilot, strict typed phases matter, or independent OpenSpec tasks should be advanced in parallel through plugin-owned state.
- Use `openspec-apply-change` for accepted OpenSpec changes and keep its TDD, task update, validation, and reviewer gate rules.
- Use `next-step` when the user asks what to do next in an existing OpenSpec-backed workflow.

Do not force OpenSpec for local refactors, internal cleanup, obvious bug fixes with clear expected behavior, or tasks explicitly scoped as no-spec/no-doc unless repository policy requires it.

## Orchestrator Handoff

When the dependency graph exposes independent packages, prefer `openspec-autopilot` for OpenSpec-backed ledgers/queues and use `orchestrator` for prompt-only coordination outside the Autopilot control plane.

- Freeze objective, constraints, non-goals, success criteria, and final validation target first.
- Hand off only bounded workstreams that are user-approved when approval is required, or eligible under the `orchestrator` auto gate when approval is not required.
- Include relevant domain-skill rules in each worker prompt.
- Keep workers from asking the user, widening scope, committing, pushing, deleting worktrees, or editing outside scope.
- Let `orchestrator` own worker dispatch, report envelopes, isolation, integration, focused/final validation, reviewer gates, and cleanup.
- Exit orchestration and continue serially if independence, acceptance criteria, or integration path turns out weaker than expected.

## Completion Gate

Before final response, close or explicitly skip with reasons:

- `Scope`: objective, constraints, non-goals, and assumptions remained stable or changes were reported.
- `Requirements`: acceptance criteria are met, blocked, or intentionally deferred.
- `Spec/Docs`: required OpenSpec/docs/tasks updates are complete or not applicable.
- `Implementation`: changed files are limited to scope and re-read where material.
- `Validation`: focused and final checks ran or have concrete blockers.
- `Review`: relevant reviewer gates ran when material and available, or were skipped with rationale.
- `Risks`: residual risks and next actions are visible.

## Output Shapes

Use compact status, not full project-management prose.

For direct work, report:

- `Lane`: Direct and why.
- `Changed`: files or `none`.
- `Validation`: commands and results.
- `Residual Risks`: risks or `none`.

For planned or spec-first work before implementation, report:

- `Lane`: chosen lane and why.
- `Problem/Goal`: concise statement.
- `Evidence`: checked sources and confidence.
- `Open Questions`: only blockers.
- `Work Packages`: dependency graph summary.
- `Recommended Execution`: serial, planned, spec-first, or orchestrated.
- `Approval Needed`: only when user approval is required before writes, fan-out, or scope decisions.

For orchestrated work, use the `orchestrator` output contracts and add:

- `Delivery Lane`: Orchestrated.
- `Dependency Graph`: packages launched, blocked, deferred, or completed.
- `User Decisions`: decisions requested or assumptions used.

## Hard Rules

- Never let process ceremony replace evidence.
- Never ask routine questions when local evidence or a safe reversible default exists.
- Never start implementation when a missing product/owner/security/legal/destructive decision is truly blocking.
- Never widen scope silently after a user approves a lane or workstream.
- Never run parallel edits with unsafe write overlap outside isolated worktrees.
- Never mark large work complete without validation evidence or an explicit blocker.
