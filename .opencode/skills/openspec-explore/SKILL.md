---
name: openspec-explore
description: Explore an idea, problem, behavior, or requirement before or during an OpenSpec change, separating evidence, assumptions, options, and open questions.
license: MIT
---

# OpenSpec Explore

Use this skill when the user wants to think through a change before committing to proposal/spec/tasks, or when requirements are ambiguous during an active change.

This is an exploration mode. Do not write code unless the user explicitly pivots to implementation.

## Workflow

- Identify the problem, affected capability, current behavior, desired behavior, and constraints.
- Search existing specs, docs, source, tests, and related issues when available.
- Separate confirmed evidence from docs-only claims and assumptions.
- Identify options with trade-offs, compatibility risk, validation cost, and migration impact.
- Propose a narrow change boundary and non-goals.
- If exploration recommends implementation, identify the TDD/test-first acceptance, characterization, or manual gate evidence needed before code.

## Output

Return:

- `Problem`: concise statement.
- `Evidence`: checked files/commands and confidence.
- `Options`: choices with pros/cons.
- `Recommended Direction`: one option and why.
- `Spec Impact`: capabilities/scenarios likely affected.
- `Open Questions`: only questions not answerable from available evidence.
- `Next Artifact`: proposal/design/spec/tasks or no change needed.
