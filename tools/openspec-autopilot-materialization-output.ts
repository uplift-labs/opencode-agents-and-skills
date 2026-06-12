import type { AutopilotOutput, AutopilotSelection, LedgerSummary } from "./openspec-autopilot-output.ts";
import { createRunNextOutput } from "./openspec-autopilot-output.ts";
import type { MaterializationBlocker, MaterializedLedgerEvidence } from "./openspec-autopilot-materializer.ts";

function materializedSelection(base: AutopilotSelection, materialized: MaterializedLedgerEvidence, preMaterializationSelection?: AutopilotSelection): AutopilotSelection {
  if (preMaterializationSelection == null) {
    return base;
  }
  return {
    ...preMaterializationSelection,
    selectedTaskId: materialized.taskId,
    candidates: preMaterializationSelection.candidates.map((candidate) => candidate.selected
      ? { ...candidate, taskId: materialized.taskId, path: materialized.path }
      : candidate),
  };
}

export function createLedgerMaterializedOutput(ledgers: LedgerSummary[], materialized: MaterializedLedgerEvidence, preMaterializationSelection?: AutopilotSelection): AutopilotOutput {
  const base = createRunNextOutput(ledgers);
  return {
    ...base,
    outcome: "advanced",
    tasksStarted: [],
    tasksAdvanced: [{
      taskId: materialized.taskId,
      changeId: materialized.changeId,
      path: materialized.path,
      action: "materialized-ledger",
      validation: {
        valid: materialized.validation.valid,
        warnings: materialized.validation.warnings,
      },
      mutation: "plugin-owned-protected-ledger",
    }],
    summary: `Autopilot materialized ${materialized.path} for selected active OpenSpec change ${materialized.changeId}. No implementation worker was claimed.`,
    reasonCode: "ledger_materialized",
    nextActions: [{
      label: "Continue ledger-backed Autopilot run",
      kind: "tool",
      tool: "autopilot_run_next",
      args: { changeId: materialized.changeId },
      reason: "Plugin-owned materialization created a valid task ledger for the selected active change.",
      safety: "safe",
      expectedResult: "The follow-up run evaluates the new ledger-backed Ready task instead of active-change handoff.",
    }],
    loopGuard: { repeatedNoProgress: false, equivalentCall: "autopilot_run_next", suppressRepeatRecommendation: false },
    selection: materializedSelection(base.selection, materialized, preMaterializationSelection),
  };
}

export function createLedgerMaterializationBlockedOutput(ledgers: LedgerSummary[], blocker: MaterializationBlocker): AutopilotOutput {
  const base = createRunNextOutput(ledgers);
  return {
    ...base,
    outcome: "failed",
    tasksStarted: [],
    tasksAdvanced: [],
    summary: `Autopilot could not materialize a task ledger${blocker.changeId ? ` for ${blocker.changeId}` : ""}. ${blocker.reason}`,
    reasonCode: "invalid_ledgers",
    blockers: [...base.blockers, { taskId: blocker.changeId, path: blocker.path, reason: blocker.reason, errors: blocker.errors }],
    nextActions: [{
      label: "Review materialization blocker",
      kind: "validation",
      reason: "The selected active OpenSpec change could not be materialized safely.",
      safety: "safe",
      expectedResult: "Resolve the scoped change path, tasks.md, archive, validation, or publication blocker before retrying Autopilot.",
    }],
    loopGuard: { repeatedNoProgress: true, equivalentCall: "autopilot_run_next", suppressRepeatRecommendation: true },
  };
}
