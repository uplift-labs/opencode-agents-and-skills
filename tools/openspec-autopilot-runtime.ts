import { type AutopilotParallelDecision, type AutopilotSelectionReason } from "./autopilot-contract.ts";
import { validateTaskLedger } from "./autopilot-ledger.ts";
import { validateOwnedWorktreePath } from "./autopilot-worktree-lifecycle.ts";
import { activeRunState, applyStopToRuntimeState, fanInConflictFor, recordClaimedTasks, stoppedRuntimeEntries } from "./autopilot-active-run.ts";
import {
  ledgerHasIndependentPrimaryScope,
  ledgerWritesCentralScope,
  lowRiskLedger,
  lowRiskTypeWritesUnsafeScope,
  scopeCompatibilityFor,
  scopesAreParallelCompatible,
  writeScopeComparable,
} from "./autopilot-scope-policy.ts";
import type {
  AutopilotAutoParallelDecision,
  AutopilotSelection,
  AutopilotSelectionCandidate,
  BlockerSummary,
  LedgerSummary,
} from "./openspec-autopilot-output.ts";
export {
  applyStopToRuntimeState,
  stoppedRuntimeEntries,
  type AutopilotActiveRunState,
} from "./autopilot-active-run.ts";

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
  mode?: "fixed" | "auto";
  maxImplementationClaims?: number | "auto";
  maxAutoClaims?: number;
  conflictTolerance?: "none" | "small";
  softConflictScopes?: string[];
  lockedTaskIds?: string[];
  worktrees?: Record<string, string>;
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
  const rawMode = raw.mode === "fixed" || raw.mode === "auto" ? raw.mode : undefined;
  const rawMaxImplementationClaims = typeof raw.maxImplementationClaims === "number" && Number.isInteger(raw.maxImplementationClaims) && raw.maxImplementationClaims > 0
    ? raw.maxImplementationClaims
    : raw.maxImplementationClaims === "auto"
    ? "auto"
    : undefined;
  if (rawMode == null && rawMaxImplementationClaims == null) {
    return null;
  }
  const worktrees = isRecord(raw.worktrees)
    ? Object.fromEntries(Object.entries(raw.worktrees).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0))
    : undefined;
  return {
    enabled: true,
    mode: rawMode,
    maxImplementationClaims: rawMaxImplementationClaims,
    maxAutoClaims: typeof raw.maxAutoClaims === "number" && Number.isInteger(raw.maxAutoClaims) && raw.maxAutoClaims > 0 ? raw.maxAutoClaims : undefined,
    conflictTolerance: raw.conflictTolerance === "small" ? "small" : "none",
    softConflictScopes: asStringArray(raw.softConflictScopes),
    lockedTaskIds: asStringArray(raw.lockedTaskIds),
    worktrees,
  };
}

function maxParallelImplementationClaims(state: AutopilotParallelImplementationState): number {
  return typeof state.maxImplementationClaims === "number" ? state.maxImplementationClaims : 2;
}

function autoParallelImplementationEnabled(state: AutopilotParallelImplementationState): boolean {
  return state.mode === "auto" || state.maxImplementationClaims === "auto";
}

function parallelWorktreeFor(ledger: LedgerSummary, state: AutopilotParallelImplementationState): string | null {
  const worktree = state.worktrees?.[ledger.id];
  if (typeof worktree !== "string") {
    return null;
  }
  return validateOwnedWorktreePath(worktree, ledger.id).path ?? null;
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
    return { taskId: ledger.id, path: ledger.path, rank: index + 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started", worktreePath: worktree };
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

type AutoRiskPlan = {
  riskClass: AutopilotAutoParallelDecision["riskClass"];
  resolvedMaxImplementationClaims: number;
  acceptedSoftConflictScopes: string[];
  rejectedReasons: string[];
  decisionReason: string;
  maxAutoClaims: number;
};

function candidateGuardReason(ledger: LedgerSummary, state: AutopilotParallelImplementationState): AutopilotSelectionReason | null {
  if (!writeScopeComparable(ledger)) {
    return "scope_conflict";
  }
  if (!hasParallelLock(ledger, state) || parallelWorktreeFor(ledger, state) == null) {
    return "missing_parallel_guard";
  }
  return null;
}

function effectiveMaxAutoClaims(state: AutopilotParallelImplementationState): number {
  return state.maxAutoClaims ?? 3;
}

function autoHardStopSelection(state: AutopilotParallelImplementationState, rejectedReason: string): AutopilotSelection {
  return {
    mode: "auto_parallel_implementation",
    maxImplementationClaims: 1,
    autoDecision: {
      policy: "auto",
      resolvedMaxImplementationClaims: 1,
      maxAutoClaims: effectiveMaxAutoClaims(state),
      conflictTolerance: state.conflictTolerance ?? "none",
      fanInValidationRequired: false,
      decisionReason: `Auto policy started no work because ${rejectedReason}.`,
      riskClass: "serial_required",
      acceptedSoftConflictScopes: [],
      rejectedReasons: [rejectedReason],
    },
    candidates: [],
  };
}

function globalAutoHardStopReason(reasonCode: string): string | null {
  if (reasonCode === "invalid_ledgers") {
    return "invalid ledgers block auto parallel evaluation";
  }
  if (reasonCode === "blocked_for_user") {
    return "user blockers block auto parallel evaluation";
  }
  if (reasonCode === "waiting_for_mr") {
    return "MR wait state blocks auto parallel evaluation";
  }
  if (reasonCode === "runtime_evidence_conflict") {
    return "runtime evidence conflict blocks auto parallel evaluation";
  }
  return null;
}

function resolveAutoWip(riskClass: AutopilotAutoParallelDecision["riskClass"], candidateCount: number, maxAutoClaims: number): number {
  if (riskClass === "serial_required") {
    return 1;
  }
  if (riskClass === "standard_parallel") {
    return Math.min(maxAutoClaims, 2);
  }
  if (riskClass === "soft_conflict_parallel") {
    return Math.min(maxAutoClaims, 2);
  }
  return Math.min(candidateCount, Math.min(maxAutoClaims, 4));
}

function autoRiskPlanFor(rankedCandidates: LedgerSummary[], dependencyBlockedCandidates: LedgerSummary[], state: AutopilotParallelImplementationState): AutoRiskPlan {
  const rejectedReasons = new Set<string>();
  const acceptedSoftConflictScopes = new Set<string>();
  const maxAutoClaims = effectiveMaxAutoClaims(state);
  const guardedCandidates = rankedCandidates.filter((ledger) => {
    const guardReason = candidateGuardReason(ledger, state);
    if (guardReason === "scope_conflict") {
      rejectedReasons.add(`candidate ${ledger.id} has unknown or unsupported write scope`);
    }
    if (guardReason === "missing_parallel_guard") {
      rejectedReasons.add(`candidate ${ledger.id} is missing plugin-owned lock or worktree evidence`);
    }
    return guardReason == null;
  });

  if (dependencyBlockedCandidates.length > 0) {
    rejectedReasons.add("dependency gaps exist for one or more Ready candidates");
    return {
      riskClass: "serial_required",
      resolvedMaxImplementationClaims: 1,
      acceptedSoftConflictScopes: [],
      rejectedReasons: Array.from(rejectedReasons).sort(),
      decisionReason: "Auto policy resolved to serial because dependency gaps exist in the Ready queue.",
      maxAutoClaims,
    };
  }
  if (guardedCandidates.length <= 1) {
    rejectedReasons.add(guardedCandidates.length === 0 ? "no candidates passed auto parallel guards" : "only one candidate passed auto parallel guards");
    return {
      riskClass: "serial_required",
      resolvedMaxImplementationClaims: 1,
      acceptedSoftConflictScopes: [],
      rejectedReasons: Array.from(rejectedReasons).sort(),
      decisionReason: "Auto policy resolved to serial because fewer than two candidates were eligible.",
      maxAutoClaims,
    };
  }
  if (guardedCandidates.some(lowRiskTypeWritesUnsafeScope)) {
    rejectedReasons.add("low-risk task type writes source/config/protected or unsupported scope");
    return {
      riskClass: "serial_required",
      resolvedMaxImplementationClaims: 1,
      acceptedSoftConflictScopes: [],
      rejectedReasons: Array.from(rejectedReasons).sort(),
      decisionReason: "Auto policy resolved to serial because a low-risk task type writes unsafe scope.",
      maxAutoClaims,
    };
  }
  if (guardedCandidates.some(ledgerWritesCentralScope)) {
    rejectedReasons.add("central coordination or protected scope requires serial implementation");
    return {
      riskClass: "serial_required",
      resolvedMaxImplementationClaims: 1,
      acceptedSoftConflictScopes: [],
      rejectedReasons: Array.from(rejectedReasons).sort(),
      decisionReason: "Auto policy resolved to serial because a candidate writes central coordination scope.",
      maxAutoClaims,
    };
  }

  let hasHardConflict = false;
  for (let leftIndex = 0; leftIndex < guardedCandidates.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < guardedCandidates.length; rightIndex++) {
      const compatibility = scopeCompatibilityFor(guardedCandidates[leftIndex], guardedCandidates[rightIndex], state);
      for (const scope of compatibility.acceptedSoftConflictScopes) {
        acceptedSoftConflictScopes.add(scope);
      }
      if (!compatibility.compatible) {
        hasHardConflict = true;
        for (const reason of compatibility.rejectedReasons) {
          rejectedReasons.add(reason);
        }
      }
    }
  }

  if (hasHardConflict) {
    return {
      riskClass: "serial_required",
      resolvedMaxImplementationClaims: 1,
      acceptedSoftConflictScopes: [],
      rejectedReasons: Array.from(rejectedReasons).sort(),
      decisionReason: "Auto policy resolved to serial because candidate scopes are not parallel safe.",
      maxAutoClaims,
    };
  }

  if (acceptedSoftConflictScopes.size > 0) {
    const acceptedScopes = Array.from(acceptedSoftConflictScopes).sort();
    if (!guardedCandidates.every((ledger) => ledgerHasIndependentPrimaryScope(ledger, acceptedScopes))) {
      rejectedReasons.add("soft conflict candidates need independent primary write scopes");
      return {
        riskClass: "serial_required",
        resolvedMaxImplementationClaims: 1,
        acceptedSoftConflictScopes: [],
        rejectedReasons: Array.from(rejectedReasons).sort(),
        decisionReason: "Auto policy resolved to serial because soft conflicts lacked independent primary scopes.",
        maxAutoClaims,
      };
    }
    const resolvedMaxImplementationClaims = resolveAutoWip("soft_conflict_parallel", guardedCandidates.length, maxAutoClaims);
    if (resolvedMaxImplementationClaims < 2) {
      rejectedReasons.add("maxAutoClaims cap limits soft conflict work to serial execution");
      return {
        riskClass: "serial_required",
        resolvedMaxImplementationClaims: 1,
        acceptedSoftConflictScopes: [],
        rejectedReasons: Array.from(rejectedReasons).sort(),
        decisionReason: "Auto policy resolved to serial because the configured cap prevents soft-conflict parallelism.",
        maxAutoClaims,
      };
    }
    return {
      riskClass: "soft_conflict_parallel",
      resolvedMaxImplementationClaims,
      acceptedSoftConflictScopes: acceptedScopes,
      rejectedReasons: Array.from(rejectedReasons).sort(),
      decisionReason: `Auto policy accepted only configured small soft conflicts and resolved WIP ${resolvedMaxImplementationClaims}.`,
      maxAutoClaims,
    };
  }

  const riskClass: AutopilotAutoParallelDecision["riskClass"] = guardedCandidates.every(lowRiskLedger) ? "low_risk_parallel" : "standard_parallel";
  const resolvedMaxImplementationClaims = resolveAutoWip(riskClass, guardedCandidates.length, maxAutoClaims);
  return {
    riskClass,
    resolvedMaxImplementationClaims,
    acceptedSoftConflictScopes: [],
    rejectedReasons: Array.from(rejectedReasons).sort(),
    decisionReason: riskClass === "low_risk_parallel"
      ? `Auto policy resolved WIP ${resolvedMaxImplementationClaims} for low-risk documentation/evidence work.`
      : `Auto policy resolved WIP ${resolvedMaxImplementationClaims} for disjoint implementation candidates.`,
    maxAutoClaims,
  };
}

function autoParallelSelectionFor(rankedCandidates: LedgerSummary[], dependencyBlockedCandidates: LedgerSummary[], state: AutopilotParallelImplementationState): AutopilotSelection {
  const riskPlan = autoRiskPlanFor(rankedCandidates, dependencyBlockedCandidates, state);
  const startedLedgers: LedgerSummary[] = [];
  const acceptedSoftConflictScopes = new Set<string>();
  const usedWorktrees = new Set<string>();
  const candidates = rankedCandidates.map((ledger, index): AutopilotSelectionCandidate => {
    const guardReason = candidateGuardReason(ledger, state);
    if (guardReason != null) {
      return { taskId: ledger.id, path: ledger.path, rank: index + 1, selected: false, selectionReason: guardReason, parallelDecision: "not_parallel_safe" };
    }
    const worktree = parallelWorktreeFor(ledger, state);
    if (worktree == null || usedWorktrees.has(worktree)) {
      return { taskId: ledger.id, path: ledger.path, rank: index + 1, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" };
    }
    const compatibilityResults = startedLedgers.map((started) => scopeCompatibilityFor(started, ledger, state));
    if (compatibilityResults.some((compatibility) => !compatibility.compatible)) {
      return { taskId: ledger.id, path: ledger.path, rank: index + 1, selected: false, selectionReason: "scope_conflict", parallelDecision: "not_parallel_safe" };
    }
    if (startedLedgers.length >= riskPlan.resolvedMaxImplementationClaims) {
      return { taskId: ledger.id, path: ledger.path, rank: index + 1, selected: false, selectionReason: "wip_limit", parallelDecision: "not_parallel_safe" };
    }
    for (const compatibility of compatibilityResults) {
      if (riskPlan.riskClass === "soft_conflict_parallel") {
        for (const scope of compatibility.acceptedSoftConflictScopes) {
          acceptedSoftConflictScopes.add(scope);
        }
      }
    }
    startedLedgers.push(ledger);
    usedWorktrees.add(worktree);
    return { taskId: ledger.id, path: ledger.path, rank: index + 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started", worktreePath: worktree };
  }).concat(dependencyBlockedCandidates.map((ledger): AutopilotSelectionCandidate => ({
    taskId: ledger.id,
    path: ledger.path,
    rank: null,
    selected: false,
    selectionReason: "dependency_blocked",
    parallelDecision: "not_evaluated",
  })));

  const finalAcceptedSoftConflictScopes = Array.from(acceptedSoftConflictScopes).sort();
  const autoDecision: AutopilotAutoParallelDecision = {
    policy: "auto",
    resolvedMaxImplementationClaims: riskPlan.resolvedMaxImplementationClaims,
    maxAutoClaims: riskPlan.maxAutoClaims,
    conflictTolerance: state.conflictTolerance ?? "none",
    fanInValidationRequired: startedLedgers.length > 1 || finalAcceptedSoftConflictScopes.length > 0,
    decisionReason: riskPlan.decisionReason,
    riskClass: riskPlan.riskClass,
    acceptedSoftConflictScopes: finalAcceptedSoftConflictScopes,
    rejectedReasons: riskPlan.rejectedReasons,
  };

  return {
    mode: "auto_parallel_implementation",
    selectedTaskId: candidates.find((candidate) => candidate.selected)?.taskId,
    maxImplementationClaims: riskPlan.resolvedMaxImplementationClaims,
    autoDecision,
    candidates,
  };
}

export function selectionFor(ledgers: LedgerSummary[], readyLedgers: LedgerSummary[], reasonCode: string, dependencyGraph: LedgerSummary[], runtimeState?: unknown): AutopilotSelection {
  const parallelState = parallelImplementationState(runtimeState);
  if (parallelState != null && autoParallelImplementationEnabled(parallelState)) {
    const hardStopReason = globalAutoHardStopReason(reasonCode);
    if (hardStopReason != null && ledgers.length > 0) {
      return autoHardStopSelection(parallelState, hardStopReason);
    }
  }

  if (reasonCode !== "ready_runtime_deferred" && reasonCode !== "active_change_handoff" && reasonCode !== "no_actionable_tasks") {
    return emptySelection();
  }

  const readyCandidates = readyLedgers.slice().sort(compareReadyLedgers);
  if (readyCandidates.length === 0) {
    return emptySelection();
  }

  const rankedCandidates = readyCandidates.filter((ledger) => dependenciesSatisfied(ledger, dependencyGraph));
  const dependencyBlockedCandidates = readyCandidates.filter((ledger) => !dependenciesSatisfied(ledger, dependencyGraph));
  if (parallelState != null && autoParallelImplementationEnabled(parallelState)) {
    return autoParallelSelectionFor(rankedCandidates, dependencyBlockedCandidates, parallelState);
  }
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

export function claimSelectedReadyTasks(ledgers: LedgerSummary[], selection: AutopilotSelection, runtimeState?: unknown): { started: Array<Record<string, unknown>>; conflicts: BlockerSummary[] } {
  const selectedCandidates = selection.candidates.filter((candidate) => candidate.selected);
  const result: { started: Array<Record<string, unknown>>; conflicts: BlockerSummary[] } = { started: [], conflicts: [] };
  const activeRun = activeRunState(runtimeState);
  if ((activeRun?.taskIds ?? []).length > 0) {
    result.conflicts.push({ reason: `active runtime run ${activeRun?.runId ?? "unknown"} already has claimed tasks; collect or stop it before claiming more Ready work` });
    return result;
  }
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
    result.started.push({
      taskId: ledger.id,
      path: ledger.path,
      workerInstructionId: report.reportId,
      from: report.fromStatus,
      to: report.toStatus,
      mutation: "plugin-owned-runtime-only",
      ...(typeof selected.worktreePath === "string" ? { worktreePath: selected.worktreePath } : {}),
    });
  }
  if (result.conflicts.length === 0) {
    recordClaimedTasks(runtimeState, result.started, selection);
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
    const fanInConflict = fanInConflictFor(report, runtimeState);
    if (fanInConflict != null) {
      result.conflicts.push(fanInConflict);
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
