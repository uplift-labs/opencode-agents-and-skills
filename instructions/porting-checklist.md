# Porting Checklist For Skills And Agents

Use this checklist when moving project-local skills/agents into a global reusable library.

## Remove Project-Specific Anchors

- Repository names, product names, customer names, hardware names.
- Absolute source paths and sibling repository paths.
- Issue tracker/provider-specific commands unless the artifact is provider-specific.
- Local validation commands unless expressed as placeholders.
- Future-scope product decisions that do not apply globally.
- External directory permissions tied to one workspace.

## Generalize Safely

- Replace domain nouns with placeholders: `<project>`, `<service>`, `<legacy-client>`, `<upstream>`, `<wire-protocol>`, `<validation-command>`.
- Keep the workflow shape, evidence hierarchy, severity schema, and output contract.
- Keep domain-specific artifacts only when the domain itself is reusable, such as Rust concurrency, Windows service packaging, COM/ActiveX, config validation, or wire protocol tests.
- Rename artifacts when the original name would over-trigger or mislead in other projects.

## Compatibility Checks

- Skill folder name matches frontmatter `name`.
- Skill `description` is concrete and under OpenCode's discovery limit.
- Agent frontmatter uses valid `mode` and least-privilege `permission`.
- Reviewer agents are read-only leaf validators.
- No copied instructions conflict with the target repository's higher-priority rules.

## Review Questions

- Would this artifact be useful in a project with a different language, provider, issue tracker, and architecture?
- Are the trigger and non-goals clear enough to avoid accidental overuse?
- Can a main session verify whether the artifact succeeded?
- Is any critical rule buried in the middle of a long prompt?
- Does the artifact ask routine questions instead of continuing with evidence or safe defaults?
