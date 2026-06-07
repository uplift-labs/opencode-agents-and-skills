# Reusable Project Agent Instructions

Use this template as a starting point for a project-level `AGENTS.md`. Keep only rules that are durable for the repository.

## Sources Of Truth

- Treat source code, tests, schemas, scripts, generated artifacts, and live command output as primary evidence.
- Treat docs, comments, issue text, summaries, and user claims as navigation until verified.
- If prose and implementation disagree, surface the conflict and trust executable/source evidence until resolved.
- Put product requirements in the project's spec or docs system, not in agent instructions.

## Work Style

- Prefer the smallest correct change that satisfies the scoped task.
- Do not perform unrelated cleanup, formatting, or refactors.
- Preserve user and teammate changes. Never revert files you did not change unless explicitly requested.
- For code or behavior changes, default to TDD: add or update the focused failing, acceptance, or characterization test before implementation. If skipped, state why and what validation substitutes for test-first evidence.
- Keep TDD proportional: do not expand into unrelated coverage or speculative suites when one focused test/gate proves the scoped behavior.
- After edits, run the closest relevant validation command or state why validation was skipped.

## Autonomy

- Continue autonomously within the selected goal while safe, useful work remains.
- Stop for serious blockers only: missing credentials, hardware/manual gate, destructive permission, product-owner decision, legal/security approval, unavailable required artifact, or explicit user mode that forbids needed action.
- Do not ask routine questions when evidence can be gathered locally or a safe reversible default exists.
- Avoid scope creep. New tasks must directly advance the current goal or be recorded as future work.

## Review And Evidence

- Findings require evidence, impact, recommendation, and confidence.
- Missing evidence for critical behavior is a finding, blocker, or accepted risk.
- Reviewer agents should be leaf validators: read-only, no edits, no commits, no pushes, no nested agents, no user questions.

## Git And Remote State

- Do not commit, push, merge, delete source artifacts, or alter remote state unless explicitly requested and allowed by repository policy.
- Before committing, inspect status, diff, and recent log; stage only intended files.
- Before creating or updating a PR/MR, inspect status, diff, remote tracking, included commits, validation evidence, and linked issues.

## Documentation

- Keep README/docs/specs synchronized with public behavior.
- Prefer one canonical source of truth over duplicated status or requirement prose.
- Behavior-changing requirements should be represented in the project's normative spec system when one exists.
