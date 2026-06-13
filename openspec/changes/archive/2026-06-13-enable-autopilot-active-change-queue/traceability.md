# Traceability: Enable Autopilot Active Change Queue

| Requirement | Primary Tasks | Test Evidence | Validation |
| --- | --- | --- | --- |
| Active OpenSpec changes are discoverable without ledgers | Active-change queue helper; fallback wiring; `no_ledgers` semantics update; materialization-compatible discovery boundary | `tools/test-openspec-autopilot-active-change-output.ts`; `tools/test-autopilot-contract.ts`; `tools/test-autopilot-ledger-materialization.ts`; source-equivalent plugin smoke | `npm test`, `openspec validate --all`; live restarted `/autopilot` smoke not run in this noninteractive session |
| Ledger-backed state remains authoritative | Precedence logic; scoped composition | Ledger precedence tests in `tools/test-openspec-autopilot-active-change-output.ts`; plugin/controller contract tests | `npm test`; no ledger fixtures changed, so `autopilot:validate` not applicable |
| Active-change selection is deterministic and scoped | Selection implementation; explicit scope handling | Scoped selection, multiple-candidate ordering, empty/whitespace scope, unsupported/missing/complete/archived scope tests | `npm test`; source-equivalent scoped plugin smoke |
| Active-change handoff continues through OpenSpec apply | `nextActions[]` wording; skill and command routing updates | Output contract tests; instruction drift tests; README/skill/command docs | `npm run validate`, `npm test`, instruction reviewer |
| Active-change discovery is read-only and safe | Read-only helper; no protected write path in status fallback | Status-only fallback tests assert no repository file mutation; protected-path guard tests remain green | `npm test`, `code-quality-reviewer` |

## Evidence Source

This change tracks the live `/autopilot` finding from 2026-06-12: active OpenSpec changes existed (`add-autopilot-continuous-validation-gates`, `add-autopilot-auto-parallel-claims`), but `autopilot_run_next` returned `no_ledgers` because the runtime only scanned Autopilot task ledgers and ignored ordinary active `tasks.md` queues.

## Current Evidence

- `tools/openspec-autopilot-active-change-queue.ts` discovers active `tasks.md` changes read-only, excludes `archive`, counts checklist items, and returns source-kind summaries.
- `tools/openspec-autopilot-output.ts` composes ledger-backed summaries with active-change fallback, uses `active_change_handoff`, suppresses repeat `autopilot_run_next`, and keeps `tasksStarted`/`tasksAdvanced` empty for handoff output.
- `tools/openspec-autopilot-controller.ts` materializes plugin-owned ledgers only through controller-owned, materialization-capable `run_next` paths specified by `materialize-autopilot-task-ledgers`; status and read-only discovery remain read-only.
- `.opencode/plugins/openspec-autopilot.ts`, `opencode.json`, `.opencode/skills/openspec-autopilot/SKILL.md`, and README expose active-change handoff as an actionable `openspec-apply-change` continuation rather than `no_ledgers` stop.

## Smoke Boundary

- Source-equivalent plugin and controller smoke tests passed through `npm test`; current materialization-capable starts may return `ledger_materialized`, while read-only/status paths preserve `active_change_handoff` evidence.
- Live restarted `/autopilot` command smoke was not run because this session cannot safely restart the active OpenCode process and re-enter the prompt command. The validation record treats live restart smoke as skipped with reason, not as completed runtime evidence.
