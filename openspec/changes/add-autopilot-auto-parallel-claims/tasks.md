# Tasks: Add Autopilot Auto Parallel Claims

## Tests First

- [x] Add contract tests for `auto_parallel_implementation`, resolved numeric `selection.maxImplementationClaims`, and optional `selection.autoDecision` fields.
- [x] Add runtime tests proving default no-policy output remains `serial_default` with `maxImplementationClaims: 1`.
- [x] Add runtime tests proving `mode: "auto"` or `maxImplementationClaims: "auto"` resolves disjoint implementation candidates to WIP `2` when locks and worktrees are valid.
- [x] Add runtime tests proving existing fixed numeric parallel mode can still start more than two guarded candidates when explicitly configured.
- [x] Add runtime tests proving docs/tests/fixtures or non-product-code queues can resolve to WIP `3` or capped `4` when all guards pass.
- [x] Add runtime tests proving central coordination files, unknown scopes, unsupported globs, missing locks, invalid worktrees, dependency chains, blockers, MR waits, and stale evidence force serial/no-start decisions.
- [x] Add runtime tests proving `conflictTolerance: "small"` accepts only configured soft conflict scopes, caps WIP at `2`, and records fan-in validation as required.
- [x] Add runtime tests proving source/runtime/schema/config/package/protected-path overlaps are rejected even when small conflict tolerance is enabled.
- [x] Add fan-in validation tests proving auto-parallel runs with multiple starts or accepted soft conflicts cannot reach Done/archive-ready evidence without integration validation.
- [x] Add worktree lifecycle tests proving parallel streams get deterministic owned worktree create plans and cleanup blocks until MR merged plus archive evidence exists.
- [x] Add regression tests for repeated active-run claims, auto duplicate owned worktrees, safe runtime roots, custom ledger roots, and documented worktree-plan JSON output.

## Implementation

- [x] Extend Autopilot parallel runtime state parsing to support auto mode without breaking numeric fixed mode.
- [x] Extend the public Autopilot output contract with auto selection evidence and update fixture/schema validation.
- [x] Implement deterministic auto risk classification using only structured ledger/runtime evidence.
- [x] Implement WIP resolution for `serial_required`, `standard_parallel`, `low_risk_parallel`, and `soft_conflict_parallel`.
- [x] Implement central-file and protected-path risk detection with conservative serial fallback.
- [x] Implement soft conflict scope matching and accepted/rejected conflict evidence.
- [x] Ensure selected auto candidates still pass existing dependency, write-scope, forbidden-scope, lock, worktree, WIP, and runtime-evidence checks before `parallel_started` is emitted.
- [x] Ensure `tasksStarted` is emitted only for actual plugin-owned start evidence and remains aligned with `selection.candidates[].parallelDecision`.
- [x] Add or update fan-in validation helpers so auto-parallel runs require integration evidence before terminal readiness.
- [x] Add a deterministic TypeScript worktree lifecycle helper for parallel stream create/remove/prune planning with owned-path, MR-merged, and archive gates.
- [x] Expose worktree lifecycle planning through a dry-run JSON-in/JSON-out package script.
- [x] Preserve task-to-worktree evidence in started selection, `tasksStarted[]`, and active runtime state for later fan-in/MR/archive cleanup gates.
- [x] Reject unsafe runtime roots, keep scoped filtering correct for custom ledger roots, and expose active run/worktree/fan-in diagnostics in status output.

## Documentation And Routing

- [x] Update `openspec-autopilot` skill wording to explain `maxImplementationClaims = auto`, conflict budget, and the difference between `parallel_ready` and auto `parallel_started`.
- [x] Update README routing and skill catalog wording if model-facing behavior or output contract wording changes.
- [x] Update `/autopilot` command wording only if users need to understand or request auto parallel policy from the command surface.
- [x] Document default behavior: no explicit auto policy still means serial implementation.
- [x] Document parallel worktree lifecycle: create one owned worktree per stream, integrate by MR, and clean up only after MR merged evidence plus archived-change evidence.

## Review Gates

- [x] Run `test-coverage-reviewer` for auto policy and fan-in coverage. Evidence: final re-check found no coverage blockers after exact worktree mapping assertions and planner-created git worktree integration coverage.
- [x] Run `code-quality-reviewer` for runtime/output helper changes. Evidence: final re-check found no blockers; residual P2/nit only for attention-band test size and duplicated local helper.
- [x] Run `instruction-artifact-reviewer` after skill, README, or command wording changes. Evidence: reviewer gate completed clean after Autopilot skill and README updates.
- [x] Run `deployment-config-reviewer` if plugin configuration schema or runtime option deployment behavior changes. Evidence: reviewer gate completed clean for runtime option/config behavior.

## Validation

- [x] `npm run validate` — passed with existing warning: top-level `allow` in `opencode.json` allows all tools by default.
- [x] `npm test` — passed after final worktree mapping and git worktree integration coverage.
- [x] `openspec validate --all` — passed via `npm run openspec:validate` with 13 passed, 0 failed.
- [x] `npm run autopilot:validate -- <task-ledger.json>` for any new or modified Autopilot ledger fixtures. N/A: no Autopilot ledger fixtures were added or modified.

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes. Evidence: `retrospective.md` reviews OpenSpec artifacts, validation, reviewer gates, current `active_change_handoff` output, and root causes.
- [x] Write `retrospective.md` with evidence, problems, root causes, improvements, and archive gate decision. Evidence: `openspec/changes/add-autopilot-auto-parallel-claims/retrospective.md` added.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings. Evidence: no `project-local` findings remained; `npm run openspec:retro-followups -- add-autopilot-auto-parallel-claims` returned `changes: []`.
- [x] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval. Evidence: no `opencode-dev-kit` findings remained; follow-up generator returned `changes: []`.
- [x] Run `npm run openspec:retro-followups -- add-autopilot-auto-parallel-claims` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive. Evidence: passed with `retrospectiveUpdated: false` and no generated changes.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded. Evidence: `npm run openspec:retro-gate -- add-autopilot-auto-parallel-claims` returned `valid: true` and `archiveAllowed: true`.
