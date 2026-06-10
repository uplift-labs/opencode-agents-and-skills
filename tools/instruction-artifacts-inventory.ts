#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type OutputFormat = "json" | "markdown";

type Options = {
  format: OutputFormat;
  root: string;
  showRoot: boolean;
};

type ArtifactKind = "agent" | "instruction" | "root" | "skill" | "template";

type Artifact = {
  chars: number;
  descriptionChars: number | null;
  kind: ArtifactKind;
  lines: number;
  path: string;
  tokenProxy: number;
};

type RepeatedLine = {
  count: number;
  line: string;
};

type InstructionInventory = {
  artifacts: Artifact[];
  counts: Record<ArtifactKind, number>;
  repeatedLines: RepeatedLine[];
  root: string;
  totals: {
    artifacts: number;
    chars: number;
    lines: number;
    tokenProxy: number;
  };
  tool: "opencode-dev-kit-instruction-artifacts-inventory";
  version: 1;
};

function defaultRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function printUsage(): void {
  console.log(`Usage:
  npm run instruction:inventory -- [options]

Options:
  --root <path>             Repository root. Default: this repository.
  --format <json|markdown>  Output format. Default: markdown.
  --show-root               Include absolute root path. Default redacts it.
  --help                    Show this help.
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
  const options: Options = { format: "markdown", root: defaultRoot(), showRoot: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--root") {
      options.root = readValue(args, index, arg);
      index++;
    } else if (arg.startsWith("--root=")) {
      options.root = arg.slice("--root=".length);
    } else if (arg === "--format") {
      options.format = parseFormat(readValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--format=")) {
      options.format = parseFormat(arg.slice("--format=".length));
    } else if (arg === "--show-root") {
      options.showRoot = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  options.root = path.resolve(options.root);
  return options;
}

function toRelative(root: string, file: string): string {
  const relative = path.relative(root, file).replace(/\\/g, "/");
  return relative === "" ? "." : relative;
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const newlineCount = normalized.split("\n").length - 1;
  return normalized.endsWith("\n") ? newlineCount : newlineCount + 1;
}

function walkMarkdown(root: string, current: string, files: string[]): void {
  const entries = fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if ([".git", ".serena", "node_modules"].includes(entry.name)) {
        continue;
      }
      walkMarkdown(root, fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
}

function classify(relative: string): ArtifactKind | null {
  if (/^\.opencode\/skills\/[^/]+\/SKILL\.md$/.test(relative)) {
    return "skill";
  }
  if (/^\.opencode\/agents\/[^/]+\.md$/.test(relative)) {
    return "agent";
  }
  if (/^instructions\/.+\.md$/.test(relative)) {
    return "instruction";
  }
  if (/^templates\/.+\.md$/.test(relative)) {
    return "template";
  }
  if (relative === "README.md" || relative === "AGENTS.md") {
    return "root";
  }
  return null;
}

function extractDescriptionChars(text: string): number | null {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }
  const description = match[1].split(/\r?\n/).find((line) => line.startsWith("description:"));
  if (!description) {
    return null;
  }
  return description.slice("description:".length).trim().replace(/^['"]|['"]$/g, "").length;
}

function repeatedLines(artifacts: Array<{ text: string }>): RepeatedLine[] {
  const counts = new Map<string, number>();
  for (const artifact of artifacts) {
    const seenInFile = new Set<string>();
    for (const line of artifact.text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length < 40 || trimmed.startsWith("|") || trimmed.startsWith("---")) {
        continue;
      }
      seenInFile.add(trimmed);
    }
    for (const line of seenInFile) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([line, count]) => ({ line, count }))
    .sort((left, right) => right.count - left.count || left.line.localeCompare(right.line))
    .slice(0, 20);
}

function buildInventory(options: Options): InstructionInventory {
  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) {
    throw new Error(`Root is not a directory: ${options.showRoot ? options.root : "<redacted>"}`);
  }
  const files: string[] = [];
  walkMarkdown(options.root, options.root, files);
  const artifactsWithText: Array<Artifact & { text: string }> = [];
  for (const file of files) {
    const relative = toRelative(options.root, file);
    const kind = classify(relative);
    if (!kind) {
      continue;
    }
    const text = fs.readFileSync(file, "utf8");
    const chars = text.length;
    const lines = countLines(text);
    artifactsWithText.push({
      chars,
      descriptionChars: extractDescriptionChars(text),
      kind,
      lines,
      path: relative,
      text,
      tokenProxy: Math.ceil(chars / 4),
    });
  }
  artifactsWithText.sort((left, right) => right.chars - left.chars || left.path.localeCompare(right.path));
  const artifacts = artifactsWithText.map(({ text: _text, ...artifact }) => artifact);
  const counts: Record<ArtifactKind, number> = { agent: 0, instruction: 0, root: 0, skill: 0, template: 0 };
  for (const artifact of artifacts) {
    counts[artifact.kind]++;
  }
  return {
    artifacts,
    counts,
    repeatedLines: repeatedLines(artifactsWithText),
    root: options.showRoot ? options.root : "<redacted>",
    totals: {
      artifacts: artifacts.length,
      chars: artifacts.reduce((sum, artifact) => sum + artifact.chars, 0),
      lines: artifacts.reduce((sum, artifact) => sum + artifact.lines, 0),
      tokenProxy: artifacts.reduce((sum, artifact) => sum + artifact.tokenProxy, 0),
    },
    tool: "opencode-dev-kit-instruction-artifacts-inventory",
    version: 1,
  };
}

function renderMarkdown(inventory: InstructionInventory): string {
  return [
    "# Instruction Artifacts Inventory",
    "",
    `Root: ${inventory.root}`,
    `Artifacts: ${inventory.totals.artifacts}`,
    `Lines: ${inventory.totals.lines}`,
    `Chars: ${inventory.totals.chars}`,
    `Token proxy: ${inventory.totals.tokenProxy}`,
    "",
    "## Counts By Kind",
    "",
    "| Kind | Count |",
    "| --- | ---: |",
    ...Object.entries(inventory.counts).map(([kind, count]) => `| ${kind} | ${count} |`),
    "",
    "## Top Artifacts",
    "",
    "| File | Kind | Lines | Chars | Token Proxy | Description Chars |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...inventory.artifacts.slice(0, 20).map((artifact) => `| ${artifact.path} | ${artifact.kind} | ${artifact.lines} | ${artifact.chars} | ${artifact.tokenProxy} | ${artifact.descriptionChars ?? 0} |`),
    "",
    "## Repeated Lines",
    "",
    inventory.repeatedLines.length === 0 ? "none" : ["| Count | Line |", "| ---: | --- |", ...inventory.repeatedLines.map((line) => `| ${line.count} | ${line.line.replace(/\|/g, "\\|")} |`)].join("\n"),
    "",
  ].join("\n");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const inventory = buildInventory(options);
  console.log(options.format === "json" ? JSON.stringify(inventory, null, 2) : renderMarkdown(inventory));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
