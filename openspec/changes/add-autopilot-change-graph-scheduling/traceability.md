# Traceability: Add Autopilot Change Graph Scheduling

## Source Questions

| User Concern | Proposed Coverage |
| --- | --- |
| New changes should automatically get priority. | Materializer and active-change preview infer priority from explicit markers, control-plane scope, task type, and safe defaults. |
| New changes should automatically know blockers. | Confirmed dependency inference writes top-level task-id `dependencies` and records source change id plus resolved task id in `schedule.dependencies[]`. |
| Users need a tree of changes. | `changeGraph.levels`, `parallelReady`, `dependencyBlocked`, `conflicts`, and `cycles` expose the implementation graph. |
| Autopilot should say what can run in parallel. | Status/run-next output lists dependency-free ready changes while existing runtime guards decide actual parallel starts. |
| Unsafe guesses must not block work. | Ambiguous same-capability or write-scope evidence is recorded as candidate/conflict evidence, not authoritative dependency. |

## Requirement To Task Map

| Requirement | Primary Tasks |
| --- | --- |
| Materialized Ledgers Include Scheduling Evidence | Tests First 1, 4; Implementation 1, 6, 7; Validation 1-4 |
| Priority Inference Is Deterministic | Tests First 2, 4; Implementation 2-3, 7-8 |
| Dependency Inference Is Conservative | Tests First 2-3, 7; Implementation 2, 4-5, 10 |
| Change Graph Output Shows Parallel-Ready Work | Tests First 6-7; Implementation 1, 9-10 |
| Active Changes Have Scheduling Preview Before Ledger Creation | Tests First 5; Implementation 8 |
| Scheduling Metadata Is Backward Compatible | Tests First 1, 4; Implementation 6-7 |

## Implementation Boundaries

In scope:

- TypeScript graph/schedule helper.
- Ledger validator extension for optional `schedule`.
- Materializer and active-change preview integration.
- Autopilot status/run-next graph output.
- Focused tests and reviewer gates.

Out of scope:

- Migration of existing ledgers.
- LLM-based dependency inference.
- Automatic parallel implementation beyond existing guarded runtime policy.
- Remote provider/MR operations.
- Auto-merge, deploy, force-push, or protected branch pushes.

## Suggested Implementation Order

1. Add schedule validation fixtures and graph helper tests.
2. Implement `autopilot-change-graph.ts` with marker parsing, change-id-to-task-id resolution, priority inference, dependencies, conflicts, cycles, and levels.
3. Extend ledger validation for optional schedule metadata.
4. Integrate materializer ledger creation.
5. Integrate active-change queue preview.
6. Add `changeGraph` output to status/run-next.
7. Reconcile runtime selection evidence with graph dependency evidence.
8. Update docs/instructions only if user-facing wording changed.
9. Run validation and reviewer gates.
