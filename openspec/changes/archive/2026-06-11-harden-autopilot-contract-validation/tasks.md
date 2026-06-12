# Tasks: Harden Autopilot Contract Validation

## Tests First

- [x] Add contract-drift tests or fixtures for Autopilot public values: task types, statuses, reason codes, actionability values, MR lifecycle statuses, MR wait statuses, tool names, and protected path patterns.
- [x] Add plugin contract tests that instantiate `.opencode/plugins/openspec-autopilot.ts` and execute every public `autopilot_*` tool through `server(ctx, options)`.
- [x] Add tests covering tool argument handling for `autopilot_answer_blocker`, `autopilot_stop`, scoped `autopilot_run_next`, scoped `autopilot_status`, and scoped `autopilot_collect`.
- [x] Add instruction/command drift tests proving `openspec-autopilot`, README routing, and `opencode.json` `/autopilot` command mention current primary output fields and do not document removed fields as authoritative.
- [x] Add a structural validator test that fails when documented Autopilot validation scripts such as `autopilot:validate` are missing.
- [x] Add fake-runner tests for pre-push/OpenSpec validation ordering, short-circuiting, missing CLI behavior, and failure propagation.
- [x] Add report freshness fixtures for stale Autopilot output shape, completed report with unchecked tasks, Ready ledger with explicit plugin-owned-state explanation, and `advisory` versus `archive-strict` modes.
- [x] Add active-change consistency fixtures for source/test evidence present while related `tasks.md` items remain unchecked, and for unsupported evidence returning `unknown`.
- [x] Add a temp/source-equivalent plugin bundle smoke test or a machine-checkable manual release gate fixture.

## Implementation

- [x] Introduce a small shared Autopilot contract module or deterministic cross-module contract comparison helper.
- [x] Import or compare shared contract values in `tools/autopilot-ledger.ts`, `tools/openspec-autopilot-output.ts`, and plugin tests without creating runtime cycles.
- [x] Split-or-justify touched split-candidate validator/test files: kept the `autopilot:validate` script rule in the existing structural validator and fixture harness because extracting package-script validation helpers is larger than this bounded public-contract slice; isolated the new drift matrix in `tools/test-autopilot-contract.ts`.
- [x] Update no-op output builders so ignored tool arguments are explicitly tested and documented, or sanitized argument context is included in output metadata.
- [x] Require documented Autopilot validation scripts in `tools/validate-library.ts`.
- [x] Add or formalize an `openspec:validate` package script if repository policy accepts it as a first-class local gate.
- [x] Extend `tools/pre-push-validate.ts` to support injected command runners or another deterministic test seam for execution behavior.
- [x] Add the minimal Autopilot report freshness helper or validation rule and keep it deterministic with stable JSON output.
- [x] Add an active-change consistency mode that compares only deterministic task checklist, report, source/test, and plugin-owned ledger evidence.
- [x] Add the plugin bundle load/import smoke or machine-checkable release checklist.

## Documentation And Review

- [x] Update README validation/manual Autopilot sections only after scripts, plugin smoke, and freshness checks are implemented.
- [x] Update `openspec-autopilot` skill wording only if the public output contract or tool argument semantics change.
- [x] Run `instruction-artifact-reviewer` for skill, README, command, or OpenSpec guide changes.
- [x] Run `test-coverage-reviewer` for contract, plugin, pre-push, freshness, and bundle smoke coverage.
- [x] Run `code-quality-reviewer` if shared contract extraction or helper refactoring is non-trivial.

## Validation

- [x] `npm run validate`
- [x] `npm test`
- [x] `npm run autopilot:validate -- <task-ledger.json>`
- [x] `openspec validate --all`
- [x] `npm run prepush:validate` or a deterministic fake-runner equivalent when full pre-push execution is not appropriate locally

## Retrospective Before Archive

- [x] Review completed work, validation, reviewer gates, repeated manual checks, and token-heavy evidence gathering.
- [x] Write `retrospective.md` with findings, improvement ideas, and archive gate decision if the retrospective gate is active for this repository.
- [x] Route any remaining Autopilot, skill, validator, evidence-pack, or install smoke findings to OpenSpec follow-up changes.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
