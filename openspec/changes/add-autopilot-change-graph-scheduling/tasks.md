# Tasks: Add Autopilot Change Graph Scheduling

## Tests First

- [x] Add ledger validator tests for optional `schedule`, valid priority/dependency evidence, legacy ledgers without `schedule`, duplicate dependencies, self-dependency, and schedule/top-level mismatch.
- [ ] Add graph helper tests for explicit `Priority`, `Depends-On`, reverse `Blocks`, change-id-to-task-id resolution, no-evidence fallback, deterministic ordering, unresolved dependency target, and dependency cycle detection.
- [x] Add graph helper tests proving same-capability ambiguity and write-scope overlap become `candidateDependencies` or `conflictsWith`, not authoritative dependencies.
- [x] Add materialization tests proving new ledgers receive inferred `priority`, `dependencies`, and `schedule` evidence, while no-evidence changes keep `medium` and `[]`.
- [x] Add active-change queue tests proving unmaterialized changes expose inferred priority/dependency preview and ledger-backed state remains authoritative when present.
- [ ] Add Autopilot output tests proving `changeGraph.parallelReady`, `levels`, `dependencyBlocked`, `conflicts`, and `cycles` are stable and machine-readable.
- [x] Add runtime selection regression tests proving dependency-blocked high-priority candidates are not selected before their blockers are `Done`.

## Implementation

- [x] Add deterministic TypeScript helper `tools/autopilot-change-graph.ts` with `inferChangeSchedule()`, `buildChangeGraph()`, `topologicalLevels()`, and `parallelReadyChanges()` or equivalent focused exports.
- [x] Add focused test file `tools/test-autopilot-change-graph.ts`, wire it into `npm test`, and keep `node tools/test-autopilot-change-graph.ts` as the focused local TDD command.
- [x] Parse supported scheduling markers from canonical OpenSpec documents: `Priority: <value>`, `Depends-On: <change-id>`, and `Blocks: <change-id>`.
- [ ] Implement conservative priority inference for explicit markers, Autopilot control-plane changes, implementation-bearing defaults, and low-risk docs/research/planning work.
- [x] Implement conservative dependency inference using explicit markers, reverse blockers, and existing valid schedule metadata only.
- [x] Implement conflict and candidate-dependency evidence for ambiguous same-capability or write-scope overlap cases.
- [x] Extend `tools/autopilot-ledger.ts` to validate optional `schedule` shape and consistency without rejecting legacy ledgers.
- [x] Integrate scheduling inference into `tools/openspec-autopilot-materializer.ts` so newly created ledgers no longer blindly use `medium` and `[]` when evidence exists.
- [x] Integrate scheduling preview into `tools/openspec-autopilot-active-change-queue.ts` for unfinished active changes without ledgers.
- [x] Extend `tools/openspec-autopilot-output.ts` with `changeGraph` output for status and run-next paths.
- [x] Ensure `tools/openspec-autopilot-runtime.ts` selection and `changeGraph` use the same dependency graph evidence so output and selection cannot disagree.

## Documentation And Routing

- [ ] Update README Autopilot feature/routing text if user-facing queue status behavior changes.
- [ ] Update `.opencode/skills/openspec-autopilot/SKILL.md` only if the skill needs to teach agents how to request or interpret `changeGraph.parallelReady`.
- [x] Document explicit scheduling markers and conservative inference boundaries in the relevant OpenSpec or Autopilot docs.
- [ ] Keep documentation project-neutral and avoid hardcoded local repository names or paths outside examples.

## Review Gates

- [ ] Run `implementation-readiness-reviewer` on this OpenSpec change before implementation starts.
- [ ] Run `code-quality-reviewer` after implementation because the helper affects scheduler/output boundaries.
- [ ] Run `test-coverage-reviewer` after implementation because false dependencies and missed blockers are regression-prone.
- [ ] Run `instruction-artifact-reviewer` only if README, skill, or command wording changes.

## Validation

- [x] `npm run validate`
- [x] `npm test`
- [x] `npm run openspec:validate`
- [ ] `npm run autopilot:validate -- <task-ledger.json>` for any new or modified ledger fixture
- [x] `node tools/test-autopilot-change-graph.ts`

## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [ ] Write `openspec/changes/add-autopilot-change-graph-scheduling/automation/retro.json` with evidence, problems, root causes, improvements, follow-up ids, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- add-autopilot-change-graph-scheduling` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the JSON retro gate passes or an approved skip reason is recorded in `automation/retro.json`.
