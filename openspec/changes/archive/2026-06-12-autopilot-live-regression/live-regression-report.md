# Live Regression Report

Status: Completed current live-regression evidence refresh on 2026-06-12. Ready to land as regression evidence; `openspec/changes/autopilot-live-regression/automation/task.json` remains `Ready` because protected plugin-owned state is not mutated by this evidence report or by the current runtime-deferred Autopilot control-plane calls.

## Turn 1 `/autopilot` Smoke

- Result: `openspec-autopilot` was loaded and the first substantive control-plane action called `autopilot_run_next` with no explicit `changeId` or `taskId` scope, matching the empty command-argument contract.
- Output: current public Autopilot output shape was captured with `reasonCode`, `taskSummaries`, `nextActions`, `loopGuard`, and `selection`.
- Interpretation: command/skill/plugin/tool availability is good. The deterministic primary task is `autopilot-live-regression`; runtime claim/dispatch and protected ledger mutation remain intentionally deferred, so the safe handoff is manual direct OpenSpec work without repeating equivalent no-progress `autopilot_run_next` calls. This run used the current explicit `/autopilot` command session as smoke evidence; it does not claim separate process-restart proof beyond `OPENCODE_PURE` being unset and the project plugin tools being available.

```json
{
  "outcome": "idle",
  "tasksStarted": [],
  "tasksAdvanced": [],
  "mrsWaiting": [],
  "questions": [],
  "blockers": [],
  "nextRecommendedCall": null,
  "summary": "MVP autopilot inspected 1 task ledger(s). Valid Ready work exists, but worker dispatch, MR sync, and ledger mutation are intentionally deferred.",
  "reasonCode": "ready_runtime_deferred",
  "taskSummaries": [
    {
      "taskId": "autopilot-live-regression",
      "path": "openspec/changes/autopilot-live-regression/automation/task.json",
      "taskType": "research",
      "status": "Ready",
      "valid": true,
      "mrStatus": "not-required",
      "actionability": "runtime_deferred",
      "reasonCode": "ready_runtime_deferred"
    }
  ],
  "nextActions": [
    {
      "label": "Continue selected OpenSpec change manually",
      "kind": "manual_review",
      "reason": "Valid Ready work exists, but MVP runtime claim/dispatch and ledger mutation are deferred.",
      "safety": "safe",
      "expectedResult": "Use selection.selectedTaskId and selection.candidates to continue the deterministic primary slice without repeating autopilot_run_next."
    }
  ],
  "loopGuard": {
    "repeatedNoProgress": true,
    "equivalentCall": "autopilot_run_next",
    "suppressRepeatRecommendation": true
  },
  "selection": {
    "mode": "serial_default",
    "selectedTaskId": "autopilot-live-regression",
    "maxImplementationClaims": 1,
    "candidates": [
      {
        "taskId": "autopilot-live-regression",
        "path": "openspec/changes/autopilot-live-regression/automation/task.json",
        "rank": 1,
        "selected": true,
        "selectionReason": "selected_primary",
        "parallelDecision": "not_evaluated"
      }
    ]
  }
}
```

## Scenario Matrix

| Tier | Scenario | Status | Evidence | Finding/Follow-Up |
| --- | --- | --- | --- | --- |
| P0 | Setup and command context | completed | Worktree was clean before edits; `OPENCODE_PURE` produced no value; explicit `/autopilot` command expansion loaded the skill and plugin tools. | none |
| P0 | Command smoke and `autopilot_run_next` | completed | `autopilot_run_next` returned current JSON shape with `reasonCode: "ready_runtime_deferred"`, one valid Ready research task summary, `nextActions[0].label: "Continue selected OpenSpec change manually"`, `loopGuard.suppressRepeatRecommendation: true`, and `selection.selectedTaskId: "autopilot-live-regression"`. | Safe MVP escape hatch works; no new follow-up required. |
| P0 | Core tools status/collect/stop | completed | `autopilot_status` inspected one valid Ready research ledger and returned `ready_runtime_deferred`; `autopilot_collect` returned `collect_deferred`; `autopilot_stop` returned `stop_no_active_state`. All returned empty `questions`, `blockers`, `tasksStarted`, `tasksAdvanced`, and `mrsWaiting`. | No unsafe loop or destructive action observed. |
| P0 | Current ledger discovery | completed | Autopilot inspected one ledger: `openspec/changes/autopilot-live-regression/automation/task.json`. `npm run autopilot:evidence -- --change autopilot-live-regression --mode collect` also found one valid Ready research ledger. `.autopilot/**` and `.autopilot/prototype/tasks/*.json` had no files. | Missing real provider/worker state remains a P2 residual risk, not a regression blocker. |
| P0 | Baseline validation | completed | `npm run validate`, `npm test`, `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json`, and `openspec validate --all` passed on 2026-06-12. | `npm run validate` reported one existing warning about top-level allow in `opencode.json`; not changed in this regression scope. |
| P0 | Evidence pack collect | completed | `npm run autopilot:evidence -- --change autopilot-live-regression --mode collect` returned schemaVersion 1, one valid Ready research ledger, planned validation commands, planned tool-smoke scenario, freshness unknown before this report refresh, and missing retrospective before this update. | This report and `retrospective.md` close the missing freshness/retro evidence. |
| P1 | Bugfix workflow | completed | `npm test` now includes passing invalid fixture coverage for `invalid bugfix missing reproduction gate` and `invalid bugfix prose-only reproduction gate`. | Historical missing gate was fixed and archived under `2026-06-12-tighten-autopilot-ledger-type-gates`. |
| P1 | Research workflow | completed | Regression ledger is `taskType: "research"`, status `Ready`, valid, `mrStatus: "not-required"`; validator accepts `valid-research` and enforces research/planning artifact/no-implementation transitions through tests. | none |
| P1 | Small feature workflow | completed with limitation | `npm test` validates feature ledgers, test-first gates, reviewer gates, and MR wait fixtures. Live `autopilot_run_next` did not claim or advance the Ready ledger and instead returned a manual handoff. | For a single small feature, `openspec-apply-change` or direct work remains more efficient until runtime claim/dispatch is active in normal sessions. |
| P1 | Large epic workflow | completed with MVP boundary | Current output exposes deterministic serial selection, `maxImplementationClaims: 1`, and no worker starts. Tests cover serial selection and guarded parallel implementation harness behavior, but live provider-backed dispatch is not available. | Prompt-only `orchestrator` should not fake Autopilot state; use follow-up runtime work only when real plugin-owned state is available. |
| P1 | Codebase exploration routing | completed | Skill and command routing say not to use Autopilot for casual exploration, one obvious small edit, `next-step` discovery, direct `openspec-apply-change`, or non-OpenSpec `orchestrator` work unless explicitly invoked. This session used Autopilot only because it was explicitly invoked. | none |
| P1 | Routing escape hatch | completed | `ready_runtime_deferred` returned `nextActions[]` manual handoff and `loopGuard.suppressRepeatRecommendation: true`; no equivalent no-progress `autopilot_run_next` was repeated. `collect_deferred` and `stop_no_active_state` also returned loop guards. | none |
| P1 | Docs/typo workflow | completed | `npm test` validates `valid-typo` cheap `autoMinimalAnalyze`, `testDecision: not-applicable`, skipped validation reason, secret-scan placeholder, and explicit reviewer skip reasons. | none |
| P1 | Tooling/config workflow | completed | `npm test` now includes invalid fixture coverage for missing tooling deterministic gates, missing config deterministic gates, and config infeasible-reason misuse. | Historical missing gates were fixed and archived under `2026-06-12-tighten-autopilot-ledger-type-gates`. |
| P1 | Performance/protocol-style gates | completed | `npm test` now includes invalid fixture coverage for missing performance evidence, prose-only performance evidence, missing protocol evidence, and empty protocol infeasible reasons. | Historical missing gates were fixed and archived under `2026-06-12-tighten-autopilot-ledger-type-gates`. |
| P1 | Blocker questions | completed static, live skipped | Runtime returned `questions: []` and `blockers: []`, so no user blocker question was asked and `autopilot_answer_blocker` was not called. Tests now cover rejected answer-blocker output and pending-question validation behavior. | No synthetic answer was sent; no new follow-up required. |
| P1 | MR wait/merge gate | completed static, live blocked by no MR | Runtime returned `mrsWaiting: []` and `mrStatus: "not-required"` for the research ledger. Tests cover MR wait output and invalid `Acceptance -> Done` without merge evidence. | Provider/MR credentials and a real MR target remain out of scope. |
| P1 | Stop/pause | completed | `autopilot_stop({ target: "task", id: "autopilot-live-regression" })` returned `reasonCode: "stop_no_active_state"`, no changed active runtime state, and safe status follow-up guidance. | none |
| P2 | Provider/MR/runtime worker behavior | skipped with evidence | No provider credentials, MR target, plugin-owned worker dispatch state, or safe runtime fixture seeding was available. Protected-path policy forbids manual `.autopilot/**` or `automation/**` seeding. | Plugin-owned harness behavior is owned by `openspec/changes/improve-autopilot-runtime-e2e-harness/`; provider-backed MR credentials and remote execution remain accepted out-of-scope residual risk for this regression. |

## Findings

No new actionable findings remain from this refresh. Current runtime-deferred behavior is expected MVP behavior and is explicitly surfaced through `reasonCode`, `taskSummaries`, `nextActions`, `loopGuard`, and `selection`.

Previously reported findings were reconciled:

1. Runtime/e2e harness gap: covered by `openspec/changes/improve-autopilot-runtime-e2e-harness/`, which now has completed tasks and a passed retrospective gate. Live default sessions still report `ready_runtime_deferred`, so this remains a residual runtime capability limit rather than a new regression finding.
2. Blocker answer state-validation gap: covered by `improve-autopilot-runtime-e2e-harness` tests; current live run had no pending blocker question, so no answer envelope was sent.
3. Missing task-type-specific validator gates: fixed and archived under `openspec/changes/archive/2026-06-12-tighten-autopilot-ledger-type-gates/`; `npm test` now proves invalid missing-gate fixtures fail for bugfix, tooling, config, performance, and protocol ledgers.
4. Actionable output shape and escape-hatch guidance: fixed and archived under `openspec/changes/archive/2026-06-12-improve-autopilot-actionable-output/`; current live output includes the required fields.

## Follow-Up Changes

- `openspec/changes/improve-autopilot-runtime-e2e-harness/`: completed active change covering runtime no-op behavior, plugin-owned e2e harness, Ready-ledger selection/claim evidence, blocker answer validation, MR wait, no-auto-merge, and parallel queue visibility. This is the owner for non-provider plugin-owned runtime harness gaps; real provider credentials and MR targets remain outside this regression scope.
- `openspec/changes/archive/2026-06-12-tighten-autopilot-ledger-type-gates/`: archived fix for bugfix reproduction, tooling/config deterministic gates, performance evidence gates, and protocol evidence gates.
- `openspec/changes/archive/2026-06-12-improve-autopilot-actionable-output/`: archived fix for reason-coded outputs, task actionability summaries, `nextActions[]`, loop guards, and selection evidence.
- `openspec/changes/add-autopilot-evidence-pack-workflow/`: completed active change for deterministic evidence-pack/report workflow.
- No new follow-up change was created by this refresh because the current evidence either passes or maps to existing completed/archived work.

## Validation

- `git status --short`: clean before report edits.
- `OPENCODE_PURE`: unset in the current shell environment.
- `npm run autopilot:evidence -- --change autopilot-live-regression --mode collect`: passed read-only on 2026-06-12; found one valid Ready research ledger and planned validation/reviewer/freshness evidence.
- `npm run validate`: passed on 2026-06-12 with `OK: skills=34 agents=12 markdown=109 warnings=1`; warning is the existing broad top-level allow in `opencode.json`.
- `npm test`: passed on 2026-06-12, including library, validation-script, code-quality inventory, Autopilot ledger/contract/bundle/instruction/freshness/output/collect/control, retro-gate, evidence-pack, and pre-push tests.
- `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json`: passed on 2026-06-12 with `valid: true`, no errors, no warnings.
- `openspec validate --all`: passed on 2026-06-12 with 8 items passed and 0 failed.
- `autopilot_status`: inspected one valid Ready research ledger, returned `reasonCode: "ready_runtime_deferred"`, selected `autopilot-live-regression`, and recommended manual continuation without repeating equivalent no-progress calls.
- `autopilot_collect`: returned `reasonCode: "collect_deferred"`; no scoped plugin-owned worker report was available for legal collection.
- `autopilot_stop`: returned `reasonCode: "stop_no_active_state"`; no active MVP runtime state was changed.
- `npm run openspec:retro-followups -- autopilot-live-regression`: passed on 2026-06-12 with no generated changes and no retrospective update required.
- `npm run openspec:retro-gate -- autopilot-live-regression`: passed on 2026-06-12 with `archiveAllowed: true`.

## Reviewer Gates

- `instruction-artifact-reviewer`: skipped for this refresh because no skill, agent, command, README routing, or instruction artifact was changed.
- `test-coverage-reviewer`: skipped for this refresh because no code or tests were changed; existing `npm test` coverage proves the previously reported gate fixes.
- `code-quality-reviewer`: skipped for this refresh because no implementation code was changed.
- `deployment-config-reviewer`: skipped because this refresh did not change deployment config, schema, service process model, installer behavior, or operational configuration.

## Usability Assessment

- Autopilot is useful as a process-control contract for explicit `/autopilot`, ready OpenSpec ledgers, strict phase/reviewer/MR gate visibility, and deterministic selection evidence.
- Autopilot is currently less useful than `openspec-apply-change` or direct work for a single small feature when `reasonCode: "ready_runtime_deferred"` is returned, because no worker is claimed or dispatched in the live default path.
- Autopilot is safer than prompt-only `orchestrator` for future large epics only when plugin-owned runtime state can claim tasks, collect reports, preserve legal transitions, and expose MR/blocker waits without manual protected-state edits.
- `next-step` remains better for open-ended discovery when there is no ready ledger or when the user did not explicitly invoke Autopilot.
- The escape hatch is now understandable: `nextActions[]` names manual continuation, `selection` identifies the deterministic primary task, and `loopGuard` prevents repeated no-progress calls.

## Residual Risks

- P2 provider/MR behavior was not executed because credentials, MR target, and safe provider-backed state were unavailable.
- Live worker dispatch, branch/worktree creation, provider MR sync, and real multi-worker execution remain unproven outside deterministic harness tests.
- The current regression did not edit protected `automation/task.json`; that ledger remains `Ready` by plugin-owned-state policy.
- `npm run validate` still reports one existing broad-permission warning in `opencode.json`; this regression did not change OpenCode permission config.

## Ready-To-Land Status

Ready to land as current regression evidence. The `automation/task.json` ledger remains `Ready` because protected plugin-owned state is not mutated by this evidence report or by the current MVP runtime-deferred Autopilot output. Retrospective follow-up generation produced no new changes, and the retrospective archive gate passed with `archiveAllowed: true`.
