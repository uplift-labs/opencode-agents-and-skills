#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

type PluginHooks = {
  tool?: Record<string, PluginToolDefinition>;
  event?: (input: { event: { type: string; properties?: Record<string, unknown> } }) => Promise<void> | void;
  "tool.execute.before"?: (input: { tool: string; sessionID: string; callID: string }, output: { args: Record<string, unknown> }) => Promise<void> | void;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = path.join(root, ".opencode", "plugins", "openspec-autopilot.ts");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function withTempRepo(name: string, run: (repo: string) => void | Promise<void>): Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-autopilot-plugin-worker-${name}-`));
  return Promise.resolve(run(repo)).finally(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });
}

function acceptanceResearchLedger(id: string): Record<string, unknown> {
  const ledger = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "autopilot-ledger", "valid-research.json"), "utf8")) as Record<string, unknown>;
  ledger.id = id;
  ledger.scope = {
    read: ["docs/**", "openspec/**"],
    write: [`openspec/changes/${id}/**`],
    forbidden: ["src/**", "openspec/changes/*/automation/**", ".autopilot/**"],
  };
  ledger.mr = {
    required: false,
    status: "not-required",
    noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR.",
  };
  return ledger;
}

function readyResearchLedger(id: string, priority = "medium"): Record<string, unknown> {
  const ledger = acceptanceResearchLedger(id);
  ledger.status = "Ready";
  ledger.priority = priority;
  ledger.history = [];
  ledger.mr = { required: true, status: "none" };
  return ledger;
}

function writeLedger(repo: string, changeId: string, ledger: Record<string, unknown>): void {
  const filePath = path.join(repo, "openspec", "changes", changeId, "automation", "task.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function liveWorkerReport(run: Record<string, unknown>): string {
  const reportId = String(run.expectedReportId);
  return [
    "Worker complete.",
    `AUTOPILOT_WORKER_REPORT ${reportId} COMPLETE`,
    JSON.stringify({
      schemaVersion: 1,
      reportId,
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
      evidence: { summary: "Source-equivalent plugin worker completed Analyze handoff." },
      blockers: [],
      mr: { status: "none" },
    }, null, 2),
  ].join("\n");
}

function readDurableRun(repo: string): Record<string, unknown> {
  const statePath = path.join(repo, ".autopilot", "runtime", "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as Record<string, unknown>;
  assert(typeof state.runs === "object" && state.runs != null && !Array.isArray(state.runs), "Durable runtime state must contain runs map.");
  const run = Object.values(state.runs as Record<string, unknown>)[0];
  assert(typeof run === "object" && run != null && !Array.isArray(run), "Durable runtime state must contain one run record.");
  return run as Record<string, unknown>;
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function importAutopilotPlugin(): Promise<{ id?: unknown; server?: unknown }> {
  const imported = await import(pathToFileURL(pluginPath).href) as { default?: unknown };
  assert(typeof imported.default === "object" && imported.default != null && !Array.isArray(imported.default), "Autopilot plugin default export must be an object.");
  return imported.default as { id?: unknown; server?: unknown };
}

function fakeLiveClient(repo: string, logs: Array<Record<string, unknown>>, sdkCalls: Array<{ method: string; input: unknown }>): Record<string, unknown> {
  let lastPromptText = "";
  return {
    app: { log: async (entry: { body: Record<string, unknown> }) => logs.push(entry.body) },
    session: {
      create: async (input: unknown) => {
        sdkCalls.push({ method: "session.create", input });
        const record = input as Record<string, unknown>;
        assert(typeof record.body === "object" && record.body != null && !Array.isArray(record.body), "session.create must receive SDK body object.");
        assert(typeof (record.body as Record<string, unknown>).title === "string", "session.create body must include title.");
        assert(typeof record.query === "object" && record.query != null && (record.query as Record<string, unknown>).directory === repo, "session.create must pass worktree through query.directory.");
        return { id: "live-worker-session-1" };
      },
      promptAsync: async (input: unknown) => {
        sdkCalls.push({ method: "session.promptAsync", input });
        const record = input as Record<string, unknown>;
        assert(JSON.stringify(record.path) === JSON.stringify({ id: "live-worker-session-1" }), `promptAsync must target path.id, got ${JSON.stringify(record.path)}.`);
        assert(typeof record.body === "object" && record.body != null && Array.isArray((record.body as Record<string, unknown>).parts), "promptAsync must send body.parts.");
        const firstPart = ((record.body as Record<string, unknown>).parts as Array<Record<string, unknown>>)[0];
        lastPromptText = typeof firstPart?.text === "string" ? firstPart.text : "";
        assert(typeof record.query === "object" && record.query != null && (record.query as Record<string, unknown>).directory === repo, "promptAsync must pass worktree through query.directory.");
        return undefined;
      },
      messages: async (input: unknown) => {
        sdkCalls.push({ method: "session.messages", input });
        const record = input as Record<string, unknown>;
        assert(JSON.stringify(record.path) === JSON.stringify({ id: "live-worker-session-1" }), `messages must target path.id, got ${JSON.stringify(record.path)}.`);
        assert(typeof record.query === "object" && record.query != null && (record.query as Record<string, unknown>).directory === repo, "messages must pass worktree through query.directory.");
        return [
          { info: { role: "user" }, parts: [{ type: "text", text: lastPromptText }] },
          { info: { role: "assistant" }, parts: [{ type: "text", text: liveWorkerReport(readDurableRun(repo)) }] },
        ];
      },
    },
  };
}

async function liveWorkerHooks(repo: string, logs: Array<Record<string, unknown>>, sdkCalls: Array<{ method: string; input: unknown }>, client: Record<string, unknown> = fakeLiveClient(repo, logs, sdkCalls)): Promise<PluginHooks> {
  const plugin = await importAutopilotPlugin();
  assert(plugin.id === "openspec.autopilot" && typeof plugin.server === "function", "Autopilot plugin must expose server entrypoint.");
  const hooks = await plugin.server(
    { directory: path.join(repo, "base-directory"), worktree: repo, client },
    { workerDispatch: { enabled: true }, triggers: { triggerMode: "controlled", workerCollect: { debounceMs: 1, cooldownMs: 1 } } },
  ) as PluginHooks;
  assert(typeof hooks.tool === "object" && hooks.tool != null && typeof hooks.event === "function" && typeof hooks["tool.execute.before"] === "function", "Autopilot plugin must expose tools, event hook, and before hook.");
  return hooks;
}

const tests: TestCase[] = [
  {
    name: "source-equivalent live worker dispatch and durable idle collect use SDK-shaped requests",
    run: () => withTempRepo("live-worker-dispatch", async (repo) => {
      writeLedger(repo, "worker-change", readyResearchLedger("worker-task", "high"));
      const logs: Array<Record<string, unknown>> = [];
      const sdkCalls: Array<{ method: string; input: unknown }> = [];
      const hooks = await liveWorkerHooks(repo, logs, sdkCalls);

      const started = await hooks.tool!.autopilot_run_next.execute({ changeId: "worker-change" }, { sessionID: "parent-session" });
      assert(typeof started === "object" && started != null && !Array.isArray(started), "autopilot_run_next must return structured output.");
      const startedPayload = JSON.parse(started.output) as Record<string, unknown>;
      assert(startedPayload.reasonCode === "advanced", `Live worker dispatch must advance, got ${startedPayload.reasonCode}.`);
      assert(sdkCalls.map((call) => call.method).join(",") === "session.create,session.promptAsync", `Live dispatch must create then prompt one worker, got ${sdkCalls.map((call) => call.method).join(",")}.`);
      const run = readDurableRun(repo);
      assert(run.status === "running" && run.workerSessionId === "live-worker-session-1", `Durable runtime must record running worker session, got ${JSON.stringify(run)}.`);

      await hooks.event!({ event: { type: "session.status", properties: { sessionID: "live-worker-session-1", status: { type: "idle" } } } });
      await waitFor(
        () => logs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "collect" && (log.extra as Record<string, unknown> | undefined)?.reasonCode === "advanced"),
        "durable worker idle collect log",
      );
      const ledgerPath = path.join(repo, "openspec", "changes", "worker-change", "automation", "task.json");
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as Record<string, unknown>;
      assert(ledger.status === "Analyze", `Durable idle collect must advance ledger to Analyze, got ${String(ledger.status)}.`);
      assert(sdkCalls.some((call) => call.method === "session.messages"), "Durable idle collect must read worker messages through SDK-shaped session.messages.");
      const logText = JSON.stringify(logs);
      assert(!logText.includes("AUTOPILOT_WORKER_REPORT"), "Plugin logs must not include raw worker report markers or prompt examples.");
      assert(!logText.includes("Worker complete."), "Plugin logs must not include raw worker report payload text.");
      assert(!logText.includes("\"schemaVersion\""), "Plugin logs must not include raw worker report JSON payloads.");
    }),
  },
  {
    name: "source-equivalent durable repeated idle after consumed report does not collect twice",
    run: () => withTempRepo("repeated-idle", async (repo) => {
      writeLedger(repo, "worker-change", readyResearchLedger("worker-task", "high"));
      const logs: Array<Record<string, unknown>> = [];
      const sdkCalls: Array<{ method: string; input: unknown }> = [];
      const hooks = await liveWorkerHooks(repo, logs, sdkCalls);

      await hooks.tool!.autopilot_run_next.execute({ changeId: "worker-change" }, { sessionID: "parent-session" });
      await hooks.event!({ event: { type: "session.status", properties: { sessionID: "live-worker-session-1", status: { type: "idle" } } } });
      await waitFor(() => logs.some((log) => (log.extra as Record<string, unknown> | undefined)?.jobKind === "collect" && (log.extra as Record<string, unknown> | undefined)?.reasonCode === "advanced"), "first durable advanced collect");
      const advancedCollectsAfterFirstIdle = logs.filter((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "collect" && (log.extra as Record<string, unknown> | undefined)?.reasonCode === "advanced").length;
      const messagesAfterFirstIdle = sdkCalls.filter((call) => call.method === "session.messages").length;

      await hooks.event!({ event: { type: "session.status", properties: { sessionID: "live-worker-session-1", status: { type: "idle" } } } });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert(logs.filter((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "collect" && (log.extra as Record<string, unknown> | undefined)?.reasonCode === "advanced").length === advancedCollectsAfterFirstIdle, "Repeated durable idle for consumed report must not complete another advanced collect job.");
      assert(sdkCalls.filter((call) => call.method === "session.messages").length === messagesAfterFirstIdle, "Repeated durable idle must not reread consumed worker messages.");
    }),
  },
  {
    name: "source-equivalent worker scope hook blocks out-of-scope and corrupt-runtime writes",
    run: () => withTempRepo("worker-scope-hook", async (repo) => {
      writeLedger(repo, "worker-change", readyResearchLedger("worker-task", "high"));
      const logs: Array<Record<string, unknown>> = [];
      const sdkCalls: Array<{ method: string; input: unknown }> = [];
      const hooks = await liveWorkerHooks(repo, logs, sdkCalls);

      await hooks.tool!.autopilot_run_next.execute({ changeId: "worker-change" }, { sessionID: "parent-session" });
      await hooks["tool.execute.before"]!({ tool: "write", sessionID: "live-worker-session-1", callID: "inside-running" }, { args: { filePath: "openspec/changes/worker-task/notes.md", content: "x" } });
      let blockedOutsideScope = false;
      try {
        await hooks["tool.execute.before"]!({ tool: "write", sessionID: "live-worker-session-1", callID: "outside-scope" }, { args: { filePath: "docs/out.md", content: "x" } });
      } catch (error) {
        blockedOutsideScope = error instanceof Error && error.message.includes("worker scope boundaries");
      }
      assert(blockedOutsideScope, "Worker session must block out-of-scope non-protected writes through plugin hook.");

      await hooks.event!({ event: { type: "session.status", properties: { sessionID: "live-worker-session-1", status: { type: "idle" } } } });
      await waitFor(() => logs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "collect" && (log.extra as Record<string, unknown> | undefined)?.reasonCode === "advanced"), "advanced durable collect before terminal-scope guard");
      let blockedAfterDone = false;
      try {
        await hooks["tool.execute.before"]!({ tool: "write", sessionID: "live-worker-session-1", callID: "after-done" }, { args: { filePath: "openspec/changes/worker-task/after.md", content: "x" } });
      } catch (error) {
        blockedAfterDone = error instanceof Error && error.message.includes("worker session is not active for writes");
      }
      assert(blockedAfterDone, "Known worker session must block in-scope writes after its run reaches terminal runtime status.");

      fs.writeFileSync(path.join(repo, ".autopilot", "runtime", "state.json"), "{not json", "utf8");
      let blockedCorruptRuntime = false;
      try {
        await hooks["tool.execute.before"]!({ tool: "write", sessionID: "live-worker-session-1", callID: "corrupt-runtime" }, { args: { filePath: "openspec/changes/worker-task/notes.md", content: "x" } });
      } catch (error) {
        blockedCorruptRuntime = error instanceof Error && error.message.includes("runtime state recovery failed");
      }
      assert(blockedCorruptRuntime, "Corrupt durable runtime must fail closed for worker mutating calls.");
    }),
  },
  {
    name: "source-equivalent worker scope hook blocks stopped and failed in-scope writes",
    run: () => withTempRepo("worker-scope-stopped-failed", async (repo) => {
      writeLedger(repo, "worker-change", readyResearchLedger("worker-task", "high"));
      const logs: Array<Record<string, unknown>> = [];
      const sdkCalls: Array<{ method: string; input: unknown }> = [];
      const hooks = await liveWorkerHooks(repo, logs, sdkCalls);

      await hooks.tool!.autopilot_run_next.execute({ changeId: "worker-change" }, { sessionID: "parent-session" });
      await hooks.tool!.autopilot_stop.execute({ target: "task", id: "worker-task", reason: "scope test" }, { sessionID: "parent-session" });
      let blockedStopped = false;
      try {
        await hooks["tool.execute.before"]!({ tool: "write", sessionID: "live-worker-session-1", callID: "after-stop" }, { args: { filePath: "openspec/changes/worker-task/stopped.md", content: "x" } });
      } catch (error) {
        blockedStopped = error instanceof Error && error.message.includes("worker session is not active for writes");
      }
      assert(blockedStopped, "Stopped worker session must block previously in-scope writes.");

      const failedRepo = fs.mkdtempSync(path.join(os.tmpdir(), "openspec-autopilot-plugin-worker-failed-"));
      try {
        writeLedger(failedRepo, "worker-change", readyResearchLedger("worker-task", "high"));
        const failedLogs: Array<Record<string, unknown>> = [];
        const failedCalls: Array<{ method: string; input: unknown }> = [];
        const failingClient = {
          app: { log: async (entry: { body: Record<string, unknown> }) => failedLogs.push(entry.body) },
          session: {
            create: async (input: unknown) => {
              failedCalls.push({ method: "session.create", input });
              return { id: "failed-worker-session-1" };
            },
            promptAsync: async (input: unknown) => {
              failedCalls.push({ method: "session.promptAsync", input });
              throw new Error("prompt failed for scope test");
            },
            messages: async () => [],
          },
        };
        const failedHooks = await liveWorkerHooks(failedRepo, failedLogs, failedCalls, failingClient);
        const failedStart = await failedHooks.tool!.autopilot_run_next.execute({ changeId: "worker-change" }, { sessionID: "parent-session" });
        assert(typeof failedStart === "object" && failedStart != null && JSON.parse(failedStart.output).reasonCode === "runtime_evidence_conflict", "Prompt failure must persist failed runtime state for hook verification.");
        let blockedFailed = false;
        try {
          await failedHooks["tool.execute.before"]!({ tool: "write", sessionID: "failed-worker-session-1", callID: "after-failed" }, { args: { filePath: "openspec/changes/worker-task/failed.md", content: "x" } });
        } catch (error) {
          blockedFailed = error instanceof Error && error.message.includes("worker session is not active for writes");
        }
        assert(blockedFailed, "Failed worker session must block previously in-scope writes.");
      } finally {
        fs.rmSync(failedRepo, { recursive: true, force: true });
      }
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
  console.error(`${failed} Autopilot plugin worker dispatch smoke test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot plugin worker dispatch smoke tests=${tests.length}`);
