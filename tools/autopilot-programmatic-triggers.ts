import { autopilotWorkerReportMarkerStatus } from "./autopilot-worker-report-marker.ts";

export type AutopilotTriggerMode = "off" | "observe" | "controlled" | "autonomous";

export type AutopilotTriggerOptions = {
  triggerMode?: AutopilotTriggerMode;
  fileWatch?: { enabled?: boolean; debounceMs?: number; cooldownMs?: number };
  postToolCheckpoints?: { enabled?: boolean; debounceMs?: number; cooldownMs?: number };
  workerCollect?: { enabled?: boolean; debounceMs?: number };
  blockerReplies?: { enabled?: boolean };
  permissionReplies?: { enabled?: boolean };
  protectedPathGuard?: { enabled?: boolean };
  tuiCommands?: { enabled?: boolean };
  runNextEvents?: { enabled?: boolean; cooldownMs?: number };
};

export type AutopilotBusEvent = {
  type: string;
  properties?: Record<string, unknown>;
};

export type AutopilotToolExecutionInput = {
  tool: string;
  sessionID?: string;
  callID?: string;
  args?: unknown;
};

export type AutopilotTriggerJobKind = "status" | "check" | "collect" | "answer_blocker" | "stop" | "run_next";

export type AutopilotTriggerScope = {
  changeId?: string;
  taskId?: string;
  runId?: string;
  sessionID?: string;
  requestID?: string;
  reportId?: string;
  workspaceName?: string;
  worktreeName?: string;
};

export type AutopilotTriggerJob = {
  id: string;
  kind: AutopilotTriggerJobKind;
  scope?: AutopilotTriggerScope;
  sourceEvent: string;
  sourceID?: string;
  debounceMs: number;
  cooldownMs: number;
  requiresRuntimeOwnership: boolean;
  claimCapable: boolean;
  reason: string;
  blockerAnswer?: {
    questionId: string;
    taskId?: string;
    selectedLabel?: string;
    action?: string;
  };
};

export type AutopilotTriggerDecision = {
  action: "scheduled" | "ignored";
  reason: string;
  jobs: AutopilotTriggerJob[];
};

export type AutopilotTriggerRuntimeEvidence = {
  workerSessions?: Array<{
    sessionID: string;
    taskId: string;
    reportId?: string;
    status?: "busy" | "idle" | "retry";
    reportConsumed?: boolean;
  }>;
  blockerQuestions?: Array<{
    requestID: string;
    questionId: string;
    taskId?: string;
    options?: Array<{ label: string; action?: string }>;
  }>;
  pendingPermissions?: Array<{
    requestID: string;
    taskId?: string;
  }>;
  waitingWorkspaces?: Array<string | { name: string; taskId?: string; runId?: string }>;
  waitingWorktrees?: Array<string | { name: string; taskId?: string; runId?: string }>;
  activeRun?: {
    runId: string;
    taskIds?: string[];
    sessionIDs?: string[];
    blockers?: boolean;
    mrWait?: boolean;
    locksValid?: boolean;
    lastRunNextOutput?: Record<string, unknown>;
  };
};

const modeRank: Record<AutopilotTriggerMode, number> = {
  off: 0,
  observe: 1,
  controlled: 2,
  autonomous: 3,
};

const progressCheckpointReasonCodes = new Set(["advanced", "ledger_materialized"]);
const noProgressCheckpointReasonCodes = new Set([
  "ready_runtime_deferred",
  "no_ledgers",
  "active_change_handoff",
  "collect_deferred",
  "stop_no_active_state",
  "no_actionable_tasks",
]);

function isTriggerMode(value: unknown): value is AutopilotTriggerMode {
  return value === "off" || value === "observe" || value === "controlled" || value === "autonomous";
}

function resolvedMode(options: AutopilotTriggerOptions): AutopilotTriggerMode {
  return options.triggerMode == null ? "observe" : isTriggerMode(options.triggerMode) ? options.triggerMode : "off";
}

function modeAtLeast(options: AutopilotTriggerOptions, minimum: AutopilotTriggerMode): boolean {
  return modeRank[resolvedMode(options)] >= modeRank[minimum];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function recordOption(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function booleanOption(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function boundedIntegerOption(value: unknown, fallback: number, max: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max ? value : fallback;
}

export function parseAutopilotTriggerOptions(value: unknown): AutopilotTriggerOptions {
  const options = recordOption(value);
  const fileWatch = recordOption(options.fileWatch);
  const postToolCheckpoints = recordOption(options.postToolCheckpoints);
  const workerCollect = recordOption(options.workerCollect);
  const blockerReplies = recordOption(options.blockerReplies);
  const permissionReplies = recordOption(options.permissionReplies);
  const protectedPathGuard = recordOption(options.protectedPathGuard);
  const tuiCommands = recordOption(options.tuiCommands);
  const runNextEvents = recordOption(options.runNextEvents);

  return {
    triggerMode: options.triggerMode == null ? "observe" : isTriggerMode(options.triggerMode) ? options.triggerMode : "off",
    fileWatch: {
      enabled: booleanOption(fileWatch.enabled, true),
      debounceMs: boundedIntegerOption(fileWatch.debounceMs, 250, 60_000),
      cooldownMs: boundedIntegerOption(fileWatch.cooldownMs, 1000, 300_000),
    },
    postToolCheckpoints: {
      enabled: booleanOption(postToolCheckpoints.enabled, true),
      debounceMs: boundedIntegerOption(postToolCheckpoints.debounceMs, 250, 60_000),
      cooldownMs: boundedIntegerOption(postToolCheckpoints.cooldownMs, 1000, 300_000),
    },
    workerCollect: {
      enabled: booleanOption(workerCollect.enabled, true),
      debounceMs: boundedIntegerOption(workerCollect.debounceMs, 250, 60_000),
    },
    blockerReplies: {
      enabled: booleanOption(blockerReplies.enabled, true),
    },
    permissionReplies: {
      enabled: booleanOption(permissionReplies.enabled, true),
    },
    protectedPathGuard: {
      enabled: booleanOption(protectedPathGuard.enabled, true),
    },
    tuiCommands: {
      enabled: booleanOption(tuiCommands.enabled, false),
    },
    runNextEvents: {
      enabled: booleanOption(runNextEvents.enabled, false),
      cooldownMs: boundedIntegerOption(runNextEvents.cooldownMs, 5000, 300_000),
    },
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizedPath(value: unknown): string | undefined {
  const text = optionalString(value);
  return text?.replaceAll("\\", "/").replace(/^\.\//, "");
}

function changePathParts(filePath: string): { changeId: string; rest: string } | null {
  const match = /(?:^|\/)openspec\/changes\/([^/]+)\/(.+)$/.exec(filePath);
  if (match == null) {
    return null;
  }
  return { changeId: match[1], rest: match[2] };
}

function safeOpenSpecSourceID(changeId: string, rest: string): string | null {
  const segments = ["openspec", "changes", changeId, ...rest.split("/")];
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }
  return segments.join("/");
}

function stableScopeKey(scope: AutopilotTriggerScope | undefined): string {
  if (scope == null) {
    return "none";
  }
  return Object.entries(scope)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(";") || "none";
}

function ignore(reason: string): AutopilotTriggerDecision {
  return { action: "ignored", reason, jobs: [] };
}

function schedule(job: Omit<AutopilotTriggerJob, "id" | "debounceMs" | "cooldownMs"> & { debounceMs?: number; cooldownMs?: number }): AutopilotTriggerDecision {
  const fullJob: AutopilotTriggerJob = {
    debounceMs: 250,
    cooldownMs: 1000,
    ...job,
    id: [job.kind, job.sourceEvent, stableScopeKey(job.scope), job.sourceID ?? "none"].join(":"),
  };
  return { action: "scheduled", reason: fullJob.reason, jobs: [fullJob] };
}

function scheduleJobs(reason: string, jobs: Array<Omit<AutopilotTriggerJob, "id" | "debounceMs" | "cooldownMs"> & { debounceMs?: number; cooldownMs?: number }>): AutopilotTriggerDecision {
  return {
    action: "scheduled",
    reason,
    jobs: jobs.map((job) => ({
      debounceMs: 250,
      cooldownMs: 1000,
      ...job,
      id: [job.kind, job.sourceEvent, stableScopeKey(job.scope), job.sourceID ?? "none"].join(":"),
    })),
  };
}

function fileDecision(event: AutopilotBusEvent, options: AutopilotTriggerOptions): AutopilotTriggerDecision {
  if (!modeAtLeast(options, "observe") || options.fileWatch?.enabled === false) {
    return ignore("file watcher triggers disabled");
  }
  const filePath = normalizedPath(event.properties?.file);
  if (filePath == null) {
    return ignore("file event missing path");
  }
  const parts = changePathParts(filePath);
  if (parts == null) {
    return ignore("unsupported path");
  }

  const scope = { changeId: parts.changeId };
  const sourceID = safeOpenSpecSourceID(parts.changeId, parts.rest);
  if (sourceID == null) {
    return ignore("unsafe path");
  }
  if (parts.rest === "tasks.md") {
    return schedule({
      kind: "status",
      scope,
      sourceEvent: event.type,
      sourceID,
      debounceMs: options.fileWatch?.debounceMs ?? 250,
      cooldownMs: options.fileWatch?.cooldownMs ?? 1000,
      requiresRuntimeOwnership: false,
      claimCapable: false,
      reason: "active OpenSpec tasks.md changed; schedule observe-mode status only",
    });
  }

  if (parts.rest.startsWith("automation/")
    || parts.rest === "retrospective.md"
    || parts.rest === "live-regression-report.md") {
    return schedule({
      kind: "check",
      scope,
      sourceEvent: event.type,
      sourceID,
      debounceMs: options.fileWatch?.debounceMs ?? 250,
      cooldownMs: options.fileWatch?.cooldownMs ?? 1000,
      requiresRuntimeOwnership: false,
      claimCapable: false,
      reason: "Autopilot ledger or evidence path changed; schedule cheap validation only",
    });
  }

  return ignore("unsupported path");
}

function statusType(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return optionalString(value.type);
}

function firstAnswerLabel(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const row of value) {
    if (!Array.isArray(row)) {
      continue;
    }
    for (const answer of row) {
      const label = optionalString(answer);
      if (label != null) {
        return label;
      }
    }
  }
  return undefined;
}

function parseRecordJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parsedAutopilotToolOutput(output: unknown): Record<string, unknown> | undefined {
  if (typeof output === "string") {
    return parseRecordJson(output);
  }
  if (!isRecord(output)) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(output, "output")) {
    if (typeof output.output === "string") {
      return parseRecordJson(output.output);
    }
    return isRecord(output.output) ? output.output : undefined;
  }
  return output;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) && isRecord(value[0]) ? value[0] : undefined;
}

function recordsFrom(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function changeIdFromPath(value: unknown): string | undefined {
  const filePath = normalizedPath(value);
  return filePath == null ? undefined : changePathParts(filePath)?.changeId;
}

function scopeFromRecord(record: Record<string, unknown>): AutopilotTriggerScope | undefined {
  const scope = {
    changeId: optionalString(record.changeId) ?? changeIdFromPath(record.path),
    taskId: optionalString(record.taskId),
  };
  return scope.changeId == null && scope.taskId == null ? undefined : scope;
}

function stableOutputScopeKey(scope: AutopilotTriggerScope): string {
  return `changeId=${scope.changeId ?? ""};taskId=${scope.taskId ?? ""}`;
}

function singleDistinctScope(scopes: AutopilotTriggerScope[]): AutopilotTriggerScope | undefined {
  const byKey = new Map<string, AutopilotTriggerScope>();
  for (const scope of scopes) {
    byKey.set(stableOutputScopeKey(scope), scope);
  }
  return byKey.size === 1 ? Array.from(byKey.values())[0] : undefined;
}

function scopeFromAutopilotOutput(payload: Record<string, unknown>): AutopilotTriggerScope | undefined {
  const progressScopes = [
    ...recordsFrom(payload.tasksStarted).map(scopeFromRecord),
    ...recordsFrom(payload.tasksAdvanced).map(scopeFromRecord),
  ].filter((scope): scope is AutopilotTriggerScope => scope != null);
  if (progressScopes.length > 0) {
    return singleDistinctScope(progressScopes);
  }

  const summary = firstRecord(payload.taskSummaries);
  if (summary != null) {
    return scopeFromRecord(summary);
  }

  if (isRecord(payload.selection)) {
    const selectedTaskId = optionalString(payload.selection.selectedTaskId);
    return selectedTaskId == null ? undefined : { taskId: selectedTaskId };
  }

  return undefined;
}

function outputLoopGuardSuppressesRepeat(payload: Record<string, unknown>): boolean {
  if (!isRecord(payload.loopGuard)) {
    return false;
  }
  return payload.loopGuard.repeatedNoProgress === true || payload.loopGuard.suppressRepeatRecommendation === true;
}

function autopilotOutputMadeProgress(payload: Record<string, unknown>): boolean {
  const reasonCode = optionalString(payload.reasonCode);
  return payload.outcome === "advanced"
    || (reasonCode != null && progressCheckpointReasonCodes.has(reasonCode));
}

function autopilotOutputIsNoProgress(payload: Record<string, unknown>): boolean {
  const reasonCode = optionalString(payload.reasonCode);
  return outputLoopGuardSuppressesRepeat(payload)
    || (reasonCode != null && noProgressCheckpointReasonCodes.has(reasonCode));
}

function safeSourcePart(value: string): string {
  const sanitized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return sanitized.length > 0 ? sanitized : "unknown";
}

function safeToolSourceID(input: AutopilotToolExecutionInput): string {
  const callID = optionalString(input.callID) ?? "unknown";
  return `${safeSourcePart(input.tool)}:${safeSourcePart(callID)}`;
}

function workerDecision(event: AutopilotBusEvent, options: AutopilotTriggerOptions, runtime: AutopilotTriggerRuntimeEvidence): AutopilotTriggerDecision {
  if (!modeAtLeast(options, "controlled") || options.workerCollect?.enabled === false) {
    return ignore("controlled worker triggers disabled");
  }
  const sessionID = optionalString(event.properties?.sessionID);
  if (sessionID == null) {
    return ignore("worker event missing sessionID");
  }
  const worker = runtime.workerSessions?.find((candidate) => candidate.sessionID === sessionID);
  if (worker == null) {
    return ignore("unknown worker session");
  }
  const observedStatus = event.type === "session.status" ? statusType(event.properties?.status) : worker.status;
  if (worker.reportConsumed) {
    return ignore("worker report already consumed");
  }
  if (observedStatus !== "idle") {
    return ignore("waiting for worker idle before collecting report evidence");
  }
  if (event.type === "message.updated" || event.type === "message.part.updated") {
    const markerStatus = autopilotWorkerReportMarkerStatus(event, worker.reportId);
    if (markerStatus === "missing") {
      return ignore("missing report marker");
    }
    if (markerStatus === "mismatch") {
      return ignore("report marker mismatch");
    }
    if (markerStatus === "partial") {
      return ignore("incomplete report marker");
    }
  }
  return schedule({
    kind: "collect",
    scope: { taskId: worker.taskId, sessionID, reportId: worker.reportId },
    sourceEvent: event.type,
    sourceID: sessionID,
    debounceMs: options.workerCollect?.debounceMs ?? 250,
    requiresRuntimeOwnership: true,
    claimCapable: false,
    reason: "plugin-owned worker session is idle with unconsumed report evidence",
  });
}

function autonomousRunNextLoopGuardSafe(activeRun: NonNullable<AutopilotTriggerRuntimeEvidence["activeRun"]>): boolean {
  const payload = activeRun.lastRunNextOutput;
  if (payload == null) {
    return false;
  }
  return autopilotOutputMadeProgress(payload);
}

function autonomousRunNextDecision(event: AutopilotBusEvent, options: AutopilotTriggerOptions, runtime: AutopilotTriggerRuntimeEvidence): AutopilotTriggerDecision | null {
  if (!modeAtLeast(options, "autonomous") || options.runNextEvents?.enabled !== true) {
    return null;
  }
  if (event.type !== "session.status" || statusType(event.properties?.status) !== "idle") {
    return null;
  }
  if (runtime.activeRun == null) {
    return ignore("autonomous run_next requires plugin-owned active-run ownership evidence");
  }
  if (runtime.activeRun.blockers === true) {
    return ignore("autonomous run_next blocked because active run has blockers");
  }
  if (runtime.activeRun.mrWait === true) {
    return ignore("autonomous run_next blocked because active run is waiting for MR wait resolution");
  }
  if (runtime.activeRun.locksValid !== true) {
    return ignore("autonomous run_next requires valid locks");
  }
  const sessionID = optionalString(event.properties?.sessionID);
  const activeTaskIds = new Set(runtime.activeRun.taskIds ?? []);
  const activeRunOwnsSession = sessionID != null && (runtime.activeRun.sessionIDs?.includes(sessionID) === true
    || runtime.workerSessions?.some((worker) => worker.sessionID === sessionID && activeTaskIds.has(worker.taskId)) === true);
  if (!activeRunOwnsSession) {
    return ignore("autonomous run_next requires a plugin-owned session event");
  }
  const taskIds = runtime.activeRun.taskIds ?? [];
  if (taskIds.length !== 1) {
    return ignore("autonomous run_next requires exactly one plugin-owned task scope");
  }
  if (!autonomousRunNextLoopGuardSafe(runtime.activeRun)) {
    return ignore("autonomous run_next requires loop-guard safety evidence");
  }
  return schedule({
    kind: "run_next",
    scope: { taskId: taskIds[0] },
    sourceEvent: event.type,
    sourceID: sessionID,
    cooldownMs: options.runNextEvents.cooldownMs ?? 5000,
    requiresRuntimeOwnership: true,
    claimCapable: true,
    reason: "autonomous run_next allowed by explicit config and plugin-owned active-run evidence",
  });
}

function blockerDecision(event: AutopilotBusEvent, options: AutopilotTriggerOptions, runtime: AutopilotTriggerRuntimeEvidence): AutopilotTriggerDecision {
  if (!modeAtLeast(options, "controlled") || options.blockerReplies?.enabled === false) {
    return ignore("controlled blocker reply triggers disabled");
  }
  const requestID = optionalString(event.properties?.requestID ?? event.properties?.questionID);
  if (requestID == null) {
    return ignore("blocker reply missing request id");
  }
  const question = runtime.blockerQuestions?.find((candidate) => candidate.requestID === requestID);
  if (question == null) {
    return ignore("unknown blocker question");
  }
  const scope = { taskId: question.taskId, requestID };
  if (event.type === "question.rejected") {
    return schedule({
      kind: "status",
      scope,
      sourceEvent: event.type,
      sourceID: requestID,
      requiresRuntimeOwnership: true,
      claimCapable: false,
      reason: "plugin-owned blocker question was rejected; schedule unresolved-blocker status",
    });
  }
  const selectedLabel = optionalString(event.properties?.selectedLabel ?? event.properties?.label) ?? firstAnswerLabel(event.properties?.answers);
  const selectedAction = optionalString(event.properties?.action) ?? question.options?.find((option) => option.label === selectedLabel)?.action;
  return scheduleJobs("plugin-owned blocker question was answered; schedule answer handling and status follow-up", [
    {
      kind: "answer_blocker",
      scope,
      sourceEvent: event.type,
      sourceID: requestID,
      requiresRuntimeOwnership: true,
      claimCapable: false,
      reason: "plugin-owned blocker question was answered",
      blockerAnswer: {
        questionId: question.questionId,
        taskId: question.taskId,
        selectedLabel,
        action: selectedAction,
      },
    },
    {
      kind: "status",
      scope,
      sourceEvent: event.type,
      sourceID: requestID,
      requiresRuntimeOwnership: true,
      claimCapable: false,
      reason: "plugin-owned blocker answer handled; schedule status follow-up",
    },
  ]);
}

function permissionDecision(event: AutopilotBusEvent, options: AutopilotTriggerOptions, runtime: AutopilotTriggerRuntimeEvidence): AutopilotTriggerDecision {
  if (!modeAtLeast(options, "controlled") || options.permissionReplies?.enabled === false) {
    return ignore("controlled permission reply triggers disabled");
  }
  const requestID = optionalString(event.properties?.requestID ?? event.properties?.permissionID);
  if (requestID == null) {
    return ignore("permission reply missing request id");
  }
  const permission = runtime.pendingPermissions?.find((candidate) => candidate.requestID === requestID);
  if (permission == null) {
    return ignore("unknown permission");
  }
  return schedule({
    kind: "status",
    scope: { taskId: permission.taskId, requestID },
    sourceEvent: event.type,
    sourceID: requestID,
    requiresRuntimeOwnership: true,
    claimCapable: false,
    reason: "plugin-owned permission reply changed Autopilot runtime readiness",
  });
}

function ownedWaitScope(waits: Array<string | { name: string; taskId?: string; runId?: string }> | undefined, name: string): { owned: boolean; taskId?: string; runId?: string } {
  for (const wait of waits ?? []) {
    if (typeof wait === "string") {
      if (wait === name) {
        return { owned: true };
      }
      continue;
    }
    if (wait.name === name) {
      return { owned: true, taskId: wait.taskId, runId: wait.runId };
    }
  }
  return { owned: false };
}

function workspaceDecision(event: AutopilotBusEvent, options: AutopilotTriggerOptions, runtime: AutopilotTriggerRuntimeEvidence): AutopilotTriggerDecision {
  if (!modeAtLeast(options, "controlled")) {
    return ignore("controlled workspace triggers disabled");
  }
  const name = optionalString(event.properties?.name ?? event.properties?.workspaceID ?? event.properties?.worktreeID);
  if (name == null) {
    return ignore("workspace event missing name");
  }
  const isWorkspace = event.type.startsWith("workspace.");
  const wait = ownedWaitScope(isWorkspace ? runtime.waitingWorkspaces : runtime.waitingWorktrees, name);
  if (!wait.owned) {
    return ignore(isWorkspace ? "unknown workspace" : "unknown worktree");
  }
  const failed = event.type.endsWith(".failed");
  const scopedStop = failed && (wait.taskId != null || wait.runId != null);
  return schedule({
    kind: scopedStop ? "stop" : "status",
    scope: { ...(isWorkspace ? { workspaceName: name } : { worktreeName: name }), taskId: wait.taskId, runId: wait.runId },
    sourceEvent: event.type,
    sourceID: name,
    requiresRuntimeOwnership: true,
    claimCapable: false,
    reason: failed
      ? scopedStop
        ? "plugin-owned workspace or worktree failed for a scoped task"
        : "plugin-owned workspace or worktree failed; schedule status because no task scope is available"
      : "plugin-owned workspace or worktree is ready",
  });
}

export function classifyAutopilotEvent(event: AutopilotBusEvent, options: AutopilotTriggerOptions = {}, runtime: AutopilotTriggerRuntimeEvidence = {}): AutopilotTriggerDecision {
  if (resolvedMode(options) === "off") {
    return ignore("programmatic triggers disabled");
  }
  switch (event.type) {
    case "file.watcher.updated":
      return fileDecision(event, options);
    case "session.status": {
      const worker = workerDecision(event, options, runtime);
      if (worker.action === "scheduled") {
        return worker;
      }
      return autonomousRunNextDecision(event, options, runtime) ?? worker;
    }
    case "message.updated":
    case "message.part.updated":
      return workerDecision(event, options, runtime);
    case "question.replied":
    case "question.rejected":
      return blockerDecision(event, options, runtime);
    case "permission.replied":
      return permissionDecision(event, options, runtime);
    case "workspace.ready":
    case "workspace.failed":
    case "worktree.ready":
    case "worktree.failed":
      return workspaceDecision(event, options, runtime);
    default:
      return ignore("unsupported event type");
  }
}

export function classifyAutopilotToolExecutionAfter(input: AutopilotToolExecutionInput, output: unknown, options: AutopilotTriggerOptions = {}): AutopilotTriggerDecision {
  if (!modeAtLeast(options, "observe") || options.postToolCheckpoints?.enabled === false) {
    return ignore("post-tool checkpoints disabled");
  }
  if (input.tool !== "autopilot_run_next" && input.tool !== "autopilot_collect") {
    return ignore("unsupported tool for post-tool checkpoint");
  }

  const payload = parsedAutopilotToolOutput(output);
  if (payload == null) {
    return ignore("unsupported Autopilot tool output");
  }

  const common = {
    scope: scopeFromAutopilotOutput(payload),
    sourceEvent: "tool.execute.after",
    sourceID: safeToolSourceID(input),
    debounceMs: options.postToolCheckpoints?.debounceMs ?? 250,
    cooldownMs: options.postToolCheckpoints?.cooldownMs ?? 1000,
    requiresRuntimeOwnership: false,
    claimCapable: false,
  };

  if (autopilotOutputMadeProgress(payload)) {
    return schedule({
      ...common,
      kind: "check",
      reason: "Autopilot tool reported progress; schedule cheap checkpoint",
    });
  }

  if (optionalString(payload.reasonCode) === "runtime_evidence_conflict") {
    return schedule({
      ...common,
      kind: "status",
      reason: "Autopilot tool reported runtime evidence conflict; schedule status checkpoint",
    });
  }

  if (autopilotOutputIsNoProgress(payload)) {
    return ignore("no-progress Autopilot output suppresses post-tool checkpoint");
  }

  return ignore("Autopilot output did not report progress");
}

export function classifyAutopilotTuiCommand(command: string, options: AutopilotTriggerOptions = {}): AutopilotTriggerDecision {
  if (options.tuiCommands?.enabled !== true) {
    return ignore("TUI commands disabled");
  }
  const commandMap: Record<string, { kind: AutopilotTriggerJobKind; claimCapable: boolean; reason: string }> = {
    "autopilot.status": { kind: "status", claimCapable: false, reason: "explicit TUI status command" },
    "autopilot.check": { kind: "check", claimCapable: false, reason: "explicit TUI check command" },
  };
  const entry = commandMap[command];
  if (command === "autopilot.run" || command === "autopilot.stop") {
    return ignore("explicit TUI run/stop uses prompt-mediated fallback, not a scheduler job");
  }
  if (entry == null) {
    return ignore("unsupported TUI command");
  }
  return schedule({
    kind: entry.kind,
    sourceEvent: "tui.command",
    sourceID: command,
    requiresRuntimeOwnership: entry.kind !== "status" && entry.kind !== "check" && entry.kind !== "run_next" ? true : false,
    claimCapable: entry.claimCapable,
    reason: entry.reason,
  });
}
