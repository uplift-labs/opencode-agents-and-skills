---
name: codebase-audit-ledger
description: Helper ledger contract for exhaustive codebase-audit-loop runs requiring file/block coverage, duplicate inventories, test gaps, failure modes, reviewer outputs, and anti-rush gates.
license: MIT
---

# Codebase Audit Ledger

Use this helper with `codebase-audit-loop` when the audit must prove coverage rather than rely on memory or summary impressions.

## Core Rules

- The final audit result must be derived from ledger rows, not a general impression.
- Every ordinary scoped file or logical block must have a verdict: `reviewed-no-finding`, `finding`, `blocked`, or `needs-rereview`.
- Every material finding must have evidence, impact, likely root cause or `unknown`, recommendation, confidence, and status.
- Reviewer summaries are not accepted unless assigned ranges, evidence, and confidence are recorded.
- If a reviewed file changes, mark affected blocks `needs-rereview`.
- Missing evidence for critical behavior is a finding, blocker, or accepted risk, not a silent no-finding.

## Deterministic Helper Automation

- Prefer helper code for mechanical ledger work when it can gather explicit evidence faster than manual review: file inventories, block ranges, exact duplicate maps, changed-block detection, schema checks, and validation status reports.
- Helper code must be deterministic and contract-driven: explicit inputs, explicit outputs, fixtures or schemas, stable ordering, privacy-safe output where applicable, and no hidden heuristics.
- Do not encode fuzzy scoring, probabilistic classification, model-like summarization, inferred severity, or hidden risk ranking in helper code; unsupported inputs must be reported as `unknown`, `unreadable`, `unsupported`, or `blocked`.
- The final audit judgment still comes from reviewed ledger rows, evidence, and reviewer synthesis.

## Minimal Ledger

```markdown
# Codebase Audit Ledger

- Audit id: <repo-scope-date>
- Repo: <path>
- Scope: <files/directories/diff/change>
- Goal: <bounded objective>
- Non-goals: <excluded areas>
- Mode: review-only | audit-and-fix | audit-to-merge-confidence | forensic
- Evidence policy: source/tests/schema/scripts/live output > docs/comments/user claims
- Current phase: inventory | partition | review | testing | fix | rereview | final
- Current block: <id-or-none>
- Progress: <reviewed>/<total>, <blocked>, <needs-rereview>, <findings>

## File Inventory
- path | kind | lines | status | notes

## Block Coverage
- [ ] AB01 | path:1-80 | purpose | risk | status

## Findings
- F01 | severity | evidence | impact | likely root cause | recommendation | confidence | status

## Duplicate And Reduction Matrix
- D01 | files/symbols | duplication type | action: delete | merge | extract | keep | blocked | validation

## Test Gap Matrix
- T01 | behavior | existing evidence | missing gate | priority | status

## Failure Mode Matrix
- W01 | scenario | trigger | expected behavior | evidence | missing gate/blocker
```

## Completion Gate

Do not mark the audit complete while scoped blocks remain unreviewed, changed blocks need re-review, material findings lack triage, or validation is still possible but not run.
