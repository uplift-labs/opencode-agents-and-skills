import fs from "node:fs";
import path from "node:path";
import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import { validateTaskLedger } from "../../tools/autopilot-ledger.ts";

type AutopilotOutcome = "advanced" | "blocked_for_user" | "waiting_for_mr" | "idle" | "failed";
type NextRecommendedCall = "autopilot_status" | "autopilot_collect" | "autopilot_answer_blocker" | null;

type AutopilotOptions = {
  ledgerRoot?: string;
  prototypeLedgerRoot?: string;
};

type LedgerFilter = {
  changeId?: string;
  taskId?: string;
};

type LedgerSummary = {
  path: string;
  id: string;
  taskType: string;
  status: string;
  valid: boolean;
  errors: string[];
  mr?: {
    status?: string;
    url?: string;
  };
};

type AutopilotOutput = {
  outcome: AutopilotOutcome;
  tasksStarted: unknown[];
  tasksAdvanced: unknown[];
  mrsWaiting: Array<{ taskId: string; url?: string; status?: string }>;
  questions: unknown[];
  blockers: Array<{ taskId?: string; reason: string; path?: string; errors?: string[] }>;
  nextRecommendedCall: NextRecommendedCall;
  summary: string;
};

const defaultLedgerRoot = "openspec/changes";
const defaultPrototypeLedgerRoot = ".autopilot/prototype/tasks";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function jsonOutput(payload: AutopilotOutput | Record<string, unknown>): { output: string; metadata: Record<string, unknown> } {
  return {
    output: JSON.stringify(payload, null, 2),
    metadata: {
      service: "openspec-autopilot",
      outcome: typeof payload.outcome === "string" ? payload.outcome : "status",
    },
  };
}

function repoRoot(ctx: { worktree?: string; directory?: string }): string {
  return ctx.worktree ?? ctx.directory ?? process.cwd();
}

function toRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function listTaskLedgerFiles(root: string, options: AutopilotOptions): string[] {
  const files: string[] = [];
  const ledgerRoot = path.join(root, options.ledgerRoot ?? defaultLedgerRoot);
  const prototypeRoot = path.join(root, options.prototypeLedgerRoot ?? defaultPrototypeLedgerRoot);

  if (fs.existsSync(ledgerRoot) && fs.statSync(ledgerRoot).isDirectory()) {
    for (const change of fs.readdirSync(ledgerRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!change.isDirectory()) {
        continue;
      }
      const taskPath = path.join(ledgerRoot, change.name, "automation", "task.json");
      if (fs.existsSync(taskPath) && fs.statSync(taskPath).isFile()) {
        files.push(taskPath);
      }
    }
  }

  if (fs.existsSync(prototypeRoot) && fs.statSync(prototypeRoot).isDirectory()) {
    for (const entry of fs.readdirSync(prototypeRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(path.join(prototypeRoot, entry.name));
      }
    }
  }

  return files;
}

function ledgerMatchesFilter(ledger: LedgerSummary, filter: LedgerFilter): boolean {
  if (filter.changeId && !ledger.path.startsWith(`openspec/changes/${filter.changeId}/`)) {
    return false;
  }
  if (filter.taskId && ledger.id !== filter.taskId) {
    return false;
  }
  return true;
}

function readLedgerSummaries(root: string, options: AutopilotOptions, filter: LedgerFilter = {}): LedgerSummary[] {
  return listTaskLedgerFiles(root, options).map((filePath) => {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      const result = validateTaskLedger(parsed, { sourcePath: toRelative(root, filePath) });
      const record = isRecord(parsed) ? parsed : {};
      const mr = isRecord(record.mr) ? record.mr : {};
      return {
        path: toRelative(root, filePath),
        id: asString(record.id, path.basename(filePath, ".json")),
        taskType: asString(record.taskType, "unknown"),
        status: asString(record.status, "unknown"),
        valid: result.valid,
        errors: result.errors,
        mr: {
          status: typeof mr.status === "string" ? mr.status : undefined,
          url: typeof mr.url === "string" ? mr.url : undefined,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        path: toRelative(root, filePath),
        id: path.basename(filePath, ".json"),
        taskType: "unknown",
        status: "unknown",
        valid: false,
        errors: [`Failed to read task ledger: ${message}`],
      };
    }
  }).filter((ledger) => ledgerMatchesFilter(ledger, filter));
}

function summarizeLedgers(ledgers: LedgerSummary[]): Record<string, unknown> {
  const byStatus: Record<string, number> = {};
  const byTaskType: Record<string, number> = {};
  for (const ledger of ledgers) {
    byStatus[ledger.status] = (byStatus[ledger.status] ?? 0) + 1;
    byTaskType[ledger.taskType] = (byTaskType[ledger.taskType] ?? 0) + 1;
  }
  return {
    total: ledgers.length,
    valid: ledgers.filter((ledger) => ledger.valid).length,
    invalid: ledgers.filter((ledger) => !ledger.valid).length,
    byStatus,
    byTaskType,
  };
}

function mrsWaiting(ledgers: LedgerSummary[]): AutopilotOutput["mrsWaiting"] {
  return ledgers
    .filter((ledger) => ["created", "updated", "waiting-review"].includes(ledger.mr?.status ?? ""))
    .map((ledger) => ({ taskId: ledger.id, status: ledger.mr?.status, url: ledger.mr?.url }));
}

function invalidBlockers(ledgers: LedgerSummary[]): AutopilotOutput["blockers"] {
  return ledgers
    .filter((ledger) => !ledger.valid)
    .map((ledger) => ({ taskId: ledger.id, path: ledger.path, reason: "invalid task ledger", errors: ledger.errors }));
}

function baseOutput(ledgers: LedgerSummary[], summary: string, outcome?: AutopilotOutcome): AutopilotOutput {
  const blockers = invalidBlockers(ledgers);
  const waiting = mrsWaiting(ledgers);
  const resolvedOutcome = outcome ?? (blockers.length > 0 ? "failed" : waiting.length > 0 ? "waiting_for_mr" : "idle");
  return {
    outcome: resolvedOutcome,
    tasksStarted: [],
    tasksAdvanced: [],
    mrsWaiting: waiting,
    questions: [],
    blockers,
    nextRecommendedCall: null,
    summary,
  };
}

export default {
  id: "openspec.autopilot",
  server: async (ctx, options?: AutopilotOptions) => {
    const resolvedOptions = options ?? {};
    return {
      tool: {
        autopilot_run_next: tool({
          description:
            "Continue OpenSpec Autopilot as far as safely possible until blocker, MR wait, idle state, or MVP limit. The plugin is authoritative for process/state transitions.",
          args: {
            changeId: tool.schema.string().optional().describe("Optional OpenSpec change id to prefer."),
            taskId: tool.schema.string().optional().describe("Optional task id to prefer."),
          },
          async execute(args) {
            const root = repoRoot(ctx);
            const ledgers = readLedgerSummaries(root, resolvedOptions, { changeId: args.changeId, taskId: args.taskId });
            if (ledgers.length === 0) {
              return jsonOutput(baseOutput(ledgers, "No OpenSpec autopilot task ledgers were found. MVP prototype does not create ledgers automatically yet.", "idle"));
            }
            const output = baseOutput(
              ledgers,
              `MVP autopilot inspected ${ledgers.length} task ledger(s). Worker dispatch, MR sync, and ledger mutation are intentionally deferred; use autopilot_status for details.`,
            );
            return jsonOutput(output);
          },
        }),
        autopilot_status: tool({
          description: "Return concise OpenSpec Autopilot status for task ledgers, blockers, and MRs.",
          args: {
            changeId: tool.schema.string().optional().describe("Optional OpenSpec change id to inspect."),
          },
          async execute(args) {
            const root = repoRoot(ctx);
            const ledgers = readLedgerSummaries(root, resolvedOptions, { changeId: args.changeId });
            return jsonOutput({
              outcome: invalidBlockers(ledgers).length > 0 ? "failed" : mrsWaiting(ledgers).length > 0 ? "waiting_for_mr" : "idle",
              status: summarizeLedgers(ledgers),
              mrsWaiting: mrsWaiting(ledgers),
              blockers: invalidBlockers(ledgers),
              nextRecommendedCall: invalidBlockers(ledgers).length === 0 && mrsWaiting(ledgers).length === 0 && ledgers.length > 0 ? "autopilot_run_next" : null,
              summary: `Autopilot status inspected ${ledgers.length} task ledger(s).`,
            });
          },
        }),
        autopilot_collect: tool({
          description: "Collect finished worker reports and attempt legal state advancement. MVP validates ledgers and returns no-op collect status.",
          args: {
            taskId: tool.schema.string().optional().describe("Optional task id to collect."),
          },
          async execute(args) {
            const root = repoRoot(ctx);
            const ledgers = readLedgerSummaries(root, resolvedOptions, { taskId: args.taskId });
            return jsonOutput(
              baseOutput(
                ledgers,
                `MVP collect inspected ${ledgers.length} task ledger(s). Runtime worker report collection and legal state mutation are deferred.`,
              ),
            );
          },
        }),
        autopilot_answer_blocker: tool({
          description: "Apply a selected user answer to an autopilot blocker question. MVP accepts the envelope but does not mutate state yet.",
          args: {
            questionId: tool.schema.string().describe("Blocker question id."),
            taskId: tool.schema.string().optional().describe("Related task id."),
            selectedLabel: tool.schema.string().optional().describe("Selected option label."),
            action: tool.schema.string().optional().describe("Selected blocker action."),
          },
          async execute(args) {
            return jsonOutput({
              outcome: "idle",
              tasksStarted: [],
              tasksAdvanced: [],
              mrsWaiting: [],
              questions: [],
              blockers: [],
              nextRecommendedCall: "autopilot_run_next",
              summary: `Accepted blocker answer envelope for ${args.questionId}. MVP state mutation is deferred.`,
            });
          },
        }),
        autopilot_stop: tool({
          description: "Pause or cancel an autopilot run/task. MVP returns a safe no-op stop result.",
          args: {
            target: tool.schema.string().optional().describe("run, task, or all."),
            id: tool.schema.string().optional().describe("Run id or task id."),
            reason: tool.schema.string().optional().describe("Reason for pause or cancel."),
          },
          async execute(args) {
            return jsonOutput({
              outcome: "idle",
              tasksStarted: [],
              tasksAdvanced: [],
              mrsWaiting: [],
              questions: [],
              blockers: [],
              nextRecommendedCall: "autopilot_status",
              summary: `No active MVP runtime state was changed for stop target ${args.target ?? "run"}.`,
            });
          },
        }),
      },
    };
  },
} satisfies { id: string; server: Plugin };
