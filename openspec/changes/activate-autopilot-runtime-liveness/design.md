# Design: Activate Autopilot Runtime Liveness

## Overview

This change is a coordinated liveness hardening package for Autopilot. It does not introduce one monolithic runtime rewrite. Instead, it turns audit findings into ordered implementation slices that each have a focused test gate, a minimal runtime or tooling change, and clear validation evidence.

The implementation order is intentional. Queue liveness comes first because a stale selected ledger can send every later improvement toward the wrong work. Prompt intake comes next because it is the clearest test-only Autopilot module. Packaging follows because live worker dispatch cannot run regularly without a coherent install/config path. Durable trigger evidence follows because controlled and autonomous event branches should not be advertised as live until ownership evidence survives plugin restarts.

## Decisions

### Queue Liveness Is A Runtime Gate

Completed `tasks.md` evidence must prevent a non-terminal ledger from being selected as live Ready work. The first implementation should not silently rewrite protected ledgers. It should classify the mismatch, surface a blocker or stale state, and prefer unfinished active changes when safe.

Rationale: protected ledger mutation is plugin-owned and should not happen as a side effect of read-only status or discovery.

### Prompt Intake Gets A Read-Only Plugin Surface

The deterministic prompt-intake helper should be reachable through a plugin-owned read-only action, such as `autopilot_intake` or an equivalent command adapter. It should return derived classification fields and first-tool guidance without echoing or persisting raw prompt text by default.

Rationale: `/autopilot <free-form prompt>` is too important to depend only on a long prompt template. The helper already encodes exact-scope and free-form safety rules.

### Live Worker Dispatch Remains Explicit Opt-In

Worker dispatch should be easy to install and verify, but not enabled by the default skill/agent installer. A dedicated installer option or profile should package the server plugin, command config, dependency, and nested options together.

Rationale: `workerDispatch.enabled` assumes one OpenCode server/plugin runtime instance owns the repository. Silent global enablement is unsafe.

### Controlled Triggers Require Durable Ownership Evidence

Controlled event branches must use evidence persisted in the runtime store or another plugin-owned durable source. Injected `runtimeState` may remain useful for tests and harnesses, but production claims should not depend on ephemeral options only.

Rationale: event-driven blocker, permission, workspace, and autonomous run-next branches should survive plugin restarts and avoid false ownership claims.

### Dead Or Contract-Only Code Must Be Classified

Every remaining no-consumer export should have one of three outcomes: production consumer, explicit contract/test utility role, or deletion.

Rationale: the repository is a reusable Autopilot kit; misleading public surface area increases maintenance and routing risk.

## Compatibility

- Existing public `autopilot_run_next`, `autopilot_status`, `autopilot_collect`, `autopilot_answer_blocker`, and `autopilot_stop` shapes should remain compatible unless a separate contract change updates shared public values and drift tests.
- Any new public tool such as `autopilot_intake` must be added to shared contract tests, README bundle guidance, command wording, and skill guidance.
- Runtime store schema changes need explicit validation and recovery behavior. A schema version bump is acceptable if tests prove old invalid shapes fail safely or migrate deterministically.
- Installer changes must preserve dry-run, backup, and no-prune semantics.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Stale-ledger handling hides legitimate partially-complete work | Autopilot may stop too early | Use checklist mismatch only when `tasks.md` is all checked and ledger is non-terminal; expose diagnostics rather than deleting ledger. |
| Prompt-intake tool could leak raw prompt text | User prompt content may be persisted or echoed | Return derived fields only by default; add tests that raw prompt text is absent. |
| Worker dispatch install path enables multiple runtime owners | Duplicate workers or runtime corruption | Keep opt-in, document single-owner boundary, and include config warnings. |
| Runtime schema expansion permits untrusted event ownership | Controlled triggers may act on unrelated events | Strict schema validation, allowed keys, ownership ids, and revalidation before job execution. |
| Cleanup removes useful test utilities | Test quality regresses | Move or mark test utilities instead of deleting when they reduce deterministic coverage. |

## Rollout

1. Implement and validate queue-liveness gate.
2. Wire prompt intake as read-only plugin surface and update routing docs/tests.
3. Add opt-in Autopilot live bundle installer/config path.
4. Persist controlled/autonomous trigger evidence.
5. Remove or classify dead/test-only APIs and helpers.
6. Run final validation and reviewer gates.

## Open Questions

- Should stale completed ledgers be blocking failures in `autopilot:check --level cheap`, or warning-level diagnostics until an archive/cleanup command exists?
- Should prompt intake be exposed as a public `autopilot_intake` tool, or as command-level plugin/controller logic not shown to the model as a separate tool?
- Should `advanced` profile remain skill/agent-only, or should a new explicit `autopilot-live` profile own plugin/command installation?
