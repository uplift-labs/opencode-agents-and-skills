---
name: wire-protocol-golden-tests
description: Build golden byte/vector tests for binary or text wire protocols, codecs, transports, fake servers, request codes, payload limits, and recovery boundaries.
license: MIT
---

# Wire Protocol Golden Tests

Use this skill when a protocol codec, transport, fake server, or compatibility layer must exactly match a wire contract.

## Principles

- Golden tests should assert exact bytes, lengths, byte order, delimiters, flags, and error handling.
- Include known-good, boundary, malformed, unsupported, and compatibility vectors.
- Treat docs-only protocol claims as hypotheses until backed by source, captures, fixtures, schemas, or live output.
- Keep fixtures small, named, and explain the contract they prove.

## Test Matrix

- Encode canonical request/response.
- Decode canonical request/response.
- Empty payload, max payload, exact chunk size, and one-over-limit.
- Non-ASCII/binary payload preservation.
- Unknown version/type/code handling.
- Partial frame/read/write behavior.
- Timeout/reconnect/stale-data recovery when relevant.
- Legacy compatibility vectors if replacing an existing system.

## Output

Return fixture list, contract covered by each vector, missing vectors, validation result, and compatibility risks.
