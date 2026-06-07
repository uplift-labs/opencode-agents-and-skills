---
name: com-activex-adapter-implementation
description: Implement or review Windows COM/ActiveX adapters, local-server or DLL boundaries, activation, threading, events, shared-server semantics, and legacy client compatibility.
license: MIT
---

# COM ActiveX Adapter Implementation

Use this skill for Windows legacy adapter work involving COM, ActiveX, IDL/type libraries, local servers, DLLs, apartment threading, events, or compatibility shims.

## Principles

- Treat legacy IDL/type library, activation behavior, threading model, and event semantics as public compatibility contracts.
- Before adapter behavior changes, derive compatibility tests or manual gates from legacy IDL/type library/client evidence whenever feasible.
- Do not assume transparent compatibility without running or inspecting legacy clients where possible.
- Separate adapter boundary from modern service/runtime boundary.
- Keep registration, bitness, permissions, and installer behavior explicit.

## Checks

- CLSID/ProgID/interface names, DISPIDs, argument types, return types, and error codes match required compatibility.
- 32-bit/64-bit registration and activation paths are documented.
- STA/MTA expectations and cross-thread calls are safe.
- Events/callbacks are ordered, disconnect-safe, and do not deadlock.
- Shared local-server semantics are tested if multiple clients can attach.
- Installer/register/unregister behavior is reversible.

## Output

Return compatibility matrix, adapter boundary, activation/threading decisions, tests/manual gates, installer notes, and residual risks.
