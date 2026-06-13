---
name: documentation-block-ledger
description: Helper ledger contract for documentation-hardening-loop when Markdown, docs, specs, or traceability files require complete block-level coverage and re-review tracking.
license: MIT
---

# Documentation Block Ledger

Use this helper only with `documentation-hardening-loop` or an equivalent exhaustive documentation review. It is not a standalone review workflow.

## Ledger Rules

- Track every text file in scope with continuous line ranges from first to last line.
- Include frontmatter, blank lines, tables, diagrams, anchors, and code fences.
- For generated, binary, unreadable, deleted, or too-large files, add a special block with reason and confidence impact.
- Store paths, line ranges, short excerpts, evidence refs, verdicts, findings, likely root causes, fix decisions, and re-review status. Do not store secrets or large source dumps.
- If a file changes after review, mark affected blocks `needs-rereview`.

## Deterministic Helper Automation

- Prefer helper code for mechanical ledger work when it can gather explicit evidence faster than manual review: file inventories, continuous line/block ranges, heading/link/anchor maps, exact duplicate text maps, changed-block detection, and validation status reports.
- Helper code must be deterministic and contract-driven: explicit inputs, explicit outputs, fixtures or schemas, stable ordering, privacy-safe output where applicable, and no hidden heuristics.
- Do not encode fuzzy quality scoring, probabilistic classification, model-like summarization, inferred correctness, or hidden priority ranking in helper code; unsupported inputs must be reported as `unknown`, `unreadable`, `unsupported`, or `blocked`.
- The final documentation judgment still comes from reviewed ledger rows, source-of-truth evidence, and reviewer synthesis.

## Minimal Ledger

```markdown
# Documentation Hardening Ledger

- Scope: <files/directories/specs>
- Goal: <bounded docs objective>
- Non-goals: <excluded areas>
- Evidence policy: docs are claims until verified
- Current phase: inventory | review | triage | fix | validate | rereview | final
- Progress: <reviewed>/<total>, <findings>, <blocked>, <needs-rereview>

## File Inventory
- path | lines | type | status | notes

## Block Coverage
- [ ] DB01 | path:1-20 | purpose | evidence needed | status

## Block Reviews
### DB01 | path:1-20
- Claims:
- Evidence checked:
- Verdict: clean | finding | blocked | polish-only
- Findings:
- Fix decision:
- Re-review:

## Findings
- F01 | severity | block | evidence | impact | likely root cause | minimal fix | status
```

## Completion Gate

The documentation scope is not complete until every block is `clean`, `finding fixed`, `polish-only`, or `blocked with reason`, and every changed block has been re-read.
