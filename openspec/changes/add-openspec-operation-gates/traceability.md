# Traceability: Add OpenSpec Operation Gates

## Proposal Mapping

| Suggested Gate | Requirement | Task Group |
| --- | --- | --- |
| Propose gate | Proposal And Apply Gates Protect Scope Quality | Tests First: Operation Coverage, Implementation |
| Apply gate | Proposal And Apply Gates Protect Scope Quality | Tests First: Operation Coverage, Implementation |
| Task update gate | Task And Ledger Gates Prevent Stale Or Unsafe Work | Tests First: Operation Coverage, Implementation |
| Ledger materialize gate | Task And Ledger Gates Prevent Stale Or Unsafe Work | Tests First: Operation Coverage, Implementation |
| Worker dispatch gate | Worker Dispatch And Collect Gates Require Plugin-Owned Evidence | Tests First: Operation Coverage, Implementation |
| Collect gate | Worker Dispatch And Collect Gates Require Plugin-Owned Evidence | Tests First: Operation Coverage, Implementation |
| Review gate | Review And Acceptance Gates Require Evidence Before Terminal Readiness | Tests First: Operation Coverage, Implementation |
| Acceptance gate | Review And Acceptance Gates Require Evidence Before Terminal Readiness | Tests First: Operation Coverage, Implementation |
| Archive gate | Archive And Post-Archive Gates Close The Lifecycle | Tests First: Operation Coverage, Implementation |
| Post-archive gate | Archive And Post-Archive Gates Close The Lifecycle | Tests First: Operation Coverage, Implementation |
| Prepush gate | Prepush Gate Composes OpenSpec Operation Checks | Tests First: Operation Coverage, Implementation |
| Programmatic trigger checks | Programmatic Triggers Use Operation Gates Safely | Implementation, Operation-Specific Notes |

## Existing Evidence To Reuse

| Existing Tool/Artifact | Reuse |
| --- | --- |
| `openspec validate --all` | OpenSpec structural/spec validation |
| `tools/autopilot-ledger.ts` | Task ledger validation |
| `tools/autopilot-check.ts` | Active changes, ledgers, freshness, prepush levels |
| `tools/autopilot-report-freshness.ts` | Archive-strict freshness checks |
| `tools/openspec-retro-gate.ts` | Existing archive retro behavior to migrate to JSON |
| `tools/pre-push-validate.ts` | Hook integration point |
| `tools/autopilot-programmatic-triggers.ts` | Programmatic trigger integration point |

## Validation Mapping

| Validation | Covers |
| --- | --- |
| Operation fixture tests | Per-operation pass/fail/blocked behavior |
| Shared contract tests | JSON output stability and persistence |
| Trigger tests | Observe-mode cheap gate scheduling without claim-capable work |
| Pre-push tests | Changed-file scoped operation gates |
| `npm run openspec:gate -- --operation prepush` | End-to-end operation registry smoke |
| `npm run prepush:validate` | Hook-level integration |
