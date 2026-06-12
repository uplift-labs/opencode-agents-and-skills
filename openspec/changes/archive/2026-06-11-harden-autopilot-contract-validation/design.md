# Design: Harden Autopilot Contract Validation

## Goals

- Prevent drift between Autopilot skill instructions, plugin tool schemas, TypeScript helpers, package scripts, README/manual install docs, and OpenSpec evidence reports.
- Keep Autopilot contract checks deterministic, local, and TypeScript-first.
- Preserve current MVP safety behavior while making future runtime expansion easier to review.
- Complement existing runtime and ledger-gate changes without duplicating their implementation scope.

## Relationship To Existing Changes

| Change | Relationship |
| --- | --- |
| `improve-autopilot-runtime-e2e-harness` | Owns real runtime state, Ready advancement, blocker persistence, MR wait, stop behavior, and parallel queue behavior. This change only proves public contract synchronization around those tools. |
| `tighten-autopilot-ledger-type-gates` | Owns task-type-specific evidence gates. This change can provide shared contract values and drift tests that the validator imports. |
| `improve-autopilot-actionable-output` | Implemented the current output shape. This change adds guardrails so future output shape changes update plugin tests, skill docs, and report freshness. |
| `add-autopilot-evidence-pack-workflow` | Owns broader report/evidence generation. This change may add minimal freshness checks that the evidence pack later uses. |
| `require-openspec-change-retro-gate` | Owns archive retrospective policy. This change supplies Autopilot-specific freshness evidence before archive/release. |

## Contract Source Strategy

Prefer a small TypeScript source module such as `tools/autopilot-contract.ts` for stable public constants:

```ts
export const autopilotTaskTypes = [...] as const;
export const autopilotTaskStatuses = [...] as const;
export const autopilotReasonCodes = [...] as const;
export const autopilotActionabilityValues = [...] as const;
export const autopilotMrStatuses = [...] as const;
export const autopilotMrWaitStatuses = [...] as const;
export const autopilotToolNames = [...] as const;
export const autopilotProtectedPathPatterns = [...] as const;
```

`tools/autopilot-ledger.ts`, `tools/openspec-autopilot-output.ts`, and plugin tests should import this module. If direct import would create undesirable coupling, add a deterministic contract test that compares exported values across modules and fails on drift.

Instruction artifacts should not become generated source in the first slice. Instead, add focused checks that the skill, README routing, and `/autopilot` command mention the current primary output fields and do not document removed fields as authoritative. Generated docs can be a later improvement if drift remains frequent.

## Plugin Contract Tests

Add tests that import `.opencode/plugins/openspec-autopilot.ts`, call `server(ctx, options)`, and execute:

- `autopilot_run_next` with no args, `changeId`, and `taskId` filters.
- `autopilot_status` with and without `changeId`.
- `autopilot_collect` with `taskId`.
- `autopilot_answer_blocker` with `questionId`, `taskId`, `selectedLabel`, and `action`.
- `autopilot_stop` with `target`, `id`, and `reason`.

The tests should assert parseable JSON, stable `metadata.service`, expected `reasonCode`, compact output shape, and no raw ledger body leakage. For no-op MVP tools, test whether input context is intentionally ignored or echoed in sanitized metadata; either choice must be documented by the test contract.

## Validation Boundary

Add or formalize package scripts:

```json
{
  "autopilot:validate": "node tools/autopilot-ledger.ts",
  "openspec:validate": "openspec validate --all"
}
```

`validate-library.ts` should require public scripts that README documents as first-class dev-kit commands. Pre-push tests should exercise command execution semantics with fake commands or injected command runners so they prove ordering, short-circuit behavior, and missing/failing OpenSpec CLI reporting without depending on global CLI state.

## Report Freshness

Autopilot evidence freshness should be checked before archive/release. The first slice can be a small deterministic helper or validation rule that inspects known Autopilot report artifacts and supports two modes:

| Mode | Behavior |
| --- | --- |
| `advisory` | Report stale or unknown evidence as warnings for normal development discovery. |
| `archive-strict` | Treat stale output shape, unchecked-task contradictions, and unsupported ready-to-land claims as blocking errors before archive or release. |

The helper should flag:

- Reported output JSON missing fields required by the current contract.
- `tasks.md` claiming or implying completion while checklist items remain unchecked.
- `tasks.md` leaving implementation or fixture tasks unchecked when deterministic source/test evidence proves the corresponding public behavior is already present, so the change needs reconciliation before archive.
- `live-regression-report.md` saying ready-to-land while `automation/task.json` remains `Ready` without an explicit plugin-owned-state explanation.
- Validation sections naming fewer active changes or commands than current OpenSpec state requires.

The helper should report `unknown` when a report format is unsupported. It must not infer quality or severity beyond the explicit selected mode; the agent/reviewer owns judgment.

## Active-Change Consistency

Add a lightweight consistency mode before archive or release. It should compare only deterministic evidence:

- Task checkbox state in `tasks.md`.
- Stable source/test evidence from named files, fixtures, or validation output recorded in the report.
- Plugin-owned ledger status when present.
- Current public output contract fields when reports include Autopilot tool JSON.

The helper should not guess whether arbitrary code implements a requirement. It may flag mismatches only when a stable fixture, test name, source reference, or explicit report claim gives it direct evidence. Unsupported cases should return `unknown` and leave judgment to reviewers.

## Install And Loader Smoke

The repository currently documents Autopilot plugin installation as a manual bundle. Add one of these gates:

- Preferred: a temp-config smoke that copies or references the documented bundle and imports/executes the plugin server in a path layout equivalent to the manual install instructions.
- Acceptable interim: a machine-checkable release checklist item that verifies `.opencode/package.json`, plugin import paths, `opencode.json` command config, skill presence, and helper dependencies are present before advertising `/autopilot` outside the repo.

Do not require live provider credentials for this smoke. If live OpenCode loader behavior cannot be exercised locally, record the gap and keep the smoke at source/import level.

## Risks

- Over-centralizing every literal can make simple helpers harder to read. Keep the shared module limited to public contract values and protected policy constants.
- Report freshness checks can become brittle if they parse prose too aggressively. Prefer stable fenced JSON blocks, headings, task checkboxes, and explicit status lines.
- Live loader tests may be environment-sensitive. Start with temp import/plugin-server smoke and reserve full OpenCode restart testing for manual release evidence.
