# opencode-dev-kit

Installable OpenCode development kit for reusable AI-assisted engineering workflows across projects.

## What This Is

`opencode-dev-kit` packages reusable OpenCode skills, read-only reviewer and worker agents, project templates, instruction templates, and deterministic helper tools. Its purpose is to make work in other repositories faster, cheaper in tokens, and safer without creating a different workflow for every technology stack.

The kit optimizes one process: gather evidence, prove current state, choose the smallest useful slice, work test-first when behavior changes, validate, run proportional reviewer gates, and hand off with residual risks.

## Universal Development Loop

The central contract is `instructions/universal-development-loop.md`:

```text
Intake -> Evidence -> Baseline Proof -> Small Slice -> Test First -> Implement -> Focused Validation -> Review Gate -> Final Validation -> Handoff -> Process Improvement
```

Technology adapters may change commands and constraints, but not the loop.

## Contents

- `.opencode/skills/`: reusable OpenCode skills.
- `.opencode/agents/`: reusable read-only reviewer and worker agents.
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
- `--profile <standard|strict|advanced>`: restrict the installed artifact set without changing the Universal Development Loop.
- `--agents-md-source <path>`: install a custom source file into the global `AGENTS.md` block.
- `--skip-agents-md`: install only skills and agents.
- `--no-prune`: keep destination skills/agents not present in this repository.
- `--no-backup`: replace changed or pruned artifacts without creating backup copies.

Use `--agents-md-source AGENTS.md` only if you intentionally want this repository's local maintenance rules in the global `AGENTS.md` block.

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

- Use the Universal Development Loop instead of choosing among competing workflows.
- Use `project:inventory`, `code-quality:inventory`, `glob`, and `grep` before broad file reads.
- On native Windows, use `rtk <command>` explicitly for shell-heavy read-only commands; do not rely on hook auto-rewrite.
- Use Headroom MCP tools only on demand for large logs, search results, JSON, or tool outputs; retrieve originals before trusting exact code, errors, or safety-critical details.
- Route Headroom MCP through `tools/headroom-mcp-wrapper.ts` when OpenCode expects MCP prompts; the wrapper adds a small `headroom_usage_policy` prompt and proxies Headroom tools unchanged.
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

OpenCode agents are loaded from project or global agent folders. Copy selected files from `.opencode/agents/` into one of these locations:

- Project: `.opencode/agents/<name>.md`
- Global: `~/.config/opencode/agents/<name>.md`

Copy only the agents that are useful for the target project. They are read-only leaf validators or bounded read-only workers by default.

### Manual Commands

OpenCode prompt commands are configured through `opencode.json` under `command`. This repository does not currently ship project commands.

### Manual Instructions

Copy selected files from `instructions/` into a global or project `AGENTS.md` or another instruction file. Keep only rules that are durable for that scope.

## Validate

Run structural validation and fixture-based acceptance checks after changing library artifacts:

```sh
npm run validate
npm test
```

The validator checks skill and agent frontmatter shape, skill trigger/output contracts, compact reviewer leaf contracts, README catalog/routing sync, repo/project-template autonomy and remote/destructive guards, TypeScript-only development policy, deterministic helper automation policy, reusable reviewer permission policy, OpenCode config warnings for broad mutation-capable wildcard `allow` permissions, optional project-neutral anchors passed via `--forbidden-anchor`, trailing whitespace, and warning-level TDD guard findings for Markdown artifacts with implementation-related language that do not mention test-first, TDD, before-code fixtures/gates, or equivalent validation-first language.

For code maintainability reviews in this library, gather deterministic file-size/navigation bands with:

```sh
npm run code-quality:inventory -- --format markdown
```

For instruction-artifact context-cost reviews in this kit, gather deterministic Markdown metrics with:

```sh
npm run instruction:inventory -- --format markdown
```

Validate all OpenSpec changes with the first-class package gate:

```sh
npm run openspec:validate
```

Run deterministic operation gates before sensitive OpenSpec lifecycle steps with:

```sh
npm run openspec:gate -- --operation apply --change <change-id>
npm run openspec:gate -- --operation archive --change <change-id>
npm run openspec:gate -- --operation prepush
```

Use `--persist` only when a JSON evidence artifact should be written to `openspec/changes/<change-id>/automation/operation-gates/<operation>.json` from a write-authorized main session. Default operation-gate runs are read-only.

Before archiving a completed OpenSpec change, create/update retrospective follow-ups with the mutating helper, then validate the read-only retrospective archive gate with:

```sh
npm run openspec:retro-followups -- <change-id>
npm run openspec:retro-gate -- <change-id>
```

Use `npm run openspec:retro-followups -- <change-id> --dry-run` for read-only inspection. Without `--dry-run`, the follow-up helper reads actionable problem entries from `openspec/changes/<change-id>/automation/retro.json`, creates/updates OpenSpec follow-up changes before archive, and updates JSON follow-up ids. The retro gate then checks that `tasks.md` ends with `Retrospective Before Archive`, `automation/retro.json` exists, required schema fields are present, approved skips include reason and approver, actionable problems include `rootCause`, and actionable findings reference real follow-up changes with `proposal.md`, `tasks.md`, and `specs/<generated-id>/spec.md` that preserve the retrospective evidence and root cause.

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

The pre-push gate runs `npm run validate`, `npm run openspec:gate -- --operation prepush` when `openspec/` exists, `npm test`, and `npm run openspec:validate`.

To enable the tracked local git hook for this clone, run:

```sh
git config core.hooksPath .githooks
```

For broad instruction-artifact audits, use `instructions/instruction-artifact-audit-runbook.md` to prove repo source, installed state, runtime policy, context-cost metrics, permission semantics, reviewer gates, and non-repo changes. Capture before/after metrics such as global rules line count, top heavy skill line counts, installed-copy drift, validator test count, and reviewer findings.

## Session Retro Inventory And Analysis

Before running `all-sessions-retro`, generate a redacted coverage and batching ledger for locally reachable OpenCode session stores:

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

The analysis tool reads OpenCode SQLite stores in read-only mode and emits redacted schema/table counts, session/day/project/agent/model buckets, message/part JSON envelope counts, tool names/statuses, input key names, deterministic tool-error categories, open TODO counts, edit/validation/git-review readiness proxies, event types, and session summary counters. It does not emit raw prompts, command values, session titles, project names, workspace names, stable IDs, account tokens, or share secrets.

## Routing Map

Routing and reviewer maps assume all/advanced artifacts; restricted profiles use the closest installed core route or install `advanced`/all.

- Broad, unclear, high-risk, or process-sensitive delivery -> `adaptive-delivery`; let it choose direct execution, planning, OpenSpec, architecture, orchestration, or reviewer gates.
- Explicit planning-only work -> `deep-task-planning`; if the request is broad delivery rather than planning-only, start with `adaptive-delivery`.
- Existing OpenSpec continuation or "what next" work -> `next-step` from the `advanced` profile; accepted OpenSpec implementation -> `openspec-apply-change`; new OpenSpec packages -> `openspec-propose`; consistency/archive work -> the matching OpenSpec review/archive skill.
- Several session-scoped follow-ups from an audit, retro, reviewer gate, broad discovery, or validation failure -> group them into lightweight OpenSpec changes with `openspec-propose` when OpenSpec exists or is approved and the advanced profile is available; otherwise return grouped continuation candidates.
- Initial MR/PR title/body preparation -> `merge-request-author`; existing MR/PR checks, reviewer feedback, approvals, and outcome handling -> `merge-request-review-loop`.
- Broad independent tracks -> `orchestrator` from the `advanced` profile only after bounded workstreams, success criteria, and validation evidence are clear; if it is unavailable, use the Universal Development Loop serially or return an orchestration follow-up candidate.
- Bounded first-pass helper work that benefits from cheap/offline local context, such as long-context retrieval, JSON extraction, scoped review, test ideas, planning, or tool-call checks -> `qwen-local-worker` from the `advanced` profile when the target machine has a configured `qwen-local` provider.
- Session delivery-control review for transcript/summary, compaction/resume continuity, user goal, changed files, and validation output -> `session-delivery-reviewer`.
- Skills, agents, prompts, `AGENTS.md`, and other instruction artifacts -> `instruction-artifact-tuning`; bounded/current-project/selected-project OpenCode session, transcript, reflection, and log retros -> `project-sessions-retro`; all-history/cross-install/whole-corpus retros targeting global skills, agents, prompts, rules, validators, tools, and reusable instructions -> `all-sessions-retro`; for broad audits also use `instruction-artifact-audit-runbook.md`; use `instruction-artifact-reviewer` as the read-only post-change gate.
- Documentation review selection: use `documentation-learning-quest` for guided onboarding, `file-review-quest` for one-file block review, `documentation-hardening-loop` for non-trivial doc/spec hardening, `openspec-consistency-review` for OpenSpec synchronization, and `codebase-audit-loop` only for exhaustive codebase audits.
- Code maintainability/readability after non-trivial implementation, refactoring, large-file navigation, duplication, DRY/SOLID/YAGNI, or design-pattern trade-off work -> `code-quality-audit`; use `code-quality-reviewer` as the read-only gate.

## Reviewer Gate Map

- Instruction artifacts, skills, agents, prompts, `AGENTS.md`, and README routing -> `instruction-artifact-reviewer`.
- Code health, maintainability, readability, file navigation, duplication, boundaries, and pragmatic refactoring -> `code-quality-reviewer`.
- Implementation readiness, stable scope, blockers, validation path -> `implementation-readiness-reviewer`.
- Session delivery alignment, compaction continuity, proportional rigor, missed work, risks, validation/review completeness, and acceptance handoff -> `session-delivery-reviewer`.
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

Before archiving a completed OpenSpec change, write `openspec/changes/<change-id>/automation/retro.json`, run `npm run openspec:retro-followups -- <change-id>` when available to create/update follow-up OpenSpec changes for actionable findings, then run `npm run openspec:retro-gate -- <change-id>`. New `tasks.md` files should end with `Retrospective Before Archive` so the final learning step is machine-checkable and includes root-cause review.

`automation/retro.json` should stay concise but evidence-backed. It includes `schemaVersion`, `changeId`, `evidenceReviewed`, `problems`, `outputs`, and `archiveGate`. Problem entries use `problem`, `evidence`, `impact`, `rootCause`, `recommendation`, `confidence`, `target`, `followUpChangeId`, and `noFollowUpReason`; actionable recommendations should address the cause or explicitly route an investigation/instrumentation follow-up when the cause is `unknown`. Actionable project-local or reusable skill/agent/instruction/validator findings must become real OpenSpec follow-up changes referenced from JSON outputs; otherwise use `target` `none` only for findings fixed in scope, intentionally non-actionable items, or justified no-follow-up decisions. Approved skips must include a reason and approver.

## Skill Catalog

### Planning And Workflow

- `adaptive-delivery`: adaptive entrypoint for broad, unclear, high-risk, or process-sensitive work; chooses the smallest useful lane across direct execution, planning, OpenSpec, architecture, orchestration, and reviewer gates.
- `deep-task-planning`: execution-grade plans for complex work.
- `next-step`: discover OpenSpec-backed workstreams, choose one serial next step, or hand bounded independent streams to `orchestrator` when safe.
- `merge-request-author`: reviewer-friendly PR/MR title/body/validation/risk authoring.
- `merge-request-review-loop`: autonomous MR/PR review follow-up for status checks, reviewer feedback, local fixes, revalidation, outcome handoff, and remote-action gates.
- `instruction-artifact-tuning`: review/tune skills, agents, prompts, and `AGENTS.md`.
- `orchestrator`: prompt-only master coordination for broad independent work, using bounded task fan-out, readable worker reports, report reconciliation, tests/review gates, and isolation only when worth the overhead.
- `all-sessions-retro`: analyze all reachable OpenCode sessions across projects and installs, synthesize trends/root causes, and when authorized design/apply improvements to global skills, agents, prompts, rules, validators, tools, and reusable instructions.
- `project-sessions-retro`: analyze bounded/current-project session history, transcripts, and logs for recurring workflow problems, root causes, and improvements.

### Review And Learning

- `file-review-quest`: block-by-block file review with coverage.
- `documentation-learning-quest`: guided docs onboarding and lightweight review.

### Documentation And Audit

- `code-quality-audit`: pragmatic code-health review after non-trivial code changes, focusing on maintainability, readability, file navigation, duplication, overengineering, code smells, and minimal refactoring remedies.
- `documentation-hardening-loop`: docs/spec review-fix-validate loop.
- `documentation-block-ledger`: helper ledger for full docs block coverage.
- `codebase-audit-loop`: exhaustive audit workflow for bugs, project-structure ergonomics, redundancy, test gaps, performance, and maintainability.
- `codebase-audit-ledger`: helper ledger for exhaustive audit coverage.

### OpenSpec

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
- `qwen-local-worker`: optional local Qwen3.6 first-pass helper for bounded long-context retrieval, JSON extraction, scoped review, test ideas, planning, and tool-call checks; requires a configured `qwen-local` OpenAI-compatible provider.
- `wire-protocol-reviewer`: byte-level protocol/transport review.
- `legacy-evidence-reviewer`: requirement/design verification against legacy evidence.
- `legacy-client-compatibility-reviewer`: compatibility with legacy clients/tools/workflows.
- `session-delivery-reviewer`: session transcript/compaction delivery-control reviewer for goal alignment, continuity, proportional rigor, missed work, risks, validation/review completeness, and acceptance handoff.
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
- Reviewer agents should keep the compact `Leaf Contract`, ordered findings, residual risks, and `Actionable Continuation Items`; mutation-capable tools stay denied unless a separate validation-enabled profile is intentionally created.
- Avoid hardcoded commands and paths. Use placeholders or say to use the repository's configured validation command.
- If a target repository has stricter local instructions, local instructions win.
