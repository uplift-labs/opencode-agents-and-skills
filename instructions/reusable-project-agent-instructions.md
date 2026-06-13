# Reusable Project Agent Instructions

Use this template as a starting point for a project-level `AGENTS.md`. Keep only rules that are durable for the repository.

## Universal Development Loop

Use one process for all technologies: `Intake -> Evidence -> Baseline Proof -> Small Slice -> Test First -> Implement -> Focused Validation -> Review Gate -> Final Validation -> Handoff -> Process Improvement`.

- Technology-specific commands and constraints adapt the loop; they do not create separate workflows.
- Start broad work with a deterministic project inventory, targeted search, or repository-native command before reading large file sets.
- For behavior-changing work, prove current behavior and add/update the smallest useful failing, acceptance, or characterization test before implementation unless infeasible.
- Run focused validation first, then broaden validation when boundaries, APIs, data, deployment, or compatibility are affected.
- Use read-only reviewer gates only when the risk justifies them, and report skipped gates with the reason.

## Sources Of Truth

- Treat source code, tests, schemas, scripts, generated artifacts, and live command output as primary evidence.
- Treat docs, comments, issue text, summaries, and user claims as navigation until verified.
- If prose and implementation disagree, surface the conflict and trust executable/source evidence until resolved.
- Put product requirements in the project's spec or docs system, not in agent instructions.

## Work Style

- Prefer the smallest correct change that satisfies the scoped task.
- Do not perform unrelated cleanup, formatting, or refactors.
- Preserve user and teammate changes. Never revert files you did not change unless explicitly requested.
- For code or behavior changes, default to TDD: add or update the focused failing, acceptance, or characterization test before implementation. If skipped, state why and what validation substitutes for test-first evidence.
- Keep TDD proportional: do not expand into unrelated coverage or speculative suites when one focused test/gate proves the scoped behavior.
- After edits, run the closest relevant validation command or state why validation was skipped.

## Token Efficiency

- Prefer targeted search and bounded reads before loading broad file context.
- Keep responses compact: outcome, changed files, validation, blockers, and necessary rationale; preserve exact commands, paths, errors, code, and safety warnings.
- On native Windows, use `rtk <command>` explicitly for shell-heavy read-only commands; hook auto-rewrite is not supported there.
- Keep handoffs compact while preserving exact commands, paths, errors, and safety warnings.

## Autonomy

- Continue autonomously within the selected goal while safe, useful work remains.
- Ask the user only for serious blockers: missing credentials, hardware/manual gate, destructive permission, remote-state action, product-owner decision, legal/security approval, unavailable required artifact, or explicit user mode that forbids needed action.
- Do not ask routine questions when evidence can be gathered locally or a safe reversible default exists.
- Avoid scope creep. New tasks must directly advance the current goal or be recorded as future work.

## Process Control

- Use a direct single-agent path for clear small edits and questions.
- Use `openspec-autopilot` when a ready OpenSpec task ledger/queue exists, the user explicitly invokes Autopilot, strict task-type phases must be enforced, or safe independent OpenSpec work can be advanced in parallel until blocker/MR/limit.
- Use read-only `autopilot_status` for status-only inspection or free-form prompt queue inventory; use `autopilot_run_next` only for empty or exact `changeId`/`taskId` continuation when the plugin tool is visible in the current available tool list. If Autopilot tools are unavailable, report the missing plugin tool surface instead of using CLI/script substitutes or simulating plugin-owned state.
- Use prompt-only orchestration only when Autopilot is unavailable or not the right control plane, and never as a substitute for plugin-owned ledger/runtime transitions.

## Review And Evidence

- Findings require evidence, impact, recommendation, and confidence.
- Missing evidence for critical behavior is a finding, blocker, or accepted risk.
- Reviewer agents should be leaf validators: read-only, no edits, no commits, no pushes, no nested agents, no user questions.

## Deterministic Helper Automation

- For repetitive, evidence-heavy, or token-heavy work, first consider whether a small deterministic helper could gather, count, validate, redact, diff, inventory, or enforce explicit rules more efficiently than manual inspection.
- When writing helper code for agent workflow, make it deterministic and contract-driven: explicit inputs, explicit outputs, schemas or fixtures, stable ordering, and privacy-safe output.
- Helper code must have no hidden heuristics: do not encode fuzzy scoring, probabilistic classification, model-like summarization, or unstated inference as evidence.
- If deterministic helper code cannot answer something from its inputs, report `unknown`, `unreadable`, `unsupported`, or `blocked` instead of guessing.
- Keep judgment-heavy synthesis in the agent/reviewer layer; use helper code to gather, count, validate, redact, diff, inventory, or enforce explicit rules.

## Git And Remote State

- Do not commit, push, merge, delete source artifacts, or alter remote state unless explicitly requested and allowed by repository policy.
- Before committing, inspect status, diff, and recent log; stage only intended files.
- Before creating or updating a PR/MR, inspect status, diff, remote tracking, included commits, validation evidence, and linked issues.

## Documentation

- Keep README/docs/specs synchronized with public behavior.
- Prefer one canonical source of truth over duplicated status or requirement prose.
- Behavior-changing requirements should be represented in the project's normative spec system when one exists.
