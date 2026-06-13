import type { AutopilotTriggerJob, AutopilotTriggerScope } from "./autopilot-programmatic-triggers.ts";

export const AUTOPILOT_TRIGGER_SOURCE = "autopilot-trigger";

export type AutopilotTriggerExecution = {
  key: string;
  job: AutopilotTriggerJob;
  sourceTag: typeof AUTOPILOT_TRIGGER_SOURCE;
  coalescedCount: number;
  startedAt: number;
};

export type AutopilotTriggerEnqueueStatus = "scheduled" | "coalesced" | "joined" | "cooldown" | "recursive" | "disposed";

export type AutopilotTriggerEnqueueResult = {
  status: AutopilotTriggerEnqueueStatus;
  key: string;
  dueAt?: number;
  reason: string;
};

export type AutopilotTriggerSchedulerSnapshot = {
  disposed: boolean;
  pending: Array<{ key: string; dueAt: number; coalescedCount: number }>;
  inFlight: Array<{ key: string; joinedCount: number }>;
  cooldowns: Array<{ key: string; lastRunAt: number }>;
};

export type AutopilotTriggerSchedulerSummary = {
  disposed: boolean;
  pendingCount: number;
  inFlightCount: number;
  cooldownCount: number;
};

export type AutopilotTriggerScheduler = {
  enqueue(job: AutopilotTriggerJob): AutopilotTriggerEnqueueResult;
  flushDue(now?: number): Promise<void>;
  dispose(): void;
  snapshot(): AutopilotTriggerSchedulerSnapshot;
};

type SchedulerOptions = {
  now?: () => number;
  execute: (execution: AutopilotTriggerExecution) => Promise<void> | void;
};

type PendingJob = {
  job: AutopilotTriggerJob;
  dueAt: number;
  coalescedCount: number;
};

type InFlightJob = {
  promise: Promise<void>;
  joinedCount: number;
};

function stableScopeKey(scope: AutopilotTriggerScope | undefined): string {
  if (scope == null) {
    return "scope=none";
  }
  const parts = Object.entries(scope)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);
  return parts.length === 0 ? "scope=none" : parts.join(";");
}

export function triggerJobKey(job: Pick<AutopilotTriggerJob, "kind" | "scope" | "sourceID">): string {
  return [job.kind, stableScopeKey(job.scope), `source=${job.sourceID ?? "none"}`].join("|");
}

export function summarizeSchedulerSnapshot(snapshot: AutopilotTriggerSchedulerSnapshot): AutopilotTriggerSchedulerSummary {
  return {
    disposed: snapshot.disposed,
    pendingCount: snapshot.pending.length,
    inFlightCount: snapshot.inFlight.length,
    cooldownCount: snapshot.cooldowns.length,
  };
}

function recursiveSource(job: AutopilotTriggerJob): boolean {
  return job.sourceEvent === AUTOPILOT_TRIGGER_SOURCE
    || job.sourceID === AUTOPILOT_TRIGGER_SOURCE
    || job.sourceID?.startsWith(`${AUTOPILOT_TRIGGER_SOURCE}:`) === true;
}

function sortedPending(pending: Map<string, PendingJob>): AutopilotTriggerSchedulerSnapshot["pending"] {
  return Array.from(pending.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, dueAt: value.dueAt, coalescedCount: value.coalescedCount }));
}

function sortedInFlight(inFlight: Map<string, InFlightJob>): AutopilotTriggerSchedulerSnapshot["inFlight"] {
  return Array.from(inFlight.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, joinedCount: value.joinedCount }));
}

function sortedCooldowns(lastRunAt: Map<string, number>): AutopilotTriggerSchedulerSnapshot["cooldowns"] {
  return Array.from(lastRunAt.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, lastRunAt: value }));
}

export function createAutopilotTriggerScheduler(options: SchedulerOptions): AutopilotTriggerScheduler {
  const now = options.now ?? (() => Date.now());
  const pending = new Map<string, PendingJob>();
  const inFlight = new Map<string, InFlightJob>();
  const lastRunAt = new Map<string, number>();
  let disposed = false;

  async function runJob(key: string, pendingJob: PendingJob): Promise<void> {
    const execution: AutopilotTriggerExecution = {
      key,
      job: pendingJob.job,
      sourceTag: AUTOPILOT_TRIGGER_SOURCE,
      coalescedCount: pendingJob.coalescedCount,
      startedAt: now(),
    };
    const inFlightJob: InFlightJob = {
      promise: Promise.resolve(),
      joinedCount: 0,
    };
    inFlight.set(key, inFlightJob);
    const promise = Promise.resolve().then(() => options.execute(execution)).then(() => undefined);
    inFlightJob.promise = promise;
    try {
      await promise;
    } finally {
      lastRunAt.set(key, now());
      inFlight.delete(key);
    }
  }

  return {
    enqueue(job: AutopilotTriggerJob): AutopilotTriggerEnqueueResult {
      const key = triggerJobKey(job);
      if (disposed) {
        return { status: "disposed", key, reason: "scheduler is disposed" };
      }
      if (recursiveSource(job)) {
        return { status: "recursive", key, reason: "recursive Autopilot-triggered source suppressed" };
      }
      const running = inFlight.get(key);
      if (running != null) {
        running.joinedCount++;
        return { status: "joined", key, reason: "equivalent job is already in flight" };
      }
      const currentTime = now();
      const previousRunAt = lastRunAt.get(key);
      if (previousRunAt != null && currentTime - previousRunAt < job.cooldownMs) {
        return { status: "cooldown", key, reason: "equivalent job is cooling down" };
      }
      const dueAt = currentTime + job.debounceMs;
      const existing = pending.get(key);
      if (existing != null) {
        pending.set(key, { job, dueAt, coalescedCount: existing.coalescedCount + 1 });
        return { status: "coalesced", key, dueAt, reason: "equivalent pending job coalesced" };
      }
      pending.set(key, { job, dueAt, coalescedCount: 0 });
      return { status: "scheduled", key, dueAt, reason: "job scheduled" };
    },

    async flushDue(flushTime = now()): Promise<void> {
      if (disposed) {
        return;
      }
      const due = Array.from(pending.entries())
        .filter(([, value]) => value.dueAt <= flushTime)
        .sort(([leftKey, left], [rightKey, right]) => left.dueAt - right.dueAt || leftKey.localeCompare(rightKey));
      for (const [key] of due) {
        pending.delete(key);
      }
      const errors: unknown[] = [];
      for (const [key, value] of due) {
        try {
          await runJob(key, value);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw errors[0];
      }
    },

    dispose(): void {
      disposed = true;
      pending.clear();
    },

    snapshot(): AutopilotTriggerSchedulerSnapshot {
      return {
        disposed,
        pending: sortedPending(pending),
        inFlight: sortedInFlight(inFlight),
        cooldowns: sortedCooldowns(lastRunAt),
      };
    },
  };
}
