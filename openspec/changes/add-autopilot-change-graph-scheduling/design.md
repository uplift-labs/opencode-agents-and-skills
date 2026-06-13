# Design: Add Autopilot Change Graph Scheduling

## Summary

Autopilot should treat the OpenSpec change queue as a directed graph. Nodes are active changes or ledger-backed tasks. Edges are confirmed implementation-order dependencies. Priority ranks order independent ready nodes, but dependencies decide blockers.

The implementation must be deterministic and evidence-backed. It may parse structured markers and repository artifacts, but it must not use LLM preference, prose vibes, or hidden scoring as authority.

## Data Model

Keep existing top-level ledger fields as the runtime authority. `dependencies[]` contains Autopilot task ids because runtime selection currently resolves dependencies against ledger `id` values. For materialized OpenSpec change ledgers, the materializer MUST keep `ledger.id` equal to the OpenSpec change id, so change-level markers can resolve directly to task ids.

```json
{
  "priority": "high",
  "dependencies": ["base-change"]
}
```

Add optional evidence metadata:

```json
{
  "schedule": {
    "schemaVersion": 1,
    "generatedBy": "autopilot-change-graph-v1",
    "generatedAt": "2026-06-13T00:00:00.000Z",
    "priority": {
      "value": "high",
      "reason": "Change touches Autopilot runtime scheduling and blocks downstream queue decisions.",
      "sources": ["openspec/changes/<change>/design.md"]
    },
    "dependencies": [
      {
        "changeId": "base-change",
        "taskId": "base-change",
        "kind": "explicit",
        "reason": "Declared Depends-On marker.",
        "source": "openspec/changes/<change>/proposal.md"
      }
    ],
    "candidateDependencies": [],
    "conflictsWith": []
  }
}
```

Rules:

- `dependencies[]` remains the authoritative blocker list consumed by runtime selection.
- `priority` remains the authoritative sortable top-level value.
- `schedule` explains derivation and may be omitted for legacy ledgers.
- `schedule.dependencies[].changeId` records the OpenSpec change id from source evidence.
- `schedule.dependencies[].taskId` records the resolved dependency key written to top-level `dependencies[]`.
- `schedule.dependencies[].taskId` values must match top-level `dependencies[]` after sorting and deduplication.
- `candidateDependencies[]` and `conflictsWith[]` are visibility evidence only and must not block work by themselves.

## Priority Inference

Priority values remain `critical`, `high`, `medium`, and `low`.

| Priority | Deterministic Evidence |
| --- | --- |
| `critical` | Explicit marker such as `Priority: critical`, or future machine-readable security/data-loss gate evidence. MVP should prefer explicit marker only. |
| `high` | Explicit marker, Autopilot control-plane/runtime/ledger/validator/schema changes, or a change that confirmed downstream active changes depend on. |
| `medium` | Default for implementation-bearing feature, bugfix, refactor, tooling, config, performance, or protocol work. |
| `low` | Docs, typo, research, planning, evidence-only work, or doc-only write scope. |

Tie-breakers remain deterministic: priority rank, write scope size, change id, then path.

## Dependency Inference

Confirmed dependencies are intentionally conservative.

Confirmed dependency sources for MVP:

- `Depends-On: <change-id>` marker in `proposal.md`, `design.md`, or `tasks.md`.
- `Blocks: <change-id>` marker in another active change, which creates the reverse dependency.
- Structured schedule metadata already present in a valid ledger.

Non-blocking evidence:

- Same capability touched by multiple changes without a clear introduced/modified relationship becomes conflict or candidate dependency evidence.
- Write-scope overlap becomes `conflictsWith`, not `dependencies`.
- Unsupported or ambiguous evidence becomes `candidateDependencies` or `unknown`, not a blocker.

Safety rules:

- Self-dependency is invalid.
- Duplicate source markers are deduped before publication.
- Duplicate top-level `dependencies[]` entries or `schedule`/top-level dependency mismatches are validation errors.
- Missing dependency target is reported as unresolved dependency evidence and blocks if it is already in authoritative `dependencies[]`.
- Cycles are reported as graph blockers; Autopilot must not choose a cyclic node as parallel-ready.
- Parser-based spec-delta ordering is out of scope for this MVP and may become a separate change only after exact fixtures and parser rules exist.

## Graph Output

Extend Autopilot output with a graph view:

```ts
type AutopilotChangeGraph = {
  nodes: Array<{
    changeId: string;
    taskId: string;
    status: string;
    priority: string;
    dependencies: string[];
    blockedBy: string[];
    sourceKind: "ledger" | "active-change";
    path: string;
  }>;
  levels: string[][];
  parallelReady: string[];
  dependencyBlocked: Array<{ changeId: string; blockedBy: string[] }>;
  conflicts: Array<{ left: string; right: string; reason: string }>;
  cycles: string[][];
};
```

Interpretation:

- `parallelReady` contains nodes whose authoritative dependencies are complete and whose current state is otherwise actionable.
- `levels` is a topological implementation plan. Nodes in the same level have no dependency relationship and may be considered for parallel work subject to existing scope/runtime guards.
- `dependencyBlocked` explains current blockers.
- `conflicts` explains non-dependency scope/capability conflicts.
- Missing authoritative dependency targets are unresolved blockers, not parallel-ready evidence.
- `cycles` reports invalid dependency cycles and removes those nodes from `parallelReady`.

## Materialization Integration

`openspec-autopilot-materializer.ts` should call a deterministic graph helper before building the ledger:

1. Read active changes and existing ledgers under the configured ledger root.
2. Infer scheduling for the selected change.
3. Write top-level `priority` and `dependencies` into the candidate ledger.
4. Write optional `schedule` evidence.
5. Validate the full candidate ledger before publishing.

Fallback behavior must preserve existing behavior:

- no evidence -> `priority: "medium"`;
- no confirmed dependencies -> `dependencies: []`;
- no graph helper evidence -> valid ledger still publishes only if core schema passes.

## Active-Change Preview

`openspec-autopilot-active-change-queue.ts` should use the same inference helper for unfinished active changes without ledgers.

The preview is not authoritative after a ledger exists. Once `automation/task.json` is present and valid, ledger-backed state wins.

## Validation Strategy

Add a deterministic helper module rather than scattering inference across controller/output/materializer code.

Suggested module:

```ts
tools/autopilot-change-graph.ts
```

Suggested exports:

- `inferChangeSchedule()`;
- `buildChangeGraph()`;
- `topologicalLevels()`;
- `parallelReadyChanges()`.

The helper must report `unknown`, `unsupported`, or empty evidence instead of guessing.

## Compatibility

- Existing ledgers remain valid because `schedule` is optional.
- Existing runtime dependency behavior remains unchanged because it already reads top-level `dependencies`.
- Existing serial default remains unchanged.
- Auto-parallel implementation still requires explicit runtime policy, locks, and worktrees.

## Risks

- False dependency can block work unnecessarily. Mitigation: only confirmed evidence enters top-level `dependencies`.
- Missed semantic dependency can allow unsafe ordering. Mitigation: keep conflicts/candidate dependencies visible and retain existing scope/runtime parallel guards.
- Priority churn can reorder queues unexpectedly. Mitigation: deterministic evidence and stable tie-breakers.
- Cycles can stall scheduling. Mitigation: explicit cycle output and no parallel-ready selection for cyclic nodes.
