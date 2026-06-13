---
name: session-archive-retro
description: Analyze bounded OpenCode session history, transcripts, reflections, logs, and validation traces to find workflow problems, root causes, and concrete improvements.
license: MIT
---

# Session Archive Retro

Use this skill when the user asks to learn from bounded previous OpenCode sessions, analyze current-project or selected work history, identify repeated collaboration/tooling problems, or improve speed, depth, quality, and validation from past traces.

Default mode is read-only analysis with inline, redacted output. Edit skills, agents, instructions, scripts, docs, or config, write generated ledgers, fetch remote/shared URLs, or use authenticated remote sources only when the user explicitly grants that scope.

For behavior-changing improvements to scripts, validators, skills, agents, config, examples, or other executable artifacts, add or update the smallest focused test, fixture, validation gate, or acceptance check before editing. If test-first work is infeasible, state why and name the closest reproducible substitute evidence.

## Contract

- Work from evidence, not memory.
- Treat observed problems as symptoms until the likely root cause is identified. Improvements should remove or reduce the cause that allowed the problem to happen, not merely restate the symptom.
- The agent only has access to session artifacts that are present locally, exported, user-approved for remote/shared reads, or reachable through available tools.
- Default scope is the current project/worktree. Analyze selected projects or bounded all-project history only when the user explicitly scopes it. For all-history, cross-install, whole-corpus retros targeting global skill improvements, use `opencode-total-session-retro` instead.
- Prefer session-by-session coverage for the selected scope. Do not rely on keyword searches as the primary method when full session artifacts are available.
- For recurring retros, use checkpoints when available so repeated runs analyze new or changed sessions first.
- Treat transcripts, reflections, summaries, issue/MR text, and generated rollups as leads. Verify implementation-sensitive recommendations against source, tests, config, schemas, prompts, or live output.
- Never expose secrets, tokens, private credentials, raw transcript snippets, or irrelevant personal data found in logs. Redact sensitive snippets, sensitive paths, session titles, project names, workspace names, and stable ids when they are not needed for evidence.

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
- Exported transcripts, copied chat logs, user-approved shared URLs, or user-provided archives.
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

## Deterministic Helper Automation Gate

Before summarizing sessions at scale, decide whether a small deterministic helper would make the retro faster, safer, or less token-heavy. Good candidates are redacted source inventories, stable session batches, duplicate checks, path/id redaction, coverage ledgers, checkpoint manifests, and validation reports.

Helper code must have explicit inputs and outputs, a schema or fixture-backed contract, stable ordering, privacy-safe output, and no hidden heuristics. Do not put fuzzy scoring, probabilistic classification, model-like summarization, or unstated inference in code. If the helper cannot determine a fact from its inputs, it reports `unknown`, `unreadable`, `unsupported`, or `blocked`; pattern synthesis stays with the agent.

## Session-By-Session Algorithm

1. Build a redacted evidence ledger for all sessions in scope. Keep it inline by default; write a generated ledger file only when the user approved the path and write scope.
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
- Symptom versus likely root cause; use `unknown` when evidence cannot support a cause.
- Evidence confidence: high, medium, or low.

6. Roll up batches from session cards, not raw keyword counts.
7. Promote a global pattern only when it appears in multiple independent sessions or one severe session with strong evidence.
8. For each promoted problem, trace the chain from trigger to missed guard to outcome. Separate proximate triggers, systemic root causes, and contributing factors.
9. If the root cause is uncertain, recommend the smallest investigation, telemetry, validator, or evidence-gathering follow-up instead of pretending the fix is known.
10. Preserve successful recurring practices as well as problems.
11. Reconcile proposed improvements against current source/tests/config/docs/prompts before recommending implementation-sensitive changes.

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
- Symptom fixes that do not remove the root cause or recurrence path.
- Successful practices to preserve.

## Improvement Backlog Routing

- If the retro produces several concrete project-local or session-scoped improvement tasks, group them into OpenSpec follow-up changes so the backlog is durable and discoverable by `next-step`.
- Route root-cause fixes when evidence supports the cause; route root-cause investigations when the symptom is clear but the cause is not.
- Keep single obvious fixes, low-confidence observations, and speculative polish in the retro output instead of creating OpenSpec noise.
- In read-only mode, recommend candidate change groups and change ids; create or update OpenSpec files only when write scope and the repository's OpenSpec workflow are available.
- For global reusable OpenCode artifact improvements, route broad or cross-project backlogs through `opencode-total-session-retro` unless the user intentionally scoped the retro to this repository's OpenCode artifacts.

## Output

Return:

- `Scope And Coverage`: sources checked, sessions/logs/reflections counted, date range, included/excluded areas.
- `Coverage Ledger`: concise redacted inline table by default, or link/path to a generated ledger only when the user approved writing it.
- `Coverage Limits`: missing/inaccessible/truncated sources and confidence impact.
- `Session Rollup`: concise batch/global summary.
- `Findings`: severity, evidence, evidence type, impact, likely root cause, recommendation, confidence.
- `Recurring Patterns`: repeated problems and success patterns with representative session ids or artifacts.
- `Root-Cause Analysis`: symptom -> likely root cause -> contributing factors -> recurrence path -> confidence.
- `Improvement Backlog`: automation, instructions, skills, agents, prompts, docs, or validation changes, each naming the root cause it removes or the investigation needed to find it.
- `Applied Changes`: changed files or `none`.
- `Validation`: checks run or skipped with reason.
- `Privacy Notes`: redactions or sensitive-source handling.
- `OpenSpec Follow-Up Backlog`: change groups created or recommended, or `none`.
- `Actionable Continuation Items`: concrete next tasks, including OpenSpec follow-up candidates when several session-scoped items remain, or `none`.
