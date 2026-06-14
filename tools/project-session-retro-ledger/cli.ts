import fs from "node:fs";
import path from "node:path";
import type { ProjectSessionRetroLedger, ProjectSessionRetroProposalResult, ProjectSessionRetroValidationResult } from "./types.ts";
import { createProjectSessionRetroProposals } from "./openspec-proposals.ts";
import { refreshAnalysisProgress } from "./progress.ts";
import { initProjectSessionRetroLedger } from "./sqlite-source.ts";
import { readJsonFile, resolveInputPath, writeJsonFile } from "./utils.ts";
import { validateProjectSessionRetroLedger } from "./validator.ts";

type CliOptions = {
  command: "init" | "validate" | "proposals" | "refresh" | "help";
  dataDirs: string[];
  dbPaths: string[];
  dryRun: boolean;
  format: "json" | "text";
  input: string | null;
  out: string | null;
  overwrite: boolean;
  projectRoot: string | null;
  requireComplete: boolean;
  requireProposals: boolean;
  root: string;
  showPaths: boolean;
  useDefaultPaths: boolean;
};

function printUsage(): void {
  console.log(`Usage:
  npm run retro:project-ledger -- init --project-root <path> [--out <path>] [options]
  npm run retro:project-ledger -- validate --input <path> [--root <repo>] [--require-complete] [--require-proposals] [--format json|text]
  npm run retro:project-ledger -- proposals --input <path> [--root <repo>] [--dry-run] [--format json|text]
  npm run retro:project-ledger -- refresh --input <path>

Options:
  --db <path>              Read an explicit OpenCode SQLite database. Repeatable.
  --data-dir <path>        Add an OpenCode data directory containing opencode.db. Repeatable.
  --only-explicit          Use only --db and --data-dir paths.
  --project-root <path>    Current project root for session filtering.
  --input <path>           Read an existing retro ledger JSON.
  --out <path>             Write init output to this file. Default: <project-root>/retro.json.
  --overwrite              Allow init to replace an existing output file.
  --root <path>            Repository root for proposal file validation/generation. Default: current working directory.
  --require-complete       Validate every retro stage is complete before push/final handoff.
  --require-proposals      Validate generated proposal refs and files as a final handoff gate.
  --dry-run                Preview proposal generation without writing files or updating input.
  --show-paths             Include home-redacted paths in generated ledger.
  --format <json|text>     Output format for validate/proposals. Default: text.
  --help                   Show this help.
`);
}

function readOptionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.trim() === "" || value.startsWith("-")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function parseFormat(value: string): "json" | "text" {
  if (value === "json" || value === "text") {
    return value;
  }
  throw new Error("--format must be json or text.");
}

function parseArgs(args: string[]): CliOptions {
  const command = args[0] as CliOptions["command"] | undefined;
  const options: CliOptions = {
    command: command ?? "help",
    dataDirs: [],
    dbPaths: [],
    dryRun: false,
    format: "text",
    input: null,
    out: null,
    overwrite: false,
    projectRoot: null,
    requireComplete: false,
    requireProposals: false,
    root: process.cwd(),
    showPaths: false,
    useDefaultPaths: true,
  };
  if (command == null || command === "help" || command === "--help" || command === "-h") {
    options.command = "help";
    return options;
  }
  if (!["init", "validate", "proposals", "refresh"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--db") {
      options.dbPaths.push(readOptionValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--db=")) {
      options.dbPaths.push(arg.slice("--db=".length));
    } else if (arg === "--data-dir") {
      options.dataDirs.push(readOptionValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--data-dir=")) {
      options.dataDirs.push(arg.slice("--data-dir=".length));
    } else if (arg === "--only-explicit") {
      options.useDefaultPaths = false;
    } else if (arg === "--project-root") {
      options.projectRoot = resolveInputPath(readOptionValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--project-root=")) {
      options.projectRoot = resolveInputPath(arg.slice("--project-root=".length));
    } else if (arg === "--input") {
      options.input = resolveInputPath(readOptionValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--input=")) {
      options.input = resolveInputPath(arg.slice("--input=".length));
    } else if (arg === "--out") {
      options.out = resolveInputPath(readOptionValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--out=")) {
      options.out = resolveInputPath(arg.slice("--out=".length));
    } else if (arg === "--root") {
      options.root = resolveInputPath(readOptionValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--root=")) {
      options.root = resolveInputPath(arg.slice("--root=".length));
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--require-complete") {
      options.requireComplete = true;
    } else if (arg === "--require-proposals") {
      options.requireProposals = true;
    } else if (arg === "--show-paths") {
      options.showPaths = true;
    } else if (arg === "--format") {
      options.format = parseFormat(readOptionValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--format=")) {
      options.format = parseFormat(arg.slice("--format=".length));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function renderValidation(result: ProjectSessionRetroValidationResult): string {
  const lines = [`valid: ${String(result.valid)}`];
  if (result.errors.length > 0) {
    lines.push("errors:");
    for (const error of result.errors) {
      lines.push(`- ${error}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push("warnings:");
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderProposalResult(result: ProjectSessionRetroProposalResult): string {
  const lines = [`changes: ${result.changes.length}`];
  for (const change of result.changes) {
    lines.push(`${change.status}: ${change.id} (${change.planId})`);
  }
  if (result.ledger.validation.errors.length > 0) {
    lines.push("validation errors:");
    for (const error of result.ledger.validation.errors) {
      lines.push(`- ${error}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function runCli(args = process.argv.slice(2)): void {
  const options = parseArgs(args);
  if (options.command === "help") {
    printUsage();
    return;
  }
  if (options.command === "init") {
    if (!options.projectRoot) {
      throw new Error("init requires --project-root.");
    }
    const outPath = options.out ?? path.join(options.projectRoot, "retro.json");
    const ledger = initProjectSessionRetroLedger({
      dataDirs: options.dataDirs,
      dbPaths: options.dbPaths,
      projectRoot: options.projectRoot,
      showPaths: options.showPaths,
      useDefaultPaths: options.useDefaultPaths,
    });
    writeJsonFile(outPath, ledger, { overwrite: options.overwrite });
    console.log(`wrote ${outPath}`);
    return;
  }
  if (options.command === "validate") {
    if (!options.input) {
      throw new Error("validate requires --input.");
    }
    const result = validateProjectSessionRetroLedger(readJsonFile(options.input), { requireComplete: options.requireComplete, requireProposals: options.requireProposals, root: options.root });
    process.stdout.write(options.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderValidation(result));
    if (!result.valid) {
      process.exitCode = 1;
    }
    return;
  }
  if (options.command === "proposals") {
    if (!options.input) {
      throw new Error("proposals requires --input.");
    }
    const ledger = readJsonFile(options.input) as ProjectSessionRetroLedger;
    const result = createProjectSessionRetroProposals(options.root, ledger, { dryRun: options.dryRun });
    if (!options.dryRun && result.ledger.validation.errors.length === 0) {
      fs.writeFileSync(options.input, `${JSON.stringify(result.ledger, null, 2)}\n`, "utf8");
    }
    process.stdout.write(options.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderProposalResult(result));
    if (result.ledger.validation.errors.length > 0) {
      process.exitCode = 1;
    }
    return;
  }
  if (options.command === "refresh") {
    if (!options.input) {
      throw new Error("refresh requires --input.");
    }
    const ledger = refreshAnalysisProgress(readJsonFile(options.input) as ProjectSessionRetroLedger);
    fs.writeFileSync(options.input, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    process.stdout.write(options.format === "json" ? `${JSON.stringify(ledger.analysisProgress, null, 2)}\n` : `refreshed ${options.input}\n`);
  }
}

export function runCliEntrypoint(): void {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }
}
