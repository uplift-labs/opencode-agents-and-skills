# Tasks: Add Autopilot Auto Parallel Claims

## Tests First

- [ ] Add contract tests for `auto_parallel_implementation`, resolved numeric `selection.maxImplementationClaims`, and optional `selection.autoDecision` fields.
- [ ] Add runtime tests proving default no-policy output remains `serial_default` with `maxImplementationClaims: 1`.
- [ ] Add runtime tests proving `mode: "auto"` or `maxImplementationClaims: "auto"` resolves disjoint implementation candidates to WIP `2` when locks and worktrees are valid.
- [ ] Add runtime tests proving docs/tests/fixtures or non-product-code queues can resolve to WIP `3` or capped `4` when all guards pass.
- [ ] Add runtime tests proving central coordination files, unknown scopes, unsupported globs, missing locks, invalid worktrees, dependency chains, blockers, MR waits, and stale evidence force serial/no-start decisions.
- [ ] Add runtime tests proving `conflictTolerance: "small"` accepts only configured soft conflict scopes, caps WIP at `2`, and records fan-in validation as required.
- [ ] Add runtime tests proving source/runtime/schema/config/package/protected-path overlaps are rejected even when small conflict tolerance is enabled.
- [ ] Add fan-in validation tests proving auto-parallel runs with multiple starts or accepted soft conflicts cannot reach Done/archive-ready evidence without integration validation.

## Implementation

- [ ] Extend Autopilot parallel runtime state parsing to support auto mode without breaking numeric fixed mode.
- [ ] Extend the public Autopilot output contract with auto selection evidence and update fixture/schema validation.
- [ ] Implement deterministic auto risk classification using only structured ledger/runtime evidence.
- [ ] Implement WIP resolution for `serial_required`, `standard_parallel`, `low_risk_parallel`, and `soft_conflict_parallel`.
- [ ] Implement central-file and protected-path risk detection with conservative serial fallback.
- [ ] Implement soft conflict scope matching and accepted/rejected conflict evidence.
- [ ] Ensure selected auto candidates still pass existing dependency, write-scope, forbidden-scope, lock, worktree, WIP, and runtime-evidence checks before `parallel_started` is emitted.
- [ ] Ensure `tasksStarted` is emitted only for actual plugin-owned start evidence and remains aligned with `selection.candidates[].parallelDecision`.
- [ ] Add or update fan-in validation helpers so auto-parallel runs require integration evidence before terminal readiness.

## Documentation And Routing

- [ ] Update `openspec-autopilot` skill wording to explain `maxImplementationClaims = auto`, conflict budget, and the difference between `parallel_ready` and auto `parallel_started`.
- [ ] Update README routing and skill catalog wording if model-facing behavior or output contract wording changes.
- [ ] Update `/autopilot` command wording only if users need to understand or request auto parallel policy from the command surface.
- [ ] Document default behavior: no explicit auto policy still means serial implementation.

## Review Gates

- [ ] Run `test-coverage-reviewer` for auto policy and fan-in coverage.
- [ ] Run `code-quality-reviewer` for runtime/output helper changes.
- [ ] Run `instruction-artifact-reviewer` after skill, README, or command wording changes.
- [ ] Run `deployment-config-reviewer` if plugin configuration schema or runtime option deployment behavior changes.

## Validation

- [ ] `npm run validate`
- [ ] `npm test`
- [ ] `openspec validate --all`
- [ ] `npm run autopilot:validate -- <task-ledger.json>` for any new or modified Autopilot ledger fixtures.

## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, and token-heavy steps.
- [ ] Write `retrospective.md` with evidence, problems, improvements, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- add-autopilot-auto-parallel-claims` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
