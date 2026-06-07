# agents-and-skills

Reusable OpenCode skills, reviewer agents, and instruction templates for agentic software development.

## Contents

- `.opencode/skills/`: reusable OpenCode skills.
- `.opencode/agents/`: reusable read-only reviewer agents.
- `instructions/`: copyable instruction templates for global/project `AGENTS.md`, reviewer contracts, evidence discipline, and porting.
- `tools/`: validation and install scripts for this library.

## Install

### Global Install

Install all skills, agents, and a reusable global `AGENTS.md` block into OpenCode's global config directory:

```sh
node tools/install-opencode-global.js
```

By default this installs into `~/.config/opencode`, copies skills to `skills/`, copies agents to `agents/`, and adds `instructions/global-opencode-agent-instructions.md` as an idempotent marked block in `~/.config/opencode/AGENTS.md` without deleting existing user instructions. Existing changed files/directories are backed up under `.backups/agents-and-skills/` before replacement, outside OpenCode's loader folders.

Useful options:

- `--dry-run` or `--what-if`: preview changes without writing files.
- `--config-dir <path>`: install into a custom OpenCode config directory.
- `--agents-md-source <path>`: install a custom source file into the global `AGENTS.md` block.
- `--skip-agents-md`: install only skills and agents.
- `--no-backup`: replace changed artifacts without creating backup copies.

Use `--agents-md-source AGENTS.md` only if you intentionally want this repository's local maintenance rules in the global `AGENTS.md` block.

Restart OpenCode after installing; config-time files are loaded at startup.

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

### Manual Instructions

Copy selected files from `instructions/` into a global or project `AGENTS.md` or another instruction file. Keep only rules that are durable for that scope.

## Validate

Run the structural validator after changing library artifacts:

```powershell
pwsh -NoProfile -File tools/validate-library.ps1
```

For ports from a project-local prompt set, pass anchors that must not remain in reusable Markdown:

```powershell
pwsh -NoProfile -File tools/validate-library.ps1 -ForbiddenAnchor "OldProductName","D:/old/project/path"
```

## Skill Catalog

### Planning And Workflow

- `deep-task-planning`: execution-grade plans for complex work.
- `next-step`: choose the next concrete spec/doc/code/validation step.
- `merge-request-author`: reviewer-friendly PR/MR title/body/validation/risk authoring.
- `instruction-artifact-tuning`: review/tune skills, agents, prompts, and `AGENTS.md`.
- `orchestrator`: coordinate broad OpenCode work with clear independent tracks through concise task fan-out, report synthesis, and temporary worktrees only when isolation is worth the overhead.
- `reflection-retro`: turn accumulated reflection files into workflow improvements.
- `session-archive-retro`: analyze session history/transcripts/logs for recurring workflow improvements.

### Review And Learning

- `file-review-quest`: block-by-block file review with coverage.
- `documentation-learning-quest`: guided docs onboarding and lightweight review.

### Documentation And Audit

- `documentation-hardening-loop`: docs/spec review-fix-validate loop.
- `documentation-block-ledger`: helper ledger for full docs block coverage.
- `codebase-audit-loop`: exhaustive audit workflow for bugs, redundancy, test gaps, performance, and maintainability.
- `codebase-audit-ledger`: helper ledger for exhaustive audit coverage.

### OpenSpec

- `openspec-explore`: explore requirements/options before a change.
- `openspec-propose`: draft proposal/design/spec/tasks.
- `openspec-apply-change`: implement accepted OpenSpec changes.
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

- `test-coverage-reviewer`: requirement-to-test matrix, missing tests, weak assertions.
- `implementation-readiness-reviewer`: stable scope, decisions, blockers, validation readiness.
- `openspec-architecture-reviewer`: architecture/OpenSpec consistency and ownership risks.
- `rust-concurrency-reviewer`: Rust async/concurrency/backpressure/shutdown risks.
- `performance-reliability-reviewer`: latency, throughput, starvation, overload, recovery evidence.
- `deployment-config-reviewer`: config/deployment readiness and operational safety.
- `protocol-api-reviewer`: framed/client API, schema evolution, correlation, reconnect.
- `wire-protocol-reviewer`: byte-level protocol/transport review.
- `legacy-evidence-reviewer`: requirement/design verification against legacy evidence.
- `legacy-client-compatibility-reviewer`: compatibility with legacy clients/tools/workflows.

## Instruction Templates

- `global-opencode-agent-instructions.md`: generic global `~/.config/opencode/AGENTS.md` baseline.
- `reusable-project-agent-instructions.md`: project-level `AGENTS.md` baseline.
- `leaf-reviewer-agent-contract.md`: reusable read-only reviewer subagent contract.
- `evidence-and-validation.md`: evidence hierarchy and validation discipline.
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
- Reviewer agents should remain leaf validators.
- Avoid hardcoded commands and paths. Use placeholders or say to use the repository's configured validation command.
- If a target repository has stricter local instructions, local instructions win.
