#!/usr/bin/env node
import {
  createAnswerBlockerOutput,
  createStopOutput,
  type AutopilotNextAction,
  type AutopilotOutput,
} from "./openspec-autopilot-output.ts";

type TestCase = {
  name: string;
  run: () => void;
};

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
}

function assertEmptySelection(output: AutopilotOutput): void {
  assert(output.selection.mode === "serial_default", `Expected serial_default selection mode, got ${String(output.selection.mode)}.`);
  assert(output.selection.maxImplementationClaims === 1, `Expected maxImplementationClaims=1, got ${String(output.selection.maxImplementationClaims)}.`);
  assert(output.selection.candidates.length === 0, `Expected empty selection candidates, got ${output.selection.candidates.length}.`);
}

function assertStoppedEntry(actual: Record<string, unknown> | undefined, expected: Record<string, string>, label: string): void {
  assert(actual != null, `${label} expected stopped entry.`);
  for (const [key, value] of Object.entries(expected)) {
    assert(actual[key] === value, `${label} expected ${key}=${value}, got ${String(actual[key])}.`);
  }
  assert(actual.action === "stopped", `${label} must mark action=stopped.`);
  assert(actual.mutation === "plugin-owned-runtime-only", `${label} must mark plugin-owned runtime-only mutation.`);
}

const tests: TestCase[] = [
  {
    name: "answer blocker output recommends status without collect wording",
    run: () => {
      const output = createAnswerBlockerOutput("question-1");
      assert(output.outcome === "idle", `Expected idle acknowledgement, got ${output.outcome}.`);
      assert(output.reasonCode === "blocked_for_user", `Expected blocked_for_user, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assertEmptySelection(output);
      assert(output.loopGuard.equivalentCall === "autopilot_answer_blocker", `Expected answer-blocker loop guard, got ${output.loopGuard.equivalentCall}.`);
      assert(output.loopGuard.suppressRepeatRecommendation, "Answer-blocker output must suppress repeated answer recommendation.");
      assertNextAction(output.nextActions[0], { kind: "tool", safety: "safe", tool: "autopilot_status" });
      assert(!output.nextActions[0]?.reason.includes("Worker report collection"), "Answer-blocker output must not reuse collect-deferred wording.");
    },
  },
  {
    name: "rejected answer blocker output fails without progress claims",
    run: () => {
      const output = createAnswerBlockerOutput("unknown-question", { accepted: false, reason: "No pending plugin-owned blocker question exists for unknown-question." });
      assert(output.outcome === "failed", `Expected failed rejection, got ${output.outcome}.`);
      assert(output.reasonCode === "blocked_for_user", `Expected blocked_for_user, got ${output.reasonCode}.`);
      assert(output.summary.includes("unknown-question"), "Rejected answer-blocker output must name the rejected question id.");
      assertNoProgressClaims(output);
      assertEmptySelection(output);
      assert(output.loopGuard.equivalentCall === "autopilot_answer_blocker", `Expected answer-blocker loop guard, got ${output.loopGuard.equivalentCall}.`);
      assertNextAction(output.nextActions[0], { kind: "manual_review", safety: "requires_user" });
    },
  },
  {
    name: "stop returns no-active-state reason code",
    run: () => {
      const output = createStopOutput("task");
      assert(output.outcome === "idle", `Expected idle, got ${output.outcome}.`);
      assert(output.reasonCode === "stop_no_active_state", `Expected stop_no_active_state, got ${output.reasonCode}.`);
      assertNoProgressClaims(output);
      assertEmptySelection(output);
      assert(output.loopGuard.equivalentCall === "autopilot_stop", `Expected stop loop guard, got ${output.loopGuard.equivalentCall}.`);
      assert(output.loopGuard.suppressRepeatRecommendation, "Stop output must suppress repeated stop recommendation.");
      assertNoRepeatedTool(output, "autopilot_stop");
      assertNextAction(output.nextActions[0], { kind: "tool", safety: "safe", tool: "autopilot_status" });
    },
  },
  {
    name: "stop reports active task runtime state changed",
    run: () => {
      const output = createStopOutput("task", { id: "task-a", runtimeState: { activeRun: { runId: "run-1", taskIds: ["task-a"] } } });
      assert(output.outcome === "advanced", `Expected active task stop to advance, got ${output.outcome}.`);
      assert(output.reasonCode === "stop_applied", `Expected stop_applied, got ${output.reasonCode}.`);
      assert(output.tasksAdvanced.length === 1, `Expected one stopped task, got ${output.tasksAdvanced.length}.`);
      assertStoppedEntry(output.tasksAdvanced[0], { target: "task", taskId: "task-a", runId: "run-1" }, "active task stop");
      assertNextAction(output.nextActions[0], { kind: "tool", safety: "safe", tool: "autopilot_status" });
    },
  },
  {
    name: "stop reports active run runtime state changed",
    run: () => {
      const output = createStopOutput("run", { id: "run-1", runtimeState: { activeRun: { runId: "run-1", taskIds: ["task-a", "task-b"] } } });
      assert(output.outcome === "advanced", `Expected active run stop to advance, got ${output.outcome}.`);
      assert(output.reasonCode === "stop_applied", `Expected stop_applied, got ${output.reasonCode}.`);
      assert(output.tasksAdvanced.length === 1, `Expected one stopped run entry, got ${output.tasksAdvanced.length}.`);
      assertStoppedEntry(output.tasksAdvanced[0], { target: "run", runId: "run-1" }, "active run stop");
    },
  },
  {
    name: "stop all reports active run and task runtime state changed",
    run: () => {
      const output = createStopOutput("all", { runtimeState: { activeRun: { runId: "run-1", taskIds: ["task-a", "task-b"] } } });
      assert(output.outcome === "advanced", `Expected active all stop to advance, got ${output.outcome}.`);
      assert(output.reasonCode === "stop_applied", `Expected stop_applied, got ${output.reasonCode}.`);
      assert(output.tasksAdvanced.length === 3, `Expected run plus two task stop entries, got ${output.tasksAdvanced.length}.`);
      assertStoppedEntry(output.tasksAdvanced[0], { target: "run", runId: "run-1" }, "active all stop run entry");
      assertStoppedEntry(output.tasksAdvanced[1], { target: "task", taskId: "task-a" }, "active all stop task-a entry");
      assertStoppedEntry(output.tasksAdvanced[2], { target: "task", taskId: "task-b" }, "active all stop task-b entry");
    },
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
