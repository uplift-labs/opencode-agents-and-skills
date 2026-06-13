# Design: Add OpenSpec Operation Gates

## Overview

This change introduces a deterministic operation-gate layer for OpenSpec lifecycle actions. The gate is intentionally read-only by default. It gathers explicit evidence, applies operation-specific rules, returns a stable JSON envelope, and optionally persists that envelope under the change's `automation/operation-gates/` directory.

The gate should reuse existing validators wherever possible rather than duplicate them: OpenSpec CLI validation, Autopilot ledger validation, Autopilot check/freshness helpers, retro gate, and repository validation remain authoritative for their domains.

## Output Contract

```json
{
  "schemaVersion": 1,
  "operation": "archive",
  "changeId": "<change-id>",
  "generatedAt": "2026-06-13T00:00:00.000Z",
  "status": "passed|warning|failed|blocked|not-applicable",
  "checks": [
    {
      "id": "archive:retro-json",
      "label": "JSON retrospective gate",
      "status": "passed|warning|failed|blocked|not-applicable|unknown",
      "blocking": true,
      "source": "openspec/changes/<change>/automation/retro.json",
      "summary": "<short deterministic summary>"
    }
  ],
  "nextActions": [
    {
      "label": "Create automation/retro.json",
      "reason": "Archive requires JSON retrospective evidence.",
      "command": "npm run openspec:retro-gate -- <change-id>"
    }
  ]
}
```

## Gate Modes

- Default mode is read-only and does not write reports.
- `--persist` writes `openspec/changes/<change>/automation/operation-gates/<operation>.json` through a deterministic helper path.
- `--format json|markdown` may render for humans, but JSON remains canonical.
- `--changed-files` allows pre-push and hook integrations to scope checks without scanning git state twice.

## Operation Registry

Each operation has a named set of checks. Checks should be deterministic functions over explicit inputs. Unsupported evidence returns `unknown`, `blocked`, or `not-applicable`; it must not be guessed.

### Propose

Validates safe id, required proposal/tasks/spec structure, test-first task ordering, `automation/retro.json` archive-tail wording, no duplicate active/archive change id, and `openspec validate <change> --strict` compatibility when available.

### Apply

Validates accepted or explicitly selected change, synchronized artifacts, no unresolved blockers, test-first plan, and routing to Autopilot when `automation/task.json` or strict typed phases own the flow.

### Task Update

Validates checkbox changes, evidence notes for completed tasks, validation evidence for validation tasks, final JSON retrospective tail preservation, and stale all-checked active changes.

### Ledger Materialize

Validates active change existence, unchecked tasks, safe scope, forbidden protected paths, validation commands, review policy, task type, and successful `autopilot:validate` after materialization.

### Worker Dispatch

Validates explicit worker dispatch enablement, OpenCode session capability, runtime store validity, no active serial worker conflict, dependencies, blockers, MR waits, legal phase, write scope, prompt/report contract, and stale ledger state.

### Collect

Validates plugin-owned worker session, expected report id, complete marker, unique report id, runtime identity match, ledger revision/status freshness, legal transition, and idempotent duplicate handling.

### Review

Validates required reviewer outputs, test coverage, code quality, deployment/config review when applicable, docs/spec sync, and no hidden blockers.

### Acceptance

Validates terminal readiness, MR policy, fan-in evidence for parallel work, archive readiness blockers, docs/spec sync, and no unresolved feedback.

### Archive

Validates complete tasks, JSON retrospective, follow-up OpenSpec changes, freshness, OpenSpec validation, no active Autopilot runtime references, and no active ledger for completed archived work.

### Post-Archive

Validates archive directory state, no active ledgers/runs for archived change, follow-up changes still valid, docs updated when behavior changed, and final OpenSpec validation.

### Prepush

Composes repository validation, tests, OpenSpec validation, active Autopilot ledger validation, freshness gates, stale ledger detection, changed OpenSpec artifact gates, and archive/post-archive gates when archive files changed.

## Trigger Integration

- `file.watcher.updated` for active `tasks.md`, `proposal.md`, `design.md`, spec deltas, `automation/task.json`, `automation/retro.json`, and operation-gate JSON may schedule cheap read-only gate checks.
- `tool.execute.after` for successful Autopilot progress may schedule status/check gates, not another claim-capable call.
- Passive events never call `autopilot_run_next` by default.
- Controlled/autonomous triggers may use operation gates as prerequisites before collect, worker dispatch, or scoped run-next.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Gate duplicates existing validators | Maintenance drift | Reuse existing validators and wrap their outputs rather than reimplementing. |
| Gate becomes too slow for hooks | Developer friction | Define cheap vs full checks and scope by changed files. |
| Gate writes protected automation state unsafely | Corrupt evidence | Default read-only; persist only via deterministic helper with protected-path rules. |
| Too many operation statuses confuse agents | Routing mistakes | Use stable `status`, `checks[]`, and `nextActions[]` envelope similar to Autopilot checks. |

## Open Questions

- Should `openspec:gate --operation archive` automatically call `openspec:retro-followups`, or only report it as a next action?
- Which pre-push failures should be blocking immediately versus warnings until migration is complete?
