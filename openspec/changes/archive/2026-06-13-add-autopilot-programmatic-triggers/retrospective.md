# Retrospective: add-autopilot-programmatic-triggers

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, programmatic-trigger spec, traceability, tasks, README Autopilot plugin guidance, and `openspec-autopilot` skill guidance.
- Tool outputs / validation: focused trigger, scheduler, protected-path guard, bundle smoke, and instruction drift tests; `npm run validate`; `npm test`; `npm run openspec:validate`; `npm run autopilot:validate -- openspec/changes/add-autopilot-programmatic-triggers/automation/task.json`; and `npm run autopilot:check -- --level standard --change add-autopilot-programmatic-triggers` passed on 2026-06-13. The standard check had warning-only freshness `unknown` advisory evidence and no blocking failures.
- Reviewer gates: `code-quality-reviewer`, `test-coverage-reviewer`, `instruction-artifact-reviewer`, and OpenSpec architecture/consistency review found material issues across multiple waves; final rechecks found no implementation blockers after fixes.
- Runtime/plugin evidence: source-equivalent bundle smoke covered server `event`, `tool.execute.before`, `tool.execute.after`, stale runtime revalidation, worker marker collection, workspace/worktree scoped stops, autonomous run-next safety, and TUI status/check/run/stop fallback with fake OpenCode APIs.

## Problems Found

| Problem | Evidence | Impact | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- |
| Protected-path guard had shell and tool-alias bypasses | Reviewer probes found compound shell, `cwd`, unknown mutating path keys, and shell-like command aliases could bypass early guard logic | Model-facing tools could mutate plugin-owned `.autopilot/**` or `openspec/changes/*/automation/**` paths | Harden guard for shell control syntax, `cwd`/`workdir`, known Serena mutators, unknown mutating path strings, and shell-like command aliases; add focused and bundle smoke tests | high | none |
| Autonomous event run-next could repeat after no-progress or stale evidence | Reviewers found progress evidence was not refreshed after programmatic run-next and non-progress outputs could still be treated as safe in early iterations | Event-sourced autonomous mode could loop or continue after wait/blocker/no-progress states | Require progress-backed last output, refresh `activeRun.lastRunNextOutput` after run-next, and add repeated-idle suppression tests | high | none |
| Runtime-owned queued jobs were only validated at enqueue time | OpenSpec review found debounced jobs could execute after ownership, blockers, locks, or report-consumed state changed | Stale collect/stop/run-next jobs could reach the controller after prerequisites expired | Revalidate runtime-owned and claim-capable jobs immediately before execution and suppress stale jobs with logs | high | none |
| Scheduler ordering and failure semantics were implicit | Code review found sequential due jobs were key/insertion ordered and a failed job could drop later jobs | Blocker status follow-ups and delayed jobs could be lost or run in surprising order | Order due jobs by `dueAt` then key, drain later due jobs after failures, and add regression tests | high | none |
| OpenSpec/docs overstated permission and failure behavior | Reviewers found permission replies implied stop/blocker handling and worker `session.error` failure handling despite MVP status-only/deferred behavior | Archived docs could promise unimplemented behavior | Narrow permission replies to MVP status-only, explicitly defer worker failure handling, clarify cheap check helper path, and add spec scenarios | high | none |
| Trigger/plugin files approached size and responsibility limits | Code-quality inventory reported changed plugin/classifier/tests in attention band | Future changes could cross split-candidate thresholds and slow review | Extract worker marker parsing now; defer further TUI/server/classifier splitting until a future growth point | medium | none |

## Outputs

- Project follow-up changes: none; material findings were fixed in this change and remaining file-size/live-loader concerns are nonblocking residual risks.
- `opencode-dev-kit` proposals/changes: none; reusable Autopilot trigger behavior and safety guidance were implemented in this repository-owned change.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Evidence reviewed, material reviewer findings fixed in scope, final reviewer rechecks found no implementation blockers, validation passed, OpenSpec docs/spec/tasks were synchronized, and no actionable follow-up findings remain.
- Approver, if skipped: none
