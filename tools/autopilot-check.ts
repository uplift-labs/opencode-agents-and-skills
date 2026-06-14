#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { redactText } from "./autopilot-evidence.ts";
import { validateTaskLedger } from "./autopilot-ledger.ts";
import { isActiveAutopilotRuntimeStatus, validateAutopilotRuntimeSnapshot } from "./autopilot-runtime-store.ts";
import { inspectAutopilotChangeFreshness } from "./autopilot-report-freshness.ts";
import { countMarkdownChecklistItems } from "./openspec-autopilot-active-change-queue.ts";
import { readLedgerSummaries, type LedgerSummary } from "./openspec-autopilot-output.ts";

export type AutopilotCheckLevel = "cheap" | "standard" | "prepush" | "final";
export type AutopilotCheckStatus = "passed" | "warning" | "failed" | "blocked" | "unknown" | "not-applicable";
export type AutopilotCheckOutputStatus = "passed" | "warning" | "failed" | "blocked";
export type AutopilotCheckFormat = "json" | "markdown";

export type AutopilotCheckCommand = {
  id: string;
  label: string;
  command: string;
  args: string[];
  source: string;
  blocking: boolean;
  skipReason?: string;
};

export type AutopilotCheckCommandResult = {
  status: number | null;
  signal?: NodeJS.Signals | null;
  error?: Error | null;
  stdout?: string;
  stderr?: string;
};

export type AutopilotCheckCommandRunner = (root: string, command: AutopilotCheckCommand) => AutopilotCheckCommandResult;

export type AutopilotCheckItem = {
  id: string;
  label: string;
  status: AutopilotCheckStatus;
  blocking: boolean;
  command?: string;
  source: string;
  summary: string;
};

export type AutopilotCheckNextAction = {
  label: string;
  reason: string;
  command?: string;
};

export type AutopilotCheckOutput = {
  schemaVersion: 1;
  level: AutopilotCheckLevel;
  generatedAt: string;
  scope: {
    changes: string[];
    ledgers: string[];
  };
  status: AutopilotCheckOutputStatus;
  exitCode: number;
  checks: AutopilotCheckItem[];
  nextActions: AutopilotCheckNextAction[];
};

export type AutopilotCheckOptions = {
  level?: AutopilotCheckLevel;
  change?: string;
  ledgers?: string[];
  changedFiles?: string[];
  additionalCommands?: AutopilotCheckCommand[];
  generatedAt?: string;
  failOnWarnings?: boolean;
  showPaths?: boolean;
  commandRunner?: AutopilotCheckCommandRunner;
};

type ActiveChange = {
  id: string;
  path: string;
};

type ScopeIssue = {
  id: string;
  label: string;
  source: string;
  summary: string;
};

export type AutopilotCheckInventory = {
  changes: ActiveChange[];
  ledgers: LedgerSummary[];
  changedFiles: string[];
  scopeIssues: ScopeIssue[];
};

export type AutopilotCheckPlan = {
  level: AutopilotCheckLevel;
  generatedAt: string;
  scope: {
    changes: string[];
    ledgers: string[];
  };
  inventory: AutopilotCheckInventory;
  checks: AutopilotCheckItem[];
  commands: AutopilotCheckCommand[];
};

type CliOptions = AutopilotCheckOptions & {
  root: string;
  format: AutopilotCheckFormat;
};

const checkLevels = new Set<AutopilotCheckLevel>(["cheap", "standard", "prepush", "final"]);
const outputFormats = new Set<AutopilotCheckFormat>(["json", "markdown"]);
const terminalLedgerStatuses = new Set(["Done", "Failed", "Cancelled"]);

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function repoRelative(root: string, filePath: string): string {
  return normalizePath(path.relative(root, filePath) || filePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function safeChangeId(changeId: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(changeId) && !changeId.includes("..") && !changeId.includes("/") && !changeId.includes("\\");
}

function normalizeOptionalChangeId(changeId: string | undefined): string | undefined {
  if (changeId == null || changeId.trim().length === 0) {
    return undefined;
  }
  return changeId.trim();
}

function npmCommand(): string {
  return "npm";
}

function commandText(command: AutopilotCheckCommand): string {
  return [command.command, ...command.args].join(" ").trim();
}

function quoteWindowsCommandArg(value: string): string {
  if (/^[A-Za-z0-9._/:\\=-]+$/.test(value)) {
    return value;
  }
  return `"${value.replaceAll("\"", "\\\"")}"`;
}

function spawnCommand(root: string, command: AutopilotCheckCommand): ReturnType<typeof spawnSync> {
  if (command.command === "node") {
    return spawnSync(process.execPath, command.args, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 * 4 });
  }
  if (process.platform === "win32") {
    const executable = process.env.ComSpec ?? "cmd.exe";
    const commandLine = [command.command, ...command.args].map(quoteWindowsCommandArg).join(" ");
    return spawnSync(executable, ["/d", "/s", "/c", commandLine], { cwd: root, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 * 4 });
  }
  return spawnSync(command.command, command.args, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 * 4 });
}

function commandKey(command: Pick<AutopilotCheckCommand, "command" | "args">): string {
  return `${command.command}\0${command.args.join("\0")}`;
}

export function deduplicateCheckCommands(commands: AutopilotCheckCommand[]): AutopilotCheckCommand[] {
  const seen = new Set<string>();
  const deduped: AutopilotCheckCommand[] = [];
  for (const command of commands) {
    const key = commandKey(command);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(command);
  }
  return deduped;
}

function parsePorcelainStatusPaths(output: string): string[] {
  const paths: string[] = [];
  const parts = output.split("\0").filter((part) => part.length > 0);
  for (let index = 0; index < parts.length; index++) {
    const entry = parts[index];
    const status = entry.slice(0, 2);
    const firstPath = entry.slice(3).trim();
    if (firstPath.length === 0) {
      continue;
    }
    if ((status.includes("R") || status.includes("C")) && index + 1 < parts.length) {
      paths.push(parts[index + 1].trim());
      index++;
    } else {
      paths.push(firstPath);
    }
  }
  return Array.from(new Set(paths.map(normalizePath))).sort((left, right) => left.localeCompare(right));
}

function collectChangedFiles(root: string): string[] {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) {
    return [];
  }
  return parsePorcelainStatusPaths(result.stdout ?? "");
}

function discoverActiveChanges(root: string): ActiveChange[] {
  const changesRoot = path.join(root, "openspec", "changes");
  if (!fs.existsSync(changesRoot) || !fs.statSync(changesRoot).isDirectory()) {
    return [];
  }
  return fs.readdirSync(changesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "archive")
    .map((entry) => ({ id: entry.name, path: normalizePath(path.join("openspec", "changes", entry.name)) }))
    .filter((entry) => safeChangeId(entry.id))
    .filter((entry) => fs.existsSync(path.join(root, entry.path, "tasks.md")))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resolveRepoFile(root: string, input: string): { relativePath: string; absolutePath: string; issue?: ScopeIssue } {
  const trimmed = input.trim();
  const label = "Autopilot scoped ledger";
  if (trimmed.length === 0) {
    return { relativePath: input, absolutePath: root, issue: { id: "scope:ledger:<empty>", label, source: "cli", summary: "Scoped ledger path is empty." } };
  }
  const absolutePath = path.resolve(root, trimmed);
  const relative = path.relative(root, absolutePath);
  const relativePath = normalizePath(relative);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return { relativePath: "<outside-repo>", absolutePath, issue: { id: "scope:ledger:<outside-repo>", label, source: "<outside-repo>", summary: "Scoped ledger path is outside the repository." } };
  }
  if (relativePath.startsWith("openspec/changes/archive/")) {
    return { relativePath, absolutePath, issue: { id: `scope:ledger:${relativePath}`, label, source: relativePath, summary: "Scoped ledger path is archived and is not an active Autopilot ledger." } };
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return { relativePath, absolutePath, issue: { id: `scope:ledger:${relativePath}`, label, source: relativePath, summary: "Scoped ledger path is missing or unreadable." } };
  }
  return { relativePath, absolutePath };
}

function readScopedLedger(root: string, absolutePath: string): LedgerSummary {
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown;
    const result = validateTaskLedger(parsed, { sourcePath: repoRelative(root, absolutePath) });
    const record = isRecord(parsed) ? parsed : {};
    const mr = isRecord(record.mr) ? record.mr : {};
    const scope = isRecord(record.scope) ? record.scope : {};
    const changeRoot = path.dirname(path.dirname(absolutePath));
    const tasksPath = path.join(changeRoot, "tasks.md");
    const counts = fs.existsSync(tasksPath) && fs.statSync(tasksPath).isFile()
      ? countMarkdownChecklistItems(fs.readFileSync(tasksPath, "utf8"))
      : undefined;
    const status = asString(record.status, "unknown");
    const staleCompleted = counts != null && counts.total > 0 && counts.unchecked === 0 && !terminalLedgerStatuses.has(status);
    return {
      path: repoRelative(root, absolutePath),
      id: asString(record.id, path.basename(absolutePath, ".json")),
      sourceKind: "ledger",
      taskType: asString(record.taskType, "unknown"),
      status,
      priority: asString(record.priority, ""),
      dependencies: asStringArray(record.dependencies),
      writeScope: asStringArray(scope.write),
      forbiddenScope: asStringArray(scope.forbidden),
      writeScopeSize: asStringArray(scope.write).length,
      valid: result.valid,
      errors: result.errors,
      blockers: asRecordArray(record.blockers),
      checkedTasks: counts?.checked,
      uncheckedTasks: counts?.unchecked,
      totalTasks: counts?.total,
      staleCompleted,
      ledger: record,
      mr: {
        status: typeof mr.status === "string" ? mr.status : undefined,
        url: typeof mr.url === "string" ? mr.url : undefined,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      path: repoRelative(root, absolutePath),
      id: path.basename(absolutePath, ".json"),
      sourceKind: "ledger",
      taskType: "unknown",
      status: "unknown",
      priority: "",
      dependencies: [],
      writeScope: [],
      forbiddenScope: [],
      writeScopeSize: 0,
      valid: false,
      errors: [`${repoRelative(root, absolutePath)}: ${message}`],
      blockers: [],
    };
  }
}

function changeIdForLedgerPath(ledgerPath: string): string | null {
  const parts = normalizePath(ledgerPath).split("/");
  const changesIndex = parts.indexOf("changes");
  if (changesIndex >= 0 && parts[changesIndex - 1] === "openspec" && parts[changesIndex + 1] && parts[changesIndex + 1] !== "archive") {
    return parts[changesIndex + 1];
  }
  return null;
}

function changedChangeIds(files: string[]): string[] {
  const ids = new Set<string>();
  for (const file of files.map(normalizePath)) {
    const parts = file.split("/");
    const changesIndex = parts.indexOf("changes");
    if (parts[changesIndex - 1] === "openspec" && parts[changesIndex + 1] && parts[changesIndex + 1] !== "archive") {
      ids.add(parts[changesIndex + 1]);
    }
  }
  return Array.from(ids).sort((left, right) => left.localeCompare(right));
}

function filterLedgersByChange(ledgers: LedgerSummary[], changeId: string | undefined): LedgerSummary[] {
  if (changeId == null) {
    return ledgers;
  }
  return ledgers.filter((ledger) => changeIdForLedgerPath(ledger.path) === changeId);
}

function buildInventory(root: string, options: AutopilotCheckOptions): AutopilotCheckInventory {
  const changeId = normalizeOptionalChangeId(options.change);
  const changedFiles = (options.changedFiles ?? collectChangedFiles(root)).map(normalizePath).sort((left, right) => left.localeCompare(right));
  const scopeIssues: ScopeIssue[] = [];
  const allChanges = discoverActiveChanges(root);
  let changes = changeId == null ? allChanges : allChanges.filter((change) => change.id === changeId);

  if (changeId != null && !safeChangeId(changeId)) {
    scopeIssues.push({ id: `scope:change:${changeId}`, label: "Autopilot scoped change", source: changeId, summary: "Scoped change id is invalid." });
    changes = [];
  } else if (changeId != null && changes.length === 0) {
    scopeIssues.push({ id: `scope:change:${changeId}`, label: "Autopilot scoped change", source: changeId, summary: "Scoped active change is missing or has no tasks.md." });
  }

  let ledgers: LedgerSummary[];
  const hasExplicitLedgerScope = (options.ledgers ?? []).length > 0;
  if ((options.ledgers ?? []).length > 0) {
    const scopedLedgers: LedgerSummary[] = [];
    for (const ledgerPath of options.ledgers ?? []) {
      const resolved = resolveRepoFile(root, ledgerPath);
      if (resolved.issue) {
        scopeIssues.push(resolved.issue);
        continue;
      }
      scopedLedgers.push(readScopedLedger(root, resolved.absolutePath));
    }
    ledgers = scopedLedgers;
  } else {
    ledgers = readLedgerSummaries(root);
  }

  if (hasExplicitLedgerScope && changeId != null && safeChangeId(changeId)) {
    for (const ledger of ledgers) {
      const ledgerChangeId = changeIdForLedgerPath(ledger.path);
      if (ledgerChangeId !== changeId) {
        scopeIssues.push({
          id: `scope:ledger-change-mismatch:${ledger.path}`,
          label: "Autopilot scoped ledger",
          source: ledger.path,
          summary: `Scoped ledger belongs to ${ledgerChangeId ?? "unknown change"}, not scoped change ${changeId}.`,
        });
      }
    }
  } else {
    ledgers = filterLedgersByChange(ledgers, changeId);
  }
  ledgers = ledgers.sort((left, right) => left.path.localeCompare(right.path));
  return { changes, ledgers, changedFiles, scopeIssues };
}

function scopeChecks(issues: ScopeIssue[]): AutopilotCheckItem[] {
  return issues.map((issue) => ({
    id: issue.id,
    label: issue.label,
    status: "failed",
    blocking: true,
    source: issue.source,
    summary: issue.summary,
  }));
}

function activeChangeCheck(changes: ActiveChange[]): AutopilotCheckItem {
  if (changes.length === 0) {
    return {
      id: "active-changes:none",
      label: "Active OpenSpec change inventory",
      status: "not-applicable",
      blocking: false,
      source: "openspec/changes",
      summary: "No active OpenSpec changes with tasks.md were discovered in scope.",
    };
  }
  return {
    id: "active-changes:inventory",
    label: "Active OpenSpec change inventory",
    status: "passed",
    blocking: false,
    source: "openspec/changes",
    summary: `Discovered active changes: ${changes.map((change) => change.id).join(", ")}.`,
  };
}

function ledgerChecks(ledgers: LedgerSummary[]): AutopilotCheckItem[] {
  if (ledgers.length === 0) {
    return [{
      id: "autopilot-ledgers:none",
      label: "Autopilot ledger validation",
      status: "not-applicable",
      blocking: false,
      source: "openspec/changes/*/automation/task.json",
      summary: "No active Autopilot task ledgers were discovered; absence is not a failure for unscoped checks.",
    }];
  }
  return ledgers.map((ledger) => {
    if (ledger.staleCompleted === true) {
      return {
        id: `autopilot-ledger:stale-completed:${ledger.id}`,
        label: "Autopilot stale completed ledger",
        status: "warning",
        blocking: false,
        source: ledger.path,
        summary: `Ledger ${ledger.id} is ${ledger.status}, but sibling tasks.md checklist is complete (${ledger.checkedTasks ?? 0}/${ledger.totalTasks ?? 0}); reconcile before selecting as live work.`,
      };
    }
    return {
      id: `autopilot-ledger:${ledger.id}`,
      label: "Autopilot ledger validation",
      status: ledger.valid ? "passed" : "failed",
      blocking: !ledger.valid,
      source: ledger.path,
      summary: ledger.valid
        ? `${ledger.taskType} ledger ${ledger.id} is ${ledger.status}; write scopes=${ledger.writeScopeSize}.`
        : `Invalid ledger ${ledger.id}: ${ledger.errors.join("; ")}`,
    };
  });
}

function runtimeWriteGateCheck(root: string): AutopilotCheckItem {
  const source = ".autopilot/runtime/state.json";
  const runtimePath = path.join(root, source);
  if (!fs.existsSync(runtimePath)) {
    return {
      id: "write-gate:runtime:none",
      label: "Autopilot write gate runtime evidence",
      status: "not-applicable",
      blocking: false,
      source,
      summary: "No durable Autopilot runtime state exists; write gate remains in protected-path-only mode.",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "write-gate:runtime:invalid",
      label: "Autopilot write gate runtime evidence",
      status: "failed",
      blocking: true,
      source,
      summary: `Runtime state is unreadable; write gate must fail closed for mutations: ${message}`,
    };
  }
  const validation = validateAutopilotRuntimeSnapshot(parsed);
  if (!validation.valid) {
    return {
      id: "write-gate:runtime:invalid",
      label: "Autopilot write gate runtime evidence",
      status: "failed",
      blocking: true,
      source,
      summary: `Runtime state is schema-invalid; write gate must fail closed for mutations: ${validation.errors.join("; ")}`,
    };
  }
  const runs = isRecord(parsed.runs) ? Object.values(parsed.runs).filter(isRecord) : [];
  const active = runs.filter((run) => isActiveAutopilotRuntimeStatus(run.status));
  const activeTasks = active.flatMap((run) => typeof run.taskId === "string" ? [run.taskId] : []).sort((left, right) => left.localeCompare(right));
  return {
    id: active.length > 0 ? "write-gate:runtime:active" : "write-gate:runtime:valid",
    label: "Autopilot write gate runtime evidence",
    status: "passed",
    blocking: false,
    source,
    summary: active.length > 0
      ? `Runtime state is valid with active write ownership for ${active.length} run(s): ${activeTasks.join(", ")}. Main-session mutations should be blocked by the plugin write gate.`
      : "Runtime state is valid and has no active write ownership.",
  };
}

function freshnessCheck(root: string, level: AutopilotCheckLevel, changeId: string): AutopilotCheckItem {
  const mode = level === "final" ? "archive-strict" : "advisory";
  const report = inspectAutopilotChangeFreshness({ root, changeId, mode });
  let status: AutopilotCheckStatus = "passed";
  if (report.summary.error > 0) {
    status = "failed";
  } else if (report.summary.warning > 0) {
    status = "warning";
  } else if (report.summary.unknown > 0) {
    status = "unknown";
  }
  return {
    id: `freshness:${changeId}`,
    label: "Autopilot evidence freshness",
    status,
    blocking: level === "final" && status === "failed",
    source: report.paths.change,
    summary: `Freshness ${mode}: pass=${report.summary.pass}, warning=${report.summary.warning}, error=${report.summary.error}, unknown=${report.summary.unknown}.`,
  };
}

function changesForFreshness(level: AutopilotCheckLevel, inventory: AutopilotCheckInventory, options: AutopilotCheckOptions): string[] {
  const scopedChange = normalizeOptionalChangeId(options.change);
  if (scopedChange != null && inventory.changes.some((change) => change.id === scopedChange)) {
    return [scopedChange];
  }
  if (level === "cheap") {
    return [];
  }
  const activeIds = new Set(inventory.changes.map((change) => change.id));
  return changedChangeIds(inventory.changedFiles).filter((id) => activeIds.has(id));
}

function buildStaticChecks(root: string, level: AutopilotCheckLevel, inventory: AutopilotCheckInventory, options: AutopilotCheckOptions): AutopilotCheckItem[] {
  const checks: AutopilotCheckItem[] = [
    ...scopeChecks(inventory.scopeIssues),
    activeChangeCheck(inventory.changes),
    ...ledgerChecks(inventory.ledgers),
    runtimeWriteGateCheck(root),
  ];
  if (level === "final" && normalizeOptionalChangeId(options.change) == null) {
    checks.push({
      id: "scope:change:required-for-final",
      label: "Autopilot final change scope",
      status: "blocked",
      blocking: true,
      source: "cli",
      summary: "Final Autopilot validation requires --change <change-id> so retro and archive gates are scoped.",
    });
  }
  for (const changeId of changesForFreshness(level, inventory, options)) {
    checks.push(freshnessCheck(root, level, changeId));
  }
  return checks;
}

function validationCommand(id: string, label: string, args: string[], source: string, blocking = true): AutopilotCheckCommand {
  return { id, label, command: npmCommand(), args, source, blocking };
}

function freshnessCommand(changeId: string): AutopilotCheckCommand {
  return {
    id: `command:freshness:${changeId}`,
    label: "Autopilot evidence freshness",
    command: "node",
    args: ["tools/autopilot-report-freshness.ts", changeId, "--mode", "archive-strict"],
    source: `openspec/changes/${changeId}`,
    blocking: true,
  };
}

function ledgerValidationCommand(ledgers: LedgerSummary[]): AutopilotCheckCommand | null {
  if (ledgers.length === 0) {
    return null;
  }
  return validationCommand(
    "command:autopilot-ledger-validation",
    "Autopilot ledger validation",
    ["run", "autopilot:validate", "--", ...ledgers.map((ledger) => ledger.path).sort((left, right) => left.localeCompare(right))],
    "active-ledger-discovery",
  );
}

export function buildPrePushAutopilotLedgerGate(root: string): AutopilotCheckCommand {
  const ledgers = readLedgerSummaries(root).sort((left, right) => left.path.localeCompare(right.path));
  const command = ledgerValidationCommand(ledgers);
  return command ?? {
    id: "command:autopilot-ledger-validation:none",
    label: "Autopilot ledger validation",
    command: npmCommand(),
    args: [],
    source: "active-ledger-discovery",
    blocking: false,
    skipReason: "No active Autopilot ledgers discovered.",
  };
}

export function buildPrePushAutopilotFreshnessGates(root: string, options: Pick<AutopilotCheckOptions, "changedFiles"> = {}): AutopilotCheckCommand[] {
  return planAutopilotChecks(root, { level: "prepush", changedFiles: options.changedFiles }).commands.filter((command) => command.id.startsWith("command:freshness:"));
}

function buildCommands(root: string, level: AutopilotCheckLevel, inventory: AutopilotCheckInventory, options: AutopilotCheckOptions): AutopilotCheckCommand[] {
  const commands: AutopilotCheckCommand[] = [];
  const openspecExists = fs.existsSync(path.join(root, "openspec"));
  const freshnessChanges = changesForFreshness(level, inventory, options);

  if (level === "standard") {
    for (const changeId of freshnessChanges) {
      commands.push(validationCommand(`command:evidence-collect:${changeId}`, "Autopilot evidence collect", ["run", "autopilot:evidence", "--", "--change", changeId, "--mode", "collect"], `openspec/changes/${changeId}`, false));
    }
  }

  if (level === "prepush" || level === "final") {
    commands.push(validationCommand("command:repository-validation", "Repository validation", ["run", "validate"], "package.json"));
    const ledgerCommand = ledgerValidationCommand(inventory.ledgers);
    if (ledgerCommand) {
      commands.push(ledgerCommand);
    }
    commands.push(validationCommand("command:repository-tests", "Repository tests", ["test"], "package.json"));
    if (openspecExists) {
      commands.push(validationCommand("command:openspec-validation", "OpenSpec validation", ["run", "openspec:validate"], "package.json"));
    }
    if (level === "prepush") {
      for (const changeId of freshnessChanges) {
        commands.push(freshnessCommand(changeId));
      }
    }
  }

  if (level === "final") {
    for (const changeId of freshnessChanges) {
      commands.push(validationCommand(`command:retro-followups:${changeId}`, "OpenSpec retrospective follow-ups", ["run", "openspec:retro-followups", "--", changeId], `openspec/changes/${changeId}`));
      commands.push(validationCommand(`command:retro-gate:${changeId}`, "OpenSpec retrospective gate", ["run", "openspec:retro-gate", "--", changeId], `openspec/changes/${changeId}`));
    }
  }

  return deduplicateCheckCommands([...commands, ...(options.additionalCommands ?? [])]);
}

export function planAutopilotChecks(root: string, options: AutopilotCheckOptions = {}): AutopilotCheckPlan {
  const resolvedRoot = path.resolve(root);
  const level = options.level ?? "cheap";
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const inventory = buildInventory(resolvedRoot, options);
  const checks = buildStaticChecks(resolvedRoot, level, inventory, options);
  const commands = buildCommands(resolvedRoot, level, inventory, options);
  return {
    level,
    generatedAt,
    scope: {
      changes: inventory.changes.map((change) => change.id).sort((left, right) => left.localeCompare(right)),
      ledgers: inventory.ledgers.map((ledger) => ledger.path).sort((left, right) => left.localeCompare(right)),
    },
    inventory,
    checks,
    commands,
  };
}

function defaultCommandRunner(root: string, command: AutopilotCheckCommand): AutopilotCheckCommandResult {
  if (command.skipReason) {
    return { status: 0, signal: null, stdout: command.skipReason, stderr: "" };
  }
  const result = spawnCommand(root, command);
  return { status: result.status, signal: result.signal, error: result.error ?? null, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function exitCodeFromCommandResult(result: Pick<AutopilotCheckCommandResult, "status" | "signal" | "error">): number {
  if (result.error || result.status == null) {
    return 1;
  }
  return result.status;
}

function summarizeCommandResult(root: string, command: AutopilotCheckCommand, result: AutopilotCheckCommandResult, showPaths = false): string {
  if (command.skipReason) {
    return command.skipReason;
  }
  if (result.error) {
    return `Failed to start command: ${result.error.message}`;
  }
  const signal = result.signal ? ` Signal: ${result.signal}.` : "";
  const combined = redactText(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(), root, showPaths);
  const lines = combined.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const compact = lines.slice(0, 4).join(" | ");
  const summary = compact.length > 320 ? `${compact.slice(0, 317)}...` : compact;
  return summary || `No output.${signal}`;
}

function commandCheck(root: string, command: AutopilotCheckCommand, result: AutopilotCheckCommandResult, showPaths = false): AutopilotCheckItem {
  if (command.skipReason) {
    return {
      id: command.id,
      label: command.label,
      status: "not-applicable",
      blocking: false,
      command: undefined,
      source: command.source,
      summary: command.skipReason,
    };
  }
  const exitCode = exitCodeFromCommandResult(result);
  return {
    id: command.id,
    label: command.label,
    status: exitCode === 0 ? "passed" : "failed",
    blocking: command.blocking,
    command: commandText(command),
    source: command.source,
    summary: summarizeCommandResult(root, command, result, showPaths),
  };
}

function outputStatus(checks: AutopilotCheckItem[]): AutopilotCheckOutputStatus {
  if (checks.some((check) => check.status === "blocked")) {
    return "blocked";
  }
  if (checks.some((check) => check.status === "failed")) {
    return "failed";
  }
  if (checks.some((check) => check.status === "warning" || check.status === "unknown")) {
    return "warning";
  }
  return "passed";
}

function hasBlockingFailure(checks: AutopilotCheckItem[]): boolean {
  return checks.some((check) => check.blocking && (check.status === "failed" || check.status === "blocked"));
}

function hasBlockingScopeFailure(checks: AutopilotCheckItem[]): boolean {
  return checks.some((check) => check.id.startsWith("scope:") && check.blocking && (check.status === "failed" || check.status === "blocked"));
}

function hasWarnings(checks: AutopilotCheckItem[]): boolean {
  return checks.some((check) => check.status === "warning" || check.status === "unknown");
}

function nextActions(checks: AutopilotCheckItem[], failOnWarnings = false): AutopilotCheckNextAction[] {
  return checks
    .filter((check) => check.status === "failed" || check.status === "blocked" || check.id.startsWith("autopilot-ledger:stale-completed:") || (failOnWarnings && (check.status === "warning" || check.status === "unknown")))
    .map((check) => ({
      label: check.id.startsWith("autopilot-ledger:stale-completed:") ? "Reconcile stale completed ledger" : `Fix ${check.label}`,
      reason: check.summary,
      command: check.command,
    }));
}

export function runAutopilotCheck(root: string, options: AutopilotCheckOptions = {}): AutopilotCheckOutput {
  const resolvedRoot = path.resolve(root);
  const plan = planAutopilotChecks(resolvedRoot, options);
  const runner = options.commandRunner ?? defaultCommandRunner;
  const checks = [...plan.checks];

  if (!hasBlockingScopeFailure(checks)) {
    for (const command of plan.commands) {
      const result = runner(resolvedRoot, command);
      const check = commandCheck(resolvedRoot, command, result, options.showPaths);
      checks.push(check);
      if (check.blocking && check.status === "failed") {
        break;
      }
    }
  }

  const status = outputStatus(checks);
  const exitCode = hasBlockingFailure(checks) || (options.failOnWarnings === true && hasWarnings(checks)) ? 1 : 0;
  return {
    schemaVersion: 1,
    level: plan.level,
    generatedAt: plan.generatedAt,
    scope: plan.scope,
    status,
    exitCode,
    checks,
    nextActions: nextActions(checks, options.failOnWarnings),
  };
}

export function renderAutopilotCheckMarkdown(output: AutopilotCheckOutput): string {
  const cell = (value: unknown): string => String(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  const lines = [
    `# Autopilot Check: ${output.level}`,
    "",
    `Generated: ${output.generatedAt}`,
    `Status: ${output.status}`,
    `Exit code: ${output.exitCode}`,
    "",
    "## Scope",
    "",
    `- Changes: ${output.scope.changes.length > 0 ? output.scope.changes.map((change) => `\`${change}\``).join(", ") : "none"}`,
    `- Ledgers: ${output.scope.ledgers.length > 0 ? output.scope.ledgers.map((ledger) => `\`${ledger}\``).join(", ") : "none"}`,
    "",
    "## Checks",
    "",
    "| ID | Status | Blocking | Source | Summary |",
    "| --- | --- | --- | --- | --- |",
    ...output.checks.map((check) => `| ${cell(check.id)} | ${cell(check.status)} | ${String(check.blocking)} | ${cell(check.source)} | ${cell(check.summary)} |`),
    "",
    "## Next Actions",
    "",
    ...(output.nextActions.length > 0 ? output.nextActions.map((action) => `- ${action.label}: ${action.reason}${action.command ? ` (\`${action.command}\`)` : ""}`) : ["- none"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function parseCli(args: string[]): CliOptions {
  const options: CliOptions = { root: process.cwd(), level: "cheap", format: "json", ledgers: [] };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--root") {
      options.root = path.resolve(requireValue(args, ++index, arg));
    } else if (arg === "--level") {
      const value = requireValue(args, ++index, arg) as AutopilotCheckLevel;
      if (!checkLevels.has(value)) {
        throw new Error("--level must be one of cheap, standard, prepush, final.");
      }
      options.level = value;
    } else if (arg === "--change") {
      options.change = requireValue(args, ++index, arg);
    } else if (arg === "--ledger") {
      options.ledgers = [...(options.ledgers ?? []), requireValue(args, ++index, arg)];
    } else if (arg === "--format") {
      const value = requireValue(args, ++index, arg) as AutopilotCheckFormat;
      if (!outputFormats.has(value)) {
        throw new Error("--format must be json or markdown.");
      }
      options.format = value;
    } else if (arg === "--fail-on-warnings") {
      options.failOnWarnings = true;
    } else if (arg === "--show-paths") {
      options.showPaths = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function runCli(args: string[]): number {
  let options: CliOptions;
  try {
    options = parseCli(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const output = runAutopilotCheck(options.root, options);
  process.stdout.write(options.format === "markdown" ? renderAutopilotCheckMarkdown(output) : `${JSON.stringify(output, null, 2)}\n`);
  return output.exitCode;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href);
}

if (isMainModule()) {
  process.exitCode = runCli(process.argv.slice(2));
}
