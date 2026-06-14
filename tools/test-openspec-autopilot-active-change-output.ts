#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRunNextOutput,
  readAutopilotQueueSummaries,
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
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-active-change-${name}-`));
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

function writeTasks(repo: string, changeId: string, markdown: string, options: { archived?: boolean } = {}): void {
  const base = options.archived === true ? path.join(repo, "openspec", "changes", "archive", changeId) : path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, "tasks.md"), markdown.replace(/\r\n/g, "\n"), "utf8");
}

function writeOpenSpecDoc(repo: string, changeId: string, fileName: "proposal.md" | "design.md" | "tasks.md", markdown: string): void {
  const base = path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, fileName), markdown.replace(/\r\n/g, "\n"), "utf8");
}

function writeTasksDirectory(repo: string, changeId: string): void {
  fs.mkdirSync(path.join(repo, "openspec", "changes", changeId, "tasks.md"), { recursive: true });
}

function writeChangeDirectorySymlink(repo: string, changeId: string, target: string): boolean {
  const changePath = path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(path.dirname(changePath), { recursive: true });
  try {
    fs.symlinkSync(target, changePath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch {
    return false;
  }
}

function readyResearchLedger(): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = "ready-research";
  ledger.status = "Ready";
  ledger.history = [];
  ledger.mr = { required: true, status: "none" };
  return ledger;
}

function readQueueOutput(repo: string, filter: { changeId?: string; taskId?: string } = {}): AutopilotOutput {
  const queue = readAutopilotQueueSummaries(repo, {}, filter);
  return createRunNextOutput(queue.ledgers, { dependencyGraph: queue.dependencyGraph });
}

function readQueueOutputWithRuntime(repo: string, runtimeState: Record<string, unknown>): AutopilotOutput {
  const queue = readAutopilotQueueSummaries(repo);
  return createRunNextOutput(queue.ledgers, { dependencyGraph: queue.dependencyGraph, runtimeState });
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
  assert(Array.isArray(output.tasksStarted) && output.tasksStarted.length === 0, "Active-change handoff must not claim started tasks.");
  assert(Array.isArray(output.tasksAdvanced) && output.tasksAdvanced.length === 0, "Active-change handoff must not claim advanced tasks.");
}

function assertNextAction(action: AutopilotNextAction | undefined, expected: { kind: string; safety: string }): void {
  assert(action != null, "Expected a next action.");
  assert(action.kind === expected.kind, `Expected next action kind ${expected.kind}, got ${action.kind}.`);
  assert(action.safety === expected.safety, `Expected next action safety ${expected.safety}, got ${action.safety}.`);
  for (const key of ["label", "reason", "expectedResult"] as const) {
    assert(typeof action[key] === "string" && action[key].trim().length > 0, `Next action must include non-empty ${key}.`);
  }
}

function assertSummary(summary: TaskActionabilitySummary | undefined, expected: Partial<TaskActionabilitySummary>): void {
  assert(summary != null, `Missing task summary for ${expected.taskId ?? "unknown task"}.`);
  for (const [key, value] of Object.entries(expected)) {
    assert(summary[key as keyof TaskActionabilitySummary] === value, `Expected summary ${key}=${String(value)}, got ${String(summary[key as keyof TaskActionabilitySummary])}.`);
  }
  const expectedPathSuffix = expected.sourceKind === "active-change" ? "tasks.md" : "automation/task.json";
  assert(summary.path.endsWith(expectedPathSuffix), `Summary must include compact ${expected.sourceKind ?? "ledger"} path.`);
}

function assertSelection(output: AutopilotOutput, expected: { selectedTaskId?: string; candidates: Array<{ taskId: string; rank: number | null; selected: boolean; selectionReason: string; parallelDecision: string; pathSuffix?: string }> }): void {
  assert(output.selection.mode === "serial_default", `Expected serial_default selection, got ${output.selection.mode}.`);
  assert(output.selection.maxImplementationClaims === 1, `Expected maxImplementationClaims=1, got ${output.selection.maxImplementationClaims}.`);
  assert(output.selection.selectedTaskId === expected.selectedTaskId, `Expected selectedTaskId=${expected.selectedTaskId ?? "undefined"}, got ${String(output.selection.selectedTaskId)}.`);
  assert(output.selection.candidates.length === expected.candidates.length, `Expected ${expected.candidates.length} candidates, got ${output.selection.candidates.length}.`);
  for (const [index, expectedCandidate] of expected.candidates.entries()) {
    const actual = output.selection.candidates[index];
    assert(actual.taskId === expectedCandidate.taskId, `Expected candidate[${index}].taskId=${expectedCandidate.taskId}, got ${actual.taskId}.`);
    assert(actual.path.endsWith(expectedCandidate.pathSuffix ?? "automation/task.json"), `candidate[${index}] must include compact path evidence.`);
    assert(actual.rank === expectedCandidate.rank, `Expected candidate[${index}].rank=${String(expectedCandidate.rank)}, got ${String(actual.rank)}.`);
    assert(actual.selected === expectedCandidate.selected, `Expected candidate[${index}].selected=${String(expectedCandidate.selected)}, got ${String(actual.selected)}.`);
    assert(actual.selectionReason === expectedCandidate.selectionReason, `Expected candidate[${index}].selectionReason=${expectedCandidate.selectionReason}, got ${actual.selectionReason}.`);
    assert(actual.parallelDecision === expectedCandidate.parallelDecision, `Expected candidate[${index}].parallelDecision=${expectedCandidate.parallelDecision}, got ${actual.parallelDecision}.`);
  }
}

function assertEmptySelection(output: AutopilotOutput): void {
  assertSelection(output, { candidates: [] });
}

const tests: TestCase[] = [
  {
    name: "active OpenSpec changes without ledgers return handoff selection",
    run: () => withTempRepo("handoff", (repo) => {
      writeTasks(repo, "z-change", "# Tasks\n\n- [ ] Later task\n- [x] Done task\n");
      writeTasks(repo, "a-change", "# Tasks\n\n- [ ] First task\n");
      writeTasks(repo, "complete-change", "# Tasks\n\n- [x] Done task\n");
      writeTasks(repo, "archived-change", "# Tasks\n\n- [ ] Archived task\n", { archived: true });
      const output = readQueueOutput(repo);
      assert(output.outcome === "idle", `Expected idle, got ${output.outcome}.`);
      assert(output.reasonCode === "active_change_handoff", `Expected active_change_handoff, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assert(output.taskSummaries.length === 2, `Expected two active-change summaries, got ${output.taskSummaries.length}.`);
      assertSummary(output.taskSummaries[0], { taskId: "a-change", taskType: "planning", status: "Ready", valid: true, actionability: "actionable", reasonCode: "active_change_handoff", sourceKind: "active-change", checkedTasks: 0, uncheckedTasks: 1, totalTasks: 1 });
      assertNextAction(output.nextActions[0], { kind: "manual_review", safety: "safe" });
      assert(output.nextActions[0]?.label === "Apply selected OpenSpec change", "Active-change handoff must name apply continuation.");
      assert(output.nextActions[0]?.expectedResult.includes("openspec-apply-change"), "Active-change handoff must route to openspec-apply-change.");
      assertNoRepeatedTool(output, "autopilot_run_next");
      assertSelection(output, {
        selectedTaskId: "a-change",
        candidates: [
          { taskId: "a-change", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated", pathSuffix: "tasks.md" },
          { taskId: "z-change", rank: 2, selected: false, selectionReason: "serial_default", parallelDecision: "not_parallel_safe", pathSuffix: "tasks.md" },
        ],
      });
    }),
  },
  {
    name: "empty scope arguments do not suppress active OpenSpec fallback",
    run: () => withTempRepo("empty-scope", (repo) => {
      writeTasks(repo, "a-change", "# Tasks\n\n- [ ] First task\n");
      const output = readQueueOutput(repo, { changeId: "", taskId: "" });
      assert(output.reasonCode === "active_change_handoff", `Expected active_change_handoff for empty scope args, got ${output.reasonCode}.`);
      assertSummary(output.taskSummaries[0], { taskId: "a-change", actionability: "actionable", reasonCode: "active_change_handoff", sourceKind: "active-change" });
      assertSelection(output, { selectedTaskId: "a-change", candidates: [{ taskId: "a-change", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated", pathSuffix: "tasks.md" }] });

      const whitespace = readQueueOutput(repo, { changeId: " \t ", taskId: " \n " });
      assert(whitespace.reasonCode === "active_change_handoff", `Expected active_change_handoff for whitespace scope args, got ${whitespace.reasonCode}.`);
      assertSummary(whitespace.taskSummaries[0], { taskId: "a-change", actionability: "actionable", reasonCode: "active_change_handoff", sourceKind: "active-change" });
      assertSelection(whitespace, { selectedTaskId: "a-change", candidates: [{ taskId: "a-change", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated", pathSuffix: "tasks.md" }] });
    }),
  },
  {
    name: "active OpenSpec preview exposes inferred dependency blocking",
    run: () => withTempRepo("schedule-preview", (repo) => {
      writeTasks(repo, "base-change", "# Tasks\n\n- [ ] Base task\n");
      writeTasks(repo, "scheduled-change", "# Tasks\n\n- [ ] Scheduled task\n");
      writeOpenSpecDoc(repo, "scheduled-change", "proposal.md", "# Proposal\n\nPriority: high\nDepends-On: base-change\n");
      const queue = readAutopilotQueueSummaries(repo);
      const scheduled = queue.ledgers.find((ledger) => ledger.id === "scheduled-change");
      assert(scheduled?.priority === "high", `Expected high priority preview, got ${String(scheduled?.priority)}.`);
      assert(JSON.stringify(scheduled?.dependencies) === JSON.stringify(["base-change"]), `Expected preview dependency, got ${JSON.stringify(scheduled?.dependencies)}.`);
      const output = createRunNextOutput(queue.ledgers, { dependencyGraph: queue.dependencyGraph });
      assert(JSON.stringify(output.changeGraph.levels) === JSON.stringify([["base-change"], ["scheduled-change"]]), `Expected stable changeGraph levels, got ${JSON.stringify(output.changeGraph.levels)}.`);
      assert(JSON.stringify(output.changeGraph.dependencyBlocked) === JSON.stringify([{ changeId: "scheduled-change", dependencies: ["base-change"] }]), `Expected machine-readable dependencyBlocked, got ${JSON.stringify(output.changeGraph.dependencyBlocked)}.`);
      assertSelection(output, {
        selectedTaskId: "base-change",
        candidates: [
          { taskId: "base-change", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated", pathSuffix: "tasks.md" },
          { taskId: "scheduled-change", rank: null, selected: false, selectionReason: "dependency_blocked", parallelDecision: "not_evaluated", pathSuffix: "tasks.md" },
        ],
      });
    }),
  },
  {
    name: "active OpenSpec fallback honors explicit change scope",
    run: () => withTempRepo("scoped", (repo) => {
      writeTasks(repo, "a-change", "# Tasks\n\n- [ ] A task\n");
      writeTasks(repo, "target-change", "# Tasks\n\n- [x] Done task\n- [ ] Target task\n");
      writeTasks(repo, "complete-change", "# Tasks\n\n- [x] Done task\n");
      writeTasks(repo, "archived-change", "# Tasks\n\n- [ ] Archived task\n", { archived: true });
      const output = readQueueOutput(repo, { changeId: "target-change" });
      assert(output.reasonCode === "active_change_handoff", `Expected active_change_handoff, got ${output.reasonCode}.`);
      assertSummary(output.taskSummaries[0], { taskId: "target-change", actionability: "actionable", reasonCode: "active_change_handoff", sourceKind: "active-change", checkedTasks: 1, uncheckedTasks: 1, totalTasks: 2 });
      assertSelection(output, { selectedTaskId: "target-change", candidates: [{ taskId: "target-change", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated", pathSuffix: "tasks.md" }] });
      const trimmedOutput = readQueueOutput(repo, { changeId: " target-change " });
      assert(trimmedOutput.reasonCode === "active_change_handoff", `Expected trimmed scope active_change_handoff, got ${trimmedOutput.reasonCode}.`);
      assertSummary(trimmedOutput.taskSummaries[0], { taskId: "target-change", actionability: "actionable", reasonCode: "active_change_handoff", sourceKind: "active-change", checkedTasks: 1, uncheckedTasks: 1, totalTasks: 2 });
      assertSelection(trimmedOutput, { selectedTaskId: "target-change", candidates: [{ taskId: "target-change", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated", pathSuffix: "tasks.md" }] });
      for (const changeId of ["missing-change", "complete-change", "archived-change"]) {
        const scoped = readQueueOutput(repo, { changeId });
        assert(scoped.reasonCode === "no_ledgers", `Expected ${changeId} to return no_ledgers, got ${scoped.reasonCode}.`);
        assert(scoped.taskSummaries.length === 0, `${changeId} must not silently select unscoped active work.`);
        assertEmptySelection(scoped);
      }
    }),
  },
  {
    name: "active OpenSpec queue handles absent and unsupported tasks without guessing",
    run: () => withTempRepo("unsupported", (repo) => {
      const emptyQueue = readQueueOutput(repo);
      assert(emptyQueue.reasonCode === "no_ledgers", `Expected empty repo no_ledgers, got ${emptyQueue.reasonCode}.`);
      assert(emptyQueue.taskSummaries.length === 0, "Empty repo must not include active-change summaries.");
      assertEmptySelection(emptyQueue);
      writeTasks(repo, "unchecked-change", "# Tasks\n\n- [ ] Valid task\n");
      writeTasksDirectory(repo, "unsupported-change");
      const unsupported = readQueueOutput(repo, { changeId: "unsupported-change" });
      assert(unsupported.reasonCode === "invalid_ledgers", `Expected unsupported tasks path invalid_ledgers, got ${unsupported.reasonCode}.`);
      assertSummary(unsupported.taskSummaries[0], { taskId: "unsupported-change", status: "Blocked", valid: false, actionability: "invalid", reasonCode: "invalid_ledgers", sourceKind: "active-change" });
      assert(unsupported.blockers[0]?.reason === "invalid active OpenSpec change tasks", `Expected source-aware active-change blocker reason, got ${String(unsupported.blockers[0]?.reason)}.`);
      assert(unsupported.blockers[0]?.path?.endsWith("tasks.md"), "Unsupported blocker must include tasks.md path evidence.");
      assertEmptySelection(unsupported);
      const taskIdScope = readQueueOutput(repo, { taskId: "unchecked-change" });
      assert(taskIdScope.reasonCode === "no_ledgers", `Expected taskId-only fallback no_ledgers, got ${taskIdScope.reasonCode}.`);
      assert(taskIdScope.taskSummaries.length === 0, "Active-change fallback must not treat taskId as changeId.");
    }),
  },
  {
    name: "active OpenSpec queue blocks symlinked change directories without reading target",
    run: () => withTempRepo("symlink-tasks", (repo) => {
      const outside = path.join(repo, "outside-change");
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(outside, "tasks.md"), "# Tasks\n\n- [ ] SHOULD_NOT_BE_READ_SECRET\n", "utf8");
      assert(writeChangeDirectorySymlink(repo, "symlink-change", outside), "Test requires directory symlink/junction support for active change guard.");
      const output = readQueueOutput(repo, { changeId: "symlink-change" });
      assert(output.reasonCode === "invalid_ledgers", `Expected symlinked tasks invalid_ledgers, got ${output.reasonCode}.`);
      assertSummary(output.taskSummaries[0], { taskId: "symlink-change", status: "Blocked", valid: false, actionability: "invalid", reasonCode: "invalid_ledgers", sourceKind: "active-change" });
      const blocker = output.blockers[0];
      assert(blocker?.reason === "invalid active OpenSpec change tasks", `Expected source-aware blocker reason, got ${String(blocker?.reason)}.`);
      assert(blocker.errors?.some((error) => error.includes("symlink") || error.includes("escape")) === true, "Symlinked tasks blocker must include detailed path safety evidence.");
      assert(!JSON.stringify(output).includes("SHOULD_NOT_BE_READ_SECRET"), "Active-change fallback must not read symlink target contents.");
    }),
  },
  {
    name: "ledger-backed state takes precedence over active-change fallback",
    run: () => withTempRepo("precedence", (repo) => {
      writeLedger(repo, "ledger-change", readyResearchLedger());
      writeTasks(repo, "ledger-change", "# Tasks\n\n- [ ] Ledger change task\n");
      writeTasks(repo, "active-change", "# Tasks\n\n- [ ] Active change task\n");
      const unscoped = readQueueOutput(repo);
      assert(unscoped.reasonCode === "ready_runtime_deferred", `Expected ledger-backed reason, got ${unscoped.reasonCode}.`);
      assertSummary(unscoped.taskSummaries[0], { taskId: "ready-research", sourceKind: "ledger", reasonCode: "ready_runtime_deferred" });
      const scopedActive = readQueueOutput(repo, { changeId: "active-change" });
      assert(scopedActive.reasonCode === "active_change_handoff", `Expected scoped active fallback, got ${scopedActive.reasonCode}.`);
      assertSummary(scopedActive.taskSummaries[0], { taskId: "active-change", sourceKind: "active-change", reasonCode: "active_change_handoff" });
    }),
  },
  {
    name: "active OpenSpec fallback never advances through runtime claim harness",
    run: () => withTempRepo("no-claim", (repo) => {
      writeTasks(repo, "active-change", "# Tasks\n\n- [ ] Active task\n");
      const claimed = readQueueOutputWithRuntime(repo, { claimReadyTasks: true });
      assert(claimed.outcome === "idle", `Expected claim-enabled active fallback to stay idle, got ${claimed.outcome}.`);
      assert(claimed.reasonCode === "active_change_handoff", `Expected active_change_handoff with claim runtime, got ${claimed.reasonCode}.`);
      assertNoProgressClaims(claimed);
      assertSelection(claimed, { selectedTaskId: "active-change", candidates: [{ taskId: "active-change", rank: 1, selected: true, selectionReason: "selected_primary", parallelDecision: "not_evaluated", pathSuffix: "tasks.md" }] });
      const parallel = readQueueOutputWithRuntime(repo, { parallelImplementation: { enabled: true, maxImplementationClaims: 2, lockedTaskIds: ["active-change"], worktrees: { "active-change": "autopilot/active-change" } } });
      assert(parallel.outcome === "idle", `Expected parallel-enabled active fallback to stay idle, got ${parallel.outcome}.`);
      assert(parallel.reasonCode === "active_change_handoff", `Expected active_change_handoff with parallel runtime, got ${parallel.reasonCode}.`);
      assertNoProgressClaims(parallel);
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
