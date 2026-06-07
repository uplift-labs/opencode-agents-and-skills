---
name: codebase-audit-loop
description: Use ONLY for large exhaustive autonomous codebase audits covering bugs, redundancy, maintainability, test gaps, failure modes, performance risks, ledgers, reviewers, and evidence-backed findings.
license: MIT
---

# Codebase Audit Loop

Use this skill only for broad, high-risk, or explicitly exhaustive audits. Do not use it for quick PR review, normal debugging, single-file explanation, or implementation-only tasks.

Default mode is `review-only` unless the user explicitly asks for `audit-and-fix`.

## Scope Contract

Before deep work, define:

- `Goal`: one bounded audit objective.
- `Scope`: files, directories, diff, change, or subsystem.
- `Non-goals`: adjacent work not included.
- `Material Success Criteria`: what must be covered before stopping.
- `Stop Line`: when remaining work is polish-only or diminishing returns.
- `Mode`: review-only | audit-and-fix | audit-to-merge-confidence | forensic.

## Default Audit Targets

- Correctness bugs: panic, data corruption, wrong output, wrong defaults, resource leak, broken error handling, nondeterminism.
- Concurrency and isolation: multi-client, multi-tenant, multi-worker, shared state, cancellation, backpressure, shutdown.
- Performance and reliability: latency, throughput, queue wait, lock contention, blocking IO, retry/recovery, overload.
- Redundancy: duplicate code/tests/docs/instructions, unused exports, dead code, redundant wrappers, repeated fixtures.
- Maintainability: giant files, mixed responsibilities, unclear boundaries, excessive public surface, hard-to-review logic.
- Test gaps: missing negative, integration, recovery, property, fuzz, mutation, benchmark, or manual gates.
- Whole-program failure modes: startup failure, config failure, dependency unavailable, partial IO, timeout, client drop, crash, stale state.
- Documentation and instruction drift when it materially affects implementation or review.

## Workflow

- Use `codebase-audit-ledger` for durable coverage when scope is large enough to risk skipped areas.
- Before deep review at scale, decide whether a deterministic helper would reduce repeated counting, inventory, diffing, coverage bookkeeping, or validation effort without replacing reviewer judgment.
- Inventory files, tests, specs, commands, and critical flows.
- For broad audits with independent file or subsystem ranges, consider `orchestrator` with read-only workers and ledger-assigned ranges; keep quick or non-shardable audits serial.
- Delegate independent read-only reviewer agents when useful, but keep the main session responsible for synthesis and edits.
- Use `code-quality-reviewer` for maintainability/readability, file-bloat, duplication, boundary, and overengineering findings that need an independent read-only gate.
- Findings require evidence, impact, and a minimal recommendation.
- If fixes are allowed, add/update a focused regression or characterization test before behavior fixes when practical, then make the smallest fix, validate, and re-review.
- Do not stop while scoped ledger items are unreviewed, fixable, validatable, or need re-review unless blocked by an external dependency.

## Follow-Up Backlog Gate

- If the audit produces several concrete fixes, validations, or investigation tasks that are related to this session but outside the current audit/fix scope, group them into OpenSpec follow-up changes instead of leaving a long untracked final list.
- In read-only mode, recommend candidate change groups and change ids as `Actionable Continuation Items`; create or update OpenSpec files only when write scope and the repository's OpenSpec workflow are available.
- Do not create OpenSpec changes for nits, speculative polish, duplicated phrasing in the final answer, or a single obvious next step.

## Deterministic Helper Automation Gate

Good audit helpers gather explicit evidence: file/block inventories, line counts, duplicate exact-match maps, import/export lists, test-to-requirement matrices, changed-block ledgers, schema checks, generated status reports, or validation-command wrappers.

Helper code must define explicit inputs, outputs, fixtures or schemas, stable ordering, privacy-safe output where applicable, and failure states. Do not encode fuzzy scoring, probabilistic classification, model-like summarization, inferred severity, or hidden risk ranking in helper code. If a helper cannot prove a fact from its inputs, it reports `unknown`, `unreadable`, `unsupported`, or `blocked`; findings and severity remain reviewer judgments.

## Output

Return:

- `Verdict`: clean | findings | fixed | blocked | incomplete.
- `Coverage`: what was reviewed and what was not.
- `Findings`: severity, evidence, evidence type, impact, recommendation, confidence.
- `Redundancy Matrix`: duplicate/dead/merge/extract/keep candidates when in scope.
- `Test Gap Matrix`: behavior -> evidence -> missing gate.
- `Failure Mode Matrix`: scenario -> expected behavior -> evidence or blocker.
- `Validation`: commands and reviewer gates run.
- `Residual Risks`: unresolved or low-confidence areas.
- `OpenSpec Follow-Up Backlog`: change groups created or recommended, or `none`.
- `Actionable Continuation Items`: concrete next audit/fix/validation tasks, including OpenSpec follow-up candidates when several session-scoped items remain, or `none`.
