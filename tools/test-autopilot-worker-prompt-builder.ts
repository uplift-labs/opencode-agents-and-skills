#!/usr/bin/env node
import { buildAutopilotWorkerPrompt } from "./autopilot-worker-prompt-builder.ts";
import type { AutopilotDispatchDecision } from "./autopilot-phase-dispatcher.ts";
import type { LedgerSummary } from "./openspec-autopilot-output.ts";

type TestCase = {
  name: string;
  run: () => void;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(text: string, expected: string, message: string): void {
  assert(text.includes(expected), `${message}: expected prompt to include ${JSON.stringify(expected)}.`);
}

function ledger(overrides: Partial<LedgerSummary> = {}): LedgerSummary {
  return {
    path: "openspec/changes/change-a/automation/task.json",
    id: "task-a",
    sourceKind: "ledger",
    taskType: "feature",
    status: "Ready",
    priority: "high",
    dependencies: [],
    writeScope: ["src/feature/**", "tests/feature/**"],
    forbiddenScope: ["openspec/changes/*/automation/**", ".autopilot/**"],
    writeScopeSize: 2,
    valid: true,
    errors: [],
    blockers: [],
    ledger: {
      schemaVersion: 1,
      id: "task-a",
      taskType: "feature",
      status: "Ready",
      priority: "high",
      dependencies: [],
      scope: {
        read: ["openspec/changes/change-a/**", "src/feature/**"],
        write: ["src/feature/**", "tests/feature/**"],
        forbidden: ["openspec/changes/*/automation/**", ".autopilot/**"],
      },
      autonomy: { allowCommit: false, allowPush: false, allowCreateMr: false, allowMerge: false },
      validation: {
        commands: [
          { command: "node tools/test-autopilot-worker-prompt-builder.ts", reason: "Focused prompt contract." },
          { command: "npm test", reason: "Full repository test gate." },
        ],
      },
      testDecision: { decision: "required", reason: "Behavior-changing runtime prompt contract." },
    },
    mr: { status: "none" },
    ...overrides,
  };
}

function decision(overrides: Partial<AutopilotDispatchDecision> = {}): AutopilotDispatchDecision {
  return {
    action: "dispatch",
    taskId: "task-a",
    taskType: "feature",
    phase: "analyze",
    fromStatus: "Ready",
    toStatus: "Analyze",
    workerGoal: "Analyze the selected task and produce the smallest safe implementation plan.",
    evidenceRequirements: ["planSummary", "slices", "scope", "testStrategy"],
    ...overrides,
  };
}

const tests: TestCase[] = [
  {
    name: "prompt includes phase goal and task identity",
    run: () => {
      const prompt = buildAutopilotWorkerPrompt({
        runId: "run-1",
        workerId: "worker-1",
        sessionId: "session-1",
        reportId: "report-1",
        ledger: ledger(),
        decision: decision(),
      });

      assertIncludes(prompt, "Task: task-a", "task identity");
      assertIncludes(prompt, "Task Type: feature", "task type");
      assertIncludes(prompt, "Phase: analyze", "phase name");
      assertIncludes(prompt, "Status Transition: Ready -> Analyze", "status transition");
      assertIncludes(prompt, "Analyze the selected task and produce the smallest safe implementation plan.", "worker goal");
      assertIncludes(prompt, "planSummary", "phase evidence requirement");
      assertIncludes(prompt, "testStrategy", "phase test strategy requirement");
    },
  },
  {
    name: "prompt includes scope boundaries and protected-path prohibition",
    run: () => {
      const prompt = buildAutopilotWorkerPrompt({
        runId: "run-1",
        workerId: "worker-1",
        sessionId: "session-1",
        reportId: "report-1",
        ledger: ledger(),
        decision: decision(),
      });

      assertIncludes(prompt, "Read Scope", "read scope heading");
      assertIncludes(prompt, "openspec/changes/change-a/**", "read scope path");
      assertIncludes(prompt, "Write Scope", "write scope heading");
      assertIncludes(prompt, "src/feature/**", "write scope path");
      assertIncludes(prompt, "tests/feature/**", "write scope path");
      assertIncludes(prompt, "Forbidden Scope", "forbidden scope heading");
      assertIncludes(prompt, "openspec/changes/*/automation/**", "protected automation scope");
      assertIncludes(prompt, ".autopilot/**", "protected runtime scope");
      assertIncludes(prompt, "Do not edit protected Autopilot paths", "protected path prohibition");
      assertIncludes(prompt, "Do not commit, push, create MRs, merge, deploy, or clean up worktrees", "autonomy prohibition");
    },
  },
  {
    name: "prompt includes validation expectations and strict report contract",
    run: () => {
      const prompt = buildAutopilotWorkerPrompt({
        runId: "run-1",
        workerId: "worker-1",
        sessionId: "session-1",
        reportId: "report-1",
        ledger: ledger(),
        decision: decision(),
      });

      assertIncludes(prompt, "node tools/test-autopilot-worker-prompt-builder.ts", "focused validation command");
      assertIncludes(prompt, "npm test", "full validation command");
      assertIncludes(prompt, "AUTOPILOT_WORKER_REPORT report-1 COMPLETE", "complete marker");
      for (const key of [
        '"schemaVersion": 1',
        '"reportId": "report-1"',
        '"runId": "run-1"',
        '"workerId": "worker-1"',
        '"sessionId": "session-1"',
        '"taskId": "task-a"',
        '"ledgerPath": "openspec/changes/change-a/automation/task.json"',
        '"fromStatus": "Ready"',
        '"toStatus": "Analyze"',
        '"changedFiles": []',
        '"validation": []',
        '"testDecision": "required"',
        '"secretScan"',
        '"evidence"',
        '"blockers": []',
        '"mr"',
      ]) {
        assertIncludes(prompt, key, `report contract key ${key}`);
      }
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
    console.error(`FAIL ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} autopilot worker prompt builder test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot worker prompt builder tests=${tests.length}`);
