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
- Inventory files, tests, specs, commands, and critical flows.
- Delegate independent read-only reviewer agents when useful, but keep the main session responsible for synthesis and edits.
- Findings require evidence, impact, and a minimal recommendation.
- If fixes are allowed, fix the smallest behavior-preserving or bug-fixing slice, then validate and re-review.
- Do not stop while scoped ledger items are unreviewed, fixable, validatable, or need re-review unless blocked by an external dependency.

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
- `Actionable Continuation Items`: concrete next audit/fix/validation tasks or `none`.
