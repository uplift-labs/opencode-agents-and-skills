import { guardAutopilotProtectedPathToolCall, guardAutopilotWorkerScopeToolCall, type AutopilotProtectedPathGuardDecision, type AutopilotWorkerScope } from "./autopilot-protected-path-guard.ts";
import { isActiveAutopilotRuntimeStatus, isWorkerWritableAutopilotRuntimeStatus, type AutopilotRunRecord, type AutopilotRuntimeStoreLoadResult } from "./autopilot-runtime-store.ts";

export type AutopilotWriteGateContext = {
  sessionID?: string;
  runtime?: AutopilotRuntimeStoreLoadResult | null;
  mode?: "protect-state-only" | "fail-closed-active-lock";
  protectedPathGuardEnabled?: boolean;
  activeLockEnabled?: boolean;
  activeOwnershipTaskIds?: string[];
};

function block(paths: string[], reason: string): AutopilotProtectedPathGuardDecision {
  return { action: "block", reason, paths: Array.from(new Set(paths)).sort((left, right) => left.localeCompare(right)) };
}

function sortedActiveRuns(runtime: AutopilotRuntimeStoreLoadResult): AutopilotRunRecord[] {
  return Object.values(runtime.snapshot.runs)
    .filter((run) => isActiveAutopilotRuntimeStatus(run.status))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.runId.localeCompare(right.runId));
}

function runForSession(runtime: AutopilotRuntimeStoreLoadResult, sessionID: string | undefined): AutopilotRunRecord | null {
  if (sessionID == null) {
    return null;
  }
  return Object.values(runtime.snapshot.runs)
    .filter((run) => run.workerSessionId === sessionID)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.runId.localeCompare(right.runId))[0] ?? null;
}

function firstActiveOwnershipTaskId(taskIds: string[] | undefined): string | null {
  const ids = Array.from(new Set((taskIds ?? []).filter((taskId) => taskId.trim().length > 0))).sort((left, right) => left.localeCompare(right));
  return ids[0] ?? null;
}

function mutationDecision(tool: string, args: unknown, scope: AutopilotWorkerScope): AutopilotProtectedPathGuardDecision {
  return guardAutopilotWorkerScopeToolCall(tool, args, scope);
}

export function decideAutopilotWriteGate(tool: string, args: unknown, context: AutopilotWriteGateContext = {}): AutopilotProtectedPathGuardDecision {
  const protectedDecision = context.protectedPathGuardEnabled === false
    ? { action: "allow" as const }
    : guardAutopilotProtectedPathToolCall(tool, args);
  if (protectedDecision.action === "block") {
    return protectedDecision;
  }

  const mode = context.mode ?? "fail-closed-active-lock";
  if (mode === "protect-state-only") {
    return protectedDecision;
  }

  const runtime = context.runtime ?? null;
  const contextActiveOwnershipTaskId = firstActiveOwnershipTaskId(context.activeOwnershipTaskIds);
  if (runtime == null) {
    if (context.activeLockEnabled === false || contextActiveOwnershipTaskId == null) {
      return protectedDecision;
    }
    const decision = mutationDecision(tool, args, { read: [], write: [], forbidden: ["**"] });
    return decision.action === "block"
      ? block(decision.paths, `Autopilot active write ownership exists for task ${contextActiveOwnershipTaskId}; main-session mutation blocked fail-closed`)
      : protectedDecision;
  }

  if (runtime.recovered || runtime.errors.length > 0) {
    const decision = mutationDecision(tool, args, { read: [], write: [], forbidden: ["**"] });
    return decision.action === "block"
      ? block(decision.paths, `Autopilot runtime state recovery failed; mutation blocked fail-closed: ${(runtime.errors.length > 0 ? runtime.errors : ["unknown recovery error"]).join("; ")}`)
      : protectedDecision;
  }

  const sessionRun = runForSession(runtime, context.sessionID);
  if (sessionRun != null) {
    if (!isWorkerWritableAutopilotRuntimeStatus(sessionRun.status)) {
      const decision = mutationDecision(tool, args, { read: [], write: [], forbidden: ["**"] });
      return decision.action === "block"
        ? block(decision.paths, `Autopilot worker session is not active for writes (status ${sessionRun.status}); mutation blocked fail-closed`)
        : protectedDecision;
    }
    return mutationDecision(tool, args, sessionRun.scope);
  }

  if (context.activeLockEnabled === false) {
    return protectedDecision;
  }

  const activeRuns = sortedActiveRuns(runtime);
  const activeOwnershipTaskId = activeRuns[0]?.taskId ?? contextActiveOwnershipTaskId;
  if (activeOwnershipTaskId == null) {
    return protectedDecision;
  }

  const decision = mutationDecision(tool, args, { read: [], write: [], forbidden: ["**"] });
  return decision.action === "block"
    ? block(decision.paths, `Autopilot active write ownership exists for task ${activeOwnershipTaskId}; main-session mutation blocked fail-closed`)
    : protectedDecision;
}
