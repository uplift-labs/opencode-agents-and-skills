#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCollectOutput,
  readLedgerSummaries,
  type AutopilotNextAction,
  type AutopilotOutput,
} from "./openspec-autopilot-output.ts";

type TestCase = {
  name: string;
  run: () => void;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8")) as Record<string, unknown>;
}

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-autopilot-${name}-`));
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function writeLedger(repo: string, changeId: string, ledger: Record<string, unknown>): void {
  const filePath = path.join(repo, "openspec", "changes", changeId, "automation", "task.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function readyResearchLedger(): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = "ready-research";
  ledger.status = "Ready";
  ledger.history = [];
  ledger.mr = { required: true, status: "none" };
  return ledger;
}

function readyLedgerWithSelectionInputs(id: string, priority: string, writeScope: string[]): Record<string, unknown> {
  const ledger = readyResearchLedger();
  ledger.id = id;
  ledger.priority = priority;
  ledger.scope = {
    read: ["openspec/**"],
    write: writeScope,
    forbidden: ["src/**", "openspec/changes/*/automation/**", ".autopilot/**"],
  };
  return ledger;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoRepeatedTool(output: AutopilotOutput, toolName: string): void {
  assert(output.nextRecommendedCall !== toolName, `Output must not recommend repeated ${toolName}.`);
  assert(!output.nextActions.some((action) => action.tool === toolName), `nextActions must not recommend repeated ${toolName}.`);
}

function assertNoProgressClaims(output: AutopilotOutput): void {
  assert(Array.isArray(output.tasksStarted) && output.tasksStarted.length === 0, "Deferred/no-op output must not claim started tasks.");
  assert(Array.isArray(output.tasksAdvanced) && output.tasksAdvanced.length === 0, "Deferred/no-op output must not claim advanced tasks.");
}

function assertNextAction(action: AutopilotNextAction | undefined, expected: { kind: string; safety: string; tool?: string }): void {
  assert(action != null, "Expected a next action.");
  assert(action.kind === expected.kind, `Expected next action kind ${expected.kind}, got ${action.kind}.`);
  assert(action.safety === expected.safety, `Expected next action safety ${expected.safety}, got ${action.safety}.`);
  if (expected.tool) {
    assert(action.tool === expected.tool, `Expected next action tool ${expected.tool}, got ${action.tool}.`);
  }
  for (const key of ["label", "reason", "expectedResult"] as const) {
    assert(typeof action[key] === "string" && action[key].trim().length > 0, `Next action must include non-empty ${key}.`);
  }
}

function assertEmptySelection(output: AutopilotOutput): void {
  assert(output.selection.mode === "serial_default", `Expected empty selection mode serial_default, got ${output.selection.mode}.`);
  assert(output.selection.maxImplementationClaims === 1, `Expected maxImplementationClaims=1, got ${output.selection.maxImplementationClaims}.`);
  assert(output.selection.selectedTaskId == null, `Expected no selected task, got ${String(output.selection.selectedTaskId)}.`);
  assert(Array.isArray(output.selection.candidates) && output.selection.candidates.length === 0, "Expected no selection candidates.");
}

const tests: TestCase[] = [
  {
    name: "collect returns collect-deferred reason without repeating collect",
    run: () => withTempRepo("collect", (repo) => {
      writeLedger(repo, "ready-research", readyResearchLedger());
      const output = createCollectOutput(readLedgerSummaries(repo));
      assert(output.reasonCode === "collect_deferred", `Expected collect_deferred, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assertEmptySelection(output);
      assert(output.loopGuard.equivalentCall === "autopilot_collect", `Expected collect loop guard, got ${output.loopGuard.equivalentCall}.`);
      assert(output.loopGuard.suppressRepeatRecommendation, "Collect output must suppress repeated collect recommendation.");
      assertNoRepeatedTool(output, "autopilot_collect");
      assertNextAction(output.nextActions[0], { kind: "tool", safety: "safe", tool: "autopilot_status" });
    }),
  },
  {
    name: "collect validates plugin-owned worker report legal transition",
    run: () => withTempRepo("collect-worker-report", (repo) => {
      writeLedger(repo, "ready-research", readyResearchLedger());
      const output = createCollectOutput(readLedgerSummaries(repo), {
        runtimeState: {
          workerReports: [
            {
              reportId: "report-ready-analyze",
              taskId: "ready-research",
              fromStatus: "Ready",
              toStatus: "Analyze",
              completedAt: "2026-06-10T00:00:00.000Z",
              evidence: { workerSummary: "Ready task claimed for analysis." },
            },
          ],
        },
      });
      assert(output.outcome === "advanced", `Expected advanced collect output, got ${output.outcome}.`);
      assert(output.reasonCode === "advanced", `Expected advanced reason, got ${output.reasonCode}.`);
      assert(output.tasksStarted.length === 0, "Collect output must not claim worker starts.");
      assert(output.tasksAdvanced.length === 1, `Expected one advanced task, got ${output.tasksAdvanced.length}.`);
      assertNextAction(output.nextActions[0], { kind: "tool", safety: "safe", tool: "autopilot_status" });
    }),
  },
  {
    name: "collect consumes worker report across repeated calls",
    run: () => withTempRepo("collect-worker-report-idempotent", (repo) => {
      writeLedger(repo, "ready-research", readyResearchLedger());
      const runtimeState = {
        workerReports: [
          {
            reportId: "report-ready-analyze",
            taskId: "ready-research",
            fromStatus: "Ready",
            toStatus: "Analyze",
            completedAt: "2026-06-10T00:00:00.000Z",
            evidence: { workerSummary: "Ready task claimed for analysis." },
          },
        ],
      };
      const first = createCollectOutput(readLedgerSummaries(repo), { runtimeState, mutateRuntimeState: true });
      const second = createCollectOutput(readLedgerSummaries(repo), { runtimeState, mutateRuntimeState: true });
      const consumed = (runtimeState as { consumedWorkerReportIds?: string[] }).consumedWorkerReportIds ?? [];

      assert(first.outcome === "advanced", `Expected first collect to advance, got ${first.outcome}.`);
      assert(first.tasksAdvanced.length === 1, `Expected first collect to advance once, got ${first.tasksAdvanced.length}.`);
      assert(second.reasonCode === "collect_deferred", `Expected consumed report to return collect_deferred, got ${second.reasonCode}.`);
      assertNoProgressClaims(second);
      assert(second.summary.includes("already consumed"), "Repeated collect must report that the worker report was already consumed.");
      assert(consumed.length === 1 && consumed[0] === "report-ready-analyze", `Runtime state must retain exact consumed report evidence, got ${JSON.stringify(consumed)}.`);
    }),
  },
  {
    name: "collect rejects illegal Ready to Review worker transition",
    run: () => withTempRepo("collect-illegal-transition", (repo) => {
      writeLedger(repo, "ready-research", readyResearchLedger());
      const output = createCollectOutput(readLedgerSummaries(repo), {
        runtimeState: {
          workerReports: [
            {
              reportId: "report-ready-review",
              taskId: "ready-research",
              fromStatus: "Ready",
              toStatus: "Review",
              completedAt: "2026-06-10T00:00:00.000Z",
            },
          ],
        },
      });
      assert(output.outcome === "failed", `Expected illegal transition to fail, got ${output.outcome}.`);
      assert(output.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assert(output.blockers.some((blocker) => blocker.reason.includes("Ready -> Review") && blocker.reason.includes("not a legal transition")), "Illegal transition conflict must include Ready -> Review evidence.");
    }),
  },
  {
    name: "collect rejects runtime evidence conflicts without advancement",
    run: () => withTempRepo("collect-conflict", (repo) => {
      writeLedger(repo, "ready-research", readyResearchLedger());
      const output = createCollectOutput(readLedgerSummaries(repo), {
        runtimeState: {
          workerReports: [
            {
              reportId: "report-stale-status",
              taskId: "ready-research",
              fromStatus: "Implementation",
              toStatus: "Review",
              completedAt: "2026-06-10T00:00:00.000Z",
            },
          ],
        },
      });
      assert(output.outcome === "failed", `Expected failed conflict output, got ${output.outcome}.`);
      assert(output.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assert(output.blockers.some((blocker) => blocker.reason.includes("report-stale-status")), "Conflict output must include report id evidence.");
      assertNextAction(output.nextActions[0], { kind: "validation", safety: "safe" });
    }),
  },
  {
    name: "collect rejects duplicate same-task reports in one operation",
    run: () => withTempRepo("collect-duplicate-reports", (repo) => {
      writeLedger(repo, "ready-research", readyResearchLedger());
      const runtimeState = {
        workerReports: [
          {
            reportId: "report-first",
            taskId: "ready-research",
            fromStatus: "Ready",
            toStatus: "Analyze",
            completedAt: "2026-06-10T00:00:00.000Z",
          },
          {
            reportId: "report-second",
            taskId: "ready-research",
            fromStatus: "Ready",
            toStatus: "Analyze",
            completedAt: "2026-06-10T00:00:01.000Z",
          },
        ],
      };
      const output = createCollectOutput(readLedgerSummaries(repo), { runtimeState });
      assert(output.outcome === "failed", `Expected duplicate same-task reports to fail, got ${output.outcome}.`);
      assert(output.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assert(output.blockers.some((blocker) => blocker.reason.includes("multiple worker reports")), "Duplicate report conflict must explain multiple worker reports.");
      assert(!JSON.stringify(runtimeState).includes("consumedWorkerReportIds"), "Failed collect must not mark any report consumed.");
    }),
  },
  {
    name: "collect rejects duplicate report ids across tasks in one operation",
    run: () => withTempRepo("collect-duplicate-report-id", (repo) => {
      writeLedger(repo, "first", readyLedgerWithSelectionInputs("task-a", "high", ["openspec/changes/first/**"]));
      writeLedger(repo, "second", readyLedgerWithSelectionInputs("task-b", "medium", ["openspec/changes/second/**"]));
      const runtimeState = {
        workerReports: [
          {
            reportId: "report-shared",
            taskId: "task-a",
            fromStatus: "Ready",
            toStatus: "Analyze",
            completedAt: "2026-06-10T00:00:00.000Z",
          },
          {
            reportId: "report-shared",
            taskId: "task-b",
            fromStatus: "Ready",
            toStatus: "Analyze",
            completedAt: "2026-06-10T00:00:01.000Z",
          },
        ],
      };
      const output = createCollectOutput(readLedgerSummaries(repo), { runtimeState, mutateRuntimeState: true });
      assert(output.outcome === "failed", `Expected duplicate report id to fail, got ${output.outcome}.`);
      assert(output.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assert(output.blockers.some((blocker) => blocker.reason.includes("duplicate worker report id") && blocker.reason.includes("report-shared")), "Duplicate report-id conflict must include report id evidence.");
      assert(!JSON.stringify(runtimeState).includes("consumedWorkerReportIds"), "Failed duplicate report-id collect must not mark any report consumed.");
    }),
  },
  {
    name: "collect rejects ambiguous duplicate task-id worker reports without ledger path",
    run: () => withTempRepo("collect-duplicate-task-id", (repo) => {
      writeLedger(repo, "first", readyLedgerWithSelectionInputs("duplicate-task", "high", ["openspec/changes/first/**"]));
      writeLedger(repo, "second", readyLedgerWithSelectionInputs("duplicate-task", "medium", ["openspec/changes/second/**"]));
      const output = createCollectOutput(readLedgerSummaries(repo), {
        runtimeState: {
          workerReports: [
            {
              reportId: "report-ambiguous-task",
              taskId: "duplicate-task",
              fromStatus: "Ready",
              toStatus: "Analyze",
              completedAt: "2026-06-10T00:00:00.000Z",
            },
          ],
        },
      });
      assert(output.outcome === "failed", `Expected duplicate task-id report to fail, got ${output.outcome}.`);
      assert(output.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assert(output.blockers.some((blocker) => blocker.reason.includes("duplicate-task") && blocker.reason.includes("ledgerPath")), "Ambiguous report output must require ledgerPath disambiguation.");
    }),
  },
  {
    name: "collect accepts duplicate task-id worker report with ledger path",
    run: () => withTempRepo("collect-duplicate-task-id-path", (repo) => {
      writeLedger(repo, "first", readyLedgerWithSelectionInputs("duplicate-task", "high", ["openspec/changes/first/**"]));
      writeLedger(repo, "second", readyLedgerWithSelectionInputs("duplicate-task", "medium", ["openspec/changes/second/**"]));
      const output = createCollectOutput(readLedgerSummaries(repo), {
        runtimeState: {
          workerReports: [
            {
              reportId: "report-disambiguated-task",
              taskId: "duplicate-task",
              ledgerPath: "openspec/changes/first/automation/task.json",
              fromStatus: "Ready",
              toStatus: "Analyze",
              completedAt: "2026-06-10T00:00:00.000Z",
            },
          ],
        },
      });
      assert(output.outcome === "advanced", `Expected disambiguated duplicate task-id report to advance, got ${output.outcome}.`);
      assert(output.tasksAdvanced.length === 1, `Expected one advancement, got ${output.tasksAdvanced.length}.`);
      assert(JSON.stringify(output.tasksAdvanced).includes("openspec/changes/first/automation/task.json"), "Disambiguated report must advance the requested ledger path.");
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
    console.error(`FAIL ${test.name}`);
    console.error(message);
  }
}

if (failed > 0) {
  process.exitCode = 1;
}
