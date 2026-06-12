import { tool } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode-ai/plugin";
import type { AutopilotOptions, AutopilotOutput } from "../../tools/openspec-autopilot-output.ts";
import { applyStopToRuntimeState } from "../../tools/openspec-autopilot-runtime.ts";
import {
  createAnswerBlockerOutput,
  createCollectOutput,
  createRunNextOutput,
  createStatusOutput,
  createStopOutput,
  readAutopilotQueueSummaries,
  readLedgerSummaries,
  validateBlockerAnswer,
} from "../../tools/openspec-autopilot-output.ts";

function jsonOutput(payload: AutopilotOutput | Record<string, unknown>, metadata: Record<string, unknown> = {}): { output: string; metadata: Record<string, unknown> } {
  return {
    output: JSON.stringify(payload, null, 2),
    metadata: {
      ...metadata,
      service: "openspec-autopilot",
      outcome: typeof payload.outcome === "string" ? payload.outcome : "status",
    },
  };
}

function repoRoot(ctx: { worktree?: string; directory?: string }): string {
  return ctx.worktree ?? ctx.directory ?? process.cwd();
}

function stopArgumentContext(args: { target?: string; id?: string; reason?: string }, stopApplied: boolean): { acknowledged: string[]; ignored: string[]; mutation: string } {
  const idProvided = typeof args.id === "string";
  const idAcknowledged = stopApplied && idProvided && (args.target ?? "run") !== "all";
  return {
    acknowledged: stopApplied ? ["target", ...(idAcknowledged ? ["id"] : [])] : ["target"],
    ignored: [...(idProvided && !idAcknowledged ? ["id"] : []), "reason"],
    mutation: stopApplied ? "plugin-owned-runtime-only" : "none",
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
            const queue = readAutopilotQueueSummaries(root, resolvedOptions, { changeId: args.changeId, taskId: args.taskId });
            return jsonOutput(createRunNextOutput(queue.ledgers, { dependencyGraph: queue.dependencyGraph, runtimeState: resolvedOptions.runtimeState }));
          },
        }),
        autopilot_status: tool({
          description: "Return concise OpenSpec Autopilot status for task ledgers, blockers, and MRs.",
          args: {
            changeId: tool.schema.string().optional().describe("Optional OpenSpec change id to inspect."),
          },
          async execute(args) {
            const root = repoRoot(ctx);
            const queue = readAutopilotQueueSummaries(root, resolvedOptions, { changeId: args.changeId });
            return jsonOutput(createStatusOutput(queue.ledgers, { dependencyGraph: queue.dependencyGraph }));
          },
        }),
        autopilot_collect: tool({
          description: "Collect plugin-owned worker reports and attempt legal runtime advancement without direct protected-file mutation.",
          args: {
            taskId: tool.schema.string().optional().describe("Optional task id to collect."),
          },
          async execute(args) {
            const root = repoRoot(ctx);
            const ledgers = readLedgerSummaries(root, resolvedOptions, { taskId: args.taskId });
            return jsonOutput(createCollectOutput(ledgers, { runtimeState: resolvedOptions.runtimeState, mutateRuntimeState: true }));
          },
        }),
        autopilot_answer_blocker: tool({
          description: "Validate a selected user answer envelope for a pending plugin-owned autopilot blocker question. MVP does not mutate state yet.",
          args: {
            questionId: tool.schema.string().describe("Blocker question id."),
            taskId: tool.schema.string().optional().describe("Related task id."),
            selectedLabel: tool.schema.string().optional().describe("Selected option label."),
            action: tool.schema.string().optional().describe("Selected blocker action."),
          },
          async execute(args) {
            const validation = validateBlockerAnswer(resolvedOptions.runtimeState, args);
            return jsonOutput(createAnswerBlockerOutput(args.questionId, validation), {
              argumentContext: {
                acknowledged: validation.accepted ? ["questionId", "taskId", "selectedLabel", "action"] : ["questionId"],
                ignored: validation.accepted ? [] : ["taskId", "selectedLabel", "action"],
                mutation: "none",
              },
            });
          },
        }),
        autopilot_stop: tool({
          description: "Acknowledge a pause or cancel request for an autopilot run/task and report whether plugin-owned active runtime state changed.",
          args: {
            target: tool.schema.string().optional().describe("run, task, or all."),
            id: tool.schema.string().optional().describe("Run id or task id."),
            reason: tool.schema.string().optional().describe("Reason for pause or cancel."),
          },
          async execute(args) {
            const stoppedEntries = applyStopToRuntimeState(args.target, args.id, resolvedOptions.runtimeState);
            const output = createStopOutput(args.target, { id: args.id, stoppedEntries });
            const stopApplied = output.reasonCode === "stop_applied";
            return jsonOutput(output, {
              argumentContext: stopArgumentContext(args, stopApplied),
            });
          },
        }),
      },
    };
  },
} satisfies { id: string; server: Plugin };
