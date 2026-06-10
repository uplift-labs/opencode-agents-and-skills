#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

type OutputFormat = "json" | "markdown";

type Options = {
  format: OutputFormat;
  root: string;
  showRoot: boolean;
};

type FileEntry = {
  path: string;
  lines?: number;
};

type PackageScript = {
  command: string;
  name: string;
};

type ProjectInventory = {
  buildFiles: FileEntry[];
  configFiles: FileEntry[];
  largeFiles: FileEntry[];
  packageScripts: PackageScript[];
  root: string;
  sourceRoots: FileEntry[];
  testRoots: FileEntry[];
  tool: "opencode-dev-kit-project-inventory";
  version: 1;
};

const ignoredDirectories = new Set([".git", ".serena", "node_modules", "dist", "build", "coverage", "target", ".next", ".nuxt", "vendor"]);
const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".go", ".rs", ".py", ".java", ".cs", ".cpp", ".c", ".h", ".rb", ".php", ".swift", ".kt", ".kts", ".vue", ".svelte"]);
const buildFileNames = new Set(["package.json", "Cargo.toml", "pyproject.toml", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts", "Makefile", "CMakeLists.txt", "deno.json", "bun.lockb", "pnpm-lock.yaml", "package-lock.json", "yarn.lock"]);
const configFileNames = new Set(["opencode.json", "opencode.jsonc", "tsconfig.json", "eslint.config.js", "eslint.config.mjs", "biome.json", "prettier.config.js", "prettier.config.mjs", "vitest.config.ts", "jest.config.ts", "Dockerfile"]);

function printUsage(): void {
  console.log(`Usage:
  npm run project:inventory -- [options]

Options:
  --root <path>             Project root. Default: current directory.
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
  const options: Options = { format: "markdown", root: process.cwd(), showRoot: false };
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

function toRelative(root: string, value: string): string {
  const relative = path.relative(root, value).replace(/\\/g, "/");
  return relative === "" ? "." : relative;
}

function countLines(file: string): number {
  const text = fs.readFileSync(file, "utf8");
  if (text.length === 0) {
    return 0;
  }
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const newlineCount = normalized.split("\n").length - 1;
  return normalized.endsWith("\n") ? newlineCount : newlineCount + 1;
}

function walk(root: string, current: string, files: string[], dirs: string[]): void {
  const entries = fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }
      dirs.push(fullPath);
      walk(root, fullPath, files, dirs);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
}

function readPackageScripts(root: string): PackageScript[] {
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { scripts?: Record<string, unknown> };
    return Object.entries(parsed.scripts ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([name, command]) => ({ name, command }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

function buildInventory(options: Options): ProjectInventory {
  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) {
    throw new Error(`Root is not a directory: ${options.showRoot ? options.root : "<redacted>"}`);
  }
  const files: string[] = [];
  const dirs: string[] = [];
  walk(options.root, options.root, files, dirs);

  const buildFiles = files.filter((file) => buildFileNames.has(path.basename(file))).map((file) => ({ path: toRelative(options.root, file) }));
  const configFiles = files.filter((file) => configFileNames.has(path.basename(file)) || toRelative(options.root, file).startsWith(".github/workflows/")).map((file) => ({ path: toRelative(options.root, file) }));
  const sourceRoots = dirs.filter((dir) => ["src", "app", "lib", "packages", "crates"].includes(path.basename(dir))).map((dir) => ({ path: toRelative(options.root, dir) }));
  const testRoots = dirs.filter((dir) => /^(test|tests|__tests__|spec)$/.test(path.basename(dir))).map((dir) => ({ path: toRelative(options.root, dir) }));
  const largeFiles = files
    .filter((file) => codeExtensions.has(path.extname(file).toLowerCase()))
    .map((file) => ({ path: toRelative(options.root, file), lines: countLines(file) }))
    .filter((file) => (file.lines ?? 0) >= 400)
    .sort((left, right) => (right.lines ?? 0) - (left.lines ?? 0) || left.path.localeCompare(right.path))
    .slice(0, 20);

  return {
    buildFiles: buildFiles.sort((left, right) => left.path.localeCompare(right.path)),
    configFiles: configFiles.sort((left, right) => left.path.localeCompare(right.path)),
    largeFiles,
    packageScripts: readPackageScripts(options.root),
    root: options.showRoot ? options.root : "<redacted>",
    sourceRoots: sourceRoots.sort((left, right) => left.path.localeCompare(right.path)),
    testRoots: testRoots.sort((left, right) => left.path.localeCompare(right.path)),
    tool: "opencode-dev-kit-project-inventory",
    version: 1,
  };
}

function renderList<T>(items: T[], render: (item: T) => string): string {
  return items.length === 0 ? "none" : items.map(render).join("\n");
}

function renderMarkdown(inventory: ProjectInventory): string {
  return [
    "# Project Inventory",
    "",
    `Root: ${inventory.root}`,
    "",
    "## Build Files",
    "",
    renderList(inventory.buildFiles, (file) => `- ${file.path}`),
    "",
    "## Package Scripts",
    "",
    renderList(inventory.packageScripts, (script) => `- ${script.name}: \`${script.command}\``),
    "",
    "## Source Roots",
    "",
    renderList(inventory.sourceRoots, (file) => `- ${file.path}`),
    "",
    "## Test Roots",
    "",
    renderList(inventory.testRoots, (file) => `- ${file.path}`),
    "",
    "## Config Files",
    "",
    renderList(inventory.configFiles, (file) => `- ${file.path}`),
    "",
    "## Large Files",
    "",
    inventory.largeFiles.length === 0 ? "none" : ["| File | Lines |", "| --- | ---: |", ...inventory.largeFiles.map((file) => `| ${file.path} | ${file.lines ?? 0} |`)].join("\n"),
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
