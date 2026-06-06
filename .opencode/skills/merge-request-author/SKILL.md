---
name: merge-request-author
description: Create or update a reviewer-friendly merge request or pull request title, description, validation section, risk notes, and review focus for any repository/provider.
license: MIT
---

# Merge Request Author

Use this skill when the user asks to create, update, polish, or prepare a merge request or pull request.

Do not commit, push, create remote state, or merge unless the user explicitly requested that action and repository rules allow it.

## Workflow

- Inspect local status, diff, recent commits, base branch assumptions, and validation evidence.
- Review linked issue/task context when available, including readable attachments and comments.
- Write for a reviewer who sees the project and change for the first time.
- Avoid file-list-only summaries and latest-commit changelogs.
- Clearly separate scope, non-goals, validation, risks, and follow-up work.
- If using a provider CLI, prefer the repository's configured provider and obey local remote-operation rules.

## MR/PR Body Template

```markdown
## Context
<Plain-language problem and why this change exists.>

## Scope
<What this MR/PR changes.>

## Non-goals
<Important adjacent work intentionally excluded.>

## Main Changes
- <Behavior, architecture, tests, docs, or tooling change.>

## Validation
- `<command>`: <result>
- <manual/reviewer gate>: <result or skipped reason>

## Risks And Follow-up
- <Residual risk, blocker, or follow-up task.>

## Review Focus
- <Files/flows/decisions that deserve reviewer attention.>
```

## Output

Return changed remote/local artifacts, validation evidence, known blockers, and exact next step. If remote operations were not performed, state that explicitly.
