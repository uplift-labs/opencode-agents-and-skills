# Token Economy

Token economy is part of quality: lower context cost leaves more budget for reasoning, validation, and review.

## Rules

- Use one canonical workflow, not many competing workflows.
- Gather inventories before broad reads.
- Keep responses compact by default and remove filler, while preserving exact commands, paths, errors, code, and safety warnings.
- Prefer `glob`, `grep`, and targeted file reads over scanning whole trees manually.
- On native Windows, use `rtk <command>` explicitly for shell-heavy read-only commands; hook auto-rewrite is not supported there.
- Use Headroom MCP tools only on demand for large logs, search results, JSON, or tool outputs where compression preserves enough evidence; retrieve originals before exact code or safety-critical decisions.
- Use `tools/headroom-mcp-wrapper.ts` for OpenCode Headroom MCP integration so `prompts/list` returns the `headroom_usage_policy` prompt instead of a startup error.
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
