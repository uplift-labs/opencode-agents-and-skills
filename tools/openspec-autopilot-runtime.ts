import {
  autopilotProtectedPathPatterns,
  type AutopilotParallelDecision,
  type AutopilotSelectionReason,
} from "./autopilot-contract.ts";
import { validateTaskLedger } from "./autopilot-ledger.ts";
import type {
  AutopilotSelection,
  AutopilotSelectionCandidate,
  BlockerSummary,
  LedgerSummary,
} from "./openspec-autopilot-output.ts";

export type AutopilotBlockerQuestionOption = {
  label: string;
  action?: string;
};

export type AutopilotBlockerQuestion = {
  questionId: string;
  taskId?: string;
  options?: AutopilotBlockerQuestionOption[];
};

export type AutopilotRuntimeState = {
  claimReadyTasks?: boolean;
  parallelImplementation?: AutopilotParallelImplementationState;
  activeRun?: AutopilotActiveRunState;
  blockerQuestions?: AutopilotBlockerQuestion[];
  workerReports?: AutopilotWorkerReport[];
  consumedWorkerReportIds?: string[];
};

export type AutopilotBlockerAnswer = {
  questionId: string;
  taskId?: string;
  selectedLabel?: string;
  action?: string;
};

export type AutopilotBlockerAnswerValidation = {
  accepted: boolean;
  reason?: string;
  question?: AutopilotBlockerQuestion;
};

export type AutopilotWorkerReport = {
  reportId: string;
  taskId: string;
  ledgerPath?: string;
  fromStatus: string;
  toStatus: string;
  completedAt?: string;
  workerId?: string;
  evidence?: Record<string, unknown>;
};

export type AutopilotParallelImplementationState = {
  enabled?: boolean;
  maxImplementationClaims?: number;
  lockedTaskIds?: string[];
  worktrees?: Record<string, string>;
};

export type AutopilotActiveRunState = {
  runId: string;
  taskIds?: string[];
};

export type CollectWorkerReportResult = {
  reportsFound: boolean;
  advanced: Array<Record<string, unknown>>;
  conflicts: BlockerSummary[];
  alreadyConsumed: string[];
};

export type CollectWorkerReportOptions = {
  mutateRuntimeState?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizedBlockerQuestions(runtimeState: unknown): AutopilotBlockerQuestion[] {
  if (!isRecord(runtimeState) || !Array.isArray(runtimeState.blockerQuestions)) {
    return [];
  }
  return runtimeState.blockerQuestions.flatMap((rawQuestion): AutopilotBlockerQuestion[] => {
    if (!isRecord(rawQuestion) || typeof rawQuestion.questionId !== "string" || rawQuestion.questionId.trim().length === 0) {
      return [];
    }
    const options = Array.isArray(rawQuestion.options)
      ? rawQuestion.options.flatMap((rawOption): AutopilotBlockerQuestionOption[] => {
        if (!isRecord(rawOption) || typeof rawOption.label !== "string" || rawOption.label.trim().length === 0) {
          return [];
        }
        return [{ label: rawOption.label, action: typeof rawOption.action === "string" ? rawOption.action : undefined }];
      })
      : undefined;
    return [{
      questionId: rawQuestion.questionId,
      taskId: typeof rawQuestion.taskId === "string" ? rawQuestion.taskId : undefined,
      options,
    }];
  });
}

function normalizedWorkerReports(runtimeState: unknown): AutopilotWorkerReport[] {
  if (!isRecord(runtimeState) || !Array.isArray(runtimeState.workerReports)) {
    return [];
  }
  return runtimeState.workerReports.flatMap((rawReport): AutopilotWorkerReport[] => {
    if (!isRecord(rawReport)
      || typeof rawReport.reportId !== "string"
      || rawReport.reportId.trim().length === 0
      || typeof rawReport.taskId !== "string"
      || rawReport.taskId.trim().length === 0
      || typeof rawReport.fromStatus !== "string"
      || rawReport.fromStatus.trim().length === 0
      || typeof rawReport.toStatus !== "string"
      || rawReport.toStatus.trim().length === 0) {
      return [];
    }
    return [{
      reportId: rawReport.reportId,
      taskId: rawReport.taskId,
      ledgerPath: typeof rawReport.ledgerPath === "string" ? rawReport.ledgerPath : undefined,
      fromStatus: rawReport.fromStatus,
      toStatus: rawReport.toStatus,
      completedAt: typeof rawReport.completedAt === "string" ? rawReport.completedAt : undefined,
      workerId: typeof rawReport.workerId === "string" ? rawReport.workerId : undefined,
      evidence: isRecord(rawReport.evidence) ? rawReport.evidence : undefined,
    }];
  });
}

function consumedWorkerReportIds(runtimeState: unknown): Set<string> {
  if (!isRecord(runtimeState)) {
    return new Set();
  }
  return new Set(asStringArray(runtimeState.consumedWorkerReportIds));
}

function markWorkerReportConsumed(runtimeState: unknown, consumed: Set<string>, reportId: string): void {
  if (consumed.has(reportId)) {
    return;
  }
  consumed.add(reportId);
  if (!isRecord(runtimeState)) {
    return;
  }
  runtimeState.consumedWorkerReportIds = Array.from(consumed).sort();
}

export function validateBlockerAnswer(runtimeState: unknown, answer: AutopilotBlockerAnswer): AutopilotBlockerAnswerValidation {
  const question = normalizedBlockerQuestions(runtimeState).find((candidate) => candidate.questionId === answer.questionId);
  if (question == null) {
    return { accepted: false, reason: `No pending plugin-owned blocker question exists for ${answer.questionId}.` };
  }
  if (question.taskId != null && answer.taskId !== question.taskId) {
    return { accepted: false, question, reason: `Pending blocker question ${answer.questionId} belongs to task ${question.taskId}.` };
  }
  if (question.options != null && question.options.length > 0) {
    const optionMatches = question.options.some((option) => option.label === answer.selectedLabel && (option.action == null || option.action === answer.action));
    if (!optionMatches) {
      return { accepted: false, question, reason: `Selected blocker answer for ${answer.questionId} does not match pending options.` };
    }
  }
  return { accepted: true, question };
}

function priorityRank(priority: string): { knownRank: number; unknownKey: string } {
  const normalized = priority.trim().toLowerCase();
  const rank = ["critical", "high", "medium", "low"].indexOf(normalized);
  return rank >= 0 ? { knownRank: rank, unknownKey: "" } : { knownRank: 4, unknownKey: normalized };
}

function selectionReasonFor(ledger: LedgerSummary, selected: boolean): AutopilotSelectionReason {
  const hasUnknownPriority = priorityRank(ledger.priority).knownRank === 4;
  if (selected) {
    return hasUnknownPriority ? "selected_primary_unknown_priority" : "selected_primary";
  }
  return hasUnknownPriority ? "serial_default_unknown_priority" : "serial_default";
}

export function dependenciesSatisfied(ledger: LedgerSummary, ledgers: LedgerSummary[]): boolean {
  if (ledger.dependencies.length === 0) {
    return true;
  }
  return ledger.dependencies.every((dependency) => ledgers.some((candidate) => candidate.id === dependency && candidate.valid && candidate.status === "Done"));
}

function compareReadyLedgers(left: LedgerSummary, right: LedgerSummary): number {
  const leftPriority = priorityRank(left.priority);
  const rightPriority = priorityRank(right.priority);
  return leftPriority.knownRank - rightPriority.knownRank
    || leftPriority.unknownKey.localeCompare(rightPriority.unknownKey)
    || left.writeScopeSize - right.writeScopeSize
    || left.id.localeCompare(right.id)
    || left.path.localeCompare(right.path);
}

type ScopePattern = {
  prefix: string;
  exact: boolean;
};

function normalizeScopePattern(pattern: string): ScopePattern | null {
  const normalized = pattern.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.length === 0) {
    return null;
  }
  const globIndex = normalized.search(/[!?*[\]{}]/);
  if (globIndex < 0) {
    return { prefix: normalized, exact: true };
  }
  const rawPrefix = normalized.slice(0, globIndex);
  const prefix = rawPrefix.endsWith("/") ? rawPrefix : rawPrefix.slice(0, rawPrefix.lastIndexOf("/") + 1);
  return prefix.length > 0 ? { prefix, exact: false } : null;
}

function scopePatternsMayOverlap(left: ScopePattern, right: ScopePattern): boolean {
  if (left.exact && right.exact) {
    return left.prefix === right.prefix || left.prefix.startsWith(`${right.prefix}/`) || right.prefix.startsWith(`${left.prefix}/`);
  }
  if (left.exact) {
    return left.prefix.startsWith(right.prefix);
  }
  if (right.exact) {
    return right.prefix.startsWith(left.prefix);
  }
  return left.prefix.startsWith(right.prefix) || right.prefix.startsWith(left.prefix);
}

function writeScopesAreDisjoint(left: LedgerSummary, right: LedgerSummary): boolean {
  if (left.writeScope.length === 0 || right.writeScope.length === 0) {
    return false;
  }
  const leftPatterns = left.writeScope.map(normalizeScopePattern);
  const rightPatterns = right.writeScope.map(normalizeScopePattern);
  if (leftPatterns.some((pattern) => pattern == null) || rightPatterns.some((pattern) => pattern == null)) {
    return false;
  }
  return leftPatterns.every((leftPattern) => rightPatterns.every((rightPattern) => !scopePatternsMayOverlap(leftPattern, rightPattern)));
}

const commonProtectedForbiddenScopes = new Set<string>([...autopilotProtectedPathPatterns, "openspec/changes/*/automation/**"]);

function taskSpecificForbiddenScope(ledger: LedgerSummary): string[] {
  return ledger.forbiddenScope.filter((scope) => !commonProtectedForbiddenScopes.has(scope));
}

function writesAvoidForbidden(writeLedger: LedgerSummary, forbiddenLedger: LedgerSummary): boolean {
  const forbiddenScope = taskSpecificForbiddenScope(forbiddenLedger);
  if (forbiddenScope.length === 0) {
    return true;
  }
  if (writeLedger.writeScope.length === 0) {
    return false;
  }
  const writePatterns = writeLedger.writeScope.map(normalizeScopePattern);
  const forbiddenPatterns = forbiddenScope.map(normalizeScopePattern);
  if (writePatterns.some((pattern) => pattern == null) || forbiddenPatterns.some((pattern) => pattern == null)) {
    return false;
  }
  return writePatterns.every((writePattern) => forbiddenPatterns.every((forbiddenPattern) => !scopePatternsMayOverlap(writePattern, forbiddenPattern)));
}

function scopesAreParallelCompatible(left: LedgerSummary, right: LedgerSummary): boolean {
  return writeScopesAreDisjoint(left, right) && writesAvoidForbidden(left, right) && writesAvoidForbidden(right, left);
}

function writeScopeComparable(ledger: LedgerSummary): boolean {
  return ledger.writeScope.length > 0 && ledger.writeScope.every((scope) => normalizeScopePattern(scope) != null);
}

function parallelDecisionFor(ledger: LedgerSummary, selectedPrimary: LedgerSummary | undefined): AutopilotParallelDecision {
  if (selectedPrimary == null || ledger.id === selectedPrimary.id && ledger.path === selectedPrimary.path) {
    return "not_evaluated";
  }
  return scopesAreParallelCompatible(selectedPrimary, ledger) ? "parallel_ready" : "not_parallel_safe";
}

function parallelImplementationState(runtimeState: unknown): AutopilotParallelImplementationState | null {
  if (!isRecord(runtimeState) || !isRecord(runtimeState.parallelImplementation) || runtimeState.parallelImplementation.enabled !== true) {
    return null;
  }
  const raw = runtimeState.parallelImplementation;
  const worktrees = isRecord(raw.worktrees)
    ? Object.fromEntries(Object.entries(raw.worktrees).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0))
    : undefined;
  return {
    enabled: true,
    maxImplementationClaims: typeof raw.maxImplementationClaims === "number" && Number.isInteger(raw.maxImplementationClaims) && raw.maxImplementationClaims > 0 ? raw.maxImplementationClaims : undefined,
    lockedTaskIds: asStringArray(raw.lockedTaskIds),
    worktrees,
  };
}

function maxParallelImplementationClaims(state: AutopilotParallelImplementationState): number {
  return state.maxImplementationClaims ?? 2;
}

function parallelWorktreeFor(ledger: LedgerSummary, state: AutopilotParallelImplementationState): string | null {
  const worktree = state.worktrees?.[ledger.id];
  if (typeof worktree !== "string") {
    return null;
  }
  const normalized = worktree.trim().replaceAll("\\", "/");
  if (!normalized.startsWith("autopilot/") || normalized.includes("..") || normalized.split("/").some((segment) => segment.length === 0)) {
    return null;
  }
  return normalized.split("/").includes(ledger.id) ? normalized : null;
}

function hasParallelLock(ledger: LedgerSummary, state: AutopilotParallelImplementationState): boolean {
  return (state.lockedTaskIds ?? []).includes(ledger.id);
}

function parallelSelectionFor(rankedCandidates: LedgerSummary[], dependencyBlockedCandidates: LedgerSummary[], state: AutopilotParallelImplementationState): AutopilotSelection {
  const maxImplementationClaims = maxParallelImplementationClaims(state);
  const startedLedgers: LedgerSummary[] = [];
  const usedWorktrees = new Set<string>();
  const candidates = rankedCandidates.map((ledger, index): AutopilotSelectionCandidate => {
    if (startedLedgers.length >= maxImplementationClaims) {
      return { taskId: ledger.id, path: ledger.path, rank: index + 1, selected: false, selectionReason: "wip_limit", parallelDecision: "not_parallel_safe" };
    }
    const worktree = parallelWorktreeFor(ledger, state);
    if (!hasParallelLock(ledger, state) || worktree == null || usedWorktrees.has(worktree)) {
      return { taskId: ledger.id, path: ledger.path, rank: index + 1, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" };
    }
    if (!writeScopeComparable(ledger) || startedLedgers.some((started) => !scopesAreParallelCompatible(started, ledger))) {
      return { taskId: ledger.id, path: ledger.path, rank: index + 1, selected: false, selectionReason: "scope_conflict", parallelDecision: "not_parallel_safe" };
    }
    startedLedgers.push(ledger);
    usedWorktrees.add(worktree);
    return { taskId: ledger.id, path: ledger.path, rank: index + 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" };
  }).concat(dependencyBlockedCandidates.map((ledger): AutopilotSelectionCandidate => ({
    taskId: ledger.id,
    path: ledger.path,
    rank: null,
    selected: false,
    selectionReason: "dependency_blocked",
    parallelDecision: "not_evaluated",
  })));

  return {
    mode: "parallel_implementation",
    selectedTaskId: candidates.find((candidate) => candidate.selected)?.taskId,
    maxImplementationClaims,
    candidates,
  };
}

export function selectionFor(ledgers: LedgerSummary[], readyLedgers: LedgerSummary[], reasonCode: string, dependencyGraph: LedgerSummary[], runtimeState?: unknown): AutopilotSelection {
  if (reasonCode !== "ready_runtime_deferred" && reasonCode !== "active_change_handoff" && reasonCode !== "no_actionable_tasks") {
    return emptySelection();
  }

  const readyCandidates = readyLedgers.slice().sort(compareReadyLedgers);
  if (readyCandidates.length === 0) {
    return emptySelection();
  }

  const rankedCandidates = readyCandidates.filter((ledger) => dependenciesSatisfied(ledger, dependencyGraph));
  const dependencyBlockedCandidates = readyCandidates.filter((ledger) => !dependenciesSatisfied(ledger, dependencyGraph));
  const parallelState = parallelImplementationState(runtimeState);
  if (parallelState != null && rankedCandidates.length > 0) {
    return parallelSelectionFor(rankedCandidates, dependencyBlockedCandidates, parallelState);
  }

  const selectedPrimary = rankedCandidates[0];
  const candidates = rankedCandidates.map((ledger, index): AutopilotSelectionCandidate => {
    const selected = index === 0;
    return {
      taskId: ledger.id,
      path: ledger.path,
      rank: index + 1,
      selected,
      selectionReason: selectionReasonFor(ledger, selected),
      parallelDecision: parallelDecisionFor(ledger, selectedPrimary),
    };
  }).concat(dependencyBlockedCandidates.map((ledger): AutopilotSelectionCandidate => ({
    taskId: ledger.id,
    path: ledger.path,
    rank: null,
    selected: false,
    selectionReason: "dependency_blocked",
    parallelDecision: "not_evaluated",
  })));

  return {
    mode: "serial_default",
    selectedTaskId: candidates.find((candidate) => candidate.selected)?.taskId,
    maxImplementationClaims: 1,
    candidates,
  };
}

export function emptySelection(): AutopilotSelection {
  return {
    mode: "serial_default",
    maxImplementationClaims: 1,
    candidates: [],
  };
}

export function shouldClaimReadyTasks(runtimeState: unknown): boolean {
  return isRecord(runtimeState) && (runtimeState.claimReadyTasks === true || parallelImplementationState(runtimeState) != null);
}

function cloneLedgerRecord(ledger: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(ledger)) as Record<string, unknown>;
}

function applyWorkerReportToLedger(ledger: LedgerSummary, report: AutopilotWorkerReport, source = "autopilot_collect"): { advanced?: Record<string, unknown>; conflict?: BlockerSummary } {
  if (ledger.ledger == null) {
    return { conflict: { taskId: ledger.id, path: ledger.path, reason: `worker report ${report.reportId} cannot be applied because raw ledger state is unavailable` } };
  }
  if (report.fromStatus !== ledger.status) {
    return { conflict: { taskId: ledger.id, path: ledger.path, reason: `worker report ${report.reportId} expected ${report.fromStatus} but ledger is ${ledger.status}` } };
  }

  const nextLedger = cloneLedgerRecord(ledger.ledger);
  const history = Array.isArray(nextLedger.history) ? nextLedger.history.slice() : [];
  const completedAt = report.completedAt ?? "1970-01-01T00:00:00.000Z";
  nextLedger.status = report.toStatus;
  nextLedger.history = history.concat({
    from: report.fromStatus,
    to: report.toStatus,
    at: completedAt,
    by: "plugin",
    source,
    evidence: {
      ...(report.evidence ?? {}),
      workerReportId: report.reportId,
      workerId: report.workerId ?? "plugin-owned-worker",
    },
  });
  const revision = isRecord(nextLedger.revision) ? { ...nextLedger.revision } : {};
  nextLedger.revision = {
    ...revision,
    number: typeof revision.number === "number" && Number.isInteger(revision.number) ? revision.number + 1 : 1,
    contentHash: "pending-plugin-owned-runtime",
    updatedBy: source,
    updatedAt: completedAt,
  };

  const validation = validateTaskLedger(nextLedger, { sourcePath: `${ledger.path}#${report.reportId}` });
  if (!validation.valid) {
    const firstError = validation.errors[0];
    return { conflict: { taskId: ledger.id, path: ledger.path, reason: `worker report ${report.reportId} would create invalid ledger state${firstError != null ? `: ${firstError}` : ""}`, errors: validation.errors } };
  }

  return { advanced: { taskId: ledger.id, path: ledger.path, reportId: report.reportId, from: report.fromStatus, to: report.toStatus, mutation: "plugin-owned-runtime-only" } };
}

function recordClaimedTasks(runtimeState: unknown, started: Array<Record<string, unknown>>): void {
  if (!isRecord(runtimeState) || started.length === 0) {
    return;
  }
  const startedTaskIds = started.flatMap((entry) => typeof entry.taskId === "string" ? [entry.taskId] : []);
  if (startedTaskIds.length === 0) {
    return;
  }
  const existingRun = isRecord(runtimeState.activeRun) ? runtimeState.activeRun : {};
  const existingTaskIds = asStringArray(existingRun.taskIds);
  const taskIds = Array.from(new Set([...existingTaskIds, ...startedTaskIds])).sort();
  runtimeState.activeRun = {
    runId: typeof existingRun.runId === "string" && existingRun.runId.trim().length > 0 ? existingRun.runId : `claim-${taskIds.join("-")}`,
    taskIds,
  };
}

export function claimSelectedReadyTasks(ledgers: LedgerSummary[], selection: AutopilotSelection, runtimeState?: unknown): { started: Array<Record<string, unknown>>; conflicts: BlockerSummary[] } {
  const selectedCandidates = selection.candidates.filter((candidate) => candidate.selected);
  const result: { started: Array<Record<string, unknown>>; conflicts: BlockerSummary[] } = { started: [], conflicts: [] };
  if (selectedCandidates.length === 0) {
    result.conflicts.push({ reason: "claim mode found no selected Ready task candidate" });
    return result;
  }
  for (const selected of selectedCandidates) {
    const ledger = ledgers.find((candidate) => candidate.id === selected.taskId && candidate.path === selected.path);
    if (ledger == null) {
      result.conflicts.push({ taskId: selected.taskId, path: selected.path, reason: "selected Ready task candidate disappeared before claim" });
      continue;
    }
    const report: AutopilotWorkerReport = {
      reportId: `claim-${ledger.id}`,
      taskId: ledger.id,
      fromStatus: ledger.status,
      toStatus: "Analyze",
      completedAt: "1970-01-01T00:00:00.000Z",
      workerId: "plugin-owned-claim",
      evidence: { claimReason: "selected_primary", workerInstruction: "Analyze the selected Ready task before implementation." },
    };
    const applied = applyWorkerReportToLedger(ledger, report, "autopilot_run_next");
    if (applied.conflict) {
      result.conflicts.push(applied.conflict);
      continue;
    }
    result.started.push({ taskId: ledger.id, path: ledger.path, workerInstructionId: report.reportId, from: report.fromStatus, to: report.toStatus, mutation: "plugin-owned-runtime-only" });
  }
  if (result.conflicts.length === 0) {
    recordClaimedTasks(runtimeState, result.started);
  }
  return result;
}

export function collectWorkerReports(ledgers: LedgerSummary[], runtimeState: unknown, options: CollectWorkerReportOptions = {}): CollectWorkerReportResult {
  const reports = normalizedWorkerReports(runtimeState).sort((left, right) => left.reportId.localeCompare(right.reportId));
  const result: CollectWorkerReportResult = { reportsFound: false, advanced: [], conflicts: [], alreadyConsumed: [] };
  const consumedLedgerPaths = new Set<string>();
  const consumedReportIds = consumedWorkerReportIds(runtimeState);
  const reportIdsInOperation = new Set<string>();
  const acceptedReportIds: string[] = [];

  for (const report of reports) {
    const matches = ledgers.filter((ledger) => ledger.id === report.taskId && (report.ledgerPath == null || ledger.path === report.ledgerPath));
    if (matches.length === 0) {
      continue;
    }
    result.reportsFound = true;
    if (reportIdsInOperation.has(report.reportId)) {
      result.conflicts.push({ taskId: report.taskId, reason: `duplicate worker report id ${report.reportId} appeared more than once in one collect operation` });
      continue;
    }
    reportIdsInOperation.add(report.reportId);
    if (consumedReportIds.has(report.reportId)) {
      result.alreadyConsumed.push(report.reportId);
      continue;
    }
    if (matches.length > 1) {
      result.conflicts.push({ taskId: report.taskId, reason: `worker report ${report.reportId} targets duplicate task id ${report.taskId}; ledgerPath is required to disambiguate` });
      continue;
    }
    const ledger = matches[0];
    if (consumedLedgerPaths.has(ledger.path)) {
      result.conflicts.push({ taskId: ledger.id, path: ledger.path, reason: `multiple worker reports target ${ledger.id} at ${ledger.path} in one collect operation` });
      continue;
    }
    consumedLedgerPaths.add(ledger.path);
    const applied = applyWorkerReportToLedger(ledger, report);
    if (applied.conflict) {
      result.conflicts.push(applied.conflict);
    }
    if (applied.advanced) {
      result.advanced.push(applied.advanced);
      acceptedReportIds.push(report.reportId);
    }
  }

  if (options.mutateRuntimeState === true && result.conflicts.length === 0) {
    for (const reportId of acceptedReportIds) {
      markWorkerReportConsumed(runtimeState, consumedReportIds, reportId);
    }
  }

  return result;
}

function activeRunState(runtimeState: unknown): AutopilotActiveRunState | null {
  if (!isRecord(runtimeState) || !isRecord(runtimeState.activeRun) || typeof runtimeState.activeRun.runId !== "string" || runtimeState.activeRun.runId.trim().length === 0) {
    return null;
  }
  return {
    runId: runtimeState.activeRun.runId,
    taskIds: asStringArray(runtimeState.activeRun.taskIds),
  };
}

export function stoppedRuntimeEntries(target: string | undefined, id: string | undefined, runtimeState: unknown): Array<Record<string, unknown>> {
  const activeRun = activeRunState(runtimeState);
  if (activeRun == null) {
    return [];
  }
  const normalizedTarget = target ?? "run";
  if (normalizedTarget === "all") {
    return [
      { target: "run", runId: activeRun.runId, action: "stopped", mutation: "plugin-owned-runtime-only" },
      ...(activeRun.taskIds ?? []).map((taskId) => ({ target: "task", taskId, action: "stopped", mutation: "plugin-owned-runtime-only" })),
    ];
  }
  if (normalizedTarget === "task" && id != null && (activeRun.taskIds ?? []).includes(id)) {
    return [{ target: "task", taskId: id, runId: activeRun.runId, action: "stopped", mutation: "plugin-owned-runtime-only" }];
  }
  if (normalizedTarget === "run" && (id == null || id === activeRun.runId)) {
    return [{ target: "run", runId: activeRun.runId, action: "stopped", mutation: "plugin-owned-runtime-only" }];
  }
  return [];
}

export function applyStopToRuntimeState(target: string | undefined, id: string | undefined, runtimeState: unknown): Array<Record<string, unknown>> {
  const stopped = stoppedRuntimeEntries(target, id, runtimeState);
  if (stopped.length === 0 || !isRecord(runtimeState) || !isRecord(runtimeState.activeRun)) {
    return stopped;
  }
  if (stopped.some((entry) => entry.target === "run")) {
    delete runtimeState.activeRun;
    return stopped;
  }
  const stoppedTaskIds = new Set(stopped.flatMap((entry) => typeof entry.taskId === "string" ? [entry.taskId] : []));
  if (stoppedTaskIds.size === 0 || !Array.isArray(runtimeState.activeRun.taskIds)) {
    return stopped;
  }
  runtimeState.activeRun.taskIds = runtimeState.activeRun.taskIds.filter((taskId) => typeof taskId !== "string" || !stoppedTaskIds.has(taskId));
  if (runtimeState.activeRun.taskIds.length === 0) {
    delete runtimeState.activeRun;
  }
  return stopped;
}
