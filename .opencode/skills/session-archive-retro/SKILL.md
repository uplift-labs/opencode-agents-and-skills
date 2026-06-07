---
name: session-archive-retro
description: Analyze accessible OpenCode session history, transcripts, reflections, logs, and validation traces to find workflow problems and synthesize concrete improvements.
license: MIT
---

# Session Archive Retro

Use this skill when the user asks to learn from previous OpenCode sessions, analyze work history, identify repeated collaboration/tooling problems, or improve speed, depth, quality, and validation from past traces.

Default mode is read-only analysis. Edit skills, agents, instructions, scripts, docs, or config only when the user explicitly asks to apply improvements.

For behavior-changing improvements to scripts, validators, skills, agents, config, examples, or other executable artifacts, add or update the smallest focused test, fixture, validation gate, or acceptance check before editing. If test-first work is infeasible, state why and name the closest reproducible substitute evidence.

## Contract

- Work from evidence, not memory.
- The agent only has access to session artifacts that are present locally, exported, shared, or reachable through available tools.
- Default scope is the current project/worktree. Analyze all projects only when the user explicitly asks for global or all-projects retro.
- Prefer session-by-session coverage for the selected scope. Do not rely on keyword searches as the primary method when full session artifacts are available.
- For recurring retros, use checkpoints when available so repeated runs analyze new or changed sessions first.
- Treat transcripts, reflections, summaries, issue/MR text, and generated rollups as leads. Verify implementation-sensitive recommendations against source, tests, config, schemas, prompts, or live output.
- Never expose secrets, tokens, private credentials, or irrelevant personal data found in logs. Redact sensitive snippets and analyze behavior patterns instead.

## When Not To Use

- Do not use for normal code review of current changes.
- Do not use for a single current bug unless the user explicitly wants historical pattern analysis.
- Do not use as a replacement for repository-specific architecture, spec, or validation workflows.
- Do not promise complete coverage when session history is missing, encrypted, inaccessible, truncated, or only partially retained.

## Evidence Sources

Inspect likely sources and report which were found:

- OpenCode persistent data such as local SQLite databases or session stores.
- OpenCode Desktop state when readable.
- Project/global reflection folders.
- Exported transcripts, copied chat logs, shared URLs, or user-provided archives.
- Git history for applied workflow fixes.
- Changed skills, agents, `AGENTS.md`, prompts, validators, scripts, and guard history.
- Current OpenCode docs/schema/source for compatibility-sensitive claims about session storage or artifact formats.

If a source is unavailable, state it plainly and continue with remaining evidence.

## Intake Checklist

- What session sources are readable?
- How many sessions/messages/reflections/log files are in scope?
- What date range and repositories are covered?
- Is the scope current-project, selected-project, or all-projects?
- Are there unreadable, binary, encrypted, truncated, or permission-blocked artifacts?
- Are there retention gaps or current-session-only limits?
- Is the task read-only, or did the user ask to apply improvements?

Use read-only inspection for databases and logs. Never run database writes, migrations, vacuum, repair, or destructive cleanup against live session stores.

## Session-By-Session Algorithm

1. Build an evidence ledger for all sessions in scope.
2. Sort sessions chronologically, then split into stable batches when the archive is large.
3. For large archives with independent batches, consider `orchestrator` read-only fan-out for batch summaries; the main session owns global synthesis, privacy filtering, and recommendations.
4. Summarize each session independently before global synthesis.
5. For each session card, capture:

- Session id/title/date/project when available.
- User goal and constraints.
- What the assistant did.
- Tools used and tool failures.
- User corrections or dissatisfaction.
- Validation performed or skipped.
- Whether edits happened, and evidence for actual edit tools versus summary/diff metadata.
- Outcome: success, partial, failed, blocked, or unclear.
- Candidate lesson.
- Evidence confidence: high, medium, or low.

6. Roll up batches from session cards, not raw keyword counts.
7. Promote a global pattern only when it appears in multiple independent sessions or one severe session with strong evidence.
8. Preserve successful recurring practices as well as problems.
9. Reconcile proposed improvements against current source/tests/config/docs/prompts before recommending implementation-sensitive changes.

## Common Pattern Categories

- Missed validation or weak validation claims.
- Premature stopping or over-asking routine questions.
- Underused parallel search/delegation.
- Wrong tool choice or broken tool assumptions.
- Prompt/instruction conflicts.
- Repeated user corrections.
- Scope creep or accidental refactors.
- Weak PR/MR summaries.
- Incomplete evidence before readiness/merge/archive claims.
- Successful practices to preserve.

## Output

Return:

- `Scope And Coverage`: sources checked, sessions/logs/reflections counted, date range, included/excluded areas.
- `Coverage Limits`: missing/inaccessible/truncated sources and confidence impact.
- `Session Rollup`: concise batch/global summary.
- `Findings`: severity, evidence, evidence type, impact, recommendation, confidence.
- `Recurring Patterns`: repeated problems and success patterns with representative session ids or artifacts.
- `Improvement Backlog`: automation, instructions, skills, agents, prompts, docs, or validation changes.
- `Applied Changes`: changed files or `none`.
- `Validation`: checks run or skipped with reason.
- `Privacy Notes`: redactions or sensitive-source handling.
- `Actionable Continuation Items`: concrete next tasks or `none`.
