# Proposal: Add Deterministic Artifact Contracts

## Why

The repository already has useful validators for skills, agents, README catalogs, profiles, package scripts, OpenSpec retrospectives, operation gates, and instruction drift. Several high-value library workflows still depend on duplicated prose and hardcoded rule lists spread across `README.md`, `package.json`, `tools/validate-library.ts`, `tools/test-library-validation-scripts.ts`, `instructions/leaf-reviewer-agent-contract.md`, reviewer agents, and porting checklists.

This makes artifact maintenance slower and less reliable: adding or renaming a tool, skill, reviewer, profile entry, catalog row, or porting anchor requires manual synchronized edits. The failure mode is mechanical drift, not judgment failure, so it should be handled by explicit manifests, schemas, exact set equality checks, and generated/verified fragments.

## What Changes

- Add a deterministic tool contract manifest that verifies package scripts, README command references, required tests, and mutability metadata.
- Add an instruction artifact manifest/checker for skills, agents, instruction templates, profiles, README catalogs, routing tables, and optional installed-copy drift evidence.
- Add reviewer-agent contract verification for shared leaf-reviewer permissions and required output sections.
- Add a porting anchor manifest so project-specific residue is checked by explicit substring/regex rules and reasoned suppressions instead of one-off CLI flags.
- Extend instruction inventory with exact duplicate block evidence for repeated prose that can be intentionally retained or extracted.
- Update `README.md`, instruction templates, and relevant skills to reference the deterministic contracts instead of restating long checklists.

## Goals

- Replace manual catalog, script, reviewer, and porting drift checks with strict TypeScript tooling.
- Keep outputs stable, schema-backed, redacted by default, and safe for agents/reviewers.
- Make every proposed helper non-heuristic: no fuzzy scoring, trigger ranking, model-like summarization, or inferred severity.
- Preserve human reviewer judgment for routing quality, root cause, design quality, and whether duplicated prose is intentional.

## Non-Goals

- Do not make the manifests a runtime dependency for OpenCode loading; installed skills and agents remain self-contained Markdown files.
- Do not infer skill trigger quality, rank reviewers, or assign severity from text patterns.
- Do not fetch remote or installed config paths by default; installed drift evidence requires explicit paths and redacts paths unless requested.
- Do not auto-rewrite README or agent files without an explicit `--write` mode and tests proving exact generated output.

## Impact

- `package.json`, README validation sections, and validator script checks become manifest-backed.
- Reviewer agents keep domain-specific content while common permissions and output contract are enforced centrally.
- Porting reusable artifacts becomes safer because forbidden local anchors are recorded in a durable JSON contract.
- Broad instruction-artifact audits can start from one evidence bundle rather than assembling counts, catalogs, permissions, and drift manually.

## Validation

- Add fixture-backed tests before implementation for every contract mismatch and accepted valid fixture.
- Run `npm run validate`.
- Run `npm test`.
- Run `npm run openspec:validate`.
- Run the new manifest/check commands in JSON and Markdown modes where available.
