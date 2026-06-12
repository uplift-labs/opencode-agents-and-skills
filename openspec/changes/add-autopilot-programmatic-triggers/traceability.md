# Traceability: Add Autopilot Programmatic Triggers

## Source Questions

| User Concern | Proposed Coverage |
| --- | --- |
| Can Autopilot respond to OpenCode events, hooks, and programmatic triggers? | Add a shared controller plus event/hook/TUI trigger contract for status, checks, collect, blocker answers, permissions, and explicit run actions. |
| How do we avoid surprise autonomous work? | Passive events default to observe-only status/check behavior; `autopilot_run_next` from events requires explicit opt-in and plugin-owned active-run evidence. |
| How do we keep event storms from causing loops? | Scheduler requirements cover debounce, single-flight, cooldown, source tagging, and loop-guard recursion suppression. |
| When should worker reports be collected? | Plugin-owned worker `session.status: idle` and complete report marker evidence schedule exactly one scoped collect. |
| How do blocker answers continue the flow? | `question.replied` and permission replies are handled only when request/action ids match plugin-owned pending state. |
| How do we protect Autopilot state? | `tool.execute.before` or permission-backed guard blocks direct writes to `.autopilot/**` and `openspec/changes/*/automation/**`. |
| Can users get quick status without LLM? | Optional TUI commands provide zero-LLM status/check and explicit run/stop with dialog or prompt-mediated fallback. |

## Requirement To Task Map

| Requirement | Primary Tasks |
| --- | --- |
| Programmatic Triggers Use A Shared Autopilot Controller | Tests 10; Implementation 1; Acceptance 1 |
| Trigger Scheduling Is Debounced, Idempotent, And Recursion-Safe | Tests 1-4; Implementation 2-3; Acceptance 4 |
| Passive Events Never Start Claim-Capable Work By Default | Tests 1, 3-4; Implementation 4-6, 13; Acceptance 2, 7 |
| Controlled Runtime Events Require Plugin-Owned Evidence | Tests 5-7; Implementation 7-9; Acceptance 3 |
| Post-Tool Checkpoints Run Cheap Validation Without Loops | Tests 8; Implementation 6; Acceptance 2, 4 |
| Protected Autopilot Paths Are Guarded Against Direct Tool Writes | Tests 9; Implementation 10; Acceptance 5 |
| TUI Commands Are Explicit User Actions | Tests 11; Implementation 11-12; Acceptance 6 |
| Trigger Modes Are Configurable And Safe By Default | Tests 4; Implementation 3, 13; Acceptance 2, 7 |

## Implementation Boundaries

In scope:

- Shared controller seam for existing Autopilot tool behavior.
- Deterministic trigger scheduler.
- Server plugin `event`, `tool.execute.after`, and protected-path guard hooks.
- Observe-mode file-trigger status/check scheduling.
- Controlled collect/blocker/permission/workspace triggers with plugin-owned evidence.
- Optional TUI status/check and explicit run/stop command contracts.
- Tests and documentation for trigger modes and safety policy.

Out of scope:

- Default autonomous claim/dispatch from passive events.
- Worker/provider orchestration beyond existing or separately planned runtime harness behavior.
- Protected ledger mutation, branch/worktree creation, MR creation, merge, deploy, or remote provider actions.
- Fuzzy matching of prompts/events to unrelated Autopilot tasks.
- Desktop/Web UI extensions.

## Suggested Implementation Order

1. Add tests for controller compatibility and trigger classification.
2. Extract the shared controller while keeping existing tool tests green.
3. Implement scheduler with debounce/single-flight/cooldown/recursion guards.
4. Add observe-mode file and post-tool checkpoint triggers.
5. Add controlled worker collect and blocker/permission handling.
6. Add protected-path guard.
7. Add optional TUI command entrypoint or document fallback if bridge proof is unavailable.
8. Update README, skill, command wording, and drift tests.
9. Run validation and reviewer gates.

## Evidence To Collect During Implementation

- Existing Autopilot contract tests before and after controller extraction.
- Fake event/hook test outputs proving no `autopilot_run_next` from passive events by default.
- Scheduler logs or structured test evidence for coalesced duplicate events.
- Negative tests for unknown sessions/questions/permissions being ignored.
- Protected-path guard failure messages for direct model writes.
- TUI smoke evidence if TUI commands are implemented.
