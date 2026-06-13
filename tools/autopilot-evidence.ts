#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLedgerSummaries, type LedgerSummary } from "./openspec-autopilot-output.ts";

export type EvidenceStatus = "passed" | "warning" | "error" | "unknown" | "unavailable" | "blocked" | "planned" | "required" | "not-applicable";

export type EvidenceItem = {
  id: string;
  source: string;
  status: EvidenceStatus;
  summary: string;
};

export type LedgerEvidence = EvidenceItem & {
  taskId: string;
  path: string;
  taskType: string;
  taskStatus: string;
  valid: boolean;
};

export type ValidationPlanItem = EvidenceItem & {
  command: string;
  argv: string[];
  reason: string;
};

export type ValidationResultItem = EvidenceItem & {
  command: string;
  exitCode: number;
  durationMs?: number;
};

export type ReviewerPlanItem = EvidenceItem & {
  reviewer: string;
  reason: string;
};

export type CandidateFollowUp = {
  id: string;
  target: "project-local" | "opencode-dev-kit";
  reason: string;
};

export type RetrospectiveEvidence = {
  archiveGatePassed: boolean;
  checklist: EvidenceItem[];
  candidateFollowUps: CandidateFollowUp[];
};

export type AutopilotEvidencePack = {
  schemaVersion: 1;
  changeId: string;
  generatedAt: string;
  gitStatus: { clean: boolean; entries: string[]; truncated: boolean };
  ledgers: LedgerEvidence[];
  toolSmoke: EvidenceItem[];
  validationPlan: ValidationPlanItem[];
  validationResults: ValidationResultItem[];
  reviewerPlan: ReviewerPlanItem[];
  freshness: EvidenceItem[];
  scenarios: EvidenceItem[];
  findings: EvidenceItem[];
  retrospective: RetrospectiveEvidence;
  residualRisks: string[];
};

type GitStatusSnapshot = AutopilotEvidencePack["gitStatus"] & {
  changedFiles: string[];
};

export type CommandOutput = {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
};

export type CommandRunner = (command: string) => CommandOutput;

export type CollectEvidenceOptions = {
  changeId: string;
  mode?: "collect" | "validate";
  generatedAt?: string;
  changedFiles?: string[];
  showPaths?: boolean;
  commandRunner?: CommandRunner;
};

type CliOptions = Omit<CollectEvidenceOptions, "mode"> & {
  root: string;
  report?: string;
  outputFormat: "json" | "markdown";
  mode: "collect" | "validate" | "report";
};

const scenarioNames = [
  "command-smoke",
  "tool-api-smoke",
  "ledger-discovery",
  "validation",
  "reviewer-plan",
  "freshness",
  "retrospective-handoff",
] as const;

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function safeChangeId(changeId: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(changeId) && !changeId.includes("..") && !changeId.includes("/") && !changeId.includes("\\");
}

function toRelative(root: string, filePath: string): string {
  return normalizePath(path.relative(root, filePath));
}

function redactedRootVariants(root: string): string[] {
  const resolved = path.resolve(root);
  return Array.from(new Set([resolved, normalizePath(resolved), resolved.replaceAll("/", "\\")])).filter((value) => value.length > 0);
}

export function redactText(text: string, root: string, showPaths = false): string {
  let result = text.replace(/\b[A-Za-z0-9_]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_]*\b\s*[:=]\s*[^\s,;]+/gi, "<redacted>");
  result = result.replace(/\bAuthorization\s*:\s*Bearer\s+[^\s,;]+/gi, "Authorization: Bearer <redacted>");
  result = result.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer <redacted>");
  if (!showPaths) {
    for (const variant of redactedRootVariants(root)) {
      result = result.split(variant).join("<repo>");
    }
    result = result.replace(/[A-Za-z]:[\\/][^\s`'"<>|]+/g, "<path>");
    result = result.replace(/\/(?:Users|home|tmp|var)\/[^\s`'"<>|]+/g, "<path>");
  }
  return result;
}

export function summarizeCommandOutput(command: string, exitCode: number, stdout = "", stderr = "", root = process.cwd(), showPaths = false): ValidationResultItem {
  const combined = redactText(`${stdout}\n${stderr}`.trim(), root, showPaths);
  const lines = combined.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const compact = lines.slice(0, 4).join(" | ");
  const summary = compact.length > 320 ? `${compact.slice(0, 317)}...` : compact || "No output.";
  return {
    id: `validation-result:${command}`,
    source: "command-output",
    status: exitCode === 0 ? "passed" : "error",
    summary,
    command,
    exitCode,
  };
}

function npmExecutable(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runValidationCommand(item: ValidationPlanItem, root: string): CommandOutput {
  const started = Date.now();
  const [file, ...args] = item.argv;
  const result = spawnSync(file, args, { cwd: root, encoding: "utf8", shell: false, timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.error) {
    return { command: item.command, exitCode: 1, stderr: result.error.message, durationMs: Date.now() - started };
  }
  if (result.status == null) {
    const signal = result.signal ? ` Signal: ${result.signal}.` : "";
    return { command: item.command, exitCode: 1, stdout: result.stdout ?? "", stderr: `Command terminated without exit status.${signal}`, durationMs: Date.now() - started };
  }
  return {
    command: item.command,
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs: Date.now() - started,
  };
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

function collectGitStatus(root: string): GitStatusSnapshot {
  const result = spawnSync("git", ["status", "--short", "--untracked-files=all"], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0) {
    return { clean: false, entries: ["unknown: git status unavailable"], truncated: false, changedFiles: [] };
  }
  const entries = (result.stdout ?? "").split(/\r?\n/).filter((line) => line.trim().length > 0).sort((a, b) => a.localeCompare(b));
  const porcelain = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 });
  const changedFiles = porcelain.status === 0 ? parsePorcelainStatusPaths(porcelain.stdout ?? "") : changedFilesFromGitStatus(entries);
  return { clean: entries.length === 0, entries: entries.slice(0, 50), truncated: entries.length > 50, changedFiles };
}

function changedFilesFromGitStatus(entries: string[]): string[] {
  return entries
    .map((entry) => entry.slice(3).trim())
    .map((entry) => entry.includes(" -> ") ? entry.slice(entry.lastIndexOf(" -> ") + 4).trim() : entry)
    .filter((entry) => entry.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function ledgerEvidence(ledgers: LedgerSummary[]): LedgerEvidence[] {
  return ledgers
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id) || left.path.localeCompare(right.path))
    .map((ledger) => ({
      id: `ledger:${ledger.id}`,
      source: ledger.path,
      status: ledger.valid ? "passed" : "error",
      summary: ledger.valid ? `${ledger.taskType} ledger is ${ledger.status}.` : `Invalid ledger: ${ledger.errors.join("; ")}`,
      taskId: ledger.id,
      path: ledger.path,
      taskType: ledger.taskType,
      taskStatus: ledger.status,
      valid: ledger.valid,
    }));
}

function validationPlan(changeId: string, ledgers: LedgerSummary[]): ValidationPlanItem[] {
  const npm = npmExecutable();
  const items: ValidationPlanItem[] = [
    { id: "validation-plan:npm-run-validate", source: "package.json", status: "planned", command: "npm run validate", argv: [npm, "run", "validate"], reason: "Validate reusable skills, agents, README/catalog, and tooling contracts.", summary: "Plan repository library validation." },
    { id: "validation-plan:npm-test", source: "package.json", status: "planned", command: "npm test", argv: [npm, "test"], reason: "Run deterministic TypeScript test suite.", summary: "Plan full test suite." },
    { id: "validation-plan:openspec", source: "package.json", status: "planned", command: "npm run openspec:validate", argv: [npm, "run", "openspec:validate"], reason: "Validate all active OpenSpec changes.", summary: "Plan OpenSpec validation." },
    { id: "validation-plan:retro-gate", source: "package.json", status: "planned", command: `npm run openspec:retro-gate -- ${changeId}`, argv: [npm, "run", "openspec:retro-gate", "--", changeId], reason: "Check retrospective archive gate before archive.", summary: "Plan retrospective gate validation." },
  ];
  for (const ledger of ledgers.slice().sort((left, right) => left.path.localeCompare(right.path))) {
    items.push({
      id: `validation-plan:autopilot:${ledger.id}`,
      source: ledger.path,
      status: "planned",
      command: `npm run autopilot:validate -- ${ledger.path}`,
      argv: [npm, "run", "autopilot:validate", "--", ledger.path],
      reason: "Validate plugin-owned Autopilot task ledger contract.",
      summary: `Plan Autopilot ledger validation for ${ledger.id}.`,
    });
  }
  return items.sort((left, right) => left.id.localeCompare(right.id));
}

function reviewerPlan(ledgers: LedgerSummary[], changedFiles: string[]): ReviewerPlanItem[] {
  const reasons = new Map<string, string[]>();
  const add = (reviewer: string, reason: string) => reasons.set(reviewer, [...(reasons.get(reviewer) ?? []), reason]);
  for (const ledger of ledgers) {
    if (["feature", "bugfix", "refactor", "tooling"].includes(ledger.taskType)) {
      add("code-quality-reviewer", `${ledger.taskType} task ${ledger.id}`);
      add("test-coverage-reviewer", `${ledger.taskType} task ${ledger.id}`);
    }
    if (ledger.taskType === "config") {
      add("deployment-config-reviewer", `config task ${ledger.id}`);
    }
    if (ledger.taskType === "performance") {
      add("performance-reliability-reviewer", `performance task ${ledger.id}`);
    }
    if (ledger.taskType === "protocol") {
      add("protocol-api-reviewer", `protocol task ${ledger.id}`);
      add("wire-protocol-reviewer", `protocol task ${ledger.id}`);
    }
  }
  if (changedFiles.some((file) => /(^|\/)\.opencode\/|(^|\/)instructions\/|(^|\/)README\.md$|(^|\/)AGENTS\.md$/.test(normalizePath(file)))) {
    add("instruction-artifact-reviewer", "instruction, skill, agent, README, or OpenCode config file changed");
  }
  if (changedFiles.some((file) => normalizePath(file).startsWith("tools/") && file.endsWith(".ts"))) {
    add("code-quality-reviewer", "TypeScript helper/tooling file changed");
  }
  return Array.from(reasons.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reviewer, reviewerReasons]) => ({
      id: `reviewer:${reviewer}`,
      source: "deterministic-signals",
      status: "required",
      reviewer,
      reason: Array.from(new Set(reviewerReasons)).sort((a, b) => a.localeCompare(b)).join("; "),
      summary: `${reviewer} required by deterministic evidence signals.`,
    }));
}

function freshnessEvidence(root: string, changeId: string): EvidenceItem[] {
  const changeRoot = path.join(root, "openspec", "changes", changeId);
  const reportPath = path.join(changeRoot, "live-regression-report.md");
  const retrospectivePath = path.join(changeRoot, "retrospective.md");
  return [
    {
      id: "freshness:active-change",
      source: toRelative(root, changeRoot),
      status: fs.existsSync(changeRoot) ? "passed" : "unavailable",
      summary: fs.existsSync(changeRoot) ? "Active OpenSpec change directory exists." : "Active OpenSpec change directory is unavailable.",
    },
    {
      id: "freshness:report-contract",
      source: fs.existsSync(reportPath) ? toRelative(root, reportPath) : "unsupported",
      status: fs.existsSync(reportPath) ? "unknown" : "unknown",
      summary: fs.existsSync(reportPath) ? "Report freshness requires dedicated contract validation; status unknown in collect mode." : "Report freshness input unsupported or unavailable; status unknown.",
    },
    {
      id: "freshness:retrospective",
      source: fs.existsSync(retrospectivePath) ? toRelative(root, retrospectivePath) : "retrospective.md",
      status: fs.existsSync(retrospectivePath) ? "passed" : "unknown",
      summary: fs.existsSync(retrospectivePath) ? "Retrospective artifact exists; run retro gate before archive." : "retrospective.md is not present; archive gate status unknown.",
    },
  ];
}

function scenarioEvidence(): EvidenceItem[] {
  return scenarioNames.map((name) => ({
    id: `scenario:${name}`,
    source: "evidence-pack",
    status: "planned",
    summary: `${name} scenario should be completed, skipped with reason, or blocked with evidence.`,
  }));
}

function retrospectiveEvidence(): RetrospectiveEvidence {
  return {
    archiveGatePassed: false,
    checklist: [
      { id: "retro:evidence-reviewed", source: "retrospective-template", status: "planned", summary: "Review OpenSpec artifacts, validation, reviewers, Autopilot/runtime events, blockers, and reports." },
      { id: "retro:problems", source: "retrospective-template", status: "planned", summary: "Record problems with evidence, impact, root cause, recommendation, confidence, and target." },
      { id: "retro:archive-decision", source: "retrospective-template", status: "planned", summary: "Record passed, blocked, or approved-skip archive gate decision." },
    ],
    candidateFollowUps: [
      { id: "follow-up:project-local", target: "project-local", reason: "Project-specific docs, tests, or workflow findings should become local OpenSpec changes." },
      { id: "follow-up:opencode-dev-kit", target: "opencode-dev-kit", reason: "Reusable Autopilot, skill, agent, instruction, validator, or evidence-pack findings should become opencode-dev-kit proposals/changes." },
    ],
  };
}

export function collectAutopilotEvidence(root: string, options: CollectEvidenceOptions): AutopilotEvidencePack {
  if (!safeChangeId(options.changeId)) {
    throw new Error(`Invalid OpenSpec change id for evidence collection: ${options.changeId}`);
  }
  const mode = options.mode ?? "collect";
  const ledgers = readLedgerSummaries(root, {}, { changeId: options.changeId });
  const gitStatus = collectGitStatus(root);
  const changedFiles = options.changedFiles ?? gitStatus.changedFiles;
  const plan = validationPlan(options.changeId, ledgers);
  const validationResults = mode === "validate"
    ? plan.map((item) => {
      const output = options.commandRunner ? options.commandRunner(item.command) : runValidationCommand(item, root);
      return { ...summarizeCommandOutput(item.command, output.exitCode, output.stdout, output.stderr, root, options.showPaths), durationMs: output.durationMs };
    }).sort((left, right) => left.id.localeCompare(right.id))
    : [];
  const ledgerItems = ledgerEvidence(ledgers);
  return {
    schemaVersion: 1,
    changeId: options.changeId,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    gitStatus: { clean: gitStatus.clean, entries: gitStatus.entries, truncated: gitStatus.truncated },
    ledgers: ledgerItems,
    toolSmoke: [{ id: "tool-smoke:not-run", source: "autopilot-tools", status: "planned", summary: "Tool smoke is planned; this CLI does not simulate plugin-owned transitions." }],
    validationPlan: plan,
    validationResults,
    reviewerPlan: reviewerPlan(ledgers, changedFiles),
    freshness: freshnessEvidence(root, options.changeId),
    scenarios: scenarioEvidence(),
    findings: [],
    retrospective: retrospectiveEvidence(),
    residualRisks: ledgerItems.length === 0 ? ["No Autopilot task ledger discovered for this change."] : [],
  };
}

export function renderEvidenceMarkdown(pack: AutopilotEvidencePack): string {
  const cell = (value: unknown): string => String(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
  const lines: string[] = [
    `# Autopilot Evidence Pack: ${pack.changeId}`,
    "",
    `Generated: ${pack.generatedAt}`,
    "",
    "## Ledger Evidence",
    "",
    "| ID | Status | Summary |",
    "| --- | --- | --- |",
    ...pack.ledgers.map((item) => `| ${cell(item.id)} | ${cell(item.status)} | ${cell(item.summary)} |`),
    "",
    "## Tool Smoke",
    "",
    "| ID | Status | Summary |",
    "| --- | --- | --- |",
    ...(pack.toolSmoke.length > 0 ? pack.toolSmoke.map((item) => `| ${cell(item.id)} | ${cell(item.status)} | ${cell(item.summary)} |`) : ["| none | not-applicable | No tool smoke evidence collected. |"]),
    "",
    "## Scenario Matrix",
    "",
    "| Scenario | Status | Summary |",
    "| --- | --- | --- |",
    ...pack.scenarios.map((item) => `| ${cell(item.id)} | ${cell(item.status)} | ${cell(item.summary)} |`),
    "",
    "## Validation",
    "",
    "| Command | Planned/Status | Summary |",
    "| --- | --- | --- |",
    ...pack.validationPlan.map((item) => `| \`${cell(item.command)}\` | planned | ${cell(item.reason)} |`),
    ...pack.validationResults.map((item) => `| \`${cell(item.command)}\` | ${cell(item.status)} | ${cell(item.summary)} |`),
    "",
    "## Findings",
    "",
    "| ID | Status | Summary | Impact | Recommendation | Confidence | Validation Path |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...(pack.findings.length > 0 ? pack.findings.map((item) => `| ${cell(item.id)} | ${cell(item.status)} | ${cell(item.summary)} | unknown | unknown | unknown | unknown |`) : ["| none | not-applicable | No findings are asserted by this deterministic evidence pack. | none | none | not-applicable | not-applicable |"]),
    "",
    "## Reviewer Gates",
    "",
    "| Reviewer | Status | Reason |",
    "| --- | --- | --- |",
    ...pack.reviewerPlan.map((item) => `| ${cell(item.reviewer)} | ${cell(item.status)} | ${cell(item.reason)} |`),
    "",
    "## Freshness",
    "",
    "| ID | Status | Summary |",
    "| --- | --- | --- |",
    ...pack.freshness.map((item) => `| ${cell(item.id)} | ${cell(item.status)} | ${cell(item.summary)} |`),
    "",
    "## Retrospective Evidence",
    "",
    `Archive gate passed: ${String(pack.retrospective.archiveGatePassed)}`,
    "",
    "| Checklist | Status | Summary |",
    "| --- | --- | --- |",
    ...pack.retrospective.checklist.map((item) => `| ${cell(item.id)} | ${cell(item.status)} | ${cell(item.summary)} |`),
    "",
    "## Candidate Follow-Up Routing",
    "",
    "| Target | Reason |",
    "| --- | --- |",
    ...pack.retrospective.candidateFollowUps.map((item) => `| ${cell(item.target)} | ${cell(item.reason)} |`),
    "",
    "## Follow-Up Changes",
    "",
    "| Target | Candidate |",
    "| --- | --- |",
    ...pack.retrospective.candidateFollowUps.map((item) => `| ${cell(item.target)} | ${cell(item.id)} |`),
    "",
    "## Residual Risks",
    "",
    ...(pack.residualRisks.length > 0 ? pack.residualRisks.map((risk) => `- ${risk}`) : ["- none"]),
    "",
    "## Ready-To-Land Status",
    "",
    "not ready: evidence pack output is deterministic evidence only and does not replace validation, reviewer, retrospective, MR, or user acceptance gates.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function validateEvidenceReportPath(root: string, changeId: string, reportPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(reportPath);
  const relative = path.relative(resolvedRoot, resolved);
  const normalized = normalizePath(relative);
  const approvedPrefix = `openspec/changes/${changeId}/`;
  if (relative === "" || normalized.startsWith("../") || normalized === ".." || path.isAbsolute(relative) || !normalized.startsWith(approvedPrefix) || normalized.startsWith(".autopilot/") || /(^|\/)automation(\/|$)/.test(normalized)) {
    throw new Error(`Refusing to write evidence report to protected or unapproved path: ${reportPath}`);
  }
  if (fs.existsSync(resolved)) {
    throw new Error(`Refusing to overwrite existing evidence report: ${reportPath}`);
  }
  return resolved;
}

export function writeEvidenceReport(root: string, pack: AutopilotEvidencePack, reportPath: string): void {
  const resolved = validateEvidenceReportPath(root, pack.changeId, reportPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, renderEvidenceMarkdown(pack), "utf8");
}

function readOption(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function parseCli(args: string[]): CliOptions {
  const options: CliOptions = { root: process.cwd(), changeId: "", mode: "collect", outputFormat: "json" };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--change") {
      options.changeId = readOption(args, index, arg);
      index++;
    } else if (arg === "--mode") {
      const value = readOption(args, index, arg);
      if (value !== "collect" && value !== "validate" && value !== "report") {
        throw new Error("--mode must be collect, validate, or report.");
      }
      options.mode = value;
      index++;
    } else if (arg === "--report") {
      options.report = readOption(args, index, arg);
      index++;
    } else if (arg === "--root") {
      options.root = path.resolve(readOption(args, index, arg));
      index++;
    } else if (arg === "--format") {
      const value = readOption(args, index, arg);
      if (value !== "json" && value !== "markdown") {
        throw new Error("--format must be json or markdown.");
      }
      options.outputFormat = value;
      index++;
    } else if (arg === "--show-paths") {
      options.showPaths = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.changeId.trim().length === 0) {
    throw new Error("Usage: node tools/autopilot-evidence.ts --change <change-id> [--mode collect|validate|report] [--report <path>]");
  }
  return options;
}

function runCli(): void {
  try {
    const options = parseCli(process.argv.slice(2));
    const pack = collectAutopilotEvidence(options.root, { ...options, mode: options.mode === "report" ? "collect" : options.mode });
    if (options.mode === "report") {
      if (!options.report) {
        throw new Error("Report mode requires --report <path>.");
      }
      writeEvidenceReport(options.root, pack, path.resolve(options.root, options.report));
    }
    process.stdout.write(options.outputFormat === "markdown" ? renderEvidenceMarkdown(pack) : `${JSON.stringify(pack, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
