---
name: documentation-hardening-loop
description: Run a review-fix-validate loop for non-trivial README, docs, spec, architecture, and traceability hardening before implementation, archive, or release.
license: MIT
---

# Documentation Hardening Loop

Use this skill for documentation work where correctness, source-of-truth consistency, traceability, and maintainability matter more than prose polish.

Do not use it for quick wording edits, single small comments, or normal code review.

## Invariants

- Documentation is a map, not proof. Confirm behavior with source, tests, schemas, scripts, live output, standards, or owner decisions.
- Behavior-changing requirements should live in the project's normative spec system, not only in README prose.
- Prefer one canonical source over repeated status tables or duplicated requirement text.
- Cosmetic wording is out of scope unless it prevents misimplementation.

## Workflow

- Define `Goal`, `Scope`, `Non-goals`, `Success Criteria`, and `Stop Line`.
- Inventory docs in scope and identify canonical sources.
- For non-trivial scopes, use `documentation-block-ledger` for continuous block coverage.
- For large doc sets with independent files, sections, or evidence tracks, consider `orchestrator` before ledger assignment; keep single-doc or coupled narrative rewrites serial.
- Check stale claims, broken navigation, duplicated concepts, oversized docs, missing traceability, and status words like implemented, supported, ready, blocked, planned, or tested.
- Fix only material risks: incorrect claims, missing evidence, broken links, contradictory specs, duplicated normative text, or navigation that hides critical context.
- Validate changed docs with available link checks, spec validation, grep/readback, tests, or review gates.

## Output

Return:

- `Verdict`: clean | material fixes applied | material findings | blocked.
- `Scope`: docs/specs reviewed.
- `Findings`: severity, evidence, impact, recommendation, confidence.
- `Changed Files`: if edits were made.
- `Validation`: commands/checks run and result.
- `Residual Risks`: docs-only claims or missing external evidence.
- `Actionable Continuation Items`: concrete next tasks or `none`.
