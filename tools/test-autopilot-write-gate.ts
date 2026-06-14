#!/usr/bin/env node
import { decideAutopilotWriteGate } from "./autopilot-write-gate.ts";
import { autopilotActiveRuntimeRunStatuses, autopilotRuntimeRunStatuses, autopilotWorkerWritableRuntimeRunStatuses, type AutopilotRuntimeSnapshot, type AutopilotRuntimeStoreLoadResult } from "./autopilot-runtime-store.ts";

type TestCase = { name: string; run: () => void };

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runtime(snapshot: AutopilotRuntimeSnapshot, options: { recovered?: boolean; errors?: string[] } = {}): AutopilotRuntimeStoreLoadResult {
  return { snapshot, recovered: options.recovered === true, errors: options.errors ?? [] };
}

function snapshot(status: string, workerSessionId = "worker-session-1"): AutopilotRuntimeSnapshot {
  return {
    schemaVersion: 1,
    consumedWorkerReportIds: [],
    runs: {
      "run-1": {
        runId: "run-1",
        status: status as never,
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:01.000Z",
        taskId: "task-a",
        ledgerPath: "openspec/changes/task-a/automation/task.json",
        fromStatus: "Implementation",
        expectedReportId: "report-1",
        workerId: "worker-1",
        workerSessionId,
        scope: {
          read: ["tools/**"],
          write: ["tools/**"],
          forbidden: ["openspec/changes/*/automation/**", ".autopilot/**"],
        },
      },
    },
  };
}

function emptyRuntime(): AutopilotRuntimeStoreLoadResult {
  return runtime({ schemaVersion: 1, runs: {}, consumedWorkerReportIds: [] });
}

function assertAllowed(name: string, decision: ReturnType<typeof decideAutopilotWriteGate>): void {
  assert(decision.action === "allow", `${name}: expected allow, got ${JSON.stringify(decision)}.`);
}

function assertBlocked(name: string, decision: ReturnType<typeof decideAutopilotWriteGate>, reasonIncludes: string, pathIncludes?: string): void {
  assert(decision.action === "block", `${name}: expected block, got ${JSON.stringify(decision)}.`);
  assert(decision.reason.includes(reasonIncludes), `${name}: reason should include ${reasonIncludes}, got ${decision.reason}.`);
  if (pathIncludes != null) {
    assert(decision.paths.some((item) => item.includes(pathIncludes)), `${name}: paths should include ${pathIncludes}, got ${JSON.stringify(decision.paths)}.`);
  }
}

const tests: TestCase[] = [
  {
    name: "no active lock allows ordinary writes but preserves protected path block",
    run: () => {
      assertAllowed("ordinary write", decideAutopilotWriteGate("write", { filePath: "tools/new-helper.ts", content: "safe" }, { runtime: emptyRuntime() }));
      assertBlocked("protected write", decideAutopilotWriteGate("write", { filePath: "openspec/changes/task-a/automation/task.json", content: "{}" }, { runtime: emptyRuntime() }), "protected Autopilot state", "automation/task.json");
    },
  },
  {
    name: "protected path and active lock options are independent",
    run: () => {
      const active = runtime(snapshot("running"));
      assertAllowed("protected path disabled", decideAutopilotWriteGate("write", { filePath: "openspec/changes/task-a/automation/task.json", content: "{}" }, { runtime: emptyRuntime(), protectedPathGuardEnabled: false }));
      assertBlocked("active lock still enabled", decideAutopilotWriteGate("write", { filePath: "docs/main-session.md", content: "safe" }, { runtime: active, sessionID: "main-session", protectedPathGuardEnabled: false }), "active write ownership", "docs/main-session.md");
      assertAllowed("active lock disabled ordinary write", decideAutopilotWriteGate("write", { filePath: "docs/main-session.md", content: "safe" }, { runtime: active, sessionID: "main-session", activeLockEnabled: false }));
      assertBlocked("active lock disabled keeps protected guard", decideAutopilotWriteGate("write", { filePath: "openspec/changes/task-a/automation/task.json", content: "{}" }, { runtime: active, sessionID: "main-session", activeLockEnabled: false }), "protected Autopilot state", "automation/task.json");
      assertBlocked("active lock disabled keeps worker scope", decideAutopilotWriteGate("write", { filePath: "README.md", content: "unsafe" }, { runtime: active, sessionID: "worker-session-1", activeLockEnabled: false }), "outside assigned write scope", "README.md");
    },
  },
  {
    name: "active lock blocks main-session ordinary mutation fail-closed",
    run: () => {
      assertBlocked("main write", decideAutopilotWriteGate("write", { filePath: "tools/new-helper.ts", content: "safe" }, { runtime: runtime(snapshot("running")), sessionID: "main-session" }), "active write ownership", "tools/new-helper.ts");
      assertBlocked("main shell", decideAutopilotWriteGate("bash", { command: "Set-Content tools/out.txt safe" }, { runtime: runtime(snapshot("running")), sessionID: "main-session" }), "active write ownership", "tools/out.txt");
      assertBlocked("main split autopilot shell", decideAutopilotWriteGate("bash", { command: "Set-Content ('.auto' + 'pilot/state.json') '{}'" }, { runtime: runtime(snapshot("running")), sessionID: "main-session" }), "protected Autopilot state", "unclassified");
      assertBlocked("in-memory runtimeState ownership", decideAutopilotWriteGate("write", { filePath: "docs/out.md", content: "safe" }, { runtime: emptyRuntime(), sessionID: "main-session", activeOwnershipTaskIds: ["task-runtime-state"] }), "active write ownership", "docs/out.md");
    },
  },
  {
    name: "active lock uses shared runtime active status contract",
    run: () => {
      const activeStatuses = new Set<string>(autopilotActiveRuntimeRunStatuses);
      for (const status of autopilotRuntimeRunStatuses) {
        const decision = decideAutopilotWriteGate("write", { filePath: "docs/main-session.md", content: "safe" }, { runtime: runtime(snapshot(status)), sessionID: "main-session" });
        if (activeStatuses.has(status)) {
          assertBlocked(`main ${status}`, decision, "active write ownership", "docs/main-session.md");
        } else {
          assertAllowed(`main ${status}`, decision);
        }
      }
    },
  },
  {
    name: "active running worker is scoped to assigned write paths",
    run: () => {
      const active = runtime(snapshot("running"));
      assertAllowed("worker scoped write", decideAutopilotWriteGate("write", { filePath: "tools/new-helper.ts", content: "safe" }, { runtime: active, sessionID: "worker-session-1" }));
      assertBlocked("worker out of scope", decideAutopilotWriteGate("write", { filePath: "README.md", content: "unsafe" }, { runtime: active, sessionID: "worker-session-1" }), "outside assigned write scope", "README.md");
      assertBlocked("worker protected", decideAutopilotWriteGate("write", { filePath: ".autopilot/runtime/state.json", content: "{}" }, { runtime: active, sessionID: "worker-session-1" }), "protected Autopilot state", ".autopilot/runtime/state.json");
    },
  },
  {
    name: "worker scope uses shared runtime writable status contract",
    run: () => {
      const writableStatuses = new Set<string>(autopilotWorkerWritableRuntimeRunStatuses);
      for (const status of autopilotRuntimeRunStatuses) {
        const decision = decideAutopilotWriteGate("write", { filePath: "tools/new-helper.ts", content: "safe" }, { runtime: runtime(snapshot(status)), sessionID: "worker-session-1" });
        if (writableStatuses.has(status)) {
          assertAllowed(`worker ${status}`, decision);
        } else {
          assertBlocked(`worker ${status}`, decision, "not active for writes", "tools/new-helper.ts");
        }
      }
    },
  },
  {
    name: "inactive known worker session blocks mutations",
    run: () => {
      assertBlocked("inactive worker", decideAutopilotWriteGate("write", { filePath: "tools/new-helper.ts", content: "safe" }, { runtime: runtime(snapshot("collecting")), sessionID: "worker-session-1" }), "not active for writes", "tools/new-helper.ts");
    },
  },
  {
    name: "corrupt runtime evidence blocks mutations and repo npm scripts but permits direct read-only helpers",
    run: () => {
      const corrupt = runtime({ schemaVersion: 1, runs: {}, consumedWorkerReportIds: [] }, { recovered: true, errors: ["invalid json"] });
      assertBlocked("corrupt mutation", decideAutopilotWriteGate("write", { filePath: "tools/new-helper.ts", content: "safe" }, { runtime: corrupt, sessionID: "main-session" }), "runtime state recovery failed", "tools/new-helper.ts");
      assertBlocked("corrupt npm validation", decideAutopilotWriteGate("bash", { command: "npm run validate" }, { runtime: corrupt, sessionID: "main-session" }), "runtime state recovery failed", "unclassified");
      assertAllowed("corrupt direct validation", decideAutopilotWriteGate("bash", { command: "node tools/autopilot-ledger.ts openspec/changes/change-a/automation/task.json" }, { runtime: corrupt, sessionID: "main-session" }));
    },
  },
  {
    name: "unknown mutating tools fail closed during active lock",
    run: () => {
      assertBlocked("unknown mutator", decideAutopilotWriteGate("future_write_tool", { filePath: "tools/unknown.txt", content: "unsafe" }, { runtime: runtime(snapshot("running")), sessionID: "main-session" }), "active write ownership", "tools/unknown.txt");
      assertBlocked("unknown shell", decideAutopilotWriteGate("bash", { command: "npm run custom-script" }, { runtime: runtime(snapshot("running")), sessionID: "main-session" }), "active write ownership", "unclassified");
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
    console.error(`FAIL ${test.name}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (failed > 0) {
  throw new Error(`${failed} write gate test(s) failed.`);
}
console.log(`OK: autopilot write gate tests=${tests.length}`);
