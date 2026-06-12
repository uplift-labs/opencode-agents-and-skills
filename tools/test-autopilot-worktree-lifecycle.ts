#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  planArchiveWorktreeCleanup,
  planParallelWorktreeCreation,
  planWorktreeLifecycleFromInput,
  worktreePathForStream,
} from "./autopilot-worktree-lifecycle.ts";
import { createRunNextOutput, readLedgerSummaries } from "./openspec-autopilot-output.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");

type TestCase = {
  name: string;
  run: () => void;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertCommand(actual: unknown, expected: string[], label: string): void {
  assert(Array.isArray(actual), `${label} command must be argv array.`);
  assert(actual.length === expected.length && actual.every((value, index) => value === expected[index]), `${label} command mismatch. Expected ${expected.join(" ")}, got ${actual.join(" ")}.`);
}

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed with ${String(result.status)}: ${result.stderr}${result.stdout}`);
  return result.stdout;
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

const tests: TestCase[] = [
  {
    name: "parallel stream worktrees are created with deterministic unique paths",
    run: () => {
      const plan = planParallelWorktreeCreation([
        { taskId: "task-a", changeId: "change-a" },
        { taskId: "task-b", changeId: "change-b" },
      ], { baseRef: "main" });

      assert(plan.blockers.length === 0, `Expected no creation blockers, got ${JSON.stringify(plan.blockers)}.`);
      assert(plan.actions.length === 2, `Expected two create actions, got ${plan.actions.length}.`);
      assert(plan.worktrees["task-a"] === "autopilot/change-a/task-a", `Unexpected task-a worktree ${String(plan.worktrees["task-a"])}.`);
      assert(plan.worktrees["task-b"] === "autopilot/change-b/task-b", `Unexpected task-b worktree ${String(plan.worktrees["task-b"])}.`);
      assertCommand(plan.actions[0]?.command, ["git", "worktree", "add", "-b", "autopilot/change-a/task-a", "autopilot/change-a/task-a", "main"], "task-a create");
      assertCommand(plan.actions[1]?.command, ["git", "worktree", "add", "-b", "autopilot/change-b/task-b", "autopilot/change-b/task-b", "main"], "task-b create");
    },
  },
  {
    name: "parallel stream worktree creation rejects unsafe or duplicate paths",
    run: () => {
      const plan = planParallelWorktreeCreation([
        { taskId: "task-a", changeId: "change-a", worktreePath: "autopilot/shared/task-a/task-b" },
        { taskId: "task-b", changeId: "change-b", worktreePath: "autopilot/shared/task-a/task-b" },
        { taskId: "task-c", changeId: "change-c", worktreePath: "C:/tmp/task-c" },
        { taskId: "task-d", changeId: "change-d", worktreePath: "autopilot/change-d/task-c" },
        { taskId: "task-e", changeId: "change-e", worktreePath: "autopilot/../task-e" },
        { taskId: "task-f", changeId: "change-f", branch: "feature/task-f" },
      ]);

      assert(plan.actions.length === 0, `Unsafe creation plan must not emit actions, got ${JSON.stringify(plan.actions)}.`);
      assert(plan.blockers.some((blocker) => blocker.reason.includes("already assigned")), "Valid duplicate owned path must be blocked.");
      assert(plan.blockers.some((blocker) => blocker.reason.includes("owned relative autopilot path")), "Absolute path must be blocked as unowned.");
      assert(plan.blockers.some((blocker) => blocker.reason.includes("does not include task id")), "Mismatched task path must be blocked.");
      assert(plan.blockers.some((blocker) => blocker.reason.includes("traversal")), "Traversal path must be blocked.");
      assert(plan.blockers.some((blocker) => blocker.reason.includes("owned relative autopilot branch")), "Unsafe branch override must be blocked.");

      const badBaseRef = planParallelWorktreeCreation([{ taskId: "task-a", changeId: "change-a" }], { baseRef: "--upload-pack=evil" });
      assert(badBaseRef.actions.length === 0 && badBaseRef.blockers.some((blocker) => blocker.reason.includes("baseRef")), "Option-like baseRef must be blocked.");
    },
  },
  {
    name: "archive cleanup requires merged MR and archived change before remove",
    run: () => {
      const pending = planArchiveWorktreeCleanup([
        { taskId: "task-a", changeId: "change-a", worktreePath: "autopilot/change-a/task-a", branch: "autopilot/change-a/task-a", worktreeStatus: "created", mrStatus: "open", archiveStatus: "archived" },
        { taskId: "task-b", changeId: "change-b", worktreePath: "autopilot/change-b/task-b", branch: "autopilot/change-b/task-b", worktreeStatus: "created", mrStatus: "merged", archiveStatus: "completed" },
      ]);

      assert(pending.actions.length === 0, `Pending cleanup must not emit remove actions, got ${JSON.stringify(pending.actions)}.`);
      assert(pending.blockers.some((blocker) => blocker.taskId === "task-a" && blocker.reason.includes("MR merged")), "Open MR must block cleanup.");
      assert(pending.blockers.some((blocker) => blocker.taskId === "task-b" && blocker.reason.includes("archived")), "Unarchived change must block cleanup.");

      const ready = planArchiveWorktreeCleanup([
        { taskId: "task-a", changeId: "change-a", worktreePath: "autopilot/change-a/task-a", branch: "autopilot/change-a/task-a", worktreeStatus: "created", mrStatus: "merged", archiveStatus: "archived" },
        { taskId: "task-b", changeId: "change-b", worktreePath: "autopilot/change-b/task-b", branch: "autopilot/change-b/task-b", worktreeStatus: "removed", mrStatus: "merged", archiveStatus: "archived" },
      ]);

      assert(ready.blockers.length === 0, `Expected no cleanup blockers, got ${JSON.stringify(ready.blockers)}.`);
      assert(ready.actions.length === 2, `Expected remove plus prune actions, got ${ready.actions.length}.`);
      assertCommand(ready.actions[0]?.command, ["git", "worktree", "remove", "autopilot/change-a/task-a"], "task-a remove");
      assertCommand(ready.actions[1]?.command, ["git", "worktree", "prune"], "worktree prune");
    },
  },
  {
    name: "worktree path helper rejects unsafe identifiers instead of guessing",
    run: () => {
      assert(worktreePathForStream("change-a", "task-a") === "autopilot/change-a/task-a", "Safe identifiers must produce deterministic owned path.");
      assert(worktreePathForStream("../change", "task-a") == null, "Unsafe change id must not produce a path.");
      assert(worktreePathForStream("change-a", "task/a") == null, "Unsafe task id must not produce a path.");
    },
  },
  {
    name: "JSON lifecycle input plans create and cleanup modes",
    run: () => {
      const create = planWorktreeLifecycleFromInput({ mode: "create", streams: [{ taskId: "task-a", changeId: "change-a" }], options: { baseRef: "main" } });
      assert(create.actions[0]?.action === "create_worktree", `Expected create action, got ${String(create.actions[0]?.action)}.`);
      const cleanup = planWorktreeLifecycleFromInput({
        mode: "cleanup",
        records: [{ taskId: "task-a", changeId: "change-a", worktreePath: "autopilot/change-a/task-a", branch: "autopilot/change-a/task-a", worktreeStatus: "created", mrStatus: "merged", archiveStatus: "archived" }],
      });
      assert(cleanup.actions.some((action) => action.action === "remove_worktree"), "Cleanup JSON input must plan worktree removal.");
    },
  },
  {
    name: "documented node worktree planner emits parseable JSON",
    run: () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "autopilot-worktree-plan-"));
      try {
        const inputPath = path.join(tempDir, "plan.json");
        fs.writeFileSync(inputPath, JSON.stringify({ streams: [{ taskId: "task-a", changeId: "change-a" }], options: { baseRef: "main" } }), "utf8");
        const result = spawnSync(process.execPath, ["tools/autopilot-worktree-lifecycle.ts", "--input", inputPath], { cwd: root, encoding: "utf8" });
        assert(result.status === 0, `Expected node worktree planner to exit 0, got ${result.status}: ${result.stderr}`);
        const parsed = JSON.parse(result.stdout) as { actions?: unknown[] };
        assert(Array.isArray(parsed.actions) && parsed.actions.length === 1, `Expected one parsed action, got ${result.stdout}.`);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    },
  },
  {
    name: "planner-created git worktrees are used before parallel starts",
    run: () => {
      const repo = fs.mkdtempSync(path.join(os.tmpdir(), "autopilot-worktree-git-"));
      try {
        runGit(repo, ["init", "-b", "main"]);
        runGit(repo, ["config", "user.email", "autopilot@example.invalid"]);
        runGit(repo, ["config", "user.name", "Autopilot Test"]);
        fs.writeFileSync(path.join(repo, "README.md"), "# Autopilot Worktree Test\n", "utf8");
        runGit(repo, ["add", "README.md"]);
        runGit(repo, ["commit", "-m", "initial"]);

        const plan = planParallelWorktreeCreation([
          { taskId: "task-a", changeId: "change-a" },
          { taskId: "task-b", changeId: "change-b" },
        ], { baseRef: "HEAD" });
        assert(plan.blockers.length === 0, `Expected no worktree creation blockers, got ${JSON.stringify(plan.blockers)}.`);
        for (const action of plan.actions) {
          if (action.worktreePath != null) {
            fs.mkdirSync(path.dirname(path.join(repo, action.worktreePath)), { recursive: true });
          }
          runGit(repo, action.command.slice(1));
        }
        const worktreeList = runGit(repo, ["worktree", "list", "--porcelain"]).replace(/\\/g, "/");
        assert(worktreeList.includes(path.join(repo, "autopilot", "change-a", "task-a").replace(/\\/g, "/")), "git worktree list must include task-a worktree before runtime start.");
        assert(worktreeList.includes(path.join(repo, "autopilot", "change-b", "task-b").replace(/\\/g, "/")), "git worktree list must include task-b worktree before runtime start.");

        writeLedger(repo, "change-a", readyLedger("task-a", "high", ["openspec/changes/change-a/**"]));
        writeLedger(repo, "change-b", readyLedger("task-b", "medium", ["openspec/changes/change-b/**"]));
        const runtimeState: Record<string, unknown> = {
          parallelImplementation: {
            enabled: true,
            mode: "auto",
            lockedTaskIds: ["task-a", "task-b"],
            worktrees: plan.worktrees,
          },
        };
        const output = createRunNextOutput(readLedgerSummaries(repo), { runtimeState });
        assert(output.tasksStarted.length === 2, `Expected two starts after git worktree creation evidence, got ${output.tasksStarted.length}.`);
        assert(JSON.stringify(output.tasksStarted).includes("autopilot/change-a/task-a"), "Started task-a must retain planner-created worktree path.");
        assert(JSON.stringify(output.tasksStarted).includes("autopilot/change-b/task-b"), "Started task-b must retain planner-created worktree path.");
      } finally {
        fs.rmSync(repo, { recursive: true, force: true });
      }
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
