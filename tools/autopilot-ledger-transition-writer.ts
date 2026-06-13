import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateTaskLedger, type ValidateTaskLedgerResult } from "./autopilot-ledger.ts";
import { isSymlinkPath, realPathIsInside } from "./autopilot-path-safety.ts";
import type { AutopilotParsedWorkerReport } from "./autopilot-worker-report-parser.ts";
import type { AutopilotRunRecord } from "./autopilot-runtime-store.ts";

export type LedgerTransitionWriterSuccess = {
  ok: true;
  action: "applied" | "already_applied";
  taskId: string;
  path: string;
  reportId: string;
  from: string;
  to: string;
  revision?: { number: number; contentHash: string };
  postWriteValidation: ValidateTaskLedgerResult;
};

export type LedgerTransitionWriterFailure = {
  ok: false;
  reasonCode: "unsafe_path" | "read_failed" | "current_ledger_invalid" | "mismatched_evidence" | "stale_revision" | "next_ledger_invalid" | "write_failed" | "post_write_invalid";
  errors: string[];
};

export type LedgerTransitionWriterResult = LedgerTransitionWriterSuccess | LedgerTransitionWriterFailure;

export type ApplyAutopilotLedgerTransitionInput = {
  root: string;
  run: AutopilotRunRecord;
  report: AutopilotParsedWorkerReport;
  now?: string;
  source?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function safeLedgerPath(root: string, ledgerPath: string): { absolutePath?: string; relativePath?: string; error?: string } {
  if (path.isAbsolute(ledgerPath)) {
    return { error: `ledger path must be relative, got ${ledgerPath}.` };
  }
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, ledgerPath);
  const relativePath = path.relative(absoluteRoot, absolutePath);
  if (relativePath.length === 0 || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return { error: `ledger path ${ledgerPath} escapes root.` };
  }
  const normalized = relativePath.split(path.sep).join("/");
  if (!/^openspec\/changes\/[^/]+\/automation\/task\.json$/.test(normalized)) {
    return { error: `ledger path ${ledgerPath} must target an active OpenSpec change automation/task.json.` };
  }
  const parts = relativePath.split(path.sep);
  let current = absoluteRoot;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.existsSync(current) && isSymlinkPath(current)) {
      return { error: `ledger path ${ledgerPath} must not traverse symlink or junction segment ${path.relative(absoluteRoot, current).split(path.sep).join("/")}.` };
    }
  }
  if (fs.existsSync(absolutePath) && !realPathIsInside(absoluteRoot, absolutePath)) {
    return { error: `ledger path ${ledgerPath} real path escapes root.` };
  }
  return { absolutePath, relativePath: normalized };
}

function readLedgerFile(absolutePath: string): { ledger?: Record<string, unknown>; errors: string[] } {
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      return { errors: ["ledger JSON root must be an object."] };
    }
    return { ledger: parsed, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { errors: [`failed to read ledger: ${message}`] };
  }
}

function findHistoryEntryForWorkerReport(ledger: Record<string, unknown>, reportId: string): Record<string, unknown> | null {
  if (!Array.isArray(ledger.history)) {
    return null;
  }
  const found = ledger.history.find((entry) => isRecord(entry) && isRecord(entry.evidence) && entry.evidence.workerReportId === reportId);
  return isRecord(found) ? found : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function contentHashFor(ledger: Record<string, unknown>): string {
  const hashInput = cloneRecord(ledger);
  if (isRecord(hashInput.revision)) {
    hashInput.revision = { ...hashInput.revision, contentHash: "<computed>" };
  }
  return crypto.createHash("sha256").update(stableJson(hashInput)).digest("hex");
}

function revisionOf(ledger: Record<string, unknown>): { number?: number; contentHash?: string } {
  const revision = isRecord(ledger.revision) ? ledger.revision : {};
  return {
    number: typeof revision.number === "number" ? revision.number : undefined,
    contentHash: typeof revision.contentHash === "string" ? revision.contentHash : undefined,
  };
}

function verifyReportMatchesRun(run: AutopilotRunRecord, report: AutopilotParsedWorkerReport): string[] {
  const errors: string[] = [];
  const pairs: Array<[string, string, string | undefined]> = [
    ["reportId", report.reportId, run.expectedReportId],
    ["runId", report.runId, run.runId],
    ["workerId", report.workerId, run.workerId],
    ["sessionId", report.sessionId, run.workerSessionId],
    ["taskId", report.taskId, run.taskId],
    ["ledgerPath", report.ledgerPath, run.ledgerPath],
    ["fromStatus", report.fromStatus, run.fromStatus],
  ];
  for (const [field, actual, expected] of pairs) {
    if (expected == null || expected.trim().length === 0) {
      errors.push(`stored run missing expected ${field} evidence.`);
      continue;
    }
    if (actual !== expected) {
      errors.push(`${field}: expected ${expected}, got ${actual}.`);
    }
  }
  if (run.expectedToStatus != null && run.expectedToStatus.trim().length > 0 && report.toStatus !== run.expectedToStatus) {
    errors.push(`toStatus: expected ${run.expectedToStatus}, got ${report.toStatus}.`);
  }
  return errors;
}

function verifyCurrentLedger(ledger: Record<string, unknown>, run: AutopilotRunRecord, report: AutopilotParsedWorkerReport): { mismatchErrors: string[]; staleErrors: string[] } {
  const mismatchErrors: string[] = [];
  const staleErrors: string[] = [];
  if (ledger.id !== run.taskId) {
    mismatchErrors.push(`ledger id: expected ${run.taskId}, got ${String(ledger.id)}.`);
  }
  if (ledger.status !== run.fromStatus || ledger.status !== report.fromStatus) {
    staleErrors.push(`ledger status: expected ${run.fromStatus}, got ${String(ledger.status)}.`);
  }
  const currentRevision = revisionOf(ledger);
  if (run.ledgerRevision?.number != null && currentRevision.number !== run.ledgerRevision.number) {
    staleErrors.push(`ledger revision number: expected ${run.ledgerRevision.number}, got ${String(currentRevision.number)}.`);
  }
  if (run.ledgerRevision?.contentHash != null && currentRevision.contentHash !== run.ledgerRevision.contentHash) {
    staleErrors.push(`ledger revision contentHash: expected ${run.ledgerRevision.contentHash}, got ${String(currentRevision.contentHash)}.`);
  }
  return { mismatchErrors, staleErrors };
}

function verifyAlreadyAppliedHistoryEntry(ledger: Record<string, unknown>, entry: Record<string, unknown>, run: AutopilotRunRecord, report: AutopilotParsedWorkerReport): string[] {
  const errors: string[] = [];
  if (ledger.id !== run.taskId || ledger.id !== report.taskId) {
    errors.push(`duplicate report ledger id: expected ${run.taskId}, got ${String(ledger.id)}.`);
  }
  if (entry.from !== report.fromStatus) {
    errors.push(`duplicate report history.from: expected ${report.fromStatus}, got ${String(entry.from)}.`);
  }
  if (entry.to !== report.toStatus) {
    errors.push(`duplicate report history.to: expected ${report.toStatus}, got ${String(entry.to)}.`);
  }
  if (!isRecord(entry.evidence)) {
    errors.push("duplicate report history.evidence: object is required.");
    return errors;
  }
  const expectedEvidence: Array<[string, string]> = [
    ["workerReportId", report.reportId],
    ["workerId", report.workerId],
    ["runId", report.runId],
    ["sessionId", report.sessionId],
  ];
  for (const [field, expected] of expectedEvidence) {
    if (entry.evidence[field] !== expected) {
      errors.push(`duplicate report history.evidence.${field}: expected ${expected}, got ${String(entry.evidence[field])}.`);
    }
  }
  return errors;
}

function validationEvidence(report: AutopilotParsedWorkerReport): Record<string, unknown> | undefined {
  if (report.validation.length === 0) {
    return undefined;
  }
  const failed = report.validation.some((entry) => entry.status === "failed");
  const skipped = report.validation.every((entry) => entry.status === "skipped");
  return {
    status: failed ? "failed" : skipped ? "skipped" : "passed",
    commands: report.validation.map((entry) => entry.command),
    entries: report.validation,
  };
}

function transitionEvidence(report: AutopilotParsedWorkerReport): Record<string, unknown> {
  const validation = validationEvidence(report);
  return {
    ...cloneRecord(report.evidence),
    ...(report.changedFiles.length > 0 ? { changedFiles: report.changedFiles } : {}),
    ...(validation != null ? { validation } : {}),
    testDecision: report.testDecision,
    secretScan: report.secretScan,
    ...(report.blockers.length > 0 ? { blockers: report.blockers, blockerReason: report.blockers[0]?.reason } : {}),
    workerReportId: report.reportId,
    workerId: report.workerId,
    runId: report.runId,
    sessionId: report.sessionId,
  };
}

function nextLedgerFrom(ledger: Record<string, unknown>, report: AutopilotParsedWorkerReport, now: string, source: string): Record<string, unknown> {
  const nextLedger = cloneRecord(ledger);
  const history = Array.isArray(nextLedger.history) ? nextLedger.history.slice() : [];
  nextLedger.status = report.toStatus;
  nextLedger.history = history.concat({
    from: report.fromStatus,
    to: report.toStatus,
    at: now,
    by: "plugin",
    source,
    evidence: transitionEvidence(report),
  });
  nextLedger.blockers = report.blockers.map((blocker) => ({ ...blocker }));
  const existingMr = isRecord(nextLedger.mr) ? nextLedger.mr : {};
  nextLedger.mr = { ...existingMr, ...report.mr };
  const previousRevision = revisionOf(ledger);
  const nextRevisionNumber = typeof previousRevision.number === "number" ? previousRevision.number + 1 : 1;
  nextLedger.revision = {
    ...(isRecord(nextLedger.revision) ? nextLedger.revision : {}),
    number: nextRevisionNumber,
    contentHash: "<pending>",
    updatedBy: source,
    updatedAt: now,
  };
  (nextLedger.revision as Record<string, unknown>).contentHash = contentHashFor(nextLedger);
  return nextLedger;
}

function revisionMatches(ledger: Record<string, unknown>, expected: { number?: number; contentHash?: string } | undefined): string[] {
  if (expected == null) {
    return [];
  }
  const current = revisionOf(ledger);
  const errors: string[] = [];
  if (expected.number != null && current.number !== expected.number) {
    errors.push(`ledger revision number changed before write: expected ${expected.number}, got ${String(current.number)}.`);
  }
  if (expected.contentHash != null && current.contentHash !== expected.contentHash) {
    errors.push(`ledger revision contentHash changed before write: expected ${expected.contentHash}, got ${String(current.contentHash)}.`);
  }
  return errors;
}

function writeLedgerAtomically(absolutePath: string, ledger: Record<string, unknown>, expectedRevision: { number?: number; contentHash?: string } | undefined): { postWriteValidation?: ValidateTaskLedgerResult; reasonCode?: "stale_revision" | "write_failed"; errors: string[] } {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const tempPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    const tempRead = readLedgerFile(tempPath);
    if (tempRead.ledger == null) {
      return { errors: tempRead.errors };
    }
    const tempValidation = validateTaskLedger(tempRead.ledger, { sourcePath: tempPath });
    if (!tempValidation.valid) {
      return { errors: tempValidation.errors };
    }
    // Optimistic freshness check; controller integration must still serialize writers per ledger.
    const current = readLedgerFile(absolutePath);
    if (current.ledger == null) {
      return { reasonCode: "write_failed", errors: current.errors };
    }
    const staleErrors = revisionMatches(current.ledger, expectedRevision);
    if (staleErrors.length > 0) {
      return { reasonCode: "stale_revision", errors: staleErrors };
    }
    fs.renameSync(tempPath, absolutePath);
    const written = readLedgerFile(absolutePath);
    if (written.ledger == null) {
      return { errors: written.errors };
    }
    const postWriteValidation = validateTaskLedger(written.ledger, { sourcePath: absolutePath });
    return { postWriteValidation, errors: postWriteValidation.valid ? [] : postWriteValidation.errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reasonCode: "write_failed", errors: [`failed to write ledger: ${message}`] };
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

export function applyAutopilotLedgerTransition(input: ApplyAutopilotLedgerTransitionInput): LedgerTransitionWriterResult {
  const source = input.source ?? "autopilot_collect";
  const now = input.now ?? new Date().toISOString();
  const safePath = safeLedgerPath(input.root, input.run.ledgerPath);
  if (safePath.absolutePath == null || safePath.relativePath == null) {
    return { ok: false, reasonCode: "unsafe_path", errors: [safePath.error ?? "unsafe ledger path."] };
  }
  const reportMatchErrors = verifyReportMatchesRun(input.run, input.report);
  if (reportMatchErrors.length > 0) {
    return { ok: false, reasonCode: "mismatched_evidence", errors: reportMatchErrors };
  }
  const read = readLedgerFile(safePath.absolutePath);
  if (read.ledger == null) {
    return { ok: false, reasonCode: "read_failed", errors: read.errors };
  }
  const currentValidation = validateTaskLedger(read.ledger, { sourcePath: safePath.relativePath });
  if (!currentValidation.valid) {
    return { ok: false, reasonCode: "current_ledger_invalid", errors: currentValidation.errors };
  }
  const alreadyApplied = findHistoryEntryForWorkerReport(read.ledger, input.report.reportId);
  if (alreadyApplied != null) {
    const duplicateErrors = verifyAlreadyAppliedHistoryEntry(read.ledger, alreadyApplied, input.run, input.report);
    if (duplicateErrors.length > 0) {
      return { ok: false, reasonCode: "mismatched_evidence", errors: duplicateErrors };
    }
    return {
      ok: true,
      action: "already_applied",
      taskId: input.report.taskId,
      path: safePath.relativePath,
      reportId: input.report.reportId,
      from: input.report.fromStatus,
      to: input.report.toStatus,
      postWriteValidation: currentValidation,
    };
  }
  const currentChecks = verifyCurrentLedger(read.ledger, input.run, input.report);
  if (currentChecks.mismatchErrors.length > 0) {
    return { ok: false, reasonCode: "mismatched_evidence", errors: currentChecks.mismatchErrors };
  }
  if (currentChecks.staleErrors.length > 0) {
    return { ok: false, reasonCode: "stale_revision", errors: currentChecks.staleErrors };
  }
  const nextLedger = nextLedgerFrom(read.ledger, input.report, now, source);
  const nextValidation = validateTaskLedger(nextLedger, { sourcePath: `${safePath.relativePath}#${input.report.reportId}` });
  if (!nextValidation.valid) {
    return { ok: false, reasonCode: "next_ledger_invalid", errors: nextValidation.errors };
  }
  const write = writeLedgerAtomically(safePath.absolutePath, nextLedger, input.run.ledgerRevision);
  if (write.postWriteValidation == null) {
    return { ok: false, reasonCode: write.reasonCode ?? "write_failed", errors: write.errors };
  }
  if (!write.postWriteValidation.valid) {
    return { ok: false, reasonCode: "post_write_invalid", errors: write.postWriteValidation.errors };
  }
  const revision = revisionOf(nextLedger);
  return {
    ok: true,
    action: "applied",
    taskId: input.report.taskId,
    path: safePath.relativePath,
    reportId: input.report.reportId,
    from: input.report.fromStatus,
    to: input.report.toStatus,
    revision: typeof revision.number === "number" && revision.contentHash != null ? { number: revision.number, contentHash: revision.contentHash } : undefined,
    postWriteValidation: write.postWriteValidation,
  };
}
