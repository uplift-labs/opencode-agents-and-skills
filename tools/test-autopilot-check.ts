#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deduplicateCheckCommands,
  planAutopilotChecks,
  runAutopilotCheck,
  type AutopilotCheckCommand,
  type AutopilotCheckCommandResult,
} from "./autopilot-check.ts";

type TestCase = {
  name: string;
  run: () => void;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");
const checker = path.join(root, "tools", "autopilot-check.ts");
const generatedAt = "2026-06-12T00:00:00.000Z";

function newTempDir(name: string): string {
  const parent = path.join(os.tmpdir(), "agents-and-skills-autopilot-check-tests");
  fs.mkdirSync(parent, { recursive: true });
  const dir = path.join(parent, `${name}-${crypto.randomUUID().replace(/-/g, "")}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = newTempDir(name);
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${String(expected)}\nActual: ${String(actual)}`);
  }
}

function assertArrayEqual(actual: string[], expected: string[], message: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${message}\nExpected: ${expected.join("\n")}\nActual: ${actual.join("\n")}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeActiveChange(repo: string, changeId: string): void {
  const changeRoot = path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(changeRoot, { recursive: true });
  fs.writeFileSync(path.join(changeRoot, "tasks.md"), `# Tasks: ${changeId}\n\n- [ ] Do work.\n`, "utf8");
}

function validLedger(taskId: string): Record<string, unknown> {
  const ledger = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "valid-research.json"), "utf8")) as Record<string, unknown>;
  ledger.id = taskId;
  return ledger;
}

function writeLedger(repo: string, changeId: string, taskId = changeId): void {
  writeActiveChange(repo, changeId);
  writeJson(path.join(repo, "openspec", "changes", changeId, "automation", "task.json"), validLedger(taskId));
}

function writeCompletedLedger(repo: string, changeId: string, taskId = changeId): void {
  writeLedger(repo, changeId, taskId);
  fs.writeFileSync(path.join(repo, "openspec", "changes", changeId, "tasks.md"), `# Tasks: ${changeId}\n\n- [x] Done.\n`, "utf8");
}

function writeInvalidLedger(repo: string, changeId: string): void {
  writeActiveChange(repo, changeId);
  writeJson(path.join(repo, "openspec", "changes", changeId, "automation", "task.json"), { schemaVersion: 1, id: "invalid-ledger" });
}

function writePrototypeLedger(repo: string, taskId: string): void {
  writeJson(path.join(repo, ".autopilot", "prototype", "tasks", `${taskId}.json`), validLedger(taskId));
}

function writeArchivedLedger(repo: string, changeId: string): void {
  writeJson(path.join(repo, "openspec", "changes", "archive", changeId, "automation", "task.json"), validLedger(changeId));
}

function writeRuntimeState(repo: string, value: unknown): void {
  writeJson(path.join(repo, ".autopilot", "runtime", "state.json"), value);
}

function spawnChecker(repo: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("node", [checker, "--root", repo, ...args], { cwd: root, encoding: "utf8", shell: false });
  if (result.error) {
    throw result.error;
  }
  return { status: result.status ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function parseJsonOutput(output: string): Record<string, unknown> {
  return JSON.parse(output) as Record<string, unknown>;
}

function snapshotFiles(rootPath: string, relativePath = ""): string[] {
  const current = path.join(rootPath, relativePath);
  if (!fs.existsSync(current)) {
    return [];
  }
  return fs.readdirSync(current, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const entryRelativePath = path.join(relativePath, entry.name);
      const normalized = entryRelativePath.split(path.sep).join("/");
      const entryPath = path.join(rootPath, entryRelativePath);
      if (entry.isDirectory()) {
        return [`${normalized}/\n<DIR>`, ...snapshotFiles(rootPath, entryRelativePath)];
      }
      return [`${normalized}\n${fs.readFileSync(entryPath, "utf8")}`];
    });
}

function commandKey(command: AutopilotCheckCommand): string {
  return `${command.label}:${command.command} ${command.args.join(" ")}`;
}

const tests: TestCase[] = [
  {
    name: "cheap check reports no active ledgers as not-applicable",
    run: () => withTempRepo("cheap-no-ledgers", (repo) => {
      writeActiveChange(repo, "change-a");
      const before = snapshotFiles(repo);
      const output = runAutopilotCheck(repo, { level: "cheap", generatedAt });
      const noLedgers = output.checks.find((check) => check.id === "autopilot-ledgers:none");

      assertEqual(output.status, "passed", "No-ledger cheap check should pass.");
      assertEqual(output.exitCode, 0, "No-ledger cheap check should exit zero.");
      assertArrayEqual(output.scope.changes, ["change-a"], "Active change inventory should include change-a.");
      assertArrayEqual(output.scope.ledgers, [], "No active ledgers should be in scope.");
      assert(noLedgers?.status === "not-applicable", "No-ledger check should be not-applicable.");
      assert(output.checks.every((check) => check.command !== "npm test"), "Cheap checks must not run npm test.");
      assert(JSON.stringify(snapshotFiles(repo)) === JSON.stringify(before), "Cheap check must not create automation/task.json or .autopilot files for active changes without ledgers.");
    }),
  },
  {
    name: "planner discovers active and prototype ledgers while excluding archive",
    run: () => withTempRepo("discover-ledgers", (repo) => {
      writeLedger(repo, "change-b", "task-b");
      writeLedger(repo, "change-a", "task-a");
      writePrototypeLedger(repo, "proto-task");
      writeArchivedLedger(repo, "archived-change");

      const plan = planAutopilotChecks(repo, { level: "prepush", generatedAt });
      const ledgerPaths = plan.inventory.ledgers.map((ledger) => ledger.path);
      const command = plan.commands.find((entry) => entry.id === "command:autopilot-ledger-validation");
      const commandLedgerArgs = command?.args.slice(command.args.indexOf("--") + 1) ?? [];

      assertArrayEqual(ledgerPaths, [
        ".autopilot/prototype/tasks/proto-task.json",
        "openspec/changes/change-a/automation/task.json",
        "openspec/changes/change-b/automation/task.json",
      ], "Planner should discover deterministic active ledger paths and exclude archive.");
      assertArrayEqual(commandLedgerArgs, ledgerPaths, "Pre-push ledger validation command should cover every active ledger in deterministic order.");
    }),
  },
  {
    name: "cheap check warns for stale completed non-terminal ledger",
    run: () => withTempRepo("stale-completed-ledger", (repo) => {
      writeCompletedLedger(repo, "done-change", "task-done");
      const output = runAutopilotCheck(repo, { level: "cheap", generatedAt });

      assertEqual(output.status, "warning", "Stale completed ledger should be warning-level at cheap level.");
      assertEqual(output.exitCode, 0, "Warning-level stale ledger should not fail unless warnings are fatal.");
      const stale = output.checks.find((check) => check.id === "autopilot-ledger:stale-completed:task-done");
      assert(stale?.status === "warning" && stale.blocking === false, `Expected non-blocking stale warning, got ${JSON.stringify(stale)}.`);
      assert(stale.summary.includes("tasks.md checklist is complete"), `Stale summary must explain completed checklist, got ${stale.summary}.`);
      assert(output.nextActions.some((action) => action.label.includes("Reconcile stale completed ledger")), `Stale check must provide reconciliation next action, got ${JSON.stringify(output.nextActions)}.`);
    }),
  },
  {
    name: "missing explicitly scoped ledger fails blocking check",
    run: () => withTempRepo("missing-scoped-ledger", (repo) => {
      const output = runAutopilotCheck(repo, {
        level: "cheap",
        generatedAt,
        ledgers: ["openspec/changes/missing/automation/task.json"],
      });

      assertEqual(output.status, "failed", "Missing scoped ledger should fail.");
      assertEqual(output.exitCode, 1, "Missing scoped ledger should return non-zero.");
      assert(output.checks.some((check) => check.id.startsWith("scope:ledger:") && check.blocking && check.status === "failed"), "Missing scoped ledger should have a blocking failed check.");
      assert(output.nextActions.some((action) => action.label.includes("Fix Autopilot scoped ledger")), "Missing scoped ledger should produce a focused next action.");
    }),
  },
  {
    name: "cheap check reports write gate active runtime evidence",
    run: () => withTempRepo("write-gate-active", (repo) => {
      writeRuntimeState(repo, {
        schemaVersion: 1,
        consumedWorkerReportIds: [],
        runs: {
          "run-1": {
            runId: "run-1",
            status: "running",
            createdAt: "2026-06-10T00:00:00.000Z",
            updatedAt: "2026-06-10T00:00:01.000Z",
            taskId: "task-a",
            ledgerPath: "openspec/changes/task-a/automation/task.json",
            fromStatus: "Implementation",
            expectedReportId: "report-1",
            workerId: "worker-1",
            workerSessionId: "worker-session-1",
            scope: { read: ["tools/**"], write: ["tools/**"], forbidden: ["openspec/changes/*/automation/**", ".autopilot/**"] },
          },
        },
      });
      const output = runAutopilotCheck(repo, { level: "cheap", generatedAt });
      const writeGate = output.checks.find((check) => check.id === "write-gate:runtime:active");

      assertEqual(output.exitCode, 0, "Valid active runtime evidence should not fail cheap check.");
      assert(writeGate?.status === "passed", `Expected active write gate check to pass, got ${JSON.stringify(writeGate)}.`);
      assert(writeGate.summary.includes("active write ownership") && writeGate.summary.includes("task-a"), `Active write gate summary should name compact task evidence, got ${writeGate.summary}.`);
    }),
  },
  {
    name: "cheap check fails for corrupt write gate runtime evidence",
    run: () => withTempRepo("write-gate-corrupt", (repo) => {
      fs.mkdirSync(path.join(repo, ".autopilot", "runtime"), { recursive: true });
      fs.writeFileSync(path.join(repo, ".autopilot", "runtime", "state.json"), "{not json", "utf8");
      const output = runAutopilotCheck(repo, { level: "cheap", generatedAt });
      const writeGate = output.checks.find((check) => check.id === "write-gate:runtime:invalid");

      assertEqual(output.status, "failed", "Corrupt runtime evidence should fail check.");
      assertEqual(output.exitCode, 1, "Corrupt runtime evidence should return non-zero.");
      assert(writeGate?.blocking === true && writeGate.status === "failed", `Expected blocking failed write gate check, got ${JSON.stringify(writeGate)}.`);
      assert(writeGate.summary.includes("fail closed"), `Corrupt write gate summary should explain fail-closed mutation behavior, got ${writeGate.summary}.`);
    }),
  },
  {
    name: "explicit scoped ledger mismatch with change fails instead of disappearing",
    run: () => withTempRepo("scoped-ledger-mismatch", (repo) => {
      writeActiveChange(repo, "change-a");
      writeLedger(repo, "change-b", "task-b");
      const output = runAutopilotCheck(repo, {
        level: "cheap",
        change: "change-a",
        generatedAt,
        ledgers: ["openspec/changes/change-b/automation/task.json"],
      });

      assertEqual(output.status, "failed", "Mismatched explicit ledger/change scope should fail.");
      assert(output.checks.some((check) => check.id === "scope:ledger-change-mismatch:openspec/changes/change-b/automation/task.json" && check.blocking), "Mismatched explicit ledger should produce a blocking scope issue.");
      assertArrayEqual(output.scope.ledgers, ["openspec/changes/change-b/automation/task.json"], "Explicit ledger should remain visible in output scope.");
    }),
  },
  {
    name: "static scope blockers short-circuit command execution",
    run: () => withTempRepo("scope-blocker-short-circuit", (repo) => {
      const calls: string[] = [];
      fs.mkdirSync(path.join(repo, "openspec"), { recursive: true });
      const output = runAutopilotCheck(repo, {
        level: "final",
        generatedAt,
        commandRunner: (_root: string, command: AutopilotCheckCommand): AutopilotCheckCommandResult => {
          calls.push(commandKey(command));
          return { status: 0, signal: null };
        },
      });

      assertEqual(output.status, "blocked", "Final without --change should be blocked.");
      assertEqual(output.exitCode, 1, "Final without --change should return non-zero.");
      assertArrayEqual(calls, [], "Scope blockers should prevent broad command execution.");
    }),
  },
  {
    name: "explicit scoped ledger safety failures are blocking",
    run: () => withTempRepo("scoped-ledger-safety", (repo) => {
      writeArchivedLedger(repo, "archived-change");
      fs.mkdirSync(path.join(repo, "openspec", "changes", "dir-ledger", "automation", "task.json"), { recursive: true });
      writeActiveChange(repo, "malformed-ledger");
      fs.mkdirSync(path.join(repo, "openspec", "changes", "malformed-ledger", "automation"), { recursive: true });
      fs.writeFileSync(path.join(repo, "openspec", "changes", "malformed-ledger", "automation", "task.json"), "{not json", "utf8");

      const cases = [
        { name: "empty", ledgers: [""], expectedStatus: "failed" },
        { name: "outside", ledgers: ["../outside/task.json"], expectedStatus: "failed" },
        { name: "archived", ledgers: ["openspec/changes/archive/archived-change/automation/task.json"], expectedStatus: "failed" },
        { name: "directory", ledgers: ["openspec/changes/dir-ledger/automation/task.json"], expectedStatus: "failed" },
        { name: "malformed", ledgers: ["openspec/changes/malformed-ledger/automation/task.json"], expectedStatus: "failed" },
      ];

      for (const entry of cases) {
        const output = runAutopilotCheck(repo, { level: "cheap", generatedAt, ledgers: entry.ledgers });
        assertEqual(output.status, entry.expectedStatus, `Scoped ledger ${entry.name} should fail.`);
        assertEqual(output.exitCode, 1, `Scoped ledger ${entry.name} should return non-zero.`);
        assert(output.checks.some((check) => check.blocking && check.status === "failed"), `Scoped ledger ${entry.name} should produce a blocking failed check.`);
      }
    }),
  },
  {
    name: "level expansion plans checkpoints and deduplicates commands",
    run: () => withTempRepo("level-expansion", (repo) => {
      writeActiveChange(repo, "change-a");
      const cheap = planAutopilotChecks(repo, { level: "cheap", generatedAt, change: "change-a" });
      const standard = planAutopilotChecks(repo, { level: "standard", generatedAt, change: "change-a" });
      const final = planAutopilotChecks(repo, { level: "final", generatedAt, change: "change-a" });
      const followups = final.commands.findIndex((command) => command.id === "command:retro-followups:change-a");
      const retroGate = final.commands.findIndex((command) => command.id === "command:retro-gate:change-a");
      const deduped = deduplicateCheckCommands([
        { id: "one", label: "One", command: "npm", args: ["test"], source: "fixture", blocking: true },
        { id: "two", label: "Two", command: "npm", args: ["test"], source: "fixture", blocking: true },
      ]);

      assertEqual(cheap.commands.length, 0, "Cheap level should not plan command execution.");
      assert(standard.commands.some((command) => command.id === "command:evidence-collect:change-a"), "Standard level should plan evidence collect for scoped change.");
      assert(!standard.commands.some((command) => command.command === "npm" && command.args.join(" ") === "test"), "Standard level should not plan full test suite.");
      assert(followups >= 0 && retroGate >= 0 && followups < retroGate, "Final level should plan retro followups before retro gate.");
      assertEqual(deduped.length, 1, "Duplicate commands should be deduplicated by executable and args.");
    }),
  },
  {
    name: "prepush freshness is planned for changed task report and ledger artifacts",
    run: () => withTempRepo("prepush-freshness", (repo) => {
      writeLedger(repo, "change-a", "task-a");
      const changedFiles = [
        "openspec/changes/change-a/tasks.md",
        "openspec/changes/change-a/live-regression-report.md",
        "openspec/changes/change-a/automation/task.json",
      ];
      const plan = planAutopilotChecks(repo, { level: "prepush", generatedAt, changedFiles });
      const freshnessCommands = plan.commands.filter((command) => command.id === "command:freshness:change-a");
      const calls: string[] = [];
      const output = runAutopilotCheck(repo, {
        level: "prepush",
        generatedAt,
        changedFiles,
        commandRunner: (_root: string, command: AutopilotCheckCommand): AutopilotCheckCommandResult => {
          calls.push(commandKey(command));
          return command.label === "Autopilot evidence freshness" ? { status: 1, signal: null, stdout: "stale report", stderr: "" } : { status: 0, signal: null, stdout: "ok", stderr: "" };
        },
      });

      assertEqual(freshnessCommands.length, 1, "Prepush should plan one deduplicated freshness command per changed active change.");
      assertEqual(output.exitCode, 1, "Failing prepush freshness command should block.");
      assert(calls.includes("Autopilot evidence freshness:node tools/autopilot-report-freshness.ts change-a --mode archive-strict"), "Prepush should execute labeled freshness gate.");
    }),
  },
  {
    name: "evidence and prepush duplicate heavy commands execute once",
    run: () => withTempRepo("prepush-dedupe", (repo) => {
      const calls: string[] = [];
      const output = runAutopilotCheck(repo, {
        level: "prepush",
        generatedAt,
        additionalCommands: [
          { id: "command:evidence-validation:npm-test", label: "Evidence validation tests", command: "npm", args: ["test"], source: "autopilot:evidence", blocking: true },
          { id: "command:evidence-validation:custom", label: "Evidence validation custom", command: "npm", args: ["run", "custom-validation"], source: "autopilot:evidence", blocking: true },
        ],
        commandRunner: (_root: string, command: AutopilotCheckCommand): AutopilotCheckCommandResult => {
          calls.push(commandKey(command));
          return { status: 0, signal: null, stdout: "ok", stderr: "" };
        },
      });

      assertEqual(output.exitCode, 0, "Deduped prepush run should pass with fake runner.");
      assertArrayEqual(calls, [
        "Repository validation:npm run validate",
        "Repository tests:npm test",
        "Evidence validation custom:npm run custom-validation",
      ], "Duplicate evidence/prepush npm test command should execute once.");
    }),
  },
  {
    name: "changed active change artifacts trigger freshness checks",
    run: () => withTempRepo("changed-freshness", (repo) => {
      writeActiveChange(repo, "change-a");
      const plan = planAutopilotChecks(repo, {
        level: "standard",
        generatedAt,
        changedFiles: ["openspec/changes/change-a/tasks.md", "openspec/changes/archive/old/tasks.md"],
      });

      assert(plan.checks.some((check) => check.id === "freshness:change-a"), "Changed active tasks.md should trigger a freshness check.");
      assert(!plan.checks.some((check) => check.id === "freshness:old"), "Archived changed artifacts should not trigger active freshness checks.");
      assert(plan.commands.some((command) => command.id === "command:evidence-collect:change-a"), "Changed active artifacts should plan standard evidence collect.");
    }),
  },
  {
    name: "output contract reports warning strictness and redacts command output",
    run: () => withTempRepo("output-contract", (repo) => {
      writeActiveChange(repo, "change-a");
      const runner = (_root: string, _command: AutopilotCheckCommand): AutopilotCheckCommandResult => ({
        status: 0,
        signal: null,
        stdout: `ok ${repo} token=secret-value`,
        stderr: "",
      });
      const permissive = runAutopilotCheck(repo, { level: "standard", change: "change-a", generatedAt, commandRunner: runner });
      const strict = runAutopilotCheck(repo, { level: "standard", change: "change-a", generatedAt, failOnWarnings: true, commandRunner: runner });
      const commandCheck = permissive.checks.find((check) => check.command?.includes("autopilot:evidence"));

      assertEqual(permissive.schemaVersion, 1, "Output schema version should be stable.");
      assertEqual(permissive.status, "warning", "Missing freshness inputs should surface warning status without strict mode.");
      assertEqual(permissive.exitCode, 0, "Warnings should not fail by default.");
      assertEqual(strict.exitCode, 1, "--fail-on-warnings should convert warnings to non-zero exit.");
      assert(commandCheck?.summary.includes("<redacted>"), "Command summary should redact token-like values.");
      assert(!commandCheck?.summary.includes(repo), "Command summary should not expose absolute temp repo path.");
    }),
  },
  {
    name: "invalid active ledger makes pre-push ledger gate fail before tests",
    run: () => withTempRepo("invalid-ledger-prepush", (repo) => {
      writeInvalidLedger(repo, "change-a");
      const calls: string[] = [];
      const output = runAutopilotCheck(repo, {
        level: "prepush",
        generatedAt,
        commandRunner: (_root: string, command: AutopilotCheckCommand): AutopilotCheckCommandResult => {
          calls.push(commandKey(command));
          return command.label === "Autopilot ledger validation" ? { status: 1, signal: null, stdout: "invalid ledger", stderr: "" } : { status: 0, signal: null, stdout: "ok", stderr: "" };
        },
      });

      assertEqual(output.exitCode, 1, "Invalid pre-push ledger gate should fail.");
      assertArrayEqual(calls, [
        "Repository validation:npm run validate",
        "Autopilot ledger validation:npm run autopilot:validate -- openspec/changes/change-a/automation/task.json",
      ], "Pre-push should short-circuit at active ledger validation before repository tests.");
    }),
  },
  {
    name: "CLI emits default JSON and blocking failure envelope",
    run: () => withTempRepo("cli-json", (repo) => {
      writeActiveChange(repo, "change-a");
      const outsidePath = path.join(os.tmpdir(), `autopilot-check-outside-${crypto.randomUUID()}.json`);
      fs.writeFileSync(outsidePath, "{}\n", "utf8");
      const passed = spawnChecker(repo, ["--level", "cheap"]);
      const passedJson = parseJsonOutput(passed.stdout);
      const failed = spawnChecker(repo, ["--level", "cheap", "--ledger", "openspec/changes/missing/automation/task.json"]);
      const failedJson = parseJsonOutput(failed.stdout);
      const outside = spawnChecker(repo, ["--level", "cheap", "--ledger", outsidePath]);
      const outsideJson = parseJsonOutput(outside.stdout);
      const invalid = spawnChecker(repo, ["--level", "expensive"]);

      assertEqual(passed.status, 0, "Cheap CLI should exit zero.");
      assertEqual(passedJson.schemaVersion, 1, "Cheap CLI should emit JSON by default.");
      assertEqual(passedJson.level, "cheap", "Cheap CLI JSON should include level.");
      assertEqual(failed.status, 1, "Blocking CLI failure should return non-zero.");
      assertEqual(failedJson.status, "failed", "Blocking CLI failure should report failed status.");
      assert(Array.isArray(failedJson.nextActions) && failedJson.nextActions.length > 0, "Blocking CLI failure should include nextActions.");
      assertEqual(outside.status, 1, "Outside scoped ledger should fail.");
      assert(!outside.stdout.includes(outsidePath), "Outside scoped ledger JSON must not echo absolute outside path.");
      assert(JSON.stringify(outsideJson).includes("<outside-repo>"), "Outside scoped ledger JSON should use a stable redacted placeholder.");
      assertEqual(invalid.status, 2, "Invalid CLI level should exit 2.");
      assert(invalid.stderr.includes("--level must be one of"), "Invalid CLI level should explain allowed values.");
      fs.rmSync(outsidePath, { force: true });
    }),
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
    console.error(`FAIL: ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} Autopilot check test(s) failed.`);
  process.exit(1);
}

console.log(`OK: Autopilot check tests=${tests.length}`);
