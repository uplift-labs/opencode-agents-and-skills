#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildPrePushValidationPlan, collectPrePushChangedFiles, exitCodeFromSpawnResult, runPrePushValidation, runPrePushValidationFromInput, type ValidationCommand, type ValidationCommandResult } from "./pre-push-validate.ts";

type TestCase = {
  name: string;
  run: () => void;
};

function newTempDir(name: string): string {
  const parent = path.join(os.tmpdir(), "agents-and-skills-prepush-tests");
  fs.mkdirSync(parent, { recursive: true });
  const dir = path.join(parent, `${name}-${crypto.randomUUID().replace(/-/g, "")}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function withTempDir(name: string, run: (root: string) => void): void {
  const root = newTempDir(name);
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${String(expected)}\nActual: ${String(actual)}`);
  }
}

function assertArrayEqual(actual: string[], expected: string[], message: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${message}\nExpected: ${expected.join(" ")}\nActual: ${actual.join(" ")}`);
  }
}

function withOpenSpecRoot(name: string, run: (root: string) => void): void {
  withTempDir(name, (root) => {
    fs.mkdirSync(path.join(root, "openspec"), { recursive: true });
    run(root);
  });
}

function validLedger(taskId: string): Record<string, unknown> {
  const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "autopilot-ledger");
  const ledger = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "valid-research.json"), "utf8")) as Record<string, unknown>;
  ledger.id = taskId;
  return ledger;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeActiveChange(root: string, changeId: string): void {
  const changeRoot = path.join(root, "openspec", "changes", changeId);
  fs.mkdirSync(changeRoot, { recursive: true });
  fs.writeFileSync(path.join(changeRoot, "tasks.md"), `# Tasks: ${changeId}\n\n- [ ] Do work.\n`, "utf8");
}

function writeLedger(root: string, changeId: string, taskId: string): void {
  writeActiveChange(root, changeId);
  writeJson(path.join(root, "openspec", "changes", changeId, "automation", "task.json"), validLedger(taskId));
}

function writeInvalidLedger(root: string, changeId: string): void {
  writeJson(path.join(root, "openspec", "changes", changeId, "automation", "task.json"), { schemaVersion: 1, id: "invalid-ledger" });
}

function commandKey(command: ValidationCommand): string {
  return `${command.label}:${command.command} ${command.args.join(" ")}`;
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function writePackageJson(root: string, scripts: Record<string, string>): void {
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ name: "prepush-fixture", private: true, type: "module", scripts }, null, 2)}\n`, "utf8");
}

const tests: TestCase[] = [
  {
    name: "pre-push plan includes repository gates without OpenSpec",
    run: () => withTempDir("no-openspec", (root) => {
      const plan = buildPrePushValidationPlan(root);
      assertEqual(plan.length, 2, "Plan without OpenSpec should include two gates.");
      assertArrayEqual(plan[0].args, ["run", "validate"], "First gate should run repository validation.");
      assertArrayEqual(plan[1].args, ["test"], "Second gate should run repository tests.");
    }),
  },
  {
    name: "pre-push plan includes OpenSpec validation when present",
    run: () => withOpenSpecRoot("with-openspec", (root) => {
      const plan = buildPrePushValidationPlan(root);
      assertEqual(plan.length, 5, "Plan with OpenSpec should include repository gates, operation gate, Autopilot ledger gate, and OpenSpec validation.");
      assertEqual(plan[1].label, "OpenSpec operation prepush gate", "Second gate should be OpenSpec operation prepush gate.");
      assertArrayEqual(plan[1].args, ["run", "openspec:gate", "--", "--operation", "prepush"], "Operation gate should use npm script wrapper.");
      assertEqual(plan[2].label, "Autopilot ledger validation", "Third gate should be Autopilot ledger validation.");
      assertEqual(plan[2].skipReason, "No active Autopilot ledgers discovered.", "No-ledger gate should be not-applicable.");
      assertEqual(plan[4].command, "npm", "Fifth gate should use package OpenSpec validation wrapper.");
      assertArrayEqual(plan[4].args, ["run", "openspec:validate"], "Fifth gate should validate all OpenSpec changes through package script.");
    }),
  },
  {
    name: "pre-push plan includes active Autopilot ledgers in deterministic order",
    run: () => withOpenSpecRoot("with-ledgers", (root) => {
      writeLedger(root, "change-b", "task-b");
      writeLedger(root, "change-a", "task-a");
      const plan = buildPrePushValidationPlan(root);
      const ledgerGate = plan.find((command) => command.label === "Autopilot ledger validation");

      assertEqual(ledgerGate?.skipReason, undefined, "Active ledger gate should not be skipped.");
      assertArrayEqual(ledgerGate?.args ?? [], [
        "run",
        "autopilot:validate",
        "--",
        "openspec/changes/change-a/automation/task.json",
        "openspec/changes/change-b/automation/task.json",
      ], "Active ledger gate should validate every active ledger in sorted order.");
      assertArrayEqual(plan.map((command) => command.label), [
        "Repository validation",
        "OpenSpec operation prepush gate",
        "Autopilot ledger validation",
        "Repository tests",
        "OpenSpec validation",
      ], "Operation and Autopilot ledger validation should run before repository tests.");
    }),
  },
  {
    name: "pre-push plan includes freshness gate for changed active artifacts",
    run: () => withOpenSpecRoot("with-freshness", (root) => {
      writeActiveChange(root, "change-a");
      const plan = buildPrePushValidationPlan(root, { changedFiles: ["openspec/changes/change-a/tasks.md"] });

      assertArrayEqual(plan.map((command) => command.label), [
        "Repository validation",
        "OpenSpec operation prepush gate",
        "Autopilot ledger validation",
        "Repository tests",
        "OpenSpec validation",
        "Autopilot evidence freshness",
      ], "Freshness gate should run after OpenSpec validation for changed active artifacts.");
      assertArrayEqual(plan[5].args, ["tools/autopilot-report-freshness.ts", "change-a", "--mode", "archive-strict"], "Freshness gate should run archive-strict report freshness for changed active change.");
    }),
  },
  {
    name: "pre-push exit code treats killed commands as failure",
    run: () => {
      assertEqual(exitCodeFromSpawnResult({ status: null, signal: "SIGTERM" }), 1, "Signal-terminated command should fail.");
      assertEqual(exitCodeFromSpawnResult({ status: 0, signal: null }), 0, "Status 0 should pass.");
      assertEqual(exitCodeFromSpawnResult({ status: 2, signal: null }), 2, "Non-zero status should propagate.");
    },
  },
  {
    name: "pre-push stdin ref updates produce changed-file scope",
    run: () => withOpenSpecRoot("stdin-ref-updates", (root) => {
      const localSha = "1111111111111111111111111111111111111111";
      const remoteSha = "2222222222222222222222222222222222222222";
      const calls: string[][] = [];
      const changedFiles = collectPrePushChangedFiles(root, `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`, (_root, args) => {
        calls.push(args);
        return { status: 0, stdout: "openspec/changes/change-a/tasks.md\r\nREADME.md\n" };
      });

      assertArrayEqual(calls[0] ?? [], ["diff", "--name-only", "--diff-filter=ACMRT", remoteSha, localSha], "Existing-branch pre-push scope should diff remote to local sha.");
      assertArrayEqual(changedFiles ?? [], ["openspec/changes/change-a/tasks.md", "README.md"], "Pre-push changed files should be normalized and sorted.");
    }),
  },
  {
    name: "pre-push stdin new branch uses local commit tree fallback",
    run: () => withOpenSpecRoot("stdin-new-branch", (root) => {
      const localSha = "3333333333333333333333333333333333333333";
      const zeroSha = "0000000000000000000000000000000000000000";
      const calls: string[][] = [];
      const changedFiles = collectPrePushChangedFiles(root, `refs/heads/topic ${localSha} refs/heads/topic ${zeroSha}\n`, (_root, args) => {
        calls.push(args);
        return { status: 0, stdout: "openspec\\changes\\change-a\\tasks.md\n" };
      });

      assertArrayEqual(calls[0] ?? [], ["diff", "--name-only", "--diff-filter=ACMRT", "4b825dc642cb6eb9a060e54bf8d69288fbee4904", localSha], "New-branch pre-push scope should compare empty tree to local commit tree.");
      assertArrayEqual(changedFiles ?? [], ["openspec/changes/change-a/tasks.md"], "Pre-push changed files should normalize Windows separators.");
    }),
  },
  {
    name: "pre-push stdin diff failure falls back to all active changes",
    run: () => withOpenSpecRoot("stdin-diff-failure", (root) => {
      writeActiveChange(root, "change-b");
      writeActiveChange(root, "change-a");
      const localSha = "3333333333333333333333333333333333333333";
      const remoteSha = "2222222222222222222222222222222222222222";
      const changedFiles = collectPrePushChangedFiles(root, `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`, () => ({ status: 128, stdout: "", error: new Error("bad revision") }));

      assertArrayEqual(changedFiles ?? [], ["openspec/changes/change-a/tasks.md", "openspec/changes/change-b/tasks.md"], "Failed git diff must conservatively scope all active OpenSpec changes.");
    }),
  },
  {
    name: "pre-push input harness feeds stdin scope into freshness gates",
    run: () => withOpenSpecRoot("stdin-harness", (root) => {
      writeActiveChange(root, "change-a");
      const localSha = "4444444444444444444444444444444444444444";
      const remoteSha = "5555555555555555555555555555555555555555";
      const calls: string[] = [];
      const exitCode = runPrePushValidationFromInput(root, `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`, {
        diffRunner: (_root, args) => {
          assertArrayEqual(args, ["diff", "--name-only", "--diff-filter=ACMRT", remoteSha, localSha], "Input harness should use stdin ref update diff args.");
          return { status: 0, stdout: "openspec/changes/change-a/tasks.md\n" };
        },
        runner: (_root: string, command: ValidationCommand): ValidationCommandResult => {
          calls.push(commandKey(command));
          return { status: 0, signal: null };
        },
        output: { log: () => undefined, error: () => undefined },
      });

      assertEqual(exitCode, 0, "Input harness should pass when all fake gates pass.");
      assertEqual(calls.includes("Autopilot evidence freshness:node tools/autopilot-report-freshness.ts change-a --mode archive-strict"), true, "Input harness should add freshness gate from stdin changed active artifact.");
    }),
  },
  {
    name: "pre-push input harness feeds new-branch stdin scope into freshness gates",
    run: () => withOpenSpecRoot("stdin-harness-new-branch", (root) => {
      writeActiveChange(root, "change-a");
      const localSha = "6666666666666666666666666666666666666666";
      const zeroSha = "0000000000000000000000000000000000000000";
      const calls: string[] = [];
      const exitCode = runPrePushValidationFromInput(root, `refs/heads/topic ${localSha} refs/heads/topic ${zeroSha}\n`, {
        diffRunner: (_root, args) => {
          assertArrayEqual(args, ["diff", "--name-only", "--diff-filter=ACMRT", "4b825dc642cb6eb9a060e54bf8d69288fbee4904", localSha], "New-branch input harness should use empty-tree diff args.");
          return { status: 0, stdout: "openspec/changes/change-a/tasks.md\n" };
        },
        runner: (_root: string, command: ValidationCommand): ValidationCommandResult => {
          calls.push(commandKey(command));
          return { status: 0, signal: null };
        },
        output: { log: () => undefined, error: () => undefined },
      });

      assertEqual(exitCode, 0, "New-branch input harness should pass when all fake gates pass.");
      assertEqual(calls.includes("Autopilot evidence freshness:node tools/autopilot-report-freshness.ts change-a --mode archive-strict"), true, "New-branch input harness should add freshness gate from stdin changed active artifact.");
    }),
  },
  {
    name: "pre-push input harness diff failure scopes all active freshness gates",
    run: () => withOpenSpecRoot("stdin-harness-diff-failure", (root) => {
      writeActiveChange(root, "change-b");
      writeActiveChange(root, "change-a");
      const localSha = "7777777777777777777777777777777777777777";
      const remoteSha = "8888888888888888888888888888888888888888";
      const calls: string[] = [];
      const exitCode = runPrePushValidationFromInput(root, `refs/heads/main ${localSha} refs/heads/main ${remoteSha}\n`, {
        diffRunner: () => ({ status: 128, stdout: "", error: new Error("bad revision") }),
        runner: (_root: string, command: ValidationCommand): ValidationCommandResult => {
          calls.push(commandKey(command));
          return { status: 0, signal: null };
        },
        output: { log: () => undefined, error: () => undefined },
      });

      assertEqual(exitCode, 0, "Diff-failure input harness should pass when all fake gates pass.");
      assertArrayEqual(calls.slice(-2), [
        "Autopilot evidence freshness:node tools/autopilot-report-freshness.ts change-a --mode archive-strict",
        "Autopilot evidence freshness:node tools/autopilot-report-freshness.ts change-b --mode archive-strict",
      ], "Diff-failure input harness should conservatively run freshness for every active change in sorted order.");
    }),
  },
  {
    name: "pre-push fake runner executes gates in deterministic order",
    run: () => withOpenSpecRoot("runner-order", (root) => {
      const calls: string[] = [];
      const exitCode = runPrePushValidation(root, {
        runner: (_root: string, command: ValidationCommand): ValidationCommandResult => {
          calls.push(commandKey(command));
          return { status: 0, signal: null };
        },
        output: { log: () => undefined, error: () => undefined },
      });

      assertEqual(exitCode, 0, "Successful fake runner should return zero.");
      assertArrayEqual(calls, [
        "Repository validation:npm run validate",
        "OpenSpec operation prepush gate:npm run openspec:gate -- --operation prepush",
        "Repository tests:npm test",
        "OpenSpec validation:npm run openspec:validate",
      ], "Fake runner should execute gates in deterministic order.");
    }),
  },
  {
    name: "pre-push fake runner reports no active ledgers as not-applicable",
    run: () => withOpenSpecRoot("runner-no-ledgers", (root) => {
      const logs: string[] = [];
      const exitCode = runPrePushValidation(root, {
        runner: () => ({ status: 0, signal: null }),
        output: { log: (message: string) => logs.push(message), error: () => undefined },
      });

      assertEqual(exitCode, 0, "No active Autopilot ledgers should not fail pre-push.");
      assertEqual(logs.some((message) => message.includes("Autopilot ledger validation") && message.includes("not-applicable")), true, "Pre-push output should report no-ledger Autopilot gate as not-applicable.");
    }),
  },
  {
    name: "pre-push fake runner short-circuits on invalid active ledger validation",
    run: () => withOpenSpecRoot("runner-invalid-ledger", (root) => {
      writeInvalidLedger(root, "change-a");
      const calls: string[] = [];
      const exitCode = runPrePushValidation(root, {
        runner: (_root: string, command: ValidationCommand): ValidationCommandResult => {
          calls.push(commandKey(command));
          return command.label === "Autopilot ledger validation" ? { status: 9, signal: null } : { status: 0, signal: null };
        },
        output: { log: () => undefined, error: () => undefined },
      });

      assertEqual(exitCode, 9, "Autopilot ledger validation failure should propagate.");
      assertArrayEqual(calls, [
        "Repository validation:npm run validate",
        "OpenSpec operation prepush gate:npm run openspec:gate -- --operation prepush",
        "Autopilot ledger validation:npm run autopilot:validate -- openspec/changes/change-a/automation/task.json",
      ], "Invalid active ledger should stop pre-push before repository tests and OpenSpec validation.");
    }),
  },
  {
    name: "pre-push fake runner short-circuits on operation gate failure",
    run: () => withOpenSpecRoot("runner-operation-gate-fails", (root) => {
      writeLedger(root, "change-a", "task-a");
      const calls: string[] = [];
      const exitCode = runPrePushValidation(root, {
        runner: (_root: string, command: ValidationCommand): ValidationCommandResult => {
          calls.push(commandKey(command));
          return command.label === "OpenSpec operation prepush gate" ? { status: 6, signal: null } : { status: 0, signal: null };
        },
        output: { log: () => undefined, error: () => undefined },
      });

      assertEqual(exitCode, 6, "Operation gate failure should propagate.");
      assertArrayEqual(calls, [
        "Repository validation:npm run validate",
        "OpenSpec operation prepush gate:npm run openspec:gate -- --operation prepush",
      ], "Operation gate failure should stop before Autopilot ledger validation and repository tests.");
    }),
  },
  {
    name: "pre-push fake runner short-circuits on freshness failure",
    run: () => withOpenSpecRoot("runner-freshness-fails", (root) => {
      writeActiveChange(root, "change-a");
      const calls: string[] = [];
      const exitCode = runPrePushValidation(root, {
        changedFiles: ["openspec/changes/change-a/live-regression-report.md"],
        runner: (_root: string, command: ValidationCommand): ValidationCommandResult => {
          calls.push(commandKey(command));
          return command.label === "Autopilot evidence freshness" ? { status: 5, signal: null } : { status: 0, signal: null };
        },
        output: { log: () => undefined, error: () => undefined },
      });

      assertEqual(exitCode, 5, "Freshness gate failure should propagate.");
      assertArrayEqual(calls, [
        "Repository validation:npm run validate",
        "OpenSpec operation prepush gate:npm run openspec:gate -- --operation prepush",
        "Repository tests:npm test",
        "OpenSpec validation:npm run openspec:validate",
        "Autopilot evidence freshness:node tools/autopilot-report-freshness.ts change-a --mode archive-strict",
      ], "Freshness failure should stop after the labeled freshness gate.");
    }),
  },
  {
    name: "pre-push real runner propagates invalid Autopilot ledger validation",
    run: () => withOpenSpecRoot("runner-real-invalid-ledger", (root) => {
      writeInvalidLedger(root, "change-a");
      writePackageJson(root, {
        validate: "node -e \"process.exit(0)\"",
        "openspec:gate": "node -e \"process.exit(0)\" --",
        "autopilot:validate": `node ${normalizePath(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "tools", "autopilot-ledger.ts"))}`,
        test: "node -e \"process.exit(99)\"",
      });
      const errors: string[] = [];
      const logs: string[] = [];
      const exitCode = runPrePushValidation(root, { output: { log: (message: string) => logs.push(message), error: (message: string) => errors.push(message) } });

      assertEqual(exitCode, 1, "Real invalid Autopilot ledger validation command should fail with validator exit code.");
      assertEqual(logs.some((message) => message.includes("Autopilot ledger validation") && message.includes("npm run autopilot:validate")), true, "Real run should invoke npm autopilot:validate gate.");
      assertEqual(logs.some((message) => message.includes("Repository tests")), false, "Real invalid ledger run should stop before repository tests.");
      assertEqual(errors.includes("Pre-push validation failed at Autopilot ledger validation."), true, "Real run should name the failed Autopilot ledger gate.");
    }),
  },
  {
    name: "pre-push fake runner short-circuits after first failure",
    run: () => withOpenSpecRoot("runner-short-circuit", (root) => {
      const calls: string[] = [];
      const exitCode = runPrePushValidation(root, {
        runner: (_root: string, command: ValidationCommand): ValidationCommandResult => {
          calls.push(commandKey(command));
          return { status: 7, signal: null };
        },
        output: { log: () => undefined, error: () => undefined },
      });

      assertEqual(exitCode, 7, "First command failure code should propagate.");
      assertArrayEqual(calls, ["Repository validation:npm run validate"], "Runner must not execute later gates after first failure.");
    }),
  },
  {
    name: "pre-push fake runner propagates OpenSpec validation failure",
    run: () => withOpenSpecRoot("runner-openspec-fails", (root) => {
      const calls: string[] = [];
      const errors: string[] = [];
      const exitCode = runPrePushValidation(root, {
        runner: (_root: string, command: ValidationCommand): ValidationCommandResult => {
          calls.push(commandKey(command));
          return command.label === "OpenSpec validation" ? { status: 42, signal: null } : { status: 0, signal: null };
        },
        output: { log: () => undefined, error: (message: string) => errors.push(message) },
      });

      assertEqual(exitCode, 42, "OpenSpec failure code should propagate.");
      assertArrayEqual(calls, [
        "Repository validation:npm run validate",
        "OpenSpec operation prepush gate:npm run openspec:gate -- --operation prepush",
        "Repository tests:npm test",
        "OpenSpec validation:npm run openspec:validate",
      ], "OpenSpec failure should occur after earlier gates pass.");
      assertEqual(errors.includes("Pre-push validation failed at OpenSpec validation."), true, "Failure output should name OpenSpec validation gate.");
    }),
  },
  {
    name: "pre-push fake runner reports missing OpenSpec CLI as startup failure",
    run: () => withOpenSpecRoot("runner-missing-openspec", (root) => {
      const errors: string[] = [];
      const exitCode = runPrePushValidation(root, {
        runner: (_root: string, command: ValidationCommand): ValidationCommandResult => {
          if (command.label === "OpenSpec validation") {
            return { status: null, signal: null, error: new Error("spawn openspec ENOENT") };
          }
          return { status: 0, signal: null };
        },
        output: { log: () => undefined, error: (message: string) => errors.push(message) },
      });

      assertEqual(exitCode, 1, "Missing OpenSpec CLI should return startup failure code 1.");
      assertEqual(errors.includes("Failed to start OpenSpec validation: spawn openspec ENOENT"), true, "Missing CLI output should name the failed OpenSpec command startup.");
      assertEqual(errors.includes("Pre-push validation failed at OpenSpec validation."), true, "Missing CLI output should name the failed gate.");
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
  console.error(`${failed} pre-push validation test(s) failed.`);
  process.exit(1);
}

console.log(`OK: pre-push validation tests=${tests.length}`);
