# opencode-dev-kit

Installable OpenCode development kit for one reusable AI-assisted engineering process across projects.

## What This Is

`opencode-dev-kit` packages reusable OpenCode skills, prototype plugins, read-only reviewer agents, project templates, and deterministic helper tools. Its purpose is to make development in other repositories faster, cheaper in tokens, and safer without creating a different workflow for every technology stack.

The kit optimizes one process: gather evidence, prove the current state, choose the smallest useful slice, work test-first when behavior changes, validate, run proportional reviewer gates, and hand off with residual risks.

## Universal Development Loop

The central contract is `instructions/universal-development-loop.md`:

```text
Intake -> Evidence -> Baseline Proof -> Small Slice -> Test First -> Implement -> Focused Validation -> Review Gate -> Final Validation -> Handoff -> Process Improvement
```

Technology adapters may change commands and constraints, but not the loop. A TypeScript project, Rust project, legacy service, documentation repo, or desktop app should all use the same process with different validation commands.

## Contents

- `.opencode/skills/`: reusable OpenCode skills.
- `.opencode/plugins/`: prototype OpenCode server plugins and model-facing tool surfaces.
- `.opencode/agents/`: reusable read-only reviewer agents.
- `fixtures/`: deterministic validation and acceptance fixtures for helper tooling.
- `instructions/`: copyable instruction templates for global/project `AGENTS.md`, reviewer contracts, evidence discipline, and porting.
- `templates/`: project bootstrap and CI templates for applying the Universal Development Loop to another repository.
- `profiles/`: install manifests that choose artifacts without creating separate workflows.
- `tools/`: TypeScript validation, install, project bootstrap, doctor, inventory, code-quality, and OpenCode session-retro tooling for this kit.

## Prerequisites

- Node `>=24` is required because repository tooling runs TypeScript entrypoints directly.
- `npm test`, `npm run retro:inventory`, and `npm run retro:analyze` use Node's `node:sqlite`; Node may print an `ExperimentalWarning` while the API remains experimental.

## Install

### Global Install

Install all repository skills, all reviewer agents, and a reusable global `AGENTS.md` block into OpenCode's global config directory:

```sh
npm run install:global
```

By default this installs into `~/.config/opencode`, syncs every repository skill to `skills/`, syncs every repository agent to `agents/`, and adds `instructions/global-opencode-agent-instructions.md` as an idempotent marked block in `~/.config/opencode/AGENTS.md` without deleting existing user instructions. Full sync prunes destination skill directories and agent `.md` files that are not present in the selected install set. Existing changed or pruned files/directories are backed up under `.backups/agents-and-skills/` before replacement/removal, outside OpenCode's loader folders.

Useful options:

- `--dry-run` or `--what-if`: preview changes without writing files.
- `--config-dir <path>`: install into a custom OpenCode config directory.
- `--profile <standard|strict|advanced>`: optionally restrict the installed artifact set without changing the Universal Development Loop.
- `--agents-md-source <path>`: install a custom source file into the global `AGENTS.md` block.
- `--skip-agents-md`: install only skills and agents.
- `--no-prune`: keep destination skills/agents not present in this repository.
- `--no-backup`: replace changed or pruned artifacts without creating backup copies.

Use `--agents-md-source AGENTS.md` only if you intentionally want this repository's local maintenance rules in the global `AGENTS.md` block.

Omit `--profile` when you want the full dev kit globally. Use a profile only when you intentionally want a smaller install set.

Restart OpenCode after installing; config-time files are loaded at startup.

Keep project-specific skills out of global discovery unless their descriptions explicitly scope them to that project. Global skills are visible in unrelated repositories through the skill catalog, so broad or local-product triggers add avoidable routing noise.

## Bootstrap A Project

Preview the files that would connect a target project to the Universal Development Loop:

```sh
npm run init:project -- --target <project-path>
```

Write the bootstrap files when the preview is correct:

```sh
npm run init:project -- --target <project-path> --mode write
```

The bootstrap writes a project `AGENTS.md`, optional `opencode.json`, and `opencode-dev-kit/adapter.json` plus `opencode-dev-kit/validation.md`. The adapter records technology-specific commands; it does not define a separate workflow.

Check readiness after bootstrapping:

```sh
npm run doctor -- --project <project-path>
```

Before broad AI work in a target repository, gather a compact deterministic map:

```sh
npm run project:inventory -- --root <project-path> --format markdown
```

## Token Economy

- Use the Universal Development Loop instead of choosing among many competing workflows.
- Use `project:inventory`, `code-quality:inventory`, `glob`, and `grep` before broad file reads.
- Keep heavyweight skills in optional profiles and load them only when they reduce total work.
- Run focused validation first; run broad validation when the change crosses boundaries.
- Use one relevant reviewer gate by risk instead of launching every reviewer.
- Convert repeated manual counting, drift checks, or report assembly into deterministic helpers.

Inspect this kit's instruction context cost with:

```sh
npm run instruction:inventory -- --format markdown
```

### Manual Skills

OpenCode skills are loaded from project or global skill folders. Copy selected skill folders from `.opencode/skills/` into one of these locations:

- Project: `.opencode/skills/<name>/SKILL.md`
- Global: `~/.config/opencode/skills/<name>/SKILL.md`

Alternatively, add this repository's skills path to an OpenCode config:

```json
{
  "skills": {
    "paths": ["<path-to-agents-and-skills>/.opencode/skills"]
  }
}
```

Use an absolute path or a path relative to the config file that declares it.

### Manual Agents

OpenCode agents are loaded from project or global agent folders. Copy the selected files from `.opencode/agents/` into one of these locations:

- Project: `.opencode/agents/<name>.md`
- Global: `~/.config/opencode/agents/<name>.md`

Copy only the reviewers that are useful for the target project. They are read-only leaf validators by default.

### Manual Plugins

OpenCode project plugins are loaded from `.opencode/plugins/`. The prototype `openspec-autopilot.ts` plugin exposes the model-facing `autopilot_*` tools and depends on this repository's TypeScript Autopilot output helper and ledger validator during MVP development.

For reusable installation, copy or package the full MVP bundle, then restart OpenCode so config-time plugin files are reloaded.
Autopilot MVP bundle:

After copying `.opencode/package.json`, install or package its `@opencode-ai/plugin` dependency for the target plugin runtime, or use a bundled equivalent that already resolves it. Only merge `command.autopilot` where the Autopilot skill and plugin bundle are available.
The repository bundle smoke is source-equivalent: it verifies file presence, helper import closure, command config, and plugin server/tool execution without claiming a live OpenCode restart/loader E2E.

- `.opencode/skills/openspec-autopilot/SKILL.md`
- `.opencode/plugins/openspec-autopilot.ts`
- `.opencode/package.json`
- `tools/openspec-autopilot-controller.ts` or a bundled equivalent at the plugin/helper import path
- `tools/openspec-autopilot-output.ts` or a bundled equivalent at the plugin's import path
- `tools/openspec-autopilot-active-change-queue.ts` or a bundled equivalent at the plugin/helper import path
- `tools/openspec-autopilot-materializer.ts` or a bundled equivalent at the plugin/helper import path
- `tools/openspec-autopilot-materialization-output.ts` or a bundled equivalent at the plugin/helper import path
- `tools/openspec-autopilot-next-actions.ts` or a bundled equivalent at the plugin/helper import path
- `tools/openspec-autopilot-runtime.ts` or a bundled equivalent at the plugin/helper import path
- `tools/autopilot-worktree-lifecycle.ts` when auto/fixed parallel stream worktree create/cleanup planning is in scope
- `tools/autopilot-active-run.ts` or a bundled equivalent at the plugin/helper import path
- `tools/autopilot-scope-policy.ts` or a bundled equivalent at the plugin/helper import path
- `tools/autopilot-ledger.ts` or a bundled equivalent at the plugin's import path
- `tools/autopilot-contract.ts` or a bundled equivalent at the plugin/helper import path
- `tools/autopilot-ledger-type-gates.ts` or a bundled equivalent at the plugin/helper import path
- `tools/autopilot-path-safety.ts` or a bundled equivalent at the plugin/helper import path
- `opencode.json` `command.autopilot` entry when `/autopilot` should be available

Rollback is the reverse operation: remove the `command.autopilot` config entry, remove the plugin file and Autopilot skill, remove the plugin package dependency if unused, then restart OpenCode.

### Manual Commands

OpenCode prompt commands are configured through `opencode.json` under `command`. To expose `/autopilot` outside this repository, merge the `command.autopilot` entry from this repository's `opencode.json` into the target project or global config.

The command uses schema-backed `template` syntax and enters a normal LLM turn that instructs the model to load `openspec-autopilot` and call `autopilot_run_next`. Restart OpenCode after changing command, skill, or plugin files.

### Manual Instructions

Copy selected files from `instructions/` into a global or project `AGENTS.md` or another instruction file. Keep only rules that are durable for that scope.

## Validate

Run the structural validator and fixture-based acceptance checks after changing library artifacts:

```sh
npm run validate
npm test
```

The validator checks skill and agent frontmatter shape, README catalog sync, README routing/reviewer gate sections, repo `AGENTS.md` autonomous handoff, TypeScript-only development policy, deterministic helper automation policy, reusable reviewer permission policy, OpenCode config warnings for broad mutation-capable wildcard `allow` permissions, optional project-neutral anchors passed via `--forbidden-anchor`, trailing whitespace, and warning-level TDD guard findings for Markdown artifacts with implementation-related language that do not mention test-first, TDD, before-code fixtures/gates, or equivalent validation-first language.

For code maintainability reviews in this library, gather deterministic file-size/navigation bands with:

```sh
npm run code-quality:inventory -- --format markdown
```

For instruction-artifact context-cost reviews in this kit, gather deterministic Markdown metrics with:

```sh
npm run instruction:inventory -- --format markdown
```

Validate OpenSpec Autopilot task ledgers with:

```sh
npm run autopilot:validate -- <task-ledger.json>
```

Run layered Autopilot validation checkpoints with:

```sh
npm run autopilot:check -- --level cheap
npm run autopilot:check -- --level standard --change <change-id>
npm run autopilot:check -- --level prepush
npm run autopilot:check -- --level final --change <change-id>
```

Use `cheap` after `autopilot_run_next` returns `ledger_materialized`/`outcome: "advanced"`, after `autopilot_run_next` or `autopilot_collect` returns `advanced`, after ledger edits, or before phase-transition checkpoints; do not require it for status-only reads. It validates scoped/discovered ledgers and reports no-ledger runs as not-applicable without running the full test suite. Use `standard` before reviewer or MR handoff for scoped evidence collect and freshness checks. Use `prepush` for repository push, MR handoff, or routine ready-to-land evidence. Use `final` only in write-authorized archive or final-closure contexts because it may create/update OpenSpec follow-up changes, retro follow-ups, and retrospective outputs before running the retro gate. Add `--fail-on-warnings` for strict CI or release flows.

Collect deterministic Autopilot evidence packs for a change with:

```sh
npm run autopilot:evidence -- --change <change-id> --mode collect
npm run autopilot:evidence -- --change <change-id> --mode validate
npm run autopilot:evidence -- --change <change-id> --mode report --report openspec/changes/<change-id>/evidence-report.md
```

The evidence pack emits JSON or Markdown with stable schema/order plus a generated timestamp for ledgers, validation plans/results, reviewer routing, freshness, scenario skeletons, retrospective evidence, and residual risks. `collect` is read-only and does not run validation commands. `validate` runs the planned local validation commands and returns compact redacted summaries. `report` writes only to a new approved report path under `openspec/changes/<change-id>/` outside protected automation paths.

Plan parallel Autopilot worktree creation or post-archive cleanup with JSON input:

```sh
node tools/autopilot-worktree-lifecycle.ts --input <worktree-plan.json>
node tools/autopilot-worktree-lifecycle.ts --mode cleanup --input <cleanup-plan.json>
```

The worktree planner emits JSON actions and blockers only. It does not execute `git worktree` commands itself; callers must execute returned argv actions only after reviewing blockers, MR merged evidence, archive evidence, and repository policy.

Validate all OpenSpec changes with the first-class package gate:

```sh
npm run openspec:validate
```

Before archiving a completed OpenSpec change, validate its retrospective archive gate with:

```sh
npm run openspec:retro-followups -- <change-id>
npm run openspec:retro-gate -- <change-id>
```

The follow-up helper reads actionable `retrospective.md` `Problems Found` rows and creates/updates OpenSpec follow-up changes before archive. The retro gate then checks that `tasks.md` ends with `Retrospective Before Archive`, `retrospective.md` exists, evidence/output/archive-decision sections are present, approved skips include reason and approver, and actionable findings reference real follow-up changes with `proposal.md` and `tasks.md`.

For Autopilot contract changes, run the direct source-equivalent bundle smoke and report freshness checks when those surfaces are in scope:

```sh
node tools/test-autopilot-bundle-smoke.ts
node tools/autopilot-report-freshness.ts <change-id> --mode advisory
node tools/autopilot-report-freshness.ts <change-id> --mode archive-strict
```

The bundle smoke checks file presence, helper import paths, `.opencode/package.json`, `command.autopilot`, and plugin server/tool execution in a temp repository. It does not prove a live OpenCode restart or external target dependency installation; use it as the machine-checkable local gate before manual packaging or release notes.

For installer changes, also prove the no-write path before using a real config directory:

```sh
npm run install:global -- --dry-run --config-dir <temp-config-dir>
```

For ports from a project-local prompt set, pass anchors that must not remain in reusable Markdown:

```sh
npm run validate -- --forbidden-anchor "OldProductName" "D:/old/project/path"
```

Before pushing changes from this repository, run the pre-push gate:

```sh
npm run prepush:validate
```

The pre-push gate runs `npm run validate`, active Autopilot ledger validation when ledgers exist, `npm test`, and, when `openspec/` exists, `openspec validate --all`. If no active Autopilot ledgers exist, the Autopilot ledger gate is reported as not-applicable and does not fail the push gate.

To enable the tracked local git hook for this clone, run:

```sh
git config core.hooksPath .githooks
```

For broad instruction-artifact audits, use `instructions/instruction-artifact-audit-runbook.md` to prove repo source, installed state, runtime policy, context-cost metrics, permission semantics, reviewer gates, and non-repo changes. Capture before/after metrics such as global rules line count, top heavy skill line counts, installed-copy drift, validator test count, and reviewer findings.

## Session Retro Inventory And Analysis

Before running `opencode-total-session-retro`, generate a redacted coverage and batching ledger for locally reachable OpenCode session stores:

```sh
npm run retro:inventory -- --format markdown
```

For machine-readable fan-out manifests, write JSON only when the output path is approved for generated ledgers:

```sh
npm run retro:inventory -- --format json --out <ledger-path>
```

The inventory tool reads OpenCode SQLite stores in read-only mode, classifies Desktop state files without emitting raw prompts, redacts session IDs/project names/paths by default, and suggests stable batches for later evidence review. Use `--db <path>`, `--data-dir <path>`, or `--desktop-dir <path>` for explicit sources, `--only-explicit` to disable default path discovery, and `--show-paths` only when home-redacted source paths are acceptable. Existing `--out` files are refused unless `--overwrite` is passed explicitly.

After inventory, gather deterministic structured metrics without transcript-content heuristics:

```sh
npm run retro:analyze -- --format markdown
```

The analysis tool reads OpenCode SQLite stores in read-only mode and emits redacted schema/table counts, session/day/project/agent/model buckets, message/part JSON envelope counts, tool names/statuses, input key names, deterministic tool-error categories, open TODO counts, edit/validation/git-review readiness proxies, event types, and session summary counters. Markdown output highlights action-oriented rollups for tool error hotspots, tool error categories, readiness signals, open TODOs, TODO status/priority counts, daily session buckets, and `session_message` types. It does not emit raw prompts, command values, session titles, project names, workspace names, stable IDs, account tokens, or share secrets. It may inspect tool `error`/`output`/`message` strings only to set fixed error-category buckets and bash command values only to set explicit validation/git-review proxy categories; it emits category names, booleans, and counts rather than those inspected values. These categories and proxies are mechanical signals, not root-cause or intent findings. Use `--db <path>` or `--data-dir <path>` for explicit sources, `--only-explicit` to disable default path discovery, and `--show-paths` only when home-redacted source paths are acceptable. Use `--include-session-cards` with `--format json` when a redacted mechanical per-session envelope is needed; for large stores, combine it with an approved `--out <path>` because it emits one JSON card per session. Use `--out <path>` only for approved generated analysis reports; existing files are refused unless `--overwrite` is passed explicitly.

## Routing Map

- Broad, unclear, high-risk, or process-sensitive delivery -> `adaptive-delivery`; let it choose direct execution, planning, OpenSpec, architecture, orchestration, or reviewer gates.
- Explicit planning-only work -> `deep-task-planning`; if the request is broad delivery rather than planning-only, start with `adaptive-delivery`.
- Agent-oriented OpenSpec Autopilot continuation, explicit `/autopilot`, `autopilot`, ready OpenSpec task ledgers/queues, unfinished active OpenSpec changes in `tasks.md` during explicit `/autopilot` materialization or handoff, strict task-type phase enforcement, safe parallel OpenSpec work with plugin/runtime selection evidence, or `работай` inside an active Autopilot context -> `openspec-autopilot`; the agent should call `autopilot_run_next` first, pass explicit user or command scope as `changeId`/`taskId`, treat the plugin as the authoritative process/state machine, prefer `nextActions`, `reasonCode`, `taskSummaries`, `selection`, and `loopGuard`, use `nextRecommendedCall` only as a compatibility fallback, and report deterministic selection evidence. `ledger_materialized` means the plugin created `<ledgerRoot>/<change>/automation/task.json` (default `<ledgerRoot>` is `openspec/changes`) for the selected active OpenSpec change and returned `tasksAdvanced[]` validation evidence; no implementation worker was claimed, and the agent should follow returned `nextActions[]` because a ledger-backed follow-up `autopilot_run_next` is safe after state changed. Respect current MVP `reasonCode: "ready_runtime_deferred"`, `reasonCode: "active_change_handoff"`, `no_ledgers`, or no-op outputs instead of inferring dispatch, MR sync, or worker starts. For `active_change_handoff`, use `selection.selectedTaskId` to continue the selected unfinished active OpenSpec change through `openspec-apply-change`. Plugin-owned runtime harness output may report `advanced` for validated in-memory claim/collect/stop transitions without protected-file mutation; claim can record active runtime state and collect consumes accepted worker report ids so repeated calls report already-consumed/no-progress instead of advancing again. `selection.candidates[].parallelDecision: "parallel_ready"` is visibility evidence only; `parallel_started` requires explicit parallel runtime output plus matching `tasksStarted` evidence. Explicit auto parallel policy requires `parallelImplementation.enabled: true` plus auto mode or `maxImplementationClaims: "auto"`, and may return `selection.mode: "auto_parallel_implementation"`; `selection.maxImplementationClaims` stays numeric while `selection.autoDecision` records `riskClass`, `conflictTolerance`, accepted soft conflict scopes, rejected reasons, and fan-in requirements. Auto multi-start or accepted soft-conflict runs require passed fan-in evidence before terminal readiness. Archive-ready and MR-ready handoffs require the same fan-in evidence through agent/reviewer gates until first-class plugin checks exist.
- Autopilot parallel worktree lifecycle -> fixed or auto parallel implementation streams require one owned `autopilot/...` git worktree per started stream, task-to-`worktreePath` evidence in selection/start/active-run output, MR integration back into the main repository, and cleanup only after MR merged evidence plus archived-change evidence. Use `tools/autopilot-worktree-lifecycle.ts`, or plugin-returned lifecycle action plans when explicitly present, for deterministic `git worktree add`, `git worktree remove`, and `git worktree prune` planning; do not rely on prose-only cleanup reminders.
- Autopilot escape hatch -> for `ready_runtime_deferred`, `active_change_handoff`, `no_ledgers`, `no_actionable_tasks`, stale evidence, or evidence conflict, do not repeat equivalent no-progress Autopilot calls; hand off to `openspec-apply-change` for `active_change_handoff`, or to `next-step`, manual direct work, `orchestrator`, or a follow-up OpenSpec change according to the state reported by `nextActions[]` and local validation. Do not treat `ledger_materialized` as no-progress: follow the returned ledger-backed `nextActions[]` because the plugin-owned `task.json` now exists. `no_ledgers` means neither applicable Autopilot ledgers nor unfinished active OpenSpec changes in `tasks.md` were found.
- Existing OpenSpec continuation or "what next" work without ready Autopilot ledgers -> `next-step` from the `advanced` profile; accepted OpenSpec implementation that does not need queue/runtime orchestration -> `openspec-apply-change`; new OpenSpec packages -> `openspec-propose`; consistency/archive work -> the matching OpenSpec review/archive skill.
- Casual codebase questions and one obvious small edit -> use direct search/edit workflow unless an active Autopilot context or ready ledger requires the control plane.
- Several session-scoped follow-ups from an audit, retro, reviewer gate, broad discovery, or validation failure -> group them into lightweight OpenSpec changes with `openspec-propose` when OpenSpec exists or is approved and the advanced profile is available; otherwise return grouped continuation candidates.
- Initial MR/PR title/body preparation -> `merge-request-author`; existing MR/PR checks, reviewer feedback, approvals, and outcome handling -> `merge-request-review-loop`.
- Broad independent tracks -> `orchestrator` from the `advanced` profile only after bounded workstreams, success criteria, and validation evidence are clear; if it is unavailable, use the Universal Development Loop serially or return an orchestration follow-up candidate.
- Skills, agents, prompts, `AGENTS.md`, and other instruction artifacts -> `instruction-artifact-tuning`; bounded/current-project/selected-project OpenCode session, transcript, reflection, and log retros -> `session-archive-retro`; all-history/cross-install/whole-corpus retros targeting global skills, agents, prompts, rules, validators, tools, and reusable instructions -> `opencode-total-session-retro`; for broad audits also use `instruction-artifact-audit-runbook.md`; use `instruction-artifact-reviewer` as the read-only post-change gate.
- Documentation review selection: use `documentation-learning-quest` for guided onboarding, `file-review-quest` for one-file block review, `documentation-hardening-loop` for non-trivial doc/spec hardening, `openspec-consistency-review` for OpenSpec synchronization, and `codebase-audit-loop` only for exhaustive codebase audits.
- Code maintainability/readability after non-trivial implementation, refactoring, large-file navigation, duplication, DRY/SOLID/YAGNI, or design-pattern trade-off work -> `code-quality-audit`; use `code-quality-reviewer` as the read-only gate.

## Reviewer Gate Map

- Instruction artifacts, skills, agents, prompts, `AGENTS.md`, and README routing -> `instruction-artifact-reviewer`.
- Code health, maintainability, readability, file navigation, duplication, boundaries, and pragmatic refactoring -> `code-quality-reviewer`.
- Implementation readiness, stable scope, blockers, validation path -> `implementation-readiness-reviewer`.
- OpenSpec/design/architecture ownership and consistency -> `openspec-architecture-reviewer`.
- Requirements-to-tests, weak assertions, missing gates -> `test-coverage-reviewer`.
- Config, deployment, packaging, operational safety -> `deployment-config-reviewer`.
- Latency, throughput, load isolation, recovery evidence -> `performance-reliability-reviewer`.
- Rust async/concurrency/backpressure/shutdown -> `rust-concurrency-reviewer`.
- Protocol/API semantics, schema evolution, correlation, reconnect -> `protocol-api-reviewer`; byte-level fixtures, framing, golden vectors -> `wire-protocol-reviewer`.
- Legacy source evidence and compatibility behavior -> `legacy-evidence-reviewer`; legacy client/tool workflow compatibility -> `legacy-client-compatibility-reviewer`.

## OpenSpec Follow-Up Tracking

Use OpenSpec as a durable follow-up tracker when a session produces a real backlog, not for every incidental note.

This repository's OpenSpec guide starts at `openspec/project.md`; active changes live under `openspec/changes/<change-id>/`.

- Good triggers: codebase audits, session retros, instruction-artifact audits, reviewer gates, broad discovery, and validation failure triage that produce several concrete tasks outside the current approved scope.
- Bad triggers: isolated nits, speculative polish, local style preferences, duplicated final-answer bullets, or one obvious next step.
- Prefer one OpenSpec change per coherent outcome, capability, risk area, or artifact family. For lightweight backlog changes, `tasks.md` can be the primary surface; add proposal/spec/design detail only when requirements, behavior, compatibility, architecture, or acceptance criteria need it.
- Create or update OpenSpec files only when the repository already has an OpenSpec workflow or the user approved adding one; otherwise return grouped follow-up candidates as continuation items.
- Reviewer agents remain read-only: they recommend OpenSpec follow-up tracking in `Actionable Continuation Items`; the main session owns any file writes and `next-step` continuation.

## OpenSpec Retrospective Gate

Before archiving a completed OpenSpec change, write `openspec/changes/<change-id>/retrospective.md`, run `npm run openspec:retro-followups -- <change-id>` when available to create/update follow-up OpenSpec changes for actionable findings, then run `npm run openspec:retro-gate -- <change-id>`. New `tasks.md` files should end with `Retrospective Before Archive` so the final learning step is machine-checkable.

`retrospective.md` should stay concise but evidence-backed. Include `Evidence Reviewed`, `Problems Found`, `Outputs`, and `Archive Gate Decision`. Actionable project-local or reusable Autopilot/skill/agent/instruction/validator/evidence-pack findings must become real OpenSpec follow-up changes referenced from `Outputs`; otherwise use `Target` `none` only for findings fixed in scope, intentionally non-actionable items, or justified no-follow-up decisions. Approved skips must include a reason and approver.

## Skill Catalog

### Planning And Workflow

- `adaptive-delivery`: adaptive entrypoint for broad, unclear, high-risk, or process-sensitive work; chooses the smallest useful lane across direct execution, planning, OpenSpec, architecture, orchestration, and reviewer gates.
- `deep-task-planning`: execution-grade plans for complex work.
- `next-step`: discover OpenSpec-backed workstreams, route ready ledgers/queues to `openspec-autopilot`, request approval for non-Autopilot fan-out, or choose one concrete serial next step.
- `merge-request-author`: reviewer-friendly PR/MR title/body/validation/risk authoring.
- `merge-request-review-loop`: autonomous MR/PR review follow-up for status checks, reviewer feedback, local fixes, revalidation, outcome handoff, and remote-action gates.
- `instruction-artifact-tuning`: review/tune skills, agents, prompts, and `AGENTS.md`.
- `orchestrator`: prompt-only master coordination for broad independent non-Autopilot work, using bounded task fan-out, readable worker reports, report reconciliation, tests/review gates, and isolation only when worth the overhead; it is not a durable runtime orchestration service.
- `opencode-total-session-retro`: analyze all reachable OpenCode sessions across projects and installs, synthesize session-level insights into trends, and when authorized design/apply improvements to global skills, agents, prompts, rules, validators, tools, and reusable instructions.
- `session-archive-retro`: analyze bounded/current-project session history, transcripts, and logs for recurring workflow improvements.

### Review And Learning

- `file-review-quest`: block-by-block file review with coverage.
- `documentation-learning-quest`: guided docs onboarding and lightweight review.

### Documentation And Audit

- `code-quality-audit`: pragmatic code-health review after non-trivial code changes, focusing on maintainability, readability, file navigation, duplication, overengineering, code smells, and minimal refactoring remedies.
- `documentation-hardening-loop`: docs/spec review-fix-validate loop.
- `documentation-block-ledger`: helper ledger for full docs block coverage.
- `codebase-audit-loop`: exhaustive audit workflow for bugs, redundancy, test gaps, performance, and maintainability.
- `codebase-audit-ledger`: helper ledger for exhaustive audit coverage.

### OpenSpec

- `openspec-autopilot`: agent-oriented OpenSpec Autopilot control plane for ready task ledgers/queues, unfinished active OpenSpec changes in `tasks.md` during explicit `/autopilot` materialization or `active_change_handoff`, safe fixed or auto parallel OpenSpec work with plugin/runtime selection evidence, idempotent worker-report collect checks, and strict task-type phases; call `autopilot_run_next` to inspect/continue until blocker, MR wait, limit, `reasonCode: "ledger_materialized"`, `reasonCode: "active_change_handoff"`, or the current MVP `reasonCode: "ready_runtime_deferred"`/no-op boundary. `ledger_materialized` creates `<ledgerRoot>/<change>/automation/task.json` (default `<ledgerRoot>` is `openspec/changes`) with `tasksAdvanced[]` validation evidence, safe `nextActions[]`, and no implementation worker claim; for `active_change_handoff`, continue the selected change with `openspec-apply-change`. Auto parallel output requires `parallelImplementation.enabled: true`, uses numeric resolved `selection.maxImplementationClaims`, optional `selection.autoDecision`, task-to-`worktreePath` evidence for started streams, and fan-in validation before terminal readiness when multiple tasks start or soft conflicts are accepted. Archive-ready and MR-ready handoffs require the same fan-in evidence through agent/reviewer gates until first-class plugin checks exist. Parallel streams use one owned worktree per stream, MR integration, and post-archive cleanup gated by MR merged plus archive evidence. `no_ledgers` means neither applicable ledgers nor unfinished active OpenSpec changes were found.
- `openspec-explore`: explore requirements/options before a change.
- `openspec-propose`: draft proposal/design/spec/tasks, including lightweight follow-up backlog changes from audit/retro/reviewer evidence.
- `openspec-apply-change`: implement accepted OpenSpec changes with TDD-first task execution.
- `openspec-consistency-review`: review proposal/design/spec/tasks/docs/tests sync.
- `openspec-archive-change`: archive completed changes after evidence gates.
- `production-service-openspec`: production-oriented service baseline change authoring.

### Technical Domains

- `config-schema-validation`: config schema/defaults/limits/reload diagnostics.
- `rust-workspace-bootstrap`: Rust workspace and crate bootstrap.
- `windows-service-packaging`: Windows service/tray/installer lifecycle.
- `operation-scheduler-recovery`: queues, admission, ownership, cancellation, recovery.
- `latency-benchmark-pack`: latency/load/SLO benchmark evidence.
- `legacy-contract-extract`: extract contracts from legacy sources.
- `external-service-simulator-harness`: deterministic fake external services for tests.
- `framed-protocol-implementation`: framed protocol/schema/session implementation.
- `wire-protocol-golden-tests`: golden byte/vector tests for protocols.
- `service-architecture-design`: service architecture gate.
- `com-activex-adapter-implementation`: COM/ActiveX adapter compatibility workflow.

## Agent Catalog

- `code-quality-reviewer`: maintainability/readability reviewer for code smells, file bloat, duplication, boundaries, overengineering, and pragmatic refactoring gates.
- `test-coverage-reviewer`: task/repro/runtime-envelope coverage, requirement-to-test matrix, missing tests, weak assertions.
- `implementation-readiness-reviewer`: stable scope, decisions, blockers, validation readiness.
- `openspec-architecture-reviewer`: architecture/OpenSpec consistency and ownership risks.
- `rust-concurrency-reviewer`: Rust async/concurrency/backpressure/shutdown risks.
- `performance-reliability-reviewer`: latency, throughput, starvation, overload, recovery evidence.
- `deployment-config-reviewer`: config/deployment readiness and operational safety.
- `protocol-api-reviewer`: framed/client API, schema evolution, correlation, reconnect.
- `wire-protocol-reviewer`: byte-level protocol/transport review.
- `legacy-evidence-reviewer`: requirement/design verification against legacy evidence.
- `legacy-client-compatibility-reviewer`: compatibility with legacy clients/tools/workflows.
- `instruction-artifact-reviewer`: read-only review of skills, agents, prompts, `AGENTS.md`, README routing, autonomy handoff, and safety boundaries.

## Instruction Templates

- `global-opencode-agent-instructions.md`: generic global `~/.config/opencode/AGENTS.md` baseline.
- `universal-development-loop.md`: one canonical AI-assisted engineering loop for every target project.
- `reusable-project-agent-instructions.md`: project-level `AGENTS.md` baseline.
- `leaf-reviewer-agent-contract.md`: reusable read-only reviewer subagent contract.
- `evidence-and-validation.md`: evidence hierarchy and validation discipline.
- `instruction-artifact-audit-runbook.md`: reproducible audit contract for skills, agents, installed state, runtime policy, context cost, permissions, and non-repo changes.
- `porting-checklist.md`: checklist for turning project-local prompts into reusable artifacts.

## Porting Notes

These artifacts were generalized from project-local workflows. Project-specific anchors were removed or renamed into domain-neutral forms:

- Product architecture -> `service-architecture-design`.
- Product protocol implementation -> `framed-protocol-implementation` and `protocol-api-reviewer`.
- Product wire-format review -> `wire-protocol-golden-tests` and `wire-protocol-reviewer`.
- Device/upstream simulator -> `external-service-simulator-harness`.
- Legacy UI/tool compatibility -> `legacy-client-compatibility-reviewer` and `legacy-evidence-reviewer`.
- Production baseline spec authoring -> `production-service-openspec`.

Overly narrow future-scope behavior that depended on one product domain was intentionally not ported.

## Curation Rules

- Keep artifacts project-neutral unless the artifact name explicitly scopes a reusable domain.
- Prefer concrete evidence, validation, permissions, and output schemas over vague instructions.
- For repetitive, evidence-heavy, or token-heavy workflows, consider a small deterministic helper before adding more prose process.
- When several session-scoped follow-ups appear outside approved scope, prefer grouping them into OpenSpec changes when OpenSpec exists or is approved instead of leaving an untracked final-message backlog; avoid OpenSpec ceremony for isolated nits or one obvious next step.
- Helper automation in skills or agents must be deterministic and contract-driven: explicit inputs/outputs, fixtures or schemas, stable ordering, privacy-safe output, and no hidden heuristics.
- Implementation-capable artifacts should require TDD/test-first by default for behavior changes, or require an explicit infeasibility note plus the closest reproducible validation evidence.
- Keep TDD proportional: require the smallest useful test/gate for the scoped behavior, not unrelated coverage expansion or speculative test suites.
- Reviewer agents should remain leaf validators with `bash`, `edit`, `task`, `question`, `skill`, `webfetch`, `websearch`, `todowrite`, `external_directory`, `lsp`, and `doom_loop` denied unless a separate validation-enabled profile is intentionally created.
- Avoid hardcoded commands and paths. Use placeholders or say to use the repository's configured validation command.
- If a target repository has stricter local instructions, local instructions win.
