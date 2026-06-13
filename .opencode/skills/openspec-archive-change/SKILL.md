---
name: openspec-archive-change
description: Archive a completed OpenSpec change after verifying tasks, specs, docs, tests, validation, traceability, and residual risks.
license: MIT
---

# OpenSpec Archive Change

Use this skill when the user wants to finalize/archive a completed OpenSpec change.

Do not archive on task checkboxes alone. Archive only when implementation and validation evidence support the final spec state.

## Archive Gate

- All scoped tasks are completed or explicitly moved to follow-up with reason.
- `retrospective.md` exists and records a passed archive gate, `No findings` with evidence reviewed, or an approved skip with reason and approver.
- Actionable `retrospective.md` `Problems Found` rows include root cause evidence or an explicit `unknown` cause that is routed as an investigation, not a guessed remediation.
- If `retrospective.md` has actionable `Problems Found` rows with `Target` `project-local` or `opencode-dev-kit`, `npm run openspec:retro-followups -- <change-id>` has created/updated the required follow-up OpenSpec changes.
- `npm run openspec:retro-gate -- <change-id>` passes when the repository exposes that script; if unavailable, perform the same checks manually and lower confidence.
- Stable specs reflect the accepted behavior.
- Proposal/design/tasks do not contain unresolved blockers hidden as done.
- Tests, benchmarks, manual gates, or reviewer evidence cover acceptance criteria.
- Behavior-changing implementation has test-first/TDD evidence or an explicit exception; do not infer chronology when evidence is unavailable.
- Docs and README do not contradict the archived behavior.
- Validation passes or failures are explicitly triaged.
- Missing or incomplete retrospective evidence blocks archive; do not archive on an unapproved skip.

## Workflow

- Run `openspec-consistency-review` first for material changes.
- Run or manually apply retrospective follow-up generation before the archive gate: `npm run openspec:retro-followups -- <change-id>` when available; otherwise create/update the follow-up OpenSpec changes by hand from actionable `Problems Found` rows.
- Run or manually apply the retrospective gate before archive: check `tasks.md` ends with `Retrospective Before Archive`, `retrospective.md` exists, actionable findings include root causes and reference existing follow-up changes, and any approved skip names the approver.
- Execute the repository's OpenSpec validation command if available.
- Archive using the repository's standard OpenSpec CLI/process.
- Re-run validation after archive.
- Update docs only when the archived change affects public behavior or navigation.

## Output

Return archived change id, changed files, validation results, evidence summary, follow-up items, and residual risks.
