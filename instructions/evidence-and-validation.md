# Evidence And Validation Discipline

Use this instruction template when a repository needs stronger proof standards for agentic development.

## Evidence Hierarchy

Highest confidence:

- Source code, executable tests, schemas, generated artifacts, scripts, and live command output.
- Wire captures, logs, benchmark output, or manual run output when reproducible and relevant.

Medium confidence:

- Project docs that are directly linked to source/tests or recently validated.
- Issue/MR descriptions that match the inspected diff and validation evidence.

Low confidence:

- Comments, generated summaries, stale docs, unverified examples, and user recollection.

## Required Practice

- State whether important claims are confirmed, docs-only, assumption, or blocked.
- Do not mark a task complete without evidence.
- Do not claim production readiness without acceptance tests, validation output, benchmark/manual gates where relevant, and residual risk review.
- For behavior-changing implementation, use test-first/TDD by default: add or update the focused failing, acceptance, or characterization test before code changes; if infeasible, state why and name the substitute evidence.
- Keep test-first work proportional: stop at the smallest test/gate set that proves the scoped behavior unless risk evidence requires broader coverage.
- If validation cannot run, report `Validation skipped` with reason and risk.
- For performance claims, include measurement, environment, profile, and before/after comparison when relevant.

## Finding Format

Use this format for material findings:

- `Severity`: P0 blocker | P1 material | P2 minor.
- `Evidence`: file:line, command output, schema path, test name, log, or explicit missing evidence.
- `Evidence Type`: source | test | schema | live output | docs-only | assumption.
- `Impact`: what can break or be misunderstood.
- `Recommendation`: smallest useful fix or evidence gate.
- `Confidence`: high | medium | low.

## Validation Loop

1. Reproduce or prove the current behavior where feasible.
2. Add/update the focused failing, acceptance, or characterization test before changing behavior; if infeasible, record why and choose the closest reproducible evidence gate.
3. Make the smallest correct change.
4. Run targeted validation.
5. Re-read changed ranges.
6. Run broader validation when the change crosses module/API/deployment boundaries.
7. Report results and residual risks.
