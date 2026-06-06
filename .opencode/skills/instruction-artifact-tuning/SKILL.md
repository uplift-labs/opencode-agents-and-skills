---
name: instruction-artifact-tuning
description: Review or tune OpenCode skills, agents, AGENTS.md files, prompts, and instruction artifacts for trigger accuracy, scope cohesion, evidence discipline, safety, and context efficiency.
license: MIT
---

# Instruction Artifact Tuning

Use this skill when the target artifact is an OpenCode skill, subagent, `AGENTS.md`, prompt template, slash-command prompt, guard instruction, or another model-facing instruction file.

Default mode is review-first. Edit only when the user explicitly asks to tune, fix, create, or port artifacts, or when the request clearly implies artifact creation.

## What To Optimize

- Trigger accuracy: the description says when to load the artifact and when it should stay quiet.
- Cohesion: one primary job, one output contract, and no unrelated duties hidden in one prompt.
- Authority clarity: global, repository, skill, agent, and user instructions do not conflict.
- Evidence discipline: docs and user claims are hypotheses until checked against source, tests, schemas, or live output.
- Verification: the artifact names concrete checks, commands, reviewer gates, or eval criteria where possible.
- Tool safety: edit/read-only boundaries, destructive-operation policy, remote-state policy, and permissions are explicit.
- Context efficiency: remove repeated boilerplate, stale examples, source dumps, and project-specific details that should be local.
- AI usability: critical routing, permissions, blockers, and output schema are near the top and easy to retrieve.

## Checks

- For skills, ensure `.opencode/skills/<name>/SKILL.md` matches frontmatter `name`.
- For skills, ensure `description` is specific, concrete, and short enough for OpenCode discovery.
- For agents, ensure frontmatter has a useful `description`, correct `mode`, and least-privilege `permission`.
- Reviewer agents should be leaf validators unless explicitly designed otherwise: no edits, commits, pushes, nested agents, destructive commands, or user questions.
- Replace project-specific paths, tools, issue trackers, and product names with placeholders unless the artifact is intentionally project-local.
- Remove obsolete instructions instead of adding override paragraphs.

## Output

For review-only work, return:

- `Verdict`: clean | minor tuning | material tuning needed | blocked.
- `Scope`: files and artifact types reviewed.
- `Findings`: severity, evidence, impact, recommendation, confidence.
- `Tuning Opportunities`: minimal edits or split/move suggestions.
- `Validation`: checks run or explicitly skipped with reason.
- `Residual Risks`: missing evals, unverified loader behavior, or model-version sensitivity.
- `Actionable Continuation Items`: concrete follow-up tasks or `none`.

For implementation work, also return changed files and mention that running OpenCode sessions may need restart or a new session before changed skills/agents are loaded.
