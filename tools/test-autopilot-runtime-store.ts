#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEmptyAutopilotRuntimeSnapshot,
  createFileAutopilotRuntimeStore,
  createInMemoryAutopilotRuntimeStore,
  validateAutopilotRuntimeSnapshot,
  type AutopilotRuntimeSnapshot,
} from "./autopilot-runtime-store.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function withTempDir(name: string, run: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `autopilot-runtime-store-${name}-`));
  return Promise.resolve().then(() => run(dir)).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

function validRun(overrides: Partial<AutopilotRuntimeSnapshot["runs"][string]> = {}): AutopilotRuntimeSnapshot["runs"][string] {
  return {
    runId: "run-1",
    status: "running",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:01.000Z",
    taskId: "task-a",
    ledgerPath: "openspec/changes/change-a/automation/task.json",
    fromStatus: "Ready",
    expectedReportId: "report-a",
    workerId: "worker-a",
    scope: { read: ["openspec/changes/change-a"], write: ["src"], forbidden: ["openspec/changes/*/automation/**", ".autopilot/**"] },
    ...overrides,
  };
}

function fullRun(): AutopilotRuntimeSnapshot["runs"][string] {
  return validRun({
    expectedToStatus: "Analyze",
    workerSessionId: "session-1",
    ledgerRevision: { number: 7, contentHash: "hash-1" },
    scope: { read: ["b", "a", "a"], write: ["src", "tools", "src"], forbidden: [".autopilot/**", "openspec/changes/*/automation/**"] },
    blockers: [{ reason: "needs owner", questionId: "q-1" }],
    mr: { status: "waiting-review", url: "https://example.invalid/mr/1" },
    stopReason: "paused for review",
  });
}

const tests: TestCase[] = [
  {
    name: "validates runtime snapshot schema",
    run: () => {
      const empty = createEmptyAutopilotRuntimeSnapshot();
      const valid = validateAutopilotRuntimeSnapshot(empty);
      assert(valid.valid, `Expected empty snapshot valid, got ${valid.errors.join("; ")}.`);

      const invalid = validateAutopilotRuntimeSnapshot({ schemaVersion: 2, runs: [], consumedWorkerReportIds: [1] });
      assert(!invalid.valid, "Invalid snapshot must fail validation.");
      assert(invalid.errors.some((error) => error.includes("schemaVersion")), "Invalid snapshot must report schemaVersion error.");
      assert(invalid.errors.some((error) => error.includes("runs")), "Invalid snapshot must report runs shape error.");
      assert(invalid.errors.some((error) => error.includes("consumedWorkerReportIds")), "Invalid snapshot must report consumed ids error.");

      const malformedOptional = validateAutopilotRuntimeSnapshot({
        schemaVersion: 1,
        runs: {
          "run-1": { ...validRun(), blockers: "bad", mr: { status: "" }, rawPrompt: "must not persist" },
          "run-2": { ...validRun({ runId: "run-2", scope: { read: [""], write: ["src"], forbidden: [] } }) },
          "run-3": {
            ...validRun({ runId: "run-3" }),
            expectedToStatus: null,
            workerSessionId: null,
            ledgerRevision: { number: null, contentHash: null },
            blockers: [{ reason: "needs owner", questionId: null }],
            mr: { status: "waiting-review", url: null },
            stopReason: null,
          },
        },
        consumedWorkerReportIds: ["report-a"],
      });
      assert(!malformedOptional.valid, "Malformed optional run fields must fail validation.");
      assert(malformedOptional.errors.some((error) => error.includes("blockers")), "Malformed blockers must be reported.");
      assert(malformedOptional.errors.some((error) => error.includes("mr.status")), "Malformed MR status must be reported.");
      assert(malformedOptional.errors.some((error) => error.includes("rawPrompt")), "Unknown run fields must be rejected.");
      assert(malformedOptional.errors.some((error) => error.includes("scope.read")), "Empty scope entries must be rejected.");
      assert(malformedOptional.errors.some((error) => error.includes("expectedToStatus")), "Null optional top-level fields must be rejected.");
      assert(malformedOptional.errors.some((error) => error.includes("ledgerRevision.number")), "Null ledger revision fields must be rejected.");
      assert(malformedOptional.errors.some((error) => error.includes("questionId")), "Null blocker question ids must be rejected.");
      assert(malformedOptional.errors.some((error) => error.includes("mr.url")), "Null MR urls must be rejected.");
    },
  },
  {
    name: "in-memory store saves stable cloned state",
    run: async () => {
      const store = createInMemoryAutopilotRuntimeStore();
      const saved = await store.save((draft) => {
        draft.runs["run-1"] = validRun();
        draft.consumedWorkerReportIds.push("report-b", "report-a", "report-a");
      });
      assert(saved.snapshot.consumedWorkerReportIds.join(",") === "report-a,report-b", `Expected sorted unique reports, got ${saved.snapshot.consumedWorkerReportIds.join(",")}.`);
      saved.snapshot.runs["run-1"].status = "stopped";
      const loaded = await store.load();
      assert(loaded.snapshot.runs["run-1"].status === "running", "Loaded state must be cloned, not externally mutated.");
      loaded.snapshot.runs["run-1"].status = "stopped";
      const loadedAgain = await store.load();
      assert(loadedAgain.snapshot.runs["run-1"].status === "running", "Repeated loads must be cloned, not externally mutated.");
      let failed = false;
      try {
        await store.save((draft) => {
          draft.runs["run-1"].expectedReportId = "";
        });
      } catch {
        failed = true;
      }
      assert(failed, "Invalid in-memory save must throw.");
      const afterFailedSave = await store.load();
      assert(afterFailedSave.snapshot.runs["run-1"].expectedReportId === "report-a", "Invalid in-memory save must preserve previous state.");
      let unknownFieldFailed = false;
      try {
        await store.save((draft) => {
          (draft.runs["run-1"] as Record<string, unknown>).rawPrompt = "must not persist";
        });
      } catch {
        unknownFieldFailed = true;
      }
      assert(unknownFieldFailed, "Invalid in-memory save must reject unknown run fields before normalization.");
    },
  },
  {
    name: "file store treats missing state as clean first run and reports corrupt recovery",
    run: () => withTempDir("recover", async (dir) => {
      const filePath = path.join(dir, ".autopilot", "runtime", "state.json");
      const store = createFileAutopilotRuntimeStore(filePath);
      const missing = await store.load();
      assert(missing.recovered === false, "Missing state should be a clean first-run empty snapshot, not a recovery event.");
      assert(missing.errors.length === 0, `Missing state must not report recovery errors, got ${missing.errors.join("; ")}.`);
      assert(missing.snapshot.schemaVersion === 1, "Missing state must load schemaVersion 1 empty snapshot.");

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "{not json", "utf8");
      const corrupt = await store.load();
      assert(corrupt.recovered === true, "Corrupt state should recover instead of throwing.");
      assert(corrupt.errors.some((error) => error.includes("parse")), `Expected parse error, got ${corrupt.errors.join("; ")}.`);
      assert(Object.keys(corrupt.snapshot.runs).length === 0, "Corrupt state must recover to empty runs.");
      let corruptSaveFailed = false;
      try {
        await store.save((draft) => {
          draft.consumedWorkerReportIds.push("report-after-corruption");
        });
      } catch (error) {
        corruptSaveFailed = true;
        assert(String(error).includes("Refusing to overwrite invalid Autopilot runtime state"), `Corrupt save refusal must be explicit, got ${String(error)}.`);
      }
      assert(corruptSaveFailed, "File store must not overwrite corrupt runtime state after recovery.");

      fs.writeFileSync(filePath, JSON.stringify({ schemaVersion: 2, runs: {}, consumedWorkerReportIds: [] }), "utf8");
      const invalidSchema = await store.load();
      assert(invalidSchema.recovered === true, "Invalid persisted schema should recover instead of throwing.");
      assert(invalidSchema.errors.some((error) => error.includes("schemaVersion")), "Invalid persisted schema must report validation errors.");
      assert(Object.keys(invalidSchema.snapshot.runs).length === 0, "Invalid persisted schema must recover to empty runs.");
    }),
  },
  {
    name: "file store persists consumed reports and active runs",
    run: () => withTempDir("persist", async (dir) => {
      const filePath = path.join(dir, ".autopilot", "runtime", "state.json");
      const store = createFileAutopilotRuntimeStore(filePath);
      await store.save((draft) => {
        draft.runs["run-1"] = fullRun();
        draft.consumedWorkerReportIds.push("report-b", "report-a", "report-a");
      });
      const reloaded = await createFileAutopilotRuntimeStore(filePath).load();
      const run = reloaded.snapshot.runs["run-1"];
      assert(run.createdAt === "2026-06-13T00:00:00.000Z" && run.updatedAt === "2026-06-13T00:00:01.000Z", "File store must persist run timestamps exactly.");
      assert(run.workerSessionId === "session-1", "File store must persist worker session evidence.");
      assert(run.status === "running" && run.taskId === "task-a" && run.ledgerPath === "openspec/changes/change-a/automation/task.json", "File store must persist active run identity and exact ledger path.");
      assert(run.fromStatus === "Ready" && run.expectedToStatus === "Analyze", "File store must persist expected transition evidence.");
      assert(run.expectedReportId === "report-a" && run.workerId === "worker-a", "File store must persist expected worker report evidence.");
      assert(run.ledgerRevision?.number === 7 && run.ledgerRevision.contentHash === "hash-1", "File store must persist ledger revision evidence.");
      assert(run.scope.read.join(",") === "a,b" && run.scope.write.join(",") === "src,tools", "File store must persist normalized scope evidence.");
      assert(run.scope.forbidden.join(",") === ".autopilot/**,openspec/changes/*/automation/**", "File store must persist normalized forbidden scope evidence.");
      assert(run.blockers?.length === 1 && run.blockers[0]?.reason === "needs owner" && run.blockers[0]?.questionId === "q-1", "File store must persist blocker evidence exactly.");
      assert(run.mr?.status === "waiting-review" && run.mr.url === "https://example.invalid/mr/1", "File store must persist MR evidence exactly.");
      assert(run.stopReason === "paused for review", "File store must persist stop evidence.");
      assert(reloaded.snapshot.consumedWorkerReportIds.join(",") === "report-a,report-b", "File store must persist sorted consumed report ids.");
      assert(!fs.readdirSync(path.dirname(filePath)).some((entry) => entry.endsWith(".tmp")), "Atomic save must not leave temp files after success.");
    }),
  },
  {
    name: "file store rejects invalid save and preserves previous state",
    run: () => withTempDir("rollback", async (dir) => {
      const filePath = path.join(dir, ".autopilot", "runtime", "state.json");
      const store = createFileAutopilotRuntimeStore(filePath);
      await store.save((draft) => {
        draft.runs["run-1"] = validRun();
      });
      const before = fs.readFileSync(filePath, "utf8");
      let failed = false;
      try {
        await store.save((draft) => {
          draft.runs["run-1"].taskId = "";
        });
      } catch (error) {
        failed = true;
        assert(String(error).includes("taskId"), `Invalid save should report taskId, got ${String(error)}.`);
      }
      assert(failed, "Invalid save must throw.");
      assert(fs.readFileSync(filePath, "utf8") === before, "Invalid save must preserve previous state file.");
    }),
  },
  {
    name: "file store cleans temp file and preserves state when rename fails",
    run: () => withTempDir("rename-failure", async (dir) => {
      const filePath = path.join(dir, ".autopilot", "runtime", "state.json");
      const store = createFileAutopilotRuntimeStore(filePath);
      await store.save((draft) => {
        draft.runs["run-1"] = validRun();
      });
      const before = fs.readFileSync(filePath, "utf8");
      const originalRenameSync = fs.renameSync;
      fs.renameSync = ((oldPath: fs.PathLike, newPath: fs.PathLike) => {
        if (String(oldPath).endsWith(".tmp") && String(newPath) === filePath) {
          throw new Error("forced rename failure");
        }
        return originalRenameSync(oldPath, newPath);
      }) as typeof fs.renameSync;
      let failed = false;
      try {
        await store.save((draft) => {
          draft.consumedWorkerReportIds.push("report-a");
        });
      } catch (error) {
        failed = true;
        assert(String(error).includes("forced rename failure"), `Expected forced rename failure, got ${String(error)}.`);
      } finally {
        fs.renameSync = originalRenameSync;
      }
      assert(failed, "Forced rename failure must throw.");
      assert(fs.readFileSync(filePath, "utf8") === before, "Failed rename must preserve previous state file.");
      assert(!fs.readdirSync(path.dirname(filePath)).some((entry) => entry.endsWith(".tmp")), "Failed rename must clean temp files.");
      await store.save((draft) => {
        draft.consumedWorkerReportIds.push("report-after-failure");
      });
      const recovered = await store.load();
      assert(recovered.snapshot.consumedWorkerReportIds.includes("report-after-failure"), "Store must accept a successful save after a failed rename.");
    }),
  },
  {
    name: "file store detached methods serialize overlapping saves",
    run: () => withTempDir("serialized", async (dir) => {
      const filePath = path.join(dir, ".autopilot", "runtime", "state.json");
      const { load, save } = createFileAutopilotRuntimeStore(filePath);
      await Promise.all([
        save((draft) => {
          draft.consumedWorkerReportIds.push("report-a");
        }),
        save((draft) => {
          draft.consumedWorkerReportIds.push("report-b");
        }),
      ]);
      const reloaded = await load();
      assert(reloaded.snapshot.consumedWorkerReportIds.join(",") === "report-a,report-b", `Serialized saves must preserve both updates, got ${reloaded.snapshot.consumedWorkerReportIds.join(",")}.`);
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
  console.error(`${failed} autopilot runtime store test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot runtime store tests=${tests.length}`);
