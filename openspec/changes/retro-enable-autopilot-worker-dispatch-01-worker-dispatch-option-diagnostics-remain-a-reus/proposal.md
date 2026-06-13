# Proposal: Worker-dispatch option diagnostics remain a reusable hardening item

## Why

This follow-up was generated from `enable-autopilot-worker-dispatch` retrospective evidence.

- Problem: Worker-dispatch option diagnostics remain a reusable hardening item
- Evidence: `tasks.md` deployment-config-reviewer evidence names strict plugin-option diagnostics follow-up plus live restarted E2E before target enablement
- Impact: Operators enabling live dispatch could receive capability or deferred output without enough config/preflight detail
- Root cause: Deployment review identified live-enable diagnostics as intentionally deferred beyond the serial dispatch implementation slice
- Confidence: high
- Target: opencode-dev-kit

## What Changes

- Address the root cause by implementing or documenting: Tighten `workerDispatch` option diagnostics and live-enable preflight evidence before recommending target deployment
- Preserve the source retrospective link so archive review can trace why this follow-up exists.

## Non-Goals

- Do not expand beyond the retrospective finding without a separate OpenSpec decision.
- Do not write cross-repo artifacts unless this repository owns the reusable artifact or the user explicitly approves that scope.

## Validation

- Define focused validation in `tasks.md` before implementation.
