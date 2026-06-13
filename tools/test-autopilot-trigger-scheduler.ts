#!/usr/bin/env node
import {
  AUTOPILOT_TRIGGER_SOURCE,
  createAutopilotTriggerScheduler,
  summarizeSchedulerSnapshot,
  triggerJobKey,
  type AutopilotTriggerExecution,
  type AutopilotTriggerScheduler,
} from "./autopilot-trigger-scheduler.ts";
import type { AutopilotTriggerJob } from "./autopilot-programmatic-triggers.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function makeJob(overrides: Partial<AutopilotTriggerJob> = {}): AutopilotTriggerJob {
  return {
    id: "job-1",
    kind: "status",
    scope: { changeId: "change-a", taskId: "task-a" },
    sourceEvent: "file.watcher.updated",
    sourceID: "openspec/changes/change-a/tasks.md",
    debounceMs: 100,
    cooldownMs: 1000,
    requiresRuntimeOwnership: false,
    claimCapable: false,
    reason: "test job",
    ...overrides,
  };
}

function createTestScheduler(executions: AutopilotTriggerExecution[], now: () => number): AutopilotTriggerScheduler {
  return createAutopilotTriggerScheduler({
    now,
    execute: async (execution) => {
      executions.push(execution);
    },
  });
}

const tests: TestCase[] = [
  {
    name: "job keys normalize scope order and source identity",
    run: () => {
      const left = makeJob({ scope: { changeId: "change-a", taskId: "task-a" } });
      const right = makeJob({ scope: { taskId: "task-a", changeId: "change-a" } });
      assert(triggerJobKey(left) === triggerJobKey(right), `Expected stable key, got ${triggerJobKey(left)} vs ${triggerJobKey(right)}.`);
      assert(triggerJobKey(makeJob({ scope: undefined })) === "status|scope=none|source=openspec/changes/change-a/tasks.md", "Undefined scope must use stable empty scope key.");
      assert(triggerJobKey(makeJob({ scope: { changeId: " ", taskId: "task-a" } })) === "status|taskId=task-a|source=openspec/changes/change-a/tasks.md", "Blank scope fields must be ignored.");
      assert(triggerJobKey(makeJob({ sourceID: undefined })).endsWith("source=none"), "Missing sourceID must use stable source=none key.");
      assert(triggerJobKey(makeJob({ sourceID: "other" })) !== triggerJobKey(makeJob({ sourceID: "openspec/changes/change-a/tasks.md" })), "Different source IDs must not coalesce.");
      assert(triggerJobKey(makeJob({ kind: "check" })) !== triggerJobKey(makeJob({ kind: "status" })), "Different job kinds must not coalesce.");
    },
  },
  {
    name: "debounce coalesces duplicate pending jobs into one execution",
    run: async () => {
      let currentTime = 0;
      const executions: AutopilotTriggerExecution[] = [];
      const scheduler = createTestScheduler(executions, () => currentTime);

      const first = scheduler.enqueue(makeJob({ id: "first" }));
      const second = scheduler.enqueue(makeJob({ id: "second", scope: { taskId: "task-a", changeId: "change-a" } }));
      assert(first.status === "scheduled", `Expected first job scheduled, got ${first.status}.`);
      assert(second.status === "coalesced", `Expected duplicate job coalesced, got ${second.status}.`);
      assert(scheduler.snapshot().pending.length === 1, "Duplicate debounce key must keep one pending job.");

      currentTime = 99;
      await scheduler.flushDue();
      assert(executions.length === 0, "Debounced job must not execute before due time.");

      currentTime = 100;
      await scheduler.flushDue();
      assert(executions.length === 1, `Expected one execution after debounce, got ${executions.length}.`);
      assert(executions[0]?.coalescedCount === 1, `Expected one coalesced duplicate, got ${executions[0]?.coalescedCount}.`);
      assert(executions[0]?.sourceTag === AUTOPILOT_TRIGGER_SOURCE, "Scheduler must tag executions as Autopilot-triggered.");
    },
  },
  {
    name: "debounce resets due time when duplicate arrives inside window",
    run: async () => {
      let currentTime = 0;
      const executions: AutopilotTriggerExecution[] = [];
      const scheduler = createTestScheduler(executions, () => currentTime);

      scheduler.enqueue(makeJob({ id: "first" }));
      currentTime = 80;
      const coalesced = scheduler.enqueue(makeJob({ id: "second" }));
      assert(coalesced.status === "coalesced", `Expected coalesced duplicate, got ${coalesced.status}.`);
      assert(coalesced.dueAt === 180, `Expected debounce reset dueAt=180, got ${coalesced.dueAt}.`);

      currentTime = 100;
      await scheduler.flushDue();
      assert(executions.length === 0, "Debounce reset must suppress execution at the original due time.");

      currentTime = 180;
      await scheduler.flushDue();
      assert(executions.length === 1, `Expected one execution after reset due time, got ${executions.length}.`);
      assert(executions[0]?.job.id === "second", `Expected latest coalesced job to execute, got ${executions[0]?.job.id}.`);
    },
  },
  {
    name: "due jobs execute sequentially in stable order",
    run: async () => {
      let currentTime = 0;
      const order: string[] = [];
      const scheduler = createAutopilotTriggerScheduler({
        now: () => currentTime,
        execute: async (execution) => {
          order.push(`start:${execution.job.kind}`);
          await Promise.resolve();
          order.push(`end:${execution.job.kind}`);
        },
      });

      scheduler.enqueue(makeJob({ kind: "answer_blocker", id: "answer", blockerAnswer: { questionId: "question-a" } }));
      scheduler.enqueue(makeJob({ kind: "status", id: "status" }));
      currentTime = 100;
      await scheduler.flushDue();

      assert(
        JSON.stringify(order) === JSON.stringify(["start:answer_blocker", "end:answer_blocker", "start:status", "end:status"]),
        `Due jobs must execute sequentially with answer before status follow-up, got ${JSON.stringify(order)}.`,
      );
    },
  },
  {
    name: "due jobs execute by due time before key order",
    run: async () => {
      let currentTime = 0;
      const order: string[] = [];
      const scheduler = createAutopilotTriggerScheduler({
        now: () => currentTime,
        execute: async (execution) => {
          order.push(execution.job.kind);
        },
      });

      scheduler.enqueue(makeJob({ kind: "answer_blocker", id: "later", debounceMs: 100, blockerAnswer: { questionId: "question-a" } }));
      scheduler.enqueue(makeJob({ kind: "status", id: "earlier", debounceMs: 50 }));
      currentTime = 100;
      await scheduler.flushDue();

      assert(JSON.stringify(order) === JSON.stringify(["status", "answer_blocker"]), `Earlier dueAt must execute before lexical key order, got ${JSON.stringify(order)}.`);
    },
  },
  {
    name: "due job failure does not drop later due jobs",
    run: async () => {
      let currentTime = 0;
      const order: string[] = [];
      const scheduler = createAutopilotTriggerScheduler({
        now: () => currentTime,
        execute: async (execution) => {
          order.push(execution.job.id);
          if (execution.job.id === "first") {
            throw new Error("first failed");
          }
        },
      });

      scheduler.enqueue(makeJob({ id: "first", kind: "answer_blocker", blockerAnswer: { questionId: "question-a" } }));
      scheduler.enqueue(makeJob({ id: "second", kind: "status" }));
      currentTime = 100;
      let failed = false;
      try {
        await scheduler.flushDue();
      } catch (error) {
        failed = error instanceof Error && error.message === "first failed";
      }

      assert(failed, "flushDue must surface the first due job failure after draining the batch.");
      assert(JSON.stringify(order) === JSON.stringify(["first", "second"]), `Later due jobs must still execute after an earlier failure, got ${JSON.stringify(order)}.`);
      assert(scheduler.snapshot().pending.length === 0, "Failed due batch must not leave deleted jobs as invisible pending work.");
    },
  },
  {
    name: "cooldown suppresses repeated jobs after execution",
    run: async () => {
      let currentTime = 0;
      const executions: AutopilotTriggerExecution[] = [];
      const scheduler = createTestScheduler(executions, () => currentTime);

      scheduler.enqueue(makeJob());
      currentTime = 100;
      await scheduler.flushDue();
      assert(executions.length === 1, "Initial job must execute.");

      currentTime = 150;
      const suppressed = scheduler.enqueue(makeJob());
      assert(suppressed.status === "cooldown", `Expected cooldown suppression, got ${suppressed.status}.`);

      currentTime = 1099;
      const boundarySuppressed = scheduler.enqueue(makeJob());
      assert(boundarySuppressed.status === "cooldown", `Expected cooldown before exact boundary, got ${boundarySuppressed.status}.`);

      currentTime = 1100;
      const rescheduled = scheduler.enqueue(makeJob());
      assert(rescheduled.status === "scheduled", `Expected reschedule after cooldown, got ${rescheduled.status}.`);
    },
  },
  {
    name: "cooldown applies after failed execution attempts",
    run: async () => {
      let currentTime = 0;
      const scheduler = createAutopilotTriggerScheduler({
        now: () => currentTime,
        execute: async () => {
          throw new Error("boom");
        },
      });

      scheduler.enqueue(makeJob());
      currentTime = 100;
      let failed = false;
      try {
        await scheduler.flushDue();
      } catch {
        failed = true;
      }
      assert(failed, "Failed execution must propagate to the flusher.");
      currentTime = 101;
      const suppressed = scheduler.enqueue(makeJob());
      assert(suppressed.status === "cooldown", `Expected failed attempt to start cooldown, got ${suppressed.status}.`);
    },
  },
  {
    name: "single-flight joins duplicate jobs while execution is running",
    run: async () => {
      let currentTime = 0;
      const gate = deferred();
      const executions: AutopilotTriggerExecution[] = [];
      const scheduler = createAutopilotTriggerScheduler({
        now: () => currentTime,
        execute: async (execution) => {
          executions.push(execution);
          await gate.promise;
        },
      });

      scheduler.enqueue(makeJob());
      currentTime = 100;
      const flush = scheduler.flushDue();
      await Promise.resolve();
      assert(executions.length === 1, "First due job must start running.");

      const joined = scheduler.enqueue(makeJob());
      assert(joined.status === "joined", `Expected duplicate running job to join, got ${joined.status}.`);
      assert(scheduler.snapshot().inFlight.length === 1, "Single-flight must keep one in-flight execution.");
      assert(scheduler.snapshot().inFlight[0]?.joinedCount === 1, `Expected one joined duplicate, got ${scheduler.snapshot().inFlight[0]?.joinedCount}.`);
      assert(scheduler.snapshot().pending.length === 0, "Joined duplicate must not leave pending work.");

      gate.resolve();
      await flush;
      assert(scheduler.snapshot().inFlight.length === 0, "In-flight execution must clear after completion.");
      currentTime = 200;
      await scheduler.flushDue();
      assert(executions.length === 1, `Joined duplicate must not execute later, got ${executions.length} executions.`);
    },
  },
  {
    name: "single-flight is safe when executor enqueues re-entrantly",
    run: async () => {
      let currentTime = 0;
      const executions: AutopilotTriggerExecution[] = [];
      const enqueueResults: string[] = [];
      let scheduler!: AutopilotTriggerScheduler;
      scheduler = createAutopilotTriggerScheduler({
        now: () => currentTime,
        execute: (execution) => {
          executions.push(execution);
          enqueueResults.push(scheduler.enqueue(makeJob()).status);
        },
      });

      scheduler.enqueue(makeJob());
      currentTime = 100;
      await scheduler.flushDue();
      assert(executions.length === 1, `Expected one re-entrant execution, got ${executions.length}.`);
      assert(enqueueResults.join(",") === "joined", `Expected re-entrant enqueue to join, got ${enqueueResults.join(",")}.`);
      assert(scheduler.snapshot().pending.length === 0, "Re-entrant joined job must not create pending work.");
    },
  },
  {
    name: "dispose cancels pending jobs and rejects new work",
    run: async () => {
      let currentTime = 0;
      const executions: AutopilotTriggerExecution[] = [];
      const scheduler = createTestScheduler(executions, () => currentTime);

      scheduler.enqueue(makeJob());
      scheduler.dispose();
      currentTime = 100;
      await scheduler.flushDue();
      assert(executions.length === 0, "Disposed scheduler must not execute pending jobs.");
      const afterDispose = scheduler.enqueue(makeJob());
      assert(afterDispose.status === "disposed", `Expected disposed result, got ${afterDispose.status}.`);
    },
  },
  {
    name: "recursion guard suppresses Autopilot-triggered source events",
    run: async () => {
      let currentTime = 0;
      const executions: AutopilotTriggerExecution[] = [];
      const scheduler = createTestScheduler(executions, () => currentTime);

      for (const job of [
        makeJob({ sourceEvent: AUTOPILOT_TRIGGER_SOURCE }),
        makeJob({ sourceID: AUTOPILOT_TRIGGER_SOURCE }),
        makeJob({ sourceID: `${AUTOPILOT_TRIGGER_SOURCE}:status` }),
      ]) {
        const recursive = scheduler.enqueue(job);
        assert(recursive.status === "recursive", `Expected recursive suppression, got ${recursive.status}.`);
      }
      assert(scheduler.snapshot().pending.length === 0, "Recursive jobs must not remain pending.");

      scheduler.enqueue(makeJob({ sourceID: "openspec/changes/change-a/tasks.md" }));
      currentTime = 100;
      await scheduler.flushDue();
      assert(executions.length === 1, `Expected only non-recursive job to execute, got ${executions.length}.`);
      assert(executions[0]?.sourceTag === AUTOPILOT_TRIGGER_SOURCE, "Non-recursive execution must carry source tag.");
    },
  },
  {
    name: "scheduler summary is safe for compact logging",
    run: () => {
      let currentTime = 0;
      const executions: AutopilotTriggerExecution[] = [];
      const scheduler = createTestScheduler(executions, () => currentTime);
      scheduler.enqueue(makeJob({ sourceID: "C:/secret/path", reason: "contains secret text" }));
      const summary = summarizeSchedulerSnapshot(scheduler.snapshot());
      const serialized = JSON.stringify(summary);
      assert(summary.pendingCount === 1, `Expected one pending job in summary, got ${summary.pendingCount}.`);
      assert(!serialized.includes("secret"), `Safe summary must not include raw source/reason values: ${serialized}`);
      assert(!serialized.includes("C:/"), `Safe summary must not include raw paths: ${serialized}`);
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
  console.error(`${failed} autopilot trigger scheduler test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot trigger scheduler tests=${tests.length}`);
