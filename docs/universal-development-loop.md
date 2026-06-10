# Universal Development Loop

The kit uses one process for every project. Technology adapters change commands; they do not create new workflows.

## Loop

1. `Intake`: define goal, constraints, success criteria, non-goals, and likely validation.
2. `Evidence`: inspect source, tests, schemas, scripts, config, generated artifacts, and live output before trusting prose.
3. `Baseline Proof`: reproduce the bug or characterize current behavior before behavior changes when feasible.
4. `Small Slice`: choose the smallest reviewable change that proves value.
5. `Test First`: add/update a focused failing, acceptance, or characterization test before implementation unless infeasible.
6. `Implement`: make the smallest correct change without unrelated cleanup.
7. `Focused Validation`: run the nearest relevant validation first.
8. `Review Gate`: run the relevant read-only reviewer when risk justifies it.
9. `Final Validation`: broaden validation when boundaries are affected.
10. `Handoff`: report changed files, evidence, validation, residual risks, and ready-to-land status.
11. `Process Improvement`: turn repeated friction into helpers, validators, fixtures, reports, or templates.

## Proportionality

- Tiny task: use only intake, targeted evidence, change, focused validation, and handoff.
- Behavior change: include baseline proof and test-first evidence.
- Risky change: include planning, reviewer gates, and broader validation.
- Broad independent work: use bounded fan-out only when reconciliation costs less than serial work.

## Non-Goals

- Do not create technology-specific workflows.
- Do not run every reviewer by default.
- Do not read the whole repository before targeted discovery.
- Do not add abstractions for hypothetical future variants.
