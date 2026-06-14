import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import path from "node:path";
import { runAutopilotCheck } from "../../tools/autopilot-check.ts";
import { planAutopilotPromptIntake } from "../../tools/autopilot-prompt-intake.ts";
import { createFileAutopilotRuntimeStore, isActiveAutopilotRuntimeStatus, type AutopilotRuntimeStore } from "../../tools/autopilot-runtime-store.ts";
import {
  classifyAutopilotEvent,
  classifyAutopilotToolExecutionAfter,
  parseAutopilotTriggerOptions,
  type AutopilotBusEvent,
  type AutopilotToolExecutionInput,
  type AutopilotTriggerDecision,
  type AutopilotTriggerJob,
  type AutopilotTriggerRuntimeEvidence,
} from "../../tools/autopilot-programmatic-triggers.ts";
import { decideAutopilotWriteGate } from "../../tools/autopilot-write-gate.ts";
import {
  createAutopilotTriggerScheduler,
  type AutopilotTriggerEnqueueResult,
  type AutopilotTriggerExecution,
} from "../../tools/autopilot-trigger-scheduler.ts";
import { completeAutopilotWorkerReportMarker } from "../../tools/autopilot-worker-report-marker.ts";
import { createOpenCodeWorkerSessionAdapter } from "../../tools/autopilot-worker-session-adapter.ts";
import { readActiveChangeSummaries } from "../../tools/openspec-autopilot-active-change-queue.ts";
import { changeIdForLedgerPath, readLedgerSummaries, type AutopilotOptions, type LedgerSummary } from "../../tools/openspec-autopilot-output.ts";
import { createAutopilotController, toPluginToolOutput } from "../../tools/openspec-autopilot-controller.ts";

type AutopilotPluginOptions = AutopilotOptions & {
  triggers?: unknown;
};

type WorkerDispatchOptionResolution = {
  enabled: boolean;
  diagnostics: string[];
};

type LogContext = {
  client?: {
    app?: {
      log?: (entry: { body: Record<string, unknown> }) => Promise<void> | void;
    };
  };
};

function optionalNonEmptyString(value?: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function repoRoot(ctx: { worktree?: string; directory?: string }): string {
  return optionalNonEmptyString(ctx.worktree) ?? optionalNonEmptyString(ctx.directory) ?? process.cwd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function recordsFrom(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return strings.length > 0 ? strings : undefined;
}

function waitArray(value: unknown): Array<string | { name: string; taskId?: string; runId?: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const waits = value.flatMap((item): Array<string | { name: string; taskId?: string; runId?: string }> => {
    if (typeof item === "string" && item.trim().length > 0) {
      return [item.trim()];
    }
    if (!isRecord(item)) {
      return [];
    }
    const name = optionalString(item.name ?? item.workspaceID ?? item.worktreeID);
    return name == null ? [] : [{ name, taskId: optionalString(item.taskId), runId: optionalString(item.runId) }];
  });
  return waits.length > 0 ? waits : undefined;
}

function runtimeEvidence(runtimeState: unknown, pendingWorkerReportIds: Map<string, string> = new Map()): AutopilotTriggerRuntimeEvidence {
  if (!isRecord(runtimeState)) {
    return {};
  }
  const activeRun = isRecord(runtimeState.activeRun) ? runtimeState.activeRun : undefined;
  const consumedWorkerReportIds = new Set(stringArray(runtimeState.consumedWorkerReportIds) ?? []);
  return {
    workerSessions: recordsFrom(runtimeState.workerSessions).flatMap((worker) => {
      const sessionID = optionalString(worker.sessionID);
      const taskId = optionalString(worker.taskId);
      const reportId = optionalString(worker.reportId) ?? pendingWorkerReportIds.get(sessionID);
      if (sessionID == null || taskId == null) {
        return [];
      }
      const status = worker.status === "busy" || worker.status === "idle" || worker.status === "retry" ? worker.status : undefined;
      return [{
        sessionID,
        taskId,
        reportId,
        status,
        reportConsumed: worker.reportConsumed === true || reportId != null && consumedWorkerReportIds.has(reportId),
      }];
    }),
    blockerQuestions: recordsFrom(runtimeState.blockerQuestions).flatMap((question) => {
      const requestID = optionalString(question.requestID ?? question.requestId);
      const questionId = optionalString(question.questionId);
      const options = recordsFrom(question.options).flatMap((option) => {
        const label = optionalString(option.label);
        return label == null ? [] : [{ label, action: optionalString(option.action) }];
      });
      return requestID != null && questionId != null ? [{ requestID, questionId, taskId: optionalString(question.taskId), ...(options.length > 0 ? { options } : {}) }] : [];
    }),
    pendingPermissions: recordsFrom(runtimeState.pendingPermissions).flatMap((permission) => {
      const requestID = optionalString(permission.requestID ?? permission.requestId);
      return requestID != null ? [{ requestID, taskId: optionalString(permission.taskId) }] : [];
    }),
    waitingWorkspaces: waitArray(runtimeState.waitingWorkspaces),
    waitingWorktrees: waitArray(runtimeState.waitingWorktrees),
    activeRun: activeRun == null ? undefined : {
      runId: optionalString(activeRun.runId) ?? "active-run",
      taskIds: stringArray(activeRun.taskIds),
      sessionIDs: stringArray(activeRun.sessionIDs),
      blockers: activeRun.blockers === true,
      mrWait: activeRun.mrWait === true,
      locksValid: activeRun.locksValid === true,
      lastRunNextOutput: isRecord(activeRun.lastRunNextOutput) ? activeRun.lastRunNextOutput : undefined,
    },
  };
}

type DurableRuntimeEvidenceResult = {
  evidence: AutopilotTriggerRuntimeEvidence;
  errors: string[];
};

function mergeRuntimeEvidence(left: AutopilotTriggerRuntimeEvidence, right: AutopilotTriggerRuntimeEvidence): AutopilotTriggerRuntimeEvidence {
  return {
    ...left,
    ...right,
    workerSessions: [...(left.workerSessions ?? []), ...(right.workerSessions ?? [])],
    blockerQuestions: [...(left.blockerQuestions ?? []), ...(right.blockerQuestions ?? [])],
    pendingPermissions: [...(left.pendingPermissions ?? []), ...(right.pendingPermissions ?? [])],
    waitingWorkspaces: [...(left.waitingWorkspaces ?? []), ...(right.waitingWorkspaces ?? [])],
    waitingWorktrees: [...(left.waitingWorktrees ?? []), ...(right.waitingWorktrees ?? [])],
    activeRun: right.activeRun ?? left.activeRun,
  };
}

async function durableRuntimeEvidence(store: AutopilotRuntimeStore | undefined, pendingWorkerReportIds: Map<string, string>): Promise<DurableRuntimeEvidenceResult> {
  if (store == null) {
    return { evidence: {}, errors: [] };
  }
  const loaded = await store.load();
  if (loaded.recovered || loaded.errors.length > 0) {
    const errors = loaded.errors.length > 0 ? loaded.errors : ["Runtime state recovered without diagnostic details."];
    return {
      evidence: { activeRun: { runId: "runtime-recovery-conflict", taskIds: [], sessionIDs: [], blockers: true, mrWait: false, locksValid: false } },
      errors,
    };
  }
  const snapshot = loaded.snapshot;
  const activeRuns = Object.values(snapshot.runs).filter((run) => isActiveAutopilotRuntimeStatus(run.status));
  const workerSessions = activeRuns.flatMap((run) => {
    if (run.workerSessionId == null) {
      return [];
    }
    const reportId = pendingWorkerReportIds.get(run.workerSessionId) ?? run.expectedReportId;
    return [{
      sessionID: run.workerSessionId,
      taskId: run.taskId,
      reportId,
      status: run.status === "running" ? "busy" as const : "idle" as const,
      reportConsumed: snapshot.consumedWorkerReportIds.includes(reportId),
    }];
  });
  return {
    evidence: {
      workerSessions,
      activeRun: activeRuns[0] == null ? undefined : {
        runId: activeRuns[0].runId,
        taskIds: activeRuns.map((run) => run.taskId),
        sessionIDs: activeRuns.flatMap((run) => run.workerSessionId == null ? [] : [run.workerSessionId]),
        blockers: activeRuns.some((run) => (run.blockers ?? []).length > 0),
        mrWait: activeRuns.some((run) => run.status === "waiting_mr"),
        locksValid: true,
      },
    },
    errors: [],
  };
}

function triggerOptions(options: AutopilotPluginOptions): ReturnType<typeof parseAutopilotTriggerOptions> {
  return parseAutopilotTriggerOptions(options.triggers);
}

function resolveWorkerDispatchOptions(options: AutopilotPluginOptions): WorkerDispatchOptionResolution {
  const raw = options.workerDispatch;
  if (raw == null) {
    return { enabled: false, diagnostics: [] };
  }
  if (!isRecord(raw)) {
    return { enabled: false, diagnostics: ["workerDispatch must be an object with optional boolean enabled field."] };
  }
  const diagnostics: string[] = [];
  for (const key of Object.keys(raw)) {
    if (key !== "enabled") {
      diagnostics.push(`workerDispatch.${key} is unsupported by this bundle.`);
    }
  }
  if (raw.enabled == null) {
    return { enabled: false, diagnostics };
  }
  if (typeof raw.enabled !== "boolean") {
    diagnostics.push("workerDispatch.enabled must be boolean true or false.");
    return { enabled: false, diagnostics };
  }
  return { enabled: diagnostics.length === 0 && raw.enabled, diagnostics };
}

function runtimeStatePath(root: string): string {
  return path.join(root, ".autopilot", "runtime", "state.json");
}

async function log(ctx: LogContext, level: "debug" | "info" | "warn" | "error", message: string, extra: Record<string, unknown>): Promise<void> {
  await ctx.client?.app?.log?.({
    body: {
      service: "openspec-autopilot",
      level,
      message,
      extra,
    },
  });
}

function loggableJob(job: AutopilotTriggerJob, key: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key,
    jobKind: job.kind,
    sourceEvent: job.sourceEvent,
    sourceID: job.sourceID,
    scope: job.scope,
    claimCapable: job.claimCapable,
    requiresRuntimeOwnership: job.requiresRuntimeOwnership,
    ...extra,
  };
}

function outputTaskIds(items: unknown[]): string[] {
  return items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = optionalString(item.taskId ?? item.runId);
    return id == null ? [] : [id];
  });
}

function intakeLedgerRoot(options: AutopilotOptions): string {
  const raw = optionalNonEmptyString(options.ledgerRoot) ?? "openspec/changes";
  const normalized = raw.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error("Autopilot ledgerRoot must be a safe relative repository path.");
  }
  return normalized;
}

function promptIntakeQueue(root: string, options: AutopilotOptions): { queue: Array<{ id: string; sourceKind: "ledger" | "active-change"; changeId?: string }>; changeIds: string[]; taskIds: string[]; taskChangeIds: Record<string, string> } {
  const summaries = [
    ...readLedgerSummaries(root, options),
    ...readActiveChangeSummaries(root, intakeLedgerRoot(options)),
  ];
  const taskChangeIds: Record<string, string> = {};
  const queue = summaries.map((ledger) => {
    const changeId = changeIdForLedgerPath(ledger);
    if (ledger.sourceKind === "ledger" && changeId != null) {
      taskChangeIds[ledger.id] = changeId;
    }
    return { id: ledger.id, sourceKind: ledger.sourceKind, ...(changeId == null ? {} : { changeId }) };
  });
  return {
    queue,
    changeIds: Array.from(new Set(queue.flatMap((item) => item.changeId == null ? item.sourceKind === "active-change" ? [item.id] : [] : [item.changeId]))).sort(),
    taskIds: Array.from(new Set(queue.filter((item) => item.sourceKind === "ledger").map((item) => item.id))).sort(),
    taskChangeIds,
  };
}

function rememberRunNextOutput(runtimeState: unknown, payload: unknown): void {
  if (isRecord(runtimeState) && isRecord(runtimeState.activeRun) && isRecord(payload)) {
    runtimeState.activeRun.lastRunNextOutput = payload;
  }
}

function activeOwnershipTaskIds(runtimeState: unknown): string[] | undefined {
  if (!isRecord(runtimeState) || !isRecord(runtimeState.activeRun)) {
    return undefined;
  }
  return stringArray(runtimeState.activeRun.taskIds);
}

function scopeContains(expected: AutopilotTriggerJob["scope"], actual: AutopilotTriggerJob["scope"]): boolean {
  for (const [key, value] of Object.entries(expected ?? {})) {
    if (typeof value === "string" && value.length > 0 && actual?.[key as keyof typeof actual] !== value) {
      return false;
    }
  }
  return true;
}

function collectJobStillValid(job: AutopilotTriggerJob, evidence: AutopilotTriggerRuntimeEvidence): boolean {
  const sessionID = job.scope?.sessionID ?? job.sourceID;
  const worker = evidence.workerSessions?.find((candidate) => candidate.sessionID === sessionID);
  return worker != null
    && worker.taskId === job.scope?.taskId
    && worker.reportConsumed !== true
    && (worker.status === "idle" || job.sourceEvent === "session.status")
    && (job.scope?.reportId == null || worker.reportId === job.scope.reportId);
}

function revalidationEvent(job: AutopilotTriggerJob): AutopilotBusEvent | null {
  switch (job.sourceEvent) {
    case "session.status":
      return { type: "session.status", properties: { sessionID: job.scope?.sessionID ?? job.sourceID, status: { type: "idle" } } };
    case "question.replied":
      return { type: "question.replied", properties: { requestID: job.scope?.requestID ?? job.sourceID, selectedLabel: job.blockerAnswer?.selectedLabel, action: job.blockerAnswer?.action } };
    case "question.rejected":
      return { type: "question.rejected", properties: { requestID: job.scope?.requestID ?? job.sourceID } };
    case "permission.replied":
      return { type: "permission.replied", properties: { requestID: job.scope?.requestID ?? job.sourceID, reply: "revalidate" } };
    case "workspace.ready":
    case "workspace.failed":
      return { type: job.sourceEvent, properties: { name: job.scope?.workspaceName ?? job.sourceID } };
    case "worktree.ready":
    case "worktree.failed":
      return { type: job.sourceEvent, properties: { name: job.scope?.worktreeName ?? job.sourceID } };
    default:
      return null;
  }
}

function decisionContainsEquivalentJob(job: AutopilotTriggerJob, decision: AutopilotTriggerDecision): boolean {
  if (job.kind === "answer_blocker" && job.blockerAnswer?.questionId == null) {
    return false;
  }
  return decision.action === "scheduled" && decision.jobs.some((candidate) => candidate.kind === job.kind
    && scopeContains(job.scope, candidate.scope)
    && (job.blockerAnswer?.questionId == null || candidate.blockerAnswer?.questionId === job.blockerAnswer.questionId));
}

function runtimeJobStillValid(job: AutopilotTriggerJob, options: ReturnType<typeof parseAutopilotTriggerOptions>, evidence: AutopilotTriggerRuntimeEvidence): boolean {
  if (!job.requiresRuntimeOwnership && !job.claimCapable) {
    return true;
  }
  if (job.kind === "collect") {
    return collectJobStillValid(job, evidence);
  }
  const event = revalidationEvent(job);
  return event != null && decisionContainsEquivalentJob(job, classifyAutopilotEvent(event, options, evidence));
}

export default {
  id: "openspec.autopilot",
  server: async (ctx, options?: AutopilotPluginOptions) => {
    const resolvedOptions = options ?? {};
    const root = repoRoot(ctx);
    const workerDispatch = resolveWorkerDispatchOptions(resolvedOptions);
    const resolvedTriggerOptions = triggerOptions(resolvedOptions);
    const writeGateNeedsRuntimeStore = resolvedTriggerOptions.writeGate?.activeLock?.enabled !== false;
    const runtimeStore = resolvedOptions.runtimeStore ?? (workerDispatch.enabled || writeGateNeedsRuntimeStore ? createFileAutopilotRuntimeStore(runtimeStatePath(root)) : undefined);
    const controllerFor = (parentSessionId?: string) => createAutopilotController({ root }, {
      ...resolvedOptions,
      runtimeStore,
      workerDispatch: { enabled: workerDispatch.enabled, diagnostics: workerDispatch.diagnostics },
      workerSessionAdapter: resolvedOptions.workerSessionAdapter ?? (workerDispatch.enabled
        ? createOpenCodeWorkerSessionAdapter({ client: ctx.client, parentSessionId, directory: ctx.directory, worktree: ctx.worktree })
        : undefined),
    });
    const controller = controllerFor();
    const pendingWorkerReportIds = new Map<string, string>();
    void log(ctx, "debug", "trigger config resolved", {
      triggerMode: resolvedTriggerOptions.triggerMode,
      fileWatch: resolvedTriggerOptions.fileWatch?.enabled,
      postToolCheckpoints: resolvedTriggerOptions.postToolCheckpoints?.enabled,
      workerCollect: resolvedTriggerOptions.workerCollect?.enabled,
      blockerReplies: resolvedTriggerOptions.blockerReplies?.enabled,
      permissionReplies: resolvedTriggerOptions.permissionReplies?.enabled,
      protectedPathGuard: resolvedTriggerOptions.protectedPathGuard?.enabled,
      writeGateActiveLock: resolvedTriggerOptions.writeGate?.activeLock?.enabled,
      runNextEvents: resolvedTriggerOptions.runNextEvents?.enabled,
    });
    if (workerDispatch.diagnostics.length > 0) {
      void log(ctx, "warn", "workerDispatch option diagnostics", {
        enabled: workerDispatch.enabled,
        diagnostics: workerDispatch.diagnostics,
      });
    }
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    async function mergedDurableEvidence(): Promise<AutopilotTriggerRuntimeEvidence> {
      const durable = await durableRuntimeEvidence(runtimeStore, pendingWorkerReportIds);
      if (durable.errors.length > 0) {
        await log(ctx, "warn", "durable runtime evidence recovery conflict", { errors: durable.errors });
      }
      return mergeRuntimeEvidence(runtimeEvidence(resolvedOptions.runtimeState, pendingWorkerReportIds), durable.evidence);
    }

    const scheduler = createAutopilotTriggerScheduler({
      execute: async (execution: AutopilotTriggerExecution) => {
        const job = execution.job;
        try {
          const currentEvidence = await mergedDurableEvidence();
          if (!runtimeJobStillValid(job, resolvedTriggerOptions, currentEvidence)) {
            await log(ctx, "warn", "trigger job suppressed", loggableJob(job, execution.key, {
              coalescedCount: execution.coalescedCount,
              reason: "runtime ownership evidence became stale before execution",
            }));
            return;
          }
          const source = { kind: "programmatic-trigger" as const, name: job.kind, eventType: job.sourceEvent };
          let result: Awaited<ReturnType<typeof controller.status>>;
          switch (job.kind) {
            case "check": {
              const check = runAutopilotCheck(root, { level: "cheap", change: job.scope?.changeId });
              await log(ctx, "info", "trigger job completed", loggableJob(job, execution.key, {
                coalescedCount: execution.coalescedCount,
                checkStatus: check.status,
                exitCode: check.exitCode,
                changes: check.scope.changes.length,
                ledgers: check.scope.ledgers.length,
              }));
              return;
            }
            case "status":
              result = await controller.status({ changeId: job.scope?.changeId }, source);
              break;
            case "collect":
              result = await controller.collect({ taskId: job.scope?.taskId }, source);
              break;
            case "answer_blocker":
              if (job.blockerAnswer?.questionId == null) {
                throw new Error("Malformed answer_blocker trigger job is missing blockerAnswer.questionId.");
              }
              result = await controller.answerBlocker({
                questionId: job.blockerAnswer.questionId,
                taskId: job.blockerAnswer.taskId,
                selectedLabel: job.blockerAnswer.selectedLabel,
                action: job.blockerAnswer.action,
              }, source);
              break;
            case "stop":
              result = await controller.stop({
                target: job.scope?.taskId != null ? "task" : job.scope?.runId != null ? "run" : "all",
                id: job.scope?.taskId ?? job.scope?.runId,
                reason: job.reason,
              }, source);
              break;
            case "run_next":
              result = await controller.runNext({ changeId: job.scope?.changeId, taskId: job.scope?.taskId }, source);
              break;
            default: {
              const unreachable: never = job.kind;
              throw new Error(`Unsupported Autopilot trigger job kind: ${String(unreachable)}`);
            }
          }

          await log(ctx, "info", "trigger job completed", loggableJob(job, execution.key, {
            coalescedCount: execution.coalescedCount,
            outcome: result.payload.outcome,
            reasonCode: result.payload.reasonCode,
            taskSummaries: result.payload.taskSummaries.length,
            taskSummaryIds: outputTaskIds(result.payload.taskSummaries),
            tasksStarted: outputTaskIds(result.payload.tasksStarted),
            tasksAdvanced: outputTaskIds(result.payload.tasksAdvanced),
          }));
          if (job.kind === "run_next") {
            rememberRunNextOutput(resolvedOptions.runtimeState, result.payload);
          }
          if (job.kind === "collect" && result.payload.reasonCode === "advanced" && job.scope?.sessionID != null) {
            pendingWorkerReportIds.delete(job.scope.sessionID);
          }
        } catch (error) {
          await log(ctx, "error", "trigger job failed", loggableJob(job, execution.key, {
            error: error instanceof Error ? error.message : String(error),
          }));
          throw error;
        }
      },
    });

    function scheduleFlush(result: AutopilotTriggerEnqueueResult): void {
      if (result.dueAt == null || result.status !== "scheduled" && result.status !== "coalesced") {
        return;
      }
      const existing = timers.get(result.key);
      if (existing != null) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        timers.delete(result.key);
        scheduler.flushDue(result.dueAt).catch((error: unknown) => {
          void log(ctx, "error", "trigger scheduler flush failed", { error: error instanceof Error ? error.message : String(error) });
        });
      }, Math.max(0, result.dueAt - Date.now()));
      timer.unref?.();
      timers.set(result.key, timer);
    }

    async function enqueueDecision(decision: AutopilotTriggerDecision): Promise<void> {
      if (decision.action === "ignored") {
        await log(ctx, "debug", "trigger ignored", { reason: decision.reason });
        return;
      }
      for (const job of decision.jobs) {
        const result = scheduler.enqueue(job);
        const message = result.status === "scheduled" || result.status === "coalesced" ? "trigger job enqueued" : "trigger job suppressed";
        await log(ctx, "debug", message, loggableJob(job, result.key, { enqueueStatus: result.status, reason: result.reason }));
        scheduleFlush(result);
      }
    }

    function disposeScheduler(): void {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      scheduler.dispose();
    }

    return {
      event: async ({ event }: { event: AutopilotBusEvent }) => {
        if (event.type === "server.instance.disposed" || event.type === "global.disposed") {
          disposeScheduler();
          return;
        }
        const marker = completeAutopilotWorkerReportMarker(event);
        if (marker != null) {
          pendingWorkerReportIds.set(marker.sessionID, marker.reportId);
        }
        await enqueueDecision(classifyAutopilotEvent(event, resolvedTriggerOptions, await mergedDurableEvidence()));
      },
      "tool.execute.before": async (input: { tool: string; sessionID?: string }, output: { args: unknown }) => {
        const protectedPathGuardEnabled = resolvedTriggerOptions.protectedPathGuard?.enabled !== false;
        const activeLockEnabled = resolvedTriggerOptions.writeGate?.activeLock?.enabled !== false;
        const runtimeStateActiveOwnershipTaskIds = activeOwnershipTaskIds(resolvedOptions.runtimeState);
        if (!protectedPathGuardEnabled && !activeLockEnabled && runtimeStore == null && runtimeStateActiveOwnershipTaskIds == null) {
          return;
        }
        const loadedRuntime = runtimeStore == null ? null : await runtimeStore.load();
        const decision = decideAutopilotWriteGate(input.tool, output.args, {
          sessionID: input.sessionID,
          runtime: loadedRuntime,
          protectedPathGuardEnabled,
          activeLockEnabled,
          activeOwnershipTaskIds: runtimeStateActiveOwnershipTaskIds,
        });
        if (decision.action === "block") {
          await log(ctx, "warn", "autopilot write gate mutation blocked", { tool: input.tool, sessionID: input.sessionID, paths: decision.paths, reason: decision.reason, runtimeErrors: loadedRuntime?.errors });
          throw new Error(`${decision.reason}: ${decision.paths.join(", ")}. Protected Autopilot state and active write ownership must be mutated only by plugin-owned controller paths or active scoped workers.`);
        }
      },
      "tool.execute.after": async (input: AutopilotToolExecutionInput, output: unknown) => {
        await enqueueDecision(classifyAutopilotToolExecutionAfter(input, output, resolvedTriggerOptions));
      },
      tool: {
        autopilot_run_next: tool({
          description:
            "Continue OpenSpec Autopilot as far as safely possible until blocker, MR wait, idle state, or runtime limit; may dispatch one worker when workerDispatch.enabled is true and worker-session capability is available, otherwise safe deferred output remains possible. The plugin is authoritative for process/state transitions.",
          args: {
            changeId: tool.schema.string().optional().describe("Optional OpenSpec change id to prefer."),
            taskId: tool.schema.string().optional().describe("Optional task id to prefer."),
          },
          async execute(args, toolCtx?: { sessionID?: string }) {
            return toPluginToolOutput(await controllerFor(toolCtx?.sessionID).runNext({ changeId: args.changeId, taskId: args.taskId }, { kind: "model-tool", name: "autopilot_run_next" }));
          },
        }),
        autopilot_status: tool({
          description: "Return concise OpenSpec Autopilot status for task ledgers, blockers, MRs, and plugin-owned active worker/run state.",
          args: {
            changeId: tool.schema.string().optional().describe("Optional OpenSpec change id to inspect."),
          },
          async execute(args, toolCtx?: { sessionID?: string }) {
            return toPluginToolOutput(await controllerFor(toolCtx?.sessionID).status({ changeId: args.changeId }, { kind: "model-tool", name: "autopilot_status" }));
          },
        }),
        autopilot_collect: tool({
          description: "Collect plugin-owned worker reports and apply legal plugin-owned runtime or protected-ledger advancement when report evidence validates.",
          args: {
            taskId: tool.schema.string().optional().describe("Optional task id to collect."),
          },
          async execute(args, toolCtx?: { sessionID?: string }) {
            return toPluginToolOutput(await controllerFor(toolCtx?.sessionID).collect({ taskId: args.taskId }, { kind: "model-tool", name: "autopilot_collect" }));
          },
        }),
        autopilot_answer_blocker: tool({
          description: "Validate a selected user answer envelope for a pending plugin-owned autopilot blocker question. MVP does not mutate state yet.",
          args: {
            questionId: tool.schema.string().describe("Blocker question id."),
            taskId: tool.schema.string().optional().describe("Related task id."),
            selectedLabel: tool.schema.string().optional().describe("Selected option label."),
            action: tool.schema.string().optional().describe("Selected blocker action."),
          },
          async execute(args, toolCtx?: { sessionID?: string }) {
            return toPluginToolOutput(await controllerFor(toolCtx?.sessionID).answerBlocker(args, { kind: "model-tool", name: "autopilot_answer_blocker" }));
          },
        }),
        autopilot_stop: tool({
          description: "Acknowledge a pause or cancel request for an autopilot run/task and report whether plugin-owned active runtime state changed.",
          args: {
            target: tool.schema.string().optional().describe("run, task, or all."),
            id: tool.schema.string().optional().describe("Run id or task id."),
            reason: tool.schema.string().optional().describe("Reason for pause or cancel."),
          },
          async execute(args, toolCtx?: { sessionID?: string }) {
            return toPluginToolOutput(await controllerFor(toolCtx?.sessionID).stop(args, { kind: "model-tool", name: "autopilot_stop" }));
          },
        }),
        autopilot_intake: tool({
          description: "Classify /autopilot arguments read-only before any claim-capable action; returns derived scope/workflow/queue guidance without echoing raw prompt text.",
          args: {
            argumentsText: tool.schema.string().optional().describe("Optional raw /autopilot argument string; output does not echo it."),
          },
          async execute(args) {
            const queue = promptIntakeQueue(root, resolvedOptions);
            const plan = planAutopilotPromptIntake({
              argumentsText: args.argumentsText,
              existingQueue: queue.queue,
              knownChangeIds: queue.changeIds,
              knownTaskIds: queue.taskIds,
              taskChangeIds: queue.taskChangeIds,
              availableTools: ["autopilot_run_next", "autopilot_status"],
            });
            return {
              output: JSON.stringify({ schemaVersion: 1, ...plan }, null, 2),
              metadata: { service: "openspec-autopilot", argumentContext: { acknowledged: ["argumentsText"], ignored: [], mutation: "none" } },
            };
          },
        }),
      },
    };
  },
} satisfies { id: string; server: Plugin };
