# Design: Add Autopilot Auto Parallel Claims

## Summary

`maxImplementationClaims = auto` should be an explicit Autopilot runtime policy that resolves to a numeric WIP limit for the current queue. The policy decides whether to stay serial, start two standard implementation workstreams, or allow a larger bounded fan-out for low-risk work.

Auto mode must be deterministic. It may use structured ledger/runtime evidence, but it must not use LLM preference, prose summaries, or unstated heuristics as authority.

## Configuration Model

Extend the plugin-owned runtime state model without breaking fixed parallel mode:

```ts
type AutopilotParallelImplementationState = {
  enabled?: boolean;
  mode?: "fixed" | "auto";
  maxImplementationClaims?: number | "auto";
  maxAutoClaims?: number;
  conflictTolerance?: "none" | "small";
  softConflictScopes?: string[];
  lockedTaskIds?: string[];
  worktrees?: Record<string, string>;
};
```

Interpretation:

- `enabled: true` remains required for implementation parallelism.
- `mode: "fixed"` or numeric `maxImplementationClaims` keeps existing behavior.
- `mode: "auto"` or `maxImplementationClaims: "auto"` enables auto policy.
- `maxAutoClaims` caps the resolved numeric WIP limit. Default: `3` for implementation work, `4` only for low-risk docs/tests/fixtures/research/planning queues.
- `conflictTolerance: "none"` preserves strict disjointness.
- `conflictTolerance: "small"` allows bounded soft conflicts only under the rules below.
- `softConflictScopes` is explicit structured input. Auto mode must not invent soft-conflict paths from prose.

If both `mode` and `maxImplementationClaims` are absent, Autopilot remains serial by default.

## Output Contract

Keep `selection.maxImplementationClaims` numeric because agents need the resolved decision, not the policy expression.

Extend `selection` with auto evidence:

```ts
type AutopilotAutoParallelDecision = {
  policy: "auto";
  resolvedMaxImplementationClaims: number;
  maxAutoClaims: number;
  conflictTolerance: "none" | "small";
  fanInValidationRequired: boolean;
  decisionReason: string;
  riskClass: "serial_required" | "standard_parallel" | "low_risk_parallel" | "soft_conflict_parallel";
  acceptedSoftConflictScopes: string[];
  rejectedReasons: string[];
};

type AutopilotSelection = {
  mode: "serial_default" | "parallel_implementation" | "auto_parallel_implementation";
  selectedTaskId?: string;
  maxImplementationClaims: number;
  autoDecision?: AutopilotAutoParallelDecision;
  candidates: AutopilotSelectionCandidate[];
};
```

Rules:

- `selection.mode` is `auto_parallel_implementation` only when auto mode is explicitly enabled.
- `selection.maxImplementationClaims` is always the resolved numeric WIP limit.
- `autoDecision.fanInValidationRequired` is `true` when more than one task starts or any soft conflict is accepted.
- `parallel_started` remains authoritative only when matching `tasksStarted` evidence exists.
- Started parallel candidates include `worktreePath` evidence; `tasksStarted[]` and active runtime state preserve the same task-to-worktree mapping for fan-in, MR, archive, and cleanup gates.
- `parallel_ready` remains visibility evidence only and does not imply dispatch.

## Auto Decision Pipeline

Auto mode evaluates candidates in deterministic stages.

### Stage 1: Hard Stops

Return a resolved WIP of `1` or no starts when any global hard stop applies:

- invalid ledgers;
- user blockers;
- MR wait states;
- dependency gaps for all Ready candidates;
- runtime evidence conflicts;
- missing plugin-owned locks or missing/invalid worktree evidence for candidates that would start;
- no Ready candidates.

Hard stops must be reflected in `autoDecision.rejectedReasons` when auto mode is active.

### Stage 2: Candidate Eligibility

A Ready candidate can be considered for auto parallel starts only when:

- dependencies are complete;
- status can legally advance from the current phase;
- `scope.write` is non-empty and every pattern is comparable;
- task-specific `scope.forbidden` does not overlap another candidate's writes unless the overlap is a known common protected scope that is already blocked from manual writes;
- the candidate has plugin-owned lock evidence;
- the candidate has an owned worktree path with a relative `autopilot/...` path containing the task id as a path segment;
- the candidate is not stale relative to runtime claim/report evidence.

Candidates that fail these checks remain unstarted with `selectionReason` such as `scope_conflict`, `missing_parallel_guard`, `dependency_blocked`, or `runtime_evidence_conflict`.

### Stage 3: Risk Classification

Classify the eligible queue using structured evidence only.

`serial_required`:

- only one eligible candidate exists;
- any selected candidate writes central coordination files such as `package.json`, lockfiles, root config, OpenCode command config, OpenSpec protected automation paths, shared schemas, shared validator/runtime files, or broad repository-level instruction artifacts;
- write scopes are unknown, unsupported, empty, absolute, traversal-based, or rooted at a glob that cannot be compared conservatively;
- selected candidates form a dependency chain;
- a candidate writes a path forbidden by another candidate;
- `conflictTolerance` is `none` and any overlap exists.

`standard_parallel`:

- two or more eligible candidates have disjoint comparable write scopes;
- no selected candidate touches central coordination files;
- at least two unique owned worktrees and locks exist;
- task types are implementation-bearing but localized, such as `feature`, `bugfix`, `refactor`, `tooling`, `config`, `performance`, or `protocol`.

`low_risk_parallel`:

- eligible candidates are docs, typo, research, planning, test fixture, example, or documentation-only work;
- write scopes are disjoint or soft-conflict-only under the conflict budget;
- fan-in validation is available;
- reviewer skip reasons or lightweight reviewer gates are still explicit.

`soft_conflict_parallel`:

- candidates have independent primary write scopes;
- their only write/write overlap is inside configured `softConflictScopes`;
- `conflictTolerance` is `small`;
- the resolved WIP is capped at `2` when any soft conflict is accepted;
- fan-in validation is required.

## WIP Resolution

Resolve `maxImplementationClaims` as follows:

| Risk Class | Default Resolved WIP | Upper Bound |
| --- | --- | --- |
| `serial_required` | `1` | `1` |
| `standard_parallel` | `2` | `min(maxAutoClaims, 2)` unless configured tests prove a higher cap |
| `low_risk_parallel` | `min(candidateCount, 3)` | `min(maxAutoClaims, 4)` |
| `soft_conflict_parallel` | `2` | `2` |

The implementation may start fewer tasks than the resolved limit if later per-candidate guards fail. It must never start more than the resolved limit.

## Conflict Budget

Auto mode should not be afraid of small merge conflicts, but conflicts must be bounded and explicit.

Allowed small conflicts:

- overlap in configured docs/catalog/index files where each task also has a disjoint primary scope;
- overlap in generated evidence reports that are regenerated during fan-in;
- overlap in non-runtime Markdown traceability files when both tasks are docs/research/planning or explicitly non-product-code.

Disallowed conflicts:

- source/runtime/helper code overlap;
- schema, validator, package manager, dependency lock, build config, OpenCode config, or plugin code overlap;
- protected Autopilot state paths;
- secret-bearing or credential-like files;
- overlap not listed in `softConflictScopes`;
- overlap that would require auto-merge or force-push to resolve.

When soft conflicts are accepted, output must include `acceptedSoftConflictScopes` and `fanInValidationRequired: true`.

## Worktree Lifecycle

Parallel implementation is only safe when each stream is isolated in its own git worktree and then integrated through normal MR review.

Programmatic lifecycle helpers should provide deterministic plans, not prose-only reminders:

- before a parallel claim, derive or validate one unique owned relative path per stream, using `autopilot/<change-id>/<task-id>` by default;
- create actions use argv-shaped commands such as `git worktree add -b autopilot/<change-id>/<task-id> autopilot/<change-id>/<task-id> <base-ref>`;
- absolute paths, traversal segments, duplicate paths, unsafe identifiers, paths outside `autopilot/`, or paths missing the task id are blockers;
- started selection evidence, `tasksStarted[]`, and active runtime state must retain the worktree path for each started task;
- implementation from each worktree is integrated back through an MR; auto-parallel cleanup requires MR merged evidence;
- after the change is archived, cleanup actions are limited to `git worktree remove <owned-path>` plus `git worktree prune`;
- cleanup must block unless both MR merged evidence and archived-change evidence exist.
- the `autopilot:worktree-plan` script provides JSON-in/JSON-out dry-run planning for create or cleanup modes and does not execute git commands itself.

Workers may edit inside assigned worktrees, but the control plane owns worktree creation, lifecycle tracking, MR/fan-in evidence, and cleanup decisions.

## Fan-In Validation

Any auto-parallel run with more than one started implementation task must require a fan-in gate before Done/archive readiness.

The fan-in gate should verify:

- all started worktrees report legal task transitions;
- no worker report id was consumed twice;
- no protected ledger mutation was performed by agents or workers;
- the merged/integrated tree passes relevant validation commands;
- reviewer gates required by touched areas ran or were explicitly skipped with reasons;
- any accepted soft conflict was resolved and recorded in the final report or MR body.

Failure to run or pass fan-in validation keeps the run out of `Done` and should surface a blocker or `runtime_evidence_conflict`.

## Interaction With Existing Modes

- `serial_default` remains the default when no explicit parallel implementation policy is configured.
- Fixed `parallel_implementation` remains available for tests or operators that need a known numeric WIP.
- Auto mode is an explicit implementation-parallel policy, not a model-side decision.
- Read-only analysis, review, and evidence gathering can still be parallelized more broadly because they do not write implementation files.

## Migration And Compatibility

- Existing numeric `maxImplementationClaims` behavior remains unchanged.
- Existing tests that assert `maxImplementationClaims: 1` for default serial output should remain valid.
- Contract fixtures must be updated only for new auto-mode outputs.
- Skill and README wording should clarify that `auto` is explicit guarded mode, while default `/autopilot` remains serial unless repository/user policy enables auto.

## Test Strategy

- Contract tests for `auto_parallel_implementation`, numeric resolved `maxImplementationClaims`, and `autoDecision` fields.
- Runtime tests for hard stops resolving to serial or no starts.
- Runtime tests for disjoint implementation candidates resolving to WIP `2`.
- Runtime tests for docs/tests/fixtures queues resolving to WIP `3` or capped `4`.
- Runtime tests for central files forcing serial.
- Runtime tests for soft conflict acceptance only when `conflictTolerance: "small"` and `softConflictScopes` match.
- Runtime tests proving soft conflict candidates are capped at WIP `2`.
- Runtime tests proving `parallel_ready` does not become `parallel_started` without locks/worktrees.
- Runtime tests proving started tasks carry worktree evidence for cleanup.
- Deterministic helper tests proving worktree creation and archive cleanup plans block unsafe paths, missing MR merged evidence, and missing archive evidence.
- Fan-in validation tests proving auto-parallel tasks cannot complete without integration evidence.

## Risks

- Hidden coupling may not be visible in `scope.write`. Mitigation: central-file classification, forbidden scopes, conservative unknown-scope handling, fan-in validation, and serial fallback.
- Auto WIP may increase review burden. Mitigation: low default caps and reviewer/fan-in gates.
- Soft conflicts could normalize risky overlap. Mitigation: explicit `softConflictScopes`, source/config overlap ban, WIP cap `2`, and mandatory conflict reporting.
- Output could confuse agents if `auto` is not clearly distinguished from visibility-only `parallel_ready`. Mitigation: `autoDecision`, resolved numeric WIP, and `parallel_started` plus `tasksStarted` as the only start proof.
- Worktrees could accumulate if archive cleanup is manual. Mitigation: programmatic cleanup plans require MR merged plus archived-change evidence and emit only owned `autopilot/...` remove/prune actions.
