#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyAutopilotEvent,
  classifyAutopilotTuiCommand,
  type AutopilotTriggerDecision,
  type AutopilotTriggerJob,
} from "./autopilot-programmatic-triggers.ts";
import { createAutopilotController } from "./openspec-autopilot-controller.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function withTempRepo(name: string, run: (repo: string) => void | Promise<void>): Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `autopilot-programmatic-triggers-${name}-`));
  return Promise.resolve(run(repo)).finally(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });
}

function writeTasks(repo: string, changeId: string, markdown: string): void {
  const filePath = path.join(repo, "openspec", "changes", changeId, "tasks.md");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, markdown.replace(/\r\n/g, "\n"), "utf8");
}

function firstJob(decision: AutopilotTriggerDecision): AutopilotTriggerJob {
  assert(decision.jobs.length === 1, `Expected exactly one trigger job, got ${decision.jobs.length}: ${JSON.stringify(decision)}`);
  return decision.jobs[0] as AutopilotTriggerJob;
}

function assertIgnored(decision: AutopilotTriggerDecision, reasonIncludes: string): void {
  assert(decision.action === "ignored", `Expected ignored decision, got ${decision.action}.`);
  assert(decision.jobs.length === 0, `Ignored decision must not schedule jobs: ${JSON.stringify(decision.jobs)}`);
  assert(decision.reason.includes(reasonIncludes), `Expected ignore reason to include ${reasonIncludes}, got ${decision.reason}.`);
}

const tests: TestCase[] = [
  {
    name: "shared controller materializes selected active change on run_next",
    run: () => withTempRepo("controller-active-change", async (repo) => {
      writeTasks(repo, "trigger-change", "# Tasks\n\n- [ ] Next task\n");
      const controller = createAutopilotController({ root: repo });
      const result = await controller.runNext({});
      assert(result.payload.reasonCode === "ledger_materialized", `Expected ledger_materialized, got ${result.payload.reasonCode}.`);
      assert(result.payload.selection.selectedTaskId === "trigger-change", "Controller must preserve active-change selection evidence.");
      assert(fs.existsSync(path.join(repo, "openspec", "changes", "trigger-change", "automation", "task.json")), "Controller run_next must publish the selected active-change task ledger.");
      assert(result.metadata.service === "openspec-autopilot", "Controller result metadata must identify the service.");
      assert(result.metadata.outcome === result.payload.outcome, "Controller metadata outcome must mirror payload outcome.");
    }),
  },
  {
    name: "file watcher classifies active tasks as observe status without run-next",
    run: () => {
      const decision = classifyAutopilotEvent({
        type: "file.watcher.updated",
        properties: { file: "C:\\repo\\openspec\\changes\\change-a\\tasks.md", event: "change" },
      });
      const job = firstJob(decision);
      assert(job.kind === "status", `Expected status job, got ${job.kind}.`);
      assert(job.scope?.changeId === "change-a", `Expected change-a scope, got ${JSON.stringify(job.scope)}.`);
      assert(job.sourceID === "openspec/changes/change-a/tasks.md", `Expected sanitized sourceID, got ${job.sourceID}.`);
      assert(job.requiresRuntimeOwnership === false, "Observe file trigger must not require runtime ownership.");
      assert(job.claimCapable === false, "Passive file trigger must not be claim-capable.");
    },
  },
  {
    name: "file watcher classifies ledger and evidence paths as cheap checks",
    run: () => {
      for (const file of [
        "openspec/changes/change-a/automation/task.json",
        "openspec/changes/change-a/retrospective.md",
        "openspec/changes/change-a/live-regression-report.md",
        "openspec/changes/change-a/automation/artifacts/report.json",
        "openspec/changes/change-a/automation/feedback/reviewer.json",
        ".\\openspec\\changes\\change-a\\automation\\task.json",
      ]) {
        const decision = classifyAutopilotEvent({ type: "file.watcher.updated", properties: { file, event: "change" } }, { fileWatch: { debounceMs: 17, cooldownMs: 29 } });
        const job = firstJob(decision);
        assert(job.kind === "check", `Expected check job for ${file}, got ${job.kind}.`);
        assert(job.scope?.changeId === "change-a", `Expected change-a scope for ${file}, got ${JSON.stringify(job.scope)}.`);
        assert(job.sourceID?.startsWith("openspec/changes/change-a/"), `Expected sanitized sourceID for ${file}, got ${job.sourceID}.`);
        assert(job.debounceMs === 17, `Expected configured debounce for ${file}, got ${job.debounceMs}.`);
        assert(job.cooldownMs === 29, `Expected configured cooldown for ${file}, got ${job.cooldownMs}.`);
        assert(job.requiresRuntimeOwnership === false, `Passive evidence trigger for ${file} must not require runtime ownership.`);
        assert(job.claimCapable === false, `Passive evidence trigger for ${file} must not be claim-capable.`);
      }
    },
  },
  {
    name: "unsupported and disabled file events are ignored",
    run: () => {
      assertIgnored(classifyAutopilotEvent({ type: "file.watcher.updated", properties: { file: "src/app.ts", event: "change" } }), "unsupported path");
      assertIgnored(classifyAutopilotEvent({ type: "file.watcher.updated", properties: { file: "openspec/changes/change-a/../change-b/tasks.md", event: "change" } }), "unsafe path");
      assertIgnored(classifyAutopilotEvent({ type: "file.watcher.updated", properties: { file: " ", event: "change" } }), "missing path");
      assertIgnored(classifyAutopilotEvent({ type: "file.watcher.updated", properties: { event: "change" } }), "missing path");
      assertIgnored(classifyAutopilotEvent({ type: "file.watcher.updated", properties: { file: "openspec/changes/change-a/tasks.md", event: "change" } }, { triggerMode: "off" }), "disabled");
      assertIgnored(classifyAutopilotEvent({ type: "file.watcher.updated", properties: { file: "openspec/changes/change-a/tasks.md", event: "change" } }, { fileWatch: { enabled: false } }), "disabled");
    },
  },
  {
    name: "controlled worker idle schedules one owned collect and ignores unknown sessions",
    run: () => {
      const owned = classifyAutopilotEvent(
        { type: "session.status", properties: { sessionID: "worker-1", status: { type: "idle" } } },
        { triggerMode: "controlled" },
        { workerSessions: [{ sessionID: "worker-1", taskId: "task-a", reportId: "report-a", reportConsumed: false }] },
      );
      const job = firstJob(owned);
      assert(job.kind === "collect", `Expected collect job, got ${job.kind}.`);
      assert(job.scope?.taskId === "task-a", `Expected task-a scope, got ${JSON.stringify(job.scope)}.`);
      assert(job.scope?.sessionID === "worker-1", "Collect job must preserve worker session evidence.");
      assert(job.requiresRuntimeOwnership === true, "Worker collect requires runtime ownership.");

      const consumed = classifyAutopilotEvent(
        { type: "session.status", properties: { sessionID: "worker-1", status: { type: "idle" } } },
        { triggerMode: "controlled" },
        { workerSessions: [{ sessionID: "worker-1", taskId: "task-a", reportId: "report-a", reportConsumed: true }] },
      );
      assertIgnored(consumed, "already consumed");
      assertIgnored(classifyAutopilotEvent({ type: "session.status", properties: { sessionID: "other", status: { type: "idle" } } }, { triggerMode: "controlled" }), "unknown worker session");
    },
  },
  {
    name: "message report markers wait for idle or completion evidence",
    run: () => {
      const decision = classifyAutopilotEvent(
        { type: "message.part.updated", properties: { sessionID: "worker-1", part: { type: "text", text: "AUTOPILOT_WORKER_REPORT report-a" } } },
        { triggerMode: "controlled" },
        { workerSessions: [{ sessionID: "worker-1", taskId: "task-a", reportId: "report-a", status: "busy" }] },
      );
      assertIgnored(decision, "waiting for worker idle");

      const noMarker = classifyAutopilotEvent(
        { type: "message.updated", properties: { sessionID: "worker-1", info: { role: "assistant" } } },
        { triggerMode: "controlled" },
        { workerSessions: [{ sessionID: "worker-1", taskId: "task-a", reportId: "report-a", status: "idle" }] },
      );
      assertIgnored(noMarker, "missing report marker");

      const mismatchedMarker = classifyAutopilotEvent(
        { type: "message.part.updated", properties: { sessionID: "worker-1", part: { type: "text", text: "AUTOPILOT_WORKER_REPORT other-report" } } },
        { triggerMode: "controlled" },
        { workerSessions: [{ sessionID: "worker-1", taskId: "task-a", reportId: "report-a", status: "idle" }] },
      );
      assertIgnored(mismatchedMarker, "report marker mismatch");

      const prefixCollisionMarker = classifyAutopilotEvent(
        { type: "message.part.updated", properties: { sessionID: "worker-1", part: { type: "text", text: "AUTOPILOT_WORKER_REPORT report-a1 COMPLETE" } } },
        { triggerMode: "controlled" },
        { workerSessions: [{ sessionID: "worker-1", taskId: "task-a", reportId: "report-a", status: "idle" }] },
      );
      assertIgnored(prefixCollisionMarker, "report marker mismatch");

      const partialMarker = classifyAutopilotEvent(
        { type: "message.part.updated", properties: { sessionID: "worker-1", part: { type: "text", text: "AUTOPILOT_WORKER_REPORT report-a" } } },
        { triggerMode: "controlled" },
        { workerSessions: [{ sessionID: "worker-1", taskId: "task-a", reportId: "report-a", status: "idle" }] },
      );
      assertIgnored(partialMarker, "incomplete report marker");

      const partialMessageMarker = classifyAutopilotEvent(
        { type: "message.updated", properties: { sessionID: "worker-1", info: { text: "AUTOPILOT_WORKER_REPORT report-a" } } },
        { triggerMode: "controlled" },
        { workerSessions: [{ sessionID: "worker-1", taskId: "task-a", reportId: "report-a", status: "idle" }] },
      );
      assertIgnored(partialMessageMarker, "incomplete report marker");

      const completeMarker = classifyAutopilotEvent(
        { type: "message.part.updated", properties: { sessionID: "worker-1", part: { type: "text", text: "AUTOPILOT_WORKER_REPORT report-a COMPLETE" } } },
        { triggerMode: "controlled" },
        { workerSessions: [{ sessionID: "worker-1", taskId: "task-a", reportId: "report-a", status: "idle" }] },
      );
      const job = firstJob(completeMarker);
      assert(job.kind === "collect", `Expected collect for complete marker, got ${job.kind}.`);
      assert(job.scope?.reportId === "report-a", `Expected report-a scope, got ${JSON.stringify(job.scope)}.`);
    },
  },
  {
    name: "blocker and permission replies require owned request evidence",
    run: () => {
      const blocker = classifyAutopilotEvent(
        { type: "question.replied", properties: { requestID: "question-request-1", label: "Proceed", action: "continue" } },
        { triggerMode: "controlled" },
        { blockerQuestions: [{ requestID: "question-request-1", questionId: "question-1", taskId: "task-a" }] },
      );
      const blockerJob = firstJob(blocker);
      assert(blockerJob.kind === "answer_blocker", `Expected answer_blocker job, got ${blockerJob.kind}.`);
      assert(blockerJob.blockerAnswer?.questionId === "question-1", "Blocker job must use plugin-owned question id.");
      assert(blockerJob.blockerAnswer?.taskId === "task-a", "Blocker job must preserve plugin-owned task id.");
      assert(blockerJob.blockerAnswer?.selectedLabel === "Proceed", "Blocker job must preserve selected label.");
      assert(blockerJob.blockerAnswer?.action === "continue", "Blocker job must preserve selected action.");

      const rejected = classifyAutopilotEvent(
        { type: "question.rejected", properties: { questionID: "question-request-1" } },
        { triggerMode: "controlled" },
        { blockerQuestions: [{ requestID: "question-request-1", questionId: "question-1", taskId: "task-a" }] },
      );
      const rejectedJob = firstJob(rejected);
      assert(rejectedJob.kind === "status", `Expected status for rejected blocker, got ${rejectedJob.kind}.`);
      assert(rejectedJob.scope?.requestID === "question-request-1", "Rejected blocker job must preserve request id scope.");

      const permission = classifyAutopilotEvent(
        { type: "permission.replied", properties: { permissionID: "permission-1", status: "rejected" } },
        { triggerMode: "controlled" },
        { pendingPermissions: [{ requestID: "permission-1", taskId: "task-a" }] },
      );
      const permissionJob = firstJob(permission);
      assert(permissionJob.kind === "status", `Expected status job for permission reply, got ${permissionJob.kind}.`);
      assert(permissionJob.scope?.taskId === "task-a", "Permission reply job must preserve task scope.");
      assert(permissionJob.requiresRuntimeOwnership === true, "Permission replies require runtime ownership.");

      assertIgnored(classifyAutopilotEvent({ type: "question.replied", properties: { requestID: "unknown" } }, { triggerMode: "controlled" }), "unknown blocker question");
      assertIgnored(classifyAutopilotEvent({ type: "question.replied", properties: { requestID: " " } }, { triggerMode: "controlled" }), "missing request id");
      assertIgnored(classifyAutopilotEvent({ type: "question.replied", properties: { requestID: "question-request-1" } }, { triggerMode: "observe" }, { blockerQuestions: [{ requestID: "question-request-1", questionId: "question-1" }] }), "disabled");
      assertIgnored(classifyAutopilotEvent({ type: "permission.replied", properties: { requestID: "unknown" } }, { triggerMode: "controlled" }), "unknown permission");
      assertIgnored(classifyAutopilotEvent({ type: "permission.replied", properties: { requestID: " " } }, { triggerMode: "controlled" }), "missing request id");
    },
  },
  {
    name: "workspace and worktree readiness require owned runtime waits",
    run: () => {
      const workspace = classifyAutopilotEvent(
        { type: "workspace.ready", properties: { name: "workspace-a" } },
        { triggerMode: "controlled" },
        { waitingWorkspaces: ["workspace-a"] },
      );
      const workspaceJob = firstJob(workspace);
      assert(workspaceJob.kind === "status", "Owned workspace ready should schedule status.");
      assert(workspaceJob.scope?.workspaceName === "workspace-a", `Expected workspace-a scope, got ${JSON.stringify(workspaceJob.scope)}.`);
      assert(workspaceJob.requiresRuntimeOwnership === true, "Workspace ready handling requires runtime ownership.");

      const workspaceFailed = classifyAutopilotEvent(
        { type: "workspace.failed", properties: { name: "workspace-a", message: "failed" } },
        { triggerMode: "controlled" },
        { waitingWorkspaces: ["workspace-a"] },
      );
      const workspaceFailedJob = firstJob(workspaceFailed);
      assert(workspaceFailedJob.kind === "stop", `Expected stop for workspace failure, got ${workspaceFailedJob.kind}.`);
      assert(workspaceFailedJob.scope?.workspaceName === "workspace-a", `Expected workspace-a failed scope, got ${JSON.stringify(workspaceFailedJob.scope)}.`);

      const worktree = classifyAutopilotEvent(
        { type: "worktree.failed", properties: { name: "worktree-a", message: "failed" } },
        { triggerMode: "controlled" },
        { waitingWorktrees: ["worktree-a"] },
      );
      const job = firstJob(worktree);
      assert(job.kind === "stop", `Expected stop job for owned worktree failure, got ${job.kind}.`);
      assert(job.scope?.worktreeName === "worktree-a", `Expected worktree-a scope, got ${JSON.stringify(job.scope)}.`);
      assert(job.requiresRuntimeOwnership === true, "Worktree failure handling requires runtime ownership.");

      const worktreeReady = classifyAutopilotEvent(
        { type: "worktree.ready", properties: { worktreeID: "worktree-a", branch: "autopilot/worktree-a" } },
        { triggerMode: "controlled" },
        { waitingWorktrees: ["worktree-a"] },
      );
      const worktreeReadyJob = firstJob(worktreeReady);
      assert(worktreeReadyJob.kind === "status", `Expected status for worktree ready, got ${worktreeReadyJob.kind}.`);
      assert(worktreeReadyJob.scope?.worktreeName === "worktree-a", `Expected worktree-a ready scope, got ${JSON.stringify(worktreeReadyJob.scope)}.`);

      assertIgnored(classifyAutopilotEvent({ type: "workspace.ready", properties: { name: "unknown" } }, { triggerMode: "controlled" }), "unknown workspace");
      assertIgnored(classifyAutopilotEvent({ type: "worktree.ready", properties: { name: "unknown" } }, { triggerMode: "controlled" }), "unknown worktree");
    },
  },
  {
    name: "TUI commands are explicit intent categories",
    run: () => {
      const status = classifyAutopilotTuiCommand("autopilot.status", { tuiCommands: { enabled: true } });
      assert(firstJob(status).kind === "status", "autopilot.status must map to status.");
      const check = classifyAutopilotTuiCommand("autopilot.check", { tuiCommands: { enabled: true } });
      assert(firstJob(check).kind === "check", "autopilot.check must map to check.");
      const run = classifyAutopilotTuiCommand("autopilot.run", { tuiCommands: { enabled: true } });
      const runJob = firstJob(run);
      assert(runJob.kind === "run_next", "autopilot.run must map to run_next intent.");
      assert(runJob.claimCapable === true, "Explicit TUI run intent may be claim-capable.");
      const stop = classifyAutopilotTuiCommand("autopilot.stop", { tuiCommands: { enabled: true } });
      assert(firstJob(stop).kind === "stop", "autopilot.stop must map to stop.");
      assertIgnored(classifyAutopilotTuiCommand("autopilot.status", { tuiCommands: { enabled: false } }), "TUI commands disabled");
      assertIgnored(classifyAutopilotTuiCommand("other.command", { tuiCommands: { enabled: true } }), "unsupported TUI command");
    },
  },
  {
    name: "autonomous run-next event remains disabled without full prerequisites",
    run: () => {
      const observe = classifyAutopilotEvent({ type: "session.status", properties: { sessionID: "worker-1", status: { type: "idle" } } }, { triggerMode: "autonomous", runNextEvents: { enabled: false } });
      assert(!observe.jobs.some((job) => job.kind === "run_next"), "Disabled runNextEvents must not schedule run_next.");

      const missingEvidence = classifyAutopilotEvent({ type: "session.status", properties: { sessionID: "worker-1", status: { type: "idle" } } }, { triggerMode: "autonomous", runNextEvents: { enabled: true } });
      assert(!missingEvidence.jobs.some((job) => job.kind === "run_next"), "Autonomous mode without active-run evidence must not schedule run_next.");

      assertIgnored(
        classifyAutopilotEvent(
          { type: "session.status", properties: { sessionID: "other-session", status: { type: "idle" } } },
          { triggerMode: "autonomous", runNextEvents: { enabled: true } },
          { activeRun: { runId: "run-1", taskIds: ["task-a"], locksValid: true, sessionIDs: ["session-1"] } },
        ),
        "plugin-owned session",
      );

      assertIgnored(
        classifyAutopilotEvent(
          { type: "session.status", properties: { sessionID: "stale-worker", status: { type: "idle" } } },
          { triggerMode: "autonomous", runNextEvents: { enabled: true } },
          {
            activeRun: { runId: "run-1", taskIds: ["task-a"], locksValid: true, sessionIDs: ["session-1"] },
            workerSessions: [{ sessionID: "stale-worker", taskId: "other-task", reportId: "report-other", status: "idle", reportConsumed: true }],
          },
        ),
        "plugin-owned session",
      );

      for (const [runtime, reason] of [
        [{ activeRun: { runId: "run-1", blockers: true, locksValid: true } }, "blockers"],
        [{ activeRun: { runId: "run-1", mrWait: true, locksValid: true } }, "MR wait"],
        [{ activeRun: { runId: "run-1", locksValid: false } }, "valid locks"],
      ] as const) {
        assertIgnored(
          classifyAutopilotEvent({ type: "session.status", properties: { sessionID: "session-1", status: { type: "idle" } } }, { triggerMode: "autonomous", runNextEvents: { enabled: true } }, runtime),
          reason,
        );
      }

      const allowed = classifyAutopilotEvent(
        { type: "session.status", properties: { sessionID: "session-1", status: { type: "idle" } } },
        { triggerMode: "autonomous", runNextEvents: { enabled: true, cooldownMs: 77 } },
        { activeRun: { runId: "run-1", taskIds: ["task-a"], locksValid: true, sessionIDs: ["session-1"] } },
      );
      const job = firstJob(allowed);
      assert(job.kind === "run_next", `Expected autonomous run_next, got ${job.kind}.`);
      assert(job.scope?.taskId === "task-a", `Expected task-a scope, got ${JSON.stringify(job.scope)}.`);
      assert(job.requiresRuntimeOwnership === true, "Autonomous run_next requires runtime ownership.");
      assert(job.claimCapable === true, "Autonomous run_next is claim-capable only after prerequisites pass.");
      assert(job.cooldownMs === 77, `Expected configured autonomous cooldown, got ${job.cooldownMs}.`);
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} autopilot programmatic trigger test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot programmatic trigger tests=${tests.length}`);
