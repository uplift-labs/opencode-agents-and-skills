import type { TuiPlugin } from "@opencode-ai/plugin/tui";
import { runAutopilotCheck } from "../../tools/autopilot-check.ts";
import { parseAutopilotTriggerOptions } from "../../tools/autopilot-programmatic-triggers.ts";
import type { AutopilotOptions } from "../../tools/openspec-autopilot-output.ts";
import { createAutopilotController } from "../../tools/openspec-autopilot-controller.ts";

type AutopilotPluginOptions = AutopilotOptions & {
  triggers?: unknown;
};

type TuiApi = {
  state?: { path?: { directory?: string; worktree?: string } };
  keymap: {
    registerLayer: (layer: { commands: Array<Record<string, unknown>>; bindings?: Array<Record<string, unknown>> }) => void;
  };
  ui: {
    toast: (input: { variant?: string; message: string; duration?: number }) => void;
    dialog?: {
      replace?: (factory: () => unknown) => void;
      clear?: () => void;
    };
    DialogPrompt?: (input: { title: string; placeholder?: string; onConfirm: (value: string) => void | Promise<void>; onCancel?: () => void }) => unknown;
  };
};

function optionalNonEmptyString(value?: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function triggerOptions(options: AutopilotPluginOptions): ReturnType<typeof parseAutopilotTriggerOptions> {
  return parseAutopilotTriggerOptions(isRecord(options.triggers) ? options.triggers : undefined);
}

function tuiRoot(api: TuiApi): string {
  return optionalNonEmptyString(api.state?.path?.worktree) ?? optionalNonEmptyString(api.state?.path?.directory) ?? process.cwd();
}

function toastAutopilotOutput(api: TuiApi, label: string, output: { outcome: string; reasonCode: string; taskSummaries?: unknown[]; exitCode?: number; status?: string }): void {
  const status = output.status ?? output.outcome;
  const count = Array.isArray(output.taskSummaries) ? ` tasks=${output.taskSummaries.length}` : "";
  const exit = typeof output.exitCode === "number" ? ` exit=${output.exitCode}` : "";
  api.ui.toast({ variant: output.exitCode === 0 || output.outcome !== "failed" ? "info" : "warning", message: `${label}: ${status}/${output.reasonCode}${count}${exit}`, duration: 8000 });
}

export default {
  id: "openspec.autopilot.tui",
  tui: async (api: TuiApi, options?: AutopilotPluginOptions) => {
    const resolvedTriggerOptions = triggerOptions(options ?? {});
    if (resolvedTriggerOptions.tuiCommands?.enabled !== true) {
      return;
    }
    api.keymap.registerLayer({
      commands: [
        {
          name: "autopilot.status",
          title: "Autopilot Status",
          desc: "Show OpenSpec Autopilot status without an LLM turn.",
          category: "Autopilot",
          namespace: "palette",
          slashName: "autopilot-status",
          async run() {
            const controller = createAutopilotController({ root: tuiRoot(api) }, options ?? {});
            const result = await controller.status({}, { kind: "tui-command", name: "autopilot.status" });
            toastAutopilotOutput(api, "Autopilot status", result.payload);
          },
        },
        {
          name: "autopilot.check",
          title: "Autopilot Cheap Check",
          desc: "Run a cheap OpenSpec Autopilot check without an LLM turn.",
          category: "Autopilot",
          namespace: "palette",
          slashName: "autopilot-check",
          run() {
            const result = runAutopilotCheck(tuiRoot(api), { level: "cheap" });
            toastAutopilotOutput(api, "Autopilot cheap check", { outcome: result.status === "failed" || result.status === "blocked" ? "failed" : "idle", reasonCode: "advanced", status: result.status, exitCode: result.exitCode });
          },
        },
        {
          name: "autopilot.run",
          title: "Autopilot Run",
          desc: "Prepare an explicit /autopilot prompt-mediated continuation.",
          category: "Autopilot",
          namespace: "palette",
          slashName: "autopilot-run",
          run() {
            const showFallback = (scope: string): void => {
              const suffix = scope.trim().length > 0 ? ` ${scope.trim()}` : "";
              api.ui.toast({ variant: "info", message: `Use prompt-mediated fallback: /autopilot${suffix}`, duration: 10000 });
            };
            if (api.ui.dialog?.replace != null && api.ui.DialogPrompt != null) {
              api.ui.dialog.replace(() => api.ui.DialogPrompt?.({
                title: "Autopilot run scope",
                placeholder: "optional changeId or taskId",
                onConfirm: async (scope) => {
                  api.ui.dialog?.clear?.();
                  showFallback(scope);
                },
                onCancel: () => api.ui.dialog?.clear?.(),
              }));
              return;
            }
            showFallback("");
          },
        },
        {
          name: "autopilot.stop",
          title: "Autopilot Stop",
          desc: "Prepare an explicit prompt-mediated Autopilot stop request.",
          category: "Autopilot",
          namespace: "palette",
          slashName: "autopilot-stop",
          run() {
            api.ui.toast({ variant: "info", message: "Use prompt-mediated fallback: ask Autopilot to call autopilot_stop with target/id/reason.", duration: 10000 });
          },
        },
      ],
    });
  },
} satisfies { id: string; tui: TuiPlugin };
