#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRunNextOutput,
  readLedgerSummaries,
  type AutopilotOutput,
  type LedgerSummary,
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

function readyLedgerWithTaskType(id: string, taskType: string, priority: string, writeScope: string[]): Record<string, unknown> {
  const ledger = readyLedgerWithSelectionInputs(id, priority, writeScope);
  ledger.taskType = taskType;
  if (["feature", "bugfix", "refactor", "tooling"].includes(taskType)) {
    ledger.testDecision = { decision: "required", reason: "Implementation-bearing task requires focused test evidence." };
    ledger.phaseProfile = {
      analyze: { required: true, depth: "deep" },
      implementation: { required: true, mode: "test-first" },
      review: { required: true, mode: "code-test-review" },
      acceptance: { required: true, mr: "policy" },
    };
    ledger.reviewPolicy = {
      required: [
        { reviewer: "code-quality-reviewer", status: "pending", reason: "Implementation-bearing task requires code-quality review." },
        { reviewer: "test-coverage-reviewer", status: "pending", reason: "Implementation-bearing task requires test coverage review." },
      ],
      skipped: [],
    };
  }
  if (taskType === "docs") {
    ledger.testDecision = { decision: "not-applicable", reason: "Documentation-only task has no executable behavior." };
    ledger.reviewPolicy = { required: [], skipped: [] };
  }
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

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoProgressClaims(output: AutopilotOutput): void {
  assert(Array.isArray(output.tasksStarted) && output.tasksStarted.length === 0, "Deferred/no-op output must not claim started tasks.");
  assert(Array.isArray(output.tasksAdvanced) && output.tasksAdvanced.length === 0, "Deferred/no-op output must not claim advanced tasks.");
}

function assertNoParallelStartedSelection(output: AutopilotOutput): void {
  assert(output.selection.candidates.every((candidate) => candidate.parallelDecision !== "parallel_started" && candidate.selectionReason !== "parallel_started"), "No-start output must not expose parallel_started selection evidence.");
}

function assertSelection(output: AutopilotOutput, expected: { mode?: string; maxImplementationClaims?: number; selectedTaskId?: string; candidates: Array<{ taskId: string; rank: number | null; selected: boolean; selectionReason: string; parallelDecision: string }> }): void {
  assert(typeof output.selection === "object" && output.selection != null && !Array.isArray(output.selection), "Output must include top-level selection evidence.");
  assert(output.selection.mode === (expected.mode ?? "serial_default"), `Expected selection mode ${expected.mode ?? "serial_default"}, got ${String(output.selection.mode)}.`);
  assert(output.selection.maxImplementationClaims === (expected.maxImplementationClaims ?? 1), `Expected maxImplementationClaims=${expected.maxImplementationClaims ?? 1}, got ${String(output.selection.maxImplementationClaims)}.`);
  assert(output.selection.selectedTaskId === expected.selectedTaskId, `Expected selectedTaskId=${expected.selectedTaskId ?? "undefined"}, got ${String(output.selection.selectedTaskId)}.`);
  assert(output.selection.candidates.length === expected.candidates.length, `Expected ${expected.candidates.length} selection candidates, got ${output.selection.candidates.length}.`);
  for (const [index, expectedCandidate] of expected.candidates.entries()) {
    const actual = output.selection.candidates[index];
    assert(actual.taskId === expectedCandidate.taskId, `Expected candidate[${index}].taskId=${expectedCandidate.taskId}, got ${String(actual.taskId)}.`);
    assert(actual.rank === expectedCandidate.rank, `Expected candidate[${index}].rank=${String(expectedCandidate.rank)}, got ${String(actual.rank)}.`);
    assert(actual.selected === expectedCandidate.selected, `Expected candidate[${index}].selected=${String(expectedCandidate.selected)}, got ${String(actual.selected)}.`);
    assert(actual.selectionReason === expectedCandidate.selectionReason, `Expected candidate[${index}].selectionReason=${expectedCandidate.selectionReason}, got ${String(actual.selectionReason)}.`);
    assert(actual.parallelDecision === expectedCandidate.parallelDecision, `Expected candidate[${index}].parallelDecision=${expectedCandidate.parallelDecision}, got ${String(actual.parallelDecision)}.`);
  }
}

function autoDecisionOf(output: AutopilotOutput): Record<string, unknown> {
  const selection = output.selection as unknown as Record<string, unknown>;
  const decision = selection.autoDecision;
  assert(typeof decision === "object" && decision != null && !Array.isArray(decision), "selection.autoDecision must be present for auto mode.");
  return decision as Record<string, unknown>;
}

function assertAutoDecision(output: AutopilotOutput, expected: { riskClass: string; resolvedMaxImplementationClaims: number; fanInValidationRequired: boolean; maxAutoClaims?: number; conflictTolerance?: string; acceptedSoftConflictScopes?: string[]; rejectedReasonIncludes?: string }): void {
  const decision = autoDecisionOf(output);
  assert(decision.policy === "auto", `Expected auto policy evidence, got ${String(decision.policy)}.`);
  assert(typeof decision.maxAutoClaims === "number" && Number.isInteger(decision.maxAutoClaims), `Expected numeric maxAutoClaims, got ${String(decision.maxAutoClaims)}.`);
  assert(decision.conflictTolerance === "none" || decision.conflictTolerance === "small", `Expected conflictTolerance none|small, got ${String(decision.conflictTolerance)}.`);
  assert(typeof decision.decisionReason === "string" && decision.decisionReason.trim().length > 0, "Expected non-empty auto decisionReason.");
  assert(Array.isArray(decision.acceptedSoftConflictScopes), "Expected acceptedSoftConflictScopes array.");
  assert(Array.isArray(decision.rejectedReasons), "Expected rejectedReasons array.");
  assert(decision.riskClass === expected.riskClass, `Expected auto riskClass=${expected.riskClass}, got ${String(decision.riskClass)}.`);
  assert(decision.resolvedMaxImplementationClaims === expected.resolvedMaxImplementationClaims, `Expected resolvedMaxImplementationClaims=${expected.resolvedMaxImplementationClaims}, got ${String(decision.resolvedMaxImplementationClaims)}.`);
  assert(decision.fanInValidationRequired === expected.fanInValidationRequired, `Expected fanInValidationRequired=${String(expected.fanInValidationRequired)}, got ${String(decision.fanInValidationRequired)}.`);
  if (expected.maxAutoClaims != null) {
    assert(decision.maxAutoClaims === expected.maxAutoClaims, `Expected maxAutoClaims=${expected.maxAutoClaims}, got ${String(decision.maxAutoClaims)}.`);
  }
  if (expected.conflictTolerance != null) {
    assert(decision.conflictTolerance === expected.conflictTolerance, `Expected conflictTolerance=${expected.conflictTolerance}, got ${String(decision.conflictTolerance)}.`);
  }
  if (expected.acceptedSoftConflictScopes) {
    assert(JSON.stringify(decision.acceptedSoftConflictScopes) === JSON.stringify(expected.acceptedSoftConflictScopes), `Expected acceptedSoftConflictScopes=${JSON.stringify(expected.acceptedSoftConflictScopes)}, got ${JSON.stringify(decision.acceptedSoftConflictScopes)}.`);
  }
  if (expected.rejectedReasonIncludes) {
    assert(Array.isArray(decision.rejectedReasons) && decision.rejectedReasons.some((reason) => typeof reason === "string" && reason.includes(expected.rejectedReasonIncludes)), `Expected rejectedReasons to include ${expected.rejectedReasonIncludes}.`);
  }
}

function assertWorktreeMap(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  assert(Object.keys(actual).length === Object.keys(expected).length, `Expected ${label} worktree map size ${Object.keys(expected).length}, got ${Object.keys(actual).length}: ${JSON.stringify(actual)}.`);
  for (const [taskId, worktreePath] of Object.entries(expected)) {
    assert(actual[taskId] === worktreePath, `Expected ${label} ${taskId} worktreePath=${worktreePath}, got ${String(actual[taskId])}.`);
  }
}

function assertStartedWorktrees(output: AutopilotOutput, expected: Record<string, string>, runtimeState?: Record<string, unknown>): void {
  const selectedCandidateWorktrees = Object.fromEntries(output.selection.candidates.filter((item) => item.selected && typeof item.worktreePath === "string").map((item) => [item.taskId, item.worktreePath as string]));
  const startedWorktrees = Object.fromEntries(output.tasksStarted.map((item) => item as Record<string, unknown>).filter((item) => typeof item.taskId === "string" && typeof item.worktreePath === "string").map((item) => [item.taskId as string, item.worktreePath as string]));
  assertWorktreeMap(selectedCandidateWorktrees, expected, "selection.candidates");
  assertWorktreeMap(startedWorktrees, expected, "tasksStarted");
  if (runtimeState != null) {
    const activeWorktrees = (runtimeState.activeRun as Record<string, unknown> | undefined)?.worktrees as Record<string, string> | undefined;
    assert(activeWorktrees != null, "Expected activeRun worktree cleanup evidence.");
    assertWorktreeMap(activeWorktrees, expected, "activeRun.worktrees");
  }
}

const tests: TestCase[] = [
  {
    name: "auto parallel implementation resolves disjoint feature candidates to WIP 2",
    run: () => withTempRepo("selection-auto-standard", (repo) => {
      writeLedger(repo, "first", readyLedgerWithTaskType("task-first", "feature", "high", ["features/first/**"]));
      writeLedger(repo, "second", readyLedgerWithTaskType("task-second", "feature", "medium", ["features/second/**"]));
      writeLedger(repo, "third", readyLedgerWithTaskType("task-third", "feature", "low", ["features/third/**"]));
      const runtimeState: Record<string, unknown> = { parallelImplementation: { enabled: true, mode: "auto", lockedTaskIds: ["task-first", "task-second", "task-third"], worktrees: { "task-first": "autopilot/first/task-first", "task-second": "autopilot/second/task-second", "task-third": "autopilot/third/task-third" } } };
      const output = createRunNextOutput(readLedgerSummaries(repo), { runtimeState });
      assert(output.outcome === "advanced", `Expected auto standard implementation to advance, got ${output.outcome}.`);
      assert(output.tasksStarted.length === 2, `Expected auto WIP 2 to start two tasks, got ${output.tasksStarted.length}.`);
      assertStartedWorktrees(output, { "task-first": "autopilot/first/task-first", "task-second": "autopilot/second/task-second" }, runtimeState);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 2,
        selectedTaskId: "task-first",
        candidates: [
          { taskId: "task-first", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-second", rank: 2, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-third", rank: 3, selected: false, selectionReason: "wip_limit", parallelDecision: "not_parallel_safe" },
        ],
      });
      assertAutoDecision(output, { riskClass: "standard_parallel", resolvedMaxImplementationClaims: 2, fanInValidationRequired: true });
    }),
  },
  {
    name: "auto parallel implementation permits larger low-risk docs fan-out within cap",
    run: () => withTempRepo("selection-auto-low-risk", (repo) => {
      writeLedger(repo, "docs-a", readyLedgerWithTaskType("task-docs-a", "docs", "high", ["docs/a/**"]));
      writeLedger(repo, "docs-b", readyLedgerWithTaskType("task-docs-b", "docs", "medium", ["docs/b/**"]));
      writeLedger(repo, "docs-c", readyLedgerWithTaskType("task-docs-c", "docs", "low", ["docs/c/**"]));
      writeLedger(repo, "docs-d", readyLedgerWithTaskType("task-docs-d", "docs", "low", ["docs/d/**"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            maxImplementationClaims: "auto",
            maxAutoClaims: 4,
            lockedTaskIds: ["task-docs-a", "task-docs-b", "task-docs-c", "task-docs-d"],
            worktrees: {
              "task-docs-a": "autopilot/docs-a/task-docs-a",
              "task-docs-b": "autopilot/docs-b/task-docs-b",
              "task-docs-c": "autopilot/docs-c/task-docs-c",
              "task-docs-d": "autopilot/docs-d/task-docs-d",
            },
          },
        },
      });
      assert(output.outcome === "advanced", `Expected auto low-risk implementation to advance, got ${output.outcome}.`);
      assert(output.tasksStarted.length === 4, `Expected auto docs cap 4 to start four tasks, got ${output.tasksStarted.length}.`);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 4,
        selectedTaskId: "task-docs-a",
        candidates: [
          { taskId: "task-docs-a", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-docs-b", rank: 2, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-docs-c", rank: 3, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-docs-d", rank: 4, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
        ],
      });
      assertAutoDecision(output, { riskClass: "low_risk_parallel", resolvedMaxImplementationClaims: 4, fanInValidationRequired: true });
    }),
  },
  {
    name: "auto parallel implementation respects low-risk default and configured caps",
    run: () => withTempRepo("selection-auto-low-risk-caps", (repo) => {
      writeLedger(repo, "docs-a", readyLedgerWithTaskType("task-docs-a", "docs", "high", ["docs/a/**"]));
      writeLedger(repo, "docs-b", readyLedgerWithTaskType("task-docs-b", "docs", "medium", ["docs/b/**"]));
      writeLedger(repo, "docs-c", readyLedgerWithTaskType("task-docs-c", "docs", "low", ["docs/c/**"]));
      writeLedger(repo, "docs-d", readyLedgerWithTaskType("task-docs-d", "docs", "low", ["docs/d/**"]));
      const baseRuntimeState = {
        enabled: true,
        mode: "auto",
        lockedTaskIds: ["task-docs-a", "task-docs-b", "task-docs-c", "task-docs-d"],
        worktrees: {
          "task-docs-a": "autopilot/docs-a/task-docs-a",
          "task-docs-b": "autopilot/docs-b/task-docs-b",
          "task-docs-c": "autopilot/docs-c/task-docs-c",
          "task-docs-d": "autopilot/docs-d/task-docs-d",
        },
      };
      const defaultCap = createRunNextOutput(readLedgerSummaries(repo), { runtimeState: { parallelImplementation: baseRuntimeState } });
      assert(defaultCap.tasksStarted.length === 3, `Expected default low-risk cap 3, got ${defaultCap.tasksStarted.length}.`);
      assertAutoDecision(defaultCap, { riskClass: "low_risk_parallel", resolvedMaxImplementationClaims: 3, fanInValidationRequired: true, maxAutoClaims: 3 });

      const lowerCap = createRunNextOutput(readLedgerSummaries(repo), { runtimeState: { parallelImplementation: { ...baseRuntimeState, maxAutoClaims: 2 } } });
      assert(lowerCap.tasksStarted.length === 2, `Expected configured low-risk cap 2, got ${lowerCap.tasksStarted.length}.`);
      assertAutoDecision(lowerCap, { riskClass: "low_risk_parallel", resolvedMaxImplementationClaims: 2, fanInValidationRequired: true, maxAutoClaims: 2 });

      const upperClamp = createRunNextOutput(readLedgerSummaries(repo), { runtimeState: { parallelImplementation: { ...baseRuntimeState, maxAutoClaims: 10 } } });
      assert(upperClamp.tasksStarted.length === 4, `Expected low-risk upper clamp 4, got ${upperClamp.tasksStarted.length}.`);
      assertAutoDecision(upperClamp, { riskClass: "low_risk_parallel", resolvedMaxImplementationClaims: 4, fanInValidationRequired: true, maxAutoClaims: 10 });
    }),
  },
  {
    name: "auto parallel implementation accepts configured soft conflicts and records fan-in requirement",
    run: () => withTempRepo("selection-auto-soft-conflict", (repo) => {
      writeLedger(repo, "docs-a", readyLedgerWithTaskType("task-docs-a", "docs", "high", ["docs/a/**", "docs/catalog.md"]));
      writeLedger(repo, "docs-b", readyLedgerWithTaskType("task-docs-b", "docs", "medium", ["docs/b/**", "docs/catalog.md"]));
      const runtimeState: Record<string, unknown> = {
        parallelImplementation: {
          enabled: true,
          mode: "auto",
          conflictTolerance: "small",
          softConflictScopes: ["docs/catalog.md"],
          lockedTaskIds: ["task-docs-a", "task-docs-b"],
          worktrees: {
            "task-docs-a": "autopilot/docs-a/task-docs-a",
            "task-docs-b": "autopilot/docs-b/task-docs-b",
          },
        },
      };
      const output = createRunNextOutput(readLedgerSummaries(repo), { runtimeState });
      assert(output.outcome === "advanced", `Expected auto soft-conflict implementation to advance, got ${output.outcome}.`);
      assert(output.tasksStarted.length === 2, `Expected accepted soft conflict to start two tasks, got ${output.tasksStarted.length}.`);
      assertStartedWorktrees(output, { "task-docs-a": "autopilot/docs-a/task-docs-a", "task-docs-b": "autopilot/docs-b/task-docs-b" }, runtimeState);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 2,
        selectedTaskId: "task-docs-a",
        candidates: [
          { taskId: "task-docs-a", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-docs-b", rank: 2, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
        ],
      });
      assertAutoDecision(output, { riskClass: "soft_conflict_parallel", resolvedMaxImplementationClaims: 2, fanInValidationRequired: true, conflictTolerance: "small", acceptedSoftConflictScopes: ["docs/catalog.md"] });
      const activeRun = runtimeState.activeRun as Record<string, unknown> | undefined;
      assert(activeRun?.fanInValidationRequired === true, "Accepted soft conflict claim must record activeRun fan-in requirement.");
      assert(JSON.stringify(activeRun?.acceptedSoftConflictScopes) === JSON.stringify(["docs/catalog.md"]), `Expected activeRun accepted soft scope evidence, got ${JSON.stringify(activeRun?.acceptedSoftConflictScopes)}.`);
      assert(JSON.stringify(activeRun?.worktrees) === JSON.stringify({ "task-docs-a": "autopilot/docs-a/task-docs-a", "task-docs-b": "autopilot/docs-b/task-docs-b" }), `Expected activeRun worktree cleanup evidence, got ${JSON.stringify(activeRun?.worktrees)}.`);
    }),
  },
  {
    name: "auto parallel implementation rejects source overlaps even with small conflict tolerance",
    run: () => withTempRepo("selection-auto-source-overlap", (repo) => {
      writeLedger(repo, "first", readyLedgerWithTaskType("task-first", "feature", "high", ["features/shared.ts"]));
      writeLedger(repo, "second", readyLedgerWithTaskType("task-second", "feature", "medium", ["features/shared.ts"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            conflictTolerance: "small",
            softConflictScopes: ["features/shared.ts"],
            lockedTaskIds: ["task-first", "task-second"],
            worktrees: {
              "task-first": "autopilot/first/task-first",
              "task-second": "autopilot/second/task-second",
            },
          },
        },
      });
      assert(output.outcome === "advanced", `Expected safe serial auto claim, got ${output.outcome}.`);
      assert(output.tasksStarted.length === 1, `Expected source overlap to start only one task, got ${output.tasksStarted.length}.`);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 1,
        selectedTaskId: "task-first",
        candidates: [
          { taskId: "task-first", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-second", rank: 2, selected: false, selectionReason: "scope_conflict", parallelDecision: "not_parallel_safe" },
        ],
      });
      assertAutoDecision(output, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, acceptedSoftConflictScopes: [], rejectedReasonIncludes: "source/config overlap" });
    }),
  },
  {
    name: "auto parallel implementation rejects broad or primary-less soft conflicts",
    run: () => withTempRepo("selection-auto-soft-conflict-negative", (repo) => {
      writeLedger(repo, "broad-a", readyLedgerWithTaskType("task-broad-a", "docs", "high", ["docs/**"]));
      writeLedger(repo, "broad-b", readyLedgerWithTaskType("task-broad-b", "docs", "medium", ["docs/**"]));
      const broadOutput = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            conflictTolerance: "small",
            softConflictScopes: ["docs/catalog.md"],
            lockedTaskIds: ["task-broad-a", "task-broad-b"],
            worktrees: {
              "task-broad-a": "autopilot/broad-a/task-broad-a",
              "task-broad-b": "autopilot/broad-b/task-broad-b",
            },
          },
        },
      });
      assert(broadOutput.tasksStarted.length === 1, `Expected broad soft overlap to stay serial, got ${broadOutput.tasksStarted.length} starts.`);
      assertSelection(broadOutput, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 1,
        selectedTaskId: "task-broad-a",
        candidates: [
          { taskId: "task-broad-a", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-broad-b", rank: 2, selected: false, selectionReason: "scope_conflict", parallelDecision: "not_parallel_safe" },
        ],
      });
      assertAutoDecision(broadOutput, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, conflictTolerance: "small", acceptedSoftConflictScopes: [], rejectedReasonIncludes: "not declared" });
    }),
  },
  {
    name: "auto parallel implementation rejects soft conflicts without independent primary scopes",
    run: () => withTempRepo("selection-auto-soft-conflict-primaryless", (repo) => {
      writeLedger(repo, "only-a", readyLedgerWithTaskType("task-only-a", "docs", "critical", ["docs/catalog.md"]));
      writeLedger(repo, "only-b", readyLedgerWithTaskType("task-only-b", "docs", "high", ["docs/catalog.md"]));
      const primarylessOutput = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            conflictTolerance: "small",
            softConflictScopes: ["docs/catalog.md"],
            lockedTaskIds: ["task-only-a", "task-only-b"],
            worktrees: {
              "task-only-a": "autopilot/only-a/task-only-a",
              "task-only-b": "autopilot/only-b/task-only-b",
            },
          },
        },
      });
      assert(primarylessOutput.tasksStarted.length === 1, `Expected primary-less soft conflict to stay serial, got ${primarylessOutput.tasksStarted.length} starts.`);
      assertAutoDecision(primarylessOutput, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, conflictTolerance: "small", rejectedReasonIncludes: "independent primary" });
    }),
  },
  {
    name: "auto parallel implementation caps soft conflict fan-out at two",
    run: () => withTempRepo("selection-auto-soft-conflict-cap", (repo) => {
      writeLedger(repo, "soft-a", readyLedgerWithTaskType("task-soft-a", "docs", "medium", ["docs/a/**", "docs/catalog.md"]));
      writeLedger(repo, "soft-b", readyLedgerWithTaskType("task-soft-b", "docs", "low", ["docs/b/**", "docs/catalog.md"]));
      writeLedger(repo, "soft-c", readyLedgerWithTaskType("task-soft-c", "docs", "low", ["docs/c/**", "docs/catalog.md"]));
      const cappedOutput = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            conflictTolerance: "small",
            softConflictScopes: ["docs/catalog.md"],
            lockedTaskIds: ["task-soft-a", "task-soft-b", "task-soft-c"],
            worktrees: {
              "task-soft-a": "autopilot/soft-a/task-soft-a",
              "task-soft-b": "autopilot/soft-b/task-soft-b",
              "task-soft-c": "autopilot/soft-c/task-soft-c",
            },
          },
        },
      });
      assert(cappedOutput.tasksStarted.length === 2, `Expected soft conflict cap to start two tasks, got ${cappedOutput.tasksStarted.length}.`);
      assertAutoDecision(cappedOutput, { riskClass: "soft_conflict_parallel", resolvedMaxImplementationClaims: 2, fanInValidationRequired: true, conflictTolerance: "small", acceptedSoftConflictScopes: ["docs/catalog.md"] });

      const serialCapOutput = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            maxAutoClaims: 1,
            conflictTolerance: "small",
            softConflictScopes: ["docs/catalog.md"],
            lockedTaskIds: ["task-soft-a", "task-soft-b", "task-soft-c"],
            worktrees: {
              "task-soft-a": "autopilot/soft-a/task-soft-a",
              "task-soft-b": "autopilot/soft-b/task-soft-b",
              "task-soft-c": "autopilot/soft-c/task-soft-c",
            },
          },
        },
      });
      assert(serialCapOutput.tasksStarted.length === 1, `Expected soft conflict maxAutoClaims=1 to start one task, got ${serialCapOutput.tasksStarted.length}.`);
      assertAutoDecision(serialCapOutput, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, maxAutoClaims: 1, conflictTolerance: "small", acceptedSoftConflictScopes: [], rejectedReasonIncludes: "cap" });
    }),
  },
  {
    name: "auto parallel implementation serializes low-risk task types with unsafe scopes",
    run: () => withTempRepo("selection-auto-low-risk-unsafe", (repo) => {
      writeLedger(repo, "docs-a", readyLedgerWithTaskType("task-docs-a", "docs", "high", ["tools/a.ts"]));
      writeLedger(repo, "docs-b", readyLedgerWithTaskType("task-docs-b", "docs", "medium", ["tools/b.ts"]));
      writeLedger(repo, "docs-c", readyLedgerWithTaskType("task-docs-c", "docs", "low", ["tools/c.ts"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            lockedTaskIds: ["task-docs-a", "task-docs-b", "task-docs-c"],
            worktrees: {
              "task-docs-a": "autopilot/docs-a/task-docs-a",
              "task-docs-b": "autopilot/docs-b/task-docs-b",
              "task-docs-c": "autopilot/docs-c/task-docs-c",
            },
          },
        },
      });
      assert(output.tasksStarted.length === 1, `Expected unsafe docs scopes to stay serial, got ${output.tasksStarted.length} starts.`);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 1,
        selectedTaskId: "task-docs-a",
        candidates: [
          { taskId: "task-docs-a", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-docs-b", rank: 2, selected: false, selectionReason: "wip_limit", parallelDecision: "not_parallel_safe" },
          { taskId: "task-docs-c", rank: 3, selected: false, selectionReason: "wip_limit", parallelDecision: "not_parallel_safe" },
        ],
      });
      assertAutoDecision(output, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, rejectedReasonIncludes: "source/config/protected" });
    }),
  },
  {
    name: "auto parallel implementation falls back for central scopes and missing guards",
    run: () => withTempRepo("selection-auto-hard-stops", (repo) => {
      writeLedger(repo, "central", readyLedgerWithTaskType("task-central", "feature", "high", ["package.json"]));
      writeLedger(repo, "independent", readyLedgerWithTaskType("task-independent", "feature", "medium", ["features/independent/**"]));
      const centralOutput = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            lockedTaskIds: ["task-central", "task-independent"],
            worktrees: {
              "task-central": "autopilot/central/task-central",
              "task-independent": "autopilot/independent/task-independent",
            },
          },
        },
      });
      assert(centralOutput.outcome === "advanced", `Expected central-scope serial claim to advance, got ${centralOutput.outcome}.`);
      assert(centralOutput.tasksStarted.length === 1, `Expected central-scope fallback to start one task, got ${centralOutput.tasksStarted.length}.`);
      assertSelection(centralOutput, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 1,
        selectedTaskId: "task-central",
        candidates: [
          { taskId: "task-central", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-independent", rank: 2, selected: false, selectionReason: "wip_limit", parallelDecision: "not_parallel_safe" },
        ],
      });
      assertAutoDecision(centralOutput, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, rejectedReasonIncludes: "central coordination" });

      const missingGuardOutput = createRunNextOutput(readLedgerSummaries(repo), { runtimeState: { parallelImplementation: { enabled: true, mode: "auto" } } });
      assert(missingGuardOutput.outcome === "failed", `Expected missing guards to fail claim, got ${missingGuardOutput.outcome}.`);
      assert(missingGuardOutput.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${missingGuardOutput.reasonCode}.`);
      assert(missingGuardOutput.tasksStarted.length === 0, `Expected missing guards to start no tasks, got ${missingGuardOutput.tasksStarted.length}.`);
      assertSelection(missingGuardOutput, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 1,
        candidates: [
          { taskId: "task-central", rank: 1, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
          { taskId: "task-independent", rank: 2, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
        ],
      });
      assertAutoDecision(missingGuardOutput, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, rejectedReasonIncludes: "missing plugin-owned lock" });
    }),
  },
  {
    name: "auto parallel implementation serializes Autopilot coordination helper scopes",
    run: () => withTempRepo("selection-auto-autopilot-helper-scope", (repo) => {
      writeLedger(repo, "lifecycle", readyLedgerWithTaskType("task-lifecycle", "feature", "high", ["tools/autopilot-worktree-lifecycle.ts"]));
      writeLedger(repo, "independent", readyLedgerWithTaskType("task-independent", "feature", "medium", ["features/independent/**"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            lockedTaskIds: ["task-lifecycle", "task-independent"],
            worktrees: {
              "task-lifecycle": "autopilot/lifecycle/task-lifecycle",
              "task-independent": "autopilot/independent/task-independent",
            },
          },
        },
      });
      assert(output.tasksStarted.length === 1, `Expected Autopilot helper scope to stay serial, got ${output.tasksStarted.length} starts.`);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 1,
        selectedTaskId: "task-lifecycle",
        candidates: [
          { taskId: "task-lifecycle", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-independent", rank: 2, selected: false, selectionReason: "wip_limit", parallelDecision: "not_parallel_safe" },
        ],
      });
      assertAutoDecision(output, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, rejectedReasonIncludes: "central coordination" });
    }),
  },
  {
    name: "auto parallel implementation rejects unknown and unsupported scopes",
    run: () => withTempRepo("selection-auto-unknown-scopes", (repo) => {
      writeLedger(repo, "unknown", readyLedgerWithTaskType("task-unknown", "feature", "high", []));
      writeLedger(repo, "unsupported", readyLedgerWithTaskType("task-unsupported", "feature", "medium", ["**/*.ts"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            lockedTaskIds: ["task-unknown", "task-unsupported"],
            worktrees: {
              "task-unknown": "autopilot/unknown/task-unknown",
              "task-unsupported": "autopilot/unsupported/task-unsupported",
            },
          },
        },
      });
      assert(output.outcome === "failed", `Expected unknown/unsupported auto scopes to fail claim, got ${output.outcome}.`);
      assert(output.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${output.reasonCode}.`);
      assert(output.tasksStarted.length === 0, `Expected unknown/unsupported scopes to start no tasks, got ${output.tasksStarted.length}.`);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 1,
        candidates: [
          { taskId: "task-unknown", rank: 1, selected: false, selectionReason: "scope_conflict", parallelDecision: "not_parallel_safe" },
          { taskId: "task-unsupported", rank: 2, selected: false, selectionReason: "scope_conflict", parallelDecision: "not_parallel_safe" },
        ],
      });
      assertAutoDecision(output, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, rejectedReasonIncludes: "unknown or unsupported" });
    }),
  },
  {
    name: "auto parallel implementation rejects invalid worktree paths",
    run: () => withTempRepo("selection-auto-invalid-worktrees", (repo) => {
      writeLedger(repo, "absolute", readyLedgerWithTaskType("task-absolute", "feature", "high", ["features/absolute/**"]));
      writeLedger(repo, "traversal", readyLedgerWithTaskType("task-traversal", "feature", "medium", ["features/traversal/**"]));
      writeLedger(repo, "missing-task", readyLedgerWithTaskType("task-missing-task", "feature", "low", ["features/missing-task/**"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            lockedTaskIds: ["task-absolute", "task-traversal", "task-missing-task"],
            worktrees: {
              "task-absolute": "C:/tmp/autopilot/task-absolute",
              "task-traversal": "autopilot/../task-traversal",
              "task-missing-task": "autopilot/missing-task/worktree",
            },
          },
        },
      });
      assert(output.outcome === "failed", `Expected invalid auto worktrees to fail claim, got ${output.outcome}.`);
      assertNoProgressClaims(output);
      assertNoParallelStartedSelection(output);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 1,
        candidates: [
          { taskId: "task-absolute", rank: 1, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
          { taskId: "task-traversal", rank: 2, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
          { taskId: "task-missing-task", rank: 3, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
        ],
      });
    }),
  },
  {
    name: "auto parallel implementation rejects duplicate owned worktree paths",
    run: () => withTempRepo("selection-auto-duplicate-worktree", (repo) => {
      writeLedger(repo, "first", readyLedgerWithTaskType("task-first", "feature", "high", ["features/first/**"]));
      writeLedger(repo, "second", readyLedgerWithTaskType("task-second", "feature", "medium", ["features/second/**"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: { parallelImplementation: { enabled: true, mode: "auto", lockedTaskIds: ["task-first", "task-second"], worktrees: { "task-first": "autopilot/shared/task-first/task-second", "task-second": "autopilot/shared/task-first/task-second" } } },
      });
      assert(output.outcome === "advanced", `Expected one safe duplicate-worktree claim, got ${output.outcome}.`);
      assert(output.tasksStarted.length === 1, `Expected duplicate worktree to start only one task, got ${output.tasksStarted.length}.`);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 2,
        selectedTaskId: "task-first",
        candidates: [
          { taskId: "task-first", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-second", rank: 2, selected: false, selectionReason: "missing_parallel_guard", parallelDecision: "not_parallel_safe" },
        ],
      });
    }),
  },
  {
    name: "auto parallel implementation serializes dependency-gapped queues",
    run: () => withTempRepo("selection-auto-dependency-gap", (repo) => {
      writeLedger(repo, "first", readyLedgerWithTaskType("task-first", "feature", "high", ["features/first/**"]));
      writeLedger(repo, "second", readyLedgerWithTaskType("task-second", "feature", "medium", ["features/second/**"]));
      const dependent = readyLedgerWithTaskType("task-dependent", "feature", "low", ["features/dependent/**"]);
      dependent.dependencies = ["missing-dependency"];
      writeLedger(repo, "dependent", dependent);
      const output = createRunNextOutput(readLedgerSummaries(repo), {
        runtimeState: {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            lockedTaskIds: ["task-first", "task-second", "task-dependent"],
            worktrees: {
              "task-first": "autopilot/first/task-first",
              "task-second": "autopilot/second/task-second",
              "task-dependent": "autopilot/dependent/task-dependent",
            },
          },
        },
      });
      assert(output.outcome === "advanced", `Expected dependency-gapped auto queue to claim serial primary, got ${output.outcome}.`);
      assert(output.tasksStarted.length === 1, `Expected dependency gap to limit starts to one, got ${output.tasksStarted.length}.`);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 1,
        selectedTaskId: "task-first",
        candidates: [
          { taskId: "task-first", rank: 1, selected: true, selectionReason: "parallel_started", parallelDecision: "parallel_started" },
          { taskId: "task-second", rank: 2, selected: false, selectionReason: "wip_limit", parallelDecision: "not_parallel_safe" },
          { taskId: "task-dependent", rank: null, selected: false, selectionReason: "dependency_blocked", parallelDecision: "not_evaluated" },
        ],
      });
      assertAutoDecision(output, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, rejectedReasonIncludes: "dependency gaps" });
    }),
  },
  {
    name: "auto parallel implementation reports auto decision for dependency-blocked-only queues",
    run: () => withTempRepo("selection-auto-only-dependency-blocked", (repo) => {
      writeLedger(repo, "dependent", readyLedgerWithDependencies("task-dependent", ["missing-dependency"]));
      const output = createRunNextOutput(readLedgerSummaries(repo), { runtimeState: { parallelImplementation: { enabled: true, mode: "auto" } } });
      assert(output.reasonCode === "no_actionable_tasks", `Expected no_actionable_tasks, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assertSelection(output, {
        mode: "auto_parallel_implementation",
        maxImplementationClaims: 1,
        candidates: [{ taskId: "task-dependent", rank: null, selected: false, selectionReason: "dependency_blocked", parallelDecision: "not_evaluated" }],
      });
      assertAutoDecision(output, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, rejectedReasonIncludes: "dependency gaps" });
    }),
  },
  {
    name: "auto parallel implementation records global hard-stop decision evidence",
    run: () => {
      const autoRuntimeState = { parallelImplementation: { enabled: true, mode: "auto" } };
      withTempRepo("selection-auto-invalid-hard-stop", (repo) => {
        writeLedger(repo, "invalid", invalidReadyLedger());
        const output = createRunNextOutput(readLedgerSummaries(repo), { runtimeState: autoRuntimeState });
        assert(output.reasonCode === "invalid_ledgers", `Expected invalid_ledgers, got ${output.reasonCode}.`);
        assertNoProgressClaims(output);
        assertSelection(output, { mode: "auto_parallel_implementation", maxImplementationClaims: 1, candidates: [] });
        assertAutoDecision(output, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, rejectedReasonIncludes: "invalid ledgers" });
      });
      withTempRepo("selection-auto-blocked-hard-stop", (repo) => {
        writeLedger(repo, "blocked", blockedResearchLedger());
        const output = createRunNextOutput(readLedgerSummaries(repo), { runtimeState: autoRuntimeState });
        assert(output.reasonCode === "blocked_for_user", `Expected blocked_for_user, got ${output.reasonCode}.`);
        assertNoProgressClaims(output);
        assertSelection(output, { mode: "auto_parallel_implementation", maxImplementationClaims: 1, candidates: [] });
        assertAutoDecision(output, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, rejectedReasonIncludes: "user blockers" });
      });
      withTempRepo("selection-auto-mr-hard-stop", (repo) => {
        writeLedger(repo, "mr-wait", readFixture("valid-research.json"));
        const output = createRunNextOutput(readLedgerSummaries(repo), { runtimeState: autoRuntimeState });
        assert(output.reasonCode === "waiting_for_mr", `Expected waiting_for_mr, got ${output.reasonCode}.`);
        assertNoProgressClaims(output);
        assertSelection(output, { mode: "auto_parallel_implementation", maxImplementationClaims: 1, candidates: [] });
        assertAutoDecision(output, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false, rejectedReasonIncludes: "MR wait" });
      });
      withTempRepo("selection-auto-runtime-conflict-hard-stop", (repo) => {
        writeLedger(repo, "primary", readyLedgerWithTaskType("task-primary", "feature", "high", ["features/primary/**"]));
        const ledgersWithoutRawState = readLedgerSummaries(repo).map((ledger): LedgerSummary => ({ ...ledger, ledger: undefined }));
        const output = createRunNextOutput(ledgersWithoutRawState, {
          runtimeState: {
            parallelImplementation: {
              enabled: true,
              mode: "auto",
              lockedTaskIds: ["task-primary"],
              worktrees: { "task-primary": "autopilot/primary/task-primary" },
            },
          },
        });
        assert(output.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${output.reasonCode}.`);
        assertNoProgressClaims(output);
        assertNoParallelStartedSelection(output);
        assert(output.selection.selectedTaskId == null, "Runtime-conflict output must not preserve selectedTaskId without a started task.");
        assertAutoDecision(output, { riskClass: "serial_required", resolvedMaxImplementationClaims: 1, fanInValidationRequired: false });
      });
    },
  },
];

for (const test of tests) {
  try {
    test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    console.error(`FAIL ${test.name}`);
    console.error(error);
    process.exitCode = 1;
  }
}
