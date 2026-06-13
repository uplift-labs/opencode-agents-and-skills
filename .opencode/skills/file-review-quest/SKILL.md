---
name: file-review-quest
description: Step-by-step block review of one file or a small file set, with continuous coverage, evidence, findings, explanations, and a compact checklist.
license: MIT
---

# File Review Quest

Use this skill when the user wants to deeply understand or review selected files without skipping logical blocks.

Default mode is read-only unless the user asks for fixes.

## Workflow

- Freeze scope: exact files and review goal.
- Split each file into small logical blocks: imports, public API, data model, key functions, tests, docs, configuration, or generated sections.
- Review blocks in order and keep a temporary checklist in the response or todo tool.
- For each block, explain purpose, dependencies, risks, and evidence.
- Mark findings only when there is a concrete risk and a minimal fix.
- If the review target is code and maintainability/readability risks become material, use `code-quality-audit` or ask the main session for a `code-quality-reviewer` gate instead of expanding this quest into a broad audit.
- If edits are requested and behavior changes, add/update a focused regression or characterization test before the fix unless infeasible; fix only the selected findings and re-review changed blocks.

## Output

Return:

- `Coverage`: files and block ranges reviewed.
- `Findings`: severity, evidence, impact, likely root cause, recommendation, confidence.
- `Explanations`: concise block-by-block notes for the user.
- `Open Questions`: only questions blocked by missing external evidence.
- `Validation`: checks run or skipped with reason.
- `Continuation`: next block or `review complete`.
