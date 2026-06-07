#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ProcessResult = {
  exitCode: number;
  output: string;
};

type TestCase = {
  name: string;
  run: () => void;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codeQualityInventory = path.join(root, "tools", "code-quality-inventory.ts");

function newTempDir(name: string): string {
  const parent = path.join(os.tmpdir(), "agents-and-skills-tests");
  fs.mkdirSync(parent, { recursive: true });
  const dir = path.join(parent, `${name}-${crypto.randomUUID().replace(/-/g, "")}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function lines(values: string[]): string {
  return values.join("\n");
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.replace(/\n/g, os.EOL), "utf8");
}

function invokeCodeQualityInventory(args: string[]): ProcessResult {
  const result = spawnSync("node", [codeQualityInventory, ...args], {
    cwd: root,
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

const tests: TestCase[] = [
  {
    name: "reports attention-band code files",
    run: () => {
      const fixture = newTempDir("quality-inventory");
      writeText(path.join(fixture, "src", "small.ts"), lines(["export const ok = 1;", ""]));
      writeText(path.join(fixture, "src", "large.ts"), lines([
        "export function large() {",
        "  return [",
        "    1,",
        "    2,",
        "  ];",
        "}",
        "",
      ]));
      writeText(path.join(fixture, "node_modules", "ignored.ts"), lines([
        "export const ignored = [",
        "  1,",
        "  2,",
        "  3,",
        "];",
        "",
      ]));

      const result = invokeCodeQualityInventory(["--root", fixture, "--attention-lines", "5", "--split-lines", "10", "--format", "json"]);
      assertSuccess(result, "Attention-band inventory should be informational.");
      assertOutputContains(result, '"status": "attention"', "Inventory should mark attention-band files.");
      assertOutputContains(result, '"path": "src/large.ts"', "Inventory should report source files in the attention band.");
      assertOutputContains(result, '"band": "attention"', "Inventory should name the attention band explicitly.");
      assertOutputExcludes(result, "ignored.ts", "Inventory should skip files inside ignored dependency directories.");
    },
  },
  {
    name: "can fail on split-candidate code files",
    run: () => {
      const fixture = newTempDir("quality-inventory-fail");
      writeText(path.join(fixture, "src", "large.ts"), lines([
        "export function large() {",
        "  return 1;",
        "}",
        "",
      ]));

      const result = invokeCodeQualityInventory(["--root", fixture, "--attention-lines", "2", "--split-lines", "2", "--fail-on-split-candidates"]);
      assertFailure(result, "Fail flag should reject split-candidate code files.");
      assertOutputContains(result, "src/large.ts", "Failing inventory should name the split-candidate file.");
    },
  },
  {
    name: "redacts absolute root path by default",
    run: () => {
      const fixture = newTempDir("quality-inventory-redaction");
      writeText(path.join(fixture, "src", "small.ts"), lines(["export const ok = 1;", ""]));

      const result = invokeCodeQualityInventory(["--root", fixture, "--format", "json"]);
      assertSuccess(result, "Inventory should succeed with default privacy-safe output.");
      assertOutputContains(result, '"root": "<redacted>"', "Inventory should redact absolute root by default.");
      assertOutputExcludes(result, fixture, "Inventory should not print the absolute root path by default.");
    },
  },
  {
    name: "redacts invalid root diagnostics by default",
    run: () => {
      const missingRoot = path.join(newTempDir("quality-inventory-missing-parent"), "missing-root");

      const result = invokeCodeQualityInventory(["--root", missingRoot, "--format", "json"]);
      assertFailure(result, "Inventory should fail for a missing root.");
      assertOutputContains(result, "Root is not a directory: <redacted>", "Inventory should redact missing root diagnostics by default.");
      assertOutputExcludes(result, missingRoot, "Inventory should not print the missing absolute root by default.");
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS: code-quality inventory ${test.name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL: code-quality inventory ${test.name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  throw new Error(`${failed} code-quality inventory test(s) failed.`);
}

console.log(`OK: code-quality inventory tests=${tests.length}`);
