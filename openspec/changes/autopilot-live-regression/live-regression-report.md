# Live Regression Report

Status: Historical regression evidence retained for traceability; not ready to land until the unchecked live smoke tasks are rerun in a restarted OpenCode session and this report is refreshed with current tool output.

## Turn 1 `/autopilot` Smoke

- Result: `openspec-autopilot` was loaded and the first substantive control-plane action called `autopilot_run_next` for `changeId: "autopilot-live-regression"`.
- Output: omitted from a `json` fence because the captured historical output predated the current public Autopilot output contract and would be stale evidence for archive/release. A fresh restarted OpenCode smoke must recapture `reasonCode`, `taskSummaries`, `nextActions`, `loopGuard`, and `selection` before this report can claim live readiness.
- Interpretation: historical command/plugin/tool availability was good. The Ready regression ledger remained plugin-owned/protected state and was not advanced; current runtime behavior must be rechecked after OpenCode reloads the updated command, skill, and plugin files.

## Scenario Matrix

| Tier | Scenario | Status | Evidence | Finding/Follow-Up |
| --- | --- | --- | --- | --- |
| P0 | Command smoke and `autopilot_run_next` | completed | Skill loaded; `autopilot_run_next` returned valid JSON shape with `outcome: "idle"`, empty task arrays, empty blockers/questions, and no recommended next call. | Runtime is available but no-op; tracked by `improve-autopilot-runtime-e2e-harness`. |
| P0 | Core tools status/collect/stop | completed | `autopilot_status` found `total: 1`, `valid: 1`, `byStatus.Ready: 1`, `byTaskType.research: 1`; `autopilot_collect` returned idle/no-op; `autopilot_stop` returned idle/no active state changed. | No unsafe loop or destructive action observed. Runtime no-op coverage tracked by `improve-autopilot-runtime-e2e-harness`. |
| P0 | Current ledger discovery | completed | `openspec/changes/*/automation/task.json` discovery found only `openspec/changes/autopilot-live-regression/automation/task.json`; `.autopilot/prototype/tasks/*.json` had no files. | Missing plugin-owned prototype/e2e harness tracked by `improve-autopilot-runtime-e2e-harness`. |
| P0 | Baseline validation | completed | Initial and final required commands passed: `npm run validate`, `npm test`, `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json`, `openspec validate --all`. | none |
| P1 | Bugfix workflow | completed with finding | Skill requires reproduction/characterization-first; `tools/autopilot-ledger.ts` has no bugfix-specific reproduction check; in-memory `bugfix` probe without reproduction returned `valid: true`. | Missing gate tracked by `tighten-autopilot-ledger-type-gates`. |
| P1 | Research workflow | completed | `fixtures/autopilot-ledger/valid-research.json` validates; validator enforces `Analyze -> Review` only for research/planning with `artifact` and no-implementation reason. Regression ledger itself is `taskType: "research"` with `testDecision: not-applicable` and no product-code implementation. | none |
| P1 | Small feature workflow | completed with limitation | `fixtures/autopilot-ledger/valid-feature.json` validates deep Analyze, test-first implementation, code/test reviewers, and MR wait status. Runtime `autopilot_run_next` did not claim or advance a Ready ledger. | Runtime usefulness for small features is blocked until advancement/dispatch exists; tracked by `improve-autopilot-runtime-e2e-harness`. |
| P1 | Large epic workflow | blocked by MVP runtime | Skill and design route ready OpenSpec queues/parallel workstreams to Autopilot, but plugin source and runtime output show dispatch, collection, and mutation are deferred. No plugin-owned queue/harness state exists. | Tracked by `improve-autopilot-runtime-e2e-harness`. |
| P1 | Codebase exploration routing | completed | Skill says not to use Autopilot for casual codebase questions, one obvious small edit, OpenSpec discovery with no ready work, or non-OpenSpec fan-out; current session only used Autopilot because the user explicitly requested it and a ready ledger exists. | none |
| P1 | Docs/typo workflow | completed | `fixtures/autopilot-ledger/valid-typo.json` validates cheap `autoMinimalAnalyze`, `testDecision: not-applicable`, skipped validation reason, secret-scan placeholder, and explicit reviewer skip reasons. | none |
| P1 | Tooling/config workflow | completed with finding | Validator reviewer routing covers `config` with `deployment-config-reviewer` and `tooling` with code/test reviewers, but in-memory `tooling` and `config` probes without fixture/schema/validator gate evidence returned `valid: true`. | Missing deterministic gate tracked by `tighten-autopilot-ledger-type-gates`. |
| P1 | Performance/protocol-style gates | completed with finding | Validator routes performance/protocol reviewers, but in-memory `performance` and `protocol` probes without benchmark/golden evidence returned `valid: true`. | Missing benchmark/golden gate tracked by `tighten-autopilot-ledger-type-gates`. |
| P1 | Blocker questions | blocked with finding | Runtime calls returned `questions: []` and `blockers: []`; no safe plugin-owned blocker fixture/harness exists. Source evidence shows `autopilot_answer_blocker` accepts an arbitrary envelope and returns `nextRecommendedCall: "autopilot_run_next"` without verifying pending question state. | State-validation and harness gap tracked by `improve-autopilot-runtime-e2e-harness`. |
| P1 | MR wait/merge gate | completed static, runtime blocked | `fixtures/autopilot-ledger/valid-feature.json` uses `mr.status: "waiting-review"`; invalid fixture `invalid-acceptance-done-missing-merge.json` fails with `Acceptance -> Done requires MR merged evidence...`; runtime had no waiting MR ledger/harness to exercise live. | Runtime MR wait harness tracked by `improve-autopilot-runtime-e2e-harness`. |
| P1 | Stop/pause | completed | `autopilot_stop({ target: "task", id: "autopilot-live-regression" })` returned `outcome: "idle"`, empty task arrays/blockers/questions, `nextRecommendedCall: "autopilot_status"`, and summary `No active MVP runtime state was changed for stop target task.` | none |
| P2 | Provider/MR/runtime worker behavior | blocked/skipped | No provider credentials, MR target, plugin-owned worker dispatch state, or safe runtime fixture seeding was available. Protected-path policy forbids manual `.autopilot/**` or `automation/**` seeding. | Tracked by `improve-autopilot-runtime-e2e-harness`; provider/MR credentials remain out of scope. |

## Findings

Freshness note: this section is historical. Some findings are now implemented or partly mitigated by follow-up changes such as `improve-autopilot-runtime-e2e-harness` and `tighten-autopilot-ledger-type-gates`; do not use this report as ready-to-land evidence until the live smoke checklist is rerun and reconciled.

1. Runtime/e2e harness gap.
Evidence: `autopilot_run_next` inspected one valid Ready ledger but returned `idle`; `autopilot_collect` reported worker report collection and legal state mutation are deferred; `.autopilot/prototype/tasks/*.json` does not exist. Impact: true worker dispatch, parallel queues, blocker, and MR wait scenarios cannot be evaluated end-to-end. Recommendation: add a plugin-owned runtime harness and first real advancement/dispatch slice. Confidence: high. Validation path: runtime/plugin tests plus `npm test` and `openspec validate --all`. Follow-up: `openspec/changes/improve-autopilot-runtime-e2e-harness/`.
2. Blocker answer state-validation gap.
Evidence: no runtime blocker questions were returned, and source `.opencode/plugins/openspec-autopilot.ts` accepts any `autopilot_answer_blocker` envelope and reports it accepted without checking pending question state. Impact: can give agents false confidence that a blocker answer was applied. Recommendation: persist/validate pending question IDs or reject unknown answers with a clear failed/blocked result. Confidence: high from source. Validation path: focused plugin tests. Follow-up: `openspec/changes/improve-autopilot-runtime-e2e-harness/`.
3. Missing task-type-specific validator gates.
Evidence: in-memory probes returned `valid: true` for `bugfix`, `tooling`, `config`, `performance`, and `protocol` ledgers that omitted the evidence required by the Autopilot skill/policy. Impact: process gates can appear stricter than they are, especially for bug reproduction, config fixtures, benchmarks, and protocol golden vectors. Recommendation: add failing/valid fixtures and structured evidence checks. Confidence: high. Validation path: `npm test`, targeted `npm run autopilot:validate -- <fixtures>`. Follow-up: `openspec/changes/tighten-autopilot-ledger-type-gates/`.

## Follow-Up Changes

- `openspec/changes/improve-autopilot-runtime-e2e-harness/`: tracks runtime no-op behavior, plugin-owned e2e harness, Ready-ledger advancement clarity, blocker answer validation, MR wait, no-auto-merge, and parallel queue visibility.
- `openspec/changes/tighten-autopilot-ledger-type-gates/`: tracks validator fixtures/rules for bugfix reproduction, tooling/config deterministic gates, performance benchmark/profile evidence, and protocol golden/negative evidence.
- `openspec/changes/improve-autopilot-actionable-output/`: tracks reason-coded outputs, task actionability summaries, multi-action guidance, loop guards, and compact/verbose tool output.
- `openspec/changes/add-autopilot-evidence-pack-workflow/`: tracks deterministic evidence-pack/report workflow to reduce manual commands, transcript tokens, and reviewer-routing gaps.

## Validation

- `git status --short`: clean before regression edits.
- `npm run validate`: passed before follow-up changes and passed after follow-up changes with `OK: skills=34 agents=12 markdown=75 warnings=0`.
- `npm test`: passed before follow-up changes and passed after follow-up changes with `OK: library tests=57`, `OK: code-quality inventory tests=4`, `15 autopilot ledger tests passed`, and `OK: pre-push validation tests=3`.
- `npm run autopilot:validate -- openspec/changes/autopilot-live-regression/automation/task.json`: passed before and after follow-up changes with `valid: true`, no errors, no warnings.
- `openspec validate --all`: passed before follow-up changes for one change; passed after follow-up changes for three changes: `autopilot-live-regression`, `improve-autopilot-runtime-e2e-harness`, and `tighten-autopilot-ledger-type-gates`.
- Targeted fixture validation: valid feature/research/typo fixtures passed; intentionally invalid fixtures failed as expected for missing `testDecision`, silent reviewer skip, and missing MR merge evidence.
- In-memory missing-gate probes: `bugfix`, `tooling`, `config`, `performance`, and `protocol` probes without type-specific evidence returned `valid: true`, confirming the validator gap.

## Reviewer Gates

- `instruction-artifact-reviewer`: skipped. This run did not change `.opencode/**`, `instructions/**`, `README.md`, agents, or skills; instruction changes are tracked for future only if runtime behavior changes.
- `test-coverage-reviewer`: skipped for current regression artifacts. No implementation/test code was changed; test coverage gaps are tracked in `tighten-autopilot-ledger-type-gates` and `improve-autopilot-runtime-e2e-harness`.
- `code-quality-reviewer`: skipped. No runtime/tooling implementation code was changed.
- `deployment-config-reviewer`: skipped. No config/deployment code or schema was changed; config gate gap is tracked as follow-up.

## Usability Assessment

- Autopilot is useful as a process-control contract when the user explicitly invokes `/autopilot`, when a ready OpenSpec ledger exists, or when strict phase/reviewer/MR gates need to be made visible.
- Autopilot is currently less useful than `openspec-apply-change` for a single small feature because runtime advancement and worker dispatch are not implemented.
- Autopilot is better than prompt-only `orchestrator` for future large epics only after plugin-owned runtime state can claim tasks, dispatch workers, collect reports, and preserve legal transitions.
- `next-step` remains better for open-ended discovery when no ready ledger exists; the Autopilot skill correctly says not to over-trigger for casual exploration.
- The MVP output is safe and non-destructive, but the `idle` result for a valid Ready ledger is not actionable enough for an agent workflow.

## Residual Risks

- P2 provider/MR behavior was not executed because credentials, MR target, and safe runtime state were unavailable.
- Worker dispatch, parallelism, blocker answer mutation, and MR sync remain unproven at runtime.
- The current validator may allow additional type-specific evidence gaps beyond the five probes tested.
- The report did not update protected `automation/task.json`; that remains plugin-owned by policy.

## Landing Status

Not ready to land as current live-regression evidence. The unchecked setup/live-smoke/scenario tasks remain intentionally open until a restarted OpenCode session recaptures current Autopilot tool output and reconciles the historical findings with implemented follow-up changes.
