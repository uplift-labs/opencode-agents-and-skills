# Retrospective: enable-autopilot-worker-dispatch

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, worker-dispatch spec, traceability, tasks, materialized Autopilot ledger, README routing/runtime guidance, and `openspec-autopilot` skill guidance.
- Source and tests recorded in `tasks.md`: runtime store, worker report parser, ledger transition writer, phase dispatcher, worker prompt builder, worker-session adapter, controller worker dispatch integration, plugin smoke, protected-path guard, programmatic triggers, instruction drift, and Autopilot check suites.
- Validation recorded in `tasks.md`: focused TypeScript tests, `npm run validate`, `npm test`, `npm run openspec:validate`, `npm run autopilot:check -- --level standard --change enable-autopilot-worker-dispatch`, and `npm run autopilot:check -- --level prepush --change enable-autopilot-worker-dispatch` passed; `npm run validate` retained the known top-level `allow` warning in `opencode.json`.
- Reviewer gates: `code-quality-reviewer`, `test-coverage-reviewer`, `instruction-artifact-reviewer`, `deployment-config-reviewer`, and `openspec-consistency-review` all reached clean or non-blocking final rechecks after fixes.
- Current Autopilot runtime evidence: explicit `/autopilot` selected `enable-autopilot-worker-dispatch` from `automation/task.json` and returned `reasonCode: ready_runtime_deferred`, so no worker was claimed and no protected ledger mutation occurred in this session.
- Boundary evidence: source-equivalent plugin worker-dispatch smoke passed, but no restarted live OpenCode enablement was attempted in this noninteractive session; MR, merge, deploy, push, and destructive cleanup remain out of scope.

## Problems Found

| Problem | Evidence | Impact | Root Cause | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- | --- |
| Worker-dispatch option diagnostics remain a reusable hardening item | `tasks.md` deployment-config-reviewer evidence names strict plugin-option diagnostics follow-up plus live restarted E2E before target enablement | Operators enabling live dispatch could receive capability or deferred output without enough config/preflight detail | Deployment review identified live-enable diagnostics as intentionally deferred beyond the serial dispatch implementation slice | Tighten `workerDispatch` option diagnostics and live-enable preflight evidence before recommending target deployment | high | opencode-dev-kit |
| Early reviewer findings exposed report and scope safety gaps | `tasks.md` records role-less report parsing, stale terminal worker scope, and validation-command guard blockers found before fixes | Worker output could have been misread or inactive/out-of-scope worker writes could have been trusted | Worker identity, assistant-message provenance, and shell command trust boundaries were under-specified before focused review | Keep assistant-only report extraction, inactive worker write blocking, validation-command allowlisting, shell-control fail-closed handling, and focused regressions as required safety coverage | high | none |
| Protected Autopilot ledger remains plugin-owned despite manual completion evidence | Current `/autopilot` returned `ready_runtime_deferred` for the materialized Ready ledger and this session did not mutate `openspec/changes/*/automation/**` | Future Autopilot inspection may still see the protected ledger until runtime dispatch or archive removes the active change from the queue | Autopilot protected state can only be advanced by plugin runtime, while the current session had no dispatch-capable runtime claim | Do not manually edit `automation/task.json`; use retro gate and archive workflow for completed change handoff, or enable live dispatch only with explicit safe runtime configuration | high | none |
| Live restarted OpenCode worker-dispatch smoke was not run | `tasks.md` records source-equivalent smoke passed and no restarted live enablement was attempted in this session | Source-equivalent tests prove adapter contracts but not a restarted server with local operator configuration | The noninteractive session cannot safely restart OpenCode and re-enter a target live-dispatch configuration | Keep live dispatch disabled by default and require target-environment restart plus worker-session capability evidence before enabling it operationally | high | none |
| Single-runtime ownership remains an operational boundary | README and skill document that `workerDispatch.enabled` assumes one OpenCode server/plugin runtime owns `.autopilot/runtime/state.json` | Concurrent server instances could race runtime state without an external lock or CAS layer | Durable runtime serialization is per plugin runtime instance and no cross-process lock or CAS layer is implemented | Preserve the documented single-runtime boundary until a separate locking/CAS change is accepted | high | none |

## Outputs

- Project follow-up changes: none; project-local findings were fixed in scope or remain archive/runtime-boundary evidence.
- `opencode-dev-kit` proposals/changes: `retro-enable-autopilot-worker-dispatch-01-worker-dispatch-option-diagnostics-remain-a-reus`.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Evidence reviewed, material implementation and reviewer findings were fixed in scope, validation passed, the remaining live-enable diagnostics item is routed to a follow-up change, and protected Autopilot ledger state was not manually mutated.
- Approver, if skipped: none
