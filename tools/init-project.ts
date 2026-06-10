#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Mode = "preview" | "write";

type Options = {
  mode: Mode;
  overwrite: boolean;
  target: string | null;
};

type PlannedFile = {
  destination: string;
  label: string;
  source: string;
};

function defaultRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function printUsage(): void {
  console.log(`Usage:
  npm run init:project -- --target <project-path> [options]

Options:
  --target <path>       Target project directory.
  --mode <preview|write> Preview changes or write files. Default: preview.
  --overwrite          Backup and replace existing target files in write mode.
  --help               Show this help.
`);
}

function readValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.trim() === "" || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function parseMode(value: string): Mode {
  if (value === "preview" || value === "write") {
    return value;
  }
  throw new Error("--mode must be preview or write.");
}

function parseArgs(args: string[]): Options {
  const options: Options = { mode: "preview", overwrite: false, target: null };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--target") {
      options.target = readValue(args, index, arg);
      index++;
    } else if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
    } else if (arg === "--mode") {
      options.mode = parseMode(readValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--mode=")) {
      options.mode = parseMode(arg.slice("--mode=".length));
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function assertDirectory(target: string, label: string): void {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`${label} is not a directory: ${target}`);
  }
}

function copyTextFile(source: string, destination: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function backupExisting(destination: string, targetRoot: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const relative = path.relative(targetRoot, destination);
  const backup = path.join(targetRoot, ".backups", "opencode-dev-kit", stamp, relative);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(destination, backup);
  return backup;
}

function plannedFiles(repoRoot: string, targetRoot: string): PlannedFile[] {
  const templateRoot = path.join(repoRoot, "templates", "project");
  return [
    { label: "project AGENTS.md", source: path.join(templateRoot, "AGENTS.md"), destination: path.join(targetRoot, "AGENTS.md") },
    { label: "project opencode.json", source: path.join(templateRoot, "opencode.json"), destination: path.join(targetRoot, "opencode.json") },
    { label: "project validation guide", source: path.join(templateRoot, "validation.md"), destination: path.join(targetRoot, "opencode-dev-kit", "validation.md") },
    { label: "project adapter", source: path.join(templateRoot, "adapter.json"), destination: path.join(targetRoot, "opencode-dev-kit", "adapter.json") },
  ];
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!options.target) {
    throw new Error("Missing required --target <project-path>.");
  }

  const repoRoot = defaultRoot();
  const targetRoot = path.resolve(options.target);
  assertDirectory(targetRoot, "Target project");

  const files = plannedFiles(repoRoot, targetRoot);
  for (const file of files) {
    if (!fs.existsSync(file.source)) {
      throw new Error(`Missing template for ${file.label}: ${file.source}`);
    }
  }

  const existing = files.filter((file) => fs.existsSync(file.destination));
  if (existing.length > 0 && options.mode === "write" && !options.overwrite) {
    throw new Error(`Refusing to overwrite existing files without --overwrite: ${existing.map((file) => path.relative(targetRoot, file.destination)).join(", ")}`);
  }

  console.log(`# opencode-dev-kit project bootstrap`);
  console.log(`Mode: ${options.mode}`);
  console.log(`Target: ${targetRoot}`);
  console.log("");

  for (const file of files) {
    const relative = path.relative(targetRoot, file.destination).replace(/\\/g, "/");
    const exists = fs.existsSync(file.destination);
    if (options.mode === "preview") {
      console.log(`${exists ? "would replace" : "would create"}: ${relative}`);
      continue;
    }

    let backup = "";
    if (exists) {
      backup = backupExisting(file.destination, targetRoot);
    }
    copyTextFile(file.source, file.destination);
    console.log(`${exists ? "replaced" : "created"}: ${relative}${backup ? ` (backup: ${path.relative(targetRoot, backup).replace(/\\/g, "/")})` : ""}`);
  }

  console.log("");
  console.log("Next: run `npm run doctor -- --project <project-path>` from opencode-dev-kit, then start tasks with the Universal Development Loop.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
