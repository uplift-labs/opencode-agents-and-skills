# Retrospective: add-autopilot-auto-parallel-claims

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, runtime spec, tasks, Autopilot skill wording, README routing, runtime/output helpers, plugin behavior, worktree lifecycle helper, and focused tests.
- Tool outputs / validation: `npm run validate`, `npm test`, and `npm run openspec:validate` are recorded as passed in `tasks.md`; `npm run autopilot:validate -- <task-ledger.json>` was not applicable because no Autopilot ledger fixtures were added or modified.
- Reviewer gates: `test-coverage-reviewer`, `code-quality-reviewer`, `instruction-artifact-reviewer`, and `deployment-config-reviewer` are recorded as passed in `tasks.md`; the remaining code-quality note was non-blocking P2/nit scope for attention-band test size and duplicated local helper.
- Autopilot/runtime events: current `/autopilot` handoff returned `reasonCode: active_change_handoff`, selected `add-autopilot-auto-parallel-claims`, and advanced no plugin-owned runtime state because the change has no applicable Autopilot task ledger.

## Problems Found

| Problem | Evidence | Impact | Root Cause | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- | --- |
| Auto policy could be confused with default serial behavior | Proposal and design required explicit `mode: "auto"` or `maxImplementationClaims: "auto"`; tasks record default serial regression coverage and skill/README wording updates | Agents could over-parallelize without repository or user policy | Auto behavior introduced a second execution policy whose opt-in boundary could be implicit without explicit guardrails | Keep explicit auto-mode wording and default serial tests as the guardrail | high | none |
| Parallel starts needed durable worktree evidence | Design required task-to-worktree mapping across selection, `tasksStarted[]`, and active runtime state; tasks record added worktree lifecycle and mapping coverage | Fan-in, MR, archive, and cleanup gates could lose stream ownership | Runtime output initially lacked a durable ownership mapping contract for each started stream | Preserve mapping assertions and worktree lifecycle planning as required evidence | high | none |
| Auto-parallel terminal readiness needed fan-in proof | Runtime spec requires integration evidence before Done/archive-ready; tasks record fan-in validation tests and helpers | Multiple started streams or accepted soft conflicts could appear complete without combined validation | Terminal readiness policy needed explicit combined-validation state for multi-stream outcomes | Keep fan-in validation as an archive and MR readiness prerequisite | high | none |
| Test harness has minor maintainability pressure | `tasks.md` records final code-quality review with residual P2/nit for attention-band test size and duplicated local helper only | Future edits could make the focused tests harder to maintain, but current reviewer gate found no blocker | Feature coverage grew around local helper duplication before a shared test utility became necessary | Treat as non-blocking; split the helper only if future changes expand the same test area | medium | none |

## Outputs

- Project follow-up changes: none; findings were fixed in this change or are non-blocking nits that do not justify separate OpenSpec ceremony.
- `opencode-dev-kit` proposals/changes: none; reusable behavior and routing changes were completed in this repository-owned change.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Evidence reviewed, implementation/docs/reviewer/validation tasks are recorded as complete, no actionable follow-up findings remain, and the retro gate is ready for deterministic validation.
- Approver, if skipped: none
