import fs from "node:fs";
import path from "node:path";
import {
  autopilotActionabilityValues,
  autopilotAutoConflictTolerances,
  autopilotAutoRiskClasses,
  autopilotMrWaitStatuses,
  autopilotParallelDecisions,
  autopilotReasonCodes,
  autopilotSelectionReasons,
  autopilotSelectionModes,
  autopilotStandardOutputToolNames,
  type AutopilotActionability,
  type AutopilotAutoConflictTolerance,
  type AutopilotAutoRiskClass,
  type AutopilotParallelDecision,
  type AutopilotReasonCode as ContractAutopilotReasonCode,
  type AutopilotSelectionReason,
  type AutopilotSelectionMode,
} from "./autopilot-contract.ts";
import { validateTaskLedger } from "./autopilot-ledger.ts";
import { activeRunState } from "./autopilot-active-run.ts";
import { isSymlinkPath, realPathIsInside } from "./autopilot-path-safety.ts";
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
import type { AutopilotRuntimeStore } from "./autopilot-runtime-store.ts";
import type { AutopilotWorkerSessionAdapter } from "./autopilot-worker-session-adapter.ts";
import { buildChangeGraph, type AutopilotChangeGraph } from "./autopilot-change-graph.ts";
import { countMarkdownChecklistItems, readActiveChangeSummaries } from "./openspec-autopilot-active-change-queue.ts";
import {
  nextActionsAfterAnswerBlocker,
  nextActionsAfterRejectedAnswerBlocker,
  nextActionsFor,
  type AutopilotNextAction,
} from "./openspec-autopilot-next-actions.ts";
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
// `actionable` is used for active-change handoff summaries; `not_selected` remains reserved for future runtime dispatch surfaces.
export type TaskActionability = AutopilotActionability;
export type { AutopilotNextAction, AutopilotNextActionKind, AutopilotNextActionSafety } from "./openspec-autopilot-next-actions.ts";
export type AutopilotSourceKind = "ledger" | "active-change";

export type AutopilotOptions = {
  ledgerRoot?: string;
  prototypeLedgerRoot?: string;
  runtimeState?: AutopilotRuntimeState;
  runtimeStore?: AutopilotRuntimeStore;
  workerDispatch?: { enabled?: boolean; diagnostics?: string[] };
  workerSessionAdapter?: AutopilotWorkerSessionAdapter;
  now?: () => string;
};

export type LedgerFilter = {
  changeId?: string;
  taskId?: string;
};

export type AutopilotOutputOptions = {
  dependencyGraph?: LedgerSummary[];
  runtimeState?: unknown;
  mutateRuntimeState?: boolean;
};

export type LedgerSummary = {
  path: string;
  id: string;
  sourceKind: AutopilotSourceKind;
  taskType: string;
  status: string;
  priority: string;
  dependencies: string[];
  writeScope: string[];
  forbiddenScope: string[];
  writeScopeSize: number;
  valid: boolean;
  errors: string[];
  blockers: Array<Record<string, unknown>>;
  checkedTasks?: number;
  uncheckedTasks?: number;
  totalTasks?: number;
  staleCompleted?: boolean;
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
  sourceKind: AutopilotSourceKind;
  actionability: TaskActionability;
  reasonCode: AutopilotReasonCode;
  checkedTasks?: number;
  uncheckedTasks?: number;
  totalTasks?: number;
  staleCompleted?: boolean;
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
  worktreePath?: string;
};
export type AutopilotAutoParallelDecision = {
  policy: "auto";
  resolvedMaxImplementationClaims: number;
  maxAutoClaims: number;
  conflictTolerance: AutopilotAutoConflictTolerance;
  fanInValidationRequired: boolean;
  decisionReason: string;
  riskClass: AutopilotAutoRiskClass;
  acceptedSoftConflictScopes: string[];
  rejectedReasons: string[];
};
export type AutopilotSelection = {
  mode: AutopilotSelectionMode;
  selectedTaskId?: string;
  maxImplementationClaims: number;
  autoDecision?: AutopilotAutoParallelDecision;
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
  changeGraph: AutopilotChangeGraph;
};

const defaultLedgerRoot = "openspec/changes";
const defaultPrototypeLedgerRoot = ".autopilot/prototype/tasks";
const terminalStatuses = new Set(["Done", "Failed", "Cancelled"]);
const mrWaitingStatuses = new Set<string>(autopilotMrWaitStatuses);

export const autopilotOutputContract = {
  reasonCodes: autopilotReasonCodes,
  actionabilityValues: autopilotActionabilityValues,
  mrWaitStatuses: autopilotMrWaitStatuses,
  toolNames: autopilotStandardOutputToolNames,
  selectionModes: autopilotSelectionModes,
  parallelDecisions: autopilotParallelDecisions,
  selectionReasons: autopilotSelectionReasons,
  autoRiskClasses: autopilotAutoRiskClasses,
  autoConflictTolerances: autopilotAutoConflictTolerances,
} as const;

type LedgerClassification = {
  actionability: TaskActionability;
  reasonCode: AutopilotReasonCode;
  hasUserBlocker: boolean;
  isReadyRuntimeDeferred: boolean;
  isActiveChangeHandoff: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function optionalNonEmptyString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeLedgerFilter(filter: LedgerFilter = {}): LedgerFilter {
  return {
    changeId: optionalNonEmptyString(filter.changeId),
    taskId: optionalNonEmptyString(filter.taskId),
  };
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function safeRelativeRoot(value: string | undefined, fallback: string, label: string): string {
  if (value == null) {
    return fallback;
  }
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Autopilot ${label} must be a safe relative repository path.`);
  }
  return normalized;
}

export function toRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export function listTaskLedgerFiles(root: string, options: AutopilotOptions = {}): string[] {
  const files: string[] = [];
  const ledgerRoot = path.join(root, safeRelativeRoot(options.ledgerRoot, defaultLedgerRoot, "ledgerRoot"));
  const prototypeRoot = path.join(root, safeRelativeRoot(options.prototypeLedgerRoot, defaultPrototypeLedgerRoot, "prototypeLedgerRoot"));

  if (fs.existsSync(ledgerRoot) && fs.statSync(ledgerRoot).isDirectory()) {
    if (isSymlinkPath(ledgerRoot) || !realPathIsInside(root, ledgerRoot)) {
      return files;
    }
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
    if (isSymlinkPath(prototypeRoot) || !realPathIsInside(root, prototypeRoot)) {
      return files;
    }
    for (const entry of fs.readdirSync(prototypeRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(path.join(prototypeRoot, entry.name));
      }
    }
  }

  return files;
}

export type AutopilotQueueSummaries = {
  ledgers: LedgerSummary[];
  dependencyGraph: LedgerSummary[];
};

export function readAutopilotQueueSummaries(root: string, options: AutopilotOptions = {}, filter: LedgerFilter = {}): AutopilotQueueSummaries {
  const normalizedFilter = normalizeLedgerFilter(filter);
  const dependencyGraph = readLedgerSummaries(root, options);
  const ledgers = filterLedgerSummaries(dependencyGraph, normalizedFilter);
  if (ledgers.length > 0 || normalizedFilter.taskId != null) {
    const hasLiveReadyLedger = ledgers.some((ledger) => ledger.sourceKind === "ledger" && ledger.valid && ledger.staleCompleted !== true && ledger.status === "Ready" && dependenciesSatisfied(ledger, dependencyGraph));
    if (normalizedFilter.taskId == null && !hasLiveReadyLedger) {
      const activeChanges = readActiveChangeSummaries(root, safeRelativeRoot(options.ledgerRoot, defaultLedgerRoot, "ledgerRoot"), normalizedFilter)
        .filter((active) => !ledgers.some((ledger) => changeIdForLedgerPath(ledger) === active.id));
      if (activeChanges.length > 0) {
        return { ledgers: [...ledgers, ...activeChanges], dependencyGraph: [...dependencyGraph, ...activeChanges] };
      }
    }
    return { ledgers, dependencyGraph };
  }
  const activeChanges = readActiveChangeSummaries(root, safeRelativeRoot(options.ledgerRoot, defaultLedgerRoot, "ledgerRoot"), normalizedFilter);
  return { ledgers: activeChanges, dependencyGraph: [...dependencyGraph, ...activeChanges] };
}

export function changeIdForLedgerPath(ledger: LedgerSummary): string | undefined {
  if (ledger.sourceKind === "active-change") {
    return ledger.id;
  }
  const parts = ledger.path.split("/");
  const automationIndex = parts.lastIndexOf("automation");
  return automationIndex > 0 && parts[automationIndex + 1] === "task.json" ? parts[automationIndex - 1] : undefined;
}

function ledgerMatchesFilter(ledger: LedgerSummary, filter: LedgerFilter): boolean {
  if (filter.changeId && changeIdForLedgerPath(ledger) !== filter.changeId) {
    return false;
  }
  if (filter.taskId && ledger.id !== filter.taskId) {
    return false;
  }
  return true;
}

export function filterLedgerSummaries(ledgers: LedgerSummary[], filter: LedgerFilter = {}): LedgerSummary[] {
  const normalizedFilter = normalizeLedgerFilter(filter);
  return ledgers.filter((ledger) => ledgerMatchesFilter(ledger, normalizedFilter));
}

export function readLedgerSummaries(root: string, options: AutopilotOptions = {}, filter: LedgerFilter = {}): LedgerSummary[] {
  const ledgers = listTaskLedgerFiles(root, options).map((filePath) => {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      const result = validateTaskLedger(parsed, { sourcePath: toRelative(root, filePath) });
      const record = isRecord(parsed) ? parsed : {};
      const mr = isRecord(record.mr) ? record.mr : {};
      const scope = isRecord(record.scope) ? record.scope : {};
      const changeRoot = path.dirname(path.dirname(filePath));
      const tasksPath = path.join(changeRoot, "tasks.md");
      const counts = fs.existsSync(tasksPath) && fs.statSync(tasksPath).isFile() && !isSymlinkPath(tasksPath) && realPathIsInside(root, tasksPath) && realPathIsInside(changeRoot, tasksPath)
        ? countMarkdownChecklistItems(fs.readFileSync(tasksPath, "utf8"))
        : undefined;
      const status = asString(record.status, "unknown");
      const staleCompleted = counts != null && counts.total > 0 && counts.unchecked === 0 && !terminalStatuses.has(status);
      return {
        path: toRelative(root, filePath),
        id: asString(record.id, path.basename(filePath, ".json")),
        sourceKind: "ledger",
        taskType: asString(record.taskType, "unknown"),
        status,
        priority: asString(record.priority, ""),
        dependencies: asStringArray(record.dependencies),
        writeScope: asStringArray(scope.write),
        forbiddenScope: asStringArray(scope.forbidden),
        writeScopeSize: asStringArray(scope.write).length,
        valid: result.valid,
        errors: result.errors,
        blockers: asRecordArray(record.blockers),
        checkedTasks: counts?.checked,
        uncheckedTasks: counts?.unchecked,
        totalTasks: counts?.total,
        staleCompleted,
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
        sourceKind: "ledger",
        taskType: "unknown",
        status: "unknown",
        priority: "",
        dependencies: [],
        writeScope: [],
        forbiddenScope: [],
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
    .map((ledger) => ({ taskId: ledger.id, path: ledger.path, reason: ledger.sourceKind === "active-change" ? "invalid active OpenSpec change tasks" : "invalid task ledger", errors: ledger.errors }));
}

function sourceSummaryLabel(ledgers: LedgerSummary[]): string {
  if (ledgers.length > 0 && ledgers.every((ledger) => ledger.sourceKind === "active-change")) {
    return "active OpenSpec change(s)";
  }
  if (ledgers.length > 0 && ledgers.every((ledger) => ledger.sourceKind === "ledger")) {
    return "task ledger(s)";
  }
  return "task item(s)";
}

function classifyLedger(ledger: LedgerSummary): LedgerClassification {
  if (!ledger.valid) {
    return {
      actionability: "invalid",
      reasonCode: "invalid_ledgers",
      hasUserBlocker: false,
      isReadyRuntimeDeferred: false,
      isActiveChangeHandoff: false,
    };
  }

  if (ledger.sourceKind === "active-change") {
    return {
      actionability: "actionable",
      reasonCode: "active_change_handoff",
      hasUserBlocker: false,
      isReadyRuntimeDeferred: false,
      isActiveChangeHandoff: true,
    };
  }

  if (ledger.staleCompleted === true) {
    return {
      actionability: "terminal",
      reasonCode: "no_actionable_tasks",
      hasUserBlocker: false,
      isReadyRuntimeDeferred: false,
      isActiveChangeHandoff: false,
    };
  }

  if (ledger.status === "Blocked" || ledger.blockers.length > 0) {
    return {
      actionability: "blocked_for_user",
      reasonCode: "blocked_for_user",
      hasUserBlocker: true,
      isReadyRuntimeDeferred: false,
      isActiveChangeHandoff: false,
    };
  }

  if (mrWaitingStatuses.has(ledger.mr?.status ?? "")) {
    return {
      actionability: "waiting_for_mr",
      reasonCode: "waiting_for_mr",
      hasUserBlocker: false,
      isReadyRuntimeDeferred: false,
      isActiveChangeHandoff: false,
    };
  }

  if (terminalStatuses.has(ledger.status)) {
    return {
      actionability: "terminal",
      reasonCode: "no_actionable_tasks",
      hasUserBlocker: false,
      isReadyRuntimeDeferred: false,
      isActiveChangeHandoff: false,
    };
  }

  const isReadyRuntimeDeferred = ledger.status === "Ready";
  return {
    actionability: "runtime_deferred",
    reasonCode: isReadyRuntimeDeferred ? "ready_runtime_deferred" : "no_actionable_tasks",
    hasUserBlocker: false,
    isReadyRuntimeDeferred,
    isActiveChangeHandoff: false,
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

function hasActiveChangeHandoff(ledgers: LedgerSummary[]): boolean {
  return ledgers.some((ledger) => classifyLedger(ledger).isActiveChangeHandoff);
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
      sourceKind: ledger.sourceKind,
      actionability: classification.actionability,
      reasonCode: classification.reasonCode,
      checkedTasks: ledger.checkedTasks,
      uncheckedTasks: ledger.uncheckedTasks,
      totalTasks: ledger.totalTasks,
      staleCompleted: ledger.staleCompleted,
    };
  });
}

function staleCompletedBlockers(ledgers: LedgerSummary[]): BlockerSummary[] {
  return ledgers
    .filter((ledger) => ledger.staleCompleted === true)
    .map((ledger) => ({
      taskId: ledger.id,
      path: ledger.path,
      reason: "stale completed-change evidence: tasks.md checklist is complete but automation/task.json is non-terminal",
    }));
}

function staleCompletedNextActions(ledgers: LedgerSummary[]): AutopilotNextAction[] {
  if (!ledgers.some((ledger) => ledger.staleCompleted === true)) {
    return [];
  }
  return [{
    label: "Reconcile stale completed ledger",
    kind: "manual_review",
    reason: "A completed OpenSpec tasks.md has a non-terminal Autopilot ledger, so it must not be selected as live work.",
    safety: "safe",
    expectedResult: "Archive the completed change, reconcile ledger status through plugin-owned flow, or remove stale automation state through an approved cleanup path.",
  }];
}

function writeGateStatus(runtimeState: unknown): Record<string, unknown> {
  const activeRun = activeRunState(runtimeState);
  return {
    mode: activeRun == null ? "protected-path-only" : "fail-closed-active-lock",
    activeOwnership: activeRun != null,
    activeRunId: activeRun?.runId,
    activeTaskIds: activeRun?.taskIds ?? [],
  };
}

function selectableLedgers(ledgers: LedgerSummary[]): LedgerSummary[] {
  return ledgers.filter((ledger) => {
    const classification = classifyLedger(ledger);
    return classification.isReadyRuntimeDeferred || classification.isActiveChangeHandoff;
  });
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
  if (hasActiveChangeHandoff(ledgers)) {
    return "active_change_handoff";
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
  if (reasonCode === "ledger_materialized") {
    return "advanced";
  }
  if (reasonCode === "stop_applied") {
    return "advanced";
  }
  return "idle";
}

function loopGuardFor(reasonCode: AutopilotReasonCode, equivalentCall?: string): AutopilotLoopGuard {
  const suppressRepeatRecommendation = ["ready_runtime_deferred", "active_change_handoff", "collect_deferred", "stop_no_active_state", "no_actionable_tasks", "no_ledgers"].includes(reasonCode);
  return {
    repeatedNoProgress: suppressRepeatRecommendation,
    equivalentCall,
    suppressRepeatRecommendation,
  };
}

function outputFor(ledgers: LedgerSummary[], summary: string, reasonCode: AutopilotReasonCode, equivalentCall?: string, nextRecommendedCall: NextRecommendedCall = null, outputOptions: AutopilotOutputOptions = {}): AutopilotOutput {
  const dependencyGraph = outputOptions.dependencyGraph ?? ledgers;
  const changeIdByTaskId = new Map(dependencyGraph.map((ledger) => [ledger.id, changeIdForLedgerPath(ledger) ?? ledger.id]));
  const changeGraph = buildChangeGraph(dependencyGraph.map((ledger) => ({
    changeId: changeIdForLedgerPath(ledger) ?? ledger.id,
    priority: ledger.priority,
    dependencies: ledger.dependencies.map((dependency) => changeIdByTaskId.get(dependency) ?? dependency),
    writeScope: ledger.writeScope,
  })));
  return {
    outcome: outcomeForReason(reasonCode),
    tasksStarted: [],
    tasksAdvanced: [],
    mrsWaiting: mrsWaiting(ledgers),
    questions: [],
    blockers: [...invalidBlockers(ledgers), ...userBlockers(ledgers), ...staleCompletedBlockers(ledgers)],
    nextRecommendedCall,
    summary,
    reasonCode,
    taskSummaries: taskSummaries(ledgers),
    nextActions: [...staleCompletedNextActions(ledgers), ...nextActionsFor(reasonCode)],
    loopGuard: loopGuardFor(reasonCode, equivalentCall),
    selection: selectionFor(ledgers, selectableLedgers(ledgers), reasonCode, dependencyGraph, outputOptions.runtimeState),
    changeGraph,
  };
}

function selectionWithoutStartedEvidence(selection: AutopilotSelection, rejectedReason: string): AutopilotSelection {
  return {
    ...selection,
    selectedTaskId: undefined,
    autoDecision: selection.autoDecision == null
      ? undefined
      : {
        ...selection.autoDecision,
        fanInValidationRequired: false,
        acceptedSoftConflictScopes: [],
        rejectedReasons: Array.from(new Set([...selection.autoDecision.rejectedReasons, rejectedReason])).sort(),
      },
    candidates: selection.candidates.map((candidate) => {
      if (!(candidate.parallelDecision === "parallel_started" || candidate.selectionReason === "parallel_started" || candidate.selected)) {
        return candidate;
      }
      const demotedCandidate: AutopilotSelectionCandidate = { ...candidate };
      delete demotedCandidate.worktreePath;
      return { ...demotedCandidate, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" };
    }),
  };
}

export function createRunNextOutput(ledgers: LedgerSummary[], outputOptions: AutopilotOutputOptions = {}): AutopilotOutput {
  const dependencyGraph = outputOptions.dependencyGraph ?? ledgers;
  const reasonCode = runNextReasonCode(ledgers, dependencyGraph);
  if (reasonCode === "no_ledgers") {
    return outputFor(ledgers, "No OpenSpec autopilot task ledgers or unfinished active OpenSpec changes were found. MVP prototype does not create ledgers automatically yet.", reasonCode, "autopilot_run_next", null, { dependencyGraph });
  }
  if (reasonCode === "active_change_handoff") {
    return outputFor(
      ledgers,
      `Autopilot found ${ledgers.length} unfinished active OpenSpec change(s) without an applicable task ledger. Continue the selected change through openspec-apply-change; no plugin-owned runtime state was advanced.`,
      reasonCode,
      "autopilot_run_next",
      null,
      { dependencyGraph },
    );
  }
  if (reasonCode === "ready_runtime_deferred") {
    const selection = selectionFor(ledgers, selectableLedgers(ledgers), reasonCode, dependencyGraph, outputOptions.runtimeState);
    if (shouldClaimReadyTasks(outputOptions.runtimeState)) {
      const claimed = claimSelectedReadyTasks(ledgers, selection, outputOptions.runtimeState);
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
          selection: selectionWithoutStartedEvidence(selection, "runtime evidence conflict prevented selected task claim"),
        };
      }
      if (claimed.started.length > 0) {
        return {
          ...outputFor(
            ledgers,
            `Autopilot claim mode validated the selected Ready task and recorded plugin-owned active runtime state. Protected ledger mutation remains deferred to plugin-owned state handling.`,
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
  return outputFor(ledgers, `Autopilot inspected ${ledgers.length} ${sourceSummaryLabel(ledgers)}.`, reasonCode, "autopilot_run_next", null, { dependencyGraph, runtimeState: outputOptions.runtimeState });
}

export function createStatusOutput(ledgers: LedgerSummary[], outputOptions: AutopilotOutputOptions = {}): AutopilotOutput & { status: Record<string, unknown> } {
  const dependencyGraph = outputOptions.dependencyGraph ?? ledgers;
  const reasonCode = runNextReasonCode(ledgers, dependencyGraph);
  const activeRun = activeRunState(outputOptions.runtimeState);
  return {
    ...outputFor(ledgers, `Autopilot status inspected ${ledgers.length} ${sourceSummaryLabel(ledgers)}.`, reasonCode, "autopilot_status", null, { dependencyGraph, runtimeState: outputOptions.runtimeState }),
    status: {
      ...summarizeLedgers(ledgers),
      ...(activeRun == null ? {} : { activeRun }),
      writeGate: writeGateStatus(outputOptions.runtimeState),
    },
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

  const collected = collectWorkerReports(ledgers, outputOptions.runtimeState, { mutateRuntimeState: outputOptions.mutateRuntimeState === true });
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
    collected.alreadyConsumed.length > 0
      ? `MVP collect inspected ${ledgers.length} task ledger(s). ${collected.alreadyConsumed.length} worker report(s) were already consumed; no scoped worker report advanced state.`
      : collected.reportsFound
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
    changeGraph: { nodes: [], levels: [], parallelReady: [], dependencyBlocked: [], conflicts: [], cycles: [] },
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
