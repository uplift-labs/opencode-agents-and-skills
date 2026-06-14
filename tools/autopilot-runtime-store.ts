import fs from "node:fs";
import path from "node:path";

export const autopilotRuntimeRunStatuses = ["claiming", "dispatching", "running", "collecting", "blocked", "waiting_mr", "stopped", "failed", "done"] as const;
export const autopilotActiveRuntimeRunStatuses = ["claiming", "dispatching", "running", "collecting", "blocked", "waiting_mr"] as const;
export const autopilotCollectClaimableRuntimeRunStatuses = ["claiming", "dispatching", "running"] as const;
export const autopilotWorkerWritableRuntimeRunStatuses = ["running"] as const;

export type AutopilotRuntimeRunStatus = (typeof autopilotRuntimeRunStatuses)[number];

export type AutopilotRuntimeScope = {
  read: string[];
  write: string[];
  forbidden: string[];
};

export type AutopilotRuntimeBlockerQuestion = {
  requestID: string;
  questionId: string;
  taskId?: string;
  options?: Array<{ label: string; action?: string }>;
};

export type AutopilotRuntimePendingPermission = {
  requestID: string;
  taskId?: string;
};

export type AutopilotRuntimeWaitRecord = {
  name: string;
  taskId?: string;
  runId?: string;
};

export type AutopilotRunRecord = {
  runId: string;
  status: AutopilotRuntimeRunStatus;
  createdAt: string;
  updatedAt: string;
  taskId: string;
  ledgerPath: string;
  fromStatus: string;
  expectedToStatus?: string;
  expectedReportId: string;
  workerId: string;
  workerSessionId?: string;
  ledgerRevision?: { number?: number; contentHash?: string };
  scope: AutopilotRuntimeScope;
  blockers?: Array<{ reason: string; questionId?: string }>;
  mr?: { status: string; url?: string };
  stopReason?: string;
  lastRunNextOutput?: Record<string, unknown>;
};

export type AutopilotRuntimeSnapshot = {
  schemaVersion: 1;
  runs: Record<string, AutopilotRunRecord>;
  consumedWorkerReportIds: string[];
  blockerQuestions?: AutopilotRuntimeBlockerQuestion[];
  pendingPermissions?: AutopilotRuntimePendingPermission[];
  waitingWorkspaces?: AutopilotRuntimeWaitRecord[];
  waitingWorktrees?: AutopilotRuntimeWaitRecord[];
};

export type AutopilotRuntimeValidationResult = {
  valid: boolean;
  errors: string[];
};

export type AutopilotRuntimeStoreLoadResult = {
  snapshot: AutopilotRuntimeSnapshot;
  recovered: boolean;
  errors: string[];
};

export type AutopilotRuntimeStoreSaveResult = {
  snapshot: AutopilotRuntimeSnapshot;
};

export type AutopilotRuntimeStore = {
  load(): Promise<AutopilotRuntimeStoreLoadResult>;
  save(mutator: (draft: AutopilotRuntimeSnapshot) => void): Promise<AutopilotRuntimeStoreSaveResult>;
};

const runStatusSet = new Set<string>(autopilotRuntimeRunStatuses);
const activeRuntimeRunStatusSet = new Set<string>(autopilotActiveRuntimeRunStatuses);
const collectClaimableRuntimeRunStatusSet = new Set<string>(autopilotCollectClaimableRuntimeRunStatuses);
const workerWritableRuntimeRunStatusSet = new Set<string>(autopilotWorkerWritableRuntimeRunStatuses);

export function isAutopilotRuntimeRunStatus(value: unknown): value is AutopilotRuntimeRunStatus {
  return typeof value === "string" && runStatusSet.has(value);
}

export function isActiveAutopilotRuntimeStatus(value: unknown): value is AutopilotRuntimeRunStatus {
  return typeof value === "string" && activeRuntimeRunStatusSet.has(value);
}

export function isCollectClaimableAutopilotRuntimeStatus(value: unknown): value is AutopilotRuntimeRunStatus {
  return typeof value === "string" && collectClaimableRuntimeRunStatusSet.has(value);
}

export function isWorkerWritableAutopilotRuntimeStatus(value: unknown): value is AutopilotRuntimeRunStatus {
  return typeof value === "string" && workerWritableRuntimeRunStatusSet.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cloneSnapshot(snapshot: AutopilotRuntimeSnapshot): AutopilotRuntimeSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AutopilotRuntimeSnapshot;
}

function nonEmptyStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    return null;
  }
  return [...value];
}

function validateAllowedKeys(value: Record<string, unknown>, prefix: string, allowedKeys: readonly string[], errors: string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) {
      errors.push(`${prefix}.${key}: unsupported field.`);
    }
  }
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function compareOptionalStrings(left: unknown, right: unknown): number {
  const leftString = typeof left === "string" ? left : "";
  const rightString = typeof right === "string" ? right : "";
  return leftString.localeCompare(rightString);
}

function validateOptionalStringField(value: Record<string, unknown>, key: string, prefix: string, errors: string[]): void {
  if (hasOwn(value, key) && !isNonEmptyString(value[key])) {
    errors.push(`${prefix}.${key}: non-empty string is required when present.`);
  }
}

function validateScope(value: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${prefix}: scope object is required.`);
    return;
  }
  validateAllowedKeys(value, `${prefix}.scope`, ["read", "write", "forbidden"], errors);
  for (const key of ["read", "write", "forbidden"] as const) {
    if (nonEmptyStringArray(value[key]) == null) {
      errors.push(`${prefix}: scope.${key} must be a non-empty string array.`);
    }
  }
}

function validateLedgerRevision(value: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${prefix}.ledgerRevision: object is required when present.`);
    return;
  }
  validateAllowedKeys(value, `${prefix}.ledgerRevision`, ["number", "contentHash"], errors);
  if (hasOwn(value, "number") && !(typeof value.number === "number" && Number.isFinite(value.number))) {
    errors.push(`${prefix}.ledgerRevision.number: finite number is required when present.`);
  }
  if (hasOwn(value, "contentHash") && !isNonEmptyString(value.contentHash)) {
    errors.push(`${prefix}.ledgerRevision.contentHash: non-empty string is required when present.`);
  }
}

function validateBlockers(value: unknown, prefix: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${prefix}.blockers: array is required when present.`);
    return;
  }
  value.forEach((blocker, index) => {
    const blockerPrefix = `${prefix}.blockers[${index}]`;
    if (!isRecord(blocker)) {
      errors.push(`${blockerPrefix}: object is required.`);
      return;
    }
    validateAllowedKeys(blocker, blockerPrefix, ["reason", "questionId"], errors);
    if (!isNonEmptyString(blocker.reason)) {
      errors.push(`${blockerPrefix}.reason: non-empty string is required.`);
    }
    if (hasOwn(blocker, "questionId") && !isNonEmptyString(blocker.questionId)) {
      errors.push(`${blockerPrefix}.questionId: non-empty string is required when present.`);
    }
  });
}

function validateMr(value: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${prefix}.mr: object is required when present.`);
    return;
  }
  validateAllowedKeys(value, `${prefix}.mr`, ["status", "url"], errors);
  if (!isNonEmptyString(value.status)) {
    errors.push(`${prefix}.mr.status: non-empty string is required.`);
  }
  if (hasOwn(value, "url") && !isNonEmptyString(value.url)) {
    errors.push(`${prefix}.mr.url: non-empty string is required when present.`);
  }
}

function validateLastRunNextOutput(value: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${prefix}.lastRunNextOutput: object is required when present.`);
  }
}

function validateBlockerQuestionOptions(value: unknown, prefix: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${prefix}.options: array is required when present.`);
    return;
  }
  value.forEach((option, index) => {
    const optionPrefix = `${prefix}.options[${index}]`;
    if (!isRecord(option)) {
      errors.push(`${optionPrefix}: object is required.`);
      return;
    }
    validateAllowedKeys(option, optionPrefix, ["label", "action"], errors);
    if (!isNonEmptyString(option.label)) {
      errors.push(`${optionPrefix}.label: non-empty string is required.`);
    }
    validateOptionalStringField(option, "action", optionPrefix, errors);
  });
}

function validateBlockerQuestions(value: unknown, prefix: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${prefix}: array is required when present.`);
    return;
  }
  value.forEach((question, index) => {
    const questionPrefix = `${prefix}[${index}]`;
    if (!isRecord(question)) {
      errors.push(`${questionPrefix}: object is required.`);
      return;
    }
    validateAllowedKeys(question, questionPrefix, ["requestID", "questionId", "taskId", "options"], errors);
    if (!isNonEmptyString(question.requestID)) {
      errors.push(`${questionPrefix}.requestID: non-empty string is required.`);
    }
    if (!isNonEmptyString(question.questionId)) {
      errors.push(`${questionPrefix}.questionId: non-empty string is required.`);
    }
    validateOptionalStringField(question, "taskId", questionPrefix, errors);
    if (hasOwn(question, "options")) {
      validateBlockerQuestionOptions(question.options, questionPrefix, errors);
    }
  });
}

function validatePendingPermissions(value: unknown, prefix: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${prefix}: array is required when present.`);
    return;
  }
  value.forEach((permission, index) => {
    const permissionPrefix = `${prefix}[${index}]`;
    if (!isRecord(permission)) {
      errors.push(`${permissionPrefix}: object is required.`);
      return;
    }
    validateAllowedKeys(permission, permissionPrefix, ["requestID", "taskId"], errors);
    if (!isNonEmptyString(permission.requestID)) {
      errors.push(`${permissionPrefix}.requestID: non-empty string is required.`);
    }
    validateOptionalStringField(permission, "taskId", permissionPrefix, errors);
  });
}

function validateWaitRecords(value: unknown, prefix: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${prefix}: array is required when present.`);
    return;
  }
  value.forEach((wait, index) => {
    const waitPrefix = `${prefix}[${index}]`;
    if (!isRecord(wait)) {
      errors.push(`${waitPrefix}: object is required.`);
      return;
    }
    validateAllowedKeys(wait, waitPrefix, ["name", "taskId", "runId"], errors);
    if (!isNonEmptyString(wait.name)) {
      errors.push(`${waitPrefix}.name: non-empty string is required.`);
    }
    validateOptionalStringField(wait, "taskId", waitPrefix, errors);
    validateOptionalStringField(wait, "runId", waitPrefix, errors);
  });
}

function validateRunRecord(runId: string, value: unknown, errors: string[]): void {
  const prefix = `runs.${runId}`;
  if (!isRecord(value)) {
    errors.push(`${prefix}: run record object is required.`);
    return;
  }
  validateAllowedKeys(value, prefix, [
    "runId",
    "status",
    "createdAt",
    "updatedAt",
    "taskId",
    "ledgerPath",
    "fromStatus",
    "expectedToStatus",
    "expectedReportId",
    "workerId",
    "workerSessionId",
    "ledgerRevision",
    "scope",
    "blockers",
    "mr",
    "stopReason",
    "lastRunNextOutput",
  ], errors);
  for (const key of ["runId", "createdAt", "updatedAt", "taskId", "ledgerPath", "fromStatus", "expectedReportId", "workerId"] as const) {
    if (!isNonEmptyString(value[key])) {
      errors.push(`${prefix}.${key}: non-empty string is required.`);
    }
  }
  if (value.runId !== runId) {
    errors.push(`${prefix}.runId: must match run record key.`);
  }
  if (!isNonEmptyString(value.status) || !runStatusSet.has(value.status)) {
    errors.push(`${prefix}.status: must be one of ${autopilotRuntimeRunStatuses.join(", ")}.`);
  }
  if (hasOwn(value, "expectedToStatus") && !isNonEmptyString(value.expectedToStatus)) {
    errors.push(`${prefix}.expectedToStatus: when present, non-empty string is required.`);
  }
  if (hasOwn(value, "workerSessionId") && !isNonEmptyString(value.workerSessionId)) {
    errors.push(`${prefix}.workerSessionId: when present, non-empty string is required.`);
  }
  if (hasOwn(value, "stopReason") && !isNonEmptyString(value.stopReason)) {
    errors.push(`${prefix}.stopReason: when present, non-empty string is required.`);
  }
  if (hasOwn(value, "ledgerRevision")) {
    validateLedgerRevision(value.ledgerRevision, prefix, errors);
  }
  if (hasOwn(value, "blockers")) {
    validateBlockers(value.blockers, prefix, errors);
  }
  if (hasOwn(value, "mr")) {
    validateMr(value.mr, prefix, errors);
  }
  if (hasOwn(value, "lastRunNextOutput")) {
    validateLastRunNextOutput(value.lastRunNextOutput, prefix, errors);
  }
  validateScope(value.scope, prefix, errors);
}

export function createEmptyAutopilotRuntimeSnapshot(): AutopilotRuntimeSnapshot {
  return { schemaVersion: 1, runs: {}, consumedWorkerReportIds: [] };
}

export function validateAutopilotRuntimeSnapshot(value: unknown): AutopilotRuntimeValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ["snapshot: object is required."] };
  }
  validateAllowedKeys(value, "snapshot", ["schemaVersion", "runs", "consumedWorkerReportIds", "blockerQuestions", "pendingPermissions", "waitingWorkspaces", "waitingWorktrees"], errors);
  if (value.schemaVersion !== 1) {
    errors.push("schemaVersion: must be 1.");
  }
  if (!isRecord(value.runs)) {
    errors.push("runs: object map is required.");
  } else {
    for (const [runId, record] of Object.entries(value.runs).sort(([left], [right]) => left.localeCompare(right))) {
      validateRunRecord(runId, record, errors);
    }
  }
  if (nonEmptyStringArray(value.consumedWorkerReportIds) == null) {
    errors.push("consumedWorkerReportIds: non-empty string array is required.");
  }
  if (hasOwn(value, "blockerQuestions")) {
    validateBlockerQuestions(value.blockerQuestions, "blockerQuestions", errors);
  }
  if (hasOwn(value, "pendingPermissions")) {
    validatePendingPermissions(value.pendingPermissions, "pendingPermissions", errors);
  }
  if (hasOwn(value, "waitingWorkspaces")) {
    validateWaitRecords(value.waitingWorkspaces, "waitingWorkspaces", errors);
  }
  if (hasOwn(value, "waitingWorktrees")) {
    validateWaitRecords(value.waitingWorktrees, "waitingWorktrees", errors);
  }
  return { valid: errors.length === 0, errors };
}

function normalizeRunRecord(record: AutopilotRunRecord): AutopilotRunRecord {
  const normalized: AutopilotRunRecord = {
    runId: record.runId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    taskId: record.taskId,
    ledgerPath: record.ledgerPath,
    fromStatus: record.fromStatus,
    expectedReportId: record.expectedReportId,
    workerId: record.workerId,
    scope: {
      read: [...new Set(record.scope.read)].sort(),
      write: [...new Set(record.scope.write)].sort(),
      forbidden: [...new Set(record.scope.forbidden)].sort(),
    },
  };
  if (record.expectedToStatus != null) {
    normalized.expectedToStatus = record.expectedToStatus;
  }
  if (record.workerSessionId != null) {
    normalized.workerSessionId = record.workerSessionId;
  }
  if (record.ledgerRevision != null) {
    normalized.ledgerRevision = { ...record.ledgerRevision };
  }
  if (record.blockers != null) {
    normalized.blockers = record.blockers.map((blocker) => ({ ...blocker }));
  }
  if (record.mr != null) {
    normalized.mr = { ...record.mr };
  }
  if (record.stopReason != null) {
    normalized.stopReason = record.stopReason;
  }
  if (record.lastRunNextOutput != null) {
    normalized.lastRunNextOutput = JSON.parse(JSON.stringify(record.lastRunNextOutput)) as Record<string, unknown>;
  }
  return normalized;
}

function normalizeBlockerQuestions(value: AutopilotRuntimeBlockerQuestion[]): AutopilotRuntimeBlockerQuestion[] {
  return value
    .map((question) => {
      const normalized: AutopilotRuntimeBlockerQuestion = { ...question };
      if (question.options != null) {
        normalized.options = question.options.map((option) => ({ ...option }));
      }
      return normalized;
    })
    .sort((left, right) => compareOptionalStrings(left.requestID, right.requestID) || compareOptionalStrings(left.questionId, right.questionId));
}

function normalizePendingPermissions(value: AutopilotRuntimePendingPermission[]): AutopilotRuntimePendingPermission[] {
  return value.map((permission) => ({ ...permission })).sort((left, right) => compareOptionalStrings(left.requestID, right.requestID) || compareOptionalStrings(left.taskId, right.taskId));
}

function normalizeWaitRecords(value: AutopilotRuntimeWaitRecord[]): AutopilotRuntimeWaitRecord[] {
  return value.map((wait) => ({ ...wait })).sort((left, right) => compareOptionalStrings(left.name, right.name) || compareOptionalStrings(left.taskId, right.taskId) || compareOptionalStrings(left.runId, right.runId));
}

function normalizeSnapshot(snapshot: AutopilotRuntimeSnapshot): AutopilotRuntimeSnapshot {
  const normalizedRuns = Object.fromEntries(
    Object.entries(snapshot.runs)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([runId, record]) => [runId, normalizeRunRecord(record)]),
  );
  const normalized: AutopilotRuntimeSnapshot = {
    schemaVersion: 1,
    runs: normalizedRuns,
    consumedWorkerReportIds: [...new Set(snapshot.consumedWorkerReportIds)].sort(),
  };
  if (snapshot.blockerQuestions != null) {
    normalized.blockerQuestions = normalizeBlockerQuestions(snapshot.blockerQuestions);
  }
  if (snapshot.pendingPermissions != null) {
    normalized.pendingPermissions = normalizePendingPermissions(snapshot.pendingPermissions);
  }
  if (snapshot.waitingWorkspaces != null) {
    normalized.waitingWorkspaces = normalizeWaitRecords(snapshot.waitingWorkspaces);
  }
  if (snapshot.waitingWorktrees != null) {
    normalized.waitingWorktrees = normalizeWaitRecords(snapshot.waitingWorktrees);
  }
  return normalized;
}

function checkedNormalizedSnapshot(value: AutopilotRuntimeSnapshot): AutopilotRuntimeSnapshot {
  const originalValidation = validateAutopilotRuntimeSnapshot(value);
  if (!originalValidation.valid) {
    throw new Error(`Invalid Autopilot runtime snapshot: ${originalValidation.errors.join("; ")}`);
  }
  const normalized = normalizeSnapshot(value);
  const validation = validateAutopilotRuntimeSnapshot(normalized);
  if (!validation.valid) {
    throw new Error(`Invalid Autopilot runtime snapshot: ${validation.errors.join("; ")}`);
  }
  return normalized;
}

export function createInMemoryAutopilotRuntimeStore(initialSnapshot: AutopilotRuntimeSnapshot = createEmptyAutopilotRuntimeSnapshot()): AutopilotRuntimeStore {
  let snapshot = checkedNormalizedSnapshot(cloneSnapshot(initialSnapshot));
  return {
    async load(): Promise<AutopilotRuntimeStoreLoadResult> {
      return { snapshot: cloneSnapshot(snapshot), recovered: false, errors: [] };
    },
    async save(mutator: (draft: AutopilotRuntimeSnapshot) => void): Promise<AutopilotRuntimeStoreSaveResult> {
      const draft = cloneSnapshot(snapshot);
      mutator(draft);
      snapshot = checkedNormalizedSnapshot(draft);
      return { snapshot: cloneSnapshot(snapshot) };
    },
  };
}

function parseRuntimeSnapshot(text: string): AutopilotRuntimeStoreLoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { snapshot: createEmptyAutopilotRuntimeSnapshot(), recovered: true, errors: [`Failed to parse runtime state: ${message}`] };
  }
  const validation = validateAutopilotRuntimeSnapshot(parsed);
  if (!validation.valid) {
    return { snapshot: createEmptyAutopilotRuntimeSnapshot(), recovered: true, errors: validation.errors };
  }
  return { snapshot: checkedNormalizedSnapshot(parsed as AutopilotRuntimeSnapshot), recovered: false, errors: [] };
}

export function createFileAutopilotRuntimeStore(filePath: string): AutopilotRuntimeStore {
  const absolutePath = path.resolve(filePath);
  // Serializes overlapping saves issued through one plugin runtime instance.
  let writeQueue: Promise<void> = Promise.resolve();
  const load = async (): Promise<AutopilotRuntimeStoreLoadResult> => {
    if (!fs.existsSync(absolutePath)) {
      return { snapshot: createEmptyAutopilotRuntimeSnapshot(), recovered: false, errors: [] };
    }
    return parseRuntimeSnapshot(fs.readFileSync(absolutePath, "utf8"));
  };
  const save = async (mutator: (draft: AutopilotRuntimeSnapshot) => void): Promise<AutopilotRuntimeStoreSaveResult> => {
    let savedSnapshot: AutopilotRuntimeSnapshot | undefined;
    const writeOperation = writeQueue.then(async () => {
      const loaded = await load();
      if (loaded.recovered || loaded.errors.length > 0) {
        const errors = loaded.errors.length > 0 ? loaded.errors.join("; ") : "unknown recovery error";
        throw new Error(`Refusing to overwrite invalid Autopilot runtime state: ${errors}`);
      }
      const draft = cloneSnapshot(loaded.snapshot);
      mutator(draft);
      const normalized = checkedNormalizedSnapshot(draft);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      const tempPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
        const tempValidation = parseRuntimeSnapshot(fs.readFileSync(tempPath, "utf8"));
        if (tempValidation.recovered || tempValidation.errors.length > 0) {
          throw new Error(`Runtime state temp validation failed: ${tempValidation.errors.join("; ")}`);
        }
        fs.renameSync(tempPath, absolutePath);
      } catch (error) {
        fs.rmSync(tempPath, { force: true });
        throw error;
      }
      savedSnapshot = cloneSnapshot(normalized);
    });
    writeQueue = writeOperation.then(() => undefined, () => undefined);
    await writeOperation;
    if (savedSnapshot == null) {
      throw new Error("Runtime state save failed before a snapshot was recorded.");
    }
    return { snapshot: savedSnapshot };
  };
  return {
    load,
    save,
  };
}
