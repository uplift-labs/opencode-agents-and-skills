# Design: Add Autopilot Prompt Intake Routing

## Current Evidence

- `.opencode/skills/openspec-autopilot/SKILL.md` tells agents to pass explicit OpenSpec `changeId` or Autopilot `taskId` scopes to `autopilot_run_next` and call with no args only when no scope is supplied.
- `opencode.json` embeds `/autopilot` command arguments as `$ARGUMENTS` and asks the agent to map non-empty arguments to `changeId` or `taskId` before calling `autopilot_run_next`.
- `.opencode/plugins/openspec-autopilot.ts` public tools accept only `changeId` and `taskId` scope for `autopilot_run_next`; there is no prompt-intake field or separate intake tool.
- `tools/openspec-autopilot-active-change-queue.ts` discovers active changes by exact `changeId` and checklist state, not by natural-language prompt intent.
- `tools/autopilot-contract.ts` defines task types and phase policies for ledger-backed work, but there is no deterministic bridge from free-form prompt to ledger-backed task type.

## Intake Model

Introduce a deterministic intake layer before any claim-capable run action. The layer classifies command arguments or adjacent explicit Autopilot task text into one of these categories:

| Category | Evidence | First Safe Action |
| --- | --- | --- |
| `empty` | No non-whitespace argument text | Existing `/autopilot` flow: call `autopilot_run_next` with no args |
| `change-scope` | Argument exactly matches an active OpenSpec change id, or an explicit supported `--change <id>` form resolves to one id | Call `autopilot_run_next` with `changeId` |
| `task-scope` | Argument exactly matches one discovered Autopilot ledger task id, or an explicit supported `--task <id>` form resolves to one id | Call `autopilot_run_next` with `taskId` |
| `ambiguous-scope` | The text could refer to more than one discovered scope or mixes incompatible exact ids | Return a blocker/options prompt or safe manual review, without advancing |
| `freeform-prompt` | Non-empty text does not exactly resolve to a scope | Treat as unscheduled user work; inventory queue state read-only and route the prompt to the appropriate workflow |

Scope resolution must be exact and evidence-backed. It must not use fuzzy string similarity, model judgment, or source-code inference to decide that a prompt matches a change.

## Free-Form Prompt Flow

When `freeform-prompt` is detected, Autopilot should not treat the prompt as a `changeId` or `taskId`. It also should not silently advance an unrelated unscoped queue as if it satisfied the prompt.

The recommended safe flow is:

1. Inspect queue state read-only, using `autopilot_status` or a future dedicated intake helper/tool. If no queue snapshot is available, report queue state as `unknown` rather than empty and make read-only status the first action. Avoid claim-capable `autopilot_run_next` until an explicit existing scope is selected or the user clearly asked to continue the current queue independent of the prompt.
2. If an exact matching scope is identified by deterministic evidence, continue through the existing scoped flow.
3. If no exact scope exists and the prompt is a new behavior request, route to `openspec-explore` when requirements are unclear or to `openspec-propose` when the change boundary is stable.
4. If the prompt is a one obvious small edit and the user did not require Autopilot queue ownership beyond the command typo, use direct workflow and report why Autopilot is not the safer path.
5. If the user explicitly requires strict Autopilot queue ownership for new work, first create or approve a normal OpenSpec change/proposal; protected ledger creation remains plugin-owned and must not be simulated by agents.

## Prompt Type Routing

Prompt type classification is routing evidence only until a valid ledger or accepted OpenSpec change exists.

| Prompt Evidence | Suggested Route |
| --- | --- |
| Bug/error/regression/repro request | `openspec-explore` for reproduction evidence, then `openspec-propose` or direct `openspec-apply-change` if a matching accepted change exists |
| Feature/capability request | `openspec-propose` when stable, `openspec-explore` first when requirements are unclear |
| Research/investigation/planning request | `openspec-explore` or a `research`/`planning` OpenSpec change; no product-code implementation without explicit follow-up |
| Docs/typo request | Direct edit for one obvious small change, or `openspec-propose`/`openspec-apply-change` when tracked OpenSpec evidence is required |
| Tooling/config/performance/protocol request | Route through the matching specialist skill and OpenSpec proposal/apply flow before Autopilot ledger gates |
| Unclear or mixed request | Use `adaptive-delivery` or `openspec-explore`; do not create an Autopilot task type by guesswork |

## Output And Instruction Surfaces

Implementation should keep these surfaces synchronized:

- `/autopilot` command wording in `opencode.json`.
- `openspec-autopilot` skill eligibility, first-action, and escape-hatch sections.
- README Routing Map and Skill Catalog bullets.
- TypeScript contract or drift tests that check the routing phrases.
- Any future helper/tool output fields for intake category, resolved scope, queue state, and recommended workflow.

If a helper or tool emits prompt-intake evidence, it should avoid echoing raw prompt text unless explicitly requested for a user-visible OpenSpec artifact. Derived fields such as `intakeCategory`, `resolvedScope`, `taskFamily`, `recommendedWorkflow`, `queueState`, `queueSummary`, and `unrelatedQueuePolicy` are enough for most automation.

The MVP command path remains an OpenCode prompt command that enters a normal LLM turn. This change adds a deterministic source-equivalent TypeScript helper and instruction drift tests for that prompt command contract; it does not add a new plugin-owned raw-prompt intake tool. The plugin tool schema remains scoped to `changeId` and `taskId`, which prevents raw free-form prompt text from becoming a plugin tool field by default.

## Alternatives Considered

- Treat every `/autopilot <text>` argument as `changeId`: rejected because it turns natural-language prompts into false missing-scope errors.
- Always call unscoped `autopilot_run_next` first: rejected for free-form prompts because future claim-capable runtime could advance an unrelated queue.
- Add fuzzy prompt-to-change matching: rejected because it is not deterministic and can route to the wrong change.
- Auto-create protected ledgers from prompt text: rejected for this change because protected Autopilot state must remain plugin-owned and requires a separate safe bootstrap contract if implemented later.

## Risks

- More routing branches can increase instruction complexity; deterministic tests should keep wording compact and synchronized.
- Exact-only scope matching may require the user or command wrapper to provide a real id; this is safer than silently guessing.
- If a repository lacks OpenSpec, free-form prompt routing must not create OpenSpec ceremony unless the user explicitly requested it or the task risk justifies it through existing workflow rules.
