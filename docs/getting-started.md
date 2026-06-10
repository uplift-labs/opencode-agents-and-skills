# Getting Started

Use this guide to install `opencode-dev-kit` on a new machine or attach it to a new project.

## Install Globally

From the kit repository:

```sh
npm run install:global -- --dry-run
npm run install:global
```

By default, the installer installs every repository skill and reviewer agent globally. It does not prompt for a profile. Use `--profile standard` or another profile only when you intentionally want a smaller install set.

Restart OpenCode after installation because skills, agents, and config-time files are loaded at startup.

## Bootstrap A Project

Preview the target project changes:

```sh
npm run init:project -- --target <project-path>
```

Write the bootstrap files:

```sh
npm run init:project -- --target <project-path> --mode write
```

Then check readiness:

```sh
npm run doctor -- --project <project-path>
```

## First Task Prompt

In the target project, ask for work using the single loop:

```text
Use the Universal Development Loop to implement <task>. Keep the slice small, prove current behavior first when feasible, work test-first for behavior changes, and run the nearest validation command.
```

## Before Broad Work

Gather compact deterministic context before reading many files:

```sh
npm run project:inventory -- --root <project-path> --format markdown
```

Use the inventory as navigation evidence, not as a substitute for source or tests.
