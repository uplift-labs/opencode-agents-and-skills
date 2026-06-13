# Design: Require Autopilot JSON Artifacts

## Overview

This change establishes JSON as the only format for Autopilot-owned and automation wrapper artifacts. Markdown remains valid for OpenSpec documents that are intentionally human-authored and review-oriented. The key migration is from `retrospective.md` to `automation/retro.json`.

## Decisions

### `automation/retro.json` Is Canonical

The archive gate should validate `openspec/changes/<change>/automation/retro.json`. A human-readable summary can exist in canonical docs, but it must not be the source of truth for archive readiness.

### JSON Schema Is Strict And Versioned

Every automation artifact gets `schemaVersion`. Unknown fields should fail unless the schema explicitly allows an extension bag. This mirrors task-ledger validation and prevents silent drift.

### Retrospective Findings Route Follow-Ups By Id

Each actionable finding must include a `followUpChangeId` or an approved no-follow-up reason. Follow-up changes must exist and preserve the root cause and recommendation in proposal/tasks/spec artifacts.

### Markdown Compatibility Is Transitional Only

Existing `retrospective.md` files may be migrated by a deterministic helper or reported as needing migration. New changes should not generate or require `retrospective.md`.

## `retro.json` Shape

```json
{
  "schemaVersion": 1,
  "changeId": "<change-id>",
  "generatedAt": "2026-06-13T00:00:00.000Z",
  "evidenceReviewed": [
    {
      "kind": "command|file|review|tool-output|manual-gate|unknown",
      "source": "<path-or-command>",
      "status": "passed|failed|blocked|unknown|not-applicable",
      "summary": "<short evidence summary>"
    }
  ],
  "problems": [
    {
      "problem": "<symptom>",
      "evidence": "<evidence>",
      "impact": "<impact>",
      "rootCause": "<root cause or unknown>",
      "recommendation": "<recommendation>",
      "confidence": "low|medium|high",
      "target": "project-local|opencode-dev-kit|none",
      "followUpChangeId": "<change-id-or-null>",
      "noFollowUpReason": "<reason-or-null>"
    }
  ],
  "outputs": {
    "projectFollowUpChanges": [],
    "opencodeDevKitChanges": [],
    "noFindingsReason": "<reason-or-null>"
  },
  "archiveGate": {
    "decision": "passed|blocked|approved-skip",
    "reason": "<reason>",
    "approver": "<approver-or-null>"
  }
}
```

## Migration Strategy

1. Add fixtures proving legacy `retrospective.md` content can be converted when the table shape is valid.
2. Add `retro.json` validator and make the archive gate prefer JSON.
3. Update follow-up generator to read/write `automation/retro.json`.
4. Update skills/task tails to require JSON.
5. Keep a temporary explicit error for old Markdown-only changes: `automation/retro.json missing; run migration/generator`.
6. Remove Markdown parsing from archive gates after all active changes are migrated or explicitly exempted.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Existing changes archive-blocked after format switch | Active work stalls | Provide deterministic migration/generator and clear next action. |
| JSON becomes unreadable for humans | Review friction | Keep concise summaries in final responses/docs, but preserve JSON as source of truth. |
| Agents manually edit protected JSON incorrectly | Corrupt automation state | Keep protected-path guard and validators; plugin/helper writes only where required. |
| Two sources of truth coexist | Drift | Gate requires JSON and treats Markdown as non-authoritative transitional evidence only. |

## Open Questions

- Should legacy `retrospective.md` files be deleted after migration or left as historical human summaries?
- Should `automation/retro.json` be plugin-owned protected state or validator-owned editable state outside active Autopilot runs?
