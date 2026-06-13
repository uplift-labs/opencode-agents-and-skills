import { autopilotMrStatuses, autopilotTaskStatuses } from "./autopilot-contract.ts";
import type { AutopilotRunRecord } from "./autopilot-runtime-store.ts";

export type AutopilotWorkerReportValidation = {
  command: string;
  status: "passed" | "failed" | "skipped";
  summary?: string;
  skippedReason?: string;
};

export type AutopilotParsedWorkerReport = {
  schemaVersion: 1;
  reportId: string;
  runId: string;
  workerId: string;
  sessionId: string;
  taskId: string;
  ledgerPath: string;
  fromStatus: string;
  toStatus: string;
  changedFiles: string[];
  validation: AutopilotWorkerReportValidation[];
  testDecision: string;
  secretScan: { status: string; summary?: string };
  evidence: Record<string, unknown>;
  blockers: Array<{ reason: string; questionId?: string }>;
  mr: { status: string; url?: string };
};

export type AutopilotWorkerReportParseReasonCode =
  | "missing_marker"
  | "partial_marker"
  | "duplicate_report"
  | "invalid_json"
  | "unknown_report_id"
  | "duplicate_report_id"
  | "invalid_payload"
  | "mismatched_evidence";

export type AutopilotWorkerReportParseResult =
  | { ok: true; report: AutopilotParsedWorkerReport }
  | { ok: false; reasonCode: AutopilotWorkerReportParseReasonCode; errors: string[] };

export type ParseAutopilotWorkerReportEnvelopeInput = {
  text: string;
  run: AutopilotRunRecord;
  consumedReportIds?: Iterable<string>;
};

const completeMarkerPattern = /^AUTOPILOT_WORKER_REPORT[ \t]+([^\s]+)[ \t]+COMPLETE[ \t]*$/gm;
const anyMarkerPattern = /\bAUTOPILOT_WORKER_REPORT\b/g;
const taskStatusSet = new Set<string>(autopilotTaskStatuses);
const mrStatusSet = new Set<string>(autopilotMrStatuses);
const validationStatusSet = new Set<string>(["passed", "failed", "skipped"]);
const testDecisionSet = new Set<string>(["required", "not-applicable", "skipped-infeasible", "existing-coverage", "characterization", "acceptance"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value.trim() : undefined;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateAllowedKeys(value: Record<string, unknown>, prefix: string, allowedKeys: readonly string[], errors: string[]): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) {
      errors.push(`${prefix}.${key}: unsupported field.`);
    }
  }
}

function readString(value: Record<string, unknown>, key: string, errors: string[], prefix = "report"): string {
  const raw = value[key];
  if (!isNonEmptyString(raw)) {
    errors.push(`${prefix}.${key}: non-empty string is required.`);
    return "";
  }
  return raw.trim();
}

function readStringArray(value: unknown, prefix: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${prefix}: string array is required.`);
    return [];
  }
  const strings: string[] = [];
  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) {
      errors.push(`${prefix}[${index}]: non-empty string is required.`);
      return;
    }
    strings.push(item.trim());
  });
  return strings;
}

function completeMarkers(text: string): Array<{ reportId: string; startIndex: number; endIndex: number }> {
  return Array.from(text.matchAll(completeMarkerPattern), (match) => ({
    reportId: match[1],
    startIndex: match.index ?? 0,
    endIndex: (match.index ?? 0) + match[0].length,
  }));
}

function markerOccurrenceCount(text: string): number {
  return Array.from(text.matchAll(anyMarkerPattern)).length;
}

function extractJsonObject(text: string, startIndex: number): { jsonText?: string; error?: string } {
  const objectStart = text.indexOf("{", startIndex);
  if (objectStart < 0) {
    return { error: "worker report JSON payload is missing." };
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth++;
      continue;
    }
    if (char === "}") {
      depth--;
      if (depth === 0) {
        return { jsonText: text.slice(objectStart, index + 1) };
      }
    }
  }
  return { error: "worker report JSON payload is incomplete." };
}

function parseJsonPayload(text: string, startIndex: number): { payload?: unknown; errors: string[] } {
  const extracted = extractJsonObject(text, startIndex);
  if (extracted.jsonText == null) {
    return { errors: [extracted.error ?? "worker report JSON payload is invalid."] };
  }
  try {
    return { payload: JSON.parse(extracted.jsonText), errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { errors: [`worker report JSON payload is invalid: ${message}`] };
  }
}

function validateValidationEntries(value: unknown, errors: string[]): AutopilotWorkerReportValidation[] {
  if (!Array.isArray(value)) {
    errors.push("report.validation: array is required.");
    return [];
  }
  return value.flatMap((entry, index): AutopilotWorkerReportValidation[] => {
    const prefix = `report.validation[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${prefix}: object is required.`);
      return [];
    }
    validateAllowedKeys(entry, prefix, ["command", "status", "summary", "skippedReason"], errors);
    const command = readString(entry, "command", errors, prefix);
    const status = readString(entry, "status", errors, prefix);
    if (!validationStatusSet.has(status)) {
      errors.push(`${prefix}.status: must be one of passed, failed, skipped.`);
    }
    const summary = hasOwn(entry, "summary") ? optionalString(entry.summary) : undefined;
    if (hasOwn(entry, "summary") && summary == null) {
      errors.push(`${prefix}.summary: non-empty string is required when present.`);
    }
    const skippedReason = hasOwn(entry, "skippedReason") ? optionalString(entry.skippedReason) : undefined;
    if (hasOwn(entry, "skippedReason") && skippedReason == null) {
      errors.push(`${prefix}.skippedReason: non-empty string is required when present.`);
    }
    return [{ command, status: validationStatusSet.has(status) ? status as AutopilotWorkerReportValidation["status"] : "failed", ...(summary != null ? { summary } : {}), ...(skippedReason != null ? { skippedReason } : {}) }];
  });
}

function validateSecretScan(value: unknown, errors: string[]): { status: string; summary?: string } {
  if (!isRecord(value)) {
    errors.push("report.secretScan: object is required.");
    return { status: "" };
  }
  validateAllowedKeys(value, "report.secretScan", ["status", "summary"], errors);
  const status = readString(value, "status", errors, "report.secretScan");
  const summary = hasOwn(value, "summary") ? optionalString(value.summary) : undefined;
  if (hasOwn(value, "summary") && summary == null) {
    errors.push("report.secretScan.summary: non-empty string is required when present.");
  }
  return { status, ...(summary != null ? { summary } : {}) };
}

function validateBlockers(value: unknown, errors: string[]): Array<{ reason: string; questionId?: string }> {
  if (!Array.isArray(value)) {
    errors.push("report.blockers: array is required.");
    return [];
  }
  return value.flatMap((blocker, index): Array<{ reason: string; questionId?: string }> => {
    const prefix = `report.blockers[${index}]`;
    if (!isRecord(blocker)) {
      errors.push(`${prefix}: object is required.`);
      return [];
    }
    validateAllowedKeys(blocker, prefix, ["reason", "questionId"], errors);
    const reason = readString(blocker, "reason", errors, prefix);
    const questionId = hasOwn(blocker, "questionId") ? optionalString(blocker.questionId) : undefined;
    if (hasOwn(blocker, "questionId") && questionId == null) {
      errors.push(`${prefix}.questionId: non-empty string is required when present.`);
    }
    return [{ reason, ...(questionId != null ? { questionId } : {}) }];
  });
}

function validateMr(value: unknown, errors: string[]): { status: string; url?: string } {
  if (!isRecord(value)) {
    errors.push("report.mr: object is required.");
    return { status: "" };
  }
  validateAllowedKeys(value, "report.mr", ["status", "url"], errors);
  const status = readString(value, "status", errors, "report.mr");
  if (!mrStatusSet.has(status)) {
    errors.push(`report.mr.status: must be one of ${autopilotMrStatuses.join(", ")}.`);
  }
  const url = hasOwn(value, "url") ? optionalString(value.url) : undefined;
  if (hasOwn(value, "url") && url == null) {
    errors.push("report.mr.url: non-empty string is required when present.");
  }
  return { status, ...(url != null ? { url } : {}) };
}

function validateReportPayload(payload: unknown, markerReportId: string, run: AutopilotRunRecord): { report?: AutopilotParsedWorkerReport; invalidErrors: string[]; mismatchErrors: string[] } {
  const invalidErrors: string[] = [];
  const mismatchErrors: string[] = [];
  if (!isRecord(payload)) {
    return { invalidErrors: ["report: object is required."], mismatchErrors };
  }
  validateAllowedKeys(payload, "report", [
    "schemaVersion",
    "reportId",
    "runId",
    "workerId",
    "sessionId",
    "taskId",
    "ledgerPath",
    "fromStatus",
    "toStatus",
    "changedFiles",
    "validation",
    "testDecision",
    "secretScan",
    "evidence",
    "blockers",
    "mr",
  ], invalidErrors);
  if (payload.schemaVersion !== 1) {
    invalidErrors.push("report.schemaVersion: must be 1.");
  }
  const reportId = readString(payload, "reportId", invalidErrors);
  const runId = readString(payload, "runId", invalidErrors);
  const workerId = readString(payload, "workerId", invalidErrors);
  const sessionId = readString(payload, "sessionId", invalidErrors);
  const taskId = readString(payload, "taskId", invalidErrors);
  const ledgerPath = readString(payload, "ledgerPath", invalidErrors);
  const fromStatus = readString(payload, "fromStatus", invalidErrors);
  const toStatus = readString(payload, "toStatus", invalidErrors);
  const changedFiles = readStringArray(payload.changedFiles, "report.changedFiles", invalidErrors);
  const validation = validateValidationEntries(payload.validation, invalidErrors);
  const testDecision = readString(payload, "testDecision", invalidErrors);
  if (!testDecisionSet.has(testDecision)) {
    invalidErrors.push("report.testDecision: must be one of required, not-applicable, skipped-infeasible, existing-coverage, characterization, acceptance.");
  }
  const secretScan = validateSecretScan(payload.secretScan, invalidErrors);
  if (!isRecord(payload.evidence)) {
    invalidErrors.push("report.evidence: object is required.");
  }
  const blockers = validateBlockers(payload.blockers, invalidErrors);
  const mr = validateMr(payload.mr, invalidErrors);
  if (!taskStatusSet.has(fromStatus)) {
    invalidErrors.push(`report.fromStatus: must be one of ${autopilotTaskStatuses.join(", ")}.`);
  }
  if (!taskStatusSet.has(toStatus)) {
    invalidErrors.push(`report.toStatus: must be one of ${autopilotTaskStatuses.join(", ")}.`);
  }
  const expectedPairs: Array<[string, string, string | undefined]> = [
    ["reportId", reportId, run.expectedReportId],
    ["marker.reportId", markerReportId, run.expectedReportId],
    ["runId", runId, run.runId],
    ["workerId", workerId, run.workerId],
    ["sessionId", sessionId, run.workerSessionId],
    ["taskId", taskId, run.taskId],
    ["ledgerPath", ledgerPath, run.ledgerPath],
    ["fromStatus", fromStatus, run.fromStatus],
  ];
  for (const [field, actual, expected] of expectedPairs) {
    if (expected == null || expected.trim().length === 0) {
      mismatchErrors.push(`stored run missing expected ${field} evidence.`);
      continue;
    }
    if (actual !== expected) {
      mismatchErrors.push(`report.${field}: expected ${expected}, got ${actual || "<missing>"}.`);
    }
  }
  if (run.expectedToStatus != null && run.expectedToStatus.trim().length > 0 && toStatus !== run.expectedToStatus) {
    mismatchErrors.push(`report.toStatus: expected ${run.expectedToStatus}, got ${toStatus || "<missing>"}.`);
  }
  if (invalidErrors.length > 0 || mismatchErrors.length > 0) {
    return { invalidErrors, mismatchErrors };
  }
  return {
    report: {
      schemaVersion: 1,
      reportId,
      runId,
      workerId,
      sessionId,
      taskId,
      ledgerPath,
      fromStatus,
      toStatus,
      changedFiles,
      validation,
      testDecision,
      secretScan,
      evidence: JSON.parse(JSON.stringify(payload.evidence)) as Record<string, unknown>,
      blockers,
      mr,
    },
    invalidErrors,
    mismatchErrors,
  };
}

export function parseAutopilotWorkerReportEnvelope(input: ParseAutopilotWorkerReportEnvelopeInput): AutopilotWorkerReportParseResult {
  const markers = completeMarkers(input.text);
  const markerCount = markerOccurrenceCount(input.text);
  if (markers.length === 0) {
    return markerCount > 0
      ? { ok: false, reasonCode: "partial_marker", errors: ["worker report marker is present but lacks COMPLETE evidence."] }
      : { ok: false, reasonCode: "missing_marker", errors: ["worker report marker is missing."] };
  }
  if (markerCount !== markers.length) {
    return { ok: false, reasonCode: "partial_marker", errors: ["worker report output contains partial or non-standalone marker evidence in addition to complete markers."] };
  }
  if (markers.length > 1) {
    return { ok: false, reasonCode: "duplicate_report", errors: [`expected exactly one complete worker report marker, found ${markers.length}.`] };
  }
  const [marker] = markers;
  if (marker.reportId !== input.run.expectedReportId) {
    return { ok: false, reasonCode: "unknown_report_id", errors: [`marker report id ${marker.reportId} does not match expected ${input.run.expectedReportId}.`] };
  }
  if (new Set(input.consumedReportIds ?? []).has(marker.reportId)) {
    return { ok: false, reasonCode: "duplicate_report_id", errors: [`worker report id ${marker.reportId} was already consumed.`] };
  }
  const parsed = parseJsonPayload(input.text, marker.endIndex);
  if (parsed.payload == null) {
    return { ok: false, reasonCode: "invalid_json", errors: parsed.errors };
  }
  const validated = validateReportPayload(parsed.payload, marker.reportId, input.run);
  if (validated.mismatchErrors.length > 0) {
    return { ok: false, reasonCode: "mismatched_evidence", errors: [...validated.mismatchErrors, ...validated.invalidErrors] };
  }
  if (validated.invalidErrors.length > 0 || validated.report == null) {
    return { ok: false, reasonCode: "invalid_payload", errors: validated.invalidErrors.length > 0 ? validated.invalidErrors : ["worker report payload is invalid."] };
  }
  return { ok: true, report: validated.report };
}
