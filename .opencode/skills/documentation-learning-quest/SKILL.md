---
name: documentation-learning-quest
description: Guided documentation onboarding and lightweight review for README, docs, specs, architecture notes, or OpenSpec artifacts with simple explanations and evidence notes.
license: MIT
---

# Documentation Learning Quest

Use this skill when the user wants to understand project documentation step by step, especially as a newcomer.

This is a teaching/review mode, not a rewrite mode by default.

## Workflow

- Start from the requested docs or the root README if no file is specified.
- Read small coherent sections and quote only short excerpts that matter.
- Explain the section in plain language.
- Identify terms, assumptions, source-of-truth links, and possible stale claims.
- Distinguish confirmed facts from docs-only claims.
- Offer focused continuation paths: continue, deepen, check against code/tests, or fix docs when requested.

## Output

Return:

- `Section Covered`: file and lines.
- `Plain Explanation`: what the section means.
- `Why It Matters`: practical impact for an engineer.
- `Evidence Status`: confirmed | docs-only | unclear.
- `Potential Issues`: stale, ambiguous, missing link, or no issue.
- `Next Learning Step`: the next section or evidence check.
