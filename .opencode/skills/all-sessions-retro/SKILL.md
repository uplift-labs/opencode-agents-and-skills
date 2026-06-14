---
name: all-sessions-retro
description: Analyze all reachable OpenCode sessions across projects and installs to synthesize trends, root causes, and, when authorized, design/apply improvements to global skills, agents, prompts, rules, validators, tools, and reusable instructions.
license: MIT
---

# All Sessions Retro

Use ONLY when the user asks to analyze all OpenCode sessions ever run, all reachable OpenCode history, cross-project session archives, or the whole personal/team OpenCode corpus to improve global skills, agents, prompts, `AGENTS.md`, validators, hooks, or reusable workflow artifacts.

Default mode is read-only analysis with inline, redacted output. Edit global or repository instruction artifacts, write generated ledgers, fetch remote/shared URLs, or use authenticated remote sources only when the user explicitly grants that scope. When the user grants write scope for applied improvements, continue from trend analysis into solution design, implementation, and validation for the approved artifact changes. Commits, pushes, destructive cleanup, data repair, session deletion, or remote-state changes require explicit permission.

For behavior-changing improvements to scripts, validators, skills, agents, config, examples, or other executable artifacts, add or update the smallest focused test, fixture, validation gate, or acceptance check before editing. If test-first work is infeasible, state why and name the closest reproducible substitute evidence.

## Core Contract

- Exhaustive intent does not justify unverifiable claims. Report complete coverage only for sources that were actually enumerated and readable.
- Treat every transcript, summary, reflection, log, issue, and generated rollup as a lead until checked against source, tests, schemas, prompts, skills, agents, config, or live output.
- Start from all locally reachable OpenCode session artifacts, not from keyword searches or memorable anecdotes.
- Include all projects, workspaces, child sessions, background task sessions, exported/shared transcripts, and retained Desktop/TUI/server artifacts when reachable.
- Do not assume a stable session store path or schema. Verify current OpenCode storage, event, SDK, and loader behavior against local docs, source, schemas, or live output before relying on implementation-sensitive details.
- Never expose secrets, tokens, credentials, private personal data, raw transcript snippets, or unrelated sensitive snippets found in sessions. Redact raw content, sensitive paths, session titles, project names, workspace names, and stable ids when they are not needed for evidence.
- Improvements must target reusable global artifacts unless evidence proves the lesson is project-local.
- Do not turn symptoms directly into new instructions. Identify the likely root cause and choose a fix that removes or reduces the recurrence path; if evidence cannot support a cause, route an investigation or instrumentation task instead.
- A complete applied run has five phases: source coverage, per-session insight cards with batches only as an execution/reporting aid, corpus trend synthesis, solution design, and approved artifact implementation with validation.

## Relationship To Nearby Skills

- Use `project-sessions-retro` for current-project, selected-project, or bounded session, transcript, reflection, and log retros.
- Use this skill for whole-corpus OpenCode retros where the goal is improving global skills, agents, rules, prompts, guards, validators, or reusable OpenCode workflows.
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

## Tooling Shortcut

When this library's TypeScript tools are available, start the inventory phase with a redacted, read-only coverage run before interpreting session content:

```sh
npm run retro:inventory -- --format markdown
```

Then run the structured analysis helper to gather deterministic, redacted envelope metrics before any transcript interpretation:

```sh
npm run retro:analyze -- --format markdown
```

Use `npm run retro:inventory -- --format json --out <path>` only when the user approved writing a generated ledger or manifest. The tool refuses to replace existing output files unless `--overwrite` is supplied explicitly. Use `--db <path>`, `--data-dir <path>`, and `--desktop-dir <path>` to add explicitly discovered sources. Use `--only-explicit` for controlled runs that must ignore default discovery. Use `--show-paths` only when home-redacted source paths are acceptable for the report audience.

The inventory tool is a coverage and batching aid, not a substitute for retro findings. Treat its counts, source refs, duplicate detection, Desktop state classification, and suggested batches as the initial ledger; still inspect source sessions read-only and verify implementation-sensitive recommendations against current artifacts, docs, schemas, tests, or live output.

The analysis tool is a structured aggregation aid, not a judgment engine. It reads OpenCode SQLite stores in read-only mode and emits schema/table counts, session/day/project/agent/model buckets, message/part JSON envelope counts, tool names, tool statuses, input key names, deterministic tool-error categories, open TODO counts, edit/validation/git-review readiness proxies, event types, and session summary counters. Markdown output highlights action-oriented rollups for tool error hotspots, tool error categories, readiness signals, open TODOs, TODO status/priority counts, daily session buckets, and `session_message` types. It must not scan transcript content for fuzzy patterns, emit raw prompts, emit command values, or infer intent from arbitrary text. It may inspect tool `error`/`output`/`message` strings only to set fixed error-category buckets and bash command values only to set explicit validation/git-review proxy categories; it emits category names, booleans, and counts rather than the inspected values. These categories and proxies are mechanical signals that can seed investigation, not root-cause or intent findings.

Use `npm run retro:analyze -- --format json --out <path>` only when the user approved writing a generated analysis report. Existing output files are refused unless `--overwrite` is supplied explicitly. Use `--show-paths` only when home-redacted source paths are acceptable for the report audience; otherwise paths are omitted. Use `npm run retro:analyze -- --format json --include-session-cards --out <path>` when a redacted mechanical per-session envelope is needed; for large stores, use an approved `--out <path>` because it emits one JSON card per session. These cards contain hashed refs, counts, booleans, tool names, and bounded mechanical signals only; they are not the human insight cards required for final trend synthesis.

## Deterministic Helper Automation Gate

After the initial source inventory, explicitly decide and record whether a small deterministic helper would materially reduce token use, manual ledger work, privacy risk, or repeated counting for the remaining retro. Ask the user only when helper work requires unapproved writes, remote/shared access, destructive actions, or other user-owned scope decisions. Good candidates are source discovery, schema inspection, redacted coverage ledgers, stable batching, duplicate detection, path/id redaction, drift checks, and fixture-backed validators.

Only write or recommend helper code when its contract can be explicit: inputs, outputs, schema or fixture, ordering, redaction rules, failure states, and validation command. Do not encode fuzzy scoring, probabilistic classification, model-like summarization, or unstated inference in helper code. If the helper cannot determine something from its inputs, it must report `unknown`, `unreadable`, `unsupported`, or `blocked`; the agent owns judgment-heavy synthesis.

When repository write scope for retro analytics helpers is explicitly granted, prefer turning repeated ad hoc analysis into a reusable TypeScript tool under `tools/`, add the smallest fixture-backed test or validation gate first, expose it through `package.json`, update this skill to call it, and run the relevant validation. Do not leave useful analytics as one-off shell snippets when a deterministic helper would be safer and reusable.

## Total-Corpus Algorithm

1. Discover candidate sources from current OpenCode docs/source/live output, then from OS-specific config/data locations, repository artifacts, exported archives, and user-provided paths.
2. Build a redacted coverage ledger before interpreting content. Include source id, redacted path or stable reference, type, readability, session count, message count when available, date range, redacted project/workspace, and confidence.
3. Run deterministic structured analysis where available to capture counts and tool/status envelopes without exposing transcript content or using fuzzy text classification.
4. Dedupe sessions across stores, exports, summaries, shared copies, and restored backups using stable ids first, then title/date/project/message fingerprints.
5. Sort sessions chronologically and group them into batches by date, project, or artifact type. Keep child/background sessions linked to their parent when evidence exists.
6. For very large archives, use read-only `orchestrator` fan-out only after stable batch boundaries and output contracts are clear. The main session owns privacy filtering, cross-batch synthesis, and final recommendations.
7. Create a per-session insight card for every readable reachable session before global synthesis. Use `retro:analyze -- --format json --include-session-cards --out <approved-path>` as a redacted mechanical envelope and batching aid when useful, but still add human judgment for goals, friction, outcomes, and candidate lessons. Use batches only as an execution and reporting aid; sampling requires explicit user approval. If full per-session coverage is infeasible in the current turn, mark the run as partial and preserve counts, processed/unprocessed session refs, and the unprocessed ledger in the final output or a user-approved file.
8. For each session insight card, capture:

- Session id/title/date/project/workspace and parent id when available.
- User goal and constraints.
- Assistant strategy and tool use.
- What worked well and should be preserved or strengthened.
- What went poorly, caused friction, or created risk.
- What should be improved, automated, clarified, split, or validated differently next time.
- Tool failures, wrong assumptions, skipped validation, or repeated retries.
- User corrections, dissatisfaction, clarifications, or praise.
- Edits applied and evidence that edits actually happened.
- Validation performed, validation skipped, and any false readiness claims.
- Instruction, skill, agent, prompt, permission, guard, or validator friction.
- Symptom versus likely root cause; use `unknown` when the session evidence shows a problem but not the cause.
- Outcome: success, partial, failed, blocked, or unclear.
- Candidate global lesson and confidence: high, medium, or low.

9. Group candidate lessons from all processed session insight cards into positive trends, negative trends, and neutral or low-confidence observations. Keep representative evidence and confidence with each group.
10. Promote a pattern only when it appears across multiple independent sessions, across multiple projects, or in one severe/high-confidence session with clear global impact.
11. Deeply analyze every promoted trend before proposing changes. Identify likely root cause, affected artifact(s), proximate trigger, contributing factors, why the current instruction/tooling succeeded or failed, whether the right response is prose, automation, validation, routing, reviewer gates, artifact split/merge, or more evidence, and what regression risk the change creates.
12. Reject symptom-only remedies unless they are explicitly temporary containment. Durable improvements must state why they reduce recurrence of the root cause.
13. Design solutions for negative trends and reinforcement for positive trends. Prefer minimal, project-neutral artifact changes or deterministic automation with explicit validation over broad new reminders.
14. Separate global reusable improvements from project-specific lessons. Do not generalize local tool names, paths, services, issue trackers, or private workflows into global artifacts.
15. Prefer executable automation over prose when the improvement can be checked mechanically.
16. Reconcile every proposed skill/agent/rule/validator change against current repository artifacts, installed artifacts when in scope, and OpenCode docs/schema/source/live behavior before recommending or applying it.
17. If write scope for applied improvements was explicitly granted, implement approved high-confidence changes after the solution design phase, using the smallest test-first or validation-first edit that proves the behavior. Defer low-confidence, ambiguous, destructive, remote, or out-of-scope changes to the backlog instead of applying them.

## Pattern Categories

- Skill routing gaps, over-triggering, under-triggering, or missing specialty skills.
- Conflicts between global instructions, project instructions, skill bodies, and user intent.
- Missed TDD, weak validation, skipped reviewer gates, or false readiness claims.
- Tool misuse, failed assumptions about filesystem, git, shell, OpenCode config, permissions, or session APIs.
- Over-asking routine questions versus missing real blocker questions.
- Underused parallel search, read-only reviewers, or orchestrator fan-out.
- Repeated privacy, secret-handling, or log-redaction risks.
- Context bloat, repeated boilerplate, stale examples, or non-reusable local anchors in global skills.
- Repeated symptom fixes whose root cause, owner, or recurrence path was never identified.
- Successful recurring practices worth preserving.

## Improvement Backlog Rules

- Rank improvements by evidence strength, recurrence, impact, implementation cost, and validation path.
- Each backlog item must name `Trigger`, `Observed Failure Or Opportunity`, `Likely Root Cause`, `Recurrence Path`, `Proposed Artifact Change`, `Evidence`, `Validation`, `Risk`, and `Owner Scope`.
- If `Likely Root Cause` is `unknown`, the backlog item must be an investigation or instrumentation task, not a confident remediation.
- Keep global changes project-neutral. Use placeholders for local repositories, services, issue trackers, hardware, commands, and paths.
- Do not add new prose rules when a validator, hook, fixture, script, schema check, or generated status report would make the issue machine-checkable.
- Preserve successful global behaviors. Do not remove a rule solely because one session found it inconvenient.
- When promoted trends yield several concrete follow-up tasks, group them into OpenSpec changes so the backlog is durable, reviewable, and discoverable by `next-step`; prefer one change per artifact family, workflow gap, validator/tooling need, or reusable behavior outcome.
- Do not create OpenSpec changes for low-confidence observations, one-off project-local lessons, single obvious fixes, or speculative polish; keep those in the retro backlog with confidence and evidence.
- In read-only mode, recommend candidate change groups and change ids; create or update OpenSpec files only when write scope and the target repository's OpenSpec workflow are available.

## Output

Return:

- `Scope And Coverage`: sources checked, sessions/messages/reflections/logs counted, date range, included/excluded installs/projects/workspaces.
- `Coverage Ledger`: concise redacted inline table by default, or link/path to a generated ledger only when the user approved writing it, including unreadable and deduped sources.
- `Coverage Limits`: missing, inaccessible, truncated, remote-only, retention-limited, or unverifiable sources and confidence impact.
- `Corpus Rollup`: chronological or batch-level summary of the whole corpus, including per-session insight cards for every processed readable session with what worked well, what went poorly, and what to improve or preserve.
- `Findings`: severity, pattern, representative evidence, impact, likely root cause, recommendation, confidence.
- `Trend Analysis And Solution Design`: promoted positive and negative trends, root-cause analysis, proposed fixes or reinforcements, affected artifacts, validation path, and regression risk.
- `Global Skill Improvement Backlog`: prioritized artifact changes with trigger, action, validation, risk, and owner scope.
- `Applied Changes`: changed files, or `none` with whether the run was read-only, not authorized for writes, or had no approved high-confidence changes.
- `Validation`: checks run or skipped with reason.
- `Privacy Notes`: redactions and sensitive-source handling.
- `Residual Risks`: low-confidence observations, source drift, and unverified OpenCode storage assumptions.
- `OpenSpec Follow-Up Backlog`: change groups created or recommended, or `none`.
- `Actionable Continuation Items`: concrete next tasks, including OpenSpec follow-up candidates when several session-scoped items remain, or `none`.
