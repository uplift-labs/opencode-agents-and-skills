---
name: external-service-simulator-harness
description: Create deterministic fake servers or external dependency simulators for integration, concurrency, recovery, slow-response, and load tests.
license: MIT
---

# External Service Simulator Harness

Use this skill when tests need a fake TCP/HTTP/WebSocket/device/upstream service that behaves deterministically under normal, slow, broken, or concurrent scenarios.

## Principles

- Simulators should be deterministic, scriptable, and easy to assert against.
- Test the boundary behavior, not implementation internals.
- Include slow, partial, malformed, disconnect, late-response, and overload scenarios when relevant.
- Record all received requests and emitted responses for assertions.
- Avoid sleeping blindly; use synchronization, deadlines, and deterministic scripts.

## Harness Features

- Start/stop lifecycle with port allocation and cleanup.
- Scenario scripts: request match -> response, delay, split, drop, error, hang.
- Concurrency controls for many clients/resources.
- Observability: captured requests, timestamps, state transitions, connection events.
- Fault injection: partial reads/writes, stale data, reconnect, timeout-after-send.

## Output

Return harness API, scenario matrix, tests using the harness, limitations versus real hardware/service, and validation results.
