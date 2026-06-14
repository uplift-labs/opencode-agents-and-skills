#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOpenSpecOperationGate } from "./openspec-operation-gate.ts";

type TestCase = { name: string; run: () => void };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gate = path.join(root, "tools", "openspec-operation-gate.ts");
const generatedAt = "2026-06-12T00:00:00.000Z";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = path.join(os.tmpdir(), `openspec-operation-gate-${name}-${crypto.randomUUID().replace(/-/g, "")}`);
  fs.mkdirSync(repo, { recursive: true });
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function writeText(filePath: string, text: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text.replace(/\r\n/g, "\n"), "utf8");
}

function writeChange(repo: string, changeId: string, tasks = "- [ ] Do work."): void {
  const changeRoot = path.join(repo, "openspec", "changes", changeId);
  writeText(path.join(changeRoot, "proposal.md"), `# Proposal\n\n## Why\n\nNeed change.\n`);
  writeText(path.join(changeRoot, "tasks.md"), `# Tasks\n\n${tasks}\n`);
  writeText(path.join(changeRoot, "specs", "demo", "spec.md"), `# Demo Spec\n\n## ADDED Requirements\n\n### Requirement: Demo\n\n#### Scenario: Works\n\n- **WHEN** work runs\n- **THEN** result is visible\n`);
}

function writeInvalidLedger(repo: string, changeId: string): void {
  writeText(path.join(repo, "openspec", "changes", changeId, "automation", "task.json"), JSON.stringify({ schemaVersion: 1, id: "invalid" }, null, 2));
}

function spawnGate(repo: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("node", [gate, "--root", repo, ...args], { cwd: root, encoding: "utf8", shell: false });
  if (result.error) {
    throw result.error;
  }
  return { status: result.status ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

const tests: TestCase[] = [
  {
    name: "prepush with no openspec is not-applicable and stable JSON",
    run: () => withTempRepo("prepush-empty", (repo) => {
      const output = runOpenSpecOperationGate(repo, { operation: "prepush", generatedAt });
      assert(output.schemaVersion === 1, "Gate output must use schemaVersion=1.");
      assert(output.operation === "prepush", "Gate output should echo operation.");
      assert(output.status === "passed" && output.exitCode === 0, `Expected passed prepush empty gate, got ${output.status}.`);
      assert(output.checks.some((check) => check.status === "not-applicable"), "Empty prepush should include a not-applicable check.");
      assertEqual(output.checks.map((check) => check.id), [...output.checks.map((check) => check.id)].sort(), "Checks should be deterministically sorted by id.");
    }),
  },
  {
    name: "apply gate passes ready change and warning for all checked tasks",
    run: () => withTempRepo("apply-ready", (repo) => {
      writeChange(repo, "change-a");
      const passed = runOpenSpecOperationGate(repo, { operation: "apply", changeId: "change-a", generatedAt });
      assert(passed.status === "passed" && passed.exitCode === 0, `Expected apply pass, got ${passed.status}.`);
      writeChange(repo, "done-change", "- [x] Done.");
      const warning = runOpenSpecOperationGate(repo, { operation: "task-update", changeId: "done-change", generatedAt });
      assert(warning.status === "warning" && warning.exitCode === 0, `Expected task-update warning, got ${warning.status}.`);
      assert(warning.checks.some((check) => check.summary.includes("all checked")), "All-checked warning should explain stale-active risk.");
    }),
  },
  {
    name: "archive gate blocks missing change and unsafe change id",
    run: () => withTempRepo("archive-blocked", (repo) => {
      const missing = runOpenSpecOperationGate(repo, { operation: "archive", generatedAt });
      const unsafe = runOpenSpecOperationGate(repo, { operation: "archive", changeId: "../escape", generatedAt });
      assert(missing.status === "blocked" && missing.exitCode === 1, "Archive without change should block.");
      assert(unsafe.status === "blocked" && unsafe.exitCode === 1, "Unsafe change id should block.");
      assert(unsafe.checks.some((check) => check.id === "scope:change:safe-id"), "Unsafe change id should produce safe-id check.");
    }),
  },
  {
    name: "ledger-materialize gate fails invalid ledger and unknown operation reports unknown",
    run: () => withTempRepo("failed-unknown", (repo) => {
      writeChange(repo, "change-a");
      writeInvalidLedger(repo, "change-a");
      const failed = runOpenSpecOperationGate(repo, { operation: "ledger-materialize", changeId: "change-a", generatedAt });
      const unknown = runOpenSpecOperationGate(repo, { operation: "unsupported" as never, changeId: "change-a", generatedAt });
      assert(failed.status === "failed" && failed.exitCode === 1, `Expected invalid ledger failure, got ${failed.status}.`);
      assert(failed.checks.some((check) => check.id === "ledger:validation" && check.status === "failed"), "Invalid ledger should produce failed ledger validation check.");
      assert(unknown.status === "unknown" && unknown.exitCode === 1, `Expected unknown operation, got ${unknown.status}.`);
    }),
  },
  {
    name: "persist writes JSON report under operation-gates only when requested",
    run: () => withTempRepo("persist", (repo) => {
      writeChange(repo, "change-a");
      const noPersist = runOpenSpecOperationGate(repo, { operation: "apply", changeId: "change-a", generatedAt });
      const reportPath = path.join(repo, "openspec", "changes", "change-a", "automation", "operation-gates", "apply.json");
      assert(!fs.existsSync(reportPath), "Gate should not persist report by default.");
      const persisted = runOpenSpecOperationGate(repo, { operation: "apply", changeId: "change-a", generatedAt, persist: true });
      assert(persisted.persistedPath === "openspec/changes/change-a/automation/operation-gates/apply.json", `Unexpected persisted path ${String(persisted.persistedPath)}.`);
      assert(fs.existsSync(reportPath), "Persisted gate report should exist under operation-gates.");
      const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8")) as Record<string, unknown>;
      assert(parsed.operation === "apply" && parsed.changeId === "change-a", "Persisted report should be the gate JSON envelope.");
      assert(noPersist.persistedPath == null, "Non-persisted output should not claim a persisted path.");
    }),
  },
  {
    name: "persist refuses unknown operation filenames",
    run: () => withTempRepo("persist-unknown", (repo) => {
      writeChange(repo, "change-a");
      const output = runOpenSpecOperationGate(repo, { operation: "../escape" as never, changeId: "change-a", generatedAt, persist: true });
      assert(output.status === "unknown", `Expected unknown operation, got ${output.status}.`);
      assert(output.persistedPath == null, "Unknown operations must not produce persistedPath.");
      assert(!fs.existsSync(path.join(repo, "openspec", "changes", "change-a", "automation", "escape.json")), "Unknown operation must not write escaped report path.");
    }),
  },
  {
    name: "CLI emits JSON and redacts absolute root path",
    run: () => withTempRepo("cli", (repo) => {
      writeChange(repo, "change-a");
      const result = spawnGate(repo, ["--operation", "apply", "--change", "change-a"]);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      assert(result.status === 0, `Expected CLI pass, stderr=${result.stderr}.`);
      assert(parsed.operation === "apply", "CLI JSON should include operation.");
      assert(!result.stdout.includes(repo), "CLI output should not expose absolute temp repo path.");
    }),
  },
  {
    name: "CLI reports blocked and failed operation gates",
    run: () => withTempRepo("cli-negative", (repo) => {
      writeChange(repo, "change-a");
      writeInvalidLedger(repo, "change-a");
      const blocked = spawnGate(repo, ["--operation", "archive"]);
      const blockedParsed = JSON.parse(blocked.stdout) as Record<string, unknown>;
      assert(blocked.status === 1, `Blocked archive CLI should exit 1, stderr=${blocked.stderr}.`);
      assert(blockedParsed.status === "blocked", `Expected blocked status, got ${String(blockedParsed.status)}.`);

      const failed = spawnGate(repo, ["--operation", "ledger-materialize", "--change", "change-a"]);
      const failedParsed = JSON.parse(failed.stdout) as Record<string, unknown>;
      assert(failed.status === 1, `Invalid ledger CLI should exit 1, stderr=${failed.stderr}.`);
      assert(failedParsed.status === "failed", `Expected failed status, got ${String(failedParsed.status)}.`);
    }),
  },
];

let failed = 0;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${test.name}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (failed > 0) {
  throw new Error(`${failed} operation gate test(s) failed.`);
}
console.log(`OK: OpenSpec operation gate tests=${tests.length}`);
