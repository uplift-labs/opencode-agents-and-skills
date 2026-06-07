#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BEGIN_MARKER = "<!-- agents-and-skills:begin -->";
const END_MARKER = "<!-- agents-and-skills:end -->";

function printUsage() {
  console.log(`Usage:
  node tools/install-opencode-global.js [options]

Options:
  --config-dir <path>         OpenCode config directory. Default: ~/.config/opencode
  --agents-md-source <path>   Source file to install into global AGENTS.md block.
                              Default: instructions/global-opencode-agent-instructions.md
  --skip-agents-md           Install only skills and agents.
  --no-backup                Replace changed artifacts without backup copies.
  --dry-run, --what-if       Preview changes without writing files.
  --help                     Show this help.
`);
}

function readOptionValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.trim() === "" || value.startsWith("-")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function readInlineOptionValue(value, name) {
  if (!value || value.trim() === "") {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function parseArgs(args) {
  const options = {
    agentsMdSource: null,
    configDir: null,
    dryRun: false,
    noBackup: false,
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
    } else if (arg === "--skip-agents-md" || arg === "-SkipAgentsMd") {
      options.skipAgentsMd = true;
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

function requireHome() {
  const home = os.homedir();
  if (!home) {
    throw new Error("Home directory is not available; pass --config-dir explicitly.");
  }
  return home;
}

function expandHome(input) {
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

function resolveConfigDir(input) {
  if (input != null && input.trim() === "") {
    throw new Error("Missing value for --config-dir.");
  }
  const configured = input == null ? path.join(requireHome(), ".config", "opencode") : input;
  return path.resolve(expandHome(configured));
}

function resolveSourcePath(input, repoRoot, defaultRelativePath) {
  if (input != null && input.trim() === "") {
    throw new Error("Missing value for --agents-md-source.");
  }
  const configured = input == null ? defaultRelativePath : input;
  const expanded = expandHome(configured);
  if (path.isAbsolute(expanded)) {
    return path.resolve(expanded);
  }
  return path.resolve(repoRoot, expanded);
}

function assertDirectoryExists(target, label) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`Missing ${label} directory: ${target}`);
  }
}

function assertFileExists(target, label) {
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error(`Missing ${label} file: ${target}`);
  }
}

function pathExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isDirectoryFollowingSymlink(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function ensureDirectory(target, context) {
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

function listDirectories(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function listFiles(root, extension) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function toPosixRelative(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function normalizePathForContainment(target) {
  let resolved = path.resolve(target);
  try {
    resolved = fs.realpathSync.native(resolved);
  } catch (_error) {
    // The destination may not exist yet. Resolved absolute paths still catch unsafe self-installs.
  }
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInsideOrEqual(candidate, parent) {
  const relative = path.relative(normalizePathForContainment(parent), normalizePathForContainment(candidate));
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertNoSourceOverlap(target, source, label) {
  if (isPathInsideOrEqual(target, source) || isPathInsideOrEqual(source, target)) {
    throw new Error(`${label} must not overlap source artifact directory: ${target} conflicts with ${source}`);
  }
}

function listRelativeEntries(root, current = root, result = []) {
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

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isSameFile(source, destination) {
  if (!fs.existsSync(destination) || !fs.statSync(destination).isFile()) {
    return false;
  }
  const sourceStat = fs.statSync(source);
  const destinationStat = fs.statSync(destination);
  return sourceStat.size === destinationStat.size && sha256(source) === sha256(destination);
}

function isSameDirectory(source, destination) {
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
    if (sourceEntry.type === "symlink" && sourceEntry.target !== destinationEntry.target) {
      return false;
    }
  }
  return true;
}

function copyPath(source, destination) {
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

function removePath(target) {
  fs.rmSync(target, { force: true, recursive: true });
}

function relativeUnderConfig(target, configDir) {
  const relative = path.relative(configDir, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return toPosixRelative(relative);
}

function backupPathFor(target, context) {
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

function createBackup(target, context) {
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

function installFile(source, destination, label, context) {
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

function installDirectory(source, destination, label, context) {
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(text, needle) {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    count++;
    index += needle.length;
  }
  return count;
}

function validateAgentsMdMarkers(existing, destination) {
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

function detectNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function agentsMdBlock(source, newline) {
  const sourceText = fs.readFileSync(source, "utf8").trimEnd().replace(/\r\n?/g, "\n").replace(/\n/g, newline);
  return `${BEGIN_MARKER}${newline}${sourceText}${newline}${END_MARKER}${newline}`;
}

function readExistingAgentsMd(destination) {
  if (!pathExists(destination)) {
    return "";
  }
  try {
    if (!fs.statSync(destination).isFile()) {
      return "";
    }
    return fs.readFileSync(destination, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function installAgentsMd(source, destination, context) {
  const existing = readExistingAgentsMd(destination);
  validateAgentsMdMarkers(existing, destination);
  const newline = existing ? detectNewline(existing) : "\n";
  const block = agentsMdBlock(source, newline);
  const pattern = new RegExp(`${escapeRegExp(BEGIN_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}\\r?\\n?`);

  let next;
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

function run() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const sourceSkillsDir = path.join(repoRoot, ".opencode", "skills");
  const sourceAgentsDir = path.join(repoRoot, ".opencode", "agents");
  const sourceAgentsMd = options.skipAgentsMd
    ? null
    : resolveSourcePath(options.agentsMdSource, repoRoot, path.join("instructions", "global-opencode-agent-instructions.md"));
  const configDir = resolveConfigDir(options.configDir);
  const context = {
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

  const skillDirs = listDirectories(sourceSkillsDir);
  const agentFiles = listFiles(sourceAgentsDir, ".md");
  const destinationSkillsDir = path.join(configDir, "skills");
  const destinationAgentsDir = path.join(configDir, "agents");
  const destinationAgentsMd = path.join(configDir, "AGENTS.md");

  assertNoSourceOverlap(configDir, sourceSkillsDir, "--config-dir");
  assertNoSourceOverlap(configDir, sourceAgentsDir, "--config-dir");
  assertNoSourceOverlap(destinationSkillsDir, sourceSkillsDir, "destination skills directory");
  assertNoSourceOverlap(destinationAgentsDir, sourceAgentsDir, "destination agents directory");
  if (sourceAgentsMd) {
    validateAgentsMdMarkers(readExistingAgentsMd(destinationAgentsMd), destinationAgentsMd);
  }

  console.log(`OpenCode global config: ${configDir}`);
  console.log(sourceAgentsMd ? `AGENTS.md source: ${sourceAgentsMd}` : "AGENTS.md source: skipped");
  console.log(`Installing skills: ${skillDirs.length}`);
  for (const skillDir of skillDirs) {
    installDirectory(skillDir, path.join(destinationSkillsDir, path.basename(skillDir)), `skill ${path.basename(skillDir)}`, context);
  }

  console.log(`Installing agents: ${agentFiles.length}`);
  for (const agentFile of agentFiles) {
    installFile(agentFile, path.join(destinationAgentsDir, path.basename(agentFile)), `agent ${path.basename(agentFile, ".md")}`, context);
  }

  if (options.skipAgentsMd) {
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
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
