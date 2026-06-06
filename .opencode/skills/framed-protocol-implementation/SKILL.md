---
name: framed-protocol-implementation
description: Implement or review framed client/server protocols with headers, schema evolution, request correlation, cancellation, heartbeat, reconnect, diagnostics, and binary-safe IO.
license: MIT
---

# Framed Protocol Implementation

Use this skill for custom TCP/IPC/WebSocket/binary protocols or application protocols with explicit frame boundaries.

## Principles

- Define wire format before implementation: magic/version, length, type, flags, correlation id, payload, checksum if any.
- Parsing must be binary-safe, bounded, and resistant to partial frames, oversized frames, and malformed data.
- Request/response correlation must be explicit for concurrent sessions.
- Schema evolution needs compatibility rules and unknown-field behavior.
- Cancellation, heartbeat, reconnect, and diagnostics are protocol features, not afterthoughts.

## Checks

- Golden byte tests for headers, payloads, boundaries, and malformed frames.
- Partial read/write tests and exact-size boundary tests.
- Concurrent requests cannot mix responses.
- Backpressure and max frame size are enforced.
- Error taxonomy distinguishes parse, validation, IO, timeout, cancellation, and protocol errors.
- Diagnostics expose session id, correlation id, frame type, and error kind without leaking secrets.

## Output

Return protocol contract, compatibility notes, tests, failure matrix, performance considerations, and residual risks.
