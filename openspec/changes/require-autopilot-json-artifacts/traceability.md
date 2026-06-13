# Traceability: Require Autopilot JSON Artifacts

## Source Findings

| Finding | Evidence | Requirement | Tasks |
| --- | --- | --- | --- |
| Retrospective gate parses Markdown | `tools/openspec-retro-gate.ts` reads `retrospective.md` sections/tables | Retrospective Source Of Truth Is `automation/retro.json` | Tests First, Implementation |
| Follow-up generator writes Markdown retrospective outputs | `tools/openspec-retro-followups.ts` reads/writes `retrospective.md` | Retrospective Source Of Truth Is `automation/retro.json` | Tests First, Implementation |
| Skills teach new changes to create `retrospective.md` | `openspec-propose`, `openspec-apply-change`, and `openspec-archive-change` mention `retrospective.md` | Autopilot Automation Artifacts Are JSON | Implementation, Review Gates |
| Existing Autopilot ledgers are JSON | `automation/task.json` establishes the pattern | Autopilot Automation Artifacts Are JSON | Implementation |
| User policy requires JSON wrappers | Session instruction: Autopilot artifacts must be JSON; Markdown only for OpenSpec files | Canonical OpenSpec Documents May Remain Markdown | All tasks |

## Validation Mapping

| Validation | Covers |
| --- | --- |
| `retro.json` schema tests | Retrospective shape, archive decision, findings, follow-up routing |
| Legacy migration tests | Transition from `retrospective.md` without preserving Markdown as source of truth |
| Validator artifact-format tests | No new Autopilot Markdown wrappers |
| Instruction drift tests | Skills and README no longer require `retrospective.md` |
| `npm run openspec:retro-gate -- <change>` | JSON archive gate behavior |
| `npm run validate` / `npm test` / `npm run openspec:validate` | Repository-wide regression coverage |
