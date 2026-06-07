# Repository Instructions

This repository stores reusable OpenCode skills, subagents, and instruction templates.

- Keep artifacts project-neutral: do not hardcode repository names, company-internal paths, issue trackers, services, hardware, or validation commands unless the artifact is explicitly scoped to that ecosystem.
- Prefer evidence-backed workflow contracts over reminders. If a check can be automated, document the command shape or validation hook instead of adding vague prose.
- For behavior-changing implementation work in skills, agents, templates, tools, or examples, default to TDD: add or update the focused failing test, acceptance check, fixture, or validation scenario before implementation; if infeasible, state why and use the closest reproducible evidence.
- Keep TDD proportional: one smallest useful test/gate for the scoped behavior is enough; do not expand into unrelated coverage, broad suites, or speculative tests unless risk evidence warrants it.
- Skills and agents must be safe to reuse in unrelated repositories. Use placeholders such as `<project>`, `<change>`, `<service>`, `<legacy-source>`, and `<validation-command>` where local projects differ.
- Reviewer agents are leaf validators by default: read-only, no edits, no commits, no pushes, no nested agents, no user questions.
- Keep each artifact cohesive. Split artifacts when triggers, permissions, or output contracts differ materially.
- Preserve OpenCode compatibility: skill folders must match `name` in `SKILL.md`; agent files must use valid frontmatter and least-privilege permissions.

## TypeScript Development

- Use TypeScript for all repository automation and implementation code.
- Do not add or keep PowerShell, Python, or JavaScript source/tooling files; rewrite any such code to TypeScript instead.
- Run library tooling through `npm run validate`, `npm test`, `npm run install:global -- ...`, `npm run retro:inventory -- ...`, and `npm run retro:analyze -- ...`; do not introduce `.ps1`, `.py`, or `.js` entrypoints.
- JSON, Markdown, YAML, and other config/data files are allowed when they are not implementation code.

## Deterministic Helper Automation

- For repetitive, evidence-heavy, or token-heavy work, first consider whether a small deterministic helper could gather, count, validate, redact, diff, inventory, or enforce explicit rules more efficiently than manual inspection.
- When writing helper code for agent workflow, make it deterministic and contract-driven: explicit inputs, explicit outputs, schemas or fixtures, stable ordering, and privacy-safe output.
- Helper code must have no hidden heuristics: do not encode fuzzy scoring, probabilistic classification, model-like summarization, or unstated inference as evidence.
- If deterministic helper code cannot answer something from its inputs, report `unknown`, `unreadable`, `unsupported`, or `blocked` instead of guessing.
- Keep judgment-heavy synthesis in the agent/reviewer layer; use helper code to gather, count, validate, redact, diff, inventory, or enforce explicit rules.
- For OpenCode retro analytics in this repository, durable TypeScript helper scripts are allowed when they materially reduce analysis work; add or update a focused test first, expose reusable helpers through `package.json`, and update the relevant retro skill to call them.

## Autonomous Work Contract

- The main session owns skill selection, decomposition, validation, reviewer gates, MR/PR-ready handoff, and final synthesis.
- Ask the user only for real blockers: scope or risk decisions, credentials/provider access, missing owner/product/security/legal decisions, destructive operations, remote-state actions, and MR/PR review outcomes.
- Continue autonomously when local evidence, repository policy, or a safe reversible default is enough; do not ask routine preference or progress questions.
- Subagents and read-only reviewer gates never ask the user directly; they return `Actionable Continuation Items` or `Suggested Next Options` for the main session.

## Completion Handoff

- When a real blocker or user-owned decision remains, the main session offers 2-4 self-contained next actions via `question` when available.
- Put the recommended option first and end its label with `(Recommended)`.
- In read-only, no-question, reviewer-agent, or subagent contexts, do not ask the user directly; return `Suggested Next Options` or `Actionable Continuation Items` for the main session instead.
- If the user selects an actionable option, continue immediately in the current context instead of asking them to restate the task.
- If no real blocker remains, report the completed work, validation, residual risks, and ready-to-land status without an interactive handoff.

After changing skills or agents, review `README.md` and the relevant artifact frontmatter so the library remains discoverable.
