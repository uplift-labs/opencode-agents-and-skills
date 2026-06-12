#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RetroGateResult = {
  valid: boolean;
  changeId: string;
  errors: string[];
  warnings: string[];
  archiveAllowed: boolean;
};

type ProblemRow = {
  problem: string;
  evidence: string;
  impact: string;
  recommendation: string;
  confidence: string;
  target: string;
};

type CliOptions = {
  root: string;
  format: "json" | "text";
  changeId?: string;
};

const decisionValues = new Set(["passed", "blocked", "approved-skip"]);
const findingTargets = new Set(["project-local", "opencode-dev-kit", "none"]);
const emptyValues = new Set(["", "none", "n/a", "na", "unknown", "unavailable", "-"]);

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function isMeaningful(value: string | undefined): boolean {
  return value != null && !emptyValues.has(value.trim().toLowerCase().replace(/[.。]+$/, ""));
}

function safeChangeId(changeId: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(changeId) && !changeId.includes("..") && !changeId.includes("/") && !changeId.includes("\\");
}

function slug(value: string): string {
  const slugged = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slugged.length > 0 ? slugged.slice(0, 48).replace(/-+$/g, "") : "finding";
}

function expectedFollowUpId(sourceChangeId: string, finding: ProblemRow, actionableIndex: number): string {
  return `retro-${slug(sourceChangeId)}-${String(actionableIndex + 1).padStart(2, "0")}-${slug(finding.problem)}`.slice(0, 96).replace(/-+$/g, "");
}

function fileText(filePath: string): string | null {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  return normalizeText(fs.readFileSync(filePath, "utf8"));
}

function section(text: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^##\\s+${escaped}\\s*$\\n(?<body>[\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "m"));
  return match?.groups?.body ?? null;
}

function hasFinalRetroSection(tasks: string): boolean {
  const headings = Array.from(tasks.matchAll(/^##\s+(.+?)\s*$/gm), (match) => match[1].trim());
  return headings.length > 0 && headings[headings.length - 1] === "Retrospective Before Archive";
}

function lineValue(body: string, marker: string): string | undefined {
  const line = body.split("\n").find((candidate) => candidate.toLowerCase().includes(marker.toLowerCase()));
  if (line == null) {
    return undefined;
  }
  const colonIndex = line.indexOf(":");
  return colonIndex >= 0 ? line.slice(colonIndex + 1).trim() : undefined;
}

function parseDecision(decisionSection: string): string | undefined {
  const value = lineValue(decisionSection, "Decision");
  return value?.trim().toLowerCase();
}

function parseProblemRows(problemSection: string | null): { rows: ProblemRow[]; malformedRows: number } {
  if (problemSection == null) {
    return { rows: [], malformedRows: 0 };
  }
  let malformedRows = 0;
  const rows = problemSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .filter((line) => !/^\|\s*-+\s*\|/.test(line) && !/^\|\s*Problem\s*\|/i.test(line))
    .flatMap((line): ProblemRow[] => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.length !== 6) {
        malformedRows++;
        return [];
      }
      return [{ problem: cells[0], evidence: cells[1], impact: cells[2], recommendation: cells[3], confidence: cells[4], target: cells[5] }];
    });
  return { rows, malformedRows };
}

function hasOutputValue(outputs: string, marker: string): boolean {
  return isMeaningful(lineValue(outputs, marker));
}

function outputChangeIds(outputs: string, marker: string): string[] {
  const value = lineValue(outputs, marker);
  if (!isMeaningful(value)) {
    return [];
  }
  return Array.from(value.matchAll(/`([^`]+)`/g), (match) => match[1].trim()).filter((id) => id.length > 0);
}

function followUpChangeExists(root: string, changeId: string): boolean {
  if (!safeChangeId(changeId)) {
    return false;
  }
  const changeRoot = path.join(root, "openspec", "changes", changeId);
  return fs.existsSync(path.join(changeRoot, "proposal.md")) && fs.existsSync(path.join(changeRoot, "tasks.md"));
}

function defaultRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function evaluateRetroGate(root: string, changeId: string): RetroGateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let archiveAllowed = false;

  if (!safeChangeId(changeId)) {
    errors.push(`Invalid change id '${changeId}'.`);
    return { valid: false, changeId, errors, warnings, archiveAllowed };
  }

  const changeRoot = path.join(root, "openspec", "changes", changeId);
  const tasksPath = path.join(changeRoot, "tasks.md");
  const retroPath = path.join(changeRoot, "retrospective.md");
  const tasks = fileText(tasksPath);
  const retrospective = fileText(retroPath);

  if (tasks == null) {
    errors.push(`Missing tasks.md for ${changeId}.`);
  } else {
    const retroTasks = section(tasks, "Retrospective Before Archive");
    if (!hasFinalRetroSection(tasks)) {
      errors.push(`tasks.md must end with ## Retrospective Before Archive for ${changeId}.`);
    }
    for (const required of ["retrospective.md", "project-local OpenSpec", "opencode-dev-kit", "archive gate"]) {
      if (retroTasks == null || !retroTasks.toLowerCase().includes(required.toLowerCase())) {
        errors.push(`tasks.md Retrospective Before Archive section must mention ${required}.`);
      }
    }
  }

  if (retrospective == null) {
    errors.push(`Missing retrospective.md for ${changeId}.`);
    return { valid: false, changeId, errors, warnings, archiveAllowed };
  }

  const evidence = section(retrospective, "Evidence Reviewed");
  const problems = section(retrospective, "Problems Found");
  const outputs = section(retrospective, "Outputs");
  const archiveDecision = section(retrospective, "Archive Gate Decision");
  if (evidence == null) {
    errors.push("retrospective.md must include ## Evidence Reviewed.");
  }
  if (problems == null) {
    errors.push("retrospective.md must include ## Problems Found.");
  }
  if (outputs == null) {
    errors.push("retrospective.md must include ## Outputs.");
  }
  if (archiveDecision == null) {
    errors.push("retrospective.md must include ## Archive Gate Decision.");
  }

  const parsedProblems = parseProblemRows(problems);
  const rows = parsedProblems.rows;
  if (parsedProblems.malformedRows > 0) {
    errors.push("Retrospective problem rows must have exactly six columns: Problem, Evidence, Impact, Recommendation, Confidence, Target.");
  }
  for (const row of rows) {
    if (![row.problem, row.evidence, row.impact, row.recommendation, row.confidence].every(isMeaningful)) {
      errors.push("Retrospective problem rows must include problem, evidence, impact, recommendation, and confidence.");
    }
    if (!findingTargets.has(row.target)) {
      errors.push(`Retrospective finding target must be one of project-local, opencode-dev-kit, none; got ${row.target}.`);
    }
  }
  if (outputs != null) {
    const hasProjectFinding = rows.some((row) => row.target === "project-local");
    const hasDevKitFinding = rows.some((row) => row.target === "opencode-dev-kit");
    if (hasProjectFinding && !hasOutputValue(outputs, "Project follow-up changes")) {
      errors.push("Project-local retrospective findings must reference generated project follow-up OpenSpec changes.");
    }
    if (hasDevKitFinding && !hasOutputValue(outputs, "opencode-dev-kit")) {
      errors.push("opencode-dev-kit retrospective findings must reference generated reusable OpenSpec proposals/changes.");
    }
    for (const [target, marker] of [["project-local", "Project follow-up changes"], ["opencode-dev-kit", "opencode-dev-kit"]] as const) {
      const actionableRows = rows.filter((row) => row.target === "project-local" || row.target === "opencode-dev-kit");
      const targetRows = actionableRows.filter((row) => row.target === target);
      const hasFinding = targetRows.length > 0;
      if (!hasFinding) {
        continue;
      }
      const ids = outputChangeIds(outputs, marker);
      if (ids.length === 0) {
        errors.push(`${target} retrospective findings must reference one or more generated OpenSpec follow-up change ids in backticks.`);
        continue;
      }
      for (const id of ids) {
        if (!followUpChangeExists(root, id)) {
          errors.push(`${target} retrospective follow-up '${id}' must exist with proposal.md and tasks.md before archive.`);
        }
      }
      for (const row of targetRows) {
        const actionableIndex = actionableRows.indexOf(row);
        const expectedId = expectedFollowUpId(changeId, row, actionableIndex);
        if (!ids.includes(expectedId)) {
          errors.push(`${target} retrospective finding '${row.problem}' must reference generated follow-up '${expectedId}' before archive.`);
        }
      }
    }
    if (rows.length === 0 && !hasOutputValue(outputs, "No findings reason")) {
      errors.push("No-findings retrospectives must record a No findings reason with evidence reviewed.");
    }
  }

  if (archiveDecision != null) {
    const decision = parseDecision(archiveDecision);
    if (decision == null || !decisionValues.has(decision)) {
      errors.push("Archive Gate Decision must be one of: passed, blocked, approved-skip.");
    } else if (decision === "blocked") {
      errors.push("Archive Gate Decision is blocked.");
    } else if (decision === "approved-skip") {
      const reason = lineValue(archiveDecision, "Reason");
      const approver = lineValue(archiveDecision, "Approver");
      if (!isMeaningful(reason) || !isMeaningful(approver)) {
        errors.push("Archive Gate Decision approved skip requires a reason and approver.");
      }
    }
  }

  archiveAllowed = errors.length === 0;
  return { valid: errors.length === 0, changeId, errors, warnings, archiveAllowed };
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { root: process.cwd(), format: "json" };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--root") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --root.");
      }
      options.root = path.resolve(value);
      index++;
    } else if (arg === "--format") {
      const value = args[index + 1];
      if (value !== "json" && value !== "text") {
        throw new Error("--format must be json or text.");
      }
      options.format = value;
      index++;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (options.changeId == null) {
      options.changeId = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

function renderText(result: RetroGateResult): string {
  const lines = [
    `changeId: ${result.changeId}`,
    `valid: ${String(result.valid)}`,
    `archiveAllowed: ${String(result.archiveAllowed)}`,
  ];
  for (const error of result.errors) {
    lines.push(`error: ${error}`);
  }
  for (const warning of result.warnings) {
    lines.push(`warning: ${warning}`);
  }
  return `${lines.join("\n")}\n`;
}

function runCli(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.changeId == null) {
      throw new Error("Usage: node tools/openspec-retro-gate.ts <change-id> [--root <repo>] [--format json|text]");
    }
    const result = evaluateRetroGate(options.root || defaultRoot(), options.changeId);
    process.stdout.write(options.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderText(result));
    if (!result.valid) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
