# Token Economy

Token economy is part of quality: lower context cost leaves more budget for reasoning, validation, and review.

## Rules

- Use one canonical workflow, not many competing workflows.
- Gather inventories before broad reads.
- Prefer `glob`, `grep`, and targeted file reads over scanning whole trees manually.
- Keep default installs small; put heavyweight/domain skills in optional profiles.
- Run one relevant reviewer gate by risk, not all reviewers.
- Keep handoffs compact: outcome, changed files, evidence, validation, residual risks.
- Convert repeated counting, drift checks, and report assembly into deterministic helpers.

## Commands

Target project context:

```sh
npm run project:inventory -- --root <project-path> --format markdown
```

Kit instruction context:

```sh
npm run instruction:inventory -- --format markdown
```

Code navigation risk:

```sh
npm run code-quality:inventory -- --format markdown
```
