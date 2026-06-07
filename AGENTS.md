# Repository Instructions

This repository stores reusable OpenCode skills, subagents, and instruction templates.

- Keep artifacts project-neutral: do not hardcode repository names, company-internal paths, issue trackers, services, hardware, or validation commands unless the artifact is explicitly scoped to that ecosystem.
- Prefer evidence-backed workflow contracts over reminders. If a check can be automated, document the command shape or validation hook instead of adding vague prose.
- For behavior-changing implementation work in skills, agents, templates, tools, or examples, default to TDD: add or update the focused failing test, acceptance check, fixture, or validation scenario before implementation; if infeasible, state why and use the closest reproducible evidence.
- Keep TDD proportional: one smallest useful test/gate for the scoped behavior is enough; do not expand into unrelated coverage, broad suites, or speculative tests unless risk evidence warrants it.
- Skills and agents must be safe to reuse in unrelated repositories. Use placeholders such as `<project>`, `<change>`, `<service>`, `<legacy-source>`, and `<validation-command>` where local projects differ.
- Reviewer agents are leaf validators by default: read-only, no edits, no commits, no pushes, no nested agents, no user questions.
- Keep each artifact cohesive. Split artifacts when triggers, permissions, or output contracts differ materially.
- Preserve OpenCode compatibility: skill folders must match `name` in `SKILL.md`; agent files must use valid frontmatter and least-privilege permissions.

After changing skills or agents, review `README.md` and the relevant artifact frontmatter so the library remains discoverable.
