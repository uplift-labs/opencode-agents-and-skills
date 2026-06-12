# Proposal: Harden Autopilot Contract Validation

## Why

The Autopilot MVP has a useful safety posture, but the public contract is spread across the skill, plugin tool schemas, TypeScript helpers, package scripts, README, and OpenSpec regression reports. The current checks prove important slices, yet they do not prove that those contract surfaces stay synchronized as Autopilot evolves.

Audit evidence:

- `.opencode/skills/openspec-autopilot/SKILL.md` documents public output fields, task statuses, task types, reviewer policy, and transition gates.
- `tools/autopilot-ledger.ts` owns validator enums and transition policy, while `tools/openspec-autopilot-output.ts` owns reason codes, actionability, ledger discovery, classification, and output builders.
- `.opencode/plugins/openspec-autopilot.ts` exposes public tool schemas, but helper tests exercise `tools/openspec-autopilot-output.ts` directly rather than invoking the plugin server/tools.
- `package.json` exposes `autopilot:validate`, but `tools/validate-library.ts` does not require that script in the dev-kit contract.
- `openspec validate --all` is a pre-push/manual gate, not a first-class package script, and `tools/test-pre-push-validate.ts` tests plan shape rather than fake CLI execution and failure propagation.
- `openspec/changes/autopilot-live-regression/live-regression-report.md` contains an older output shape while the current skill/helper contract includes `reasonCode`, `taskSummaries`, `nextActions`, and `loopGuard`.
- Current Autopilot follow-up work can drift between implementation evidence and OpenSpec task state, for example when source/tests already contain a validator gate while the related `tasks.md` checklist still marks that gate as unchecked.
- README documents a manual Autopilot plugin bundle, but installer and tests do not prove the plugin bundle can be loaded from a temp OpenCode config or equivalent plugin contract smoke.

Without a stronger contract validation boundary, future runtime work can drift silently: the validator may accept one state, the output helper may classify another, the skill may instruct agents with stale fields, and installed `/autopilot` usage may fail despite local helper tests passing.

## What Changes

- Add a single source of truth or deterministic drift checks for Autopilot public contract values: task types, statuses, reason codes, actionability values, MR statuses, protected paths, and tool names.
- Add plugin-level contract tests that instantiate `.opencode/plugins/openspec-autopilot.ts` and execute every public `autopilot_*` tool through its declared schema path, not only through helper functions.
- Ensure tool input context is either preserved in sanitized output metadata or explicitly documented/tested as intentionally ignored for MVP no-op behavior.
- Make Autopilot validation scripts first-class repository contract: require `autopilot:validate`, add or formalize an `openspec:validate` script, and test pre-push/OpenSpec CLI behavior with fake success/failure commands.
- Add a freshness check for Autopilot regression/evidence reports so stale output shapes, completed reports with unchecked tasks, or Ready ledgers presented as completed evidence are surfaced before archive/release.
- Add an active-change consistency check so task checklists, report claims, source/test evidence, and plugin-owned ledger state cannot silently contradict each other.
- Add an install or loader smoke for the documented Autopilot plugin bundle, or an explicit machine-checkable manual release gate when live OpenCode loader testing is unavailable.

## Non-Goals

- Do not implement worker dispatch, ledger mutation, blocker-question persistence, MR sync, or parallel queue advancement. That is tracked by `improve-autopilot-runtime-e2e-harness`.
- Do not add task-type-specific validator gates. That is tracked by `tighten-autopilot-ledger-type-gates`.
- Do not implement the general retrospective archive gate. That is tracked by `require-openspec-change-retro-gate`.
- Do not replace the evidence-pack workflow. This change may add freshness checks that the future evidence-pack workflow can consume.

## Impact

- Autopilot contract drift becomes visible before runtime expansion increases autonomy risk.
- Plugin/package/OpenSpec validation failures become reproducible in local tests rather than being discovered only in live sessions.
- Future runtime changes can reuse a stable contract module or contract test suite instead of updating skill prose, helper literals, plugin schemas, and reports independently.
- Completed or stale Autopilot OpenSpec changes are easier to archive safely because report freshness is machine-checkable.

## Validation

- Add focused failing tests before implementation for plugin tool invocation, contract drift, script presence, fake OpenSpec CLI failure propagation, and report freshness.
- Keep `npm run validate`, `npm test`, `npm run autopilot:validate -- <task-ledger.json>`, and `openspec validate --all` green.
- Run `instruction-artifact-reviewer`, `test-coverage-reviewer`, and `code-quality-reviewer` when code or instruction changes are implemented.
