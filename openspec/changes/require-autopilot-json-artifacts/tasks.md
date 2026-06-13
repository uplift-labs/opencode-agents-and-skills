# Tasks: Require Autopilot JSON Artifacts

## Tests First

- [ ] Add `automation/retro.json` schema fixtures covering passed, blocked, approved-skip, no-findings, project-local follow-up, opencode-dev-kit follow-up, and unknown-root-cause investigation routing.
- [ ] Add negative fixtures for missing `schemaVersion`, wrong `changeId`, malformed findings, missing evidence, missing root cause, unknown root cause without investigation, missing follow-up id, missing follow-up change, and invalid archive decision.
- [ ] Add migration tests for valid legacy `retrospective.md` and blocked migration output for malformed Markdown tables.
- [ ] Add validator tests proving new Autopilot/OpenSpec automation wrapper artifacts with `.md` extensions are rejected unless they are canonical OpenSpec documents.
- [ ] Add instruction drift tests proving skills and README require `automation/retro.json`, not `retrospective.md`.

## Implementation

- [ ] Add a TypeScript `retro.json` schema validator and expose it through `npm run openspec:retro-gate -- <change-id>`.
- [ ] Update `tools/openspec-retro-gate.ts` to validate `openspec/changes/<change>/automation/retro.json` as source of truth.
- [ ] Update `tools/openspec-retro-followups.ts` to read findings from `automation/retro.json`, create/reuse follow-up changes, and update JSON outputs.
- [ ] Add a deterministic migration helper or mode for converting supported legacy `retrospective.md` content into `automation/retro.json`.
- [ ] Update `tools/validate-library.ts` to reject new Autopilot wrapper Markdown artifacts and allow only canonical OpenSpec Markdown documents and human-facing documentation.
- [ ] Update `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-autopilot`, and related instructions to require `automation/retro.json`.
- [ ] Update README OpenSpec/Autopilot guidance with the JSON-only artifact rule and canonical locations.
- [ ] Update existing active OpenSpec changes that still instruct agents to write `retrospective.md` so they point at `automation/retro.json`.

## Review Gates

- [ ] Run `instruction-artifact-reviewer` after skill, README, and task-tail updates.
- [ ] Run `code-quality-reviewer` for validator/generator changes.
- [ ] Run `test-coverage-reviewer` for JSON schema, migration, and archive-gate coverage.

## Validation

- [ ] `npm run validate`
- [ ] `npm test`
- [ ] `npm run openspec:validate`
- [ ] `npm run openspec:retro-gate -- <json-backed-change-fixture>`
- [ ] `npm run prepush:validate`

## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [ ] Write `openspec/changes/require-autopilot-json-artifacts/automation/retro.json` with evidence, problems, root causes, improvements, follow-up ids, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update `opencode-dev-kit` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run `npm run openspec:retro-followups -- require-autopilot-json-artifacts` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the JSON retro gate passes or an approved skip reason is recorded in `automation/retro.json`.
