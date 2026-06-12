#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type AutopilotFreshnessMode = "advisory" | "archive-strict";
export type AutopilotFreshnessLevel = "pass" | "warning" | "error" | "unknown";
export type AutopilotFreshnessStatus = "pass" | "stale" | "contradiction" | "unknown";

export type ActiveChangeConsistencyEvidence = {
  id: string;
  taskIncludes: string;
  evidence: ActiveChangeEvidenceFile[];
};

export type ActiveChangeEvidenceFile = {
  path: string;
  contains: string;
};

export type InspectAutopilotChangeFreshnessOptions = {
  root: string;
  changeId: string;
  mode?: AutopilotFreshnessMode;
  reportFile?: string;
  consistencyEvidence?: ActiveChangeConsistencyEvidence[];
};

export type AutopilotFreshnessItem = {
  id: string;
  status: AutopilotFreshnessStatus;
  level: AutopilotFreshnessLevel;
  message: string;
  evidence: string[];
};

export type AutopilotFreshnessReport = {
  tool: "autopilot-report-freshness";
  mode: AutopilotFreshnessMode;
  valid: boolean;
  changeId: string;
  paths: {
    change: string;
    tasks: string;
    report: string;
    ledger: string;
  };
  summary: {
    pass: number;
    warning: number;
    error: number;
    unknown: number;
  };
  items: AutopilotFreshnessItem[];
};

type TaskCheckbox = {
  checked: boolean;
  line: number;
  text: string;
};

type ReadFileResult = {
  path: string;
  relativePath: string;
  text: string | null;
};

const defaultReportFile = "live-regression-report.md";
const invalidEvidencePath = "<invalid-evidence-path>";
const requiredAutopilotOutputFields = ["reasonCode", "taskSummaries", "nextActions", "loopGuard", "selection"] as const;
const autopilotOutputCandidateFields = ["outcome", "tasksStarted", "tasksAdvanced", "mrsWaiting", "questions", "blockers", "nextRecommendedCall", "summary"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function relativePath(root: string, filePath: string): string {
  return normalizePath(path.relative(root, filePath) || filePath);
}

function resolveRepoRelativeEvidencePath(root: string, evidencePath: string): string | null {
  const trimmed = evidencePath.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const normalizedInput = normalizePath(trimmed);
  const pathParts = normalizedInput.split("/").filter((part) => part.length > 0);
  if (path.isAbsolute(trimmed) || normalizedInput.startsWith("/") || pathParts.includes("..")) {
    return null;
  }
  const resolved = path.resolve(root, ...pathParts);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

function readOptionalFile(root: string, filePath: string): ReadFileResult {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { path: resolved, relativePath: relativePath(root, resolved), text: null };
  }
  return { path: resolved, relativePath: relativePath(root, resolved), text: fs.readFileSync(resolved, "utf8") };
}

function blockingLevel(mode: AutopilotFreshnessMode): AutopilotFreshnessLevel {
  return mode === "archive-strict" ? "error" : "warning";
}

function item(id: string, status: AutopilotFreshnessStatus, level: AutopilotFreshnessLevel, message: string, evidence: string[]): AutopilotFreshnessItem {
  return { id, status, level, message, evidence: evidence.slice().sort() };
}

function parseTaskCheckboxes(tasksText: string): TaskCheckbox[] {
  const result: TaskCheckbox[] = [];
  const lines = tasksText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const match = /^\s*-\s*\[([ xX])\]\s+(.*)$/.exec(lines[index]);
    if (!match) {
      continue;
    }
    result.push({ checked: match[1].toLowerCase() === "x", line: index + 1, text: match[2].trim() });
  }
  return result;
}

function hasCompletionClaim(reportText: string): boolean {
  return hasReadyToLandClaim(reportText) || reportText.split(/\r?\n/).some((line) => {
    if (!/^Status:/i.test(line)) {
      return false;
    }
    return /\bcompleted\b/i.test(line) && !/\bnot\b.*\bcompleted\b/i.test(line);
  });
}

function hasReadyToLandClaim(reportText: string): boolean {
  return /^\s*Ready to land\b/im.test(reportText);
}

function hasPluginOwnedReadyExplanation(reportText: string): boolean {
  if (/(?:no|missing|without)\s+[^\r\n.]*plugin-owned/i.test(reportText)) {
    return false;
  }
  return /plugin-owned/i.test(reportText) && /(\bReady\b|automation\/task\.json|protected)/i.test(reportText);
}

function parseJsonFenceBodies(text: string): string[] {
  return Array.from(text.matchAll(/```json\s*\r?\n([\s\S]*?)\r?\n```/g), (match) => match[1]);
}

function isAutopilotOutputCandidate(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !Object.hasOwn(value, "outcome")) {
    return false;
  }
  return autopilotOutputCandidateFields.filter((field) => field !== "outcome" && Object.hasOwn(value, field)).length >= 1;
}

function checkAutopilotOutputShape(report: ReadFileResult, mode: AutopilotFreshnessMode): AutopilotFreshnessItem {
  if (report.text == null) {
    return item("autopilot-output-shape", "unknown", "unknown", "Report file is missing, so Autopilot output shape cannot be checked.", [report.relativePath]);
  }

  const missingFieldSets: string[] = [];
  let candidateCount = 0;
  for (const body of parseJsonFenceBodies(report.text)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    if (!isAutopilotOutputCandidate(parsed)) {
      continue;
    }
    candidateCount++;
    const missing = requiredAutopilotOutputFields.filter((field) => !Object.hasOwn(parsed, field));
    if (missing.length > 0) {
      missingFieldSets.push(missing.join(", "));
    }
  }

  if (candidateCount === 0) {
    return item("autopilot-output-shape", "unknown", "unknown", "Report has no parseable Autopilot JSON output block to compare with the current public output contract.", [report.relativePath]);
  }
  if (missingFieldSets.length > 0) {
    return item(
      "autopilot-output-shape",
      "stale",
      blockingLevel(mode),
      `Report contains stale Autopilot output JSON missing current fields: ${missingFieldSets.join("; ")}.`,
      [report.relativePath],
    );
  }
  return item("autopilot-output-shape", "pass", "pass", "All report Autopilot JSON output blocks include current primary output fields.", [report.relativePath]);
}

function checkTasksCompletionConsistency(tasks: ReadFileResult, report: ReadFileResult, mode: AutopilotFreshnessMode): AutopilotFreshnessItem {
  if (tasks.text == null || report.text == null) {
    return item("tasks-completion-consistency", "unknown", "unknown", "tasks.md or report file is missing, so completion claims cannot be compared.", [tasks.relativePath, report.relativePath]);
  }

  const unchecked = parseTaskCheckboxes(tasks.text).filter((task) => !task.checked);
  if (unchecked.length > 0 && hasCompletionClaim(report.text)) {
    return item(
      "tasks-completion-consistency",
      "contradiction",
      blockingLevel(mode),
      `Report claims completion or ready-to-land while ${unchecked.length} task checkbox(es) remain unchecked.`,
      [tasks.relativePath, report.relativePath, ...unchecked.map((task) => `${tasks.relativePath}:${task.line}`)],
    );
  }
  return item("tasks-completion-consistency", "pass", "pass", "Report completion claims and task checkboxes do not contradict each other.", [tasks.relativePath, report.relativePath]);
}

function readLedgerStatus(ledger: ReadFileResult): string | null {
  if (ledger.text == null) {
    return null;
  }
  try {
    const parsed = JSON.parse(ledger.text) as unknown;
    return isRecord(parsed) && typeof parsed.status === "string" ? parsed.status : null;
  } catch {
    return null;
  }
}

function checkReadyLedgerStateExplanation(ledger: ReadFileResult, report: ReadFileResult, mode: AutopilotFreshnessMode): AutopilotFreshnessItem {
  if (ledger.text == null) {
    return item("ready-ledger-state-explanation", "unknown", "unknown", "No plugin-owned automation/task.json ledger was present for this change.", [ledger.relativePath]);
  }
  if (report.text == null) {
    return item("ready-ledger-state-explanation", "unknown", "unknown", "Report file is missing, so Ready ledger state explanation cannot be checked.", [ledger.relativePath, report.relativePath]);
  }

  const status = readLedgerStatus(ledger);
  if (status !== "Ready" || !hasCompletionClaim(report.text)) {
    return item("ready-ledger-state-explanation", "pass", "pass", "Ledger status and report ready-to-land claim do not require a plugin-owned Ready-state explanation.", [ledger.relativePath, report.relativePath]);
  }
  if (hasPluginOwnedReadyExplanation(report.text)) {
    return item("ready-ledger-state-explanation", "pass", "pass", "Ready ledger state is explicitly explained as plugin-owned or protected state in the report.", [ledger.relativePath, report.relativePath]);
  }
  return item(
    "ready-ledger-state-explanation",
    "stale",
    blockingLevel(mode),
    "Report claims ready-to-land while plugin-owned ledger remains Ready without an explicit plugin-owned/protected-state explanation.",
    [ledger.relativePath, report.relativePath],
  );
}

function checkActiveChangeEvidenceConsistency(root: string, tasks: ReadFileResult, mode: AutopilotFreshnessMode, evidenceRules: ActiveChangeConsistencyEvidence[]): AutopilotFreshnessItem[] {
  if (evidenceRules.length === 0) {
    return [item("active-change-evidence", "unknown", "unknown", "No explicit active-change consistency evidence rules were provided; unsupported evidence is not inferred.", [tasks.relativePath])];
  }
  if (tasks.text == null) {
    return evidenceRules.map((rule) => item(`active-change-evidence:${rule.id}`, "unknown", "unknown", "tasks.md is missing, so explicit consistency evidence cannot be compared.", [tasks.relativePath]));
  }

  const checkboxes = parseTaskCheckboxes(tasks.text);
  return evidenceRules.slice().sort((left, right) => left.id.localeCompare(right.id)).map((rule) => {
    const matchingTasks = checkboxes.filter((task) => task.text.includes(rule.taskIncludes));
    const resolvedEvidencePaths = rule.evidence.map((entry) => resolveRepoRelativeEvidencePath(root, entry.path));
    const evidencePaths = resolvedEvidencePaths.map((evidencePath) => evidencePath == null ? invalidEvidencePath : relativePath(root, evidencePath));
    const invalidEvidenceRule = rule.evidence.length === 0 || rule.evidence.some((entry) => entry.path.trim().length === 0 || entry.contains.trim().length === 0) || resolvedEvidencePaths.some((entry) => entry == null);
    if (invalidEvidenceRule) {
      return item(
        `active-change-evidence:${rule.id}`,
        "unknown",
        "unknown",
        "Explicit evidence rule is empty, out-of-root, or contains blank path/marker; no implementation state is inferred.",
        [tasks.relativePath, ...evidencePaths],
      );
    }
    const evidencePresent = rule.evidence.every((entry) => {
      const evidencePath = resolveRepoRelativeEvidencePath(root, entry.path);
      if (evidencePath == null) {
        return false;
      }
      return fs.existsSync(evidencePath) && fs.statSync(evidencePath).isFile() && fs.readFileSync(evidencePath, "utf8").includes(entry.contains);
    });
    const uncheckedMatch = matchingTasks.find((task) => !task.checked);

    if (matchingTasks.length === 0 || !evidencePresent) {
      return item(
        `active-change-evidence:${rule.id}`,
        "unknown",
        "unknown",
        "Explicit task/evidence mapping is unsupported or incomplete; no implementation state is inferred.",
        [tasks.relativePath, ...evidencePaths],
      );
    }
    if (uncheckedMatch) {
      return item(
        `active-change-evidence:${rule.id}`,
        "contradiction",
        blockingLevel(mode),
        `Explicit evidence exists while matching task remains unchecked: ${uncheckedMatch.text}`,
        [tasks.relativePath, `${tasks.relativePath}:${uncheckedMatch.line}`, ...evidencePaths],
      );
    }
    return item(`active-change-evidence:${rule.id}`, "pass", "pass", "Explicit evidence and matching task checkbox are reconciled.", [tasks.relativePath, ...evidencePaths]);
  });
}

function summarize(items: AutopilotFreshnessItem[]): AutopilotFreshnessReport["summary"] {
  return {
    pass: items.filter((entry) => entry.level === "pass").length,
    warning: items.filter((entry) => entry.level === "warning").length,
    error: items.filter((entry) => entry.level === "error").length,
    unknown: items.filter((entry) => entry.level === "unknown").length,
  };
}

export function inspectAutopilotChangeFreshness(options: InspectAutopilotChangeFreshnessOptions): AutopilotFreshnessReport {
  const root = path.resolve(options.root);
  const mode = options.mode ?? "advisory";
  const changeId = normalizeChangeId(options.changeId);
  const changeDir = path.join(root, "openspec", "changes", changeId);
  const tasks = readOptionalFile(root, path.join(changeDir, "tasks.md"));
  const report = readOptionalFile(root, path.join(changeDir, options.reportFile ?? defaultReportFile));
  const ledger = readOptionalFile(root, path.join(changeDir, "automation", "task.json"));

  const items = [
    checkAutopilotOutputShape(report, mode),
    checkTasksCompletionConsistency(tasks, report, mode),
    checkReadyLedgerStateExplanation(ledger, report, mode),
    ...checkActiveChangeEvidenceConsistency(root, tasks, mode, options.consistencyEvidence ?? []),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const summary = summarize(items);

  return {
    tool: "autopilot-report-freshness",
    mode,
    valid: summary.error === 0,
    changeId,
    paths: {
      change: relativePath(root, changeDir),
      tasks: tasks.relativePath,
      report: report.relativePath,
      ledger: ledger.relativePath,
    },
    summary,
    items,
  };
}

export function formatAutopilotFreshnessReportJson(report: AutopilotFreshnessReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function normalizeChangeId(value: string): string {
  const normalized = normalizePath(value).replace(/\/$/, "");
  const marker = "openspec/changes/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex >= 0) {
    const rest = normalized.slice(markerIndex + marker.length);
    return rest.split("/")[0];
  }
  return path.basename(normalized);
}

function parseCliArgs(args: string[]): InspectAutopilotChangeFreshnessOptions | null {
  let root = process.cwd();
  let mode: AutopilotFreshnessMode = "advisory";
  let reportFile: string | undefined;
  let changeId: string | null = null;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--root") {
      root = requireCliValue(args, ++index, arg);
    } else if (arg === "--mode") {
      const value = requireCliValue(args, ++index, arg);
      if (value !== "advisory" && value !== "archive-strict") {
        throw new Error(`Unsupported mode: ${value}`);
      }
      mode = value;
    } else if (arg === "--report") {
      reportFile = requireCliValue(args, ++index, arg);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (changeId == null) {
      changeId = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (changeId == null) {
    return null;
  }
  return { root, changeId, mode, reportFile };
}

function requireCliValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function runCli(args: string[]): number {
  let options: InspectAutopilotChangeFreshnessOptions | null;
  try {
    options = parseCliArgs(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (!options) {
    console.error("Usage: node tools/autopilot-report-freshness.ts <change-id-or-path> [--mode advisory|archive-strict] [--root <root>] [--report <file>]");
    return 2;
  }

  const report = inspectAutopilotChangeFreshness(options);
  console.log(formatAutopilotFreshnessReportJson(report).trimEnd());
  return report.valid ? 0 : 1;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entrypoint)).href || import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href && path.resolve(entrypoint) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  process.exitCode = runCli(process.argv.slice(2));
}
