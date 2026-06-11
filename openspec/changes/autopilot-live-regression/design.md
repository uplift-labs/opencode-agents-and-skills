# Design: Autopilot Live Regression And E2E Evaluation

## Test Strategy

Run the regression from a fresh OpenCode session after restart so config-time artifacts are reloaded. Use a two-turn launch so slash-command routing is actually tested:

1. First user turn: submit exactly `/autopilot` and capture the first substantive model/tool behavior.
2. Second user turn: paste the continuation prompt from `live-regression-prompt.md` and continue the full regression.

Treat the session as a real user would:

1. Use `autopilot_status`, `autopilot_collect`, `autopilot_answer_blocker`, and `autopilot_stop` when scenarios require them.
2. Exercise the task ledger validator and the plugin's ledger discovery against this prepared change.
3. Evaluate task-type usability for bugfix, research, small feature, large epic, codebase exploration, docs/typo, config/tooling, performance/protocol-style gates, blockers, and MR-wait behavior.
4. Track every confirmed defect or usability issue as an OpenSpec follow-up change unless the user separately approves direct code/instruction fixes.

## Scenario Tiers

| Tier | Scope | Stop/Skip Rule |
| --- | --- | --- |
| P0 | Fresh `/autopilot` command smoke, `autopilot_run_next`, status/collect/stop, current regression ledger discovery, baseline validation, durable report. | Must complete or record a blocker. |
| P1 | Task-type scenarios using static fixtures, validator output, existing source/config evidence, and any plugin-owned runtime output that is available. | If true live e2e needs protected-path writes or unimplemented plugin seeding, record a blocked scenario and create a follow-up change. |
| P2 | MR/provider checks, plugin-owned prototype ledgers, real branch/MR behavior, and multi-worker runtime dispatch. | Run only when credentials/tools/state are safely available; otherwise record residual risk. |

Default write policy: update `openspec/changes/autopilot-live-regression/live-regression-report.md` and create/update OpenSpec follow-up changes only. Do not edit `.opencode/**`, `tools/**`, `README.md`, package/config files, or runtime implementation code unless the user separately approves that fix scope.

## Scenario Families

| Family | Purpose |
| --- | --- |
| Startup and command smoke | Prove `/autopilot` command, skill trigger, plugin loading, and `autopilot_run_next` availability. |
| Ledger discovery | Prove `openspec/changes/*/automation/task.json` discovery and inspect `.autopilot/prototype/tasks/*.json` only if plugin-owned state already exists. |
| Task type gates | Prove strict phase/test/reviewer semantics are understandable and enforced by validator evidence. |
| Bugfix workflow | Check reproduction/characterization-first guidance and whether Autopilot feels useful for defects. |
| Research workflow | Check evidence artifact expectations and no-product-code behavior. |
| Small feature workflow | Check whether Autopilot adds value or too much friction for a small scoped feature. |
| Large epic workflow | Check whether ready ledgers/queues and parallel tracks are easier than prompt-only orchestration. |
| Codebase exploration | Confirm Autopilot does not over-trigger for casual exploration and routes to `next-step` or direct search when better. |
| Blocker and questions | Confirm only real blockers produce user questions with recommended options. |
| MR wait and stop | Confirm MR/merge and stop behavior is understandable and does not loop. |
| Follow-up tracking | Confirm findings become OpenSpec changes rather than loose final-message backlog. |

## Evidence Rules

- Use source, config, schema, tests, plugin output, command output, and fresh-session behavior as primary evidence.
- Record exact commands, tool outputs, observed UX friction, and screenshots/log references only when privacy-safe.
- Store durable results in `openspec/changes/autopilot-live-regression/live-regression-report.md`.
- Do not inspect or emit secrets.
- Do not manually write protected Autopilot paths such as `.autopilot/**` or `openspec/changes/*/automation/**`; missing plugin-owned setup is a finding, not permission to bypass policy.
- Do not push, merge, or deploy during regression.

## Finding Triage

| Finding Type | Tracking |
| --- | --- |
| Runtime/load bug | Create or update an OpenSpec change under `openspec/changes/fix-autopilot-runtime-*`. |
| Validator/schema bug | Create or update an OpenSpec change under `openspec/changes/fix-autopilot-ledger-*`. |
| Skill/routing usability issue | Create or update an OpenSpec change under `openspec/changes/tune-autopilot-instructions-*`. |
| Parallelism/workflow gap | Create or update an OpenSpec change under `openspec/changes/improve-autopilot-orchestration-*`. |
| Documentation/install gap | Create or update an OpenSpec change under `openspec/changes/document-autopilot-*`. |

Group related findings; do not create one change per tiny note.

## Risks

- The MVP plugin may be loaded only after OpenCode restart; a running session may not see it.
- The MVP plugin intentionally returns safe no-op outputs for dispatch/mutation, so regression must distinguish expected MVP limitations from defects.
- Full MR integration may require provider credentials or remote permissions and should stop as a blocker if unavailable.
