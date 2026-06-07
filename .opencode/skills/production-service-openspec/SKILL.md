---
name: production-service-openspec
description: Draft production-oriented OpenSpec changes for a minimal service baseline with ownership, APIs, bounded queues, recovery, config, observability, deployment, and test gates.
license: MIT
---

# Production Service OpenSpec

Use this skill when creating an OpenSpec change for productionizing a service baseline rather than adding a narrow feature.

## Scope Guard

- Include only behavior needed for the selected production baseline.
- Keep optional future features out unless explicitly accepted.
- Capture unsupported behavior and future-scope items as explicit non-goals.
- Requirements must be observable and testable.
- Production baseline tasks must define TDD/test-first contract, acceptance, recovery, or load evidence before implementation of each behavior-changing slice.
- For multi-area baselines with independent evidence tracks, consider `orchestrator` read-only fan-out before drafting; keep final proposal/spec synthesis in the main session.

## Baseline Areas

- API/protocol contract.
- Config and deployment model.
- Bounded admission, queues, and backpressure.
- Request/response/session ownership.
- Failure and recovery behavior.
- Observability and diagnostics.
- Compatibility and migration boundaries.
- Acceptance tests, integration tests, load/performance evidence, and manual gates.

## Output

Create or return proposal, design, specs, tasks, traceability, and validation plan. Include clear non-goals and required evidence before production readiness claims.
