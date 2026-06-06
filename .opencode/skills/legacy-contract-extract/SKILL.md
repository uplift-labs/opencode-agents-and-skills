---
name: legacy-contract-extract
description: Extract behavior contracts from legacy applications, clients, protocols, logs, tests, or source code and turn them into modern requirements/spec evidence.
license: MIT
---

# Legacy Contract Extract

Use this skill when migrating or replacing legacy software and behavior must be preserved, clarified, or intentionally changed.

## Evidence Rules

- Legacy docs and comments are navigation aids, not proof.
- Prefer source, tests, schemas, IDL, protocol captures, binaries with stable public contracts, logs, and live/manual output.
- Record when evidence is docs-only, ambiguous, untested, or blocked by missing hardware/access.
- Distinguish compatibility requirements from implementation accidents.

## Workflow

- Identify legacy sources and entry points.
- Map public APIs, commands, configuration, states, error codes, timing assumptions, and compatibility expectations.
- Extract observed behavior into requirement scenarios.
- Mark unsupported, intentionally changed, unknown, and future-scope behavior.
- Add traceability from requirement to legacy evidence and modern validation gate.

## Output

Return legacy evidence map, extracted contracts, confidence, open questions, compatibility risks, and proposed spec/tasks/tests.
