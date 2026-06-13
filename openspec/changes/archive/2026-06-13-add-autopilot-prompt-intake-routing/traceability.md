# Traceability: Add Autopilot Prompt Intake Routing

## Source Evidence

| Evidence | Finding |
| --- | --- |
| `.opencode/skills/openspec-autopilot/SKILL.md` First Action | Documents empty/exact scope behavior, free-form prompt intake, ambiguity blocking, read-only `autopilot_status`, no unrelated queue advancement, no raw prompt echo/persistence by default, and derived prompt-family/queue-summary evidence. |
| `opencode.json` `command.autopilot.template` | Embeds `$ARGUMENTS`, distinguishes empty/exact `changeId`/`taskId`/intersection-proven combined scopes from ambiguous/free-form prompts, and routes free-form prompt families without sending raw prompt text as tool scope. |
| `tools/autopilot-prompt-intake.ts` | Deterministic source-equivalent helper for the prompt command contract: exact matching, queue snapshot `unknown`/`none`/`present`, status-first planning, conservative task-family routing, sanitized outputs, and no protected-state mutation. |
| `tools/test-autopilot-prompt-intake.ts` | Covers empty/whitespace args, exact `changeId`, exact bare/flagged `taskId`, intersection-proven combined scope, incompatible/ambiguous scopes, queue-derived exact scopes, unknown/present/empty queue semantics, no raw prompt echo, and task-family routing. |
| `tools/test-autopilot-instruction-drift.ts` | Fails when command, skill, or README omit prompt-intake wording for exact scope, ambiguous blocking, read-only queue inspection, no unrelated advancement, no raw prompt echo/persistence, derived fields, or canonical task-family labels. |
| `.opencode/plugins/openspec-autopilot.ts` | Public `autopilot_run_next` remains scoped to `changeId`/`taskId`; the MVP prompt-flow command is instruction-mediated and does not add a raw-prompt plugin tool. |
| `README.md` | Documents manual command packaging, routing map, and skill catalog behavior for `/autopilot <free-form prompt>` intake. |

## Requirement To Task Map

| Requirement | Primary Tasks | Test Evidence | Validation |
| --- | --- | --- | --- |
| Command Arguments Are Resolved Before Autopilot Advancement | Tests First 1-3; Implementation 1-3 | `tools/test-autopilot-prompt-intake.ts`; source-equivalent plan uses `autopilot_status` before free-form handoff and `autopilot_run_next` only for empty/exact scopes | `npm test`, `npm run validate`, `openspec validate --all` |
| Free-Form Autopilot Prompts Have Safe Handoffs | Tests First 3-4; Implementation 3-5; Documentation 1-3 | `tools/test-autopilot-prompt-intake.ts`; `tools/test-autopilot-instruction-drift.ts`; README/skill/command wording | `npm test`, instruction reviewer |
| Prompt Type Classification Is Conservative | Tests First 4; Implementation 4, 6 | Task-family tests cover `bugfix`, `feature`, `refactor`, `research`, `planning`, `docs`, `typo`, `tooling`, `config`, `performance`, `protocol`, unclear, and mixed-risk prompts | `npm test`, test-coverage reviewer |
| Prompt Intake Surfaces Stay Synchronized | Tests First 5; Documentation 1-4 | `tools/test-autopilot-instruction-drift.ts`; `opencode.json`; `README.md`; `.opencode/skills/openspec-autopilot/SKILL.md` | `npm run validate`, `npm test` |

## Scenario Coverage Inventory

| Scenario Family | Covered Today | Change Coverage |
| --- | --- | --- |
| Empty explicit `/autopilot` | Yes | Preserved; helper plans unscoped `autopilot_run_next` only for empty/whitespace args. |
| Existing ledger by exact scope | Yes | Exact ledger task id resolves as `taskId`; queue-derived ledger ids also resolve. |
| Existing active change by exact scope | Yes | Exact change id resolves as `changeId`; queue-derived active-change ids also resolve. |
| Intersection-proven combined scope | Yes | `changeId` + `taskId` is allowed only with task-to-change intersection evidence. |
| Incompatible or ambiguous exact scopes | Yes | Ambiguous/shared/duplicate/unresolved/mixed exact scope args block without `autopilot_run_next`. |
| No ledgers and no active changes with no prompt | Yes | Preserved existing no-argument Autopilot flow. |
| No queue snapshot with free-form prompt | Yes | Queue state is `unknown`; source-equivalent plan recommends read-only `autopilot_status` first. |
| Confirmed empty queue with bug/feature/research prompt | Yes | Confirmed empty queue routes to `openspec-explore`, `openspec-propose`, or direct edit based on conservative family evidence. |
| Existing unrelated queue plus free-form prompt | Yes | Reports queue as present, blocks unrelated queue advancement, and requires exact scope selection or safe handoff. |
| Raw prompt echo/persistence | Yes | Helper and drift tests assert raw free-form prompt text is not emitted by default; docs require derived fields. |
| Active-context `работай` | Yes when context exists | Preserved eligibility boundary; plain `работай` remains outside Autopilot without active context. |

## Boundary Notes

- The MVP `/autopilot` command remains an OpenCode prompt command that enters a normal LLM turn; deterministic enforcement is represented by `tools/autopilot-prompt-intake.ts`, instruction drift tests, and synchronized command/skill/README wording.
- The plugin public tool schema remains scoped to `changeId` and `taskId`; adding a raw-prompt plugin intake tool is out of scope.
- Protected Autopilot state remains plugin-owned; this change does not mutate `.autopilot/**` or `openspec/changes/*/automation/**`.

## Out Of Scope

- Plugin-owned ledger bootstrap from free-form prompts.
- Protected Autopilot file mutation.
- Fuzzy matching between prompts and changes.
- Raw-prompt plugin intake tools.
- Remote MR/provider actions, commits, pushes, merges, deploys, or secret inspection.
