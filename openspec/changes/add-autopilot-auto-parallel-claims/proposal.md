# Proposal: Add Autopilot Auto Parallel Claims

## Why

Autopilot currently defaults to `serial_default` with `maxImplementationClaims: 1`, and guarded parallel implementation only starts multiple tasks when an explicit fixed WIP limit is supplied through plugin-owned runtime state. That is safe, but too static for real OpenSpec queues: some queues should stay serial, while other queues can safely and efficiently advance several changes at once.

The desired behavior is `maxImplementationClaims = auto`: Autopilot should decide how much implementation parallelism is useful for the current Ready queue, without depending on model preference or fear of small, controlled merge conflicts.

## What Changes

- Add an explicit auto parallel implementation policy for Autopilot runtime state, such as `parallelImplementation.mode: "auto"` or `maxImplementationClaims: "auto"`.
- Keep `selection.maxImplementationClaims` as the resolved numeric WIP limit in tool output, and add machine-readable auto-decision evidence explaining why that value was chosen.
- Let auto mode choose between serial execution and bounded parallel execution using deterministic queue evidence: task types, dependency readiness, write scopes, forbidden scopes, hard/soft overlap classification, central-file risk, candidate count, locks, worktree ownership, and configured caps.
- Introduce a small conflict-tolerance budget so Autopilot may start workstreams with predictable low-cost fan-in conflicts, while still rejecting high-risk overlap.
- Require fan-in validation after any auto-parallel run that starts more than one implementation task or accepts soft conflict risk.
- Update contract tests, runtime tests, skill/README wording, and OpenSpec routing so agents can distinguish `parallel_ready`, fixed `parallel_started`, and auto-selected parallel starts.

## Goals

- Make parallel implementation useful without asking the user to hand-pick a fixed WIP limit for every queue.
- Preserve deterministic, explainable Autopilot decisions instead of model-intuited parallelism.
- Avoid over-conservative behavior where minor docs, fixture, or catalog conflicts block otherwise independent work.
- Preserve safety for protected paths, secrets, central runtime files, schema/config files, unsupported scopes, stale evidence, and MR/merge gates.

## Non-Goals

- Do not make parallel implementation the implicit default when no repository or user policy enabled it.
- Do not auto-merge MRs, push protected branches, force-push non-owned branches, deploy, or bypass reviewer gates.
- Do not use LLM judgment, prose proposal summaries, or fuzzy scoring as authoritative evidence for auto WIP.
- Do not remove existing fixed parallel mode; numeric `maxImplementationClaims` remains supported.
- Do not implement unlimited fan-out. Auto mode must stay capped and explainable.

## Impact

- Large OpenSpec queues can advance faster when work is genuinely independent or has only small expected fan-in conflicts.
- Single-risky changes, central-file edits, unknown scopes, dependency chains, and stale runtime evidence remain serial.
- Tool output becomes more actionable because it explains not only which candidates started, but why the chosen WIP limit is efficient and safe enough.
- Review and validation cost may rise for auto-parallel runs; the design mitigates this with WIP caps, conflict budgets, and mandatory fan-in validation.

## Validation

- Add failing runtime and contract tests before implementation.
- Run `npm run validate`.
- Run `npm test`.
- Run `openspec validate --all`.
- Run relevant `npm run autopilot:validate -- <task-ledger.json>` commands when fixture ledgers or live Autopilot ledgers are in scope.
