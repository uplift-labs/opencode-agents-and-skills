#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

type OutputFormat = "json" | "markdown";

type Config = {
  root: string;
  attentionLines: number;
  splitLines: number;
  format: OutputFormat;
  failOnSplitCandidates: boolean;
  showRoot: boolean;
};

type LineCountBand = "normal" | "attention" | "split-candidate";

type FileLineCount = {
  path: string;
  lines: number;
  band: LineCountBand;
};

type Inventory = {
  root: string;
  attentionLines: number;
  splitLines: number;
  scannedFiles: number;
  status: "pass" | "attention" | "split-candidate";
  attentionFiles: FileLineCount[];
  splitCandidateFiles: FileLineCount[];
  topFiles: FileLineCount[];
  skippedDirectories: string[];
};

const codeExtensions = new Set([
  ".c",
  ".cc",
  ".clj",
  ".cpp",
  ".cs",
  ".cts",
  ".cxx",
  ".dart",
  ".erl",
  ".ex",
  ".exs",
  ".fs",
  ".fsx",
  ".go",
  ".h",
  ".hh",
  ".hpp",
  ".hrl",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".lua",
  ".mjs",
  ".mts",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".swift",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
]);

const ignoredDirectoryNames = new Set([
  ".backups",
  ".cache",
  ".git",
  ".next",
  ".nuxt",
  ".serena",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

function parseArgs(args: string[]): Config {
  const config: Config = {
    root: process.cwd(),
    attentionLines: 400,
    splitLines: 800,
    format: "markdown",
    failOnSplitCandidates: false,
    showRoot: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root") {
      config.root = requireValue(args, ++i, arg);
    } else if (arg.startsWith("--root=")) {
      config.root = arg.slice("--root=".length);
    } else if (arg === "--attention-lines") {
      config.attentionLines = parsePositiveInteger(requireValue(args, ++i, arg), arg);
    } else if (arg.startsWith("--attention-lines=")) {
      config.attentionLines = parsePositiveInteger(arg.slice("--attention-lines=".length), "--attention-lines");
    } else if (arg === "--split-lines") {
      config.splitLines = parsePositiveInteger(requireValue(args, ++i, arg), arg);
    } else if (arg.startsWith("--split-lines=")) {
      config.splitLines = parsePositiveInteger(arg.slice("--split-lines=".length), "--split-lines");
    } else if (arg === "--format") {
      config.format = parseFormat(requireValue(args, ++i, arg));
    } else if (arg.startsWith("--format=")) {
      config.format = parseFormat(arg.slice("--format=".length));
    } else if (arg === "--fail-on-split-candidates") {
      config.failOnSplitCandidates = true;
    } else if (arg === "--show-root") {
      config.showRoot = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  config.root = path.resolve(config.root);
  if (!fs.existsSync(config.root) || !fs.statSync(config.root).isDirectory()) {
    throw new Error(`Root is not a directory: ${formatRootForOutput(config)}`);
  }
  if (config.attentionLines > config.splitLines) {
    throw new Error("--attention-lines must be less than or equal to --split-lines.");
  }
  return config;
}

function formatRootForOutput(config: Config): string {
  return config.showRoot ? config.root : "<redacted>";
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.trim() === "" || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}.`);
  }
  return value;
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive integer.`);
  }
  return parsed;
}

function parseFormat(value: string): OutputFormat {
  if (value === "json" || value === "markdown") {
    return value;
  }
  throw new Error(`--format must be json or markdown.`);
}

function printHelp(): void {
  console.log([
    "Usage: node tools/code-quality-inventory.ts [options]",
    "",
    "Options:",
    "  --root <path>             Directory to scan. Defaults to the current directory.",
    "  --attention-lines <n>     File-size review attention band. Defaults to 400.",
    "  --split-lines <n>         Split-or-justify candidate band. Defaults to 800.",
    "  --format <json|markdown>  Output format. Defaults to markdown.",
    "  --fail-on-split-candidates Exit non-zero when any code file reaches split-candidate band.",
    "  --show-root              Include the absolute root path. Hidden by default for privacy-safe output.",
    "  --help                   Show this help.",
  ].join("\n"));
}

function buildInventory(config: Config): Inventory {
  const files: FileLineCount[] = [];
  const skippedDirectories = new Set<string>();

  walk(config.root, config.root, config, files, skippedDirectories);
  files.sort(compareByLinesDescendingThenPath);

  const attentionFiles = files.filter((file) => file.band === "attention" || file.band === "split-candidate");
  const splitCandidateFiles = files.filter((file) => file.band === "split-candidate");
  return {
    root: formatRootForOutput(config),
    attentionLines: config.attentionLines,
    splitLines: config.splitLines,
    scannedFiles: files.length,
    status: splitCandidateFiles.length > 0 ? "split-candidate" : attentionFiles.length > 0 ? "attention" : "pass",
    attentionFiles,
    splitCandidateFiles,
    topFiles: files.slice(0, 20),
    skippedDirectories: [...skippedDirectories].sort(),
  };
}

function walk(root: string, current: string, config: Config, files: FileLineCount[], skippedDirectories: Set<string>): void {
  const entries = fs.readdirSync(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) {
        skippedDirectories.add(toRelativePath(root, fullPath));
      } else {
        walk(root, fullPath, config, files, skippedDirectories);
      }
      continue;
    }

    if (!entry.isFile() || !isCodeFile(entry.name)) {
      continue;
    }

    const lines = countLines(fs.readFileSync(fullPath, "utf8"));
    files.push({
      path: toRelativePath(root, fullPath),
      lines,
      band: classifyLineCount(lines, config),
    });
  }
}

function classifyLineCount(lines: number, config: Config): LineCountBand {
  if (lines >= config.splitLines) {
    return "split-candidate";
  }
  if (lines >= config.attentionLines) {
    return "attention";
  }
  return "normal";
}

function isCodeFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".min.js") || lowerName.endsWith(".d.ts")) {
    return false;
  }
  return codeExtensions.has(path.extname(lowerName));
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const newlineCount = normalized.split("\n").length - 1;
  return normalized.endsWith("\n") ? newlineCount : newlineCount + 1;
}

function toRelativePath(root: string, filePath: string): string {
  const relative = path.relative(root, filePath).replace(/\\/g, "/");
  return relative === "" ? "." : relative;
}

function compareByLinesDescendingThenPath(left: FileLineCount, right: FileLineCount): number {
  if (left.lines !== right.lines) {
    return right.lines - left.lines;
  }
  return left.path.localeCompare(right.path);
}

function renderMarkdown(inventory: Inventory): string {
  return [
    "# Code Quality Inventory",
    "",
    `Root: ${inventory.root}`,
    `Attention lines: ${inventory.attentionLines}`,
    `Split-candidate lines: ${inventory.splitLines}`,
    `Scanned code files: ${inventory.scannedFiles}`,
    `Status: ${inventory.status}`,
    "",
    "## Split-Candidate Files",
    "",
    renderTable(inventory.splitCandidateFiles),
    "",
    "## Attention Files",
    "",
    renderTable(inventory.attentionFiles),
    "",
    "## Top Files",
    "",
    renderTable(inventory.topFiles),
    "",
    "## Skipped Directories",
    "",
    inventory.skippedDirectories.length === 0 ? "none" : inventory.skippedDirectories.join("\n"),
    "",
  ].join("\n");
}

function renderTable(files: FileLineCount[]): string {
  if (files.length === 0) {
    return "none";
  }
  return [
    "| File | Lines | Band |",
    "| --- | ---: | --- |",
    ...files.map((file) => `| ${file.path} | ${file.lines} | ${file.band} |`),
  ].join("\n");
}

try {
  const config = parseArgs(process.argv.slice(2));
  const inventory = buildInventory(config);
  if (config.format === "json") {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    console.log(renderMarkdown(inventory));
  }
  if (config.failOnSplitCandidates && inventory.splitCandidateFiles.length > 0) {
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
