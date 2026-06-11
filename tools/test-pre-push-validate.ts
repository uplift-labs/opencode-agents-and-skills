#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { buildPrePushValidationPlan, exitCodeFromSpawnResult } from "./pre-push-validate.ts";

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

const tests: TestCase[] = [
  {
    name: "pre-push plan includes repository gates without OpenSpec",
    run: () => {
      const root = newTempDir("no-openspec");
      const plan = buildPrePushValidationPlan(root);
      assertEqual(plan.length, 2, "Plan without OpenSpec should include two gates.");
      assertArrayEqual(plan[0].args, ["run", "validate"], "First gate should run repository validation.");
      assertArrayEqual(plan[1].args, ["test"], "Second gate should run repository tests.");
    },
  },
  {
    name: "pre-push plan includes OpenSpec validation when present",
    run: () => {
      const root = newTempDir("with-openspec");
      fs.mkdirSync(path.join(root, "openspec"), { recursive: true });
      const plan = buildPrePushValidationPlan(root);
      assertEqual(plan.length, 3, "Plan with OpenSpec should include three gates.");
      assertEqual(plan[2].command, "openspec", "Third gate should use OpenSpec CLI.");
      assertArrayEqual(plan[2].args, ["validate", "--all"], "Third gate should validate all OpenSpec changes.");
    },
  },
  {
    name: "pre-push exit code treats killed commands as failure",
    run: () => {
      assertEqual(exitCodeFromSpawnResult({ status: null, signal: "SIGTERM" }), 1, "Signal-terminated command should fail.");
      assertEqual(exitCodeFromSpawnResult({ status: 0, signal: null }), 0, "Status 0 should pass.");
      assertEqual(exitCodeFromSpawnResult({ status: 2, signal: null }), 2, "Non-zero status should propagate.");
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
    console.error(`FAIL: ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} pre-push validation test(s) failed.`);
  process.exit(1);
}

console.log(`OK: pre-push validation tests=${tests.length}`);
