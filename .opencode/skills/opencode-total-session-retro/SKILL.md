---
name: opencode-total-session-retro
description: Analyze all reachable OpenCode sessions across projects and installs to find evidence-backed improvements for global skills, agents, prompts, rules, and validators.
license: MIT
---

# OpenCode Total Session Retro

Use ONLY when the user asks to analyze all OpenCode sessions ever run, all reachable OpenCode history, cross-project session archives, or the whole personal/team OpenCode corpus to improve global skills, agents, prompts, `AGENTS.md`, validators, hooks, or reusable workflow artifacts.

Default mode is read-only analysis with inline, redacted output. Edit global or repository instruction artifacts, write generated ledgers, fetch remote/shared URLs, or use authenticated remote sources only when the user explicitly grants that scope. Commits, pushes, destructive cleanup, data repair, session deletion, or remote-state changes require explicit permission.

For behavior-changing improvements to scripts, validators, skills, agents, config, examples, or other executable artifacts, add or update the smallest focused test, fixture, validation gate, or acceptance check before editing. If test-first work is infeasible, state why and name the closest reproducible substitute evidence.

## Core Contract

- Exhaustive intent does not justify unverifiable claims. Report complete coverage only for sources that were actually enumerated and readable.
- Treat every transcript, summary, reflection, log, issue, and generated rollup as a lead until checked against source, tests, schemas, prompts, skills, agents, config, or live output.
- Start from all locally reachable OpenCode session artifacts, not from keyword searches or memorable anecdotes.
- Include all projects, workspaces, child sessions, background task sessions, exported/shared transcripts, and retained Desktop/TUI/server artifacts when reachable.
- Do not assume a stable session store path or schema. Verify current OpenCode storage, event, SDK, and loader behavior against local docs, source, schemas, or live output before relying on implementation-sensitive details.
- Never expose secrets, tokens, credentials, private personal data, raw transcript snippets, or unrelated sensitive snippets found in sessions. Redact raw content, sensitive paths, session titles, project names, workspace names, and stable ids when they are not needed for evidence.
- Improvements must target reusable global artifacts unless evidence proves the lesson is project-local.

## Relationship To Nearby Skills

- Use `session-archive-retro` for current-project, selected-project, or bounded session history analysis.
- Use this skill for whole-corpus OpenCode retros where the goal is improving global skills, agents, rules, prompts, guards, validators, or reusable OpenCode workflows.
- Use `reflection-retro` when the input is reflection files rather than full session archives.
- Use `instruction-artifact-tuning` after this skill identifies concrete artifact edits that need focused review or implementation.

## Evidence Sources

Build an inventory across every reachable source and report which were found:

- OpenCode persistent session/message stores discovered through current docs, source, config, process state, or live output.
- OpenCode Desktop, TUI, server, and plugin state when readable.
- Global and project OpenCode config directories, installed skills, installed agents, `AGENTS.md`, prompts, commands, hooks, validators, and guard artifacts.
- Project and global reflection folders.
- Exported transcripts, copied chat logs, session summaries, user-approved shared URLs, imported archives, and user-provided bundles.
- Git history for applied skill, agent, instruction, validator, guard, or workflow fixes.
- Current OpenCode docs/schema/source for compatibility-sensitive claims about session storage, session events, skill loading, config loading, and permissions.

If a source is unavailable, unreadable, encrypted, truncated, remote-only, retention-limited, or permission-blocked, state it plainly and continue with remaining evidence.

Use read-only inspection for databases and logs. Never run database writes, migrations, vacuum, repair, compaction, or destructive cleanup against live session stores.

## Intake Checklist

- Which OpenCode installs, config roots, data roots, repositories, exported archives, and reflection roots are reachable?
- How many session records, messages, parts, summaries, reflections, logs, and exports are in scope?
- What date range and project/workspace coverage can be proven?
- Are child sessions, background subagents, workspace sessions, deleted sessions, compacted sessions, and shared sessions included or excluded?
- Which storage formats and source/docs/live checks were used to identify session artifacts?
- Which artifacts are unreadable, binary, encrypted, truncated, remote-only, or permission-blocked?
- Is the task read-only, or did the user explicitly request applied global skill improvements?

## Total-Corpus Algorithm

1. Discover candidate sources from current OpenCode docs/source/live output, then from OS-specific config/data locations, repository artifacts, exported archives, and user-provided paths.
2. Build a redacted coverage ledger before interpreting content. Include source id, redacted path or stable reference, type, readability, session count, message count when available, date range, redacted project/workspace, and confidence.
3. Dedupe sessions across stores, exports, summaries, shared copies, and restored backups using stable ids first, then title/date/project/message fingerprints.
4. Sort sessions chronologically and group them into batches by date, project, or artifact type. Keep child/background sessions linked to their parent when evidence exists.
5. For very large archives, use read-only `orchestrator` fan-out only after stable batch boundaries and output contracts are clear. The main session owns privacy filtering, cross-batch synthesis, and final recommendations.
6. Summarize every substantive session or sampled batch before global synthesis. If full per-session coverage is infeasible in the current turn, mark the run as partial and preserve the unprocessed ledger in the final output or a user-approved file.
7. For each session card or batch card, capture:

- Session id/title/date/project/workspace and parent id when available.
- User goal and constraints.
- Assistant strategy and tool use.
- Tool failures, wrong assumptions, skipped validation, or repeated retries.
- User corrections, dissatisfaction, clarifications, or praise.
- Edits applied and evidence that edits actually happened.
- Validation performed, validation skipped, and any false readiness claims.
- Instruction, skill, agent, prompt, permission, guard, or validator friction.
- Outcome: success, partial, failed, blocked, or unclear.
- Candidate global lesson and confidence: high, medium, or low.

8. Promote a pattern only when it appears across multiple independent sessions, across multiple projects, or in one severe/high-confidence session with clear global impact.
9. Separate global reusable improvements from project-specific lessons. Do not generalize local tool names, paths, services, issue trackers, or private workflows into global artifacts.
10. Prefer executable automation over prose when the improvement can be checked mechanically.
11. Reconcile every proposed skill/agent/rule/validator change against current repository artifacts, installed artifacts when in scope, and OpenCode docs/schema/source/live behavior before recommending or applying it.

## Pattern Categories

- Skill routing gaps, over-triggering, under-triggering, or missing specialty skills.
- Conflicts between global instructions, project instructions, skill bodies, and user intent.
- Missed TDD, weak validation, skipped reviewer gates, or false readiness claims.
- Tool misuse, failed assumptions about filesystem, git, shell, OpenCode config, permissions, or session APIs.
- Over-asking routine questions versus missing real blocker questions.
- Underused parallel search, read-only reviewers, or orchestrator fan-out.
- Repeated privacy, secret-handling, or log-redaction risks.
- Context bloat, repeated boilerplate, stale examples, or non-reusable local anchors in global skills.
- Successful recurring practices worth preserving.

## Improvement Backlog Rules

- Rank improvements by evidence strength, recurrence, impact, implementation cost, and validation path.
- Each backlog item must name `Trigger`, `Observed Failure Or Opportunity`, `Proposed Artifact Change`, `Evidence`, `Validation`, `Risk`, and `Owner Scope`.
- Keep global changes project-neutral. Use placeholders for local repositories, services, issue trackers, hardware, commands, and paths.
- Do not add new prose rules when a validator, hook, fixture, script, schema check, or generated status report would make the issue machine-checkable.
- Preserve successful global behaviors. Do not remove a rule solely because one session found it inconvenient.

## Output

Return:

- `Scope And Coverage`: sources checked, sessions/messages/reflections/logs counted, date range, included/excluded installs/projects/workspaces.
- `Coverage Ledger`: concise redacted inline table by default, or link/path to a generated ledger only when the user approved writing it, including unreadable and deduped sources.
- `Coverage Limits`: missing, inaccessible, truncated, remote-only, retention-limited, or unverifiable sources and confidence impact.
- `Corpus Rollup`: chronological or batch-level summary of the whole corpus.
- `Findings`: severity, pattern, representative evidence, impact, recommendation, confidence.
- `Global Skill Improvement Backlog`: prioritized artifact changes with trigger, action, validation, risk, and owner scope.
- `Applied Changes`: changed files or `none`.
- `Validation`: checks run or skipped with reason.
- `Privacy Notes`: redactions and sensitive-source handling.
- `Residual Risks`: low-confidence observations, source drift, and unverified OpenCode storage assumptions.
- `Actionable Continuation Items`: concrete next tasks or `none`.
