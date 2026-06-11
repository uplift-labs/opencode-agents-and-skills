# OpenSpec Project Guide

This repository uses OpenSpec for durable task/change tracking when work needs explicit requirements, acceptance criteria, regression evidence, or follow-up findings that should not remain as loose session notes.

## Change Layout

Active changes live under:

```text
openspec/changes/<change-id>/
```

Use these files as needed:

- `proposal.md`: why the change exists, goals, non-goals, impact, and validation.
- `design.md`: decisions, test strategy, risks, rollout, or operational model.
- `tasks.md`: implementation, validation, reviewer, and tracking checklist.
- `specs/<capability>/spec.md`: normative requirements and scenarios.
- `automation/task.json`: optional Autopilot task ledger owned by the Autopilot plugin.
- Additional artifacts, prompts, or reports when they are evidence for the change.

## Tracking Rules

- Use one coherent change per outcome, capability, risk area, or finding family.
- Do not create OpenSpec ceremony for isolated nits or one obvious next step.
- For behavior-changing implementation work, add or update the smallest focused failing, acceptance, characterization, fixture, or validator gate before implementation unless infeasible with reason.
- Findings from regression, audits, reviewers, or failed validation must either be fixed in the current approved scope or tracked as one or more follow-up changes.
- Autopilot ledgers are plugin-owned. Agents and workers must not edit `automation/task.json`, `automation/feedback/**`, `automation/artifacts/**`, or `.autopilot/**` directly during an Autopilot run.

## Validation

Repository validation currently uses:

```sh
npm run validate
npm test
npm run autopilot:validate -- <task-ledger.json>
```

When `openspec/` exists, the expected OpenSpec gate is:

```sh
openspec validate --all
```

If the CLI is unavailable, record that as validation evidence instead of guessing another command.
