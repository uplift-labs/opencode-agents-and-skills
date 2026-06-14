# Design: Require OpenSpec Change Retrospective Gate

## Goal

Make retrospective learning a required final gate for every OpenSpec change before archive, with durable outputs that improve project-local workflow or reusable `opencode-dev-kit` capabilities.

## Scope Coverage

This change covers the complete requested retro idea:

- Mandatory retrospective before OpenSpec archive.
- Final retrospective task in every OpenSpec change task list.
- Retrospective over the full work context for the specific change.
- Search for quality, speed, wait-time, repetition, and token-consumption problems.
- Search for ideas that optimize skills, agents, instructions, validators, report generation, reviewer gates, and project workflow.
- Durable output as generated OpenSpec follow-up changes in the current project or reusable OpenSpec proposals/changes for `https://github.com/uplift-labs/opencode-dev-kit`.
- No archive until the retro result is recorded, actionable findings have real follow-up changes, or an approved skip reason exists.
- Helper automation so this is enforceable rather than only a reminder.

## Retrospective Artifact

Each change should produce:

```text
openspec/changes/<change-id>/retrospective.md
```

The artifact should be concise but evidence-backed. Suggested sections:

```md
# Retrospective: <change-id>

## Scope

- Change: `<change-id>`
- Work period/context: <sessions, branches, MRs, task ids, or unknown>
- Archive decision: ready | blocked | skipped-with-approval

## Evidence Reviewed

- OpenSpec artifacts:
- Tool outputs / validation:
- Reviewer gates:
- Runtime or orchestration events:
- MR/PR/review context:
- Session notes or reports:

## What Worked

- ...

## Problems Found

| Problem | Evidence | Impact | Root Cause | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- | --- |

## Token And Command Efficiency

- Repeated reads/searches:
- Large outputs:
- Manual synthesis:
- Candidate automation:

## Quality And Review Improvements

- Test gaps:
- Reviewer gaps:
- Acceptance gaps:
- Documentation/spec gaps:

## Skill/Agent/Instruction Improvements

- Skills:
- Agents:
- Instructions:
- Validators/tooling:

## Outputs

- Project follow-up changes:
- `opencode-dev-kit` proposals/changes:
- No findings reason:

## Archive Gate Decision

- Decision: passed | blocked | approved-skip
- Reason:
- Approver, if skipped:
```

## Evidence Sources

The retro should inspect available context proportionally:

| Source | Purpose |
| --- | --- |
| `proposal.md`, `design.md`, `tasks.md`, `specs/**/spec.md` | Planned scope, acceptance criteria, and task quality. |
| `retrospective.md` if rerun | Existing retro decisions and unresolved findings. |
| `live-regression-report.md`, reports, traces, logs | Durable evidence already produced during the change. |
| Validation commands and results | Slow, repeated, flaky, skipped, or missing gates. |
| Reviewer outputs | Missed reviewers, weak feedback loops, repeated findings. |
| Runtime or orchestration outputs/events | No-op loops, unclear next actions, blocker/MR friction, dispatch gaps. |
| Git status/diff/log/MR context when allowed | Scope drift, review delay, branch/MR friction. |
| Session transcript summaries when available and safe | Repeated manual steps, token-heavy operations, wait times. |

If a source is unavailable, the retro should record `unknown` or `unavailable`; it should not invent evidence.

## Problem Categories

The retro should actively look for:

- Repeated commands or repeated reads/searches.
- Large outputs copied into the conversation when summaries would suffice.
- Manual synthesis that could be deterministic automation.
- Long waits for validation, review, MR, credentials, or user decisions.
- Ambiguous tool output or no-progress loops.
- Missing or late tests, reviewers, acceptance criteria, or secret-scan evidence.
- OpenSpec artifact drift between proposal, design, spec, tasks, and implementation.
- Overly broad tasks that should be split.
- Under-scoped tasks that caused follow-up churn.
- Skill/agent/instruction wording that triggered too often, too late, or with too much ceremony.
- Workflow gaps in next actions, blocker questions, MR wait, evidence packs, report generation, or validator gates.
- Token waste from verbose commands, repeated context reconstruction, or missing compact evidence artifacts.

## Output Routing

Retrospective findings should be routed by ownership and reuse value:

| Finding Target | Output |
| --- | --- |
| Current project behavior, docs, tests, or architecture | OpenSpec follow-up change in the current project. |
| Current project-specific workflow only | OpenSpec follow-up change in the current project. |
| Evidence pack, reusable skills, agents, templates, instructions, or OpenCode workflow library | OpenSpec proposal/change intended for `https://github.com/uplift-labs/opencode-dev-kit`. |
| Small local nit with no durable value | Record in retro only; do not create ceremony. |
| No actionable findings | Record `No findings` with evidence reviewed. |

When the current repository is already `opencode-dev-kit`, reusable findings can be tracked as active OpenSpec changes in this repository. In another project, the retro should create a local proposal artifact or handoff note for a future MR to `opencode-dev-kit`, unless cross-repo writes are explicitly approved.

Actionable rows with `Target` `project-local` or `opencode-dev-kit` are not considered routed by prose alone. Before archive, they must be converted into OpenSpec follow-up changes with `proposal.md` and `tasks.md`, and `retrospective.md` `Outputs` must reference those change ids.

## Archive Gate Semantics

Archive is allowed only when one condition is true:

1. `retrospective.md` exists and records `Archive Gate Decision: passed`.
2. `retrospective.md` exists and records `No findings` with evidence reviewed.
3. A user/owner explicitly approves a skip and `retrospective.md` records `Archive Gate Decision: approved-skip`, reason, and approver.

Archive is blocked when:

- `retrospective.md` is missing.
- Retro evidence sources are listed as pending without a reason.
- Concrete actionable findings exist but no generated project follow-up change or `opencode-dev-kit` proposal/change exists and is referenced from `retrospective.md`.
- The retro says it is blocked by missing context, unresolved validation, or unresolved reviewer gate.

## Task Template Rule

Every new OpenSpec `tasks.md` should end with a final section similar to:

```md
## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [ ] Write `retrospective.md` with evidence, problems, root causes, improvements, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] Create or update reusable `opencode-dev-kit` OpenSpec proposals/changes for skill, agent, instruction, validator, or evidence-pack findings.
- [ ] Run `npm run openspec:retro-followups -- <change-id>` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
```

This task should be final because it depends on the completed work context.

## Skill And Workflow Updates

The implementation updates these artifacts:

| Artifact | Required Update |
| --- | --- |
| `openspec-archive-change` skill | Refuse or block archive if retrospective follow-up generation or the retrospective gate is missing, incomplete, or skipped without approval. |
| `openspec-propose` skill | Add final retrospective task to new `tasks.md` artifacts. |
| `openspec-apply-change` skill | Prepare/require retro before handoff to archive. |
| `next-step` skill | Surface pending retro gates as available work after implementation is otherwise complete. |
| Evidence-pack workflow | Generate a retro section, evidence checklist, and candidate follow-up routing. |
| README/OpenSpec guide | Document the archive gate once implementation is ready. |

## Deterministic Helper

The TypeScript helpers make the rule enforceable:

```sh
npm run openspec:retro-followups -- <change-id>
npm run openspec:retro-gate -- <change-id>
```

`openspec:retro-followups` reads actionable `Problems Found` rows from `retrospective.md`, including `Root Cause`, creates or reuses `openspec/changes/<generated-id>/proposal.md`, `tasks.md`, and `specs/<generated-id>/spec.md`, and updates `Outputs` with those ids. It does not mutate unrelated runtime state.

Implemented checks:

- `openspec/changes/<change-id>/tasks.md` includes a final retrospective task or section.
- `openspec/changes/<change-id>/retrospective.md` exists before archive.
- `retrospective.md` includes evidence reviewed and archive decision.
- Findings with `Target` `project-local` or `opencode-dev-kit` include root cause and reference existing OpenSpec follow-up changes with `proposal.md`, `tasks.md`, and a spec delta that preserve the retrospective evidence.
- Findings with `Target` `none` are treated as fixed in scope, intentionally no-follow-up, or not actionable; they must still include evidence, root cause, and confidence.
- Approved skips include reason and approver.

The helper should output stable JSON:

```json
{
  "valid": false,
  "changeId": "example-change",
  "errors": [],
  "warnings": [],
  "archiveAllowed": false
}
```

It should not use model-like summarization. If it cannot determine something, it should report `unknown`.

## OpenCode Dev Kit Proposal Flow

When a retro identifies reusable improvements for `opencode-dev-kit`, the preferred flow is:

1. Record the finding in `retrospective.md` with evidence and impact.
2. Run `npm run openspec:retro-followups -- <change-id>` to create or update an OpenSpec proposal/change in the current `opencode-dev-kit` repository when already working there.
3. If working in another project and cross-repo writes are not approved, create a local handoff proposal artifact that can be copied into a future MR.
4. Use `merge-request-author` only after the user explicitly approves MR creation.

## Reviewer Gates

- `instruction-artifact-reviewer` should review changes to skills, agents, templates, README, or instruction wording.
- `test-coverage-reviewer` should review helper/validator tests.
- `code-quality-reviewer` should review non-trivial TypeScript helper implementation.
- `openspec-consistency-review` should review the policy change before implementation/archive because it changes the OpenSpec lifecycle.

## Risks

- The retro gate can become ceremony if it is too verbose for tiny changes. Mitigation: allow concise evidence-backed `No findings` retros.
- Findings can create too many follow-up changes. Mitigation: group by coherent risk/outcome and avoid isolated nits.
- Cross-repo output can mutate the wrong repository. Mitigation: do not write to `opencode-dev-kit` from another project without explicit approval; create local handoff artifacts instead.
- A prose-only rule may be forgotten. Mitigation: add deterministic follow-up generation plus retro-gate validation and skill/archive enforcement in implementation.
