---
name: reflection-retro
description: Process accumulated reflection files into evidence-backed workflow improvements, patterns, heuristics, AGENTS.md updates, skill/agent tuning, scripts, or validation checks.
license: MIT
---

# Reflection Retro

Use this skill when the user asks to process accumulated reflections, lessons learned, post-session notes, or pending retrospective files into concrete improvements.

Default mode is review-first. Apply edits only when the user asks to apply improvements or repository policy clearly allows it. Cleanup, deletes, commits, and remote changes require explicit permission or applicable local policy.

For behavior-changing improvements to scripts, validators, skills, agents, config, examples, or other executable artifacts, add or update the smallest focused test, fixture, validation gate, or acceptance check before editing. If test-first work is infeasible, state why and name the closest reproducible substitute evidence.

## Evidence Invariant

- Reflection prose is a lead, not proof.
- Verify implementation-sensitive claims against source, tests, schemas, scripts, git history, prompts, skills, agents, config, or live output before turning them into rules.
- Do not store secrets, private credentials, or raw sensitive logs in retro output.
- If a lesson is project-specific, keep it in project instructions/docs. If it is durable across projects, propose global instruction or reusable artifact changes.

## Scope

Common reflection sources:

- `docs/reflections/pending/`
- `docs/reflections/`
- `.opencode/reflections/`
- project notes, session summaries, exported retros, or user-provided reflection files

If the repository uses another path, use the path provided by the user or project instructions.

## Workflow

1. Inventory reflection files and scope.
2. If there are fewer than 3 substantive reflections, say that pattern confidence is low and continue only if the user still wants it or the task explicitly asks for a small retro.
3. For large retros with independent batches or target categories, consider `orchestrator` read-only workers; keep small retros serial.
4. Read all in-scope reflections before drawing cross-session conclusions.
5. Triage each file: valid, invalid/stub, duplicate, automated noise, or blocked/unreadable.
6. Extract per-reflection fields:

- `Goal`: what the user or agent tried to accomplish.
- `Outcome`: accomplished, partial, failed, or unclear.
- `Mistakes`: errors, corrections, friction, or missed checks.
- `Lesson`: stated or inferred learning.
- `Action Items`: proposed improvements.

7. Find patterns:

- Repeating mistakes across multiple reflections.
- Recurring action items that were never applied.
- Successful practices worth preserving.
- Tooling or instruction gaps that automation can catch.

8. Produce at most 5 high-value improvements using `Trigger -> Action -> Rationale`.
9. Apply improvements only when allowed; otherwise return a ready-to-apply plan.
10. If files were changed, validate and re-read changed ranges.
11. If cleanup is allowed, remove or archive processed reflection files; otherwise list cleanup candidates.

## Improvement Targets

- Global or project `AGENTS.md` rules.
- Skills and agents.
- Guard hooks, validators, scripts, templates, or checks.
- Documentation or onboarding material.
- Tests or benchmark gates.
- Project memory or durable preference files when appropriate.

Prefer executable automation over new prose instructions when the improvement can be checked mechanically.

## Output

Return:

- `Coverage`: reflection paths, counts, valid/invalid/blocked files.
- `Patterns`: evidence-backed recurring mistakes, recurring action items, and success patterns.
- `Top Improvements`: up to 5 trigger-action-rationale items.
- `Applied Changes`: changed files or `none`.
- `Validation`: checks run or skipped with reason.
- `Cleanup`: processed/deleted/archived files or cleanup candidates.
- `Residual Risks`: low-confidence or single-reflection observations.
- `Actionable Continuation Items`: concrete follow-up tasks or `none`.
