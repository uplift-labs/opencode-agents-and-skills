#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type OutputFormat = "json" | "markdown";

type Options = {
  format: OutputFormat;
  project: string;
  showProject: boolean;
};

type CheckStatus = "pass" | "warn" | "blocked";

type Check = {
  detail: string;
  name: string;
  status: CheckStatus;
};

type DoctorReport = {
  checks: Check[];
  project: string;
  status: CheckStatus;
  tool: "opencode-dev-kit-doctor";
  version: 1;
};

function defaultProject(): string {
  return process.cwd();
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function printUsage(): void {
  console.log(`Usage:
  npm run doctor -- [options]

Options:
  --project <path>          Project directory to inspect. Default: current directory.
  --format <json|markdown>  Output format. Default: markdown.
  --show-project            Include the absolute project path. Hidden by default for privacy-safe output.
  --help                   Show this help.
`);
}

function readValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.trim() === "" || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function parseFormat(value: string): OutputFormat {
  if (value === "json" || value === "markdown") {
    return value;
  }
  throw new Error("--format must be json or markdown.");
}

function parseArgs(args: string[]): Options {
  const options: Options = { format: "markdown", project: defaultProject(), showProject: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--project") {
      options.project = readValue(args, index, arg);
      index++;
    } else if (arg.startsWith("--project=")) {
      options.project = arg.slice("--project=".length);
    } else if (arg === "--format") {
      options.format = parseFormat(readValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--format=")) {
      options.format = parseFormat(arg.slice("--format=".length));
    } else if (arg === "--show-project") {
      options.showProject = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  options.project = path.resolve(options.project);
  return options;
}

function formatProjectForOutput(project: string, showProject: boolean): string {
  return showProject ? project : "<redacted>";
}

function fileContains(file: string, needle: string): boolean {
  return fs.existsSync(file) && fs.statSync(file).isFile() && fs.readFileSync(file, "utf8").includes(needle);
}

function addCheck(checks: Check[], name: string, status: CheckStatus, detail: string): void {
  checks.push({ name, status, detail });
}

function nodeMajor(): number {
  const match = process.versions.node.match(/^(\d+)\./);
  return match ? Number(match[1]) : 0;
}

function buildReport(project: string, showProject: boolean): DoctorReport {
  const checks: Check[] = [];
  const root = repoRoot();

  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) {
    addCheck(checks, "project directory", "blocked", "Project path is missing or is not a directory.");
  } else {
    addCheck(checks, "project directory", "pass", "Project path exists.");
  }

  addCheck(checks, "node version", nodeMajor() >= 24 ? "pass" : "blocked", `Node ${process.versions.node}; opencode-dev-kit tooling requires Node >=24.`);
  addCheck(checks, "universal loop source", fs.existsSync(path.join(root, "instructions", "universal-development-loop.md")) ? "pass" : "blocked", "Kit has the Universal Development Loop instruction artifact.");
  addCheck(checks, "profile manifests", fs.existsSync(path.join(root, "profiles", "standard.json")) ? "pass" : "blocked", "Kit has optional profile manifests for restricted installs.");

  const agentsPath = path.join(project, "AGENTS.md");
  addCheck(checks, "project AGENTS.md", fileContains(agentsPath, "Universal Development Loop") ? "pass" : "warn", "Project AGENTS.md should reference the Universal Development Loop.");

  const adapterPath = path.join(project, "opencode-dev-kit", "adapter.json");
  addCheck(checks, "project adapter", fs.existsSync(adapterPath) ? "pass" : "warn", "Project should have opencode-dev-kit/adapter.json for technology-specific commands.");

  const validationPath = path.join(project, "opencode-dev-kit", "validation.md");
  addCheck(checks, "project validation doc", fs.existsSync(validationPath) ? "pass" : "warn", "Project should have opencode-dev-kit/validation.md or equivalent command documentation.");

  const opencodeConfig = path.join(project, "opencode.json");
  addCheck(checks, "project opencode config", fs.existsSync(opencodeConfig) ? "pass" : "warn", "Project opencode.json is optional but recommended for explicit instructions/config.");

  let status: CheckStatus = "pass";
  if (checks.some((check) => check.status === "blocked")) {
    status = "blocked";
  } else if (checks.some((check) => check.status === "warn")) {
    status = "warn";
  }

  return { checks, project: formatProjectForOutput(project, showProject), status, tool: "opencode-dev-kit-doctor", version: 1 };
}

function renderMarkdown(report: DoctorReport): string {
  return [
    "# opencode-dev-kit Doctor",
    "",
    `Project: ${report.project}`,
    `Status: ${report.status}`,
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    ...report.checks.map((check) => `| ${check.name} | ${check.status} | ${check.detail.replace(/\|/g, "\\|")} |`),
    "",
  ].join("\n");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options.project, options.showProject);
  console.log(options.format === "json" ? JSON.stringify(report, null, 2) : renderMarkdown(report));
  if (report.status === "blocked") {
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
