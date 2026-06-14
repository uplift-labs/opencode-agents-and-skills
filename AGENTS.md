# Repository Instructions

This repository stores reusable OpenCode skills, subagents, and instruction templates.

- Keep artifacts project-neutral: do not hardcode repository names, company-internal paths, issue trackers, services, hardware, or validation commands unless the artifact is explicitly scoped to that ecosystem.
- Prefer evidence-backed workflow contracts over reminders. If a check can be automated, document the command shape or validation hook instead of adding vague prose.
- For retros, audits, reviewer gates, and follow-up backlogs, distinguish symptoms from likely root causes. Prefer fixes that remove or reduce the recurrence path; when evidence cannot identify the cause, route an investigation or instrumentation task instead of guessing.
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
- Deterministic helper output may support root-cause analysis with evidence and missing-data signals, but root-cause judgment remains in the agent/reviewer layer.
- For OpenCode retro analytics in this repository, durable TypeScript helper scripts are allowed when they materially reduce analysis work; add or update a focused test first, expose reusable helpers through `package.json`, and update the relevant retro skill to call them.

## Token Efficiency

- Keep responses compact by default: outcome, changed files, validation, blockers, and only necessary rationale.
- Remove filler and repeated caveats from responses, but preserve exact commands, paths, errors, code, safety warnings, and user-facing decisions.
- Prefer targeted searches, symbols, and bounded file reads over broad file or log dumps.
- On native Windows, `rtk` filters work only when invoked explicitly; use `rtk <command>` for shell-heavy read-only commands instead of relying on hook auto-rewrite.
- When Headroom MCP tools are available and a log, search result, JSON payload, validation output, or repeated tool output is likely to be reused and exceeds about 300 lines or 10 KB, call `headroom_compress`, keep the returned hash in working notes or final evidence when relevant, and call `headroom_retrieve` before exact claims.
- Do not use Headroom MCP for small outputs, exact code under active edit, short errors already visible, or safety-critical details that must be quoted exactly.
- For validation output, report summaries and failures first; read full saved tool output only when the preview lacks the cause.
- Preserve exact code, commands, paths, errors, protocol terms, and safety warnings; do not compress away meaning.

## Autonomous Work Contract

- The main session owns skill selection, decomposition, validation, reviewer gates, MR/PR-ready handoff, and final synthesis.
- Ask the user only for real blockers: scope or risk decisions, credentials/provider access, missing owner/product/security/legal decisions, destructive operations, remote-state actions, and MR/PR review outcomes.
- Continue autonomously when local evidence, repository policy, or a safe reversible default is enough; do not ask routine preference or progress questions.
- Subagents and read-only reviewer gates never ask the user directly; they return `Actionable Continuation Items` or `Suggested Next Options` for the main session.

## Completion Handoff

- When a real blocker or user-owned decision remains, the main session offers 2-4 self-contained next actions via `question` when available.
- Put the recommended option first and end its label with `(Recommended)`.
- In read-only, no-question, reviewer-agent, or subagent contexts, do not ask the user directly; return `Suggested Next Options` or `Actionable Continuation Items` for the main session instead.
- When an audit, retro, reviewer gate, broad discovery, or validation failure produces several concrete tasks related to the current session but outside its approved scope, prefer grouping them into OpenSpec follow-up changes when the repository already uses OpenSpec or the user approved adding it; otherwise return grouped candidates instead of leaving a loose final-message backlog. Do not create OpenSpec ceremony for isolated nits, speculative polish, or one obvious next step.
- If the user selects an actionable option, continue immediately in the current context instead of asking them to restate the task.
- If no real blocker remains, report the completed work, validation, residual risks, and ready-to-land status without an interactive handoff.

After changing skills or agents, review `README.md` and the relevant artifact frontmatter so the library remains discoverable.
