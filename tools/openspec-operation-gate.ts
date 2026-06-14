#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTaskLedger } from "./autopilot-ledger.ts";
import { countMarkdownChecklistItems } from "./openspec-autopilot-active-change-queue.ts";

export type OpenSpecOperationGateStatus = "passed" | "warning" | "failed" | "blocked" | "unknown" | "not-applicable";

export type OpenSpecOperationGateCheck = {
  id: string;
  label: string;
  status: OpenSpecOperationGateStatus;
  blocking: boolean;
  source: string;
  summary: string;
};

export type OpenSpecOperationGateOutput = {
  schemaVersion: 1;
  operation: string;
  changeId?: string;
  generatedAt: string;
  status: Exclude<OpenSpecOperationGateStatus, "not-applicable">;
  exitCode: number;
  checks: OpenSpecOperationGateCheck[];
  nextActions: Array<{ label: string; reason: string }>;
  persistedPath?: string;
};

export type OpenSpecOperationGateOptions = {
  operation: string;
  changeId?: string;
  generatedAt?: string;
  persist?: boolean;
};

type CliOptions = OpenSpecOperationGateOptions & { root: string };

const knownOperations = new Set([
  "propose",
  "apply",
  "task-update",
  "ledger-materialize",
  "worker-dispatch",
  "collect",
  "review",
  "acceptance",
  "archive",
  "post-archive",
  "prepush",
]);

const changeScopedOperations = new Set([...knownOperations].filter((operation) => operation !== "prepush"));

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function relativePath(root: string, filePath: string): string {
  return normalizePath(path.relative(root, filePath));
}

function safeChangeId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== "." && value !== "..";
}

function redactRoot(root: string, text: string): string {
  return text.replaceAll(root, "<repo>").replaceAll(normalizePath(root), "<repo>");
}

function check(id: string, label: string, status: OpenSpecOperationGateStatus, blocking: boolean, source: string, summary: string): OpenSpecOperationGateCheck {
  return { id, label, status, blocking, source, summary };
}

function changeRoot(root: string, changeId: string): string {
  return path.join(root, "openspec", "changes", changeId);
}

function changePath(root: string, changeId: string, ...parts: string[]): string {
  return path.join(changeRoot(root, changeId), ...parts);
}

function requiredChangeChecks(root: string, operation: string, changeId: string | undefined): OpenSpecOperationGateCheck[] {
  if (!changeScopedOperations.has(operation)) {
    return [];
  }
  if (changeId == null || changeId.trim().length === 0) {
    return [check("scope:change:required", "OpenSpec change scope", "blocked", true, "cli", `Operation ${operation} requires --change <change-id>.`)];
  }
  if (!safeChangeId(changeId)) {
    return [check("scope:change:safe-id", "OpenSpec safe change id", "blocked", true, changeId, "Change id must be a safe relative OpenSpec change id.")];
  }
  const rootPath = changeRoot(root, changeId);
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return [check("scope:change:exists", "OpenSpec change directory", "failed", true, `openspec/changes/${changeId}`, "Scoped change directory is missing.")];
  }
  return [check("scope:change:exists", "OpenSpec change directory", "passed", false, `openspec/changes/${changeId}`, "Scoped change directory exists.")];
}

function artifactChecks(root: string, operation: string, changeId: string | undefined): OpenSpecOperationGateCheck[] {
  if (changeId == null || !safeChangeId(changeId) || !fs.existsSync(changeRoot(root, changeId))) {
    return [];
  }
  const checks: OpenSpecOperationGateCheck[] = [];
  const proposalPath = changePath(root, changeId, "proposal.md");
  const tasksPath = changePath(root, changeId, "tasks.md");
  const specsPath = changePath(root, changeId, "specs");
  if (["propose", "apply", "review", "acceptance", "archive"].includes(operation)) {
    checks.push(fs.existsSync(proposalPath) && fs.statSync(proposalPath).isFile()
      ? check("artifact:proposal", "OpenSpec proposal", "passed", false, `openspec/changes/${changeId}/proposal.md`, "proposal.md exists.")
      : check("artifact:proposal", "OpenSpec proposal", "failed", true, `openspec/changes/${changeId}/proposal.md`, "proposal.md is required."));
  }
  if (["apply", "task-update", "ledger-materialize", "review", "acceptance", "archive"].includes(operation)) {
    if (!fs.existsSync(tasksPath) || !fs.statSync(tasksPath).isFile()) {
      checks.push(check("artifact:tasks", "OpenSpec tasks", "failed", true, `openspec/changes/${changeId}/tasks.md`, "tasks.md is required."));
    } else {
      const counts = countMarkdownChecklistItems(fs.readFileSync(tasksPath, "utf8"));
      checks.push(check("artifact:tasks", "OpenSpec tasks", "passed", false, `openspec/changes/${changeId}/tasks.md`, `tasks.md exists with ${counts.unchecked}/${counts.total} unchecked task(s).`));
      if (counts.total > 0 && counts.unchecked === 0 && operation === "task-update") {
        checks.push(check("task-update:all-checked", "OpenSpec task update freshness", "warning", false, `openspec/changes/${changeId}/tasks.md`, "tasks.md is all checked; active change may need archive, terminal ledger, or stale-state reconciliation."));
      }
    }
  }
  if (operation === "propose" || operation === "apply") {
    const hasSpecDelta = fs.existsSync(specsPath) && fs.statSync(specsPath).isDirectory() && fs.readdirSync(specsPath, { recursive: true }).some((entry) => String(entry).endsWith("spec.md"));
    checks.push(hasSpecDelta
      ? check("artifact:spec-delta", "OpenSpec spec delta", "passed", false, `openspec/changes/${changeId}/specs`, "Spec delta artifact exists.")
      : check("artifact:spec-delta", "OpenSpec spec delta", "warning", false, `openspec/changes/${changeId}/specs`, "No spec delta was found; confirm this operation is docs/tooling-only or add spec coverage."));
  }
  return checks;
}

function ledgerChecks(root: string, operation: string, changeId: string | undefined): OpenSpecOperationGateCheck[] {
  if (changeId == null || !safeChangeId(changeId)) {
    return [];
  }
  const ledgerPath = changePath(root, changeId, "automation", "task.json");
  if (!fs.existsSync(ledgerPath)) {
    return operation === "ledger-materialize" || operation === "worker-dispatch" || operation === "collect"
      ? [check("ledger:validation", "Autopilot ledger validation", "not-applicable", false, `openspec/changes/${changeId}/automation/task.json`, "No materialized Autopilot ledger exists yet.")]
      : [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as unknown;
    const validation = validateTaskLedger(parsed, { sourcePath: relativePath(root, ledgerPath) });
    return [check(
      "ledger:validation",
      "Autopilot ledger validation",
      validation.valid ? "passed" : "failed",
      !validation.valid,
      relativePath(root, ledgerPath),
      validation.valid ? "Autopilot task ledger validates." : `Invalid Autopilot task ledger: ${validation.errors.join("; ")}`,
    )];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [check("ledger:validation", "Autopilot ledger validation", "failed", true, relativePath(root, ledgerPath), `Autopilot task ledger is unreadable: ${message}`)];
  }
}

function prepushChecks(root: string): OpenSpecOperationGateCheck[] {
  const openspecRoot = path.join(root, "openspec");
  if (!fs.existsSync(openspecRoot)) {
    return [check("prepush:openspec", "OpenSpec prepush scope", "not-applicable", false, "openspec", "No OpenSpec directory exists; operation gate has no OpenSpec artifacts to inspect.")];
  }
  return [check("prepush:openspec", "OpenSpec prepush scope", "passed", false, "openspec", "OpenSpec directory exists; run repository pre-push validation for full command gates.")];
}

function operationChecks(root: string, operation: string, changeId: string | undefined): OpenSpecOperationGateCheck[] {
  if (!knownOperations.has(operation)) {
    return [check("operation:known", "OpenSpec operation registry", "unknown", true, operation, `Unknown OpenSpec operation ${operation}.`)];
  }
  if (operation === "prepush") {
    return prepushChecks(root);
  }
  return [...requiredChangeChecks(root, operation, changeId), ...artifactChecks(root, operation, changeId), ...ledgerChecks(root, operation, changeId)];
}

function statusFor(checks: OpenSpecOperationGateCheck[]): Exclude<OpenSpecOperationGateStatus, "not-applicable"> {
  if (checks.some((item) => item.status === "blocked")) {
    return "blocked";
  }
  if (checks.some((item) => item.status === "failed")) {
    return "failed";
  }
  if (checks.some((item) => item.status === "unknown")) {
    return "unknown";
  }
  if (checks.some((item) => item.status === "warning")) {
    return "warning";
  }
  return "passed";
}

function nextActionsFor(status: Exclude<OpenSpecOperationGateStatus, "not-applicable">): Array<{ label: string; reason: string }> {
  if (status === "passed") {
    return [{ label: "Continue operation", reason: "Operation gate passed for available cheap read-only checks." }];
  }
  if (status === "warning") {
    return [{ label: "Review warning evidence", reason: "Warnings are non-blocking but should be reconciled before sensitive lifecycle operations." }];
  }
  if (status === "blocked") {
    return [{ label: "Resolve operation blocker", reason: "Required operation scope or safety evidence is missing." }];
  }
  if (status === "unknown") {
    return [{ label: "Use supported operation", reason: "Operation is not in the deterministic gate registry." }];
  }
  return [{ label: "Fix failed gate", reason: "A blocking operation gate failed and must be fixed before continuing." }];
}

function persistReport(root: string, output: OpenSpecOperationGateOutput): string | undefined {
  if (output.changeId == null || !safeChangeId(output.changeId)) {
    return undefined;
  }
  if (!knownOperations.has(output.operation)) {
    return undefined;
  }
  const relative = normalizePath(path.join("openspec", "changes", output.changeId, "automation", "operation-gates", `${output.operation}.json`));
  const filePath = path.join(root, relative);
  const operationGatesRoot = path.resolve(root, "openspec", "changes", output.changeId, "automation", "operation-gates");
  const resolvedFile = path.resolve(filePath);
  const relativeToGateRoot = path.relative(operationGatesRoot, resolvedFile);
  if (relativeToGateRoot.startsWith("..") || path.isAbsolute(relativeToGateRoot)) {
    return undefined;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const persisted = { ...output, persistedPath: relative };
  fs.writeFileSync(filePath, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");
  return relative;
}

export function runOpenSpecOperationGate(root: string, options: OpenSpecOperationGateOptions): OpenSpecOperationGateOutput {
  const resolvedRoot = path.resolve(root);
  const operation = options.operation?.trim() || "unknown";
  const changeId = options.changeId?.trim() || undefined;
  const checks = operationChecks(resolvedRoot, operation, changeId).sort((left, right) => left.id.localeCompare(right.id));
  const status = statusFor(checks);
  const output: OpenSpecOperationGateOutput = {
    schemaVersion: 1,
    operation,
    ...(changeId == null ? {} : { changeId }),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status,
    exitCode: status === "passed" || status === "warning" ? 0 : 1,
    checks: checks.map((item) => ({ ...item, summary: redactRoot(resolvedRoot, item.summary), source: redactRoot(resolvedRoot, item.source) })),
    nextActions: nextActionsFor(status),
  };
  if (options.persist === true) {
    const persistedPath = persistReport(resolvedRoot, output);
    if (persistedPath != null) {
      output.persistedPath = persistedPath;
    }
  }
  return output;
}

function defaultRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function parseArgs(args: string[]): CliOptions {
  const parsed: CliOptions = { root: defaultRoot(), operation: "" };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--root") {
      parsed.root = args[++index] ?? "";
    } else if (arg === "--operation") {
      parsed.operation = args[++index] ?? "";
    } else if (arg === "--change") {
      parsed.changeId = args[++index] ?? "";
    } else if (arg === "--persist") {
      parsed.persist = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!parsed.operation) {
    throw new Error("Missing required --operation <operation>.");
  }
  return parsed;
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    const output = runOpenSpecOperationGate(options.root, options);
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = output.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
