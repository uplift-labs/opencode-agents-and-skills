# Traceability: Activate Autopilot Runtime Liveness

## Audit Finding Matrix

| Finding | Evidence | Requirement | Tasks |
| --- | --- | --- | --- |
| Stale Ready ledger selected for completed change | `autopilot_status` selected `enable-autopilot-worker-dispatch`; its `tasks.md` is fully checked while `automation/task.json` is `Ready` | Autopilot Queues Exclude Stale Completed Work | Tests/Implementation: Queue Liveness |
| Active unfinished change can be hidden by any existing ledger | `readAutopilotQueueSummaries()` falls back to active changes only when no ledgers exist | Autopilot Queues Exclude Stale Completed Work | Tests/Implementation: Queue Liveness |
| Prompt intake helper is test-only | `tools/autopilot-prompt-intake.ts` is consumed by tests but not plugin/controller runtime | Prompt Intake Is Code-Backed Before Claim-Capable Advancement | Tests/Implementation: Prompt Intake Runtime |
| Worker dispatch is implemented but not live-configured by installer | Plugin enables runtime store only with `workerDispatch.enabled`; installer installs skills/agents only | Live Worker Dispatch Is Installed As A Complete Opt-In Bundle | Tests/Implementation: Live Worker Dispatch Bundle |
| Controlled/autonomous branches rely on non-durable evidence | Trigger code expects blocker, permission, wait, and last-run-next evidence not present in durable snapshot | Controlled And Autonomous Triggers Require Durable Ownership Evidence | Tests/Implementation: Durable Trigger Evidence |
| TUI classifier and dispatch wrapper are production-dead or redundant | `classifyAutopilotTuiCommand()` and adapter `dispatch()` have no production consumer | Dormant Runtime APIs Are Removed Or Classified | Tests/Implementation: Dead And Dormant API Cleanup |
| Contract-only exports are ambiguous | `autopilotLedgerPolicy`, `autopilotOutputContract`, `summarizeSchedulerSnapshot`, and in-memory runtime store have no production consumer | Dormant Runtime APIs Are Removed Or Classified | Tests/Implementation: Dead And Dormant API Cleanup |
| Autopilot skill can be present without plugin bundle | `install:global` does not install plugin, command, dependency, or options | Autopilot Discovery Surfaces Stay Complete | Documentation, Discovery, And Routing |

## Validation Mapping

| Validation | Covers |
| --- | --- |
| Focused queue-liveness tests | Stale ledger classification, active-change fallback, selection safety |
| Prompt-intake plugin/contract tests | Free-form prompt safety, exact-scope routing, ambiguity handling, no raw prompt echo |
| Installer dry-run/config tests | Complete live bundle, opt-in worker dispatch, backup/no-overwrite behavior |
| Runtime-store and trigger tests | Durable ownership evidence, controlled event handling, autonomous prerequisites |
| Reachability/symbol cleanup tests | Dead API removal or explicit contract/test classification |
| `npm run validate` | Artifact structure, README/catalog/profile/drift checks |
| `npm test` | Full repository regression coverage |
| `npm run openspec:validate` | OpenSpec proposal/spec/task validity |
| `npm run autopilot:check -- --level cheap` | Current active queue and ledger diagnostics |
| `npm run autopilot:check -- --level prepush` | Pre-handoff Autopilot readiness gate |

## Reviewer Gates

| Reviewer | Trigger |
| --- | --- |
| `code-quality-reviewer` | Queue, prompt-intake, runtime-store, installer, and cleanup implementation |
| `test-coverage-reviewer` | New behavior-changing Autopilot tests and liveness gates |
| `instruction-artifact-reviewer` | README, skill, command, profile, or routing updates |
| `deployment-config-reviewer` | Installer, config, plugin options, dependency, and live-runtime packaging |
| `performance-reliability-reviewer` | Autonomous event scheduling, cooldown, runtime ownership, or queue hot-path changes |
