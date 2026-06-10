#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Options = {
  agentsMdSource: string | null;
  configDir: string | null;
  dryRun: boolean;
  noPrune: boolean;
  noBackup: boolean;
  profile: string;
  skipAgentsMd: boolean;
};

type InstallProfile = {
  agents?: string[];
  extends?: string;
  name?: string;
  skills?: string[];
};

type InstallContext = {
  backupRoot: string;
  configDir: string;
  dryRun: boolean;
  noBackup: boolean;
  runStamp: string;
};

type RelativeEntry =
  | { relative: string; type: "file" }
  | { relative: string; target: string; type: "symlink" };

const BEGIN_MARKER = "<!-- agents-and-skills:begin -->";
const END_MARKER = "<!-- agents-and-skills:end -->";

function printUsage(): void {
  console.log(`Usage:
  npm run install:global -- [options]

Options:
  --config-dir <path>         OpenCode config directory. Default: ~/.config/opencode
  --agents-md-source <path>   Source file to install into global AGENTS.md block.
                              Default: instructions/global-opencode-agent-instructions.md
  --profile <name>            Restrict install to profiles/<name>.json. Default: all repo skills/agents.
  --skip-agents-md           Install only skills and agents.
  --no-prune                 Keep destination skills/agents not present in this repository.
  --no-backup                Replace changed or pruned artifacts without backup copies.
  --dry-run, --what-if       Preview changes without writing files.
  --help                     Show this help.
`);
}

function readOptionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.trim() === "" || value.startsWith("-")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function readInlineOptionValue(value: string, name: string): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    agentsMdSource: null,
    configDir: null,
    dryRun: false,
    noPrune: false,
    noBackup: false,
    profile: "all",
    skipAgentsMd: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--config-dir" || arg === "-ConfigDir") {
      options.configDir = readOptionValue(args, i, arg);
      i++;
    } else if (arg.startsWith("--config-dir=")) {
      options.configDir = readInlineOptionValue(arg.slice("--config-dir=".length), "--config-dir");
    } else if (arg === "--agents-md-source" || arg === "-AgentsMdSource") {
      options.agentsMdSource = readOptionValue(args, i, arg);
      i++;
    } else if (arg.startsWith("--agents-md-source=")) {
      options.agentsMdSource = readInlineOptionValue(arg.slice("--agents-md-source=".length), "--agents-md-source");
    } else if (arg === "--profile") {
      options.profile = readOptionValue(args, i, arg);
      i++;
    } else if (arg.startsWith("--profile=")) {
      options.profile = readInlineOptionValue(arg.slice("--profile=".length), "--profile");
    } else if (arg === "--skip-agents-md" || arg === "-SkipAgentsMd") {
      options.skipAgentsMd = true;
    } else if (arg === "--no-prune" || arg === "-NoPrune") {
      options.noPrune = true;
    } else if (arg === "--no-backup" || arg === "-NoBackup") {
      options.noBackup = true;
    } else if (arg === "--dry-run" || arg === "--what-if" || arg === "-WhatIf") {
      options.dryRun = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function requireHome(): string {
  const home = os.homedir();
  if (!home) {
    throw new Error("Home directory is not available; pass --config-dir explicitly.");
  }
  return home;
}

function expandHome(input: string | null): string | null {
  if (!input) {
    return input;
  }
  if (input === "~") {
    return requireHome();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(requireHome(), input.slice(2));
  }
  return input;
}

function resolveConfigDir(input: string | null): string {
  if (input != null && input.trim() === "") {
    throw new Error("Missing value for --config-dir.");
  }
  const configured = input == null ? path.join(requireHome(), ".config", "opencode") : input;
  const expanded = expandHome(configured);
  if (expanded == null) {
    throw new Error("Missing value for --config-dir.");
  }
  return path.resolve(expanded);
}

function resolveSourcePath(input: string | null, repoRoot: string, defaultRelativePath: string): string {
  if (input != null && input.trim() === "") {
    throw new Error("Missing value for --agents-md-source.");
  }
  const configured = input == null ? defaultRelativePath : input;
  const expanded = expandHome(configured);
  if (expanded == null) {
    throw new Error("Missing value for --agents-md-source.");
  }
  if (path.isAbsolute(expanded)) {
    return path.resolve(expanded);
  }
  return path.resolve(repoRoot, expanded);
}

function assertDirectoryExists(target: string, label: string): void {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`Missing ${label} directory: ${target}`);
  }
}

function assertFileExists(target: string, label: string): void {
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error(`Missing ${label} file: ${target}`);
  }
}

function pathExists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isDirectoryFollowingSymlink(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function ensureDirectory(target: string, context: InstallContext): void {
  if (pathExists(target)) {
    if (!isDirectoryFollowingSymlink(target)) {
      const backup = createBackup(target, context);
      const backupLabel = context.dryRun ? "would backup" : "backup";
      const backupMessage = backup ? ` (${backupLabel}: ${backup})` : "";
      if (context.dryRun) {
        console.log(`would replace non-directory with directory: ${target}${backupMessage}`);
        return;
      }
      removePath(target);
      fs.mkdirSync(target, { recursive: true });
      console.log(`replaced non-directory with directory: ${target}${backupMessage}`);
    }
    return;
  }
  if (context.dryRun) {
    console.log(`would create directory: ${target}`);
    return;
  }
  fs.mkdirSync(target, { recursive: true });
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

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON file ${file}: ${message}`);
  }
}

function asStringArray(value: unknown, label: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

function loadProfile(repoRoot: string, name: string, seen = new Set<string>()): Required<Pick<InstallProfile, "agents" | "skills">> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(`Invalid profile name: ${name}`);
  }
  if (seen.has(name)) {
    throw new Error(`Profile inheritance cycle: ${[...seen, name].join(" -> ")}`);
  }
  seen.add(name);
  const profilePath = path.join(repoRoot, "profiles", `${name}.json`);
  if (!fs.existsSync(profilePath) || !fs.statSync(profilePath).isFile()) {
    throw new Error(`Missing install profile: ${profilePath}`);
  }
  const raw = readJsonFile(profilePath);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Install profile must be a JSON object: ${profilePath}`);
  }
  const profile = raw as InstallProfile;
  const base = typeof profile.extends === "string" ? loadProfile(repoRoot, profile.extends, seen) : { agents: [], skills: [] };
  return {
    agents: asStringArray(profile.agents, `${profilePath}: agents`) ?? base.agents,
    skills: asStringArray(profile.skills, `${profilePath}: skills`) ?? base.skills,
  };
}

function filterByProfile<T>(items: T[], getName: (item: T) => string, allowed: string[], label: string): T[] {
  const allowedSet = new Set(allowed);
  const filtered = items.filter((item) => allowedSet.has(getName(item)));
  const available = new Set(items.map(getName));
  for (const name of allowedSet) {
    if (!available.has(name)) {
      throw new Error(`Install profile references missing ${label}: ${name}`);
    }
  }
  return filtered;
}

function toPosixRelative(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function resolvePathThroughExistingAncestor(target: string): string {
  const absolute = path.resolve(target);
  let current = absolute;
  const suffix: string[] = [];

  while (!pathExists(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    suffix.unshift(path.basename(current));
    current = parent;
  }

  let resolvedAncestor = current;
  try {
    resolvedAncestor = fs.realpathSync.native(current);
  } catch (_error) {
    resolvedAncestor = current;
  }

  return path.resolve(resolvedAncestor, ...suffix);
}

function normalizePathForContainment(target: string): string {
  const resolved = resolvePathThroughExistingAncestor(target);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInsideOrEqual(candidate: string, parent: string): boolean {
  const relative = path.relative(normalizePathForContainment(parent), normalizePathForContainment(candidate));
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertNoSourceOverlap(target: string, source: string, label: string): void {
  if (isPathInsideOrEqual(target, source) || isPathInsideOrEqual(source, target)) {
    throw new Error(`${label} must not overlap source artifact directory: ${target} conflicts with ${source}`);
  }
}

function isSamePath(left: string, right: string): boolean {
  return normalizePathForContainment(left) === normalizePathForContainment(right);
}

function assertAgentsMdSourceSafe(source: string, destinationAgentsMd: string, destinationSkillsDir: string, destinationAgentsDir: string): void {
  if (isSamePath(source, destinationAgentsMd)) {
    throw new Error(`AGENTS.md source must not be the destination AGENTS.md: ${source}`);
  }
  if (isPathInsideOrEqual(source, destinationSkillsDir) || isPathInsideOrEqual(source, destinationAgentsDir)) {
    throw new Error(`AGENTS.md source must not be inside destination skills or agents loader directories: ${source}`);
  }
}

function listRelativeEntries(root: string, current = root, result: RelativeEntry[] = []): RelativeEntry[] {
  const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      listRelativeEntries(root, entryPath, result);
    } else if (entry.isFile()) {
      result.push({ relative: toPosixRelative(path.relative(root, entryPath)), type: "file" });
    } else if (entry.isSymbolicLink()) {
      result.push({ relative: toPosixRelative(path.relative(root, entryPath)), target: fs.readlinkSync(entryPath), type: "symlink" });
    } else {
      throw new Error(`Unsupported filesystem entry: ${entryPath}`);
    }
  }
  return result;
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isSameFile(source: string, destination: string): boolean {
  if (!fs.existsSync(destination) || !fs.statSync(destination).isFile()) {
    return false;
  }
  const sourceStat = fs.statSync(source);
  const destinationStat = fs.statSync(destination);
  return sourceStat.size === destinationStat.size && sha256(source) === sha256(destination);
}

function isSameDirectory(source: string, destination: string): boolean {
  if (!fs.existsSync(destination) || !fs.statSync(destination).isDirectory()) {
    return false;
  }
  const sourceEntries = listRelativeEntries(source);
  const destinationEntries = listRelativeEntries(destination);
  if (sourceEntries.length !== destinationEntries.length) {
    return false;
  }
  for (let i = 0; i < sourceEntries.length; i++) {
    const sourceEntry = sourceEntries[i];
    const destinationEntry = destinationEntries[i];
    if (sourceEntry.relative !== destinationEntry.relative || sourceEntry.type !== destinationEntry.type) {
      return false;
    }
    if (sourceEntry.type === "file" && !isSameFile(path.join(source, sourceEntry.relative), path.join(destination, destinationEntry.relative))) {
      return false;
    }
    if (sourceEntry.type === "symlink" && destinationEntry.type === "symlink" && sourceEntry.target !== destinationEntry.target) {
      return false;
    }
  }
  return true;
}

function copyPath(source: string, destination: string): void {
  const stat = fs.lstatSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      copyPath(path.join(source, entry.name), path.join(destination, entry.name));
    }
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  } else if (stat.isSymbolicLink()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(fs.readlinkSync(source), destination);
  } else {
    throw new Error(`Unsupported filesystem entry: ${source}`);
  }
}

function removePath(target: string): void {
  fs.rmSync(target, { force: true, recursive: true });
}

function relativeUnderConfig(target: string, configDir: string): string | null {
  const relative = path.relative(configDir, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return toPosixRelative(relative);
}

function backupPathFor(target: string, context: InstallContext): string {
  const relative = relativeUnderConfig(path.resolve(target), context.configDir) || path.basename(target);
  const parts = relative.split("/").filter(Boolean);
  let candidate = path.join(context.backupRoot, context.runStamp, ...parts);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = `${path.join(context.backupRoot, context.runStamp, ...parts)}.${suffix}`;
    suffix++;
  }
  return candidate;
}

function createBackup(target: string, context: InstallContext): string | null {
  if (context.noBackup || !pathExists(target)) {
    return null;
  }
  const destination = backupPathFor(target, context);
  ensureDirectory(path.dirname(destination), context);
  if (!context.dryRun) {
    copyPath(target, destination);
  }
  return destination;
}

function installFile(source: string, destination: string, label: string, context: InstallContext): void {
  if (isSameFile(source, destination)) {
    console.log(`unchanged: ${label}`);
    return;
  }
  ensureDirectory(path.dirname(destination), context);
  const backup = createBackup(destination, context);
  if (context.dryRun) {
    const backupMessage = backup ? ` (would backup: ${backup})` : "";
    console.log(`would install: ${label} -> ${destination}${backupMessage}`);
    return;
  }
  if (pathExists(destination)) {
    removePath(destination);
  }
  fs.copyFileSync(source, destination);
  console.log(backup ? `installed: ${label} (backup: ${backup})` : `installed: ${label}`);
}

function installDirectory(source: string, destination: string, label: string, context: InstallContext): void {
  if (isSameDirectory(source, destination)) {
    console.log(`unchanged: ${label}`);
    return;
  }
  ensureDirectory(path.dirname(destination), context);
  const backup = createBackup(destination, context);
  if (context.dryRun) {
    const backupMessage = backup ? ` (would backup: ${backup})` : "";
    console.log(`would install: ${label} -> ${destination}${backupMessage}`);
    return;
  }
  removePath(destination);
  copyPath(source, destination);
  console.log(backup ? `installed: ${label} (backup: ${backup})` : `installed: ${label}`);
}

function prunePath(target: string, label: string, context: InstallContext): void {
  const backup = createBackup(target, context);
  if (context.dryRun) {
    const backupMessage = backup ? ` (would backup: ${backup})` : "";
    console.log(`would prune: ${label} -> ${target}${backupMessage}`);
    return;
  }
  removePath(target);
  console.log(backup ? `pruned: ${label} (backup: ${backup})` : `pruned: ${label}`);
}

function pruneStaleDirectories(destinationRoot: string, desiredNames: Set<string>, labelPrefix: string, context: InstallContext): void {
  if (!pathExists(destinationRoot)) {
    return;
  }
  if (!isDirectoryFollowingSymlink(destinationRoot)) {
    throw new Error(`Destination ${labelPrefix} root exists but is not a directory: ${destinationRoot}`);
  }
  for (const dir of listDirectories(destinationRoot)) {
    const name = path.basename(dir);
    if (!desiredNames.has(name)) {
      prunePath(dir, `stale ${labelPrefix} ${name}`, context);
    }
  }
}

function pruneStaleFiles(destinationRoot: string, desiredNames: Set<string>, extension: string, labelPrefix: string, context: InstallContext): void {
  if (!pathExists(destinationRoot)) {
    return;
  }
  if (!isDirectoryFollowingSymlink(destinationRoot)) {
    throw new Error(`Destination ${labelPrefix} root exists but is not a directory: ${destinationRoot}`);
  }
  for (const file of listFiles(destinationRoot, extension)) {
    const basename = path.basename(file);
    if (!desiredNames.has(basename)) {
      prunePath(file, `stale ${labelPrefix} ${path.basename(file, extension)}`, context);
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    count++;
    index += needle.length;
  }
  return count;
}

function validateAgentsMdMarkers(existing: string, destination: string): void {
  const pattern = new RegExp(`${escapeRegExp(BEGIN_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}\\r?\\n?`);
  const beginCount = countOccurrences(existing, BEGIN_MARKER);
  const endCount = countOccurrences(existing, END_MARKER);
  if (beginCount !== endCount) {
    throw new Error(`Malformed AGENTS.md managed block markers in ${destination}: begin=${beginCount} end=${endCount}`);
  }
  if (beginCount > 1) {
    throw new Error(`Multiple AGENTS.md managed blocks found in ${destination}; keep exactly one managed block before reinstalling.`);
  }
  if (beginCount === 1 && !pattern.test(existing)) {
    throw new Error(`Malformed AGENTS.md managed block markers in ${destination}: begin marker must precede end marker.`);
  }
}

function detectNewline(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function agentsMdBlock(source: string, newline: string): string {
  const sourceText = fs.readFileSync(source, "utf8").trimEnd().replace(/\r\n?/g, "\n").replace(/\n/g, newline);
  return `${BEGIN_MARKER}${newline}${sourceText}${newline}${END_MARKER}${newline}`;
}

function readExistingAgentsMd(destination: string): string {
  if (!pathExists(destination)) {
    return "";
  }
  try {
    if (!fs.statSync(destination).isFile()) {
      return "";
    }
    return fs.readFileSync(destination, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function installAgentsMd(source: string, destination: string, context: InstallContext): void {
  const existing = readExistingAgentsMd(destination);
  validateAgentsMdMarkers(existing, destination);
  const newline = existing ? detectNewline(existing) : "\n";
  const block = agentsMdBlock(source, newline);
  const pattern = new RegExp(`${escapeRegExp(BEGIN_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}\\r?\\n?`);

  let next: string;
  if (pattern.test(existing)) {
    next = existing.replace(pattern, block);
  } else if (existing.trim() === "") {
    next = block;
  } else {
    const separator = existing.endsWith(`${newline}${newline}`) ? "" : existing.endsWith(newline) ? newline : `${newline}${newline}`;
    next = `${existing}${separator}${block}`;
  }

  if (existing === next) {
    console.log("unchanged: AGENTS.md block");
    return;
  }
  ensureDirectory(path.dirname(destination), context);
  const backup = createBackup(destination, context);
  if (context.dryRun) {
    const backupMessage = backup ? ` (would backup: ${backup})` : "";
    console.log(`would install: AGENTS.md block -> ${destination}${backupMessage}`);
    return;
  }
  if (pathExists(destination)) {
    removePath(destination);
  }
  fs.writeFileSync(destination, next, "utf8");
  console.log(backup ? `installed: AGENTS.md block (backup: ${backup})` : "installed: AGENTS.md block");
}

function run(): void {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const sourceSkillsDir = path.join(repoRoot, ".opencode", "skills");
  const sourceAgentsDir = path.join(repoRoot, ".opencode", "agents");
  const sourceAgentsMd = options.skipAgentsMd
    ? null
    : resolveSourcePath(options.agentsMdSource, repoRoot, path.join("instructions", "global-opencode-agent-instructions.md"));
  const configDir = resolveConfigDir(options.configDir);
  const context: InstallContext = {
    backupRoot: path.join(configDir, ".backups", "agents-and-skills"),
    configDir,
    dryRun: options.dryRun,
    noBackup: options.noBackup,
    runStamp: new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"),
  };

  assertDirectoryExists(sourceSkillsDir, "source skills");
  assertDirectoryExists(sourceAgentsDir, "source agents");
  if (fs.existsSync(configDir) && !fs.statSync(configDir).isDirectory()) {
    throw new Error(`OpenCode config path exists but is not a directory: ${configDir}`);
  }
  if (sourceAgentsMd) {
    assertFileExists(sourceAgentsMd, "source AGENTS.md");
  }

  const allSkillDirs = listDirectories(sourceSkillsDir);
  const allAgentFiles = listFiles(sourceAgentsDir, ".md");
  const profile = options.profile === "all" ? null : loadProfile(repoRoot, options.profile);
  const skillDirs = profile == null ? allSkillDirs : filterByProfile(allSkillDirs, (dir) => path.basename(dir), profile.skills, "skill");
  const agentFiles = profile == null ? allAgentFiles : filterByProfile(allAgentFiles, (file) => path.basename(file, ".md"), profile.agents, "agent");
  const destinationSkillsDir = path.join(configDir, "skills");
  const destinationAgentsDir = path.join(configDir, "agents");
  const destinationAgentsMd = path.join(configDir, "AGENTS.md");

  assertNoSourceOverlap(configDir, sourceSkillsDir, "--config-dir");
  assertNoSourceOverlap(configDir, sourceAgentsDir, "--config-dir");
  assertNoSourceOverlap(destinationSkillsDir, sourceSkillsDir, "destination skills directory");
  assertNoSourceOverlap(destinationAgentsDir, sourceAgentsDir, "destination agents directory");
  if (sourceAgentsMd) {
    assertAgentsMdSourceSafe(sourceAgentsMd, destinationAgentsMd, destinationSkillsDir, destinationAgentsDir);
    validateAgentsMdMarkers(readExistingAgentsMd(destinationAgentsMd), destinationAgentsMd);
  }

  console.log(`OpenCode global config: ${configDir}`);
  console.log(`Install profile: ${options.profile}`);
  console.log(sourceAgentsMd ? `AGENTS.md source: ${sourceAgentsMd}` : "AGENTS.md source: skipped");
  console.log(`Installing skills: ${skillDirs.length}`);
  for (const skillDir of skillDirs) {
    installDirectory(skillDir, path.join(destinationSkillsDir, path.basename(skillDir)), `skill ${path.basename(skillDir)}`, context);
  }
  if (options.noPrune) {
    console.log("skipped: stale skill pruning");
  } else {
    pruneStaleDirectories(destinationSkillsDir, new Set(skillDirs.map((dir) => path.basename(dir))), "skill", context);
  }

  console.log(`Installing agents: ${agentFiles.length}`);
  for (const agentFile of agentFiles) {
    installFile(agentFile, path.join(destinationAgentsDir, path.basename(agentFile)), `agent ${path.basename(agentFile, ".md")}`, context);
  }
  if (options.noPrune) {
    console.log("skipped: stale agent pruning");
  } else {
    pruneStaleFiles(destinationAgentsDir, new Set(agentFiles.map((file) => path.basename(file))), ".md", "agent", context);
  }

  if (options.skipAgentsMd || sourceAgentsMd == null) {
    console.log("skipped: AGENTS.md block");
  } else {
    installAgentsMd(sourceAgentsMd, destinationAgentsMd, context);
  }

  if (options.dryRun) {
    console.log("Dry run complete. No files were changed.");
  } else {
    console.log("Done. Restart OpenCode for newly installed global artifacts to be loaded.");
  }
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
