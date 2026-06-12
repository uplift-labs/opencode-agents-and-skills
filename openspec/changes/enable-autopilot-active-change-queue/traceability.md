# Traceability: Enable Autopilot Active Change Queue

| Requirement | Primary Tasks | Test Evidence | Validation |
| --- | --- | --- | --- |
| Active OpenSpec changes are discoverable without ledgers | Active-change queue helper; fallback wiring; `no_ledgers` semantics update | Discovery tests; output contract tests; plugin tool tests | `npm test`, manual unscoped `/autopilot` smoke |
| Ledger-backed state remains authoritative | Precedence logic; scoped composition | Ledger precedence tests; plugin tool tests | `npm test`, any touched `autopilot:validate` fixture |
| Active-change selection is deterministic and scoped | Selection implementation; explicit scope handling | Scoped selection tests; multiple-candidate ordering tests | `npm test`, manual scoped smoke |
| Active-change handoff continues through OpenSpec apply | `nextActions[]` wording; skill and command routing updates | Output contract tests; instruction drift tests | `npm run validate`, `npm test` |
| Active-change discovery is read-only and safe | Protected-path guard; no write path in helper | Discovery tests; code-quality review | `npm test`, `code-quality-reviewer` |

## Evidence Source

This change tracks the live `/autopilot` finding from 2026-06-12: active OpenSpec changes existed (`add-autopilot-continuous-validation-gates`, `add-autopilot-auto-parallel-claims`), but `autopilot_run_next` returned `no_ledgers` because the runtime only scanned Autopilot task ledgers and ignored ordinary active `tasks.md` queues.
