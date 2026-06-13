#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyAutopilotLedgerTransition } from "./autopilot-ledger-transition-writer.ts";
import { validateTaskLedger } from "./autopilot-ledger.ts";
import type { AutopilotParsedWorkerReport } from "./autopilot-worker-report-parser.ts";
import type { AutopilotRunRecord } from "./autopilot-runtime-store.ts";

type TestCase = {
  name: string;
  run: () => void;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `autopilot-ledger-writer-${name}-`));
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function trySymlinkDirectory(target: string, linkPath: string): boolean {
  try {
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`SKIP: directory symlink/junction unavailable (${message})`);
    return false;
  }
}

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8")) as Record<string, unknown>;
}

function readyLedger(): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = "task-a";
  ledger.status = "Ready";
  ledger.history = [];
  ledger.mr = { required: true, status: "none" };
  ledger.revision = {
    number: 1,
    contentHash: "hash-1",
    updatedBy: "test",
    updatedAt: "2026-06-13T00:00:00.000Z",
  };
  return ledger;
}

function blockedLedger(): Record<string, unknown> {
  const ledger = readyLedger();
  ledger.status = "Blocked";
  ledger.blockers = [{ reason: "waiting for owner", questionId: "q-1" }];
  ledger.history = [
    {
      from: "Ready",
      to: "Analyze",
      at: "2026-06-13T00:00:30.000Z",
      by: "plugin",
      source: "autopilot_run_next",
      evidence: { reason: "Ready task selected for analysis." },
    },
    {
      from: "Analyze",
      to: "Blocked",
      at: "2026-06-13T00:00:45.000Z",
      by: "plugin",
      source: "autopilot_collect",
      evidence: { blockerReason: "waiting for owner" },
    },
  ];
  return ledger;
}

function writeLedger(repo: string, ledger: Record<string, unknown> = readyLedger()): string {
  const relativePath = "openspec/changes/change-a/automation/task.json";
  const filePath = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return relativePath;
}

function readLedger(repo: string, relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(repo, relativePath), "utf8")) as Record<string, unknown>;
}

function runRecord(overrides: Partial<AutopilotRunRecord> = {}): AutopilotRunRecord {
  return {
    runId: "run-1",
    status: "running",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:01.000Z",
    taskId: "task-a",
    ledgerPath: "openspec/changes/change-a/automation/task.json",
    fromStatus: "Ready",
    expectedToStatus: "Analyze",
    expectedReportId: "report-1",
    workerId: "worker-1",
    workerSessionId: "session-1",
    ledgerRevision: { number: 1, contentHash: "hash-1" },
    scope: { read: ["openspec/changes/change-a"], write: ["openspec/changes/change-a/**"], forbidden: [".autopilot/**"] },
    ...overrides,
  };
}

function report(overrides: Partial<AutopilotParsedWorkerReport> = {}): AutopilotParsedWorkerReport {
  return {
    schemaVersion: 1,
    reportId: "report-1",
    runId: "run-1",
    workerId: "worker-1",
    sessionId: "session-1",
    taskId: "task-a",
    ledgerPath: "openspec/changes/change-a/automation/task.json",
    fromStatus: "Ready",
    toStatus: "Analyze",
    changedFiles: [],
    validation: [],
    testDecision: "not-applicable",
    secretScan: { status: "not-applicable" },
    evidence: { reason: "Ready task claimed for analysis." },
    blockers: [],
    mr: { status: "none" },
    ...overrides,
  };
}

const tests: TestCase[] = [
  {
    name: "applies valid report transition and post-write validates ledger",
    run: () => withTempRepo("valid", (repo) => {
      const relativePath = writeLedger(repo);
      const result = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath }), report: report({ ledgerPath: relativePath }), now: "2026-06-13T00:01:00.000Z" });
      assert(result.ok && result.action === "applied", `Expected applied transition, got ${JSON.stringify(result)}.`);
      assert(result.taskId === "task-a" && result.reportId === "report-1", "Applied result must include task and report evidence.");
      assert(result.from === "Ready" && result.to === "Analyze", "Applied result must include transition evidence.");
      assert(result.postWriteValidation.valid, `Post-write validation must pass, got ${result.postWriteValidation.errors.join("; ")}.`);
      const written = readLedger(repo, relativePath);
      assert(written.status === "Analyze", "Writer must update ledger status.");
      assert((written.history as unknown[]).length === 1, "Writer must append one history entry.");
      const history = (written.history as Array<Record<string, unknown>>)[0];
      assert(history.from === "Ready" && history.to === "Analyze" && history.source === "autopilot_collect", "History entry must record transition source.");
      const evidence = history.evidence as Record<string, unknown>;
      assert(evidence.workerReportId === "report-1" && evidence.workerId === "worker-1", "History evidence must include worker report identity.");
      const revision = written.revision as Record<string, unknown>;
      assert(revision.number === 2 && typeof revision.contentHash === "string" && revision.contentHash !== "hash-1", "Writer must increment revision and update content hash.");
      assert(result.revision?.number === revision.number && result.revision.contentHash === revision.contentHash, "Applied result revision must match written ledger revision.");
      assert(validateTaskLedger(written).valid, "Written ledger must validate through shared validator.");
    }),
  },
  {
    name: "rejects stale revision without writing",
    run: () => withTempRepo("stale", (repo) => {
      const relativePath = writeLedger(repo);
      const before = fs.readFileSync(path.join(repo, relativePath), "utf8");
      const result = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath, ledgerRevision: { number: 99, contentHash: "hash-1" } }), report: report({ ledgerPath: relativePath }) });
      assert(!result.ok && result.reasonCode === "stale_revision", `Expected stale_revision, got ${JSON.stringify(result)}.`);
      assert(fs.readFileSync(path.join(repo, relativePath), "utf8") === before, "Stale revision rejection must preserve original ledger bytes.");

      const staleHash = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath, ledgerRevision: { number: 1, contentHash: "other-hash" } }), report: report({ ledgerPath: relativePath }) });
      assert(!staleHash.ok && staleHash.reasonCode === "stale_revision", `Expected stale content hash rejection, got ${JSON.stringify(staleHash)}.`);
      assert(fs.readFileSync(path.join(repo, relativePath), "utf8") === before, "Stale content hash rejection must preserve original ledger bytes.");
    }),
  },
  {
    name: "rejects unsafe ledger paths before reading or writing",
    run: () => withTempRepo("unsafe-path", (repo) => {
      const cases = [
        path.join(repo, "openspec", "changes", "change-a", "automation", "task.json"),
        "../outside/automation/task.json",
        "tmp/automation/task.json",
        "openspec/changes/archive/2026-06-13-change-a/automation/task.json",
        "openspec/changes/change-a/automation/feedback/report.json",
      ];
      for (const ledgerPath of cases) {
        const result = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath }), report: report({ ledgerPath }) });
        assert(!result.ok && result.reasonCode === "unsafe_path", `Expected unsafe_path for ${ledgerPath}, got ${JSON.stringify(result)}.`);
      }
      assert(!fs.existsSync(path.join(repo, "tmp")), "Unsafe non-OpenSpec path must not be created.");
    }),
  },
  {
    name: "rejects symlinked automation path before writing",
    run: () => withTempRepo("symlink", (repo) => {
      const targetDir = path.join(repo, "outside-target");
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "task.json"), `${JSON.stringify(readyLedger(), null, 2)}\n`, "utf8");
      const before = fs.readFileSync(path.join(targetDir, "task.json"), "utf8");
      const automationDir = path.join(repo, "openspec", "changes", "change-a", "automation");
      if (!trySymlinkDirectory(targetDir, automationDir)) {
        return;
      }
      const relativePath = "openspec/changes/change-a/automation/task.json";
      const result = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath }), report: report({ ledgerPath: relativePath }) });
      assert(!result.ok && result.reasonCode === "unsafe_path", `Expected unsafe_path for symlinked automation, got ${JSON.stringify(result)}.`);
      assert(fs.readFileSync(path.join(targetDir, "task.json"), "utf8") === before, "Symlinked automation target must not be modified.");
    }),
  },
  {
    name: "rolls back invalid next ledger",
    run: () => withTempRepo("invalid-next", (repo) => {
      const relativePath = writeLedger(repo);
      const before = fs.readFileSync(path.join(repo, relativePath), "utf8");
      const result = applyAutopilotLedgerTransition({
        root: repo,
        run: runRecord({ ledgerPath: relativePath, expectedToStatus: "Review" }),
        report: report({ ledgerPath: relativePath, toStatus: "Review" }),
      });
      assert(!result.ok && result.reasonCode === "next_ledger_invalid", `Expected next_ledger_invalid, got ${JSON.stringify(result)}.`);
      assert(result.errors.some((error) => error.includes("Ready -> Review")), "Invalid next-ledger error must include transition evidence.");
      assert(fs.readFileSync(path.join(repo, relativePath), "utf8") === before, "Invalid next-ledger rejection must preserve original ledger bytes.");
      assert(!fs.readdirSync(path.dirname(path.join(repo, relativePath))).some((entry) => entry.endsWith(".tmp")), "Invalid next-ledger rejection must not leave temp files.");
    }),
  },
  {
    name: "rejects wrong current ledger id without writing",
    run: () => withTempRepo("wrong-id", (repo) => {
      const ledger = readyLedger();
      ledger.id = "other-task";
      const relativePath = writeLedger(repo, ledger);
      const before = fs.readFileSync(path.join(repo, relativePath), "utf8");
      const result = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath }), report: report({ ledgerPath: relativePath }) });
      assert(!result.ok && result.reasonCode === "mismatched_evidence", `Expected mismatched_evidence, got ${JSON.stringify(result)}.`);
      assert(result.errors.some((error) => error.includes("ledger id")), "Wrong ledger id error must name ledger id.");
      assert(fs.readFileSync(path.join(repo, relativePath), "utf8") === before, "Wrong ledger id rejection must preserve original ledger bytes.");
    }),
  },
  {
    name: "rejects stale current status without writing",
    run: () => withTempRepo("stale-status", (repo) => {
      const ledger = readyLedger();
      ledger.status = "Analyze";
      ledger.history = [{ from: "Ready", to: "Analyze", at: "2026-06-13T00:00:30.000Z", by: "plugin", source: "autopilot_run_next", evidence: { reason: "Already advanced." } }];
      const relativePath = writeLedger(repo, ledger);
      const before = fs.readFileSync(path.join(repo, relativePath), "utf8");
      const result = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath, expectedReportId: "report-2" }), report: report({ ledgerPath: relativePath, reportId: "report-2" }) });
      assert(!result.ok && result.reasonCode === "stale_revision", `Expected stale_revision, got ${JSON.stringify(result)}.`);
      assert(result.errors.some((error) => error.includes("ledger status")), "Stale status error must name ledger status.");
      assert(fs.readFileSync(path.join(repo, relativePath), "utf8") === before, "Stale status rejection must preserve original ledger bytes.");
    }),
  },
  {
    name: "rejects invalid current ledger without writing",
    run: () => withTempRepo("invalid-current", (repo) => {
      const ledger = readyLedger();
      delete ledger.taskType;
      const relativePath = writeLedger(repo, ledger);
      const before = fs.readFileSync(path.join(repo, relativePath), "utf8");
      const result = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath }), report: report({ ledgerPath: relativePath }) });
      assert(!result.ok && result.reasonCode === "current_ledger_invalid", `Expected current_ledger_invalid, got ${JSON.stringify(result)}.`);
      assert(result.errors.some((error) => error.includes("taskType")), "Invalid current ledger error must include validation details.");
      assert(fs.readFileSync(path.join(repo, relativePath), "utf8") === before, "Invalid current ledger rejection must preserve original ledger bytes.");
    }),
  },
  {
    name: "clears stale blockers when report has no active blockers",
    run: () => withTempRepo("clear-blockers", (repo) => {
      const relativePath = writeLedger(repo, blockedLedger());
      const result = applyAutopilotLedgerTransition({
        root: repo,
        run: runRecord({ ledgerPath: relativePath, fromStatus: "Blocked", expectedToStatus: "Analyze" }),
        report: report({ ledgerPath: relativePath, fromStatus: "Blocked", toStatus: "Analyze", evidence: { reason: "Owner unblocked analysis." } }),
        now: "2026-06-13T00:01:00.000Z",
      });
      assert(result.ok && result.action === "applied", `Expected blocked resolution to apply, got ${JSON.stringify(result)}.`);
      const written = readLedger(repo, relativePath);
      assert(written.status === "Analyze", "Blocked resolution must update status.");
      assert(Array.isArray(written.blockers) && written.blockers.length === 0, "Blocked resolution with empty report blockers must clear active ledger blockers.");
      assert(validateTaskLedger(written).valid, "Blocked resolution ledger must validate.");
    }),
  },
  {
    name: "treats duplicate report id as idempotent without appending history",
    run: () => withTempRepo("duplicate", (repo) => {
      const relativePath = writeLedger(repo);
      const first = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath }), report: report({ ledgerPath: relativePath }), now: "2026-06-13T00:01:00.000Z" });
      const afterFirstBytes = fs.readFileSync(path.join(repo, relativePath), "utf8");
      const second = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath }), report: report({ ledgerPath: relativePath }), now: "2026-06-13T00:02:00.000Z" });
      const written = readLedger(repo, relativePath);
      assert(first.ok && first.action === "applied", "First report must apply.");
      assert(second.ok && second.action === "already_applied", `Expected already_applied duplicate, got ${JSON.stringify(second)}.`);
      assert((written.history as unknown[]).length === 1, "Duplicate report must not append another history entry.");
      assert(written.status === "Analyze", "Duplicate report must preserve already-applied status.");
      assert(fs.readFileSync(path.join(repo, relativePath), "utf8") === afterFirstBytes, "Duplicate report must preserve ledger bytes exactly.");
    }),
  },
  {
    name: "rejects duplicate report id when existing history evidence mismatches",
    run: () => withTempRepo("duplicate-mismatch", (repo) => {
      const relativePath = writeLedger(repo);
      const first = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath }), report: report({ ledgerPath: relativePath }), now: "2026-06-13T00:01:00.000Z" });
      assert(first.ok && first.action === "applied", "First report must apply.");
      const ledger = readLedger(repo, relativePath);
      const history = ledger.history as Array<Record<string, unknown>>;
      history[0].evidence = { ...(history[0].evidence as Record<string, unknown>), workerId: "other-worker" };
      fs.writeFileSync(path.join(repo, relativePath), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
      const beforeDuplicate = fs.readFileSync(path.join(repo, relativePath), "utf8");
      const second = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath }), report: report({ ledgerPath: relativePath }) });
      assert(!second.ok && second.reasonCode === "mismatched_evidence", `Expected mismatched duplicate evidence, got ${JSON.stringify(second)}.`);
      assert(second.errors.some((error) => error.includes("workerId")), "Duplicate mismatch error must name workerId.");
      assert(fs.readFileSync(path.join(repo, relativePath), "utf8") === beforeDuplicate, "Duplicate mismatch must preserve ledger bytes.");
    }),
  },
  {
    name: "rejects mismatched report evidence without writing",
    run: () => withTempRepo("mismatch", (repo) => {
      const relativePath = writeLedger(repo);
      const before = fs.readFileSync(path.join(repo, relativePath), "utf8");
      const result = applyAutopilotLedgerTransition({ root: repo, run: runRecord({ ledgerPath: relativePath }), report: report({ ledgerPath: relativePath, taskId: "other-task" }) });
      assert(!result.ok && result.reasonCode === "mismatched_evidence", `Expected mismatched_evidence, got ${JSON.stringify(result)}.`);
      assert(result.errors.some((error) => error.includes("taskId")), "Mismatch error must name taskId.");
      assert(fs.readFileSync(path.join(repo, relativePath), "utf8") === before, "Mismatched report rejection must preserve original ledger bytes.");
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
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} autopilot ledger transition writer test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot ledger transition writer tests=${tests.length}`);
