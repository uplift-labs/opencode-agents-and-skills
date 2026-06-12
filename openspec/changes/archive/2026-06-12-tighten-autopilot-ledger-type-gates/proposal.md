# Proposal: Tighten Autopilot Ledger Type Gates

## Why

The live regression confirmed that the ledger validator enforces important generic gates, but accepts several task types without the type-specific evidence required by the Autopilot skill and process policy.

In-memory probes using `validateTaskLedger` returned `valid: true` for ledgers that omitted required evidence:

- `bugfix`: no reproduction or characterization-first evidence.
- `tooling`: no fixture/schema/validator gate beyond generic validation wording.
- `config`: no fixture/schema/validator gate beyond generic validation wording.
- `performance`: no benchmark/profile evidence.
- `protocol`: no golden/negative protocol evidence.

## What Changes

- Add validator rules and fixtures for task-type-specific evidence.
- Require bugfix ledgers to record reproduction, characterization, or an explicit infeasible reason before implementation.
- Require tooling/config ledgers to record a fixture, schema, validator, generated-config, or equivalent deterministic gate.
- Require performance ledgers to record benchmark/profile evidence or an explicit infeasible reason.
- Require protocol ledgers to record golden/negative protocol evidence or an explicit infeasible reason.
- Keep reviewer routing explicit and require every relevant reviewer to be required or skipped with a reason.

## Evidence

- `npm test` passed existing validator tests, proving current generic gates are stable.
- Targeted validator command showed valid fixtures for feature/research/typo and expected failures for missing `testDecision`, silent reviewer skip, and missing MR merge evidence.
- In-memory probe command returned `valid: true` for `bugfix`, `tooling`, `config`, `performance`, and `protocol` ledgers with only generic plan/test evidence and no type-specific gate evidence.
- Source evidence: `tools/autopilot-ledger.ts` validates generic transitions and reviewer routing, but does not check bugfix reproduction fields, tooling/config fixture/schema fields, performance benchmark fields, or protocol golden-test fields.

## Impact

- Autopilot can appear to enforce strict process gates while allowing behavior-changing bugfixes without reproduction proof.
- Config/tooling changes can pass without deterministic fixture/schema validation.
- Performance/protocol tasks can pass without benchmark or golden-vector evidence, weakening reviewer confidence.

## Validation

- Add focused failing fixtures/probes before implementation.
- Keep `npm run validate`, `npm test`, `npm run autopilot:validate -- <task-ledger.json>`, and `openspec validate --all` green.
