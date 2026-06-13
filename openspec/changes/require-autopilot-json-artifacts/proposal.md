# Proposal: Require Autopilot JSON Artifacts

## Why

Autopilot and OpenSpec automation currently mix machine-readable state with Markdown wrapper artifacts. The clearest example is `retrospective.md`: archive gates parse Markdown sections and tables to infer root causes, outputs, and follow-up routing. That is fragile for Autopilot because plugin-owned and validator-owned workflows need stable schemas, deterministic parsing, safe redaction, and exact follow-up references.

Autopilot already uses JSON where the state matters most: `automation/task.json`, runtime state, evidence packs, worker reports, and controller outputs. Retrospectives, operation-gate reports, reviewer outputs, and similar automation wrappers should follow the same rule. Markdown should remain only for canonical OpenSpec documents and human-facing documentation.

## What Changes

- Define a repository-wide rule that Autopilot-owned and OpenSpec automation wrapper artifacts are JSON-only.
- Make `openspec/changes/<change>/automation/retro.json` the canonical retrospective artifact for archive gates.
- Treat `retrospective.md` as deprecated and block new Autopilot/OpenSpec automation behavior from depending on it.
- Update retrospective gate and follow-up helpers to read/write/validate `automation/retro.json` instead of parsing Markdown tables.
- Update OpenSpec skills, task-tail templates, README guidance, validator checks, and tests so new changes ask for `automation/retro.json`.
- Add migration/compatibility behavior for existing `retrospective.md` artifacts: either generate equivalent JSON or fail with a clear migration action before archive.

## Goals

- Make all Autopilot automation evidence deterministic, schema-backed, and machine-checkable.
- Remove Markdown parsing as the source of truth for retrospective/archive gates.
- Keep canonical OpenSpec files in Markdown: `proposal.md`, `design.md`, `tasks.md`, `spec.md`, and optional human-facing docs.
- Preserve traceability by allowing Markdown files to reference JSON artifacts, not duplicate them as source of truth.
- Make future operation gates and Autopilot triggers consume JSON contracts only.

## Non-Goals

- Do not convert canonical OpenSpec documents such as `proposal.md`, `design.md`, `tasks.md`, or `spec.md` to JSON.
- Do not remove historical archived Markdown files unless a migration task explicitly approves cleanup.
- Do not let agents or workers directly mutate protected automation JSON during Autopilot runs; plugin-owned or validator-owned helpers remain responsible for protected state writes.
- Do not introduce YAML, TOML, or ad-hoc Markdown tables for new Autopilot wrapper artifacts.

## Canonical JSON Locations

- `openspec/changes/<change>/automation/task.json`: Autopilot task ledger.
- `openspec/changes/<change>/automation/retro.json`: retrospective/archive-gate source of truth.
- `openspec/changes/<change>/automation/operation-gates/<operation>.json`: operation-gate reports.
- `openspec/changes/<change>/automation/evidence/*.json`: evidence packs and validation snapshots.
- `openspec/changes/<change>/automation/reviews/*.json`: reviewer gate outputs.
- `openspec/changes/<change>/automation/worker-reports/*.json`: worker report snapshots when persisted.

## Impact

- Archive readiness becomes more reliable because root causes, findings, follow-up ids, and decisions are validated from JSON.
- Skills and generated tasks stop teaching new agents to create `retrospective.md` wrappers.
- Existing retro helper tests and gate logic must be migrated from Markdown parsing to JSON schema validation.
- OpenSpec operation gates can depend on stable JSON artifacts rather than brittle Markdown sections.

## Validation

- Add schema/fixture tests for `automation/retro.json`.
- Add migration tests from legacy `retrospective.md` to JSON or explicit blocked output.
- Run `npm run validate`.
- Run `npm test`.
- Run `npm run openspec:validate`.
- Run `npm run openspec:retro-gate -- <change-id>` against JSON-backed fixtures.
- Run instruction-artifact review after skill/README/task-tail updates.
