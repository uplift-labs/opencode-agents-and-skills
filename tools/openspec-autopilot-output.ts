import fs from "node:fs";
import path from "node:path";
import {
  autopilotActionabilityValues,
  autopilotMrWaitStatuses,
  autopilotParallelDecisions,
  autopilotReasonCodes,
  autopilotSelectionReasons,
  autopilotSelectionModes,
  autopilotToolNames,
  type AutopilotActionability,
  type AutopilotParallelDecision,
  type AutopilotReasonCode as ContractAutopilotReasonCode,
  type AutopilotSelectionReason,
  type AutopilotSelectionMode,
  type AutopilotToolName,
} from "./autopilot-contract.ts";
import { validateTaskLedger } from "./autopilot-ledger.ts";
import {
  claimSelectedReadyTasks,
  collectWorkerReports,
  dependenciesSatisfied,
  emptySelection,
  selectionFor,
  shouldClaimReadyTasks,
  stoppedRuntimeEntries,
} from "./openspec-autopilot-runtime.ts";
import type { AutopilotRuntimeState } from "./openspec-autopilot-runtime.ts";
export {
  validateBlockerAnswer,
  type AutopilotActiveRunState,
  type AutopilotBlockerAnswer,
  type AutopilotBlockerAnswerValidation,
  type AutopilotBlockerQuestion,
  type AutopilotBlockerQuestionOption,
  type AutopilotParallelImplementationState,
  type AutopilotRuntimeState,
  type AutopilotWorkerReport,
} from "./openspec-autopilot-runtime.ts";

export type AutopilotOutcome = "advanced" | "blocked_for_user" | "waiting_for_mr" | "idle" | "failed";
export type NextRecommendedCall = "autopilot_status" | "autopilot_collect" | "autopilot_answer_blocker" | null;
export type AutopilotReasonCode = ContractAutopilotReasonCode;
// `advanced` is emitted only when plugin-owned runtime state validates a legal claim or collect transition.
// `actionable` and `not_selected` remain reserved actionability values for future runtime dispatch surfaces.
export type TaskActionability = AutopilotActionability;
export type AutopilotNextActionKind = "tool" | "validation" | "report" | "wait" | "ask_user" | "manual_review";
export type AutopilotNextActionSafety = "safe" | "requires_user" | "requires_credentials" | "not_available";

export type AutopilotOptions = {
  ledgerRoot?: string;
  prototypeLedgerRoot?: string;
  runtimeState?: AutopilotRuntimeState;
};

export type LedgerFilter = {
  changeId?: string;
  taskId?: string;
};

export type AutopilotOutputOptions = {
  dependencyGraph?: LedgerSummary[];
  runtimeState?: unknown;
};

export type LedgerSummary = {
  path: string;
  id: string;
  taskType: string;
  status: string;
  priority: string;
  dependencies: string[];
  writeScope: string[];
  writeScopeSize: number;
  valid: boolean;
  errors: string[];
  blockers: Array<Record<string, unknown>>;
  ledger?: Record<string, unknown>;
  mr?: {
    status?: string;
    url?: string;
  };
};

export type MrWaitSummary = { taskId: string; url?: string; status?: string };
export type BlockerSummary = { taskId?: string; reason: string; path?: string; errors?: string[] };
export type TaskActionabilitySummary = {
  taskId: string;
  path: string;
  taskType: string;
  status: string;
  valid: boolean;
  mrStatus?: string;
  actionability: TaskActionability;
  reasonCode: AutopilotReasonCode;
};
export type AutopilotNextAction = {
  label: string;
  kind: AutopilotNextActionKind;
  tool?: AutopilotToolName;
  args?: Record<string, unknown>;
  reason: string;
  safety: AutopilotNextActionSafety;
  expectedResult: string;
};
export type AutopilotLoopGuard = {
  repeatedNoProgress: boolean;
  equivalentCall?: string;
  suppressRepeatRecommendation: boolean;
};
export type AutopilotSelectionCandidate = {
  taskId: string;
  path: string;
  rank: number | null;
  selected: boolean;
  selectionReason: AutopilotSelectionReason;
  parallelDecision: AutopilotParallelDecision;
};
export type AutopilotSelection = {
  mode: AutopilotSelectionMode;
  selectedTaskId?: string;
  maxImplementationClaims: number;
  candidates: AutopilotSelectionCandidate[];
};
export type AutopilotOutput = {
  outcome: AutopilotOutcome;
  tasksStarted: unknown[];
  tasksAdvanced: unknown[];
  mrsWaiting: MrWaitSummary[];
  questions: unknown[];
  blockers: BlockerSummary[];
  nextRecommendedCall: NextRecommendedCall;
  summary: string;
  reasonCode: AutopilotReasonCode;
  taskSummaries: TaskActionabilitySummary[];
  nextActions: AutopilotNextAction[];
  loopGuard: AutopilotLoopGuard;
  selection: AutopilotSelection;
};

const defaultLedgerRoot = "openspec/changes";
const defaultPrototypeLedgerRoot = ".autopilot/prototype/tasks";
const terminalStatuses = new Set(["Done", "Failed", "Cancelled"]);
const mrWaitingStatuses = new Set<string>(autopilotMrWaitStatuses);

export const autopilotOutputContract = {
  reasonCodes: autopilotReasonCodes,
  actionabilityValues: autopilotActionabilityValues,
  mrWaitStatuses: autopilotMrWaitStatuses,
  toolNames: autopilotToolNames,
  selectionModes: autopilotSelectionModes,
  parallelDecisions: autopilotParallelDecisions,
  selectionReasons: autopilotSelectionReasons,
} as const;

type LedgerClassification = {
  actionability: TaskActionability;
  reasonCode: AutopilotReasonCode;
  hasUserBlocker: boolean;
  isReadyRuntimeDeferred: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function toRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export function listTaskLedgerFiles(root: string, options: AutopilotOptions = {}): string[] {
  const files: string[] = [];
  const ledgerRoot = path.join(root, options.ledgerRoot ?? defaultLedgerRoot);
  const prototypeRoot = path.join(root, options.prototypeLedgerRoot ?? defaultPrototypeLedgerRoot);

  if (fs.existsSync(ledgerRoot) && fs.statSync(ledgerRoot).isDirectory()) {
    for (const change of fs.readdirSync(ledgerRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!change.isDirectory()) {
        continue;
      }
      const taskPath = path.join(ledgerRoot, change.name, "automation", "task.json");
      if (fs.existsSync(taskPath) && fs.statSync(taskPath).isFile()) {
        files.push(taskPath);
      }
    }
  }

  if (fs.existsSync(prototypeRoot) && fs.statSync(prototypeRoot).isDirectory()) {
    for (const entry of fs.readdirSync(prototypeRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(path.join(prototypeRoot, entry.name));
      }
    }
  }

  return files;
}

function ledgerMatchesFilter(ledger: LedgerSummary, filter: LedgerFilter): boolean {
  if (filter.changeId && !ledger.path.startsWith(`openspec/changes/${filter.changeId}/`)) {
    return false;
  }
  if (filter.taskId && ledger.id !== filter.taskId) {
    return false;
  }
  return true;
}

export function filterLedgerSummaries(ledgers: LedgerSummary[], filter: LedgerFilter = {}): LedgerSummary[] {
  return ledgers.filter((ledger) => ledgerMatchesFilter(ledger, filter));
}

export function readLedgerSummaries(root: string, options: AutopilotOptions = {}, filter: LedgerFilter = {}): LedgerSummary[] {
  const ledgers = listTaskLedgerFiles(root, options).map((filePath) => {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      const result = validateTaskLedger(parsed, { sourcePath: toRelative(root, filePath) });
      const record = isRecord(parsed) ? parsed : {};
      const mr = isRecord(record.mr) ? record.mr : {};
      const scope = isRecord(record.scope) ? record.scope : {};
      return {
        path: toRelative(root, filePath),
        id: asString(record.id, path.basename(filePath, ".json")),
        taskType: asString(record.taskType, "unknown"),
        status: asString(record.status, "unknown"),
        priority: asString(record.priority, ""),
        dependencies: asStringArray(record.dependencies),
        writeScope: asStringArray(scope.write),
        writeScopeSize: asStringArray(scope.write).length,
        valid: result.valid,
        errors: result.errors,
        blockers: asRecordArray(record.blockers),
        ledger: record,
        mr: {
          status: typeof mr.status === "string" ? mr.status : undefined,
          url: typeof mr.url === "string" ? mr.url : undefined,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        path: toRelative(root, filePath),
        id: path.basename(filePath, ".json"),
        taskType: "unknown",
        status: "unknown",
        priority: "",
        dependencies: [],
        writeScope: [],
        writeScopeSize: 0,
        valid: false,
        errors: [`Failed to read task ledger: ${message}`],
        blockers: [],
      };
    }
  });
  return filterLedgerSummaries(ledgers, filter);
}

export function summarizeLedgers(ledgers: LedgerSummary[]): Record<string, unknown> {
  const byStatus: Record<string, number> = {};
  const byTaskType: Record<string, number> = {};
  for (const ledger of ledgers) {
    byStatus[ledger.status] = (byStatus[ledger.status] ?? 0) + 1;
    byTaskType[ledger.taskType] = (byTaskType[ledger.taskType] ?? 0) + 1;
  }
  return {
    total: ledgers.length,
    valid: ledgers.filter((ledger) => ledger.valid).length,
    invalid: ledgers.filter((ledger) => !ledger.valid).length,
    byStatus,
    byTaskType,
  };
}

export function mrsWaiting(ledgers: LedgerSummary[]): MrWaitSummary[] {
  return ledgers
    .filter((ledger) => mrWaitingStatuses.has(ledger.mr?.status ?? ""))
    .map((ledger) => ({ taskId: ledger.id, status: ledger.mr?.status, url: ledger.mr?.url }));
}

export function invalidBlockers(ledgers: LedgerSummary[]): BlockerSummary[] {
  return ledgers
    .filter((ledger) => !ledger.valid)
    .map((ledger) => ({ taskId: ledger.id, path: ledger.path, reason: "invalid task ledger", errors: ledger.errors }));
}

function classifyLedger(ledger: LedgerSummary): LedgerClassification {
  if (!ledger.valid) {
    return {
      actionability: "invalid",
      reasonCode: "invalid_ledgers",
      hasUserBlocker: false,
      isReadyRuntimeDeferred: false,
    };
  }

  if (ledger.status === "Blocked" || ledger.blockers.length > 0) {
    return {
      actionability: "blocked_for_user",
      reasonCode: "blocked_for_user",
      hasUserBlocker: true,
      isReadyRuntimeDeferred: false,
    };
  }

  if (mrWaitingStatuses.has(ledger.mr?.status ?? "")) {
    return {
      actionability: "waiting_for_mr",
      reasonCode: "waiting_for_mr",
      hasUserBlocker: false,
      isReadyRuntimeDeferred: false,
    };
  }

  if (terminalStatuses.has(ledger.status)) {
    return {
      actionability: "terminal",
      reasonCode: "no_actionable_tasks",
      hasUserBlocker: false,
      isReadyRuntimeDeferred: false,
    };
  }

  const isReadyRuntimeDeferred = ledger.status === "Ready";
  return {
    actionability: "runtime_deferred",
    reasonCode: isReadyRuntimeDeferred ? "ready_runtime_deferred" : "no_actionable_tasks",
    hasUserBlocker: false,
    isReadyRuntimeDeferred,
  };
}

function userBlockers(ledgers: LedgerSummary[]): BlockerSummary[] {
  return ledgers
    .filter((ledger) => classifyLedger(ledger).hasUserBlocker)
    .map((ledger) => ({ taskId: ledger.id, path: ledger.path, reason: "task is blocked for user action" }));
}

function hasReadyRuntimeDeferred(ledgers: LedgerSummary[], dependencyGraph: LedgerSummary[]): boolean {
  return ledgers.some((ledger) => classifyLedger(ledger).isReadyRuntimeDeferred && dependenciesSatisfied(ledger, dependencyGraph));
}

function hasReadyDependencyBlocked(ledgers: LedgerSummary[], dependencyGraph: LedgerSummary[]): boolean {
  return ledgers.some((ledger) => classifyLedger(ledger).isReadyRuntimeDeferred && !dependenciesSatisfied(ledger, dependencyGraph));
}

function taskSummaries(ledgers: LedgerSummary[]): TaskActionabilitySummary[] {
  return ledgers.map((ledger) => {
    const classification = classifyLedger(ledger);
    return {
      taskId: ledger.id,
      path: ledger.path,
      taskType: ledger.taskType,
      status: ledger.status,
      valid: ledger.valid,
      mrStatus: ledger.mr?.status,
      actionability: classification.actionability,
      reasonCode: classification.reasonCode,
    };
  });
}

function readyRuntimeDeferredLedgers(ledgers: LedgerSummary[]): LedgerSummary[] {
  return ledgers.filter((ledger) => classifyLedger(ledger).isReadyRuntimeDeferred);
}

function runNextReasonCode(ledgers: LedgerSummary[], dependencyGraph: LedgerSummary[] = ledgers): AutopilotReasonCode {
  if (ledgers.length === 0) {
    return "no_ledgers";
  }
  if (invalidBlockers(ledgers).length > 0) {
    return "invalid_ledgers";
  }
  if (userBlockers(ledgers).length > 0) {
    return "blocked_for_user";
  }
  if (mrsWaiting(ledgers).length > 0) {
    return "waiting_for_mr";
  }
  if (hasReadyRuntimeDeferred(ledgers, dependencyGraph)) {
    return "ready_runtime_deferred";
  }
  if (hasReadyDependencyBlocked(ledgers, dependencyGraph)) {
    return "no_actionable_tasks";
  }
  return "no_actionable_tasks";
}

function outcomeForReason(reasonCode: AutopilotReasonCode): AutopilotOutcome {
  if (reasonCode === "invalid_ledgers") {
    return "failed";
  }
  if (reasonCode === "runtime_evidence_conflict") {
    return "failed";
  }
  if (reasonCode === "blocked_for_user") {
    return "blocked_for_user";
  }
  if (reasonCode === "waiting_for_mr") {
    return "waiting_for_mr";
  }
  if (reasonCode === "advanced") {
    return "advanced";
  }
  if (reasonCode === "stop_applied") {
    return "advanced";
  }
  return "idle";
}

function nextActionsFor(reasonCode: AutopilotReasonCode): AutopilotNextAction[] {
  if (reasonCode === "invalid_ledgers") {
    return [
      {
        label: "Review invalid task ledgers",
        kind: "validation",
        reason: "At least one task ledger failed deterministic validation.",
        safety: "safe",
        expectedResult: "Fix or regenerate invalid ledger state before Autopilot continues.",
      },
    ];
  }
  if (reasonCode === "runtime_evidence_conflict") {
    return [
      {
        label: "Review runtime evidence conflict",
        kind: "validation",
        reason: "Plugin-owned runtime evidence conflicts with current ledger state or legal transition validation.",
        safety: "safe",
        expectedResult: "Resolve stale worker reports, ledger drift, or invalid transition evidence before collecting again.",
      },
    ];
  }
  if (reasonCode === "advanced") {
    return [
      {
        label: "Inspect Autopilot status",
        kind: "tool",
        tool: "autopilot_status",
        reason: "Plugin-owned runtime state accepted a legal claim or worker-report transition.",
        safety: "safe",
        expectedResult: "Status confirms the next safe Autopilot action before additional collection or dispatch.",
      },
    ];
  }
  if (reasonCode === "waiting_for_mr") {
    return [
      {
        label: "Wait for MR review or merge",
        kind: "wait",
        reason: "Autopilot must not merge or bypass MR review gates automatically.",
        safety: "requires_user",
        expectedResult: "Reviewer or user merges, updates, or rejects the MR outside Autopilot.",
      },
    ];
  }
  if (reasonCode === "blocked_for_user") {
    return [
      {
        label: "Review blocker before answering",
        kind: "manual_review",
        reason: "A task is blocked, but MVP output does not include a question envelope for autopilot_answer_blocker yet.",
        safety: "requires_user",
        expectedResult: "Wait for a returned questionId/options envelope before calling autopilot_answer_blocker.",
      },
    ];
  }
  if (reasonCode === "ready_runtime_deferred") {
    return [
      {
        label: "Continue selected OpenSpec change manually",
        kind: "manual_review",
        reason: "Valid Ready work exists, but MVP runtime claim/dispatch and ledger mutation are deferred.",
        safety: "safe",
        expectedResult: "Use selection.selectedTaskId and selection.candidates to continue the deterministic primary slice without repeating autopilot_run_next.",
      },
    ];
  }
  if (reasonCode === "collect_deferred") {
    return [
      {
        label: "Inspect Autopilot status",
        kind: "tool",
        tool: "autopilot_status",
        reason: "No scoped plugin-owned worker report was available for legal collection, so repeating collect would not advance state.",
        safety: "safe",
        expectedResult: "Status summarizes current ledgers without claiming progress.",
      },
    ];
  }
  if (reasonCode === "stop_no_active_state") {
    return [
      {
        label: "Inspect Autopilot status",
        kind: "tool",
        tool: "autopilot_status",
        reason: "Stop did not change runtime state; status is the safe follow-up if confirmation is needed.",
        safety: "safe",
        expectedResult: "Status confirms current ledgers, blockers, and MR waits.",
      },
    ];
  }
  if (reasonCode === "stop_applied") {
    return [
      {
        label: "Inspect Autopilot status",
        kind: "tool",
        tool: "autopilot_status",
        reason: "Stop updated plugin-owned active runtime state.",
        safety: "safe",
        expectedResult: "Status confirms remaining active runs, tasks, blockers, and MR waits.",
      },
    ];
  }
  if (reasonCode === "no_ledgers") {
    return [
      {
        label: "Create or select an OpenSpec task ledger",
        kind: "manual_review",
        reason: "No plugin-owned task ledger was discovered.",
        safety: "safe",
        expectedResult: "A valid task ledger exists before Autopilot runtime tools are retried.",
      },
    ];
  }
  return [
    {
      label: "Review OpenSpec task state",
      kind: "manual_review",
      reason: "Ledgers exist, but no task can safely advance through the MVP runtime.",
      safety: "safe",
      expectedResult: "A human or future runtime identifies the next bounded safe action.",
    },
  ];
}

function nextActionsAfterAnswerBlocker(): AutopilotNextAction[] {
  return [
    {
      label: "Inspect Autopilot status after blocker answer",
      kind: "tool",
      tool: "autopilot_status",
      reason: "MVP accepted the blocker answer envelope but did not mutate plugin-owned state.",
      safety: "safe",
      expectedResult: "Status confirms whether a real blocker remains before any further action.",
    },
  ];
}

function nextActionsAfterRejectedAnswerBlocker(): AutopilotNextAction[] {
  return [
    {
      label: "Inspect pending blocker question",
      kind: "manual_review",
      reason: "The blocker answer did not match a plugin-owned pending question or option envelope.",
      safety: "requires_user",
      expectedResult: "Call autopilot_answer_blocker only with a returned questionId and matching option data.",
    },
  ];
}

function loopGuardFor(reasonCode: AutopilotReasonCode, equivalentCall?: string): AutopilotLoopGuard {
  const suppressRepeatRecommendation = ["ready_runtime_deferred", "collect_deferred", "stop_no_active_state", "no_actionable_tasks", "no_ledgers"].includes(reasonCode);
  return {
    repeatedNoProgress: suppressRepeatRecommendation,
    equivalentCall,
    suppressRepeatRecommendation,
  };
}

function outputFor(ledgers: LedgerSummary[], summary: string, reasonCode: AutopilotReasonCode, equivalentCall?: string, nextRecommendedCall: NextRecommendedCall = null, outputOptions: AutopilotOutputOptions = {}): AutopilotOutput {
  const dependencyGraph = outputOptions.dependencyGraph ?? ledgers;
  return {
    outcome: outcomeForReason(reasonCode),
    tasksStarted: [],
    tasksAdvanced: [],
    mrsWaiting: mrsWaiting(ledgers),
    questions: [],
    blockers: [...invalidBlockers(ledgers), ...userBlockers(ledgers)],
    nextRecommendedCall,
    summary,
    reasonCode,
    taskSummaries: taskSummaries(ledgers),
    nextActions: nextActionsFor(reasonCode),
    loopGuard: loopGuardFor(reasonCode, equivalentCall),
    selection: selectionFor(ledgers, readyRuntimeDeferredLedgers(ledgers), reasonCode, dependencyGraph),
  };
}

export function createRunNextOutput(ledgers: LedgerSummary[], outputOptions: AutopilotOutputOptions = {}): AutopilotOutput {
  const dependencyGraph = outputOptions.dependencyGraph ?? ledgers;
  const reasonCode = runNextReasonCode(ledgers, dependencyGraph);
  if (reasonCode === "no_ledgers") {
    return outputFor(ledgers, "No OpenSpec autopilot task ledgers were found. MVP prototype does not create ledgers automatically yet.", reasonCode, "autopilot_run_next", null, { dependencyGraph });
  }
  if (reasonCode === "ready_runtime_deferred") {
    const selection = selectionFor(ledgers, readyRuntimeDeferredLedgers(ledgers), reasonCode, dependencyGraph, outputOptions.runtimeState);
    if (shouldClaimReadyTasks(outputOptions.runtimeState)) {
      const claimed = claimSelectedReadyTasks(ledgers, selection);
      if (claimed.conflicts.length > 0) {
        return {
          ...outputFor(
            ledgers,
            `Autopilot claim mode found a runtime evidence conflict before starting selected Ready work. No protected ledger state was mutated.`,
            "runtime_evidence_conflict",
            "autopilot_run_next",
            null,
            { dependencyGraph },
          ),
          blockers: claimed.conflicts,
          selection,
        };
      }
      if (claimed.started.length > 0) {
        return {
          ...outputFor(
            ledgers,
            `Autopilot claim mode validated and started the selected Ready task in plugin-owned runtime state. Protected ledger mutation remains deferred to plugin-owned state handling.`,
            "advanced",
            "autopilot_run_next",
            null,
            { dependencyGraph },
          ),
          tasksStarted: claimed.started,
          selection,
        };
      }
    }
    return outputFor(
      ledgers,
      `MVP autopilot inspected ${ledgers.length} task ledger(s). Valid Ready work exists, but worker dispatch, MR sync, and ledger mutation are intentionally deferred.`,
      reasonCode,
      "autopilot_run_next",
      null,
      { dependencyGraph },
    );
  }
  return outputFor(ledgers, `Autopilot inspected ${ledgers.length} task ledger(s).`, reasonCode, "autopilot_run_next", null, { dependencyGraph });
}

export function createStatusOutput(ledgers: LedgerSummary[], outputOptions: AutopilotOutputOptions = {}): AutopilotOutput & { status: Record<string, unknown> } {
  const dependencyGraph = outputOptions.dependencyGraph ?? ledgers;
  const reasonCode = runNextReasonCode(ledgers, dependencyGraph);
  return {
    ...outputFor(ledgers, `Autopilot status inspected ${ledgers.length} task ledger(s).`, reasonCode, "autopilot_status", null, { dependencyGraph }),
    status: summarizeLedgers(ledgers),
  };
}

export function createCollectOutput(ledgers: LedgerSummary[], outputOptions: AutopilotOutputOptions = {}): AutopilotOutput {
  const reasonCode = invalidBlockers(ledgers).length > 0 ? "invalid_ledgers" : "collect_deferred";
  if (reasonCode === "invalid_ledgers") {
    return outputFor(
      ledgers,
      `MVP collect inspected ${ledgers.length} task ledger(s). Invalid ledgers must be fixed before worker reports can be collected.`,
      reasonCode,
      "autopilot_collect",
    );
  }

  const collected = collectWorkerReports(ledgers, outputOptions.runtimeState);
  if (collected.conflicts.length > 0) {
    return {
      ...outputFor(
        ledgers,
        `Autopilot collect found ${collected.conflicts.length} runtime evidence conflict(s). No protected ledger state was mutated.`,
        "runtime_evidence_conflict",
        "autopilot_collect",
      ),
      blockers: collected.conflicts,
    };
  }

  if (collected.advanced.length > 0) {
    return {
      ...outputFor(
        ledgers,
        `Autopilot collect validated ${collected.advanced.length} plugin-owned worker report(s) as legal transition(s). Protected ledger mutation remains deferred to plugin-owned state handling.`,
        "advanced",
        "autopilot_collect",
      ),
      tasksAdvanced: collected.advanced,
    };
  }

  return outputFor(
    ledgers,
    collected.reportsFound
      ? `MVP collect inspected ${ledgers.length} task ledger(s). No scoped worker report advanced state.`
      : `MVP collect inspected ${ledgers.length} task ledger(s). Runtime worker report collection and legal state mutation are deferred.`,
    reasonCode,
    "autopilot_collect",
  );
}

function emptyRuntimeOutput(overrides: Pick<AutopilotOutput, "outcome" | "summary" | "reasonCode" | "nextActions" | "loopGuard"> & Partial<Pick<AutopilotOutput, "tasksStarted" | "tasksAdvanced" | "mrsWaiting" | "questions" | "blockers" | "nextRecommendedCall" | "taskSummaries" | "selection">>): AutopilotOutput {
  return {
    outcome: overrides.outcome,
    tasksStarted: overrides.tasksStarted ?? [],
    tasksAdvanced: overrides.tasksAdvanced ?? [],
    mrsWaiting: overrides.mrsWaiting ?? [],
    questions: overrides.questions ?? [],
    blockers: overrides.blockers ?? [],
    nextRecommendedCall: overrides.nextRecommendedCall ?? "autopilot_status",
    summary: overrides.summary,
    reasonCode: overrides.reasonCode,
    taskSummaries: overrides.taskSummaries ?? [],
    nextActions: overrides.nextActions,
    loopGuard: overrides.loopGuard,
    selection: overrides.selection ?? emptySelection(),
  };
}

export function createAnswerBlockerOutput(questionId: string, validation: { accepted?: boolean; reason?: string } = {}): AutopilotOutput {
  if (validation.accepted === false) {
    return emptyRuntimeOutput({
      outcome: "failed",
      blockers: [{ reason: validation.reason ?? `No pending plugin-owned blocker question exists for ${questionId}.` }],
      summary: `Rejected blocker answer envelope for ${questionId}. ${validation.reason ?? "No matching pending plugin-owned blocker question was found."} No state was advanced.`,
      reasonCode: "blocked_for_user",
      nextActions: nextActionsAfterRejectedAnswerBlocker(),
      loopGuard: { repeatedNoProgress: true, equivalentCall: "autopilot_answer_blocker", suppressRepeatRecommendation: true },
    });
  }
  // MVP-vNext validates the answer envelope but does not mutate blocker state yet.
  return emptyRuntimeOutput({
    outcome: "idle",
    summary: `Accepted blocker answer envelope for ${questionId}. MVP state mutation is deferred.`,
    reasonCode: "blocked_for_user",
    nextActions: nextActionsAfterAnswerBlocker(),
    loopGuard: { repeatedNoProgress: true, equivalentCall: "autopilot_answer_blocker", suppressRepeatRecommendation: true },
  });
}

export function createStopOutput(target?: string, options: { id?: string; runtimeState?: unknown; stoppedEntries?: Array<Record<string, unknown>> } = {}): AutopilotOutput {
  const stopped = options.stoppedEntries ?? stoppedRuntimeEntries(target, options.id, options.runtimeState);
  if (stopped.length > 0) {
    return emptyRuntimeOutput({
      outcome: "advanced",
      tasksAdvanced: stopped,
      summary: `Stopped ${stopped.length} active plugin-owned runtime entr${stopped.length === 1 ? "y" : "ies"} for target ${target ?? "run"}. No protected ledger state was mutated.`,
      reasonCode: "stop_applied",
      nextActions: nextActionsFor("stop_applied"),
      loopGuard: loopGuardFor("stop_applied", "autopilot_stop"),
    });
  }
  return emptyRuntimeOutput({
    outcome: "idle",
    summary: `No active MVP runtime state was changed for stop target ${target ?? "run"}.`,
    reasonCode: "stop_no_active_state",
    nextActions: nextActionsFor("stop_no_active_state"),
    loopGuard: loopGuardFor("stop_no_active_state", "autopilot_stop"),
  });
}
