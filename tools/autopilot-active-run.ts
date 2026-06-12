import type { AutopilotSelection } from "./openspec-autopilot-output.ts";
import type { AutopilotWorkerReport, BlockerSummary } from "./openspec-autopilot-runtime.ts";

export type AutopilotActiveRunState = {
  runId: string;
  taskIds?: string[];
  worktrees?: Record<string, string>;
  fanInValidationRequired?: boolean;
  acceptedSoftConflictScopes?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function activeRunState(runtimeState: unknown): AutopilotActiveRunState | null {
  if (!isRecord(runtimeState) || !isRecord(runtimeState.activeRun) || typeof runtimeState.activeRun.runId !== "string" || runtimeState.activeRun.runId.trim().length === 0) {
    return null;
  }
  const rawWorktrees = isRecord(runtimeState.activeRun.worktrees) ? runtimeState.activeRun.worktrees : undefined;
  const worktrees = rawWorktrees == null
    ? undefined
    : Object.fromEntries(Object.entries(rawWorktrees).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0));
  return {
    runId: runtimeState.activeRun.runId,
    taskIds: asStringArray(runtimeState.activeRun.taskIds),
    ...(worktrees != null && Object.keys(worktrees).length > 0 ? { worktrees } : {}),
    fanInValidationRequired: runtimeState.activeRun.fanInValidationRequired === true,
    acceptedSoftConflictScopes: asStringArray(runtimeState.activeRun.acceptedSoftConflictScopes),
  };
}

export function recordClaimedTasks(runtimeState: unknown, started: Array<Record<string, unknown>>, selection: AutopilotSelection): void {
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
  const selectedCandidatesByTaskId = new Map(selection.candidates.filter((candidate) => candidate.selected).map((candidate) => [candidate.taskId, candidate]));
  const existingWorktrees = isRecord(existingRun.worktrees) ? Object.fromEntries(Object.entries(existingRun.worktrees).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)) : {};
  const worktrees = { ...existingWorktrees };
  for (const taskId of startedTaskIds) {
    const worktreePath = selectedCandidatesByTaskId.get(taskId)?.worktreePath;
    if (typeof worktreePath === "string" && worktreePath.trim().length > 0) {
      worktrees[taskId] = worktreePath;
    }
  }
  const existingSoftConflictScopes = asStringArray(existingRun.acceptedSoftConflictScopes);
  const autoDecision = selection.autoDecision;
  const acceptedSoftConflictScopes = Array.from(new Set([...existingSoftConflictScopes, ...(autoDecision?.acceptedSoftConflictScopes ?? [])])).sort();
  runtimeState.activeRun = {
    runId: typeof existingRun.runId === "string" && existingRun.runId.trim().length > 0 ? existingRun.runId : `claim-${taskIds.join("-")}`,
    taskIds,
    ...(Object.keys(worktrees).length > 0 ? { worktrees } : {}),
    ...((existingRun.fanInValidationRequired === true || autoDecision?.fanInValidationRequired === true) ? { fanInValidationRequired: true } : {}),
    ...(acceptedSoftConflictScopes.length > 0 ? { acceptedSoftConflictScopes } : {}),
  };
}

function statusPassed(value: unknown): boolean {
  if (value === "passed") {
    return true;
  }
  return isRecord(value) && value.status === "passed";
}

function fanInValidationSatisfied(report: AutopilotWorkerReport, activeRun: AutopilotActiveRunState): boolean {
  const evidence = report.evidence;
  if (!isRecord(evidence)) {
    return false;
  }
  const fanIn = isRecord(evidence.fanInValidation) ? evidence.fanInValidation : evidence;
  const integrationPassed = statusPassed(fanIn.integrationValidation) || statusPassed(fanIn.validation) || statusPassed(fanIn.status);
  const reportsCollected = fanIn.workerReportsCollected === true || fanIn.reportCollection === "idempotent";
  const protectedMutationBlocked = fanIn.protectedLedgerMutation === false || fanIn.protectedMutation === "none";
  const conflictsResolved = (activeRun.acceptedSoftConflictScopes ?? []).length === 0 || fanIn.softConflictsResolved === true;
  return integrationPassed && reportsCollected && protectedMutationBlocked && conflictsResolved;
}

export function fanInConflictFor(report: AutopilotWorkerReport, runtimeState: unknown): BlockerSummary | null {
  if (report.toStatus !== "Done") {
    return null;
  }
  const activeRun = activeRunState(runtimeState);
  if (activeRun == null || activeRun.fanInValidationRequired !== true || !(activeRun.taskIds ?? []).includes(report.taskId)) {
    return null;
  }
  if (fanInValidationSatisfied(report, activeRun)) {
    return null;
  }
  return {
    taskId: report.taskId,
    reason: `worker report ${report.reportId} cannot complete auto-parallel task ${report.taskId} without passed fan-in integration validation evidence`,
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
    return stopped;
  }
  if (isRecord(runtimeState.activeRun.worktrees)) {
    for (const taskId of stoppedTaskIds) {
      delete runtimeState.activeRun.worktrees[taskId];
    }
    if (Object.keys(runtimeState.activeRun.worktrees).length === 0) {
      delete runtimeState.activeRun.worktrees;
    }
  }
  if (runtimeState.activeRun.taskIds.length < 2) {
    delete runtimeState.activeRun.acceptedSoftConflictScopes;
    if (runtimeState.activeRun.fanInValidationRequired === true) {
      delete runtimeState.activeRun.fanInValidationRequired;
    }
  }
  return stopped;
}
