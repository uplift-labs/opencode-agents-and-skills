#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyAutopilotEvent,
  classifyAutopilotToolExecutionAfter,
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

function scheduledJob(decision: AutopilotTriggerDecision): AutopilotTriggerJob {
  assert(decision.action === "scheduled", `Expected scheduled decision, got ${decision.action}.`);
  return firstJob(decision);
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
  {
    name: "post-tool checkpoints schedule cheap checks only after progress",
    run: () => {
      const materialized = classifyAutopilotToolExecutionAfter(
        { tool: "autopilot_run_next", sessionID: "session-1", callID: "call-1", args: {} },
        {
          output: JSON.stringify({
            reasonCode: "ledger_materialized",
            tasksAdvanced: [{ taskId: "task-a", changeId: "change-a" }],
            loopGuard: { repeatedNoProgress: false },
          }),
          metadata: { service: "openspec-autopilot" },
        },
        { postToolCheckpoints: { debounceMs: 17 } },
      );
      const checkJob = scheduledJob(materialized);
      assert(checkJob.kind === "check", `Expected cheap check after materialized ledger, got ${checkJob.kind}.`);
      assert(checkJob.sourceEvent === "tool.execute.after", `Expected tool.execute.after source, got ${checkJob.sourceEvent}.`);
      assert(checkJob.scope?.changeId === "change-a", `Expected change-a scope, got ${JSON.stringify(checkJob.scope)}.`);
      assert(checkJob.scope?.taskId === "task-a", `Expected task-a scope, got ${JSON.stringify(checkJob.scope)}.`);
      assert(checkJob.sourceID === "autopilot_run_next:call-1", `Expected sanitized tool source, got ${checkJob.sourceID}.`);
      assert(checkJob.debounceMs === 17, `Expected configured debounce, got ${checkJob.debounceMs}.`);
      assert(checkJob.cooldownMs === 1000, `Expected default cooldown, got ${checkJob.cooldownMs}.`);
      assert(checkJob.requiresRuntimeOwnership === false, "Post-tool checkpoint must not require runtime ownership.");
      assert(checkJob.claimCapable === false, "Post-tool checkpoint must not be claim-capable.");

      const collected = classifyAutopilotToolExecutionAfter(
        { tool: "autopilot_collect", sessionID: "session-1", callID: "call-2", args: {} },
        {
          output: {
            reasonCode: "advanced",
            tasksAdvanced: [{ taskId: "task-b" }],
            loopGuard: { repeatedNoProgress: false },
          },
          metadata: { service: "openspec-autopilot" },
        },
      );
      const collectJob = scheduledJob(collected);
      assert(collectJob.kind === "check", `Expected cheap check after advanced collect, got ${collectJob.kind}.`);
      assert(collectJob.scope?.taskId === "task-b", `Expected task-b scope, got ${JSON.stringify(collectJob.scope)}.`);

      assertIgnored(
        classifyAutopilotToolExecutionAfter(
          { tool: "autopilot_run_next", sessionID: "session-1", callID: "call-3", args: {} },
          {
            output: JSON.stringify({
              outcome: "idle",
              reasonCode: "ready_runtime_deferred",
              loopGuard: { repeatedNoProgress: true, suppressRepeatRecommendation: true },
            }),
          },
        ),
        "no-progress",
      );
      assertIgnored(
        classifyAutopilotToolExecutionAfter(
          { tool: "bash", sessionID: "session-1", callID: "call-4", args: {} },
          { output: "{}" },
        ),
        "unsupported tool",
      );
      assertIgnored(
        classifyAutopilotToolExecutionAfter(
          { tool: "autopilot_run_next", sessionID: "session-1", callID: "call-5", args: {} },
          { output: "{}" },
          { postToolCheckpoints: { enabled: false } },
        ),
        "disabled",
      );
    },
  },
  {
    name: "post-tool checkpoints classify conflicts and progress output shapes",
    run: () => {
      const rawString = classifyAutopilotToolExecutionAfter(
        { tool: "autopilot_run_next", sessionID: "session-1", callID: "call:raw\nunsafe", args: {} },
        JSON.stringify({ outcome: "advanced", tasksStarted: [{ taskId: "task-started", path: "openspec/changes/change-started/automation/task.json" }] }),
        { postToolCheckpoints: { cooldownMs: 33 } },
      );
      const rawJob = scheduledJob(rawString);
      assert(rawJob.kind === "check", `Expected raw string progress to schedule check, got ${rawJob.kind}.`);
      assert(rawJob.sourceID === "autopilot_run_next:call_raw_unsafe", `Expected sanitized sourceID, got ${rawJob.sourceID}.`);
      assert(rawJob.scope?.changeId === "change-started", `Expected path-derived change-started scope, got ${JSON.stringify(rawJob.scope)}.`);
      assert(rawJob.scope?.taskId === "task-started", `Expected task-started scope, got ${JSON.stringify(rawJob.scope)}.`);
      assert(rawJob.cooldownMs === 33, `Expected configured cooldown, got ${rawJob.cooldownMs}.`);

      const bareRecord = classifyAutopilotToolExecutionAfter(
        { tool: "autopilot_collect", sessionID: "session-1", callID: "call-bare", args: {} },
        { reasonCode: "advanced", tasksAdvanced: [{ taskId: "task-path", path: "openspec/changes/change-path/automation/task.json" }] },
      );
      const bareJob = scheduledJob(bareRecord);
      assert(bareJob.kind === "check", `Expected bare record progress to schedule check, got ${bareJob.kind}.`);
      assert(bareJob.scope?.changeId === "change-path", `Expected path-derived change-path scope, got ${JSON.stringify(bareJob.scope)}.`);
      assert(bareJob.scope?.taskId === "task-path", `Expected task-path scope, got ${JSON.stringify(bareJob.scope)}.`);

      const conflict = classifyAutopilotToolExecutionAfter(
        { tool: "autopilot_collect", sessionID: "session-1", callID: "call-conflict", args: {} },
        { output: { reasonCode: "runtime_evidence_conflict", taskSummaries: [{ taskId: "task-conflict", path: "openspec/changes/change-conflict/automation/task.json" }] } },
      );
      const conflictJob = scheduledJob(conflict);
      assert(conflictJob.kind === "status", `Expected conflict checkpoint to schedule status, got ${conflictJob.kind}.`);
      assert(conflictJob.scope?.changeId === "change-conflict", `Expected conflict change scope, got ${JSON.stringify(conflictJob.scope)}.`);
      assert(conflictJob.scope?.taskId === "task-conflict", `Expected conflict task scope, got ${JSON.stringify(conflictJob.scope)}.`);

      const selectionOnly = classifyAutopilotToolExecutionAfter(
        { tool: "autopilot_run_next", sessionID: "session-1", callID: "call-selection", args: {} },
        { output: { outcome: "advanced", selection: { selectedTaskId: "selected-task" } } },
      );
      const selectionJob = scheduledJob(selectionOnly);
      assert(selectionJob.scope?.taskId === "selected-task", `Expected selected-task scope, got ${JSON.stringify(selectionJob.scope)}.`);

      const multipleScopes = classifyAutopilotToolExecutionAfter(
        { tool: "autopilot_collect", sessionID: "session-1", callID: "call-multi", args: {} },
        { output: { reasonCode: "advanced", tasksAdvanced: [{ taskId: "left" }, { taskId: "right" }] } },
      );
      const multipleJob = scheduledJob(multipleScopes);
      assert(multipleJob.scope == null, `Multiple distinct advanced scopes must fall back to an unscoped check, got ${JSON.stringify(multipleJob.scope)}.`);
    },
  },
  {
    name: "post-tool checkpoints suppress each no-progress signal independently",
    run: () => {
      for (const reasonCode of [
        "ready_runtime_deferred",
        "no_ledgers",
        "active_change_handoff",
        "collect_deferred",
        "stop_no_active_state",
        "no_actionable_tasks",
      ]) {
        assertIgnored(
          classifyAutopilotToolExecutionAfter(
            { tool: "autopilot_run_next", sessionID: "session-1", callID: `call-${reasonCode}`, args: {} },
            { output: { reasonCode } },
          ),
          "no-progress",
        );
      }

      for (const loopGuard of [{ repeatedNoProgress: true }, { suppressRepeatRecommendation: true }]) {
        assertIgnored(
          classifyAutopilotToolExecutionAfter(
            { tool: "autopilot_collect", sessionID: "session-1", callID: "call-loop", args: {} },
            { output: { reasonCode: "idle", loopGuard } },
          ),
          "no-progress",
        );
      }
    },
  },
  {
    name: "post-tool checkpoints reject unsupported output shapes",
    run: () => {
      for (const output of [
        "not json",
        JSON.stringify([]),
        JSON.stringify("text"),
        { output: [], outcome: "advanced" },
        null,
        undefined,
      ]) {
        assertIgnored(
          classifyAutopilotToolExecutionAfter(
            { tool: "autopilot_run_next", sessionID: "session-1", callID: "call-bad", args: {} },
            output,
          ),
          "unsupported",
        );
      }
      assertIgnored(
        classifyAutopilotToolExecutionAfter(
          { tool: "autopilot_run_next", sessionID: "session-1", callID: "call-empty", args: {} },
          { output: {} },
        ),
        "did not report progress",
      );
    },
  },
  {
    name: "post-tool checkpoint modes preserve safe defaults",
    run: () => {
      const progressOutput = { output: { reasonCode: "advanced", tasksAdvanced: [{ taskId: "task-a" }] } };
      const defaults = scheduledJob(classifyAutopilotToolExecutionAfter({ tool: "autopilot_run_next", sessionID: "session-1", callID: "call-default", args: {} }, progressOutput));
      assert(defaults.debounceMs === 250, `Expected default debounce, got ${defaults.debounceMs}.`);
      assert(defaults.cooldownMs === 1000, `Expected default cooldown, got ${defaults.cooldownMs}.`);

      for (const triggerMode of ["observe", "controlled", "autonomous"] as const) {
        const job = scheduledJob(classifyAutopilotToolExecutionAfter({ tool: "autopilot_collect", sessionID: "session-1", callID: `call-${triggerMode}`, args: {} }, progressOutput, { triggerMode }));
        assert(job.kind === "check", `Expected ${triggerMode} mode to schedule check, got ${job.kind}.`);
        assert(job.claimCapable === false, `${triggerMode} post-tool checkpoint must not be claim-capable.`);
      }

      assertIgnored(
        classifyAutopilotToolExecutionAfter(
          { tool: "autopilot_run_next", sessionID: "session-1", callID: "call-off", args: {} },
          progressOutput,
          { triggerMode: "off" },
        ),
        "disabled",
      );
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
