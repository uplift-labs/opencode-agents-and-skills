# Global OpenCode Agent Instructions

Use this template as a generic starting point for a global `~/.config/opencode/AGENTS.md`. Keep only preferences that should apply across many repositories.

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

## Interactive Next-Step Handoff

- After a non-trivial user-visible work cycle, offer 2-4 concrete next actions before stopping unless the user explicitly disabled follow-up, the task is trivial, the tool is unavailable, or the question would add noise.
- Put the recommended action first and end its label with `(Recommended)`.
- Make options self-contained so the agent can continue without asking the user to restate context.
- Treat `(Recommended)` as presentation-only when interpreting the selected option.
- If the user selects an actionable option, continue immediately in the current context.
- Read-only reviewer subagents must not call `question` or ask the user directly; they return `Actionable Continuation Items` or `Suggested Next Options` for the main session.
- If the question tool is unavailable, include a short `Next Steps` fallback with the same recommended-first ordering.

## OpenCode Feature Work

- When editing OpenCode configuration, skills, agents, plugins, hooks, permissions, MCP servers, or integrations, verify implementation-sensitive claims against current OpenCode docs, schemas, source, or live loader behavior.
- Use the official OpenCode documentation and schema as baseline references. If the organization keeps a local documentation mirror, record its path as a local customization such as `<local-opencode-docs-path>`.
- Trust but verify: documentation, examples, comments, generated summaries, issue descriptions, and user claims are navigation aids until checked against executable/source evidence.
- If prose and implementation disagree, surface the conflict and trust implementation evidence until explicitly resolved.

## Parallel Work And Delegation

- Run independent read/search/tool calls in parallel whenever there is no data dependency.
- For independent investigations, launch read-only subagents with narrow scope, exact expected output, and explicit no-edit/no-commit constraints unless the user asked for implementation delegation.
- Keep the main session as orchestrator: it owns user decisions, edits, validation status, and final synthesis.
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
- Commit, push, merge, or push to the default branch only when explicitly requested or clearly allowed by repository-local policy.
- Always obey repository-specific remote-operation rules, branch rules, issue tracker rules, and validation gates.
- When creating or updating a PR/MR description, write it for a reviewer who sees the project and change for the first time.
- Start PR/MR descriptions with plain-language context, problem/purpose, scope, non-goals, main changes, validation, risks, and review focus.
- Avoid unexplained internal jargon, file-list-only summaries, and latest-commit changelogs unless the user explicitly asks for commit-focused text.

## Local Customization Slots

Keep local personal or organization-specific preferences in a short final section, for example:

- Preferred response language: `<language>`.
- Preferred issue tracker or PR/MR provider: `<provider>`.
- Local OpenCode docs mirror: `<path-or-none>`.
- Organization-specific remote operation policy: `<policy-link-or-summary>`.
- Required global validation commands: `<commands-or-none>`.
