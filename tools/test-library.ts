#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

type ProcessResult = {
  exitCode: number;
  output: string;
};

type TestCase = {
  name: string;
  run: () => void;
};

const root = parseRoot(process.argv.slice(2));
const validator = path.join(root, "tools", "validate-library.ts");
const installer = path.join(root, "tools", "install-opencode-global.ts");
const retroInventory = path.join(root, "tools", "opencode-session-retro-inventory.ts");
const retroAnalyze = path.join(root, "tools", "opencode-session-retro-analyze.ts");

function defaultRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function parseRoot(args: string[]): string {
  let configuredRoot = defaultRoot();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--root" || arg === "--Root" || arg === "-Root") {
      const value = args[i + 1];
      if (!value || value.trim() === "" || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}.`);
      }
      configuredRoot = value;
      i++;
    } else if (arg.startsWith("--root=")) {
      configuredRoot = arg.slice("--root=".length);
    } else if (arg.startsWith("--Root=")) {
      configuredRoot = arg.slice("--Root=".length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return path.resolve(configuredRoot);
}

function newTempDir(name: string): string {
  const parent = path.join(os.tmpdir(), "agents-and-skills-tests");
  fs.mkdirSync(parent, { recursive: true });
  const dir = path.join(parent, `${name}-${crypto.randomUUID().replace(/-/g, "")}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.replace(/\n/g, os.EOL), "utf8");
}

function lines(values: string[]): string {
  return values.join("\n");
}

function newLibraryFixture(name: string): string {
  const dir = newTempDir(name);
  writeText(path.join(dir, ".gitignore"), lines([".serena/", ""]));
  writeText(path.join(dir, ".opencode", "skills", "demo-skill", "SKILL.md"), lines([
    "---",
    "name: demo-skill",
    "description: Use when testing a demo reusable skill.",
    "license: MIT",
    "---",
    "",
    "# Demo Skill",
    "",
  ]));
  writeText(path.join(dir, ".opencode", "agents", "demo-reviewer.md"), lines([
    "---",
    "description: Reviews demo fixture behavior.",
    "mode: subagent",
    "permission:",
    "  read: allow",
    "  glob: allow",
    "  grep: allow",
    "  list: allow",
    "  bash: deny",
    "  edit: deny",
    "  task: deny",
    "  question: deny",
    "  skill: deny",
    "  webfetch: deny",
    "  websearch: deny",
    "  todowrite: deny",
    "  external_directory: deny",
    "  lsp: deny",
    "  doom_loop: deny",
    "---",
    "",
    "You are a read-only demo reviewer.",
    "",
  ]));
  writeText(path.join(dir, "instructions", "example.md"), lines(["# Example", ""]));
  writeText(path.join(dir, "AGENTS.md"), lines([
    "# Repository Instructions",
    "",
    "## TypeScript Development",
    "",
    "- Use TypeScript for all repository automation and implementation code.",
    "- Do not add PowerShell, Python, or JavaScript source files; rewrite any such code to TypeScript instead.",
    "- For behavior changes, add the smallest useful TDD/test-first gate before code changes.",
    "- Run repository tooling through npm scripts or `node` against `.ts` entrypoints.",
    "",
    "## Deterministic Helper Automation",
    "",
    "- For repetitive, evidence-heavy, or token-heavy work, first consider whether a small deterministic helper could gather, count, validate, redact, diff, inventory, or enforce explicit rules more efficiently than manual inspection.",
    "- When writing helper code for agent workflow, use explicit inputs, explicit outputs, schemas or fixtures, stable ordering, privacy-safe output, and no hidden heuristics.",
    "- Do not encode fuzzy scoring, probabilistic classification, model-like summarization, or unstated inference in helper code.",
    "- If deterministic helper code cannot answer from inputs, report unknown, unreadable, unsupported, or blocked instead.",
    "",
    "## Completion Handoff",
    "",
    "- Ask the user only for real blockers, remote/destructive actions, scope or risk decisions, credentials, and MR/PR outcomes.",
    "- When asking, offer 2-4 self-contained next actions via `question` when available.",
    "- Put the recommended option first and end its label with `(Recommended)`.",
    "- In read-only, no-question, or subagent contexts, return `Suggested Next Options` or `Actionable Continuation Items` instead of asking the user directly.",
    "",
    "## Autonomous Work Contract",
    "",
    "- The main session owns skill selection, decomposition, validation, reviewer gates, and ready-to-land handoff.",
    "",
  ]));
  writeText(path.join(dir, "README.md"), lines([
    "# Fixture",
    "",
    "## Routing Map",
    "",
    "- Default broad work -> `adaptive-delivery`.",
    "- Instruction artifacts -> `instruction-artifact-tuning`; broad audits -> `instruction-artifact-audit-runbook.md`.",
    "",
    "## Reviewer Gate Map",
    "",
    "- Instruction artifacts -> `instruction-artifact-reviewer`.",
    "",
    "## Skill Catalog",
    "",
    "- `demo-skill`: Demo skill.",
    "",
    "## Agent Catalog",
    "",
    "- `demo-reviewer`: Demo reviewer.",
    "",
    "## Instruction Templates",
    "",
    "- `example.md`: Demo instruction.",
    "",
    "## Porting Notes",
    "",
  ]));
  return dir;
}

function invokeProcessCapture(command: string, args: string[], workingDirectory: string): ProcessResult {
  const result = spawnSync(command, args, {
    cwd: workingDirectory,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    exitCode: result.status ?? 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function invokeValidator(fixtureRoot: string): ProcessResult {
  return invokeProcessCapture("node", [validator, "--root", fixtureRoot], root);
}

function invokeInstaller(args: string[]): ProcessResult {
  return invokeProcessCapture("node", [installer, ...args], root);
}

function invokeRetroInventory(args: string[]): ProcessResult {
  return invokeProcessCapture("node", [retroInventory, ...args], root);
}

function invokeRetroAnalyze(args: string[]): ProcessResult {
  return invokeProcessCapture("node", [retroAnalyze, ...args], root);
}

function assertSuccess(result: ProcessResult, message: string): void {
  if (result.exitCode !== 0) {
    throw new Error(`${message}\nExitCode: ${result.exitCode}\nOutput:\n${result.output}`);
  }
}

function assertFailure(result: ProcessResult, message: string): void {
  if (result.exitCode === 0) {
    throw new Error(`${message}\nExpected failure but command succeeded.\nOutput:\n${result.output}`);
  }
}

function assertOutputContains(result: ProcessResult, needle: string, message: string): void {
  if (!result.output.includes(needle)) {
    throw new Error(`${message}\nExpected output to contain: ${needle}\nOutput:\n${result.output}`);
  }
}

function assertOutputExcludes(result: ProcessResult, needle: string, message: string): void {
  if (result.output.includes(needle)) {
    throw new Error(`${message}\nOutput must not contain: ${needle}\nOutput:\n${result.output}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${String(expected)}\nActual: ${String(actual)}`);
  }
}

function parseJsonOutput(result: ProcessResult): unknown {
  const start = result.output.indexOf("{");
  const end = result.output.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`Expected JSON object output.\nOutput:\n${result.output}`);
  }
  return JSON.parse(result.output.slice(start, end + 1)) as unknown;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, message: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
  return value.map((item) => asRecord(item, message));
}

function findBucket(rows: Array<Record<string, unknown>>, keyName: string, keyValue: string): Record<string, unknown> {
  const found = rows.find((row) => row[keyName] === keyValue);
  if (!found) {
    throw new Error(`Missing bucket ${keyName}=${keyValue}.\nRows:\n${JSON.stringify(rows, null, 2)}`);
  }
  return found;
}

function anyPathWithBasename(rootPath: string, basename: string): boolean {
  if (!fs.existsSync(rootPath)) {
    return false;
  }
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.name === basename) {
      return true;
    }
    if (entry.isDirectory() && anyPathWithBasename(entryPath, basename)) {
      return true;
    }
  }
  return false;
}

function newOpenCodeSessionDbFixture(name: string): string {
  const dir = newTempDir(name);
  const dbPath = path.join(dir, "opencode.db");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(lines([
      "create table project (id text primary key, worktree text not null, name text, time_created integer not null, time_updated integer not null);",
      "create table session (id text primary key, project_id text not null, parent_id text, directory text not null, title text not null, version text not null, time_created integer not null, time_updated integer not null, time_archived integer, time_compacting integer, workspace_id text, path text, agent text, model text, cost real default 0 not null, tokens_input integer default 0 not null, tokens_output integer default 0 not null, tokens_reasoning integer default 0 not null, tokens_cache_read integer default 0 not null, tokens_cache_write integer default 0 not null, metadata text);",
      "create table message (id text primary key, session_id text not null, time_created integer not null, time_updated integer not null, data text not null);",
      "create table part (id text primary key, message_id text not null, session_id text not null, time_created integer not null, time_updated integer not null, data text not null);",
      "create table session_message (id text primary key, session_id text not null, type text not null, time_created integer not null, time_updated integer not null, data text not null, seq integer not null);",
      "create table todo (session_id text not null, content text not null, status text not null, priority text not null, position integer not null, time_created integer not null, time_updated integer not null);",
    ]));
    db.prepare("insert into project (id, worktree, name, time_created, time_updated) values (?, ?, ?, ?, ?)").run("proj_secret", path.join(dir, "SensitiveProjectName"), "SensitiveProjectName", 1700000000000, 1700000000000);
    db.prepare("insert into session (id, project_id, parent_id, directory, title, version, time_created, time_updated, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, metadata) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("ses_secret_root", "proj_secret", null, path.join(dir, "SensitiveProjectName"), "Secret root title", "1.0.0", 1700000000000, 1700000005000, "build", "provider/model", 1.25, 10, 20, 3, 4, 5, "{}");
    db.prepare("insert into session (id, project_id, parent_id, directory, title, version, time_created, time_updated, time_archived, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, metadata) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("ses_secret_child", "proj_secret", "ses_secret_root", path.join(dir, "SensitiveProjectName"), "Secret child title", "1.0.0", 1700000010000, 1700000015000, 1700000020000, "general", "provider/model", 2.5, 11, 21, 4, 5, 6, "{}");
    db.prepare("insert into message (id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?)").run("msg_1", "ses_secret_root", 1700000000000, 1700000001000, "raw secret prompt");
    db.prepare("insert into message (id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?)").run("msg_2", "ses_secret_child", 1700000010000, 1700000011000, "raw secret answer");
    db.prepare("insert into part (id, message_id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?, ?)").run("part_1", "msg_1", "ses_secret_root", 1700000000000, 1700000001000, "raw secret part");
    db.prepare("insert into session_message (id, session_id, type, time_created, time_updated, data, seq) values (?, ?, ?, ?, ?, ?, ?)").run("sm_1", "ses_secret_root", "user", 1700000000000, 1700000001000, "raw secret session message", 1);
    db.prepare("insert into todo (session_id, content, status, priority, position, time_created, time_updated) values (?, ?, ?, ?, ?, ?, ?)").run("ses_secret_root", "raw secret todo", "completed", "high", 0, 1700000000000, 1700000001000);
  } finally {
    db.close();
  }
  return dbPath;
}

const tests: TestCase[] = [
  {
    name: "validator accepts valid fixture",
    run: () => {
      const fixture = newLibraryFixture("valid");
      assertSuccess(invokeValidator(fixture), "Valid fixture should pass validation.");
    },
  },
  {
    name: "validator rejects invalid YAML-like frontmatter",
    run: () => {
      const fixture = newLibraryFixture("invalid-frontmatter");
      writeText(path.join(fixture, ".opencode", "skills", "demo-skill", "SKILL.md"), lines([
        "---",
        "name: demo-skill",
        "description: Invalid: unquoted colon-space scalar.",
        "license: MIT",
        "---",
        "",
        "# Demo Skill",
        "",
      ]));
      assertFailure(invokeValidator(fixture), "Invalid frontmatter should fail validation.");
    },
  },
  {
    name: "validator ignores body-only metadata",
    run: () => {
      const fixture = newLibraryFixture("body-metadata");
      writeText(path.join(fixture, ".opencode", "skills", "demo-skill", "SKILL.md"), lines([
        "# Demo Skill",
        "",
        "name: demo-skill",
        "description: Body metadata must not count as frontmatter.",
        "",
      ]));
      assertFailure(invokeValidator(fixture), "Body-only metadata should not satisfy frontmatter requirements.");
    },
  },
  {
    name: "validator rejects bare required scalars",
    run: () => {
      const fixture = newLibraryFixture("bare-description");
      writeText(path.join(fixture, ".opencode", "skills", "demo-skill", "SKILL.md"), lines([
        "---",
        "name: demo-skill",
        "description:",
        "license: MIT",
        "---",
        "",
        "# Demo Skill",
        "",
      ]));
      assertFailure(invokeValidator(fixture), "Bare required scalar fields should fail validation.");
    },
  },
  {
    name: "validator rejects unsafe reviewer permissions",
    run: () => {
      const fixture = newLibraryFixture("unsafe-permissions");
      writeText(path.join(fixture, ".opencode", "agents", "demo-reviewer.md"), lines([
        "---",
        "description: Reviews demo fixture behavior.",
        "mode: subagent",
        "permission:",
        "  read: allow",
        "  glob: allow",
        "  grep: allow",
        "  list: allow",
        "  bash: ask",
        "  edit: deny",
        "  task: deny",
        "  question: deny",
        "  skill: allow",
        "---",
        "",
        "You are a read-only demo reviewer.",
        "",
      ]));
      assertFailure(invokeValidator(fixture), "Unsafe reviewer permissions should fail validation.");
    },
  },
  {
    name: "validator rejects incomplete reviewer permissions",
    run: () => {
      const fixture = newLibraryFixture("incomplete-reviewer-permissions");
      writeText(path.join(fixture, ".opencode", "agents", "demo-reviewer.md"), lines([
        "---",
        "description: Reviews demo fixture behavior.",
        "mode: subagent",
        "permission:",
        "  read: allow",
        "  glob: allow",
        "  grep: allow",
        "  list: allow",
        "  bash: deny",
        "  edit: deny",
        "  task: deny",
        "  question: deny",
        "  skill: deny",
        "---",
        "",
        "You are a read-only demo reviewer.",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Incomplete reviewer permissions should fail validation.");
      assertOutputContains(result, "webfetch: deny", "Incomplete reviewer permissions should name the missing deny key.");
    },
  },
  {
    name: "validator rejects catalog drift",
    run: () => {
      const fixture = newLibraryFixture("catalog-drift");
      writeText(path.join(fixture, "README.md"), lines([
        "# Fixture",
        "",
        "## Routing Map",
        "",
        "- Default broad work -> `adaptive-delivery`.",
        "",
        "## Reviewer Gate Map",
        "",
        "- Instruction artifacts -> `instruction-artifact-reviewer`.",
        "",
        "## Skill Catalog",
        "",
        "## Agent Catalog",
        "",
        "- `demo-reviewer`: Demo reviewer.",
        "",
        "## Instruction Templates",
        "",
        "- `example.md`: Demo instruction.",
        "",
        "## Porting Notes",
        "",
      ]));
      assertFailure(invokeValidator(fixture), "README catalog drift should fail validation.");
    },
  },
  {
    name: "validator rejects missing routing map",
    run: () => {
      const fixture = newLibraryFixture("missing-routing-map");
      writeText(path.join(fixture, "README.md"), lines([
        "# Fixture",
        "",
        "## Reviewer Gate Map",
        "",
        "- Instruction artifacts -> `instruction-artifact-reviewer`.",
        "",
        "## Skill Catalog",
        "",
        "- `demo-skill`: Demo skill.",
        "",
        "## Agent Catalog",
        "",
        "- `demo-reviewer`: Demo reviewer.",
        "",
        "## Instruction Templates",
        "",
        "- `example.md`: Demo instruction.",
        "",
        "## Porting Notes",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Missing routing map should fail validation.");
      assertOutputContains(result, "Missing README section 'Routing Map'", "Missing routing map should explain the section gap.");
    },
  },
  {
    name: "validator rejects empty reviewer gate map",
    run: () => {
      const fixture = newLibraryFixture("empty-reviewer-map");
      writeText(path.join(fixture, "README.md"), lines([
        "# Fixture",
        "",
        "## Routing Map",
        "",
        "- Default broad work -> `adaptive-delivery`.",
        "",
        "## Reviewer Gate Map",
        "",
        "## Skill Catalog",
        "",
        "- `demo-skill`: Demo skill.",
        "",
        "## Agent Catalog",
        "",
        "- `demo-reviewer`: Demo reviewer.",
        "",
        "## Instruction Templates",
        "",
        "- `example.md`: Demo instruction.",
        "",
        "## Porting Notes",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Empty reviewer gate map should fail validation.");
      assertOutputContains(result, "README reviewer gate map must include at least one bullet", "Empty reviewer gate map should explain the bullet gap.");
    },
  },
  {
    name: "validator rejects missing instruction audit route",
    run: () => {
      const fixture = newLibraryFixture("missing-instruction-audit-route");
      writeText(path.join(fixture, "README.md"), lines([
        "# Fixture",
        "",
        "## Routing Map",
        "",
        "- Default broad work -> `adaptive-delivery`.",
        "",
        "## Reviewer Gate Map",
        "",
        "- Instruction artifacts -> `instruction-artifact-reviewer`.",
        "",
        "## Skill Catalog",
        "",
        "- `demo-skill`: Demo skill.",
        "",
        "## Agent Catalog",
        "",
        "- `demo-reviewer`: Demo reviewer.",
        "",
        "## Instruction Templates",
        "",
        "- `example.md`: Demo instruction.",
        "",
        "## Porting Notes",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Missing instruction audit route should fail validation.");
      assertOutputContains(result, "instruction-artifact-audit-runbook.md", "Missing instruction audit route should explain the route gap.");
    },
  },
  {
    name: "validator rejects missing completion handoff",
    run: () => {
      const fixture = newLibraryFixture("missing-completion-handoff");
      writeText(path.join(fixture, "AGENTS.md"), lines([
        "# Repository Instructions",
        "",
        "- Keep artifacts reusable.",
        "",
      ]));
      assertFailure(invokeValidator(fixture), "Missing completion handoff should fail validation.");
    },
  },
  {
    name: "validator rejects missing TypeScript-only policy",
    run: () => {
      const fixture = newLibraryFixture("missing-typescript-policy");
      writeText(path.join(fixture, "AGENTS.md"), lines([
        "# Repository Instructions",
        "",
        "## Completion Handoff",
        "",
        "- Ask the user only for real blockers, remote/destructive actions, scope or risk decisions, credentials, and MR/PR outcomes.",
        "- When asking, offer 2-4 self-contained next actions via `question` when available.",
        "- Put the recommended option first and end its label with `(Recommended)`.",
        "- In read-only, no-question, or subagent contexts, return `Suggested Next Options` or `Actionable Continuation Items` instead of asking the user directly.",
        "",
        "## Autonomous Work Contract",
        "",
        "- The main session owns skill selection, decomposition, validation, reviewer gates, and ready-to-land handoff.",
        "- Ask the user only for real blockers.",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Missing TypeScript-only policy should fail validation.");
      assertOutputContains(result, "TypeScript-only development policy", "Missing TypeScript policy should explain the section gap.");
    },
  },
  {
    name: "validator rejects missing deterministic helper automation policy",
    run: () => {
      const fixture = newLibraryFixture("missing-helper-automation-policy");
      writeText(path.join(fixture, "AGENTS.md"), lines([
        "# Repository Instructions",
        "",
        "## TypeScript Development",
        "",
        "- Use TypeScript for all repository automation and implementation code.",
        "- Do not add PowerShell, Python, or JavaScript source files; rewrite any such code to TypeScript instead.",
        "",
        "## Completion Handoff",
        "",
        "- Ask the user only for real blockers, remote/destructive actions, scope or risk decisions, credentials, and MR/PR outcomes.",
        "- When asking, offer 2-4 self-contained next actions via `question` when available.",
        "- Put the recommended option first and end its label with `(Recommended)`.",
        "- In read-only, no-question, or subagent contexts, return `Suggested Next Options` or `Actionable Continuation Items` instead of asking the user directly.",
        "",
        "## Autonomous Work Contract",
        "",
        "- The main session owns skill selection, decomposition, validation, reviewer gates, and ready-to-land handoff.",
        "- Ask the user only for real blockers.",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Missing deterministic helper automation policy should fail validation.");
      assertOutputContains(result, "deterministic helper automation policy", "Missing helper automation policy should explain the section gap.");
    },
  },
  {
    name: "validator rejects non-TypeScript source files",
    run: () => {
      const fixture = newLibraryFixture("non-typescript-files");
      writeText(path.join(fixture, "tools", "legacy.ps1"), lines(["# legacy", ""]));
      writeText(path.join(fixture, "tools", "legacy.py"), lines(["print('legacy')", ""]));
      writeText(path.join(fixture, "tools", "legacy.js"), lines(["console.log('legacy');", ""]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Non-TypeScript source/tooling files should fail validation.");
      assertOutputContains(result, "legacy.ps1", "PowerShell source file should be named.");
      assertOutputContains(result, "legacy.py", "Python source file should be named.");
      assertOutputContains(result, "legacy.js", "JavaScript source file should be named.");
    },
  },
  {
    name: "validator rejects legacy tooling references",
    run: () => {
      const fixture = newLibraryFixture("legacy-tooling-references");
      writeText(path.join(fixture, "README.md"), lines([
        "# Fixture",
        "",
        "## Validate",
        "",
        "Run `pwsh -NoProfile -File tools/validate-library.ps1`.",
        "",
        "## Routing Map",
        "",
        "- Default broad work -> `adaptive-delivery`.",
        "- Instruction artifacts -> `instruction-artifact-tuning`; broad audits -> `instruction-artifact-audit-runbook.md`.",
        "",
        "## Reviewer Gate Map",
        "",
        "- Instruction artifacts -> `instruction-artifact-reviewer`.",
        "",
        "## Skill Catalog",
        "",
        "- `demo-skill`: Demo skill.",
        "",
        "## Agent Catalog",
        "",
        "- `demo-reviewer`: Demo reviewer.",
        "",
        "## Instruction Templates",
        "",
        "- `example.md`: Demo instruction.",
        "",
        "## Porting Notes",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Legacy tooling references should fail validation.");
      assertOutputContains(result, "validate-library.ps1", "Legacy validator route should be named.");
    },
  },
  {
    name: "validator rejects legacy package scripts",
    run: () => {
      const fixture = newLibraryFixture("legacy-package-scripts");
      writeText(path.join(fixture, "package.json"), JSON.stringify({
        private: true,
        scripts: {
          validate: "pwsh -NoProfile -File tools/validate-library.ps1",
        },
      }, null, 2));
      const result = invokeValidator(fixture);
      assertFailure(result, "Legacy package scripts should fail validation.");
      assertOutputContains(result, "Package script 'validate'", "Legacy package script failure should name the script.");
    },
  },
  {
    name: "validator rejects routine question handoff",
    run: () => {
      const fixture = newLibraryFixture("routine-question-handoff");
      writeText(path.join(fixture, "AGENTS.md"), lines([
        "# Repository Instructions",
        "",
        "## TypeScript Development",
        "",
        "- Use TypeScript for all repository automation and implementation code.",
        "- Do not add PowerShell, Python, or JavaScript source files; rewrite any such code to TypeScript instead.",
        "",
        "## Completion Handoff",
        "",
        "- After non-trivial user-visible work, the main session offers 2-4 self-contained next actions via `question` when available.",
        "- Put the recommended option first and end its label with `(Recommended)`.",
        "- In read-only, no-question, or subagent contexts, return `Suggested Next Options` or `Actionable Continuation Items` instead of asking the user directly.",
        "",
        "## Autonomous Work Contract",
        "",
        "- Ask the user only for real blockers, remote/destructive actions, scope or risk decisions, credentials, and MR/PR outcomes.",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Routine question handoff should fail validation.");
      assertOutputContains(result, "routine post-task question handoff", "Routine question handoff should explain the autonomy regression.");
    },
  },
  {
    name: "validator rejects self-improvement loops",
    run: () => {
      const fixture = newLibraryFixture("self-improvement-loop");
      writeText(path.join(fixture, ".opencode", "skills", "demo-skill", "SKILL.md"), lines([
        "---",
        "name: demo-skill",
        "description: Use when testing a demo reusable skill.",
        "---",
        "",
        "# Demo Skill",
        "",
        "### Step 4 - Self-Improvement",
        "",
        "> Core principle - do not remove.",
        "",
        "Update this skill after every run.",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Self-improvement loops should fail validation.");
      assertOutputContains(result, "automatic self-improvement/self-edit loops", "Self-improvement loop should explain the autonomy regression.");
    },
  },
  {
    name: "validator ignores local serena markdown",
    run: () => {
      const fixture = newLibraryFixture("ignored-serena");
      writeText(path.join(fixture, ".serena", "memory.md"), lines(["# Local Memory   ", ""]));
      assertSuccess(invokeValidator(fixture), "Ignored .serena markdown should not affect validation.");
    },
  },
  {
    name: "validator ignores deleted tracked markdown",
    run: () => {
      const fixture = newLibraryFixture("deleted-tracked-markdown");
      const stalePath = path.join(fixture, "notes", "stale.md");
      writeText(stalePath, lines(["# Stale", ""]));
      assertSuccess(invokeProcessCapture("git", ["init"], fixture), "Fixture git init should succeed.");
      assertSuccess(invokeProcessCapture("git", ["add", "."], fixture), "Fixture git add should succeed.");
      fs.unlinkSync(stalePath);
      assertSuccess(invokeValidator(fixture), "Deleted tracked markdown should not affect validation.");
    },
  },
  {
    name: "validator warns on implementation language without TDD",
    run: () => {
      const fixture = newLibraryFixture("tdd-warning");
      writeText(path.join(fixture, ".opencode", "skills", "demo-skill", "SKILL.md"), lines([
        "---",
        "name: demo-skill",
        "description: Use when testing a demo reusable skill.",
        "---",
        "",
        "# Demo Skill",
        "",
        "This skill can implement code changes.",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertSuccess(result, "TDD warning should not fail validation.");
      assertOutputContains(result, "WARN:", "TDD warning should be visible.");
    },
  },
  {
    name: "validator rejects retro shared-url and ledger ambiguity",
    run: () => {
      const fixture = newLibraryFixture("retro-privacy-boundary");
      writeText(path.join(fixture, ".opencode", "skills", "demo-skill", "SKILL.md"), lines([
        "---",
        "name: demo-skill",
        "description: Analyze bounded OpenCode session history for workflow improvements.",
        "---",
        "",
        "# Demo Skill",
        "",
        "Use this skill for session retros.",
        "",
        "- Exported transcripts, copied chat logs, shared URLs, or user-provided archives.",
        "",
        "1. Build an evidence ledger for all sessions in scope.",
        "",
      ]));
      const result = invokeValidator(fixture);
      assertFailure(result, "Retro skills with shared URLs and ledgers need explicit privacy boundaries.");
      assertOutputContains(result, "remote/shared URL access", "Shared URL ambiguity should explain the approval requirement.");
      assertOutputContains(result, "session ledger", "Session ledger ambiguity should explain redaction and write approval.");
    },
  },
  {
    name: "validator accepts retro approved privacy boundaries",
    run: () => {
      const fixture = newLibraryFixture("retro-approved-privacy");
      writeText(path.join(fixture, ".opencode", "skills", "demo-skill", "SKILL.md"), lines([
        "---",
        "name: demo-skill",
        "description: Analyze bounded OpenCode session history for workflow improvements.",
        "---",
        "",
        "# Demo Skill",
        "",
        "Default mode is read-only analysis. Write generated ledgers, fetch remote/shared URLs, or use authenticated remote sources only when the user explicitly grants that scope.",
        "",
        "- Exported transcripts, copied chat logs, user-approved shared URLs, or user-provided archives.",
        "",
        "1. Build a redacted evidence ledger for all sessions in scope. Keep it inline by default; write a generated ledger file only when the user approved the path and write scope.",
        "",
      ]));
      assertSuccess(invokeValidator(fixture), "Approved retro privacy boundaries should pass validation.");
    },
  },
  {
    name: "validator accepts retro prohibition privacy boundaries",
    run: () => {
      const fixture = newLibraryFixture("retro-prohibition-privacy");
      writeText(path.join(fixture, ".opencode", "skills", "demo-skill", "SKILL.md"), lines([
        "---",
        "name: demo-skill",
        "description: Analyze bounded OpenCode session history for workflow improvements.",
        "---",
        "",
        "# Demo Skill",
        "",
        "This skill reviews session history.",
        "",
        "Shared URLs are out of scope.",
        "",
        "Do not build a ledger for session history.",
        "",
      ]));
      assertSuccess(invokeValidator(fixture), "Explicitly prohibited shared URLs and ledgers should pass validation.");
    },
  },
  {
    name: "validator rejects forbidden anchors",
    run: () => {
      const fixture = newLibraryFixture("forbidden-anchor");
      writeText(path.join(fixture, "instructions", "example.md"), lines(["# Example", "OldProductName", ""]));
      const result = invokeProcessCapture("node", [validator, "--root", fixture, "--forbidden-anchor", "OldProductName"], root);
      assertFailure(result, "Forbidden anchors should fail validation.");
      assertOutputContains(result, "Forbidden anchor 'OldProductName'", "Forbidden anchor failure should name the anchor.");
    },
  },
  {
    name: "validator warns on broad permission wildcard allow",
    run: () => {
      const riskyFixture = newLibraryFixture("permission-wildcard-risk");
      writeText(path.join(riskyFixture, "opencode.jsonc"), lines([
        "{",
        "  \"$schema\": \"https://opencode.ai/config.json\",",
        "  \"permission\": {",
        "    \"*\": \"allow\",",
        "    \"bash\": {",
        "      \"git reset --hard*\": \"ask\",",
        "      \"*\": \"allow\"",
        "    },",
        "    \"read\": {",
        "      \"*\": \"allow\"",
        "    }",
        "  }",
        "}",
      ]));
      const riskyResult = invokeValidator(riskyFixture);
      assertSuccess(riskyResult, "Broad permission wildcard allow should be warning-only.");
      assertOutputContains(riskyResult, "WARN:", "Broad permission wildcard allow should emit a warning.");
      assertOutputContains(riskyResult, "permission.*", "Permission warning should identify top-level wildcard allow.");
      assertOutputContains(riskyResult, "permission.bash", "Permission warning should identify the affected permission key.");
      assertOutputContains(riskyResult, "wildcard allow", "Permission warning should explain the wildcard allow risk.");
      assertOutputExcludes(riskyResult, "permission.read", "Read wildcard allow should not warn as mutation-capable permission.");

      const safeFixture = newLibraryFixture("permission-wildcard-safe");
      writeText(path.join(safeFixture, "opencode.jsonc"), lines([
        "{",
        "  // JSONC comments are allowed by this validator subset.",
        "  \"$schema\": \"https://opencode.ai/config.json\",",
        "  \"permission\": {",
        "    \"*\": \"ask\",",
        "    \"bash\": {",
        "      \"*\": \"ask\",",
        "      \"git status*\": \"allow\",",
        "    },",
        "  },",
        "}",
      ]));
      const safeResult = invokeValidator(safeFixture);
      assertSuccess(safeResult, "Safe broad ask plus narrow allow should pass validation.");
      assertOutputContains(safeResult, "warnings=0", "Safe permission config should emit no validator warnings.");
      assertOutputExcludes(safeResult, "OpenCode permission config", "Safe permission config should not emit permission warnings.");
    },
  },
  {
    name: "installer dry-run writes nothing",
    run: () => {
      const configDir = path.join(newTempDir("installer-dry-run"), "config");
      const result = invokeInstaller(["--dry-run", "--config-dir", configDir]);
      assertSuccess(result, "Installer dry-run should succeed.");
      if (fs.existsSync(configDir)) {
        throw new Error(`Installer dry-run created config directory: ${configDir}`);
      }
    },
  },
  {
    name: "installer rejects source-nested config dir",
    run: () => {
      const configDir = path.join(root, ".opencode", "skills", "adaptive-delivery", "install-target");
      assertFailure(invokeInstaller(["--dry-run", "--config-dir", configDir]), "Installer should reject config paths nested inside source skills.");
    },
  },
  {
    name: "installer rejects source-parent config dirs",
    run: () => {
      assertFailure(invokeInstaller(["--dry-run", "--config-dir", path.join(root, ".opencode")]), "Installer should reject config paths that contain source artifacts.");
      assertFailure(invokeInstaller(["--dry-run", "--config-dir", root]), "Installer should reject repository root as config path.");
    },
  },
  {
    name: "installer rejects symlinked source config dirs",
    run: () => {
      const fixture = newTempDir("installer-symlink-overlap");
      const repoLink = path.join(fixture, "repo-link");
      try {
        fs.symlinkSync(root, repoLink, process.platform === "win32" ? "junction" : "dir");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`SKIP: installer rejects symlinked source config dirs (${message})`);
        return;
      }
      const configDir = path.join(repoLink, ".opencode", "skills", "adaptive-delivery", "install-target");
      const result = invokeInstaller(["--dry-run", "--config-dir", configDir]);
      assertFailure(result, "Installer should reject config paths nested inside symlinked source skills.");
      assertOutputContains(result, "overlap source artifact directory", "Symlink overlap rejection should explain the source overlap.");
    },
  },
  {
    name: "installer rejects destination AGENTS source",
    run: () => {
      const configDir = path.join(newTempDir("installer-agents-source-self"), "config");
      const agentsPath = path.join(configDir, "AGENTS.md");
      writeText(agentsPath, lines(["# User Rules", ""]));
      const result = invokeInstaller(["--dry-run", "--config-dir", configDir, "--agents-md-source", agentsPath]);
      assertFailure(result, "Installer should reject using destination AGENTS.md as the source block.");
      assertOutputContains(result, "must not be the destination AGENTS.md", "Destination AGENTS source failure should explain the self-source risk.");
    },
  },
  {
    name: "installer rejects loader-dir AGENTS source",
    run: () => {
      const configDir = path.join(newTempDir("installer-agents-source-loader"), "config");
      const sourcePath = path.join(configDir, "agents", "source.md");
      writeText(sourcePath, lines(["# Source", ""]));
      const result = invokeInstaller(["--dry-run", "--config-dir", configDir, "--agents-md-source", sourcePath]);
      assertFailure(result, "Installer should reject AGENTS source paths inside destination loader directories.");
      assertOutputContains(result, "must not be inside destination skills or agents", "Loader-dir source failure should explain prune/loader risk.");
    },
  },
  {
    name: "installer rejects duplicate AGENTS markers",
    run: () => {
      const configDir = path.join(newTempDir("installer-markers"), "config");
      writeText(path.join(configDir, "AGENTS.md"), lines([
        "before",
        "<!-- agents-and-skills:begin -->",
        "old",
        "<!-- agents-and-skills:end -->",
        "middle",
        "<!-- agents-and-skills:begin -->",
        "older",
        "<!-- agents-and-skills:end -->",
        "",
      ]));
      assertFailure(invokeInstaller(["--dry-run", "--config-dir", configDir]), "Duplicate AGENTS.md markers should fail.");
    },
  },
  {
    name: "installer prunes stale skills and agents",
    run: () => {
      const configDir = path.join(newTempDir("installer-prune"), "config");
      const staleSkillDir = path.join(configDir, "skills", "stale-skill");
      const staleAgentFile = path.join(configDir, "agents", "stale-agent.md");
      writeText(path.join(staleSkillDir, "SKILL.md"), lines([
        "---",
        "name: stale-skill",
        "description: Stale installed skill.",
        "---",
        "",
        "# Stale Skill",
        "",
      ]));
      writeText(staleAgentFile, lines(["---", "description: Stale installed agent.", "mode: subagent", "---", ""]));
      const result = invokeInstaller(["--config-dir", configDir, "--skip-agents-md"]);
      assertSuccess(result, "Installer should prune stale skills and agents during full sync.");
      assertOutputContains(result, "pruned: stale skill stale-skill", "Installer should report stale skill pruning.");
      assertOutputContains(result, "pruned: stale agent stale-agent", "Installer should report stale agent pruning.");
      if (fs.existsSync(staleSkillDir)) {
        throw new Error(`Stale skill directory still exists: ${staleSkillDir}`);
      }
      if (fs.existsSync(staleAgentFile)) {
        throw new Error(`Stale agent file still exists: ${staleAgentFile}`);
      }
      const backupRoot = path.join(configDir, ".backups", "agents-and-skills");
      if (!anyPathWithBasename(backupRoot, "stale-skill")) {
        throw new Error(`Stale skill was not backed up under: ${backupRoot}`);
      }
      if (!anyPathWithBasename(backupRoot, "stale-agent.md")) {
        throw new Error(`Stale agent was not backed up under: ${backupRoot}`);
      }
    },
  },
  {
    name: "installer dry-run does not prune stale artifacts",
    run: () => {
      const configDir = path.join(newTempDir("installer-prune-dry-run"), "config");
      const staleSkillDir = path.join(configDir, "skills", "stale-skill");
      const staleAgentFile = path.join(configDir, "agents", "stale-agent.md");
      writeText(path.join(staleSkillDir, "SKILL.md"), lines(["# Stale Skill", ""]));
      writeText(staleAgentFile, lines(["# Stale Agent", ""]));
      const result = invokeInstaller(["--dry-run", "--config-dir", configDir, "--skip-agents-md"]);
      assertSuccess(result, "Installer dry-run prune should succeed.");
      assertOutputContains(result, "would prune: stale skill stale-skill", "Dry-run should report stale skill prune without deleting.");
      assertOutputContains(result, "would prune: stale agent stale-agent", "Dry-run should report stale agent prune without deleting.");
      if (!fs.existsSync(staleSkillDir)) {
        throw new Error(`Dry-run removed stale skill directory: ${staleSkillDir}`);
      }
      if (!fs.existsSync(staleAgentFile)) {
        throw new Error(`Dry-run removed stale agent file: ${staleAgentFile}`);
      }
    },
  },
  {
    name: "installer no-backup prunes without backups",
    run: () => {
      const configDir = path.join(newTempDir("installer-prune-no-backup"), "config");
      const staleSkillDir = path.join(configDir, "skills", "stale-skill");
      const staleAgentFile = path.join(configDir, "agents", "stale-agent.md");
      writeText(path.join(staleSkillDir, "SKILL.md"), lines(["# Stale Skill", ""]));
      writeText(staleAgentFile, lines(["# Stale Agent", ""]));
      const result = invokeInstaller(["--config-dir", configDir, "--skip-agents-md", "--no-backup"]);
      assertSuccess(result, "Installer --no-backup prune should succeed.");
      assertOutputContains(result, "pruned: stale skill stale-skill", "No-backup prune should still report stale skill pruning.");
      assertOutputContains(result, "pruned: stale agent stale-agent", "No-backup prune should still report stale agent pruning.");
      if (fs.existsSync(staleSkillDir)) {
        throw new Error(`No-backup prune left stale skill directory: ${staleSkillDir}`);
      }
      if (fs.existsSync(staleAgentFile)) {
        throw new Error(`No-backup prune left stale agent file: ${staleAgentFile}`);
      }
      const backupRoot = path.join(configDir, ".backups", "agents-and-skills");
      if (fs.existsSync(backupRoot)) {
        throw new Error(`--no-backup created backup root during prune: ${backupRoot}`);
      }
    },
  },
  {
    name: "installer no-prune keeps stale artifacts",
    run: () => {
      const configDir = path.join(newTempDir("installer-no-prune"), "config");
      const staleSkillDir = path.join(configDir, "skills", "stale-skill");
      const staleAgentFile = path.join(configDir, "agents", "stale-agent.md");
      writeText(path.join(staleSkillDir, "SKILL.md"), lines(["# Stale Skill", ""]));
      writeText(staleAgentFile, lines(["# Stale Agent", ""]));
      const result = invokeInstaller(["--config-dir", configDir, "--skip-agents-md", "--no-prune"]);
      assertSuccess(result, "Installer --no-prune should succeed.");
      if (!fs.existsSync(staleSkillDir)) {
        throw new Error(`--no-prune removed stale skill directory: ${staleSkillDir}`);
      }
      if (!fs.existsSync(staleAgentFile)) {
        throw new Error(`--no-prune removed stale agent file: ${staleAgentFile}`);
      }
    },
  },
  {
    name: "retro inventory reports redacted SQLite coverage",
    run: () => {
      const dbPath = newOpenCodeSessionDbFixture("retro-inventory");
      const result = invokeRetroInventory(["--db", dbPath, "--only-explicit", "--no-desktop", "--format", "json"]);
      assertSuccess(result, "Retro inventory should read a minimal OpenCode SQLite fixture.");
      assertOutputContains(result, '"totalSessions": 2', "Retro inventory should count sessions.");
      assertOutputContains(result, '"childSessions": 1', "Retro inventory should count child sessions.");
      assertOutputContains(result, '"messageRows": 2', "Retro inventory should count message rows.");
      assertOutputContains(result, '"partRows": 1', "Retro inventory should count part rows.");
      assertOutputContains(result, '"redacted": true', "Retro inventory should default to redacted output.");
      assertOutputExcludes(result, "Secret root title", "Retro inventory must not expose raw session titles.");
      assertOutputExcludes(result, "SensitiveProjectName", "Retro inventory must not expose raw project names or paths by default.");
      assertOutputExcludes(result, "ses_secret_root", "Retro inventory must not expose stable session ids by default.");
      assertOutputExcludes(result, "raw secret", "Retro inventory must not expose raw message, part, or todo data.");
    },
  },
  {
    name: "retro inventory redacts Desktop state keys and parse errors",
    run: () => {
      const desktopDir = newTempDir("retro-desktop-privacy");
      writeText(path.join(desktopDir, "opencode.workspace.SensitiveProjectName.dat"), lines([
        "{",
        "  \"session:ses_secret:prompt\": \"raw secret prompt\",",
        "  \"workspace:SensitiveProjectName\": \"raw secret workspace\",",
        "  \"NoColonSecretKey\": \"raw secret key\"",
        "}",
      ]));
      writeText(path.join(desktopDir, "opencode.workspace.bad.dat"), "secret prompt token");
      const result = invokeRetroInventory(["--desktop-dir", desktopDir, "--only-explicit", "--format", "json"]);
      assertSuccess(result, "Retro inventory should tolerate malformed Desktop state files.");
      assertOutputContains(result, '"desktopStateFiles": 2', "Retro inventory should count Desktop state files.");
      assertOutputExcludes(result, "SensitiveProjectName", "Desktop inventory must not expose raw workspace names.");
      assertOutputExcludes(result, "ses_secret", "Desktop inventory must not expose raw session ids from keys.");
      assertOutputExcludes(result, "NoColonSecretKey", "Desktop inventory must not expose unknown raw key names.");
      assertOutputExcludes(result, "secret prompt token", "Desktop parse errors must not expose raw malformed file snippets.");
      assertOutputExcludes(result, "raw secret", "Desktop inventory must not expose raw Desktop state values.");
    },
  },
  {
    name: "retro inventory refuses to overwrite output files",
    run: () => {
      const dbPath = newOpenCodeSessionDbFixture("retro-overwrite");
      const outPath = path.join(newTempDir("retro-output"), "ledger.json");
      writeText(outPath, "existing ledger");
      const result = invokeRetroInventory(["--db", dbPath, "--only-explicit", "--no-desktop", "--format", "json", "--out", outPath]);
      assertFailure(result, "Retro inventory should refuse accidental ledger overwrite.");
      assertOutputContains(result, "already exists", "Overwrite refusal should explain the existing output path.");
    },
  },
  {
    name: "retro analyze reports redacted structured metrics",
    run: () => {
      const dbPath = newOpenCodeSessionDbFixture("retro-analyze");
      const beforeFiles = fs.readdirSync(path.dirname(dbPath)).sort();
      const db = new DatabaseSync(dbPath);
      try {
        db.exec(lines([
          "create table account (id text primary key, email text, url text, access_token text, refresh_token text, token_expiry integer, time_created integer, time_updated integer);",
          "create table session_share (session_id text not null, id text not null, secret text not null, url text not null, time_created integer not null, time_updated integer not null);",
          "create table event (id text primary key, aggregate_id text not null, seq integer not null, type text not null, data text not null);",
          "create table session_input (id text primary key, session_id text not null, prompt text not null, delivery text not null, admitted_seq integer, promoted_seq integer, time_created integer not null);",
        ]));
        db.prepare("insert into account (id, email, url, access_token, refresh_token, token_expiry, time_created, time_updated) values (?, ?, ?, ?, ?, ?, ?, ?)").run("account_secret", "raw secret email", "raw secret url", "raw secret access token", "raw secret refresh token", 1700000999000, 1700000000000, 1700000000000);
        db.prepare("insert into session_share (session_id, id, secret, url, time_created, time_updated) values (?, ?, ?, ?, ?, ?)").run("ses_secret_root", "share_secret_id", "raw secret share token", "raw secret share url", 1700000000000, 1700000000000);
        db.prepare("insert into event (id, aggregate_id, seq, type, data) values (?, ?, ?, ?, ?)").run("evt_secret", "ses_secret_root", 1, "session.created.1", "raw secret event data");
        db.prepare("insert into session_input (id, session_id, prompt, delivery, admitted_seq, promoted_seq, time_created) values (?, ?, ?, ?, ?, ?, ?)").run("input_secret", "ses_secret_root", "raw secret input prompt", "queued", 1, 1, 1700000000000);
        db.prepare("insert into message (id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?)").run(
          "msg_json",
          "ses_secret_root",
          1700000002000,
          1700000003000,
          JSON.stringify({ role: "user", content: "raw secret json message" }),
        );
        db.prepare("insert into part (id, message_id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?, ?)").run(
          "part_tool",
          "msg_json",
          "ses_secret_root",
          1700000002000,
          1700000003000,
          JSON.stringify({
            type: "tool",
            tool: "bash",
            state: {
              status: "error",
              input: {
                command: "dangerous secret token command",
                description: "raw secret description",
              },
            },
          }),
        );
      } finally {
        db.close();
      }
      const result = invokeRetroAnalyze(["--db", dbPath, "--only-explicit", "--format", "json"]);
      assertSuccess(result, "Retro analyze should read a minimal OpenCode SQLite fixture.");
      const afterFiles = fs.readdirSync(path.dirname(dbPath)).sort();
      assertEqual(afterFiles.join("\n"), beforeFiles.join("\n"), "Retro analyze should not create SQLite sidecar or output files without --out.");
      const report = asRecord(parseJsonOutput(result), "Retro analyze JSON root should be an object.");
      assertEqual(report.tool, "opencode-session-retro-analyze", "Retro analyze should identify its report contract.");
      assertEqual(report.redacted, true, "Retro analyze should default to redacted output.");
      const coverage = asRecord(report.coverage, "Retro analyze coverage should be an object.");
      assertEqual(coverage.totalSessions, 2, "Retro analyze should count sessions exactly.");
      assertEqual(coverage.messageRows, 3, "Retro analyze should count message rows exactly.");
      assertEqual(coverage.partRows, 2, "Retro analyze should count part rows exactly.");
      const sources = asArray(report.sources, "Retro analyze sources should be an array.");
      assertEqual(sources.length, 1, "Retro analyze should report one explicit source.");
      const source = sources[0];
      if ("path" in source) {
        throw new Error(`Retro analyze should omit source path unless --show-paths is used.\nSource:\n${JSON.stringify(source, null, 2)}`);
      }
      const counts = asRecord(source.counts, "Retro analyze source counts should be an object.");
      assertEqual(counts.account, 1, "Retro analyze should count account rows without reading token values.");
      assertEqual(counts.session_share, 1, "Retro analyze should count session_share rows without reading secrets.");
      const sessionSummary = asRecord(source.sessionSummary, "Retro analyze session summary should be an object.");
      assertEqual(sessionSummary.rootSessions, 1, "Retro analyze should count root sessions exactly.");
      assertEqual(sessionSummary.childSessions, 1, "Retro analyze should count child sessions exactly.");
      assertEqual(sessionSummary.sessionShareRows, 1, "Retro analyze should count session_share rows in the session summary.");
      const messageEnvelope = asRecord(source.messageEnvelope, "Retro analyze message envelope should be an object.");
      assertEqual(messageEnvelope.parsedRows, 1, "Retro analyze should count parsed message JSON rows exactly.");
      assertEqual(messageEnvelope.unreadableRows, 2, "Retro analyze should count unreadable message rows exactly.");
      const roleCounts = asArray(messageEnvelope.roleCounts, "Retro analyze roleCounts should be an array.");
      assertEqual(findBucket(roleCounts, "key", "user").count, 1, "Retro analyze should count message roles exactly.");
      const partEnvelope = asRecord(source.partEnvelope, "Retro analyze part envelope should be an object.");
      assertEqual(partEnvelope.parsedRows, 1, "Retro analyze should count parsed part JSON rows exactly.");
      assertEqual(partEnvelope.unreadableRows, 1, "Retro analyze should count unreadable part rows exactly.");
      const partTypeCounts = asArray(partEnvelope.typeCounts, "Retro analyze part type counts should be an array.");
      assertEqual(findBucket(partTypeCounts, "key", "tool").count, 1, "Retro analyze should count part types exactly.");
      const toolEnvelope = asRecord(source.toolEnvelope, "Retro analyze tool envelope should be an object.");
      assertEqual(toolEnvelope.toolParts, 1, "Retro analyze should count tool parts exactly.");
      assertEqual(toolEnvelope.errorStatusToolParts, 1, "Retro analyze should count structured error status tool parts exactly.");
      assertEqual(toolEnvelope.errorStatusSessions, 1, "Retro analyze should count sessions with structured tool error status exactly.");
      assertEqual(findBucket(asArray(toolEnvelope.toolCounts, "Retro analyze toolCounts should be an array."), "tool", "bash").count, 1, "Retro analyze should count structured tool names exactly.");
      assertEqual(findBucket(asArray(toolEnvelope.statusCounts, "Retro analyze statusCounts should be an array."), "status", "error").count, 1, "Retro analyze should count structured tool statuses exactly.");
      assertEqual(findBucket(asArray(toolEnvelope.inputKeyCounts, "Retro analyze inputKeyCounts should be an array."), "key", "bash.command").count, 1, "Retro analyze should count input keys without values exactly.");
      assertEqual(findBucket(asArray(source.todoCounts, "Retro analyze todoCounts should be an array."), "status", "completed").count, 1, "Retro analyze should count todo status/priority rows exactly.");
      assertEqual(findBucket(asArray(source.eventTypeCounts, "Retro analyze eventTypeCounts should be an array."), "key", "session.created.1").count, 1, "Retro analyze should count event types exactly.");
      assertEqual(findBucket(asArray(source.sessionInputDeliveries, "Retro analyze sessionInputDeliveries should be an array."), "key", "queued").count, 1, "Retro analyze should count session input deliveries exactly.");
      const privacyNotes = (report.privacyNotes as unknown[]).join("\n");
      if (!privacyNotes.includes("Paths are not emitted by default")) {
        throw new Error(`Retro analyze privacy notes should explain default path omission.\nNotes:\n${privacyNotes}`);
      }
      assertOutputExcludes(result, "Secret root title", "Retro analyze must not expose raw session titles.");
      assertOutputExcludes(result, "SensitiveProjectName", "Retro analyze must not expose raw project names or paths by default.");
      assertOutputExcludes(result, "ses_secret_root", "Retro analyze must not expose stable session ids by default.");
      assertOutputExcludes(result, "proj_secret", "Retro analyze must not expose stable project ids by default.");
      assertOutputExcludes(result, "account_secret", "Retro analyze must not expose raw account ids.");
      assertOutputExcludes(result, "share_secret_id", "Retro analyze must not expose raw share ids.");
      assertOutputExcludes(result, "raw secret", "Retro analyze must not expose raw message, part, todo, or command data.");
      assertOutputExcludes(result, "dangerous secret token command", "Retro analyze must not expose raw command values.");
    },
  },
  {
    name: "retro analyze markdown reports action-oriented redacted sections",
    run: () => {
      const dbPath = newOpenCodeSessionDbFixture("retro-analyze-markdown");
      const db = new DatabaseSync(dbPath);
      try {
        db.prepare("insert into part (id, message_id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?, ?)").run(
          "part_tool_error",
          "msg_1",
          "ses_secret_root",
          1700000002000,
          1700000003000,
          JSON.stringify({
            type: "tool",
            tool: "bash",
            state: {
              status: "error",
              input: {
                command: "raw secret command value",
              },
            },
          }),
        );
        db.prepare("insert into part (id, message_id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?, ?)").run(
          "part_tool_completed_1",
          "msg_1",
          "ses_secret_root",
          1700000004000,
          1700000005000,
          JSON.stringify({
            type: "tool",
            tool: "read",
            state: {
              status: "completed",
              input: {
                filePath: "raw secret file path",
              },
            },
          }),
        );
        db.prepare("insert into part (id, message_id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?, ?)").run(
          "part_tool_completed_2",
          "msg_1",
          "ses_secret_root",
          1700000006000,
          1700000007000,
          JSON.stringify({
            type: "tool",
            tool: "read",
            state: {
              status: "completed",
              input: {
                filePath: "raw secret file path",
              },
            },
          }),
        );
      } finally {
        db.close();
      }
      const result = invokeRetroAnalyze(["--db", dbPath, "--only-explicit", "--format", "markdown", "--max-buckets", "1"]);
      assertSuccess(result, "Retro analyze markdown should read a minimal OpenCode SQLite fixture.");
      assertOutputContains(result, "### Tool Error Hotspots", "Markdown output should make tool errors visible without JSON inspection.");
      assertOutputContains(result, "| bash | error | 1 |", "Markdown output should include redacted tool error buckets.");
      assertOutputContains(result, "### Todo Rollup", "Markdown output should include TODO status and priority counts.");
      assertOutputContains(result, "| completed | high | 1 |", "Markdown output should include redacted TODO rollup rows.");
      assertOutputContains(result, "### Day Buckets", "Markdown output should include chronological session buckets.");
      assertOutputContains(result, "| 2023-11-14 | 2 | 1 | 1 | 1 |", "Markdown output should include redacted daily session counts.");
      assertOutputContains(result, "### Session Message Types", "Markdown output should include session_message type counts.");
      assertOutputContains(result, "| user | 1 |", "Markdown output should include session_message type buckets.");
      assertOutputExcludes(result, "Secret root title", "Retro analyze markdown must not expose raw session titles.");
      assertOutputExcludes(result, "SensitiveProjectName", "Retro analyze markdown must not expose raw project names or paths by default.");
      assertOutputExcludes(result, "ses_secret_root", "Retro analyze markdown must not expose stable session ids by default.");
      assertOutputExcludes(result, "raw secret", "Retro analyze markdown must not expose raw message, part, todo, or command data.");
    },
  },
  {
    name: "retro analyze documents show-paths privacy mode",
    run: () => {
      const dbPath = newOpenCodeSessionDbFixture("retro-analyze-show-paths");
      const result = invokeRetroAnalyze(["--db", dbPath, "--only-explicit", "--format", "json", "--show-paths"]);
      assertSuccess(result, "Retro analyze --show-paths should succeed for an explicit source.");
      const report = asRecord(parseJsonOutput(result), "Retro analyze JSON root should be an object.");
      const sources = asArray(report.sources, "Retro analyze sources should be an array.");
      const sourcePath = typeof sources[0].path === "string" ? sources[0].path : "";
      if (!(sourcePath.startsWith("~/") && sourcePath.endsWith("/opencode.db")) && !sourcePath.endsWith(":opencode.db")) {
        throw new Error(`Retro analyze --show-paths should emit only a redacted source path for this fixture.\nSource:\n${JSON.stringify(sources[0], null, 2)}`);
      }
      const privacyNotes = (report.privacyNotes as unknown[]).join("\n");
      if (!privacyNotes.includes("home-redacted source paths are emitted because --show-paths was requested")) {
        throw new Error(`Retro analyze privacy notes should explain --show-paths mode.\nNotes:\n${privacyNotes}`);
      }
      assertOutputExcludes(result, "SensitiveProjectName", "Retro analyze --show-paths must still avoid project names.");
      assertOutputExcludes(result, "raw secret", "Retro analyze --show-paths must still avoid content values.");
    },
  },
  {
    name: "retro analyze refuses to overwrite output files",
    run: () => {
      const dbPath = newOpenCodeSessionDbFixture("retro-analyze-overwrite");
      const outPath = path.join(newTempDir("retro-analyze-output"), "analysis.json");
      writeText(outPath, "existing analysis");
      const result = invokeRetroAnalyze(["--db", dbPath, "--only-explicit", "--format", "json", "--out", outPath]);
      assertFailure(result, "Retro analyze should refuse accidental generated report overwrite.");
      assertOutputContains(result, "already exists", "Retro analyze overwrite refusal should explain the existing output path.");
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS: ${test.name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL: ${test.name}`);
    console.log(message);
  }
}

if (failed > 0) {
  throw new Error(`${failed} library test(s) failed.`);
}

console.log(`OK: library tests=${tests.length}`);
