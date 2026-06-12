#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { buildPrePushValidationPlan, exitCodeFromSpawnResult, runPrePushValidation, type ValidationCommand, type ValidationCommandResult } from "./pre-push-validate.ts";

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

function commandKey(command: ValidationCommand): string {
  return `${command.label}:${command.command} ${command.args.join(" ")}`;
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
      assertEqual(plan.length, 3, "Plan with OpenSpec should include three gates.");
      assertEqual(plan[2].command, "openspec", "Third gate should use OpenSpec CLI.");
      assertArrayEqual(plan[2].args, ["validate", "--all"], "Third gate should validate all OpenSpec changes.");
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
        "Repository tests:npm test",
        "OpenSpec validation:openspec validate --all",
      ], "Fake runner should execute gates in deterministic order.");
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
        "Repository tests:npm test",
        "OpenSpec validation:openspec validate --all",
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
