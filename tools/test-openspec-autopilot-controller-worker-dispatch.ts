#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEmptyAutopilotRuntimeSnapshot, createFileAutopilotRuntimeStore, createInMemoryAutopilotRuntimeStore, type AutopilotRunRecord, type AutopilotRuntimeStore } from "./autopilot-runtime-store.ts";
import type { AutopilotWorkerSessionAdapter, AutopilotWorkerSessionDispatchInput } from "./autopilot-worker-session-adapter.ts";
import { createAutopilotController } from "./openspec-autopilot-controller.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
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

function withTempRepo(name: string, run: (repo: string) => void | Promise<void>): Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-autopilot-controller-${name}-`));
  return Promise.resolve()
    .then(() => run(repo))
    .finally(() => fs.rmSync(repo, { recursive: true, force: true }));
}

function writeLedger(repo: string, changeId: string, ledger: Record<string, unknown>): void {
  const filePath = path.join(repo, "openspec", "changes", changeId, "automation", "task.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function ledgerPath(repo: string, changeId = "worker-dispatch"): string {
  return path.join(repo, "openspec", "changes", changeId, "automation", "task.json");
}

function readyLedger(): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = "worker-dispatch-task";
  ledger.status = "Ready";
  ledger.priority = "high";
  ledger.history = [];
  ledger.scope = {
    read: ["openspec/changes/worker-dispatch/**", "tools/**"],
    write: ["tools/**"],
    forbidden: ["openspec/changes/*/automation/**", ".autopilot/**"],
  };
  ledger.mr = { required: true, status: "none" };
  ledger.revision = { number: 7, contentHash: "sha256:test", updatedBy: "test", updatedAt: "2026-06-13T00:00:00.000Z" };
  return ledger;
}

function dependencyBlockedLedger(): Record<string, unknown> {
  return { ...readyLedger(), id: "dependency-blocked-task", dependencies: ["missing-prereq"] };
}

function reportText(run: AutopilotRunRecord, overrides: Record<string, unknown> = {}): string {
  return [
    "Worker complete.",
    `AUTOPILOT_WORKER_REPORT ${run.expectedReportId} COMPLETE`,
    JSON.stringify({
      schemaVersion: 1,
      reportId: run.expectedReportId,
      runId: run.runId,
      workerId: run.workerId,
      sessionId: run.workerSessionId,
      taskId: run.taskId,
      ledgerPath: run.ledgerPath,
      fromStatus: run.fromStatus,
      toStatus: run.expectedToStatus,
      changedFiles: [],
      validation: [],
      testDecision: "not-applicable",
      secretScan: { status: "not-applicable" },
      evidence: { summary: "Ready task analyzed." },
      blockers: [],
      mr: { status: "none" },
      ...overrides,
    }, null, 2),
  ].join("\n");
}

function blockerReportText(run: AutopilotRunRecord): string {
  return reportText(run, { blockers: [{ reason: "needs owner", questionId: "q-1" }] });
}

function mrWaitReportText(run: AutopilotRunRecord): string {
  return reportText(run, { mr: { status: "waiting-review", url: "https://example.invalid/mr/1" } });
}

async function firstRun(store: AutopilotRuntimeStore): Promise<AutopilotRunRecord> {
  const snapshot = await store.load();
  const run = Object.values(snapshot.snapshot.runs)[0];
  if (run == null) {
    throw new Error("Expected one stored runtime run.");
  }
  return run;
}

function fakeAdapter(calls: AutopilotWorkerSessionDispatchInput[], capability = true, readReport?: (input: { sessionId: string; reportId: string }) => Promise<string> | string): AutopilotWorkerSessionAdapter {
  return {
    async capability() {
      return capability ? { available: true } : { available: false, reason: "fake session API unavailable" };
    },
    async createSession(input) {
      calls.push(input);
      const sessionId = `session-${calls.length}`;
      return { ok: true, sessionId };
    },
    async promptSession(input) {
      return { ok: true, prompt: input.promptForSession(input.sessionId) };
    },
    async dispatch(input) {
      const created = await this.createSession(input);
      return created.ok ? { ok: true, sessionId: created.sessionId, prompt: input.promptForSession(created.sessionId) } : created;
    },
    async readFinalReport(input) {
      return readReport == null ? { ok: false, reason: "not used" } : { ok: true, text: await readReport(input) };
    },
  };
}

const tests: TestCase[] = [
  {
    name: "disabled worker dispatch preserves ready_runtime_deferred without starting workers",
    run: () => withTempRepo("disabled", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const before = fs.readFileSync(ledgerPath(repo), "utf8");
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const controller = createAutopilotController({ root: repo }, { workerSessionAdapter: fakeAdapter(calls) });
      const result = await controller.runNext({ changeId: "worker-dispatch" });
      assert(result.payload.reasonCode === "ready_runtime_deferred", `Expected ready_runtime_deferred, got ${result.payload.reasonCode}.`);
      assert(result.payload.tasksStarted.length === 0, "Disabled dispatch must not start workers.");
      assert(calls.length === 0, "Disabled dispatch must not call the worker adapter.");
      assert(fs.readFileSync(ledgerPath(repo), "utf8") === before, "Disabled dispatch must not mutate protected ledger bytes.");
    }),
  },
  {
    name: "enabled worker dispatch starts one child worker and records active runtime state",
    run: () => withTempRepo("enabled", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls),
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });
      const result = await controller.runNext({ changeId: "worker-dispatch" });
      const status = await controller.status({ changeId: "worker-dispatch" });
      const stored = await runtimeStore.load();
      const runs = Object.values(stored.snapshot.runs);
      const statusRecord = status.payload as unknown as { status?: { activeRun?: { runId?: string; sessionIDs?: string[] } } };

      assert(result.payload.outcome === "advanced", `Expected advanced outcome, got ${result.payload.outcome}.`);
      assert(result.payload.reasonCode === "advanced", `Expected advanced reason, got ${result.payload.reasonCode}.`);
      assert(result.payload.tasksStarted.length === 1, `Expected one started task, got ${result.payload.tasksStarted.length}.`);
      assert(calls.length === 1, `Expected one adapter dispatch, got ${calls.length}.`);
      assert(calls[0]?.taskId === "worker-dispatch-task", "Adapter input must target selected task.");
      assert(calls[0]?.reportId.includes("worker-dispatch-task"), "Adapter input must include deterministic report id evidence.");
      assert(calls[0]?.promptForSession("session-check").includes("AUTOPILOT_WORKER_REPORT"), "Worker prompt must include strict report marker.");
      assert(runs.length === 1, `Expected one durable runtime run, got ${runs.length}.`);
      assert(runs[0]?.status === "running", `Expected stored run status running, got ${runs[0]?.status}.`);
      assert(runs[0]?.workerSessionId === "session-1", `Expected stored worker session id, got ${runs[0]?.workerSessionId}.`);
      assert(runs[0]?.fromStatus === "Ready", "Stored run must preserve from-status revision evidence.");
      assert(runs[0]?.expectedToStatus === "Analyze", "Stored run must preserve expected to-status evidence.");
      assert(runs[0]?.ledgerRevision?.number === 7, "Stored run must preserve ledger revision number.");
      assert(statusRecord.status?.activeRun?.runId === runs[0]?.runId, "Status must expose compact active run id after dispatch.");
      assert(statusRecord.status?.activeRun?.sessionIDs?.includes("session-1") === true, "Status must expose active worker session id after dispatch.");
      assert(!JSON.stringify(status.payload).includes("AUTOPILOT_WORKER_REPORT"), "Status must not leak raw worker prompt/report text.");
    }),
  },
  {
    name: "active serial worker prevents duplicate claim",
    run: () => withTempRepo("active", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls),
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });

      const first = await controller.runNext({ changeId: "worker-dispatch" });
      const second = await controller.runNext({ changeId: "worker-dispatch" });

      assert(first.payload.reasonCode === "advanced", `Expected first runNext to dispatch, got ${first.payload.reasonCode}.`);
      assert(second.payload.reasonCode === "no_actionable_tasks", `Expected duplicate claim suppression as no_actionable_tasks, got ${second.payload.reasonCode}.`);
      assert(second.payload.tasksStarted.length === 0, "Duplicate claim suppression must not start tasks.");
      assert(second.payload.summary.includes("active serial worker"), `Duplicate claim summary must mention active serial worker, got ${second.payload.summary}.`);
      assert(calls.length === 1, `Expected exactly one adapter dispatch across both calls, got ${calls.length}.`);
    }),
  },
  {
    name: "overlapping runNext calls serialize serial claim before worker dispatch",
    run: () => withTempRepo("concurrent-claim", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls),
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });

      const results = await Promise.all([
        controller.runNext({ changeId: "worker-dispatch" }),
        controller.runNext({ changeId: "worker-dispatch" }),
      ]);
      const reasonCodes = results.map((item) => item.payload.reasonCode).sort();
      const stored = await runtimeStore.load();
      const activeStoredRuns = Object.values(stored.snapshot.runs).filter((run) => run.status === "running");

      assert(JSON.stringify(reasonCodes) === JSON.stringify(["advanced", "no_actionable_tasks"]), `Concurrent runNext must produce one dispatch and one serial suppression, got ${JSON.stringify(reasonCodes)}.`);
      assert(calls.length === 1, `Concurrent serial claim must dispatch exactly one worker, got ${calls.length}.`);
      assert(activeStoredRuns.length === 1, `Concurrent serial claim must store exactly one active run, got ${activeStoredRuns.length}.`);
    }),
  },
  {
    name: "fresh controller instance suppresses duplicate claim from durable active run",
    run: () => withTempRepo("restart-suppression", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimePath = path.join(repo, ".autopilot", "runtime", "state.json");
      const firstController = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls),
        runtimeStore: createFileAutopilotRuntimeStore(runtimePath),
        now: () => "2026-06-13T00:00:00.000Z",
      });
      const first = await firstController.runNext({ changeId: "worker-dispatch" });
      const secondController = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls),
        runtimeStore: createFileAutopilotRuntimeStore(runtimePath),
        now: () => "2026-06-13T00:00:01.000Z",
      });
      const second = await secondController.runNext({ changeId: "worker-dispatch" });

      assert(first.payload.reasonCode === "advanced", `Expected first dispatch, got ${first.payload.reasonCode}.`);
      assert(second.payload.reasonCode === "no_actionable_tasks", `Fresh controller must suppress duplicate durable active claim, got ${second.payload.reasonCode}.`);
      assert(calls.length === 1, `Fresh controller duplicate claim suppression must not dispatch, got ${calls.length} calls.`);
    }),
  },
  {
    name: "runtime recovery conflicts block dispatch instead of silently recovering empty state",
    run: () => withTempRepo("runtime-recovery", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore: AutopilotRuntimeStore = {
        async load() {
          return {
            snapshot: createEmptyAutopilotRuntimeSnapshot(),
            recovered: true,
            errors: ["Failed to parse runtime state: Unexpected token '{'"],
          };
        },
        async save() {
          throw new Error("save must not be called after runtime recovery conflict");
        },
      };
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls),
        runtimeStore,
      });

      const result = await controller.runNext({ changeId: "worker-dispatch" });

      assert(result.payload.outcome === "failed", `Runtime recovery conflict must fail safely, got ${result.payload.outcome}.`);
      assert(result.payload.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${result.payload.reasonCode}.`);
      assert(result.payload.blockers.some((blocker) => blocker.reason.includes("Failed to parse runtime state")), `Recovery blocker must include load error, got ${JSON.stringify(result.payload.blockers)}.`);
      assert(result.payload.tasksStarted.length === 0, "Runtime recovery conflict must not start workers.");
      assert(calls.length === 0, "Runtime recovery conflict must not call worker adapter.");
    }),
  },
  {
    name: "stop returns structured runtime conflict when durable state is corrupt",
    run: () => withTempRepo("stop-runtime-recovery", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const runtimeStore: AutopilotRuntimeStore = {
        async load() {
          return {
            snapshot: createEmptyAutopilotRuntimeSnapshot(),
            recovered: true,
            errors: ["Failed to parse runtime state: Unexpected token '{'"],
          };
        },
        async save() {
          throw new Error("Refusing to overwrite invalid Autopilot runtime state: Failed to parse runtime state");
        },
      };
      const controller = createAutopilotController({ root: repo }, { runtimeStore });
      const stopped = await controller.stop({ target: "all", reason: "recover" });
      assert(stopped.payload.reasonCode === "runtime_evidence_conflict", `Corrupt durable stop must return runtime_evidence_conflict, got ${stopped.payload.reasonCode}.`);
      assert(stopped.payload.blockers.some((blocker) => blocker.reason.includes("Refusing to overwrite invalid Autopilot runtime state")), `Stop blocker must include runtime error, got ${JSON.stringify(stopped.payload.blockers)}.`);
    }),
  },
  {
    name: "enabled worker dispatch does not bypass dependency-blocked Ready ledgers",
    run: () => withTempRepo("dependency-blocked", async (repo) => {
      writeLedger(repo, "worker-dispatch", dependencyBlockedLedger());
      const before = fs.readFileSync(ledgerPath(repo), "utf8");
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls),
        runtimeStore: createInMemoryAutopilotRuntimeStore(),
      });

      const result = await controller.runNext({ changeId: "worker-dispatch" });

      assert(result.payload.reasonCode === "no_actionable_tasks", `Dependency-blocked Ready ledger must stay no_actionable_tasks, got ${result.payload.reasonCode}.`);
      assert(result.payload.tasksStarted.length === 0, "Dependency-blocked Ready ledger must not start workers.");
      assert(calls.length === 0, `Dependency-blocked Ready ledger must not call worker adapter, got ${calls.length}.`);
      assert(fs.readFileSync(ledgerPath(repo), "utf8") === before, "Dependency-blocked dispatch must not mutate protected ledger bytes.");
    }),
  },
  {
    name: "dispatch exception marks durable run failed with structured blocker",
    run: () => withTempRepo("dispatch-throw", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const before = fs.readFileSync(ledgerPath(repo), "utf8");
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: {
          async capability() {
            return { available: true };
          },
          async createSession() {
            throw new Error("create boom");
          },
          async promptSession() {
            return { ok: false, reason: "not used" };
          },
          async dispatch(input) {
            const created = await this.createSession(input);
            return created.ok ? { ok: true, sessionId: created.sessionId, prompt: "unused" } : created;
          },
          async readFinalReport() {
            return { ok: false, reason: "not used" };
          },
        },
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });
      const result = await controller.runNext({ changeId: "worker-dispatch" });
      const stored = await runtimeStore.load();
      const run = Object.values(stored.snapshot.runs)[0];

      assert(result.payload.outcome === "failed", `Thrown dispatch must fail structurally, got ${result.payload.outcome}.`);
      assert(result.payload.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${result.payload.reasonCode}.`);
      assert(result.payload.blockers.some((blocker) => blocker.reason.includes("create boom")), `Dispatch blocker must include thrown error, got ${JSON.stringify(result.payload.blockers)}.`);
      assert(run?.status === "failed", `Durable run must be marked failed after thrown dispatch, got ${run?.status}.`);
      assert(fs.readFileSync(ledgerPath(repo), "utf8") === before, "Dispatch create failure must not mutate protected ledger bytes.");
    }),
  },
  {
    name: "prompt failure keeps workerSessionId scope-owned and marks run failed",
    run: () => withTempRepo("prompt-fail-owned", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const before = fs.readFileSync(ledgerPath(repo), "utf8");
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      let promptCalls = 0;
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: {
          async capability() {
            return { available: true };
          },
          async createSession() {
            return { ok: true, sessionId: "session-owned-before-prompt" };
          },
          async promptSession() {
            promptCalls++;
            return { ok: false, reason: "prompt failed after create" };
          },
          async dispatch(input) {
            const created = await this.createSession(input);
            return created.ok ? { ok: true, sessionId: created.sessionId, prompt: "unused" } : created;
          },
          async readFinalReport() {
            return { ok: false, reason: "not used" };
          },
        },
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });
      const result = await controller.runNext({ changeId: "worker-dispatch" });
      const stored = await runtimeStore.load();
      const run = Object.values(stored.snapshot.runs)[0];

      assert(result.payload.reasonCode === "runtime_evidence_conflict", `Prompt failure must be structured conflict, got ${result.payload.reasonCode}.`);
      assert(promptCalls === 1, `Expected one prompt attempt, got ${promptCalls}.`);
      assert(run?.status === "failed", `Prompt failure must mark run failed, got ${run?.status}.`);
      assert(run?.workerSessionId === "session-owned-before-prompt", "Prompt failure must preserve workerSessionId for scope ownership diagnostics.");
      assert(fs.readFileSync(ledgerPath(repo), "utf8") === before, "Prompt failure must not mutate protected ledger bytes.");
    }),
  },
  {
    name: "enabled worker dispatch with unavailable capability preserves safe deferred output",
    run: () => withTempRepo("unavailable", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const before = fs.readFileSync(ledgerPath(repo), "utf8");
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls, false),
        runtimeStore: createInMemoryAutopilotRuntimeStore(),
      });
      const result = await controller.runNext({ changeId: "worker-dispatch" });

      assert(result.payload.reasonCode === "ready_runtime_deferred", `Expected safe deferred output, got ${result.payload.reasonCode}.`);
      assert(result.payload.tasksStarted.length === 0, "Unavailable capability must not start workers.");
      assert(result.payload.summary.includes("fake session API unavailable"), `Deferred summary must include capability reason, got ${result.payload.summary}.`);
      assert(calls.length === 0, "Unavailable capability must not dispatch workers.");
      assert(fs.readFileSync(ledgerPath(repo), "utf8") === before, "Unavailable capability must not mutate protected ledger bytes.");
    }),
  },
  {
    name: "collect accepts complete matching report and updates protected ledger through writer",
    run: () => withTempRepo("collect", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls, true, async () => reportText(await firstRun(runtimeStore))),
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });

      await controller.runNext({ changeId: "worker-dispatch" });
      const collected = await controller.collect({ taskId: "worker-dispatch-task" });
      const stored = await runtimeStore.load();
      const run = Object.values(stored.snapshot.runs)[0];
      const ledgerPath = path.join(repo, "openspec", "changes", "worker-dispatch", "automation", "task.json");
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as Record<string, unknown>;

      assert(collected.payload.outcome === "advanced", `Expected collect advanced outcome, got ${collected.payload.outcome}.`);
      assert(collected.payload.reasonCode === "advanced", `Expected collect advanced reason, got ${collected.payload.reasonCode}.`);
      assert(collected.payload.tasksAdvanced.length === 1, `Expected one protected-ledger advancement, got ${collected.payload.tasksAdvanced.length}.`);
      assert(JSON.stringify(collected.payload.tasksAdvanced[0]).includes("plugin-owned-protected-ledger"), "Collect advancement must report protected ledger mutation evidence.");
      assert(ledger.status === "Analyze", `Expected ledger status Analyze after collect, got ${String(ledger.status)}.`);
      assert(Array.isArray(ledger.history) && ledger.history.length === 1, "Collect must append exactly one history transition.");
      assert(stored.snapshot.consumedWorkerReportIds.length === 1, "Collect must consume the report id.");
      assert(run?.status === "done", `Collect must close completed worker run, got ${run?.status}.`);
    }),
  },
  {
    name: "overlapping collect attempts serialize before protected ledger mutation",
    run: () => withTempRepo("collect-concurrent", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      let reportReads = 0;
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls, true, async () => {
          reportReads++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return reportText(await firstRun(runtimeStore));
        }),
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });

      await controller.runNext({ changeId: "worker-dispatch" });
      const [left, right] = await Promise.all([
        controller.collect({ taskId: "worker-dispatch-task" }),
        controller.collect({ taskId: "worker-dispatch-task" }),
      ]);
      const advanced = [left, right].filter((item) => item.payload.reasonCode === "advanced");
      const stored = await runtimeStore.load();
      const ledgerPath = path.join(repo, "openspec", "changes", "worker-dispatch", "automation", "task.json");
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as Record<string, unknown>;

      assert(advanced.length === 1, `Exactly one overlapping collect should advance, got ${[left.payload.reasonCode, right.payload.reasonCode].join(",")}.`);
      assert(reportReads === 1, `Only the claimed collect should read worker messages, got ${reportReads}.`);
      assert(Array.isArray(ledger.history) && ledger.history.length === 1, "Overlapping collect must append one ledger history entry.");
      assert(stored.snapshot.consumedWorkerReportIds.length === 1, "Overlapping collect must consume one report id.");
    }),
  },
  {
    name: "repeated collect after consumed durable report is deferred without second ledger mutation",
    run: () => withTempRepo("collect-repeated", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls, true, async () => reportText(await firstRun(runtimeStore))),
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });
      const ledgerPath = path.join(repo, "openspec", "changes", "worker-dispatch", "automation", "task.json");

      await controller.runNext({ changeId: "worker-dispatch" });
      const first = await controller.collect({ taskId: "worker-dispatch-task" });
      const afterFirst = fs.readFileSync(ledgerPath, "utf8");
      const second = await controller.collect({ taskId: "worker-dispatch-task" });

      assert(first.payload.reasonCode === "advanced", `First collect must advance, got ${first.payload.reasonCode}.`);
      assert(second.payload.reasonCode === "collect_deferred", `Repeated consumed collect must defer, got ${second.payload.reasonCode}.`);
      assert(fs.readFileSync(ledgerPath, "utf8") === afterFirst, "Repeated consumed collect must not mutate ledger bytes.");
    }),
  },
  {
    name: "collect rejects malformed report without protected ledger mutation",
    run: () => withTempRepo("collect-malformed", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls, true, () => "AUTOPILOT_WORKER_REPORT partial"),
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });
      const ledgerPath = path.join(repo, "openspec", "changes", "worker-dispatch", "automation", "task.json");
      const before = fs.readFileSync(ledgerPath, "utf8");

      await controller.runNext({ changeId: "worker-dispatch" });
      const collected = await controller.collect({ taskId: "worker-dispatch-task" });
      const stored = await runtimeStore.load();

      assert(collected.payload.outcome === "failed", `Expected malformed collect to fail, got ${collected.payload.outcome}.`);
      assert(collected.payload.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${collected.payload.reasonCode}.`);
      assert(collected.payload.tasksAdvanced.length === 0, "Malformed report must not advance tasks.");
      assert(collected.payload.blockers.some((blocker) => blocker.reason.includes("partial_marker")), "Malformed report blocker must include parser reason code.");
      assert(fs.readFileSync(ledgerPath, "utf8") === before, "Malformed report must not mutate protected ledger bytes.");
      assert(stored.snapshot.consumedWorkerReportIds.length === 0, "Malformed report must not be marked consumed.");
    }),
  },
  {
    name: "collect rejects stale ledger evidence without consuming report or mutating ledger",
    run: () => withTempRepo("collect-stale-ledger", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      let capturedRun: AutopilotRunRecord | null = null;
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls, true, () => {
          if (capturedRun == null) {
            throw new Error("captured run missing");
          }
          return reportText(capturedRun);
        }),
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });

      await controller.runNext({ changeId: "worker-dispatch" });
      capturedRun = await firstRun(runtimeStore);
      const file = ledgerPath(repo);
      const staleLedger = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      staleLedger.status = "Implementation";
      staleLedger.revision = { number: 8, contentHash: "sha256:stale", updatedBy: "test", updatedAt: "2026-06-13T00:00:01.000Z" };
      fs.writeFileSync(file, `${JSON.stringify(staleLedger, null, 2)}\n`, "utf8");
      const staleBytes = fs.readFileSync(file, "utf8");

      const collected = await controller.collect({ taskId: "worker-dispatch-task" });
      const stored = await runtimeStore.load();
      const run = Object.values(stored.snapshot.runs)[0];

      assert(collected.payload.outcome === "failed", `Stale collect must fail, got ${collected.payload.outcome}.`);
      assert(collected.payload.reasonCode === "runtime_evidence_conflict", `Stale collect must return runtime_evidence_conflict, got ${collected.payload.reasonCode}.`);
      assert(collected.payload.tasksAdvanced.length === 0, "Stale collect must not advance tasks.");
      assert(collected.payload.blockers.some((blocker) => blocker.reason.includes("ledger transition writer failed")), `Stale collect blocker must mention writer failure, got ${JSON.stringify(collected.payload.blockers)}.`);
      assert(fs.readFileSync(file, "utf8") === staleBytes, "Stale collect must preserve current ledger bytes exactly.");
      assert(stored.snapshot.consumedWorkerReportIds.length === 0, "Stale collect must not consume the report id.");
      assert(run?.status === "running", `Stale collect must restore running state for follow-up/stop, got ${run?.status}.`);
    }),
  },
  {
    name: "collect read exceptions restore running state without protected ledger mutation",
    run: () => withTempRepo("collect-read-throw", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: {
          ...fakeAdapter(calls),
          async readFinalReport() {
            throw new Error("messages boom");
          },
        },
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });
      const ledgerPath = path.join(repo, "openspec", "changes", "worker-dispatch", "automation", "task.json");
      const before = fs.readFileSync(ledgerPath, "utf8");

      await controller.runNext({ changeId: "worker-dispatch" });
      const collected = await controller.collect({ taskId: "worker-dispatch-task" });
      const stored = await runtimeStore.load();
      const run = Object.values(stored.snapshot.runs)[0];

      assert(collected.payload.reasonCode === "collect_deferred", `Read exception should defer collect while preserving runtime, got ${collected.payload.reasonCode}.`);
      assert(collected.payload.summary.includes("messages boom"), `Collect summary must include read error, got ${collected.payload.summary}.`);
      assert(run?.status === "running", `Read exception must restore running state, got ${run?.status}.`);
      assert(fs.readFileSync(ledgerPath, "utf8") === before, "Read exception must not mutate protected ledger bytes.");
    }),
  },
  {
    name: "blocked and MR-wait reports preserve active serial ownership until stopped",
    run: () => withTempRepo("blocked-mr-active", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls, true, async () => blockerReportText(await firstRun(runtimeStore))),
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });
      await controller.runNext({ changeId: "worker-dispatch" });
      await controller.collect({ taskId: "worker-dispatch-task" });
      const callsAfterBlockedCollect = calls.length;
      const afterBlocked = await controller.runNext({ changeId: "worker-dispatch" });
      const blockedStatus = await controller.status({ changeId: "worker-dispatch" });
      const blockedStatusRecord = blockedStatus.payload as unknown as { status?: { activeRun?: { blockers?: boolean; taskIds?: string[] } } };
      const stopped = await controller.stop({ target: "task", id: "worker-dispatch-task", reason: "owner decision pending" });

      assert(afterBlocked.payload.reasonCode === "blocked_for_user", `Blocked run must surface blocker instead of duplicate serial claim, got ${afterBlocked.payload.reasonCode}.`);
      assert(afterBlocked.payload.tasksStarted.length === 0 && calls.length === callsAfterBlockedCollect, "Blocked run must not dispatch a duplicate worker.");
      assert(blockedStatusRecord.status?.activeRun?.blockers === true && blockedStatusRecord.status.activeRun.taskIds?.includes("worker-dispatch-task") === true, `Status must expose compact blocked active runtime evidence, got ${JSON.stringify(blockedStatus.payload)}.`);
      assert(stopped.payload.reasonCode === "stop_applied", `Blocked run must be stoppable, got ${stopped.payload.reasonCode}.`);

      const mrRuntimeStore = createInMemoryAutopilotRuntimeStore();
      const mrCalls: AutopilotWorkerSessionDispatchInput[] = [];
      writeLedger(repo, "worker-dispatch-mr", { ...readyLedger(), id: "worker-dispatch-mr-task" });
      const mrController = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(mrCalls, true, async () => mrWaitReportText(await firstRun(mrRuntimeStore))),
        runtimeStore: mrRuntimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });
      await mrController.runNext({ changeId: "worker-dispatch-mr" });
      await mrController.collect({ taskId: "worker-dispatch-mr-task" });
      const callsAfterMrCollect = mrCalls.length;
      const mrStored = await mrRuntimeStore.load();
      const mrRun = Object.values(mrStored.snapshot.runs)[0];
      const afterMrWait = await mrController.runNext({ changeId: "worker-dispatch-mr" });
      const mrStatus = await mrController.status({ changeId: "worker-dispatch-mr" });
      const mrStatusRecord = mrStatus.payload as unknown as { status?: { activeRun?: { mrWait?: boolean; taskIds?: string[] } } };
      const stoppedMr = await mrController.stop({ target: "task", id: "worker-dispatch-mr-task", reason: "MR wait resolved externally" });
      assert(mrRun?.status === "waiting_mr", `MR-wait collect must persist waiting_mr runtime status, got ${mrRun?.status}.`);
      assert(afterMrWait.payload.outcome === "waiting_for_mr", `MR-wait run must surface MR wait instead of duplicate serial claim, got ${afterMrWait.payload.outcome}.`);
      assert(afterMrWait.payload.tasksStarted.length === 0 && mrCalls.length === callsAfterMrCollect, "MR-wait run must not dispatch a duplicate worker.");
      assert(mrStatusRecord.status?.activeRun?.mrWait === true && mrStatusRecord.status.activeRun.taskIds?.includes("worker-dispatch-mr-task") === true, `Status must expose compact MR-wait active runtime evidence, got ${JSON.stringify(mrStatus.payload)}.`);
      assert(stoppedMr.payload.reasonCode === "stop_applied", `MR-wait run must remain stoppable, got ${stoppedMr.payload.reasonCode}.`);
    }),
  },
  {
    name: "enabled worker dispatch continues non-terminal Analyze phase after collect",
    run: () => withTempRepo("phase-continue", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const times = ["2026-06-13T00:00:00.000Z", "2026-06-13T00:00:01.000Z", "2026-06-13T00:00:02.000Z"];
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls, true, async () => reportText(await firstRun(runtimeStore))),
        runtimeStore,
        now: () => times.shift() ?? "2026-06-13T00:00:03.000Z",
      });

      await controller.runNext({ changeId: "worker-dispatch" });
      await controller.collect({ taskId: "worker-dispatch-task" });
      const continued = await controller.runNext({ changeId: "worker-dispatch" });
      const stored = await runtimeStore.load();
      const runningRuns = Object.values(stored.snapshot.runs).filter((run) => run.status === "running");

      assert(continued.payload.outcome === "advanced", `Expected Analyze continuation to dispatch, got ${continued.payload.outcome}.`);
      assert(continued.payload.reasonCode === "advanced", `Expected advanced continuation, got ${continued.payload.reasonCode}.`);
      assert(calls.length === 2, `Expected second adapter dispatch for Analyze continuation, got ${calls.length}.`);
      assert(runningRuns.length === 1, `Expected one active running continuation, got ${runningRuns.length}.`);
      assert(runningRuns[0]?.fromStatus === "Analyze", `Expected continuation from Analyze, got ${runningRuns[0]?.fromStatus}.`);
      assert(runningRuns[0]?.expectedToStatus === "Review", `Research Analyze phase should dispatch Review, got ${runningRuns[0]?.expectedToStatus}.`);
    }),
  },
  {
    name: "stop marks durable active run stopped and allows later claim",
    run: () => withTempRepo("stop", async (repo) => {
      writeLedger(repo, "worker-dispatch", readyLedger());
      const calls: AutopilotWorkerSessionDispatchInput[] = [];
      const runtimeStore = createInMemoryAutopilotRuntimeStore();
      const controller = createAutopilotController({ root: repo }, {
        workerDispatch: { enabled: true },
        workerSessionAdapter: fakeAdapter(calls),
        runtimeStore,
        now: () => "2026-06-13T00:00:00.000Z",
      });

      await controller.runNext({ changeId: "worker-dispatch" });
      const stopped = await controller.stop({ target: "task", id: "worker-dispatch-task", reason: "test stop" });
      const afterStop = await runtimeStore.load();
      const runAfterStop = Object.values(afterStop.snapshot.runs)[0];
      const stoppedStatus = await controller.status({ changeId: "worker-dispatch" });
      const statusRecord = stoppedStatus.payload as unknown as { status?: { activeRun?: unknown; recentRuns?: Array<{ runId?: string; status?: string; sessionIDs?: string[] }> } };
      const restarted = await controller.runNext({ changeId: "worker-dispatch" });

      assert(stopped.payload.reasonCode === "stop_applied", `Expected stop_applied, got ${stopped.payload.reasonCode}.`);
      assert(stopped.payload.tasksAdvanced.length === 1, `Expected one stopped task entry, got ${stopped.payload.tasksAdvanced.length}.`);
      assert(runAfterStop?.status === "stopped", `Expected stored run stopped, got ${runAfterStop?.status}.`);
      assert(statusRecord.status?.activeRun == null, "Stopped run must not remain active claim ownership in status output.");
      assert(statusRecord.status?.recentRuns?.some((run) => run.runId === runAfterStop?.runId && run.status === "stopped" && run.sessionIDs?.includes("session-1") === true) === true, `Status must expose compact stopped run evidence, got ${JSON.stringify(stoppedStatus.payload)}.`);
      assert(restarted.payload.reasonCode === "advanced", `Expected stopped run to allow later claim, got ${restarted.payload.reasonCode}.`);
      assert(calls.length === 2, `Expected restart to dispatch second worker, got ${calls.length}.`);
    }),
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
  console.error(`${failed} autopilot controller worker dispatch test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot controller worker dispatch tests=${tests.length}`);
