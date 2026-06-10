# Universal Development Loop

Use this loop for AI-assisted development in any project. Technology adapters may change commands, file locations, and domain gates, but they must not create a separate process.

## Contract

1. `Intake`: restate the goal, constraints, success criteria, non-goals, and likely validation path in the smallest useful form.
2. `Evidence`: inspect source, tests, schemas, scripts, generated artifacts, config, and live command output before trusting docs, comments, summaries, or user recollection.
3. `Baseline Proof`: reproduce the bug, run the current focused test, or capture a characterization/baseline command before changing behavior when feasible.
4. `Small Slice`: choose one reviewable slice that proves value with minimal surface area. Avoid unrelated cleanup and speculative abstractions.
5. `Test First`: for behavior changes, add or update the focused failing, acceptance, or characterization test before implementation. If infeasible, state why and name the substitute evidence.
6. `Implement`: make the smallest correct change. Preserve existing user/team changes and do not widen scope silently.
7. `Focused Validation`: run the narrowest relevant validation command first. If it cannot run, report the blocker and risk.
8. `Review Gate`: run the relevant read-only reviewer only when risk justifies it, such as code quality, test coverage, readiness, security, performance, deployment, protocol, or compatibility.
9. `Final Validation`: run broader validation when the change crosses module, public API, deployment, data, protocol, or compatibility boundaries.
10. `Handoff`: report changed files, evidence, validation, reviewer findings, residual risks, and ready-to-land status. Ask the user only for real blockers or user-owned decisions.
11. `Process Improvement`: when repeated friction appears, prefer a deterministic helper, validator, fixture, report, or template over adding another prose reminder.

## Token And Time Rules

- Start with inventories, glob, grep, targeted reads, and repository-native commands before broad file reading.
- Load heavyweight skills and launch subagents only when they reduce total work through bounded evidence, independent coverage, or read-only review.
- Keep default context small. Link or reference rarely used domain guidance instead of always loading it.
- Use one canonical loop. Profiles and adapters choose artifacts and commands; they do not define new workflows.
- Stop at the smallest evidence set that proves the scoped behavior unless risk evidence requires broader validation.

## Quality Defaults

- Tests and executable validation outrank documentation-only confidence.
- TDD/test-first is the default for behavior changes, with explicit exceptions only.
- Reviewers are leaf validators by default: read-only, no edits, no commits, no nested agents, no user questions.
- Deterministic helpers must have explicit inputs, outputs, stable ordering, privacy-safe output, and no hidden heuristics.
- Remote, destructive, credentialed, legal/security, product-owner, and MR/PR outcome decisions remain user-owned.

## Output Shape

Use a compact handoff unless the user requests more detail:

- `Outcome`: completed, partial, blocked, or review-only.
- `Changed Files`: paths or `none`.
- `Evidence`: source/tests/commands used.
- `Validation`: commands and results, or skipped reason.
- `Review Gate`: reviewer used or skipped reason.
- `Residual Risks`: remaining uncertainty.
- `Ready To Land`: yes/no with blocker if no.
