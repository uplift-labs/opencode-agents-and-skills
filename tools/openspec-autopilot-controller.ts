import { applyStopToRuntimeState, dependenciesSatisfied } from "./openspec-autopilot-runtime.ts";
import { resolveAutopilotPhaseDispatch } from "./autopilot-phase-dispatcher.ts";
import { applyAutopilotLedgerTransition } from "./autopilot-ledger-transition-writer.ts";
import { type AutopilotRunRecord, type AutopilotRuntimeSnapshot, type AutopilotRuntimeStoreLoadResult } from "./autopilot-runtime-store.ts";
import { parseAutopilotWorkerReportEnvelope, type AutopilotParsedWorkerReport } from "./autopilot-worker-report-parser.ts";
import { buildAutopilotWorkerPrompt } from "./autopilot-worker-prompt-builder.ts";
import { autopilotTaskStatuses, autopilotTaskTypes, type AutopilotTaskStatus, type AutopilotTaskType } from "./autopilot-contract.ts";
import {
  createAnswerBlockerOutput,
  createCollectOutput,
  createRunNextOutput,
  createStatusOutput,
  createStopOutput,
  readAutopilotQueueSummaries,
  readLedgerSummaries,
  validateBlockerAnswer,
  type AutopilotOptions,
  type AutopilotOutput,
  type AutopilotSelection,
  type LedgerSummary,
} from "./openspec-autopilot-output.ts";
import { createLedgerMaterializationBlockedOutput, createLedgerMaterializedOutput } from "./openspec-autopilot-materialization-output.ts";
import { materializeActiveChangeLedger } from "./openspec-autopilot-materializer.ts";

export type AutopilotScope = {
  changeId?: string;
  taskId?: string;
};

export type TriggerSource = {
  kind: "model-tool" | "programmatic-trigger" | "tui-command";
  name?: string;
  eventType?: string;
};

export type BlockerAnswerArgs = {
  questionId: string;
  taskId?: string;
  selectedLabel?: string;
  action?: string;
};

export type StopArgs = {
  target?: string;
  id?: string;
  reason?: string;
};

export type AutopilotControllerResult = {
  payload: AutopilotOutput;
  metadata: Record<string, unknown>;
};

export type AutopilotController = {
  runNext(scope: AutopilotScope, source?: TriggerSource): Promise<AutopilotControllerResult>;
  status(scope: Pick<AutopilotScope, "changeId">, source?: TriggerSource): Promise<AutopilotControllerResult>;
  collect(scope: Pick<AutopilotScope, "taskId">, source?: TriggerSource): Promise<AutopilotControllerResult>;
  answerBlocker(args: BlockerAnswerArgs, source?: TriggerSource): Promise<AutopilotControllerResult>;
  stop(args: StopArgs, source?: TriggerSource): Promise<AutopilotControllerResult>;
};

type ControllerContext = {
  root: string;
};

const activeRuntimeStatuses = new Set(["claiming", "dispatching", "running", "collecting", "blocked", "waiting_mr"]);
const collectClaimableRuntimeStatuses = new Set(["claiming", "dispatching", "running"]);
const taskTypeSet = new Set<string>(autopilotTaskTypes);
const taskStatusSet = new Set<string>(autopilotTaskStatuses);

function sourceMetadata(source: TriggerSource | undefined): Record<string, unknown> {
  if (source == null || source.kind === "model-tool") {
    return {};
  }
  return {
    triggerSource: Object.fromEntries(Object.entries({
      kind: source.kind,
      name: source.name,
      eventType: source.eventType,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)),
  };
}

function optionalNonEmptyString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function result(payload: AutopilotOutput, metadata: Record<string, unknown> = {}, source?: TriggerSource): AutopilotControllerResult {
  return {
    payload,
    metadata: {
      ...metadata,
      ...sourceMetadata(source),
      service: "openspec-autopilot",
      outcome: payload.outcome,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function asTaskType(value: string): AutopilotTaskType | null {
  return taskTypeSet.has(value) ? value as AutopilotTaskType : null;
}

function asTaskStatus(value: string): AutopilotTaskStatus | null {
  return taskStatusSet.has(value) ? value as AutopilotTaskStatus : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function ledgerScope(ledger: LedgerSummary): { read: string[]; write: string[]; forbidden: string[] } {
  const scope = isRecord(ledger.ledger?.scope) ? ledger.ledger.scope : {};
  return {
    read: stringArray(scope.read),
    write: stringArray(scope.write).length > 0 ? stringArray(scope.write) : ledger.writeScope,
    forbidden: stringArray(scope.forbidden).length > 0 ? stringArray(scope.forbidden) : ledger.forbiddenScope,
  };
}

function ledgerRevision(ledger: LedgerSummary): AutopilotRunRecord["ledgerRevision"] {
  const revision = isRecord(ledger.ledger?.revision) ? ledger.ledger.revision : undefined;
  if (revision == null) {
    return undefined;
  }
  return Object.fromEntries(Object.entries({
    number: typeof revision.number === "number" ? revision.number : undefined,
    contentHash: typeof revision.contentHash === "string" && revision.contentHash.trim().length > 0 ? revision.contentHash : undefined,
  }).filter((entry): entry is [string, string | number] => entry[1] != null));
}

function runRecordRevisionKey(ledger: LedgerSummary): string {
  const revision = ledgerRevision(ledger);
  return typeof revision?.number === "number" ? `r${revision.number}` : "r0";
}

function uniqueRunId(baseRunId: string, snapshot: AutopilotRuntimeSnapshot): string {
  if (snapshot.runs[baseRunId] == null) {
    return baseRunId;
  }
  for (let index = 2; index < 1000; index++) {
    const candidate = `${baseRunId}-${index}`;
    if (snapshot.runs[candidate] == null) {
      return candidate;
    }
  }
  throw new Error(`Unable to allocate unique Autopilot run id for ${baseRunId}.`);
}

function safeId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "task";
}

function timestampId(value: string): string {
  return value.replace(/[^0-9A-Za-z]+/g, "").slice(0, 14) || "time";
}

function activeRuns(snapshot: AutopilotRuntimeSnapshot): AutopilotRunRecord[] {
  return Object.values(snapshot.runs)
    .filter((run) => activeRuntimeStatuses.has(run.status))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.runId.localeCompare(right.runId));
}

function collectClaimableRuns(snapshot: AutopilotRuntimeSnapshot): AutopilotRunRecord[] {
  return Object.values(snapshot.runs)
    .filter((run) => collectClaimableRuntimeStatuses.has(run.status))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.runId.localeCompare(right.runId));
}

function runtimeStateFromSnapshot(snapshot: AutopilotRuntimeSnapshot): Record<string, unknown> {
  const active = activeRuns(snapshot);
  const first = active[0];
  const recentRuns = Object.values(snapshot.runs)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.runId.localeCompare(right.runId))
    .map((run) => ({
      runId: run.runId,
      taskId: run.taskId,
      status: run.status,
      sessionIDs: run.workerSessionId == null ? [] : [run.workerSessionId],
      reportId: run.expectedReportId,
      reportConsumed: snapshot.consumedWorkerReportIds.includes(run.expectedReportId),
      blockers: (run.blockers ?? []).length > 0,
      mrStatus: run.mr?.status,
    }));
  return {
    consumedWorkerReportIds: snapshot.consumedWorkerReportIds,
    recentRuns,
    workerSessions: active.flatMap((run) => run.workerSessionId == null ? [] : [{
      sessionID: run.workerSessionId,
      taskId: run.taskId,
      reportId: run.expectedReportId,
      status: run.status === "running" ? "busy" : "idle",
      reportConsumed: snapshot.consumedWorkerReportIds.includes(run.expectedReportId),
    }]),
    ...(first == null ? {} : {
      activeRun: {
        runId: first.runId,
        taskIds: active.map((run) => run.taskId),
        sessionIDs: active.flatMap((run) => run.workerSessionId == null ? [] : [run.workerSessionId]),
        locksValid: true,
        blockers: active.some((run) => (run.blockers ?? []).length > 0),
        mrWait: active.some((run) => run.status === "waiting_mr"),
      },
    }),
  };
}

function outputWithRuntimeState(output: AutopilotOutput, runtimeState: Record<string, unknown>): AutopilotOutput {
  if (!isRecord((output as Record<string, unknown>).status)) {
    return output;
  }
  return {
    ...output,
    status: {
      ...(output as { status: Record<string, unknown> }).status,
      ...Object.fromEntries(Object.entries({
        activeRun: runtimeState.activeRun,
        workerSessions: runtimeState.workerSessions,
        recentRuns: runtimeState.recentRuns,
      }).filter((entry): entry is [string, unknown] => entry[1] != null)),
    },
  };
}

function runtimeConflictOutput(base: AutopilotOutput, blocker: { taskId?: string; path?: string; reason: string; errors?: string[] }, summary: string, equivalentCall = "autopilot_collect"): AutopilotOutput {
  return {
    ...base,
    outcome: "failed",
    reasonCode: "runtime_evidence_conflict",
    summary,
    tasksStarted: [],
    tasksAdvanced: [],
    blockers: [blocker],
    loopGuard: { repeatedNoProgress: true, equivalentCall, suppressRepeatRecommendation: true },
  };
}

function runtimeLoadHasConflict(loaded: AutopilotRuntimeStoreLoadResult): boolean {
  return loaded.recovered || loaded.errors.length > 0;
}

function runtimeRecoveryConflictOutput(base: AutopilotOutput, loaded: AutopilotRuntimeStoreLoadResult, equivalentCall: string): AutopilotOutput {
  const errors = loaded.errors.length > 0 ? loaded.errors : ["Runtime state recovered without diagnostic details."];
  return runtimeConflictOutput(
    base,
    { reason: `Autopilot runtime state recovery failed: ${errors.join("; ")}`, errors },
    "Autopilot found invalid durable runtime evidence and stopped before dispatch, collect, or protected ledger mutation.",
    equivalentCall,
  );
}

function runtimeStatusAfterReport(report: AutopilotParsedWorkerReport): AutopilotRunRecord["status"] {
  if (report.blockers.length > 0) {
    return "blocked";
  }
  if (report.mr.status === "created" || report.mr.status === "updated" || report.mr.status === "waiting-review") {
    return "waiting_mr";
  }
  return "done";
}

function selectedLedger(ledgers: LedgerSummary[], output: AutopilotOutput): LedgerSummary | null {
  const selected = output.selection.candidates.find((candidate) => candidate.selected);
  if (selected == null) {
    return null;
  }
  return ledgers.find((ledger) => ledger.id === selected.taskId && ledger.path === selected.path) ?? null;
}

type DispatchCandidate = {
  ledger: LedgerSummary;
  decision: Extract<ReturnType<typeof resolveAutopilotPhaseDispatch>, { action: "dispatch" }>;
  selection: AutopilotSelection;
};

function priorityRank(priority: string): number {
  const rank = ["critical", "high", "medium", "low"].indexOf(priority.trim().toLowerCase());
  return rank >= 0 ? rank : 4;
}

function dispatchDecisionForLedger(ledger: LedgerSummary): DispatchCandidate["decision"] | null {
  if (!ledger.valid || ledger.sourceKind !== "ledger") {
    return null;
  }
  const taskType = asTaskType(ledger.taskType);
  const status = asTaskStatus(ledger.status);
  if (taskType == null || status == null) {
    return null;
  }
  const decision = resolveAutopilotPhaseDispatch({
    taskId: ledger.id,
    taskType,
    status,
    mrStatus: ledger.mr?.status === "none" || ledger.mr?.status === "created" || ledger.mr?.status === "updated" || ledger.mr?.status === "waiting-review" || ledger.mr?.status === "merged" || ledger.mr?.status === "not-required" ? ledger.mr.status : undefined,
    blockers: ledger.blockers.flatMap((blocker) => typeof blocker.reason === "string" ? [{ reason: blocker.reason, questionId: typeof blocker.questionId === "string" ? blocker.questionId : undefined }] : []),
    phaseEvidence: isRecord(ledger.ledger?.phaseEvidence) ? ledger.ledger.phaseEvidence : {},
  });
  return decision.action === "dispatch" ? decision : null;
}

function selectionForDispatchCandidate(ledgers: LedgerSummary[], selectedLedger: LedgerSummary): AutopilotSelection {
  const candidates = ledgers
    .filter((ledger) => dispatchDecisionForLedger(ledger) != null)
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id) || left.path.localeCompare(right.path))
    .map((ledger, index) => ({
      taskId: ledger.id,
      path: ledger.path,
      rank: index + 1,
      selected: ledger.id === selectedLedger.id && ledger.path === selectedLedger.path,
      selectionReason: ledger.id === selectedLedger.id && ledger.path === selectedLedger.path ? "selected_primary" as const : "serial_default" as const,
      parallelDecision: "not_evaluated" as const,
    }));
  return {
    mode: "serial_default",
    selectedTaskId: selectedLedger.id,
    maxImplementationClaims: 1,
    candidates,
  };
}

function dispatchCandidateFor(ledgers: LedgerSummary[], output: AutopilotOutput): DispatchCandidate | null {
  const outputSelected = selectedLedger(ledgers, output);
  if (outputSelected != null) {
    if (!dependenciesSatisfied(outputSelected, ledgers)) {
      return null;
    }
    const decision = dispatchDecisionForLedger(outputSelected);
    return decision == null ? null : { ledger: outputSelected, decision, selection: output.selection };
  }
  const sorted = ledgers
    .slice()
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id) || left.path.localeCompare(right.path));
  for (const ledger of sorted) {
    if (!dependenciesSatisfied(ledger, ledgers)) {
      continue;
    }
    const decision = dispatchDecisionForLedger(ledger);
    if (decision != null) {
      return { ledger, decision, selection: selectionForDispatchCandidate(sorted, ledger) };
    }
  }
  return null;
}

async function maybeDispatchWorker(ledgers: LedgerSummary[], output: AutopilotOutput, options: AutopilotOptions): Promise<AutopilotOutput | null> {
  if (options.workerDispatch?.enabled !== true) {
    return null;
  }
  if (output.reasonCode !== "ready_runtime_deferred" && output.reasonCode !== "no_actionable_tasks") {
    return null;
  }
  if (options.runtimeStore == null || options.workerSessionAdapter == null) {
    return {
      ...output,
      summary: `${output.summary} Worker dispatch is enabled but runtimeStore or workerSessionAdapter is unavailable.`,
    };
  }

  const candidate = dispatchCandidateFor(ledgers, output);
  if (candidate == null) {
    return null;
  }

  const capability = await options.workerSessionAdapter.capability();
  if (!capability.available) {
    return {
      ...output,
      summary: `${output.summary} Worker dispatch capability unavailable: ${capability.reason ?? "unknown reason"}`,
    };
  }

  const { ledger, decision, selection } = candidate;

  const now = options.now?.() ?? new Date().toISOString();
  const idBase = `${safeId(ledger.id)}-${runRecordRevisionKey(ledger)}-${timestampId(now)}`;
  let claimedRun: AutopilotRunRecord | null = null;
  let activeWorkerId: string | null = null;
  await options.runtimeStore.save((draft) => {
    const active = activeRuns(draft);
    if (active.length > 0) {
      activeWorkerId = active[0]?.workerId ?? "unknown";
      return;
    }
    const runId = uniqueRunId(`autopilot-${idBase}`, draft);
    const workerId = `${runId}-worker-1`;
    const reportId = `${runId}-report-1`;
    claimedRun = {
      runId,
      status: "dispatching",
      createdAt: now,
      updatedAt: now,
      taskId: ledger.id,
      ledgerPath: ledger.path,
      fromStatus: decision.fromStatus,
      expectedToStatus: decision.toStatus,
      expectedReportId: reportId,
      workerId,
      ledgerRevision: ledgerRevision(ledger),
      scope: ledgerScope(ledger),
    };
    draft.runs[runId] = claimedRun;
  });
  if (activeWorkerId != null) {
    return {
      ...output,
      outcome: "idle",
      reasonCode: "no_actionable_tasks",
      tasksStarted: [],
      summary: `Autopilot has active serial worker ${activeWorkerId}; collect, status, stop, or wait before claiming another task.`,
      loopGuard: { repeatedNoProgress: true, equivalentCall: "autopilot_run_next", suppressRepeatRecommendation: true },
    };
  }
  if (claimedRun == null) {
    return runtimeConflictOutput(output, { taskId: ledger.id, path: ledger.path, reason: "Autopilot serial claim did not produce durable run evidence." }, "Autopilot failed to record durable serial claim evidence before worker dispatch.", "autopilot_run_next");
  }
  const runId = claimedRun.runId;
  const workerId = claimedRun.workerId;
  const reportId = claimedRun.expectedReportId;

  const dispatchInput = {
    runId,
    taskId: ledger.id,
    workerId,
    reportId,
    title: `[autopilot ${safeId(ledger.id)}] ${decision.phase}`,
    metadata: { autopilotRunId: runId, taskId: ledger.id, workerId, reportId, ledgerPath: ledger.path, fromStatus: decision.fromStatus, toStatus: decision.toStatus },
    promptForSession: (sessionId) => buildAutopilotWorkerPrompt({ runId, workerId, sessionId, reportId, ledger, decision }),
  };
  const created = await options.workerSessionAdapter.createSession(dispatchInput).catch((error: unknown) => ({ ok: false as const, reason: `OpenCode worker-session create threw: ${error instanceof Error ? error.message : String(error)}` }));

  if (!created.ok) {
    await options.runtimeStore.save((draft) => {
      const run = draft.runs[runId];
      if (run != null) {
        run.status = "failed";
        run.updatedAt = options.now?.() ?? new Date().toISOString();
        run.blockers = [{ reason: created.reason }];
      }
    });
    return {
      ...output,
      outcome: "failed",
      reasonCode: "runtime_evidence_conflict",
      blockers: [{ taskId: ledger.id, path: ledger.path, reason: created.reason }],
      selection,
      summary: `Autopilot failed to create selected worker session. ${created.reason}`,
    };
  }

  await options.runtimeStore.save((draft) => {
    const run = draft.runs[runId];
    if (run != null) {
      run.status = "dispatching";
      run.updatedAt = options.now?.() ?? new Date().toISOString();
      run.workerSessionId = created.sessionId;
    }
  });

  const prompted = await options.workerSessionAdapter.promptSession({ ...dispatchInput, sessionId: created.sessionId }).catch((error: unknown) => ({ ok: false as const, reason: `OpenCode worker-session prompt threw: ${error instanceof Error ? error.message : String(error)}` }));
  if (!prompted.ok) {
    await options.runtimeStore.save((draft) => {
      const run = draft.runs[runId];
      if (run != null) {
        run.status = "failed";
        run.updatedAt = options.now?.() ?? new Date().toISOString();
        run.blockers = [{ reason: prompted.reason }];
      }
    });
    return {
      ...output,
      outcome: "failed",
      reasonCode: "runtime_evidence_conflict",
      blockers: [{ taskId: ledger.id, path: ledger.path, reason: prompted.reason }],
      selection,
      summary: `Autopilot failed to prompt selected worker session after recording scope ownership. ${prompted.reason}`,
    };
  }

  await options.runtimeStore.save((draft) => {
    const run = draft.runs[runId];
    if (run != null) {
      run.status = "running";
      run.updatedAt = options.now?.() ?? new Date().toISOString();
    }
  });

  return {
    ...output,
    outcome: "advanced",
    reasonCode: "advanced",
    summary: `Autopilot dispatched one plugin-owned worker session for selected task ${ledger.id}.`,
    tasksStarted: [{
      taskId: ledger.id,
      path: ledger.path,
      runId,
      workerId,
      workerSessionId: created.sessionId,
      reportId,
      from: decision.fromStatus,
      to: decision.toStatus,
      mutation: "plugin-owned-runtime-only",
    }],
    selection,
    loopGuard: { repeatedNoProgress: false, equivalentCall: "autopilot_run_next", suppressRepeatRecommendation: false },
  };
}

async function stopRuntimeStore(args: StopArgs, options: AutopilotOptions): Promise<Array<Record<string, unknown>>> {
  if (options.runtimeStore == null) {
    return [];
  }
  const now = options.now?.() ?? new Date().toISOString();
  const target = args.target ?? "run";
  let stoppedEntries: Array<Record<string, unknown>> = [];
  await options.runtimeStore.save((draft) => {
    const active = activeRuns(draft).filter((run) => {
      if (target === "all") {
        return true;
      }
      if (target === "task") {
        return args.id == null || run.taskId === args.id;
      }
      return args.id == null || run.runId === args.id;
    });
    stoppedEntries = active.flatMap((run) => {
      const stored = draft.runs[run.runId];
      if (stored != null) {
        stored.status = "stopped";
        stored.updatedAt = now;
        stored.stopReason = args.reason ?? "Stopped by autopilot_stop.";
      }
      if (target === "all") {
        return [
          { target: "run", runId: run.runId, action: "stopped", mutation: "plugin-owned-runtime-only" },
          { target: "task", taskId: run.taskId, runId: run.runId, action: "stopped", mutation: "plugin-owned-runtime-only" },
        ];
      }
      if (target === "task") {
        return [{ target: "task", taskId: run.taskId, runId: run.runId, action: "stopped", mutation: "plugin-owned-runtime-only" }];
      }
      return [{ target: "run", runId: run.runId, action: "stopped", mutation: "plugin-owned-runtime-only" }];
    });
  });
  return stoppedEntries;
}

async function maybeCollectWorker(root: string, scope: Pick<AutopilotScope, "taskId">, options: AutopilotOptions): Promise<AutopilotOutput | null> {
  if (options.runtimeStore == null || options.workerSessionAdapter == null) {
    return null;
  }
  const loaded = await options.runtimeStore.load();
  if (runtimeLoadHasConflict(loaded)) {
    const ledgers = readLedgerSummaries(root, options, { taskId: scope.taskId });
    const base = createCollectOutput(ledgers, { runtimeState: runtimeStateFromSnapshot(loaded.snapshot) });
    return runtimeRecoveryConflictOutput(base, loaded, "autopilot_collect");
  }
  let claimedRun: AutopilotRunRecord | null = null;
  let claimSnapshot: AutopilotRuntimeSnapshot | null = null;
  const claimTime = options.now?.() ?? new Date().toISOString();
  const claimed = await options.runtimeStore.save((draft) => {
    const candidates = collectClaimableRuns(draft).filter((run) => scope.taskId == null || run.taskId === scope.taskId);
    const run = candidates[0];
    if (run == null || draft.consumedWorkerReportIds.includes(run.expectedReportId)) {
      return;
    }
    const storedRun = draft.runs[run.runId];
    if (storedRun == null) {
      return;
    }
    storedRun.status = "collecting";
    storedRun.updatedAt = claimTime;
    claimedRun = JSON.parse(JSON.stringify(storedRun)) as AutopilotRunRecord;
  });
  claimSnapshot = claimed.snapshot;
  if (claimedRun == null || claimSnapshot == null) {
    return null;
  }
  const run = claimedRun;
  const ledgers = readLedgerSummaries(root, options, { taskId: run.taskId });
  const base = createCollectOutput(ledgers, { runtimeState: runtimeStateFromSnapshot(claimSnapshot) });
  const restoreRunning = async (reason?: string): Promise<void> => {
    await options.runtimeStore?.save((draft) => {
      const storedRun = draft.runs[run.runId];
      if (storedRun == null || storedRun.status !== "collecting") {
        return;
      }
      storedRun.status = "running";
      storedRun.updatedAt = options.now?.() ?? new Date().toISOString();
      if (reason != null) {
        storedRun.blockers = [{ reason }];
      }
    });
  };
  if (run.workerSessionId == null) {
    await restoreRunning(`active worker run ${run.runId} is missing workerSessionId evidence`);
    return runtimeConflictOutput(base, { taskId: run.taskId, path: run.ledgerPath, reason: `active worker run ${run.runId} is missing workerSessionId evidence` }, "Autopilot collect found incomplete active runtime evidence. No protected ledger state was mutated.");
  }

  const reportRead = await options.workerSessionAdapter.readFinalReport({ sessionId: run.workerSessionId, reportId: run.expectedReportId }).catch((error: unknown) => ({ ok: false as const, reason: `OpenCode worker-session report read threw: ${error instanceof Error ? error.message : String(error)}` }));
  if (!reportRead.ok) {
    await restoreRunning();
    return {
      ...base,
      summary: `Autopilot collect found active worker ${run.workerId}, but final report is not readable yet. ${reportRead.reason}`,
    };
  }

  const parsed = parseAutopilotWorkerReportEnvelope({
    text: reportRead.text,
    run,
    consumedReportIds: loaded.snapshot.consumedWorkerReportIds,
  });
  if (!parsed.ok) {
    await restoreRunning(`worker report parse failed (${parsed.reasonCode}): ${parsed.errors.join("; ")}`);
    return runtimeConflictOutput(
      base,
      { taskId: run.taskId, path: run.ledgerPath, reason: `worker report parse failed (${parsed.reasonCode}): ${parsed.errors.join("; ")}`, errors: parsed.errors },
      "Autopilot collect rejected malformed or mismatched worker report evidence. No protected ledger state was mutated.",
    );
  }

  const now = options.now?.() ?? new Date().toISOString();
  const applied = applyAutopilotLedgerTransition({ root, run, report: parsed.report, now, source: "autopilot_collect" });
  if (!applied.ok) {
    await restoreRunning(`ledger transition writer failed (${applied.reasonCode}): ${applied.errors.join("; ")}`);
    return runtimeConflictOutput(
      base,
      { taskId: run.taskId, path: run.ledgerPath, reason: `ledger transition writer failed (${applied.reasonCode}): ${applied.errors.join("; ")}`, errors: applied.errors },
      "Autopilot collect rejected worker report transition evidence. No protected ledger state was mutated.",
    );
  }

  const saved = await options.runtimeStore.save((draft) => {
    if (!draft.consumedWorkerReportIds.includes(parsed.report.reportId)) {
      draft.consumedWorkerReportIds.push(parsed.report.reportId);
      draft.consumedWorkerReportIds.sort();
    }
    const storedRun = draft.runs[run.runId];
    if (storedRun != null) {
      storedRun.status = runtimeStatusAfterReport(parsed.report);
      storedRun.updatedAt = now;
      storedRun.blockers = parsed.report.blockers;
      storedRun.mr = parsed.report.mr;
    }
  });
  const refreshedLedgers = readLedgerSummaries(root, options, { taskId: run.taskId });
  const refreshedBase = createCollectOutput(refreshedLedgers, { runtimeState: runtimeStateFromSnapshot(saved.snapshot) });
  return {
    ...refreshedBase,
    outcome: "advanced",
    reasonCode: "advanced",
    summary: `Autopilot collect applied worker report ${parsed.report.reportId} through plugin-owned ledger transition writer.`,
    tasksAdvanced: [{
      taskId: applied.taskId,
      path: applied.path,
      reportId: applied.reportId,
      from: applied.from,
      to: applied.to,
      action: applied.action,
      mutation: "plugin-owned-protected-ledger",
      ...(applied.revision == null ? {} : { revision: applied.revision }),
    }],
    blockers: [],
    loopGuard: { repeatedNoProgress: false, equivalentCall: "autopilot_collect", suppressRepeatRecommendation: false },
  };
}

function stopArgumentContext(args: StopArgs, stopApplied: boolean): { acknowledged: string[]; ignored: string[]; mutation: string } {
  const idProvided = typeof args.id === "string";
  const idAcknowledged = stopApplied && idProvided && (args.target ?? "run") !== "all";
  return {
    acknowledged: stopApplied ? ["target", ...(idAcknowledged ? ["id"] : [])] : ["target"],
    ignored: [...(idProvided && !idAcknowledged ? ["id"] : []), "reason"],
    mutation: stopApplied ? "plugin-owned-runtime-only" : "none",
  };
}

export function createAutopilotController(ctx: ControllerContext, options: AutopilotOptions = {}): AutopilotController {
  return {
    async runNext(scope: AutopilotScope = {}, source?: TriggerSource): Promise<AutopilotControllerResult> {
      const runtimeSnapshot = options.runtimeStore == null ? null : await options.runtimeStore.load();
      const runtimeState = runtimeSnapshot == null ? options.runtimeState : { ...runtimeStateFromSnapshot(runtimeSnapshot.snapshot), ...(options.runtimeState ?? {}) };
      const queue = readAutopilotQueueSummaries(ctx.root, options, { changeId: scope.changeId, taskId: scope.taskId });
      const output = createRunNextOutput(queue.ledgers, { dependencyGraph: queue.dependencyGraph, runtimeState });
      if (runtimeSnapshot != null && runtimeLoadHasConflict(runtimeSnapshot)) {
        return result(runtimeRecoveryConflictOutput(output, runtimeSnapshot, "autopilot_run_next"), {}, source);
      }
      const dispatched = await maybeDispatchWorker(queue.ledgers, output, options);
      if (dispatched != null) {
        return result(dispatched, {}, source);
      }
      if (output.reasonCode === "active_change_handoff" && output.selection.selectedTaskId != null) {
        const materialized = materializeActiveChangeLedger(ctx.root, output.selection.selectedTaskId, { ledgerRoot: options.ledgerRoot });
        if (materialized.created) {
          const refreshed = readAutopilotQueueSummaries(ctx.root, options, { changeId: materialized.changeId });
          return result(createLedgerMaterializedOutput(refreshed.ledgers, materialized, output.selection), { materialization: { changeId: materialized.changeId, path: materialized.path, validation: { valid: materialized.validation.valid, warnings: materialized.validation.warnings.length } } }, source);
        }
        return result(createLedgerMaterializationBlockedOutput(queue.ledgers, materialized), {}, source);
      }
      const scopedChangeId = optionalNonEmptyString(scope.changeId);
      const scopedTaskId = optionalNonEmptyString(scope.taskId);
      if (output.reasonCode === "no_ledgers" && scopedChangeId != null && scopedTaskId == null) {
        const materialized = materializeActiveChangeLedger(ctx.root, scopedChangeId, { ledgerRoot: options.ledgerRoot });
        if (materialized.created) {
          const refreshed = readAutopilotQueueSummaries(ctx.root, options, { changeId: materialized.changeId });
          return result(createLedgerMaterializedOutput(refreshed.ledgers, materialized, output.selection), { materialization: { changeId: materialized.changeId, path: materialized.path, validation: { valid: materialized.validation.valid, warnings: materialized.validation.warnings.length } } }, source);
        }
        return result(createLedgerMaterializationBlockedOutput(queue.ledgers, materialized), {}, source);
      }
      return result(output, {}, source);
    },

    async status(scope: Pick<AutopilotScope, "changeId"> = {}, source?: TriggerSource): Promise<AutopilotControllerResult> {
      const runtimeSnapshot = options.runtimeStore == null ? null : await options.runtimeStore.load();
      const runtimeState = runtimeSnapshot == null ? options.runtimeState : { ...runtimeStateFromSnapshot(runtimeSnapshot.snapshot), ...(options.runtimeState ?? {}) };
      const queue = readAutopilotQueueSummaries(ctx.root, options, { changeId: scope.changeId });
      const output = outputWithRuntimeState(createStatusOutput(queue.ledgers, { dependencyGraph: queue.dependencyGraph, runtimeState }), runtimeState ?? {});
      if (runtimeSnapshot != null && runtimeLoadHasConflict(runtimeSnapshot)) {
        return result(runtimeRecoveryConflictOutput(output, runtimeSnapshot, "autopilot_status"), {}, source);
      }
      return result(output, {}, source);
    },

    async collect(scope: Pick<AutopilotScope, "taskId"> = {}, source?: TriggerSource): Promise<AutopilotControllerResult> {
      const liveCollect = await maybeCollectWorker(ctx.root, scope, options);
      if (liveCollect != null) {
        return result(liveCollect, {}, source);
      }
      const ledgers = readLedgerSummaries(ctx.root, options, { taskId: scope.taskId });
      return result(createCollectOutput(ledgers, { runtimeState: options.runtimeState, mutateRuntimeState: true }), {}, source);
    },

    async answerBlocker(args: BlockerAnswerArgs, source?: TriggerSource): Promise<AutopilotControllerResult> {
      const validation = validateBlockerAnswer(options.runtimeState, args);
      return result(createAnswerBlockerOutput(args.questionId, validation), {
        argumentContext: {
          acknowledged: validation.accepted ? ["questionId", "taskId", "selectedLabel", "action"] : ["questionId"],
          ignored: validation.accepted ? [] : ["taskId", "selectedLabel", "action"],
          mutation: "none",
        },
      }, source);
    },

    async stop(args: StopArgs, source?: TriggerSource): Promise<AutopilotControllerResult> {
      let durableStoppedEntries: Array<Record<string, unknown>> = [];
      try {
        durableStoppedEntries = await stopRuntimeStore(args, options);
      } catch (error) {
        const base = createStopOutput(args.target, { id: args.id, stoppedEntries: [] });
        const message = error instanceof Error ? error.message : String(error);
        return result(runtimeConflictOutput(base, { reason: `Autopilot stop could not load or save durable runtime state: ${message}`, errors: [message] }, "Autopilot stop found invalid durable runtime evidence and did not mutate runtime or ledger state.", "autopilot_stop"), {
          argumentContext: { acknowledged: ["target"], ignored: ["id", "reason"], mutation: "none" },
        }, source);
      }
      const stoppedEntries = durableStoppedEntries.length > 0 ? durableStoppedEntries : applyStopToRuntimeState(args.target, args.id, options.runtimeState);
      const output = createStopOutput(args.target, { id: args.id, stoppedEntries });
      return result(output, {
        argumentContext: stopArgumentContext(args, output.reasonCode === "stop_applied"),
      }, source);
    },
  };
}

export function toPluginToolOutput(result: AutopilotControllerResult): { output: string; metadata: Record<string, unknown> } {
  return {
    output: JSON.stringify(result.payload, null, 2),
    metadata: result.metadata,
  };
}
