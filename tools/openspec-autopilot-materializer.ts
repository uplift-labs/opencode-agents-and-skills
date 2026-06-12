import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateTaskLedger, type ValidateTaskLedgerResult } from "./autopilot-ledger.ts";
import { isSymlinkPath, pathIsInside, realPathIsInside } from "./autopilot-path-safety.ts";

export type MaterializedLedgerEvidence = {
  changeId: string;
  taskId: string;
  path: string;
  validation: ValidateTaskLedgerResult;
  ledger: Record<string, unknown>;
};

export type MaterializationBlocker = {
  changeId?: string;
  path?: string;
  reason: string;
  errors?: string[];
};

export type MaterializeActiveChangeLedgerResult =
  | ({ created: true } & MaterializedLedgerEvidence)
  | ({ created: false } & MaterializationBlocker);

export type MaterializeActiveChangeLedgerOptions = {
  ledgerRoot?: string;
  now?: () => Date;
};

type ChecklistCounts = {
  unchecked: number;
  total: number;
};

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error != null && "code" in error;
}

function safeRelativeRoot(value: string | undefined, fallback: string, label: string): string {
  if (value == null) {
    return fallback;
  }
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Autopilot ${label} must be a safe relative repository path.`);
  }
  return normalized;
}

function normalizeChangeId(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed) || trimmed === "." || trimmed === "..") {
    return null;
  }
  return trimmed;
}

function toRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function countMarkdownChecklistItems(text: string): ChecklistCounts {
  let unchecked = 0;
  let total = 0;
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*[-*]\s+\[([ xX])\]\s+/.exec(line);
    if (match == null) {
      continue;
    }
    total++;
    if (match[1] === " ") {
      unchecked++;
    }
  }
  return { unchecked, total };
}

function availableValidationCommands(root: string, ledgerRelativePath: string): Array<Record<string, string>> {
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath) || !fs.statSync(packagePath).isFile()) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { scripts?: Record<string, unknown> };
  const scripts = parsed.scripts ?? {};
  const commands: Array<Record<string, string>> = [];
  if (typeof scripts.validate === "string") {
    commands.push({ command: "npm run validate", reason: "Repository validation script is available." });
  }
  if (typeof scripts.test === "string") {
    commands.push({ command: "npm test", reason: "Repository test script is available." });
  }
  if (typeof scripts["openspec:validate"] === "string") {
    commands.push({ command: "npm run openspec:validate", reason: "OpenSpec validation script is available." });
  }
  if (typeof scripts["autopilot:validate"] === "string") {
    commands.push({ command: `npm run autopilot:validate -- ${ledgerRelativePath}`, reason: "Materialized Autopilot ledger validation script is available." });
  }
  return commands;
}

function buildLedger(root: string, ledgerRoot: string, changeId: string, ledgerRelativePath: string, updatedAt: string): Record<string, unknown> {
  const changeRelativeRoot = `${ledgerRoot}/${changeId}`;
  const forbidden = ["openspec/changes/*/automation/**", ".autopilot/**"];
  if (ledgerRoot !== "openspec/changes") {
    forbidden.push(`${ledgerRoot}/*/automation/**`);
  }
  const ledger: Record<string, unknown> = {
    schemaVersion: 1,
    id: changeId,
    taskType: "planning",
    status: "Ready",
    priority: "medium",
    dependencies: [],
    scope: {
      read: [`${changeRelativeRoot}/**`, "openspec/project.md", "package.json"],
      write: [`${changeRelativeRoot}/**`],
      forbidden,
    },
    autonomy: {
      allowCommit: false,
      allowPush: false,
      allowCreateMr: false,
      allowMerge: false,
    },
    validation: {
      commands: availableValidationCommands(root, ledgerRelativePath),
    },
    phaseProfile: {
      analyze: { required: true, depth: "materialized-active-change" },
      implementation: { required: true, mode: "analyze-first" },
      review: { required: true, mode: "reviewer-gated" },
      acceptance: { required: true, mr: "policy" },
    },
    phaseEvidence: {},
    testDecision: {
      decision: "required",
      reason: "Materialized from active OpenSpec change; Analyze must confirm the focused test strategy before implementation.",
    },
    plan: {
      summary: `Materialized from active OpenSpec change ${changeId}.`,
      slices: ["Analyze active change", "Implement smallest safe slice", "Validate and review"],
      scope: `Active OpenSpec change ${changeId}.`,
      testStrategy: "Analyze phase must confirm or refine the focused test strategy before implementation.",
    },
    reviewPolicy: {
      required: [
        { reviewer: "implementation-readiness-reviewer", status: "pending", reason: "Materialized planning task requires implementation readiness review before acceptance." },
      ],
      skipped: [],
    },
    mr: { required: true, status: "none" },
    blockers: [],
    feedback: [],
    history: [],
    revision: {
      number: 0,
      contentHash: "pending-materialization",
      updatedBy: "autopilot-materializer",
      updatedAt,
    },
  };

  const hash = crypto.createHash("sha256").update(JSON.stringify(ledger)).digest("hex");
  ledger.revision = { ...(ledger.revision as Record<string, unknown>), contentHash: `sha256:${hash}` };
  return ledger;
}

function removeOwnedTempFile(tempPath: string): void {
  try {
    if (fs.existsSync(tempPath) && fs.statSync(tempPath).isFile()) {
      fs.rmSync(tempPath, { force: true });
    }
  } catch {
    // Cleanup is best-effort and limited to the materializer-owned temp file.
  }
}

function validateRealChangePath(root: string, changesRoot: string, changeDir: string): string | null {
  if (isSymlinkPath(changesRoot)) {
    return "Autopilot ledger root must not be a symlink or junction.";
  }
  if (!realPathIsInside(root, changesRoot)) {
    return "Autopilot ledger root real path escapes the repository root.";
  }
  return realPathIsInside(changesRoot, changeDir) ? null : "Resolved OpenSpec change real path escapes the changes root.";
}

function validateTasksFile(tasksPath: string): string | null {
  const taskStat = fs.lstatSync(tasksPath);
  if (taskStat.isSymbolicLink()) {
    return "Selected active OpenSpec tasks.md must not be a symlink.";
  }
  if (!taskStat.isFile()) {
    return "Selected active OpenSpec tasks.md exists but is not a file.";
  }
  return null;
}

function prepareAutomationDirectory(changeDir: string, automationDir: string): string | null {
  fs.mkdirSync(automationDir, { recursive: true });
  const automationStat = fs.lstatSync(automationDir);
  if (automationStat.isSymbolicLink()) {
    return "Selected active OpenSpec automation directory must not be a symlink or junction.";
  }
  if (!automationStat.isDirectory()) {
    return "Selected active OpenSpec automation path exists but is not a directory.";
  }
  const realChangeDir = fs.realpathSync(changeDir);
  const realAutomationDir = fs.realpathSync(automationDir);
  return pathIsInside(realChangeDir, realAutomationDir) ? null : "Selected active OpenSpec automation real path escapes the change directory.";
}

function publishTempFileWithoutClobber(tempPath: string, finalPath: string): "published" | "exists" {
  try {
    fs.linkSync(tempPath, finalPath);
    return "published";
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      return "exists";
    }
    throw error;
  } finally {
    removeOwnedTempFile(tempPath);
  }
}

export function materializeActiveChangeLedger(root: string, selectedChangeId: string, options: MaterializeActiveChangeLedgerOptions = {}): MaterializeActiveChangeLedgerResult {
  const changeId = normalizeChangeId(selectedChangeId);
  if (changeId == null) {
    return { created: false, reason: "Selected active OpenSpec change id is unsafe or unsupported." };
  }

  const ledgerRoot = safeRelativeRoot(options.ledgerRoot, "openspec/changes", "ledgerRoot");
  const changesRoot = path.resolve(root, ledgerRoot);
  const changeDir = path.resolve(changesRoot, changeId);
  if (!pathIsInside(changesRoot, changeDir)) {
    return { created: false, changeId, reason: "Resolved OpenSpec change path escapes the changes root." };
  }

  const tasksPath = path.join(changeDir, "tasks.md");
  const finalPath = path.join(changeDir, "automation", "task.json");
  const finalRelativePath = toRelative(root, finalPath);
  const archivedTasksPath = path.join(changesRoot, "archive", changeId, "tasks.md");
  if (fs.existsSync(archivedTasksPath)) {
    return { created: false, changeId, path: toRelative(root, archivedTasksPath), reason: "Selected OpenSpec change is archived; materialization is not allowed." };
  }
  if (!fs.existsSync(tasksPath)) {
    return { created: false, changeId, path: toRelative(root, tasksPath), reason: "Selected active OpenSpec change has no tasks.md." };
  }
  try {
    const realPathError = validateRealChangePath(root, changesRoot, changeDir);
    if (realPathError != null) {
      return { created: false, changeId, path: toRelative(root, changeDir), reason: realPathError };
    }
    const tasksError = validateTasksFile(tasksPath);
    if (tasksError != null) {
      return { created: false, changeId, path: toRelative(root, tasksPath), reason: tasksError };
    }
    const counts = countMarkdownChecklistItems(fs.readFileSync(tasksPath, "utf8"));
    if (counts.total === 0 || counts.unchecked === 0) {
      return { created: false, changeId, path: toRelative(root, tasksPath), reason: "Selected active OpenSpec change has no unchecked tasks." };
    }
    if (fs.existsSync(finalPath)) {
      return { created: false, changeId, path: finalRelativePath, reason: "Selected active OpenSpec change already has an authoritative task ledger." };
    }

    const updatedAt = (options.now ?? (() => new Date()))().toISOString();
    const ledger = buildLedger(root, ledgerRoot, changeId, finalRelativePath, updatedAt);
    const candidateValidation = validateTaskLedger(ledger, { sourcePath: finalRelativePath });
    if (!candidateValidation.valid) {
      return { created: false, changeId, path: finalRelativePath, reason: "Materialized candidate task ledger failed validation before publication.", errors: candidateValidation.errors };
    }

    const automationDir = path.dirname(finalPath);
    const automationError = prepareAutomationDirectory(changeDir, automationDir);
    if (automationError != null) {
      return { created: false, changeId, path: toRelative(root, automationDir), reason: automationError };
    }
    const tempPath = path.join(automationDir, `.task.materializing-${process.pid}-${Date.now()}.tmp`);
    try {
      fs.writeFileSync(tempPath, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      const serialized = JSON.parse(fs.readFileSync(tempPath, "utf8")) as unknown;
      const serializedValidation = validateTaskLedger(serialized, { sourcePath: `${toRelative(root, tempPath)}#serialized` });
      if (!serializedValidation.valid) {
        removeOwnedTempFile(tempPath);
        return { created: false, changeId, path: finalRelativePath, reason: "Serialized materialized task ledger failed validation before publication.", errors: serializedValidation.errors };
      }
      if (fs.existsSync(finalPath)) {
        removeOwnedTempFile(tempPath);
        return { created: false, changeId, path: finalRelativePath, reason: "Selected active OpenSpec change received an authoritative task ledger before publication." };
      }
      const published = publishTempFileWithoutClobber(tempPath, finalPath);
      if (published === "exists") {
        return { created: false, changeId, path: finalRelativePath, reason: "Selected active OpenSpec change received an authoritative task ledger before publication." };
      }
    } catch (error) {
      removeOwnedTempFile(tempPath);
      const message = error instanceof Error ? error.message : String(error);
      return { created: false, changeId, path: finalRelativePath, reason: `Failed to publish materialized task ledger: ${message}` };
    }

    const finalLedger = JSON.parse(fs.readFileSync(finalPath, "utf8")) as Record<string, unknown>;
    const finalValidation = validateTaskLedger(finalLedger, { sourcePath: finalRelativePath });
    if (!finalValidation.valid) {
      return { created: false, changeId, path: finalRelativePath, reason: "Published materialized task ledger failed final validation.", errors: finalValidation.errors };
    }
    return { created: true, changeId, taskId: changeId, path: finalRelativePath, validation: finalValidation, ledger: finalLedger };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { created: false, changeId, path: toRelative(root, tasksPath), reason: `Failed to materialize active OpenSpec change: ${message}` };
  }
}
