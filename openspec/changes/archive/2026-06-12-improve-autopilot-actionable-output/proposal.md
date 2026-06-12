# Proposal: Improve Autopilot Actionable Output

## Why

The live regression showed that Autopilot tool outputs are safe but not always actionable for an agent workflow. `autopilot_run_next` returned `outcome: "idle"` for a valid Ready ledger, while `autopilot_status` recommended `autopilot_run_next`. That combination can create a no-progress loop and forces the agent to infer whether there is no work, deferred MVP capability, a missing worker, or an actual blocker.

The output also lacks stable reason codes, per-task actionability, and multiple next actions. The agent had to spend extra commands and tokens reading source, fixtures, and reports to decide what happened.

## What Changes

- Add reason-coded output for no-progress and blocked states.
- Add per-task actionability summaries so agents can distinguish actionable work, invalid ledgers, MR waits, and runtime-deferred tasks.
- Add `nextActions[]` with safe tool calls or human-readable actions, replacing one ambiguous `nextRecommendedCall` as the primary guidance while preserving existing top-level fields for current consumers.
- Add loop-guard metadata so repeated no-progress calls do not keep recommending the same tool.
- Add compact/verbose output modes so default outputs stay token-efficient while detailed evidence remains available when needed.

## Non-Goals

- Do not implement worker dispatch or ledger mutation in this change.
- Do not replace the ledger validator.
- Do not create report generation or validation execution; that is tracked by `add-autopilot-evidence-pack-workflow`.
- Do not change protected-path ownership.

## Evidence

- Turn 1 `/autopilot` returned `outcome: "idle"` for one valid Ready ledger and no next action.
- `autopilot_status` returned `nextRecommendedCall: "autopilot_run_next"`, but `autopilot_run_next` had already reported no runtime advancement.
- Source evidence shows `.opencode/plugins/openspec-autopilot.ts` currently returns coarse outcomes and no per-task actionability reason.

## Impact

- Agents can stop earlier with a correct explanation instead of spending tokens on source archaeology.
- Users get clearer blockers and no-progress reasons.
- Future report/evidence-pack automation can consume stable reason codes instead of parsing prose summaries.

## Validation

- Add focused plugin output contract tests before implementation.
- Keep `npm run validate`, `npm test`, `npm run autopilot:validate -- <task-ledger.json>`, and `openspec validate --all` green.
