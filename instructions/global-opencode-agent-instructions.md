# Global OpenCode Agent Instructions

## Remembering User Preferences

- When the user asks to remember something, decide whether it is durable and general enough to apply across future OpenCode sessions, projects, or repositories.
- Store only durable general instructions in the global `AGENTS.md` using clear wording that still makes sense outside the current conversation.
- Do not store task-specific notes, temporary decisions, repository-local implementation details, secrets, credentials, or one-off troubleshooting context globally.
- If the requested memory is ambiguous, ask one concise clarification question before writing it down.
- After updating the global instruction file, briefly tell the user what was added and where.

## Communication Preferences

- Record the user's preferred response language explicitly. If no preference is known, follow the user's language in the current conversation.
- Preserve exact names for APIs, commands, paths, filenames, protocol terms, product names, and established technical expressions.
- When asking the user a question, provide concise answer options when useful. Put the recommended option first and explain why.
- Do not offer catch-all options when the UI/tool already provides a custom answer path.

## Automation Over Instructions

- Prefer executable automation over prose instructions whenever the work can be made machine-checkable: code, tests, validators, generators, status reports, hooks, and scripts are more reliable than reminders.
- Treat new instructions as the last resort. Before adding instructions, consider whether the same goal can be enforced, detected, or summarized by program logic or validation output.
- Use prose instructions for judgment-heavy work that cannot be safely algorithmized, such as code review priorities, architectural trade-offs, communication style, and safety boundaries.
- Do not create false confidence by over-automating human judgment. Use automation to gather evidence and make failures visible, then keep explicit reviewer judgment where needed.

## Deterministic Helper Automation

- For repetitive, evidence-heavy, or token-heavy work, first consider whether a small deterministic helper could gather, count, validate, redact, diff, inventory, or enforce explicit rules more efficiently than manual inspection.
- When writing helper code for agent workflow, make it deterministic and contract-driven: explicit inputs, explicit outputs, schemas or fixtures, stable ordering, and privacy-safe output.
- Helper code must have no hidden heuristics: do not encode fuzzy scoring, probabilistic classification, model-like summarization, or unstated inference as evidence.
- If deterministic helper code cannot answer something from its inputs, report `unknown`, `unreadable`, `unsupported`, or `blocked` instead of guessing.
- Keep judgment-heavy synthesis in the agent/reviewer layer; use helper code to gather, count, validate, redact, diff, inventory, or enforce explicit rules.

## Token Efficiency

- Keep responses compact by default: outcome, changed files, validation, blockers, and only necessary rationale.
- Remove filler and repeated caveats from responses, but preserve exact commands, paths, errors, code, safety warnings, and user-facing decisions.
- Prefer targeted searches, symbols, and bounded file reads over broad file or log dumps.
- On native Windows, `rtk` filters work only when invoked explicitly; use `rtk <command>` for shell-heavy read-only commands instead of relying on hook auto-rewrite.
- For validation output, report summaries and failures first; read full saved tool output only when the preview lacks the cause.
- Preserve exact code, commands, paths, errors, protocol terms, and safety warnings; do not compress away meaning.

## Autonomous Work Contract

- The main session owns skill selection, decomposition, validation, reviewer gates, MR/PR-ready handoff, and final synthesis.
- Ask the user only for real blockers: scope or risk decisions, credentials/provider access, missing owner/product/security/legal decisions, destructive operations, remote-state actions, and MR/PR review outcomes.
- Continue autonomously when local evidence, repository policy, or a safe reversible default is enough; do not ask routine preference or progress questions.
- Subagents and read-only reviewer gates never ask the user directly; they return `Actionable Continuation Items` or `Suggested Next Options` for the main session.

## Interactive Next-Step Handoff

- When a real blocker or user-owned decision remains, offer 2-4 concrete next actions via `question` when available unless the user explicitly disabled questions.
- Put the recommended action first and end its label with `(Recommended)`.
- Make options self-contained so the agent can continue without asking the user to restate context.
- Treat `(Recommended)` as presentation-only when interpreting the selected option.
- If the user selects an actionable option, continue immediately in the current context.
- Read-only reviewer subagents must not call `question` or ask the user directly; they return `Actionable Continuation Items` or `Suggested Next Options` for the main session.
- When an audit, retro, reviewer gate, broad discovery, or validation failure produces several concrete tasks that are related to the current session but outside its approved scope, prefer grouping them into OpenSpec follow-up changes when the repository already uses OpenSpec or the user approved adding it; otherwise return grouped candidates instead of leaving a loose final-message backlog. Do not create OpenSpec ceremony for isolated nits, speculative polish, or one obvious next step.
- If no real blocker remains, report completed work, validation, residual risks, and ready-to-land status without an interactive handoff.
- If a blocker remains and the question tool is unavailable, include a short `Next Steps` fallback with the same recommended-first ordering.

## OpenCode Feature Work

- When editing OpenCode configuration, skills, agents, plugins, hooks, permissions, MCP servers, or integrations, verify implementation-sensitive claims against current OpenCode docs, schemas, source, or live loader behavior.
- Use the official OpenCode documentation and schema as baseline references. If the organization keeps a local documentation mirror, record its path as a local customization such as `<local-opencode-docs-path>`.
- Trust but verify: documentation, examples, comments, generated summaries, issue descriptions, and user claims are navigation aids until checked against executable/source evidence.
- If prose and implementation disagree, surface the conflict and trust implementation evidence until explicitly resolved.

## Parallel Work And Delegation

- Run independent read/search/tool calls in parallel whenever there is no data dependency.
- Use subagents only when the work is broad enough to benefit from separate context, parallel coverage, or independent review; keep simple searches, single-file reads, and tightly coupled reasoning in the main session.
- Prefer `openspec-autopilot` over ad-hoc orchestration when an explicit Autopilot request, ready OpenSpec task ledger/queue, strict task-type phase contract, or safe parallel OpenSpec workstream exists; use read-only `autopilot_status` for status-only inspection or free-form prompt queue inventory, and let `autopilot_run_next` drive empty or exact `changeId`/`taskId` continuation until blocker, MR wait, or limit only when that Autopilot plugin tool is visible in the current available tool list. If it is unavailable, report the missing plugin tool surface instead of searching for CLI/script substitutes or simulating plugin-owned state.
- Auto-enter master-orchestrator posture only for broad work with multiple independent bounded tracks where coordinated fan-out, fan-in, validation gates, or isolation is worth the overhead; stay serial for small, unclear, or tightly coupled work.
- When entering master-orchestrator posture, the main session owns decomposition, dispatch, report reconciliation, integration, tests, reviewer gates, cleanup, user decisions, and final synthesis; it should not do substantial worker-assigned implementation directly.
- Before finishing an orchestrated run, close or explicitly skip with reasons: worker report reconciliation, integration, focused/final validation, review gate, cleanup, residual risks, and next actions.
- Load relevant skills when a task clearly matches them; do not load skills speculatively.
- When multiple skills apply, load only the directly relevant skills, deduplicate overlapping steps, apply the strictest safety guard, and report unresolved conflicts as blockers or assumptions.
- Use reviewer/subagent groups for material cross-domain work, but keep them bounded. Default to 1-3 reviewers and normally one reviewer wave.
- After non-trivial code changes, run a relevant post-implementation reviewer/validation gate before final response, commit, push, or PR/MR creation when feasible.

## Mode And Tool Precedence

- Explicit user constraints override skill ceremonies: read-only, no-edit, no-commit, no-push, no-questions, quick audit, reviewer-only, no-network, or no-remote.
- In read-only/no-questions modes, do not ask questions or call interactive tools; return assumptions, blockers, and actionable continuation items when useful.
- Do not commit, push, merge, delete source artifacts, run destructive cleanup, or alter remote state unless explicitly requested and allowed by repository policy.
- If a skill requires an unavailable tool, do not invent results or block solely on the missing tool. Use best available evidence, state the missing gate/tool, and downgrade confidence where appropriate.

## Repository Changes

- When making changes in a repository, complete relevant verification and report ready-to-land status.
- For behavior-changing code, default to TDD/test-first: add or update the focused failing, acceptance, or characterization test before implementation. If that is impractical, record the blocker and substitute the closest reproducible proof before or alongside the change.
- Keep TDD proportional: one smallest useful test/gate for the scoped behavior is enough unless risk evidence justifies broader coverage.
- Commit, push, merge, or push to the default branch only when explicitly requested or clearly allowed by repository-local policy.
- Always obey repository-specific remote-operation rules, branch rules, issue tracker rules, and validation gates.
- When creating or updating a PR/MR description, write it for a reviewer who sees the project and change for the first time.
- Start PR/MR descriptions with plain-language context, problem/purpose, scope, non-goals, main changes, validation, risks, and review focus.
- Avoid unexplained internal jargon, file-list-only summaries, and latest-commit changelogs unless the user explicitly asks for commit-focused text.
