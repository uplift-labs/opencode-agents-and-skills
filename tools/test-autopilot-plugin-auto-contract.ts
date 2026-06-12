#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import autopilotPlugin from "../.opencode/plugins/openspec-autopilot.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

type PluginToolResult = {
  output: string;
  metadata?: Record<string, unknown>;
};

type PluginToolDefinition = {
  execute: (args: Record<string, unknown>, context?: unknown) => Promise<string | PluginToolResult>;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8")) as Record<string, unknown>;
}

function readyResearchLedger(id: string): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = id;
  ledger.status = "Ready";
  ledger.history = [];
  ledger.mr = { required: true, status: "none" };
  return ledger;
}

function acceptanceResearchLedger(id: string, writeScope: string[]): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = id;
  ledger.scope = {
    read: ["docs/**", "openspec/**"],
    write: writeScope,
    forbidden: ["src/**", "openspec/changes/*/automation/**", ".autopilot/**"],
  };
  ledger.mr = {
    required: false,
    status: "not-required",
    noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR.",
  };
  return ledger;
}

function withTempRepo(name: string, run: (repo: string) => void | Promise<void>): Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-autopilot-plugin-auto-${name}-`));
  return Promise.resolve(run(repo)).finally(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });
}

function writeLedger(repo: string, changeId: string, ledger: Record<string, unknown>): void {
  const filePath = path.join(repo, "openspec", "changes", changeId, "automation", "task.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function snapshotFiles(rootPath: string, relativePath = ""): string[] {
  const current = path.join(rootPath, relativePath);
  return fs.readdirSync(current, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const entryRelativePath = path.join(relativePath, entry.name);
      const normalized = entryRelativePath.split(path.sep).join("/");
      const entryPath = path.join(rootPath, entryRelativePath);
      if (entry.isDirectory()) {
        return [`${normalized}/\n<DIR>`, ...snapshotFiles(rootPath, entryRelativePath)];
      }
      return [`${normalized}\n${fs.readFileSync(entryPath, "utf8")}`];
    });
}

async function pluginTools(repo: string, options: Record<string, unknown> = {}): Promise<Record<string, PluginToolDefinition>> {
  const hooks = await autopilotPlugin.server({ directory: repo, worktree: repo } as never, options as never);
  assert(typeof hooks.tool === "object" && hooks.tool != null && !Array.isArray(hooks.tool), "Autopilot plugin server must return a tool map.");
  return hooks.tool as Record<string, PluginToolDefinition>;
}

async function executePluginTool(tools: Record<string, PluginToolDefinition>, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const definition = tools[name];
  assert(definition != null, `Missing plugin tool ${name}.`);
  const result = await definition.execute(args, undefined);
  assert(typeof result === "object" && result != null && !Array.isArray(result), `${name} must return structured tool output.`);
  assert(typeof result.output === "string", `${name} must return a JSON output string.`);
  return JSON.parse(result.output) as Record<string, unknown>;
}

function taskStarts(output: Record<string, unknown>): Array<Record<string, unknown>> {
  assert(Array.isArray(output.tasksStarted), "tasksStarted must be an array.");
  return output.tasksStarted.map((item) => {
    assert(typeof item === "object" && item != null && !Array.isArray(item), "tasksStarted entries must be objects.");
    return item as Record<string, unknown>;
  });
}

function taskAdvancements(output: Record<string, unknown>): Array<Record<string, unknown>> {
  assert(Array.isArray(output.tasksAdvanced), "tasksAdvanced must be an array.");
  return output.tasksAdvanced.map((item) => {
    assert(typeof item === "object" && item != null && !Array.isArray(item), "tasksAdvanced entries must be objects.");
    return item as Record<string, unknown>;
  });
}

function assertNoProgressClaims(output: Record<string, unknown>, label: string): void {
  assert(Array.isArray(output.tasksStarted) && output.tasksStarted.length === 0, `${label} must not claim started tasks.`);
  assert(Array.isArray(output.tasksAdvanced) && output.tasksAdvanced.length === 0, `${label} must not claim advanced tasks.`);
}

const tests: TestCase[] = [
  {
    name: "plugin run_next exposes auto parallel output contract when auto policy is enabled",
    run: () => withTempRepo("auto-parallel-contract", async (repo) => {
      const taskA = readyResearchLedger("task-a");
      const taskB = readyResearchLedger("task-b");
      (taskA.scope as Record<string, unknown>).write = ["openspec/changes/change-a/**"];
      (taskB.scope as Record<string, unknown>).write = ["openspec/changes/change-b/**"];
      writeLedger(repo, "change-a", taskA);
      writeLedger(repo, "change-b", taskB);
      const runtimeState = {
        parallelImplementation: {
          enabled: true,
          mode: "auto",
          lockedTaskIds: ["task-a", "task-b"],
          worktrees: {
            "task-a": "autopilot/change-a/task-a",
            "task-b": "autopilot/change-b/task-b",
          },
        },
      };
      const before = snapshotFiles(repo);
      const tools = await pluginTools(repo, { runtimeState });
      const result = await executePluginTool(tools, "autopilot_run_next", {});
      const selection = result.selection as Record<string, unknown>;
      const autoDecision = selection.autoDecision as Record<string, unknown> | undefined;

      assert(result.outcome === "advanced", `Expected auto policy run_next to advance, got ${String(result.outcome)}.`);
      assert(result.reasonCode === "advanced", `Expected auto policy reason advanced, got ${String(result.reasonCode)}.`);
      assert(selection.mode === "auto_parallel_implementation", `Expected auto selection mode, got ${String(selection.mode)}.`);
      assert(selection.maxImplementationClaims === 2, `Expected resolved numeric maxImplementationClaims=2, got ${String(selection.maxImplementationClaims)}.`);
      assert(typeof autoDecision === "object" && autoDecision != null && !Array.isArray(autoDecision), "Auto selection output must include autoDecision evidence.");
      assert(autoDecision.policy === "auto", `Expected autoDecision policy=auto, got ${String(autoDecision.policy)}.`);
      assert(autoDecision.fanInValidationRequired === true, "Auto multi-start output must require fan-in validation.");
      const starts = taskStarts(result);
      assert(starts.length === 2, `Expected auto policy to start two tasks, got ${starts.length}.`);
      assert(starts.map((start) => start.taskId).join(",") === "task-a,task-b", `Expected task-a,task-b starts, got ${starts.map((start) => String(start.taskId)).join(",")}.`);
      assert(starts.map((start) => start.worktreePath).join(",") === "autopilot/change-a/task-a,autopilot/change-b/task-b", `Expected worktree cleanup evidence on starts, got ${starts.map((start) => String(start.worktreePath)).join(",")}.`);
      assert(JSON.stringify((runtimeState as Record<string, unknown>).activeRun).includes("autopilot/change-a/task-a"), "Plugin runtime activeRun must retain task-a worktree evidence for cleanup.");
      assert(JSON.stringify((runtimeState as Record<string, unknown>).activeRun).includes("autopilot/change-b/task-b"), "Plugin runtime activeRun must retain task-b worktree evidence for cleanup.");

      const status = await executePluginTool(tools, "autopilot_status", {});
      assert(JSON.stringify(status.status).includes("autopilot/change-a/task-a"), "Plugin status must expose activeRun worktree diagnostics.");
      assert(JSON.stringify(status.status).includes("fanInValidationRequired"), "Plugin status must expose activeRun fan-in diagnostics.");

      const repeated = await executePluginTool(tools, "autopilot_run_next", {});
      assert(repeated.outcome === "failed", `Expected repeated active run_next to fail safely, got ${String(repeated.outcome)}.`);
      assert(repeated.reasonCode === "runtime_evidence_conflict", `Expected repeated active run_next runtime_evidence_conflict, got ${String(repeated.reasonCode)}.`);
      assert(taskStarts(repeated).length === 0, "Repeated active run_next must not duplicate-start active tasks.");
      assert(!JSON.stringify(repeated.selection).includes("parallel_started"), "Repeated active run_next must not expose parallel_started without tasksStarted.");
      assert(JSON.stringify(snapshotFiles(repo)) === JSON.stringify(before), "Auto parallel run_next must not mutate protected ledger files in the temp repo.");
    }),
  },
  {
    name: "plugin collect enforces fan-in soft-conflict resolution evidence",
    run: () => withTempRepo("auto-fan-in-soft-conflict-collect", async (repo) => {
      writeLedger(repo, "change-a", acceptanceResearchLedger("task-a", ["openspec/changes/change-a/**"]));
      writeLedger(repo, "change-b", acceptanceResearchLedger("task-b", ["openspec/changes/change-b/**"]));
      const missingResolutionState = {
        activeRun: {
          runId: "claim-task-a-task-b",
          taskIds: ["task-a", "task-b"],
          fanInValidationRequired: true,
          acceptedSoftConflictScopes: ["docs/catalog.md"],
        },
        workerReports: [
          {
            reportId: "done-missing-soft-resolution",
            taskId: "task-a",
            fromStatus: "Acceptance",
            toStatus: "Done",
            completedAt: "2026-06-10T00:04:00.000Z",
            evidence: {
              noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR.",
              fanInValidation: {
                status: "passed",
                workerReportsCollected: true,
                protectedLedgerMutation: false,
              },
            },
          },
        ],
      };
      const missingResolution = await executePluginTool(await pluginTools(repo, { runtimeState: missingResolutionState }), "autopilot_collect", { taskId: "task-a" });
      assert(missingResolution.outcome === "failed", `Expected missing soft conflict resolution to fail, got ${String(missingResolution.outcome)}.`);
      assert(missingResolution.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${String(missingResolution.reasonCode)}.`);
      assertNoProgressClaims(missingResolution, "missing soft conflict resolution collect");

      const passedState = {
        activeRun: {
          runId: "claim-task-a-task-b",
          taskIds: ["task-a", "task-b"],
          fanInValidationRequired: true,
          acceptedSoftConflictScopes: ["docs/catalog.md"],
        },
        workerReports: [
          {
            reportId: "done-with-soft-resolution",
            taskId: "task-a",
            fromStatus: "Acceptance",
            toStatus: "Done",
            completedAt: "2026-06-10T00:04:00.000Z",
            evidence: {
              noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR.",
              fanInValidation: {
                status: "passed",
                workerReportsCollected: true,
                protectedLedgerMutation: false,
                softConflictsResolved: true,
              },
            },
          },
        ],
      };
      const passedTools = await pluginTools(repo, { runtimeState: passedState });
      const passed = await executePluginTool(passedTools, "autopilot_collect", { taskId: "task-a" });
      assert(passed.outcome === "advanced", `Expected soft conflict fan-in collect to advance, got ${String(passed.outcome)}.`);
      assert(taskAdvancements(passed).length === 1, `Expected one fan-in collect advancement, got ${taskAdvancements(passed).length}.`);
      const repeated = await executePluginTool(passedTools, "autopilot_collect", { taskId: "task-a" });
      assert(repeated.reasonCode === "collect_deferred", `Expected repeated fan-in collect to defer consumed report, got ${String(repeated.reasonCode)}.`);
      assertNoProgressClaims(repeated, "repeated soft conflict fan-in collect");
    }),
  },
  {
    name: "plugin stop prunes stopped task worktree metadata",
    run: () => withTempRepo("auto-stop-prunes-worktrees", async (repo) => {
      const runtimeState = {
        activeRun: {
          runId: "claim-task-a-task-b",
          taskIds: ["task-a", "task-b"],
          worktrees: {
            "task-a": "autopilot/change-a/task-a",
            "task-b": "autopilot/change-b/task-b",
          },
          fanInValidationRequired: true,
          acceptedSoftConflictScopes: ["docs/catalog.md"],
        },
      };
      const stopped = await executePluginTool(await pluginTools(repo, { runtimeState }), "autopilot_stop", { target: "task", id: "task-a", reason: "pause" });
      assert(stopped.reasonCode === "stop_applied", `Expected stop_applied, got ${String(stopped.reasonCode)}.`);
      const activeRun = runtimeState.activeRun as Record<string, unknown>;
      assert(JSON.stringify(activeRun.taskIds) === JSON.stringify(["task-b"]), `Expected only task-b active, got ${JSON.stringify(activeRun.taskIds)}.`);
      assert(JSON.stringify(activeRun.worktrees) === JSON.stringify({ "task-b": "autopilot/change-b/task-b" }), `Expected stopped task worktree pruned, got ${JSON.stringify(activeRun.worktrees)}.`);
      assert(activeRun.fanInValidationRequired == null, "Single remaining task must not retain fan-in requirement.");
      assert(activeRun.acceptedSoftConflictScopes == null, "Single remaining task must not retain soft-conflict scopes.");
    }),
  },
];

for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    console.error(`FAIL ${test.name}`);
    console.error(error);
    process.exitCode = 1;
  }
}
