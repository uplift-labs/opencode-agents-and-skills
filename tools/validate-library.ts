#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type FrontmatterValue = string | Record<string, never>;
type FrontmatterMap = Map<string, FrontmatterValue>;
type TextContract = {
  fileName: string;
  label: string;
  requiredText: string[];
};

type Options = {
  failOnWarnings: boolean;
  forbiddenAnchors: string[];
  root: string;
};

const errors: string[] = [];
const warnings: string[] = [];
const forbiddenCodeExtensions = new Set([".cjs", ".js", ".mjs", ".ps1", ".psd1", ".psm1", ".py", ".pyw"]);
const mutationCapablePermissionKeys = new Set(["bash", "edit", "task", "external_directory"]);
const agentTextContracts: TextContract[] = [
  {
    fileName: "test-coverage-reviewer.md",
    label: "test-coverage-reviewer must require task/repro/runtime-envelope coverage",
    requiredText: [
      "## Review Inputs And Baseline Scenario",
      "user task, acceptance criteria, logs, and reproduction",
      "actual runtime envelope",
      "fresh-session behavior",
      "Task/Repro Coverage Matrix",
    ],
  },
];
const legacyToolingReferences = [
  "pwsh -NoProfile -File",
  "validate-library.ps1",
  "test-library.ps1",
  "install-opencode-global.js",
];

function addError(message: string): void {
  errors.push(message);
}

function addWarning(message: string): void {
  warnings.push(message);
}

function defaultRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readOptionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.trim() === "" || value.startsWith("-")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function splitForbiddenAnchorValues(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parseArgs(args: string[]): Options {
  let root = defaultRoot();
  let failOnWarnings = false;
  const forbiddenAnchors: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" || arg === "--Root" || arg === "-Root") {
      root = readOptionValue(args, i, arg);
      i++;
    } else if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
    } else if (arg.startsWith("--Root=")) {
      root = arg.slice("--Root=".length);
    } else if (arg === "--forbidden-anchor" || arg === "--ForbiddenAnchor" || arg === "-ForbiddenAnchor") {
      const values: string[] = [];
      while (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        values.push(args[i + 1]);
        i++;
      }
      if (values.length === 0) {
        throw new Error(`Missing value for ${arg}.`);
      }
      forbiddenAnchors.push(...splitForbiddenAnchorValues(values));
    } else if (arg.startsWith("--forbidden-anchor=")) {
      forbiddenAnchors.push(...splitForbiddenAnchorValues([arg.slice("--forbidden-anchor=".length)]));
    } else if (arg.startsWith("--ForbiddenAnchor=")) {
      forbiddenAnchors.push(...splitForbiddenAnchorValues([arg.slice("--ForbiddenAnchor=".length)]));
    } else if (arg === "--fail-on-warnings") {
      failOnWarnings = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { failOnWarnings, forbiddenAnchors, root: path.resolve(root) };
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function convertFromFrontmatterScalar(value: string, file: string, lineNumber: number): string {
  const trimmed = value.trim();
  const doubleQuoted = trimmed.startsWith('"') || trimmed.endsWith('"');
  const singleQuoted = trimmed.startsWith("'") || trimmed.endsWith("'");

  if (
    (doubleQuoted && !(trimmed.startsWith('"') && trimmed.endsWith('"'))) ||
    (singleQuoted && !(trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    addError(`Invalid frontmatter quoting: ${file}:${lineNumber}`);
    return trimmed;
  }

  if (!doubleQuoted && !singleQuoted && /:\s/.test(trimmed)) {
    addError(`Invalid unquoted frontmatter scalar containing ': ': ${file}:${lineNumber}`);
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function getFrontmatterMap(text: string, file: string): FrontmatterMap {
  const match = text.match(/^---\r?\n(?<body>[\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const values: FrontmatterMap = new Map();
  if (!match?.groups?.body) {
    addError(`Missing leading frontmatter block: ${file}`);
    return values;
  }

  let currentMap: string | null = null;
  const lines = match.groups.body.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 2;
    const line = lines[index];
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }

    const mapMatch = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*$/);
    if (mapMatch) {
      currentMap = mapMatch[1];
      values.set(currentMap, {});
      continue;
    }

    const scalarMatch = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.+?)\s*$/);
    if (scalarMatch) {
      currentMap = null;
      values.set(scalarMatch[1], convertFromFrontmatterScalar(scalarMatch[2], file, lineNumber));
      continue;
    }

    const nestedScalarMatch = line.match(/^\s{2,}([A-Za-z_][A-Za-z0-9_-]*):\s*(.+?)\s*$/);
    if (nestedScalarMatch) {
      if (!currentMap) {
        addError(`Nested frontmatter value without parent map: ${file}:${lineNumber}`);
      } else {
        values.set(`${currentMap}.${nestedScalarMatch[1]}`, convertFromFrontmatterScalar(nestedScalarMatch[2], file, lineNumber));
      }
      continue;
    }

    addError(`Unsupported frontmatter syntax: ${file}:${lineNumber}`);
  }

  return values;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function walkMarkdownFiles(root: string, current = root, result: string[] = []): string[] {
  const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if ([".git", ".serena", "node_modules"].includes(entry.name)) {
        continue;
      }
      walkMarkdownFiles(root, entryPath, result);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      result.push(entryPath);
    }
  }
  return result;
}

function walkRepositoryFiles(root: string, current = root, result: string[] = []): string[] {
  const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if ([".git", ".serena", "node_modules"].includes(entry.name)) {
        continue;
      }
      walkRepositoryFiles(root, entryPath, result);
    } else if (entry.isFile()) {
      result.push(entryPath);
    }
  }
  return result;
}

function validateTypeScriptOnlySourceFiles(root: string): void {
  for (const file of walkRepositoryFiles(root)) {
    const extension = path.extname(file).toLowerCase();
    if (forbiddenCodeExtensions.has(extension)) {
      addError(`Non-TypeScript source/tooling file is not allowed: ${toPosixPath(path.relative(root, file))}`);
    }
  }
}

function getMarkdownFiles(root: string): string[] {
  const gitDir = path.join(root, ".git");
  if (fs.existsSync(gitDir)) {
    const gitResult = spawnSync("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "*.md"], {
      encoding: "utf8",
    });
    if (gitResult.status === 0 && typeof gitResult.stdout === "string") {
      return gitResult.stdout
        .split(/\r?\n/)
        .filter((relative) => relative.trim() !== "")
        .map((relative) => toPosixPath(relative))
        .filter((relative) => !/(^|\/)\.serena\//.test(relative))
        .map((relative) => path.join(root, relative))
        .filter((file) => fs.existsSync(file));
    }
  }

  return walkMarkdownFiles(root).sort((a, b) => a.localeCompare(b));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCatalogEntries(readmeText: string, startHeading: string, endHeading: string, readmePath: string): string[] {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(startHeading)}\\s*$\\r?\\n(?<body>.*?)^##\\s+${escapeRegExp(endHeading)}\\s*$`, "ms");
  const match = readmeText.match(pattern);
  if (!match?.groups?.body) {
    addError(`Missing README catalog section '${startHeading}': ${readmePath}`);
    return [];
  }

  return Array.from(match.groups.body.matchAll(/^-\s+`([^`]+)`:/gm), (entry) => entry[1]);
}

function getRequiredHeadingSection(readmeText: string, heading: string, readmePath: string): string {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$\\r?\\n(?<body>.*?)(?=^##\\s+|(?![\\s\\S]))`, "ms");
  const match = readmeText.match(pattern);
  if (!match?.groups?.body) {
    addError(`Missing README section '${heading}': ${readmePath}`);
    return "";
  }
  return match.groups.body;
}

function requireBulletedSection(body: string, label: string, file: string): void {
  if (!/^-\s+\S/m.test(body)) {
    addError(`${label} must include at least one bullet: ${file}`);
  }
}

function compareCatalog(label: string, expected: string[], actual: string[], readmePath: string): void {
  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();
  for (const name of expectedSorted) {
    if (!actualSorted.includes(name)) {
      addError(`${label} catalog missing '${name}': ${readmePath}`);
    }
  }
  for (const name of actualSorted) {
    if (!expectedSorted.includes(name)) {
      addError(`${label} catalog references missing artifact '${name}': ${readmePath}`);
    }
  }
}

function requireTextContains(text: string, needle: string, label: string, file: string): void {
  if (!text.includes(needle)) {
    addError(`${label} must include '${needle}': ${file}`);
  }
}

function validateTextContracts(file: string, text: string, contracts: TextContract[]): void {
  const fileName = path.basename(file);
  for (const contract of contracts) {
    if (contract.fileName !== fileName) {
      continue;
    }
    for (const requiredText of contract.requiredText) {
      requireTextContains(text, requiredText, contract.label, file);
    }
  }
}

function requireFile(root: string, relativePath: string, label: string): void {
  const target = path.join(root, ...relativePath.split("/"));
  if (!fileExists(target)) {
    addError(`Missing ${label}: ${relativePath}`);
  }
}

function requireDirectory(root: string, relativePath: string, label: string): void {
  const target = path.join(root, ...relativePath.split("/"));
  if (!directoryExists(target)) {
    addError(`Missing ${label}: ${relativePath}`);
  }
}

function getRequiredScalar(frontmatter: FrontmatterMap, key: string, file: string): string | null {
  if (!frontmatter.has(key)) {
    return null;
  }
  const value = frontmatter.get(key);
  if (typeof value !== "string") {
    addError(`Frontmatter field must be a scalar: ${file}:${key}`);
    return null;
  }
  return value;
}

function directoryExists(target: string): boolean {
  return fs.existsSync(target) && fs.statSync(target).isDirectory();
}

function fileExists(target: string): boolean {
  return fs.existsSync(target) && fs.statSync(target).isFile();
}

function listDirectories(root: string): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function listFiles(root: string, extension: string): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function validateSkills(root: string): string[] {
  const skillsDir = path.join(root, ".opencode", "skills");
  if (!directoryExists(skillsDir)) {
    addError(`Missing skills directory: ${skillsDir}`);
    return [];
  }

  const skillNames: string[] = [];
  for (const dir of listDirectories(skillsDir)) {
    const folderName = path.basename(dir);
    skillNames.push(folderName);
    const file = path.join(dir, "SKILL.md");
    if (!fileExists(file)) {
      addError(`Missing SKILL.md for skill folder: ${folderName}`);
      continue;
    }

    const text = readText(file);
    const frontmatter = getFrontmatterMap(text, file);
    const name = getRequiredScalar(frontmatter, "name", file);
    const description = getRequiredScalar(frontmatter, "description", file);
    if (!name || name.trim() === "") {
      addError(`Missing skill name: ${file}`);
    } else if (name !== folderName) {
      addError(`Skill name mismatch: folder=${folderName} name=${name}`);
    } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      addError(`Invalid skill name format: ${name}`);
    }
    if (!description || description.trim() === "") {
      addError(`Missing skill description: ${file}`);
    } else if (description.length > 1024) {
      addError(`Skill description exceeds 1024 chars: ${file}`);
    }
  }

  return skillNames;
}

function validateAgents(root: string): string[] {
  const agentsDir = path.join(root, ".opencode", "agents");
  if (!directoryExists(agentsDir)) {
    addError(`Missing agents directory: ${agentsDir}`);
    return [];
  }

  const agentNames: string[] = [];
  for (const file of listFiles(agentsDir, ".md")) {
    agentNames.push(path.basename(file, ".md"));
    const text = readText(file);
    const frontmatter = getFrontmatterMap(text, file);
    const description = getRequiredScalar(frontmatter, "description", file);
    const mode = getRequiredScalar(frontmatter, "mode", file);
    if (!description || description.trim() === "") {
      addError(`Missing agent description: ${file}`);
    }
    if (mode !== "subagent") {
      addError(`Reusable reviewer agent must use mode: subagent: ${file}`);
    }
    for (const permission of ["read", "glob", "grep", "list"]) {
      const key = `permission.${permission}`;
      if (frontmatter.get(key) !== "allow") {
        addError(`Agent permission must set ${permission}: allow: ${file}`);
      }
    }
    for (const permission of ["bash", "edit", "task", "question", "skill", "webfetch", "websearch", "todowrite", "external_directory", "lsp", "doom_loop"]) {
      const key = `permission.${permission}`;
      if (frontmatter.get(key) !== "deny") {
        addError(`Agent permission must set ${permission}: deny: ${file}`);
      }
    }
    validateTextContracts(file, text, agentTextContracts);
  }

  return agentNames;
}

function getInstructionNames(root: string): string[] {
  const instructionsDir = path.join(root, "instructions");
  if (!directoryExists(instructionsDir)) {
    return [];
  }
  return listFiles(instructionsDir, ".md").map((file) => path.basename(file));
}

function validateReadme(root: string, skillNames: string[], agentNames: string[], instructionNames: string[]): void {
  const readmePath = path.join(root, "README.md");
  if (!fileExists(readmePath)) {
    addError(`Missing README.md: ${readmePath}`);
    return;
  }

  const readmeText = readText(readmePath);
  const routingMap = getRequiredHeadingSection(readmeText, "Routing Map", readmePath);
  const reviewerGateMap = getRequiredHeadingSection(readmeText, "Reviewer Gate Map", readmePath);
  requireBulletedSection(routingMap, "README routing map", readmePath);
  requireBulletedSection(reviewerGateMap, "README reviewer gate map", readmePath);
  requireTextContains(routingMap, "instruction-artifact-tuning", "README instruction-artifact route", readmePath);
  requireTextContains(routingMap, "instruction-artifact-audit-runbook.md", "README instruction-artifact route", readmePath);
  requireTextContains(reviewerGateMap, "instruction-artifact-reviewer", "README reviewer gate map", readmePath);
  compareCatalog("Skill", skillNames, getCatalogEntries(readmeText, "Skill Catalog", "Agent Catalog", readmePath), readmePath);
  compareCatalog("Agent", agentNames, getCatalogEntries(readmeText, "Agent Catalog", "Instruction Templates", readmePath), readmePath);
  compareCatalog("Instruction template", instructionNames, getCatalogEntries(readmeText, "Instruction Templates", "Porting Notes", readmePath), readmePath);
}

function validateAgentsMd(root: string): void {
  const agentsPath = path.join(root, "AGENTS.md");
  if (!fileExists(agentsPath)) {
    addError(`Missing AGENTS.md: ${agentsPath}`);
    return;
  }

  const agentsText = readText(agentsPath);
  requireTextContains(agentsText, "## Autonomous Work Contract", "AGENTS.md autonomous work contract", agentsPath);
  requireTextContains(agentsText, "Ask the user only", "AGENTS.md autonomous work contract", agentsPath);
  requireTextContains(agentsText, "## Completion Handoff", "AGENTS.md completion handoff contract", agentsPath);
  requireTextContains(agentsText, "`question`", "AGENTS.md completion handoff contract", agentsPath);
  requireTextContains(agentsText, "(Recommended)", "AGENTS.md completion handoff contract", agentsPath);
  requireTextContains(agentsText, "Suggested Next Options", "AGENTS.md completion handoff contract", agentsPath);
  requireTextContains(agentsText, "Actionable Continuation Items", "AGENTS.md completion handoff contract", agentsPath);
  requireTextContains(agentsText, "## TypeScript Development", "AGENTS.md TypeScript-only development policy", agentsPath);
  requireTextContains(agentsText, "TypeScript", "AGENTS.md TypeScript-only development policy", agentsPath);
  requireTextContains(agentsText, "PowerShell", "AGENTS.md TypeScript-only development policy", agentsPath);
  requireTextContains(agentsText, "Python", "AGENTS.md TypeScript-only development policy", agentsPath);
  requireTextContains(agentsText, "JavaScript", "AGENTS.md TypeScript-only development policy", agentsPath);
  requireTextContains(agentsText, "## Deterministic Helper Automation", "AGENTS.md deterministic helper automation policy", agentsPath);
  requireTextContains(agentsText, "repetitive, evidence-heavy", "AGENTS.md deterministic helper automation policy", agentsPath);
  requireTextContains(agentsText, "no hidden heuristics", "AGENTS.md deterministic helper automation policy", agentsPath);
  requireTextContains(agentsText, "explicit inputs", "AGENTS.md deterministic helper automation policy", agentsPath);
  requireTextContains(agentsText, "explicit outputs", "AGENTS.md deterministic helper automation policy", agentsPath);
  requireTextContains(agentsText, "privacy-safe output", "AGENTS.md deterministic helper automation policy", agentsPath);
  requireTextContains(agentsText, "fuzzy scoring", "AGENTS.md deterministic helper automation policy", agentsPath);
  requireTextContains(agentsText, "model-like summarization", "AGENTS.md deterministic helper automation policy", agentsPath);
  for (const fallback of ["unknown", "unreadable", "unsupported", "blocked"]) {
    requireTextContains(agentsText, fallback, "AGENTS.md deterministic helper automation fallback policy", agentsPath);
  }

  if (/after (a )?non-trivial user-visible work( cycle)?,? (the main session offers|offer|use the built-in `?question`?|before stopping)/i.test(agentsText)) {
    addError(`AGENTS.md must not require routine post-task question handoff: ${agentsPath}`);
  }
}

function validatePackageScripts(root: string): void {
  const packagePath = path.join(root, "package.json");
  if (!fileExists(packagePath)) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(packagePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addError(`Invalid package.json: ${packagePath}: ${message}`);
    return;
  }

  if (!parsed || typeof parsed !== "object" || !("scripts" in parsed)) {
    return;
  }

  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== "object") {
    return;
  }

  for (const [name, value] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof value !== "string") {
      continue;
    }
    if (/(^|\s)(pwsh|powershell)(\s|$)|\.(ps1|psd1|psm1|py|pyw|js|cjs|mjs)\b/i.test(value)) {
      addError(`Package script '${name}' must use TypeScript tooling, not PowerShell, Python, or JavaScript entrypoints: ${packagePath}`);
    }
  }
}

function readPackageScripts(root: string): Record<string, string> {
  const packagePath = path.join(root, "package.json");
  if (!fileExists(packagePath)) {
    addError(`Missing package.json for opencode-dev-kit tooling: ${packagePath}`);
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(packagePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addError(`Invalid package.json: ${packagePath}: ${message}`);
    return {};
  }
  if (!isPlainRecord(parsed) || !isPlainRecord(parsed.scripts)) {
    addError(`package.json must define scripts for opencode-dev-kit tooling: ${packagePath}`);
    return {};
  }
  const scripts: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed.scripts)) {
    if (typeof value === "string") {
      scripts[name] = value;
    }
  }
  return scripts;
}

function validateDevKitContract(root: string): void {
  requireFile(root, "instructions/universal-development-loop.md", "Universal Development Loop instruction");
  requireFile(root, "templates/project/AGENTS.md", "project AGENTS.md template");
  requireFile(root, "templates/project/opencode.json", "project opencode.json template");
  requireFile(root, "templates/project/validation.md", "project validation template");
  requireFile(root, "templates/project/adapter.json", "project adapter template");
  requireFile(root, "templates/ci/github-actions.yml", "CI template");
  requireDirectory(root, "profiles", "install profiles directory");
  requireFile(root, "profiles/standard.json", "standard profile");
  requireFile(root, "profiles/strict.json", "strict profile");
  requireFile(root, "profiles/advanced.json", "advanced profile");
  requireFile(root, "profiles/autopilot-live.json", "Autopilot live profile");
  requireFile(root, "tools/init-project.ts", "project bootstrap tool");
  requireFile(root, "tools/doctor.ts", "doctor tool");
  requireFile(root, "tools/project-inventory.ts", "project inventory tool");
  requireFile(root, "tools/instruction-artifacts-inventory.ts", "instruction inventory tool");
  requireFile(root, "tools/pre-push-validate.ts", "pre-push validation tool");
  requireFile(root, ".githooks/pre-push", "tracked pre-push hook");

  const universalLoop = path.join(root, "instructions", "universal-development-loop.md");
  if (fileExists(universalLoop)) {
    const text = readText(universalLoop);
    for (const required of ["Intake", "Evidence", "Baseline Proof", "Small Slice", "Test First", "Focused Validation", "Review Gate", "Handoff", "Process Improvement"]) {
      requireTextContains(text, required, "Universal Development Loop", universalLoop);
    }
  }

  const projectTemplate = path.join(root, "templates", "project", "AGENTS.md");
  if (fileExists(projectTemplate)) {
    requireTextContains(readText(projectTemplate), "Universal Development Loop", "project AGENTS.md template", projectTemplate);
  }

  const adapterTemplate = path.join(root, "templates", "project", "adapter.json");
  if (fileExists(adapterTemplate)) {
    const adapter = readJsonRecord(adapterTemplate);
    if (adapter) {
      if (adapter.schemaVersion !== 1) {
        addError(`Project adapter template must use schemaVersion 1: ${adapterTemplate}`);
      }
      if (!isPlainRecord(adapter.validation)) {
        addError(`Project adapter template must define validation commands object: ${adapterTemplate}`);
      }
    }
  }

  const opencodeTemplate = path.join(root, "templates", "project", "opencode.json");
  if (fileExists(opencodeTemplate)) {
    const config = readJsonRecord(opencodeTemplate);
    if (config && config.$schema !== "https://opencode.ai/config.json") {
      addError(`Project opencode.json template must declare the OpenCode schema: ${opencodeTemplate}`);
    }
  }

  const readmePath = path.join(root, "README.md");
  if (fileExists(readmePath)) {
    const readme = readText(readmePath);
    for (const heading of ["What This Is", "Universal Development Loop", "Install", "Bootstrap A Project", "Token Economy", "Validate"]) {
      requireTextContains(readme, `## ${heading}`, "README opencode-dev-kit quickstart", readmePath);
    }
    requireTextContains(readme, "opencode-dev-kit", "README product framing", readmePath);
  }

  const scripts = readPackageScripts(root);
  for (const script of ["install:global", "init:project", "doctor", "project:inventory", "instruction:inventory", "code-quality:inventory", "autopilot:validate", "autopilot:evidence", "autopilot:check", "openspec:validate", "openspec:gate", "openspec:retro-gate", "openspec:retro-followups", "prepush:validate", "validate", "validate:strict", "test"]) {
    if (!scripts[script]) {
      addError(`package.json missing required opencode-dev-kit script '${script}'`);
    }
  }
  if (scripts["autopilot:validate"] && scripts["autopilot:validate"] !== "node tools/autopilot-ledger.ts") {
    addError("package.json script 'autopilot:validate' must run node tools/autopilot-ledger.ts.");
  }
  if (scripts["autopilot:evidence"] && scripts["autopilot:evidence"] !== "node tools/autopilot-evidence.ts") {
    addError("package.json script 'autopilot:evidence' must run node tools/autopilot-evidence.ts.");
  }
  if (scripts["autopilot:check"] && scripts["autopilot:check"] !== "node tools/autopilot-check.ts") {
    addError("package.json script 'autopilot:check' must run node tools/autopilot-check.ts.");
  }
  if (scripts["openspec:validate"] && scripts["openspec:validate"] !== "openspec validate --all") {
    addError("package.json script 'openspec:validate' must run openspec validate --all.");
  }
  if (scripts["openspec:gate"] && scripts["openspec:gate"] !== "node tools/openspec-operation-gate.ts") {
    addError("package.json script 'openspec:gate' must run node tools/openspec-operation-gate.ts.");
  }
  if (scripts["openspec:retro-gate"] && scripts["openspec:retro-gate"] !== "node tools/openspec-retro-gate.ts") {
    addError("package.json script 'openspec:retro-gate' must run node tools/openspec-retro-gate.ts.");
  }
  if (scripts["openspec:retro-followups"] && scripts["openspec:retro-followups"] !== "node tools/openspec-retro-followups.ts") {
    addError("package.json script 'openspec:retro-followups' must run node tools/openspec-retro-followups.ts.");
  }
  if (scripts["validate:strict"] && !scripts["validate:strict"].includes("--fail-on-warnings")) {
    addError("package.json script 'validate:strict' must pass --fail-on-warnings.");
  }
}

function readJsonRecord(file: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(file));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addError(`Invalid JSON: ${file}: ${message}`);
    return null;
  }
  if (!isPlainRecord(parsed)) {
    addError(`JSON file must contain an object: ${file}`);
    return null;
  }
  return parsed;
}

function validateStringArray(value: unknown, file: string, key: string): string[] {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    addError(`Profile field '${key}' must be an array of non-empty strings: ${file}`);
    return [];
  }
  return value;
}

function validateProfiles(root: string, skillNames: string[], agentNames: string[]): void {
  const profilesDir = path.join(root, "profiles");
  if (!directoryExists(profilesDir)) {
    return;
  }
  const profileFiles = listFiles(profilesDir, ".json");
  const profileNames = new Set(profileFiles.map((file) => path.basename(file, ".json")));
  const allowedKeys = new Set(["agents", "autopilotLive", "description", "extends", "name", "skills"]);
  const extendsMap = new Map<string, string>();
  const autopilotLiveMap = new Map<string, boolean | undefined>();
  const profileSkillsMap = new Map<string, string[] | undefined>();
  const skillSet = new Set(skillNames);
  const agentSet = new Set(agentNames);

  for (const file of profileFiles) {
    const name = path.basename(file, ".json");
    const profile = readJsonRecord(file);
    if (!profile) {
      continue;
    }
    for (const key of Object.keys(profile)) {
      if (!allowedKeys.has(key)) {
        addError(`Unsupported profile field '${key}': ${file}`);
      }
    }
    if (typeof profile.name !== "string" || profile.name !== name) {
      addError(`Profile name must match filename '${name}': ${file}`);
    }
    if (profile.description != null && typeof profile.description !== "string") {
      addError(`Profile description must be a string: ${file}`);
    }
    if (profile.autopilotLive != null && typeof profile.autopilotLive !== "boolean") {
      addError(`Profile autopilotLive must be a boolean: ${file}`);
    }
    autopilotLiveMap.set(name, typeof profile.autopilotLive === "boolean" ? profile.autopilotLive : undefined);
    if (profile.extends != null) {
      if (typeof profile.extends !== "string" || profile.extends.trim() === "") {
        addError(`Profile extends must be a non-empty string: ${file}`);
      } else if (!profileNames.has(profile.extends)) {
        addError(`Profile extends missing profile '${profile.extends}': ${file}`);
      } else {
        extendsMap.set(name, profile.extends);
      }
    }
    const skills = validateStringArray(profile.skills, file, "skills");
    profileSkillsMap.set(name, profile.skills == null ? undefined : skills);
    for (const skill of skills) {
      if (!skillSet.has(skill)) {
        addError(`Profile references missing skill '${skill}': ${file}`);
      }
    }
    for (const agent of validateStringArray(profile.agents, file, "agents")) {
      if (!agentSet.has(agent)) {
        addError(`Profile references missing agent '${agent}': ${file}`);
      }
    }
  }

  for (const profile of profileNames) {
    const seen = new Set<string>();
    let current: string | undefined = profile;
    while (current) {
      if (seen.has(current)) {
        addError(`Profile inheritance cycle: ${[...seen, current].join(" -> ")}`);
        break;
      }
      seen.add(current);
      current = extendsMap.get(current);
    }
  }

  const resolvedSkills = (name: string, seen = new Set<string>()): string[] => {
    if (seen.has(name)) {
      return [];
    }
    seen.add(name);
    const own = profileSkillsMap.get(name);
    if (own !== undefined) {
      return own;
    }
    const parent = extendsMap.get(name);
    return parent ? resolvedSkills(parent, seen) : [];
  };

  const resolvedAutopilotLive = (name: string, seen = new Set<string>()): boolean => {
    if (seen.has(name)) {
      return false;
    }
    seen.add(name);
    const own = autopilotLiveMap.get(name);
    if (own !== undefined) {
      return own;
    }
    const parent = extendsMap.get(name);
    return parent ? resolvedAutopilotLive(parent, seen) : false;
  };

  for (const profile of profileNames) {
    if (resolvedAutopilotLive(profile) && !resolvedSkills(profile).includes("openspec-autopilot")) {
      addError(`Profile with autopilotLive=true must include skill 'openspec-autopilot' after inheritance: ${path.join(profilesDir, `${profile}.json`)}`);
    }
  }
}

function stripJsonComments(text: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaping = false;
  for (let index = 0; index < text.length; index++) {
    const current = text[index];
    const next = text[index + 1];
    if (inString) {
      output += current;
      if (escaping) {
        escaping = false;
      } else if (current === "\\") {
        escaping = true;
      } else if (current === quote) {
        inString = false;
      }
      continue;
    }
    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      output += current;
      continue;
    }
    if (current === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") {
        index++;
      }
      output += "\n";
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        output += text[index] === "\n" ? "\n" : " ";
        index++;
      }
      index++;
      continue;
    }
    output += current;
  }
  return output;
}

function stripJsonTrailingCommas(text: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaping = false;
  for (let index = 0; index < text.length; index++) {
    const current = text[index];
    if (inString) {
      output += current;
      if (escaping) {
        escaping = false;
      } else if (current === "\\") {
        escaping = true;
      } else if (current === quote) {
        inString = false;
      }
      continue;
    }
    if (current === '"' || current === "'") {
      inString = true;
      quote = current;
      output += current;
      continue;
    }
    if (current === ",") {
      let lookahead = index + 1;
      while (lookahead < text.length && /\s/.test(text[lookahead])) {
        lookahead++;
      }
      if (text[lookahead] === "}" || text[lookahead] === "]") {
        continue;
      }
    }
    output += current;
  }
  return output;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function validateOpenCodePermissionRules(config: unknown, file: string): void {
  if (!isPlainRecord(config)) {
    return;
  }
  const permission = config.permission;
  if (permission === "allow") {
    addWarning(`OpenCode permission config uses top-level allow; this allows all tools by default: ${file}`);
    return;
  }
  if (!isPlainRecord(permission)) {
    return;
  }
  if (permission["*"] === "allow") {
    addWarning(`OpenCode permission config permission.* uses wildcard allow; all otherwise-unmatched tools are allowed: ${file}`);
  }
  for (const [permissionKey, value] of Object.entries(permission)) {
    if (!mutationCapablePermissionKeys.has(permissionKey)) {
      continue;
    }
    if (value === "allow") {
      addWarning(`OpenCode permission config permission.${permissionKey} uses tool-wide allow; unmatched operations are allowed: ${file}`);
      continue;
    }
    if (!isPlainRecord(value)) {
      continue;
    }
    const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
    const wildcardAllowIndex = entries.findIndex(([pattern, action]) => pattern === "*" && action === "allow");
    if (wildcardAllowIndex < 0) {
      continue;
    }
    const protectiveIndex = entries.findIndex(([pattern, action]) => pattern !== "*" && (action === "ask" || action === "deny"));
    if (protectiveIndex < 0) {
      addWarning(`OpenCode permission config permission.${permissionKey} uses wildcard allow; unmatched operations are allowed: ${file}`);
    } else if (wildcardAllowIndex > protectiveIndex) {
      addWarning(`OpenCode permission config permission.${permissionKey} places wildcard allow after narrower ask/deny rules; last matching permission rule can override protections: ${file}`);
    } else {
      addWarning(`OpenCode permission config permission.${permissionKey} uses wildcard allow with narrower ask/deny rules; unmatched operations are allowed: ${file}`);
    }
  }
}

function validateOpenCodeConfigFiles(root: string): void {
  for (const file of walkRepositoryFiles(root)) {
    if (path.basename(file) !== "opencode.json" && path.basename(file) !== "opencode.jsonc") {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonTrailingCommas(stripJsonComments(readText(file))));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addError(`Invalid OpenCode config JSON: ${file}: ${message}`);
      continue;
    }
    validateOpenCodePermissionRules(parsed, file);
  }
}

function jsonReplacementForAutomationMarkdown(relative: string): string | null {
  const openspecMatch = relative.match(/^(openspec\/changes\/[^/]+\/automation\/.+)\.md$/);
  if (openspecMatch) {
    return `${openspecMatch[1]}.json`;
  }
  const autopilotMatch = relative.match(/^(\.autopilot\/.+)\.md$/);
  if (autopilotMatch) {
    return `${autopilotMatch[1]}.json`;
  }
  return null;
}

function validateMarkdownFile(root: string, file: string, forbiddenAnchors: string[]): void {
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/);
  const text = lines.join("\n");
  const relative = toPosixPath(path.relative(root, file));
  const jsonReplacement = jsonReplacementForAutomationMarkdown(relative);
  if (jsonReplacement != null) {
    addError(`Autopilot/OpenSpec automation wrapper Markdown artifact is not allowed: ${relative}. Use ${jsonReplacement} with schemaVersion instead.`);
  }

  for (let index = 0; index < lines.length; index++) {
    if (/[ \t]+$/.test(lines[index])) {
      addError(`Trailing whitespace: ${file}:${index + 1}`);
    }
  }

  for (const anchor of forbiddenAnchors) {
    if (anchor.trim() !== "" && text.includes(anchor)) {
      addError(`Forbidden anchor '${anchor}' found in ${file}`);
    }
  }

  const isInstructionArtifact = /^\.opencode\/(skills|agents)\//.test(relative) ||
    /^instructions\//.test(relative) ||
    ["AGENTS.md", "README.md"].includes(relative);
  if (isInstructionArtifact) {
    for (const reference of legacyToolingReferences) {
      if (text.includes(reference)) {
        addError(`Legacy non-TypeScript tooling reference '${reference}' found in ${file}`);
      }
    }
  }

  const mentionsImplementation = /\b(implement|implementation|code changes?|behavior-changing|behavior changes?|fixes are allowed|edit workers?|write scope|make the smallest correct change)\b/i.test(text);
  const mentionsTdd = /\b(TDD|test-first|validation-first|tests? before|failing tests?[^.\n]{0,80}\bbefore\b|(?:tests?|benchmarks?|manual gates?|golden vectors?|fixtures?)[^.\n]{0,120}\bbefore\b|\bbefore\b[^.\n]{0,120}(?:tests?|benchmarks?|manual gates?|golden vectors?|fixtures?))\b/is.test(text);

  if (isInstructionArtifact && mentionsImplementation && !mentionsTdd) {
    addWarning(`Implementation-related artifact language lacks TDD/test-first language: ${file}`);
  }
  if (isInstructionArtifact && /after (a )?non-trivial user-visible work( cycle)?,? (the main session offers|offer|use the built-in `?question`?|before stopping)/i.test(text)) {
    addError(`Instruction artifact must not require routine post-task question handoff: ${file}`);
  }
  if (isInstructionArtifact && /(^#{2,4}\s+.*Self-Improvement\s*$|Self-improvement while context is hot|Core principle\s+[-\u2014]\s+do not remove)/im.test(text)) {
    addError(`Instruction artifact must not include automatic self-improvement/self-edit loops: ${file}`);
  }
  if (isInstructionArtifact && /\bshared URLs?\b/i.test(text)) {
    const hasSharedUrlApproval = /user-approved shared URLs?/i.test(text) ||
      /fetch remote\/shared URLs?.{0,160}(explicitly grants|explicit permission|user approved|user-approved|approved)/is.test(text);
    const hasSharedUrlProhibition = /(never|do not|must not|out of scope|exclude|excluded|not in scope).{0,120}shared URLs?/is.test(text) ||
      /shared URLs?.{0,120}(out of scope|excluded|not in scope|must not|never)/is.test(text);
    if (!hasSharedUrlApproval && !hasSharedUrlProhibition) {
      addError(`Instruction artifact mentioning shared URLs must require user-approved remote/shared URL access: ${file}`);
    }
  }

  const isSkillArtifact = /^\.opencode\/skills\/[^/]+\/SKILL\.md$/.test(relative);
  const isSessionRetroArtifact = isSkillArtifact && (
    /^\.opencode\/skills\/[^/]*(session|retro)[^/]*\/SKILL\.md$/.test(relative) ||
    /\b(OpenCode sessions?|session (archive|history|retros?|artifacts?|transcripts?))\b/i.test(text)
  );
  if (isSessionRetroArtifact && /\bledger\b/i.test(text)) {
    const hasRedactedLedger = /redacted.{0,80}ledger|ledger.{0,80}redacted/i.test(text);
    const hasLedgerWriteApproval = /(write generated ledgers|write a generated ledger file|generated ledger|ledger file).{0,200}(explicitly grants|explicit permission|user approved|user-approved|approved|approval)/is.test(text) ||
      /(explicitly grants|explicit permission|user approved|user-approved|approved|approval).{0,200}(write generated ledgers|write a generated ledger file|generated ledger|ledger file)/is.test(text);
    const hasLedgerProhibition = /(never|do not|must not|out of scope|exclude|excluded|not in scope).{0,120}ledger/is.test(text) ||
      /ledger.{0,120}(out of scope|excluded|not in scope|must not|never)/is.test(text);
    if (!hasLedgerProhibition && (!hasRedactedLedger || !hasLedgerWriteApproval)) {
      addError(`Session retro artifact with a session ledger must require redaction and user-approved generated ledger writes: ${file}`);
    }
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const root = options.root;
  const skillNames = validateSkills(root);
  const agentNames = validateAgents(root);
  const instructionNames = getInstructionNames(root);
  validateTypeScriptOnlySourceFiles(root);
  validatePackageScripts(root);
  validateDevKitContract(root);
  validateProfiles(root, skillNames, agentNames);
  validateOpenCodeConfigFiles(root);
  validateReadme(root, skillNames, agentNames, instructionNames);
  validateAgentsMd(root);

  const markdownFiles = getMarkdownFiles(root);
  for (const file of markdownFiles) {
    validateMarkdownFile(root, file, options.forbiddenAnchors);
  }

  for (const warning of warnings) {
    console.log(`WARN: ${warning}`);
  }

  if (options.failOnWarnings && warnings.length > 0) {
    addError(`Warnings are not allowed in strict validation mode: ${warnings.length} warning(s).`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.log(`ERROR: ${error}`);
    }
    process.exit(1);
  }

  console.log(`OK: skills=${skillNames.length} agents=${agentNames.length} markdown=${markdownFiles.length} warnings=${warnings.length}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
