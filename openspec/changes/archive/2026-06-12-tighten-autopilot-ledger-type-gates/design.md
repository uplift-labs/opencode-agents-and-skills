# Design: Tighten Autopilot Ledger Type Gates

## Goals

- Align validator behavior with Autopilot task-type policy.
- Require structured evidence for high-risk task types instead of accepting generic plan prose.
- Keep evidence deterministic and reviewable in `task.json` fixtures, transition evidence, or `phaseEvidence`.
- Avoid overfitting to one repository's command names or file layout.

## Evidence Placement

The validator should read type-specific evidence from the same places it already checks transition evidence:

- `history[].evidence` for the relevant transition.
- `phaseEvidence.analyze`, `phaseEvidence.implementation`, or `phaseEvidence.review`.
- Optional top-level fields only if they are explicitly added to the ledger schema.

Prefer structured fields over free-form `testStrategy` text. Free-form prose may explain evidence, but should not be the only proof for type-specific gates.

## Proposed Evidence Fields

| Task Type | Required Evidence | Acceptable Structured Fields |
| --- | --- | --- |
| `bugfix` | Reproduction, characterization, or infeasible reason before implementation. | `reproduction`, `characterization`, `regressionTest`, `infeasibleReason` |
| `tooling` | Deterministic fixture, validator, generated-output, or CLI contract gate before review. | `toolingGate`, `fixture`, `validator`, `cliContract`, `generatedOutput` |
| `config` | Schema, fixture, generated config, limits/defaults check, or reload-policy validation before review. | `configGate`, `schemaCheck`, `fixture`, `generatedConfig`, `reloadPolicy` |
| `performance` | Benchmark, profile, load test, SLO comparison, or explicit infeasible reason before review. | `benchmark`, `profile`, `loadTest`, `sloEvidence`, `infeasibleReason` |
| `protocol` | Golden vectors, negative cases, compatibility vectors, or explicit infeasible reason before review. | `goldenVectors`, `negativeCases`, `compatibilityVectors`, `wireEvidence`, `infeasibleReason` |

Evidence objects should include a short `summary` and either a command, file reference, metric, fixture path, or explicit reason. The validator should not require local project-specific command names.

## Validation Timing

Bugfix reproduction belongs at `Analyze -> Implementation` because implementation should not begin before the defect is characterized. Tooling, config, performance, and protocol evidence belongs at `Implementation -> Review` because the evidence normally comes from changed fixtures, generated outputs, benchmarks, or golden tests.

## Reviewer Routing

The existing reviewer-accounting rule should remain: every relevant reviewer must be required or skipped with a reason. The type-specific evidence checks should complement reviewer routing, not replace it.

## Test Strategy

- Add one invalid fixture per missing gate that fails for the new structured evidence requirement.
- Add one valid fixture per task type with minimal acceptable evidence.
- Add tests showing an explicit infeasible reason is allowed only when it is non-empty and tied to the relevant task type.
- Keep existing feature, research, typo, and MR merge tests green.

## Risks

- Overly strict evidence fields can make simple tasks heavy. Allow explicit infeasible reasons where the skill policy already allows them.
- Relying on command names would make artifacts non-portable. Validate field presence and evidence shape, not repository-specific commands.
- Adding too many mandatory fields at once can make fixtures noisy. Start with the smallest structured fields needed to close confirmed gaps.
