#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRunNextOutput, readLedgerSummaries } from "./openspec-autopilot-output.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-autopilot-fixed-${name}-`));
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

function readyLedger(id: string, priority: string, writeScope: string[]): Record<string, unknown> {
  const ledger = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "valid-research.json"), "utf8")) as Record<string, unknown>;
  ledger.id = id;
  ledger.status = "Ready";
  ledger.history = [];
  ledger.priority = priority;
  ledger.mr = { required: true, status: "none" };
  ledger.scope = { read: ["openspec/**"], write: writeScope, forbidden: ["src/**", "openspec/changes/*/automation/**", ".autopilot/**"] };
  return ledger;
}

function assertWorktreeMap(actual: Record<string, string>, expected: Record<string, string>, label: string): void {
  assert(Object.keys(actual).length === Object.keys(expected).length, `Expected ${label} worktree map size ${Object.keys(expected).length}, got ${Object.keys(actual).length}: ${JSON.stringify(actual)}.`);
  for (const [taskId, worktreePath] of Object.entries(expected)) {
    assert(actual[taskId] === worktreePath, `Expected ${label} ${taskId} worktreePath=${worktreePath}, got ${String(actual[taskId])}.`);
  }
}

try {
  withTempRepo("wip-four", (repo) => {
    for (const [index, priority] of ["critical", "high", "medium", "low"].entries()) {
      const taskId = `task-${index + 1}`;
      writeLedger(repo, `change-${index + 1}`, readyLedger(taskId, priority, [`openspec/changes/change-${index + 1}/**`]));
    }
    const expectedWorktrees = {
      "task-1": "autopilot/change-1/task-1",
      "task-2": "autopilot/change-2/task-2",
      "task-3": "autopilot/change-3/task-3",
      "task-4": "autopilot/change-4/task-4",
    };
    const runtimeState: Record<string, unknown> = {
      parallelImplementation: {
        enabled: true,
        maxImplementationClaims: 4,
        lockedTaskIds: ["task-1", "task-2", "task-3", "task-4"],
        worktrees: expectedWorktrees,
      },
    };
    const output = createRunNextOutput(readLedgerSummaries(repo), {
      runtimeState,
    });
    assert(output.selection.mode === "parallel_implementation", `Expected fixed parallel mode, got ${output.selection.mode}.`);
    assert(output.selection.maxImplementationClaims === 4, `Expected fixed WIP 4, got ${output.selection.maxImplementationClaims}.`);
    assert(output.tasksStarted.length === 4, `Expected four fixed-mode starts, got ${output.tasksStarted.length}.`);
    assert(output.selection.candidates.every((candidate) => candidate.selected && candidate.parallelDecision === "parallel_started"), "Every fixed WIP candidate must be selected and parallel_started.");
    const selectedCandidateWorktrees = Object.fromEntries(output.selection.candidates.map((item) => [item.taskId, item.worktreePath]).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const startedWorktrees = Object.fromEntries(output.tasksStarted.map((item) => item as Record<string, unknown>).map((item) => [item.taskId, item.worktreePath]).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"));
    const activeRun = runtimeState.activeRun as Record<string, unknown> | undefined;
    assertWorktreeMap(selectedCandidateWorktrees, expectedWorktrees, "selection.candidates");
    assertWorktreeMap(startedWorktrees, expectedWorktrees, "tasksStarted");
    assertWorktreeMap(activeRun?.worktrees as Record<string, string>, expectedWorktrees, "activeRun.worktrees");
  });
  console.log("PASS fixed parallel implementation starts four guarded candidates");
} catch (error) {
  console.error("FAIL fixed parallel implementation starts four guarded candidates");
  console.error(error);
  process.exitCode = 1;
}
