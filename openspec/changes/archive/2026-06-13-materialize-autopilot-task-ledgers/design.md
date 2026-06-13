# Design: Materialize Autopilot Task Ledgers

## Problem Statement

The active-change queue made `/autopilot` useful when `tasks.md` exists without a ledger, but it intentionally stayed read-only. The result is safe but incomplete: explicit Autopilot work starts without `automation/task.json`, so there is no durable phase ledger for strict transitions, worker evidence, reviewer gates, MR policy, or future parallel dispatch.

This change adds the missing bridge from active OpenSpec change to plugin-owned task ledger. The expected user flow is plain `/autopilot` or `/autopilot + prompt`; users should not have to pass explicit change ids. Those flows must materialize the selected or newly accepted change before Autopilot-controlled work begins.

## Design Principles

- Plugin-owned writes only: agents and workers never manually edit `openspec/changes/*/automation/task.json`.
- Explicit start only: creation requires an explicit Autopilot run action, not a passive status/check/trigger.
- Start-work invariant: Autopilot-controlled work on a change must not begin without a ledger; if a selected change lacks `automation/task.json`, materialize or block before analyze/implementation work.
- Validate before publish: generated JSON must pass `validateTaskLedger` before it becomes the canonical ledger.
- Idempotent by path: existing ledgers are authoritative and are never overwritten by materialization.
- Conservative defaults: unknown evidence becomes a safe default or a blocker, never a guessed capability claim.
- Clear evidence: output must explain whether a ledger was created, skipped, blocked, or already existed.

## Trigger Model

Materialization is allowed only from claim-capable explicit controller paths:

- Plain `/autopilot` after deterministic queue selection chooses the primary unfinished active change.
- `/autopilot + prompt` after prompt intake resolves the prompt to an existing or newly accepted OpenSpec change.
- `autopilot_run_next()` with no scope when it is invoked as an explicit run action and selection chooses an unfinished active change.
- Internal controller calls with a resolved `changeId` when no applicable ledger exists and the active change preflight passes.
- An explicit TUI/SDK run action that resolves to the same controller path and carries user intent to start the selected change.

Materialization is not allowed from:

- `autopilot_status`.
- `autopilot_collect`.
- `autopilot_answer_blocker`.
- `autopilot_stop`.
- `npm run autopilot:check -- --level cheap` or other read-only checks.
- Passive `file.watcher.updated`, session idle, or hook observe events.
- Free-form prompt intake before an OpenSpec change is accepted or selected.

## Preflight

Before writing, the controller verifies:

1. A selected `changeId` exists, either from deterministic active-queue selection, prompt intake resolving to an accepted OpenSpec change, or an internal controller scope.
2. The normalized `changeId` is a safe OpenSpec change id and resolves inside `openspec/changes/<change-id>`.
3. The change is not under `openspec/changes/archive/**`.
4. `tasks.md` exists, is a file, is readable, and contains at least one unchecked checklist item.
5. `automation/task.json` does not already exist.
6. No prototype ledger with the same task id is applicable for the selected run.
7. The change is not already complete according to checklist evidence.
8. Required source files are readable enough to derive the minimal ledger fields or produce an explicit blocker.
9. The materialization policy permits this call shape.

Unscoped plain `/autopilot` calls use the same deterministic queue selection already exposed in `selection` evidence:

- If exactly one unfinished active change exists, materialize it.
- If multiple unfinished active changes exist, materialize the deterministic selected primary change and report the non-selected candidates.
- If prompt text is present, do not advance an unrelated active queue; route the prompt to an accepted change first, then materialize that resolved change before work starts.

## Ledger Shape

The materializer creates a schema version 1 ledger compatible with the existing validator:

```json
{
  "schemaVersion": 1,
  "id": "<change-id>",
  "taskType": "planning",
  "status": "Ready",
  "priority": "medium",
  "dependencies": [],
  "scope": {
    "read": ["openspec/changes/<change-id>/**", "openspec/project.md", "package.json"],
    "write": ["<derived-write-scope>"],
    "forbidden": ["openspec/changes/*/automation/**", ".autopilot/**"]
  },
  "autonomy": {
    "allowCommit": false,
    "allowPush": false,
    "allowCreateMr": false,
    "allowMerge": false
  },
  "validation": { "commands": [] },
  "phaseProfile": {
    "analyze": { "required": true },
    "implementation": { "required": true },
    "review": { "required": true },
    "acceptance": { "required": true }
  },
  "phaseEvidence": {},
  "testDecision": { "decision": "required", "reason": "Materialized from active OpenSpec change; analyze phase must confirm the focused test strategy before implementation." },
  "plan": {
    "summary": "Materialized from active OpenSpec change <change-id>.",
    "slices": ["Analyze active change", "Implement smallest safe slice", "Validate and review"],
    "scope": "Active OpenSpec change <change-id>.",
    "testStrategy": "Analyze phase must confirm or refine test strategy before implementation."
  },
  "reviewPolicy": { "required": [], "skipped": [] },
  "mr": { "required": true, "status": "none" },
  "blockers": [],
  "feedback": [],
  "history": [],
  "revision": {
    "number": 0,
    "contentHash": "<computed-or-placeholder>",
    "updatedBy": "autopilot-materializer",
    "updatedAt": "<iso-timestamp>"
  }
}
```

The implementation may improve fields when deterministic evidence exists, but it must not guess:

- `taskType`: use explicit task metadata when a future source exists; otherwise use a documented conservative default. The materializer must not rely on the user supplying a task type or `changeId` in the command.
- `priority`: use an explicit metadata source if present; otherwise `medium`.
- `dependencies`: use explicit ledger metadata only; do not infer dependencies from prose.
- `scope.read`: include the change directory and shared OpenSpec/project files.
- `scope.write`: prefer explicit implementation scope metadata when available; otherwise use a conservative repo-local scope such as the change directory plus documented implementation targets only after analyze confirms them.
- `validation.commands`: include `npm run validate`, `npm test`, `npm run openspec:validate`, and `npm run autopilot:validate -- openspec/changes/<change-id>/automation/task.json` when those scripts exist in `package.json`; unavailable commands are not invented.
- `reviewPolicy`: seed empty arrays if no deterministic reviewer signal exists; later phase validation or continuous checks can require reviewers based on actual diff signals.
- `mr`: default to required for implementation changes unless the change is deterministically docs/research/planning-only and has a documented no-MR policy.

## Publication Algorithm

1. Build the candidate ledger in memory.
2. Validate it with `validateTaskLedger(candidate, { sourcePath })`.
3. If invalid, return a materialization blocker with validation errors and do not write the final path.
4. Create `automation/` as a plugin-owned operation.
5. Write a temporary file inside the same directory.
6. Validate the serialized temporary file by reading it back.
7. Atomically rename or replace the temporary file to `task.json` only if the final path is still absent.
8. Re-read the final ledger and validate it.
9. Return output with creation evidence and the next safe action.

If any step fails after directory creation, the controller removes only its own temporary file. It must not delete user files or an existing ledger.

## Output Contract

Add a reason code such as `ledger_materialized` to distinguish protected ledger creation from ordinary runtime claim or collect advancement.

Successful materialization output should include:

- `outcome: "advanced"` because plugin-owned state changed.
- `reasonCode: "ledger_materialized"`.
- `tasksAdvanced[]` entry with `taskId`, `changeId`, `path`, `action: "materialized-ledger"`, and validation status.
- `taskSummaries[]` for the newly created ledger with `sourceKind: "ledger"` and `status: "Ready"`.
- `selection.selectedTaskId` equal to the materialized task id.
- `nextActions[]` recommending the next ledger-backed Autopilot action for the same selected change or `autopilot_status` if the caller only wanted confirmation.
- A loop guard that allows a follow-up run because the previous no-ledger state changed.

Blocked materialization should include:

- `outcome: "failed"` or `"blocked_for_user"` according to the cause.
- A machine-readable blocker with no partial ledger publication.
- No `tasksStarted` evidence.
- No claim that an implementation phase started.

## Interaction With Existing Flows

- Active-change fallback remains read-only for status/check paths. Claim-capable explicit run paths materialize the selected active change instead of handing off to manual apply work without a ledger.
- Existing ledgers always win over active-change summaries.
- Auto-parallel selection evaluates only ledger-backed tasks. Active changes must be materialized before they can be claimed for parallel implementation.
- Continuous validation should detect newly materialized ledgers and run ledger validation.
- Programmatic triggers may observe materialization output, but passive events must not call materialization-capable run actions.
- Prompt intake must route free-form work into accepted OpenSpec changes before materialization is allowed, and then materialization is mandatory before Autopilot-controlled work begins.

## Tests

Add test-first coverage for:

- Internally resolved active change materializes a valid `automation/task.json`.
- Existing ledger is evaluated and not overwritten.
- Missing, archived, complete, unreadable, or unsupported changes do not create a ledger.
- Plain `/autopilot` with multiple active changes materializes the deterministic selected primary change and reports non-selected candidates.
- Plain `/autopilot` with one active change materializes that single change.
- `/autopilot + prompt` does not continue an unrelated queue; it materializes the prompt-resolved change before work starts.
- Invalid candidate ledger fails before final file publication.
- Temporary publication artifacts are cleaned up without deleting existing user files.
- `autopilot_status`, cheap checks, passive trigger handlers, and collect/stop/blocker tools remain read-only.
- Output contract includes `ledger_materialized` evidence and safe next actions.
- README, skill, command, and drift tests agree on who creates `task.json`.

## Risks

- The materializer could create misleading scopes if it guesses implementation files too early. Mitigation: use conservative scope and require analyze-phase refinement before implementation.
- Users may be surprised if deterministic primary selection is not the change they intended. Mitigation: report selected and non-selected candidates clearly, and ensure `/autopilot + prompt` routes prompt intent before queue advancement.
- A failed write could leave partial protected state. Mitigation: temp-file validation, final-path absence checks, and cleanup limited to owned temp files.
- New output reason codes can drift from tools, skill docs, and tests. Mitigation: update shared contract arrays and instruction-drift tests in the same implementation.

## Rollout

1. Add contract and tests for materialization output without writing files.
2. Add pure ledger builder tests for valid candidate ledgers and blocker cases.
3. Add file-publication tests using temporary repositories.
4. Wire materialization into explicit `autopilot_run_next` selection for plain `/autopilot`, prompt-resolved starts, and internally resolved change starts.
5. Update command/skill/README wording and drift tests.
6. Run full validation and reviewer gates.
