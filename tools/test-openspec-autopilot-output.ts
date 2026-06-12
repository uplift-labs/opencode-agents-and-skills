#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRunNextOutput,
  createStatusOutput,
  readLedgerSummaries,
  type LedgerSummary,
  type AutopilotNextAction,
  type AutopilotOutput,
  type TaskActionabilitySummary,
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

function historyOf(ledger: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(ledger.history)) {
    throw new Error("Fixture history must be an array.");
  }
  return ledger.history as Array<Record<string, unknown>>;
}

function revisionOf(ledger: Record<string, unknown>): Record<string, unknown> {
  if (typeof ledger.revision !== "object" || ledger.revision == null || Array.isArray(ledger.revision)) {
    throw new Error("Fixture revision must be an object.");
  }
  return ledger.revision as Record<string, unknown>;
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

function readyLedgerWithDependencies(id: string, dependencies: string[]): Record<string, unknown> {
  const ledger = readyLedgerWithSelectionInputs(id, "critical", ["openspec/changes/dependent/**"]);
  ledger.dependencies = dependencies;
  return ledger;
}

function invalidReadyLedger(): Record<string, unknown> {
  const ledger = readyResearchLedger();
  ledger.id = "invalid-ready";
  delete ledger.testDecision;
  return ledger;
}

function doneResearchLedger(): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = "done-research";
  ledger.status = "Done";
  ledger.mr = {
    required: false,
    status: "not-required",
    noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR.",
  };
  historyOf(ledger).push({
    from: "Acceptance",
    to: "Done",
    at: "2026-06-10T00:03:00.000Z",
    by: "plugin",
    source: "autopilot_collect",
    evidence: { noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR." },
  });
  revisionOf(ledger).number = 4;
  return ledger;
}

function blockedResearchLedger(): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = "blocked-research";
  ledger.status = "Blocked";
  ledger.mr = { required: true, status: "none" };
  ledger.blockers = [{ reason: "User must choose provider credentials." }];
  historyOf(ledger).push({
    from: "Acceptance",
    to: "Blocked",
    at: "2026-06-10T00:03:00.000Z",
    by: "plugin",
    source: "autopilot_collect",
    evidence: {
      blockerReason: "User must choose provider credentials.",
      userActionRequired: true,
      recommendedOptions: ["Use existing credentials", "Stop task"],
    },
  });
  revisionOf(ledger).number = 4;
  return ledger;
}

function readSingleLedgerOutput(repo: string): AutopilotOutput {
  return createRunNextOutput(readLedgerSummaries(repo));
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

function summariesByTaskId(output: AutopilotOutput): Map<string, TaskActionabilitySummary> {
  return new Map(output.taskSummaries.map((summary) => [summary.taskId, summary]));
}

function assertSummary(summary: TaskActionabilitySummary | undefined, expected: Partial<TaskActionabilitySummary>): void {
  assert(summary != null, `Missing task summary for ${expected.taskId ?? "unknown task"}.`);
  for (const [key, value] of Object.entries(expected)) {
    assert(summary[key as keyof TaskActionabilitySummary] === value, `Expected summary ${key}=${String(value)}, got ${String(summary[key as keyof TaskActionabilitySummary])}.`);
  }
  const expectedPathSuffix = expected.sourceKind === "active-change" ? "tasks.md" : "automation/task.json";
  assert(typeof summary.path === "string" && summary.path.endsWith(expectedPathSuffix), `Summary must include compact ${expected.sourceKind ?? "ledger"} path.`);
}

function assertSelection(output: AutopilotOutput, expected: { mode?: string; maxImplementationClaims?: number; selectedTaskId?: string; candidates: Array<{ taskId: string; rank: number | null; selected: boolean; selectionReason: string; parallelDecision: string; pathSuffix?: string }> }): void {
  assert(typeof output.selection === "object" && output.selection != null && !Array.isArray(output.selection), "Output must include top-level selection evidence.");
  assert(output.selection.mode === (expected.mode ?? "serial_default"), `Expected selection mode ${expected.mode ?? "serial_default"}, got ${String(output.selection.mode)}.`);
  assert(output.selection.maxImplementationClaims === (expected.maxImplementationClaims ?? 1), `Expected maxImplementationClaims=${expected.maxImplementationClaims ?? 1}, got ${String(output.selection.maxImplementationClaims)}.`);
  assert(output.selection.selectedTaskId === expected.selectedTaskId, `Expected selectedTaskId=${expected.selectedTaskId ?? "undefined"}, got ${String(output.selection.selectedTaskId)}.`);
  assert(Array.isArray(output.selection.candidates), "selection.candidates must be an array.");
  assert(output.selection.candidates.length === expected.candidates.length, `Expected ${expected.candidates.length} selection candidates, got ${output.selection.candidates.length}.`);
  for (const [index, expectedCandidate] of expected.candidates.entries()) {
    const actual = output.selection.candidates[index];
    assert(actual.taskId === expectedCandidate.taskId, `Expected candidate[${index}].taskId=${expectedCandidate.taskId}, got ${String(actual.taskId)}.`);
    assert(typeof actual.path === "string" && actual.path.endsWith(expectedCandidate.pathSuffix ?? "automation/task.json"), `candidate[${index}] must include compact path evidence.`);
    assert(actual.rank === expectedCandidate.rank, `Expected candidate[${index}].rank=${String(expectedCandidate.rank)}, got ${String(actual.rank)}.`);
    assert(actual.selected === expectedCandidate.selected, `Expected candidate[${index}].selected=${String(expectedCandidate.selected)}, got ${String(actual.selected)}.`);
    assert(actual.selectionReason === expectedCandidate.selectionReason, `Expected candidate[${index}].selectionReason=${expectedCandidate.selectionReason}, got ${String(actual.selectionReason)}.`);
    assert(actual.parallelDecision === expectedCandidate.parallelDecision, `Expected candidate[${index}].parallelDecision=${expectedCandidate.parallelDecision}, got ${String(actual.parallelDecision)}.`);
  }
}

function assertEmptySelection(output: AutopilotOutput): void {
  assertSelection(output, { candidates: [] });
}

const tests: TestCase[] = [
  {
    name: "no ledgers return reason code and compact next action",
    run: () => withTempRepo("no-ledgers", (repo) => {
      const output = readSingleLedgerOutput(repo);
      assert(output.outcome === "idle", `Expected idle, got ${output.outcome}.`);
      assert(output.reasonCode === "no_ledgers", `Expected no_ledgers, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assert(output.taskSummaries.length === 0, "No-ledger output must not include task summaries.");
      assertEmptySelection(output);
      assertNextAction(output.nextActions[0], { kind: "manual_review", safety: "safe" });
      assertNoRepeatedTool(output, "autopilot_run_next");
    }),
  },
  {
    name: "Ready ledger returns runtime-deferred actionability without repeat recommendation",
    run: () => withTempRepo("ready", (repo) => {
      writeLedger(repo, "ready-research", readyResearchLedger());
      const output = readSingleLedgerOutput(repo);
      assert(output.outcome === "idle", `Expected idle, got ${output.outcome}.`);
      assert(output.reasonCode === "ready_runtime_deferred", `Expected ready_runtime_deferred, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assert(output.loopGuard.repeatedNoProgress, "Ready runtime-deferred output must set no-progress loop guard.");
      assert(output.loopGuard.suppressRepeatRecommendation, "Ready runtime-deferred output must suppress repeat recommendation.");
      assertSummary(output.taskSummaries[0], {
        taskId: "ready-research",
        taskType: "research",
        status: "Ready",
        valid: true,
        mrStatus: "none",
        actionability: "runtime_deferred",
        reasonCode: "ready_runtime_deferred",
      });
      assertNextAction(output.nextActions[0], { kind: "manual_review", safety: "safe" });
      assert(output.nextActions[0]?.label === "Continue selected OpenSpec change manually", "Ready next action must keep the manual continuation label.");
      assert(output.nextActions[0]?.expectedResult.includes("selection.selectedTaskId"), "Ready next action must direct agents to selection.selectedTaskId.");
      assert(output.nextActions[0]?.expectedResult.includes("selection.candidates"), "Ready next action must direct agents to selection.candidates.");
      assert(output.nextActions[0]?.expectedResult.includes("without repeating autopilot_run_next"), "Ready next action must preserve no-repeat loop guidance.");
      assertNoRepeatedTool(output, "autopilot_run_next");
      assertSelection(output, {
        selectedTaskId: "ready-research",
        candidates: [{ taskId: "ready-research", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated" }],
      });
    }),
  },
  {
    name: "multiple Ready ledgers expose deterministic serial selection evidence",
    run: () => withTempRepo("selection", (repo) => {
      writeLedger(repo, "low-small", readyLedgerWithSelectionInputs("task-low-small", "low", ["openspec/changes/low/**"]));
      writeLedger(repo, "high-large", readyLedgerWithSelectionInputs("task-high-large", "high", ["openspec/changes/high/**", "tools/**"]));
      writeLedger(repo, "medium-small", readyLedgerWithSelectionInputs("task-medium-small", "medium", ["openspec/changes/medium/**"]));
      const output = readSingleLedgerOutput(repo);
      assert(output.reasonCode === "ready_runtime_deferred", `Expected ready_runtime_deferred, got ${output.reasonCode}.`);
      assertSelection(output, {
        selectedTaskId: "task-high-large",
        candidates: [
          { taskId: "task-high-large", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated" },
          { taskId: "task-medium-small", rank: 2, selected: false, selectionReason: "serial_default", parallelDecision: "parallel_ready" },
          { taskId: "task-low-small", rank: 3, selected: false, selectionReason: "serial_default", parallelDecision: "parallel_ready" },
        ],
      });
    }),
  },
  {
    name: "default serial selection exposes parallel-ready candidates without starting them",
    run: () => withTempRepo("selection-parallel-ready", (repo) => {
      writeLedger(repo, "primary", readyLedgerWithSelectionInputs("task-primary", "high", ["openspec/changes/primary/**"]));
      writeLedger(repo, "parallel", readyLedgerWithSelectionInputs("task-parallel", "medium", ["openspec/changes/parallel/**"]));
      const output = readSingleLedgerOutput(repo);
      assert(output.selection.mode === "serial_default", `Expected serial_default selection mode, got ${String(output.selection.mode)}.`);
      assert(output.selection.maxImplementationClaims === 1, `Expected maxImplementationClaims=1, got ${String(output.selection.maxImplementationClaims)}.`);
      assertNoProgressClaims(output);
      assertSelection(output, {
        selectedTaskId: "task-primary",
        candidates: [
          { taskId: "task-primary", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated" },
          { taskId: "task-parallel", rank: 2, selected: false, selectionReason: "serial_default", parallelDecision: "parallel_ready" },
        ],
      });
    }),
  },
  {
    name: "plugin-owned claim mode starts only selected primary Ready task",
    run: () => withTempRepo("selection-claim-primary", (repo) => {
      writeLedger(repo, "secondary", readyLedgerWithSelectionInputs("task-secondary", "medium", ["openspec/changes/secondary/**"]));
      writeLedger(repo, "primary", readyLedgerWithSelectionInputs("task-primary", "high", ["openspec/changes/primary/**"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), { runtimeState: { claimReadyTasks: true } });
      assert(output.outcome === "advanced", `Expected claim mode to advance, got ${output.outcome}.`);
      assert(output.reasonCode === "advanced", `Expected advanced reason, got ${output.reasonCode}.`);
      assert(output.tasksStarted.length === 1, `Expected one started task, got ${output.tasksStarted.length}.`);
      assert(output.tasksAdvanced.length === 0, "run_next claim mode must not claim collect advancement.");
      assert(JSON.stringify(output.tasksStarted).includes("task-primary"), "run_next claim mode must start selected primary task.");
      assert(!JSON.stringify(output.tasksStarted).includes("task-secondary"), "run_next claim mode must not start non-selected parallel-ready task.");
      assertSelection(output, {
        selectedTaskId: "task-primary",
        candidates: [
          { taskId: "task-primary", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated" },
          { taskId: "task-secondary", rank: 2, selected: false, selectionReason: "serial_default", parallelDecision: "parallel_ready" },
        ],
      });
    }),
  },
  {
    name: "plugin-owned claim mode rejects missing raw ledger state",
    run: () => withTempRepo("selection-claim-conflict", (repo) => {
      writeLedger(repo, "primary", readyLedgerWithSelectionInputs("task-primary", "high", ["openspec/changes/primary/**"]));
      const ledgersWithoutRawState = readLedgerSummaries(repo).map((ledger): LedgerSummary => ({ ...ledger, ledger: undefined }));
      const runtimeState: Record<string, unknown> = { claimReadyTasks: true };
      const output = createRunNextOutput(ledgersWithoutRawState, { runtimeState });
      assert(output.outcome === "failed", `Expected claim conflict to fail, got ${output.outcome}.`);
      assert(output.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${output.reasonCode}.`);
      assert(output.tasksStarted.length === 0, "Claim conflict must not start tasks.");
      assert(output.blockers.some((blocker) => blocker.reason.includes("raw ledger state is unavailable")), "Claim conflict must explain missing raw ledger state.");
      assert(runtimeState.activeRun == null, "Claim conflict must not record active runtime state.");
    }),
  },
  {
    name: "explicit parallel implementation starts only guarded candidates within WIP limit",
    run: () => withTempRepo("selection-parallel-implementation", (repo) => {
      writeLedger(repo, "first", readyLedgerWithSelectionInputs("task-first", "high", ["openspec/changes/first/**"]));
      writeLedger(repo, "second", readyLedgerWithSelectionInputs("task-second", "medium", ["openspec/changes/second/**"]));
      writeLedger(repo, "third", readyLedgerWithSelectionInputs("task-third", "low", ["openspec/changes/third/**"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            maxImplementationClaims: 2,
            lockedTaskIds: ["task-first", "task-second", "task-third"],
            worktrees: {
              "task-first": "autopilot/first/task-first",
              "task-second": "autopilot/second/task-second",
              "task-third": "autopilot/third/task-third",
            },
          },
        },
      });
      assert(output.outcome === "advanced", `Expected parallel implementation to advance, got ${output.outcome}.`);
      assert(output.tasksStarted.length === 2, `Expected WIP limit to start two tasks, got ${output.tasksStarted.length}.`);
      assertSelection(output, {
        mode: "parallel_implementation",
        maxImplementationClaims: 2,
        selectedTaskId: "task-first",
        candidates: [
          { taskId: "task-first", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-second", rank: 2, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-third", rank: 3, selected: false, selectionReason: "wip_limit", parallelDecision: "not_parallel_safe" },
        ],
      });
    }),
  },
  {
    name: "explicit parallel implementation rejects overlapping and unknown write scopes",
    run: () => withTempRepo("selection-parallel-unsafe", (repo) => {
      writeLedger(repo, "primary", readyLedgerWithSelectionInputs("task-primary", "high", ["openspec/changes/shared/**"]));
      writeLedger(repo, "overlap", readyLedgerWithSelectionInputs("task-overlap", "medium", ["openspec/changes/shared/**"]));
      writeLedger(repo, "unknown", readyLedgerWithSelectionInputs("task-unknown", "low", []));
      writeLedger(repo, "unsupported", readyLedgerWithSelectionInputs("task-unsupported", "low", ["**/*.ts"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            maxImplementationClaims: 2,
            lockedTaskIds: ["task-primary", "task-overlap", "task-unknown", "task-unsupported"],
            worktrees: {
              "task-primary": "autopilot/primary/task-primary",
              "task-overlap": "autopilot/overlap/task-overlap",
              "task-unknown": "autopilot/unknown/task-unknown",
              "task-unsupported": "autopilot/unsupported/task-unsupported",
            },
          },
        },
      });
      assert(output.outcome === "advanced", `Expected safe primary claim despite unsafe parallel candidates, got ${output.outcome}.`);
      assert(output.tasksStarted.length === 1, `Expected only safe primary task to start, got ${output.tasksStarted.length}.`);
      assertSelection(output, {
        mode: "parallel_implementation",
        maxImplementationClaims: 2,
        selectedTaskId: "task-primary",
        candidates: [
          { taskId: "task-primary", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-overlap", rank: 2, selected: false, selectionReason: "scope_conflict", parallelDecision: "not_parallel_safe" },
          { taskId: "task-unknown", rank: 3, selected: false, selectionReason: "scope_conflict", parallelDecision: "not_parallel_safe" },
          { taskId: "task-unsupported", rank: 4, selected: false, selectionReason: "scope_conflict", parallelDecision: "not_parallel_safe" },
        ],
      });
    }),
  },
  {
    name: "explicit parallel implementation rejects writes into another task forbidden scope",
    run: () => withTempRepo("selection-parallel-forbidden", (repo) => {
      const primary = readyLedgerWithSelectionInputs("task-primary", "high", ["tools/primary.ts"]);
      const primaryScope = primary.scope as Record<string, unknown>;
      primaryScope.forbidden = [...(primaryScope.forbidden as string[]), "tools/shared/**"];
      writeLedger(repo, "primary", primary);
      writeLedger(repo, "forbidden-write", readyLedgerWithSelectionInputs("task-forbidden-write", "medium", ["tools/shared/generated.ts"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            maxImplementationClaims: 2,
            lockedTaskIds: ["task-primary", "task-forbidden-write"],
            worktrees: {
              "task-primary": "autopilot/primary/task-primary",
              "task-forbidden-write": "autopilot/forbidden-write/task-forbidden-write",
            },
          },
        },
      });
      assert(output.outcome === "advanced", `Expected safe primary claim despite forbidden parallel candidate, got ${output.outcome}.`);
      assert(output.tasksStarted.length === 1, `Expected only primary task to start, got ${output.tasksStarted.length}.`);
      assertSelection(output, {
        mode: "parallel_implementation",
        maxImplementationClaims: 2,
        selectedTaskId: "task-primary",
        candidates: [
          { taskId: "task-primary", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-forbidden-write", rank: 2, selected: false, selectionReason: "scope_conflict", parallelDecision: "not_parallel_safe" },
        ],
      });
    }),
  },
  {
    name: "explicit parallel implementation requires locks and unique worktrees",
    run: () => withTempRepo("selection-parallel-guards", (repo) => {
      writeLedger(repo, "first", readyLedgerWithSelectionInputs("task-first", "critical", ["openspec/changes/first/**"]));
      writeLedger(repo, "missing-lock", readyLedgerWithSelectionInputs("task-missing-lock", "high", ["openspec/changes/missing-lock/**"]));
      writeLedger(repo, "duplicate-worktree", readyLedgerWithSelectionInputs("task-duplicate-worktree", "medium", ["openspec/changes/duplicate-worktree/**"]));
      writeLedger(repo, "missing-worktree", readyLedgerWithSelectionInputs("task-missing-worktree", "low", ["openspec/changes/missing-worktree/**"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            maxImplementationClaims: 4,
            lockedTaskIds: ["task-first", "task-duplicate-worktree", "task-missing-worktree"],
            worktrees: {
              "task-first": "autopilot/first/task-first",
              "task-missing-lock": "autopilot/missing-lock/task-missing-lock",
              "task-duplicate-worktree": "autopilot/first/task-first",
            },
          },
        },
      });
      assert(output.outcome === "advanced", `Expected guarded primary to advance, got ${output.outcome}.`);
      assert(output.tasksStarted.length === 1, `Expected only guarded primary task to start, got ${output.tasksStarted.length}.`);
      assertSelection(output, {
        mode: "parallel_implementation",
        maxImplementationClaims: 4,
        selectedTaskId: "task-first",
        candidates: [
          { taskId: "task-first", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-missing-lock", rank: 2, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
          { taskId: "task-duplicate-worktree", rank: 3, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
          { taskId: "task-missing-worktree", rank: 4, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
        ],
      });
    }),
  },
  {
    name: "explicit parallel implementation rejects unowned worktree paths",
    run: () => withTempRepo("selection-parallel-worktree-ownership", (repo) => {
      writeLedger(repo, "absolute", readyLedgerWithSelectionInputs("task-absolute", "high", ["openspec/changes/absolute/**"]));
      writeLedger(repo, "traversal", readyLedgerWithSelectionInputs("task-traversal", "medium", ["openspec/changes/traversal/**"]));
      writeLedger(repo, "missing-task", readyLedgerWithSelectionInputs("task-missing-task", "low", ["openspec/changes/missing-task/**"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            maxImplementationClaims: 3,
            lockedTaskIds: ["task-absolute", "task-traversal", "task-missing-task"],
            worktrees: {
              "task-absolute": "C:/tmp/autopilot/task-absolute",
              "task-traversal": "autopilot/../task-traversal",
              "task-missing-task": "autopilot/missing-task/worktree",
            },
          },
        },
      });
      assert(output.outcome === "failed", `Expected no-safe-parallel claim conflict, got ${output.outcome}.`);
      assert(output.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${output.reasonCode}.`);
      assert(output.tasksStarted.length === 0, `Expected no unowned worktree task starts, got ${output.tasksStarted.length}.`);
      assertSelection(output, {
        mode: "parallel_implementation",
        maxImplementationClaims: 3,
        candidates: [
          { taskId: "task-absolute", rank: 1, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
          { taskId: "task-traversal", rank: 2, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
          { taskId: "task-missing-task", rank: 3, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
        ],
      });
    }),
  },
  {
    name: "Ready selection ranking uses write scope size then lexical task id after priority",
    run: () => withTempRepo("selection-ties", (repo) => {
      writeLedger(repo, "same-b", readyLedgerWithSelectionInputs("task-b", "medium", ["openspec/changes/b/**", "tools/**"]));
      writeLedger(repo, "same-a", readyLedgerWithSelectionInputs("task-a", "medium", ["openspec/changes/a/**"]));
      writeLedger(repo, "same-c", readyLedgerWithSelectionInputs("task-c", "medium", ["openspec/changes/c/**"]));
      const output = readSingleLedgerOutput(repo);
      assertSelection(output, {
        selectedTaskId: "task-a",
        candidates: [
          { taskId: "task-a", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated" },
          { taskId: "task-c", rank: 2, selected: false, selectionReason: "serial_default", parallelDecision: "parallel_ready" },
          { taskId: "task-b", rank: 3, selected: false, selectionReason: "serial_default", parallelDecision: "parallel_ready" },
        ],
      });
    }),
  },
  {
    name: "Ready selection ranks unknown priorities after known priorities with stable lexical order",
    run: () => withTempRepo("selection-unknown-priority", (repo) => {
      writeLedger(repo, "unknown-z", readyLedgerWithSelectionInputs("task-unknown-z", "zeta", ["openspec/changes/z/**"]));
      writeLedger(repo, "known-low", readyLedgerWithSelectionInputs("task-known-low", "low", ["openspec/changes/low/**"]));
      writeLedger(repo, "unknown-a", readyLedgerWithSelectionInputs("task-unknown-a", "alpha", ["openspec/changes/a/**"]));
      const output = readSingleLedgerOutput(repo);
      assertSelection(output, {
        selectedTaskId: "task-known-low",
        candidates: [
          { taskId: "task-known-low", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated" },
          { taskId: "task-unknown-a", rank: 2, selected: false, selectionReason: "serial_default_unknown_priority", parallelDecision: "parallel_ready" },
          { taskId: "task-unknown-z", rank: 3, selected: false, selectionReason: "serial_default_unknown_priority", parallelDecision: "parallel_ready" },
        ],
      });
    }),
  },
  {
    name: "Ready selection marks selected unknown priority with warning-style reason",
    run: () => withTempRepo("selection-selected-unknown-priority", (repo) => {
      writeLedger(repo, "unknown-z", readyLedgerWithSelectionInputs("task-unknown-z", "zeta", ["openspec/changes/z/**"]));
      writeLedger(repo, "unknown-a", readyLedgerWithSelectionInputs("task-unknown-a", "alpha", ["openspec/changes/a/**"]));
      const output = readSingleLedgerOutput(repo);
      assertSelection(output, {
        selectedTaskId: "task-unknown-a",
        candidates: [
          { taskId: "task-unknown-a", rank: 1, selected: true, selectionReason: "selected_primary_unknown_priority", parallelDecision: "not_evaluated" },
          { taskId: "task-unknown-z", rank: 2, selected: false, selectionReason: "serial_default_unknown_priority", parallelDecision: "parallel_ready" },
        ],
      });
    }),
  },
  {
    name: "Ready selection does not choose dependency-blocked candidates",
    run: () => withTempRepo("selection-dependency-blocked", (repo) => {
      writeLedger(repo, "dependent", readyLedgerWithDependencies("task-dependent", ["missing-dependency"]));
      writeLedger(repo, "independent", readyLedgerWithSelectionInputs("task-independent", "high", ["openspec/changes/independent/**"]));
      const output = readSingleLedgerOutput(repo);
      assert(output.reasonCode === "ready_runtime_deferred", `Expected ready_runtime_deferred, got ${output.reasonCode}.`);
      assertSelection(output, {
        selectedTaskId: "task-independent",
        candidates: [
          { taskId: "task-independent", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated" },
          { taskId: "task-dependent", rank: null, selected: false, selectionReason: "dependency_blocked", parallelDecision: "not_evaluated" },
        ],
      });
    }),
  },
  {
    name: "Ready selection reports dependency-blocked only queue without selected primary",
    run: () => withTempRepo("selection-only-dependency-blocked", (repo) => {
      writeLedger(repo, "dependent", readyLedgerWithDependencies("task-dependent", ["missing-dependency"]));
      const output = readSingleLedgerOutput(repo);
      assert(output.reasonCode === "no_actionable_tasks", `Expected no_actionable_tasks, got ${output.reasonCode}.`);
      assertSelection(output, {
        candidates: [{ taskId: "task-dependent", rank: null, selected: false, selectionReason: "dependency_blocked", parallelDecision: "not_evaluated" }],
      });
      assertNoProgressClaims(output);
    }),
  },
  {
    name: "Ready selection exposes path evidence for final duplicate-id tie-breaker",
    run: () => withTempRepo("selection-path-tie", (repo) => {
      writeLedger(repo, "z-change", readyLedgerWithSelectionInputs("duplicate-task", "medium", ["openspec/changes/shared/**"]));
      writeLedger(repo, "a-change", readyLedgerWithSelectionInputs("duplicate-task", "medium", ["openspec/changes/shared/**"]));
      const output = readSingleLedgerOutput(repo);
      assertSelection(output, {
        selectedTaskId: "duplicate-task",
        candidates: [
          { taskId: "duplicate-task", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated" },
          { taskId: "duplicate-task", rank: 2, selected: false, selectionReason: "serial_default", parallelDecision: "not_parallel_safe" },
        ],
      });
      assert(output.selection.candidates[0]?.path === "openspec/changes/a-change/automation/task.json", `Expected a-change path first, got ${String(output.selection.candidates[0]?.path)}.`);
      assert(output.selection.candidates[1]?.path === "openspec/changes/z-change/automation/task.json", `Expected z-change path second, got ${String(output.selection.candidates[1]?.path)}.`);
    }),
  },
  {
    name: "status mirrors runtime-deferred reason without autopilot_run_next loop",
    run: () => withTempRepo("status-ready", (repo) => {
      writeLedger(repo, "ready-research", readyResearchLedger());
      const output = createStatusOutput(readLedgerSummaries(repo));
      assert(output.reasonCode === "ready_runtime_deferred", `Expected ready_runtime_deferred, got ${output.reasonCode}.`);
      assert(output.nextRecommendedCall !== "autopilot_run_next", "Status must not recommend autopilot_run_next when runtime is deferred.");
      assertNoRepeatedTool(output, "autopilot_run_next");
    }),
  },
  {
    name: "invalid ledger returns invalid reason and validation actionability",
    run: () => withTempRepo("invalid", (repo) => {
      writeLedger(repo, "invalid-ready", invalidReadyLedger());
      const output = readSingleLedgerOutput(repo);
      assert(output.outcome === "failed", `Expected failed, got ${output.outcome}.`);
      assert(output.reasonCode === "invalid_ledgers", `Expected invalid_ledgers, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assertEmptySelection(output);
      assert(output.blockers[0]?.reason === "invalid task ledger", "Invalid ledger should produce an invalid task blocker.");
      assertSummary(output.taskSummaries[0], {
        taskId: "invalid-ready",
        taskType: "research",
        status: "Ready",
        valid: false,
        actionability: "invalid",
        reasonCode: "invalid_ledgers",
      });
      assertNextAction(output.nextActions[0], { kind: "validation", safety: "safe" });
    }),
  },
  {
    name: "MR wait returns wait reason and actionability",
    run: () => withTempRepo("mr-wait", (repo) => {
      writeLedger(repo, "research-provider-options", readFixture("valid-research.json"));
      const output = readSingleLedgerOutput(repo);
      assert(output.outcome === "waiting_for_mr", `Expected waiting_for_mr, got ${output.outcome}.`);
      assert(output.reasonCode === "waiting_for_mr", `Expected waiting_for_mr, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assertEmptySelection(output);
      assert(output.mrsWaiting[0]?.taskId === "research-provider-options", "MR wait output should include MR task id.");
      assert(output.mrsWaiting[0]?.url === "https://example.invalid/mr/research-provider-options", "MR wait output should include MR URL evidence.");
      assertSummary(output.taskSummaries[0], {
        taskId: "research-provider-options",
        taskType: "research",
        status: "Acceptance",
        valid: true,
        mrStatus: "waiting-review",
        actionability: "waiting_for_mr",
        reasonCode: "waiting_for_mr",
      });
      assertNextAction(output.nextActions[0], { kind: "wait", safety: "requires_user" });
    }),
  },
  {
    name: "mixed ledger status reports every task actionability shape",
    run: () => withTempRepo("mixed", (repo) => {
      writeLedger(repo, "blocked-research", blockedResearchLedger());
      writeLedger(repo, "done-research", doneResearchLedger());
      writeLedger(repo, "invalid-ready", invalidReadyLedger());
      writeLedger(repo, "mr-wait", readFixture("valid-research.json"));
      writeLedger(repo, "ready-research", readyResearchLedger());
      const output = createStatusOutput(readLedgerSummaries(repo));
      const summaries = summariesByTaskId(output);
      assert(output.taskSummaries.length === 5, `Expected five task summaries, got ${output.taskSummaries.length}.`);
      assertEmptySelection(output);
      assertSummary(summaries.get("blocked-research"), { taskId: "blocked-research", status: "Blocked", taskType: "research", valid: true, mrStatus: "none", actionability: "blocked_for_user", reasonCode: "blocked_for_user" });
      assertSummary(summaries.get("done-research"), { taskId: "done-research", status: "Done", taskType: "research", valid: true, mrStatus: "not-required", actionability: "terminal", reasonCode: "no_actionable_tasks" });
      assertSummary(summaries.get("invalid-ready"), { taskId: "invalid-ready", status: "Ready", taskType: "research", valid: false, mrStatus: "none", actionability: "invalid", reasonCode: "invalid_ledgers" });
      assertSummary(summaries.get("research-provider-options"), { taskId: "research-provider-options", status: "Acceptance", taskType: "research", valid: true, mrStatus: "waiting-review", actionability: "waiting_for_mr", reasonCode: "waiting_for_mr" });
      assertSummary(summaries.get("ready-research"), { taskId: "ready-research", status: "Ready", taskType: "research", valid: true, mrStatus: "none", actionability: "runtime_deferred", reasonCode: "ready_runtime_deferred" });
    }),
  },
  {
    name: "blocked-only output does not recommend uncallable answer-blocker tool",
    run: () => withTempRepo("blocked-only", (repo) => {
      writeLedger(repo, "blocked-research", blockedResearchLedger());
      const output = readSingleLedgerOutput(repo);
      assert(output.outcome === "blocked_for_user", `Expected blocked_for_user, got ${output.outcome}.`);
      assert(output.reasonCode === "blocked_for_user", `Expected blocked_for_user, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assertEmptySelection(output);
      assert(output.questions.length === 0, "MVP blocked output must not imply a returned question envelope exists.");
      assert(output.blockers[0]?.taskId === "blocked-research", "Blocked output should identify the blocked task.");
      assertSummary(output.taskSummaries[0], { taskId: "blocked-research", status: "Blocked", taskType: "research", valid: true, mrStatus: "none", actionability: "blocked_for_user", reasonCode: "blocked_for_user" });
      assertNextAction(output.nextActions[0], { kind: "manual_review", safety: "requires_user" });
      assert(!output.nextActions.some((action) => action.tool === "autopilot_answer_blocker"), "Blocked output without questions must not recommend autopilot_answer_blocker.");
    }),
  },
  {
    name: "terminal-only output returns no-actionable reason and loop guard",
    run: () => withTempRepo("terminal-only", (repo) => {
      writeLedger(repo, "done-research", doneResearchLedger());
      const output = readSingleLedgerOutput(repo);
      assert(output.outcome === "idle", `Expected idle, got ${output.outcome}.`);
      assert(output.reasonCode === "no_actionable_tasks", `Expected no_actionable_tasks, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assertEmptySelection(output);
      assert(output.loopGuard.suppressRepeatRecommendation, "Terminal-only output must suppress repeated run-next recommendation.");
      assertSummary(output.taskSummaries[0], { taskId: "done-research", status: "Done", taskType: "research", valid: true, mrStatus: "not-required", actionability: "terminal", reasonCode: "no_actionable_tasks" });
      assertNextAction(output.nextActions[0], { kind: "manual_review", safety: "safe" });
      assertNoRepeatedTool(output, "autopilot_run_next");
    }),
  },
  {
    name: "compact status output excludes raw ledger bodies",
    run: () => withTempRepo("compact", (repo) => {
      const sentinel = "__raw_ledger_sentinel_DO_NOT_EMIT__";
      const ledger = readyResearchLedger();
      ledger.rawOnlySentinel = sentinel;
      writeLedger(repo, "ready-research", ledger);
      const output = createStatusOutput(readLedgerSummaries(repo));
      const serialized = JSON.stringify(output);
      assert((output.status.total as number) === 1, `Expected status total=1, got ${String(output.status.total)}.`);
      assert(output.reasonCode === "ready_runtime_deferred", `Expected ready_runtime_deferred, got ${output.reasonCode}.`);
      assert(output.taskSummaries.length === 1, "Compact status output should include task summaries.");
      assert(output.nextActions.length > 0, "Compact status output should include next actions.");
      assert(!serialized.includes(sentinel), "Compact status output must not include raw-only sentinel data.");
      for (const rawKey of ["scope", "phaseProfile", "phaseEvidence", "testDecision", "reviewPolicy", "history", "revision", "rawOnlySentinel"]) {
        assert(!serialized.includes(`\"${rawKey}\"`), `Compact output must not include raw ledger key ${rawKey}.`);
      }
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
