export type AutopilotLiveBundleFile = {
  source: string;
  destination: string;
  label: string;
};

export const autopilotPluginSpec = "./.opencode/plugins/openspec-autopilot.ts";
export const autopilotPackageJson = ".opencode/package.json";
export const autopilotPluginOptions = {
  workerDispatch: { enabled: true },
  triggers: { triggerMode: "observe" },
} as const;

export const autopilotLiveBundleFiles: AutopilotLiveBundleFile[] = [
  { source: ".opencode/plugins/openspec-autopilot.ts", destination: ".opencode/plugins/openspec-autopilot.ts", label: "Autopilot server plugin" },
  { source: ".opencode/tui-plugins/openspec-autopilot-tui.ts", destination: ".opencode/tui-plugins/openspec-autopilot-tui.ts", label: "Autopilot TUI plugin" },
  { source: "tools/openspec-autopilot-controller.ts", destination: "tools/openspec-autopilot-controller.ts", label: "Autopilot helper tools/openspec-autopilot-controller.ts" },
  { source: "tools/openspec-autopilot-output.ts", destination: "tools/openspec-autopilot-output.ts", label: "Autopilot helper tools/openspec-autopilot-output.ts" },
  { source: "tools/openspec-autopilot-active-change-queue.ts", destination: "tools/openspec-autopilot-active-change-queue.ts", label: "Autopilot helper tools/openspec-autopilot-active-change-queue.ts" },
  { source: "tools/autopilot-change-graph.ts", destination: "tools/autopilot-change-graph.ts", label: "Autopilot helper tools/autopilot-change-graph.ts" },
  { source: "tools/openspec-autopilot-materializer.ts", destination: "tools/openspec-autopilot-materializer.ts", label: "Autopilot helper tools/openspec-autopilot-materializer.ts" },
  { source: "tools/openspec-autopilot-materialization-output.ts", destination: "tools/openspec-autopilot-materialization-output.ts", label: "Autopilot helper tools/openspec-autopilot-materialization-output.ts" },
  { source: "tools/openspec-autopilot-next-actions.ts", destination: "tools/openspec-autopilot-next-actions.ts", label: "Autopilot helper tools/openspec-autopilot-next-actions.ts" },
  { source: "tools/openspec-autopilot-runtime.ts", destination: "tools/openspec-autopilot-runtime.ts", label: "Autopilot helper tools/openspec-autopilot-runtime.ts" },
  { source: "tools/autopilot-runtime-store.ts", destination: "tools/autopilot-runtime-store.ts", label: "Autopilot helper tools/autopilot-runtime-store.ts" },
  { source: "tools/autopilot-prompt-intake.ts", destination: "tools/autopilot-prompt-intake.ts", label: "Autopilot helper tools/autopilot-prompt-intake.ts" },
  { source: "tools/autopilot-phase-dispatcher.ts", destination: "tools/autopilot-phase-dispatcher.ts", label: "Autopilot helper tools/autopilot-phase-dispatcher.ts" },
  { source: "tools/autopilot-worker-prompt-builder.ts", destination: "tools/autopilot-worker-prompt-builder.ts", label: "Autopilot helper tools/autopilot-worker-prompt-builder.ts" },
  { source: "tools/autopilot-worker-session-adapter.ts", destination: "tools/autopilot-worker-session-adapter.ts", label: "Autopilot helper tools/autopilot-worker-session-adapter.ts" },
  { source: "tools/autopilot-worker-report-parser.ts", destination: "tools/autopilot-worker-report-parser.ts", label: "Autopilot helper tools/autopilot-worker-report-parser.ts" },
  { source: "tools/autopilot-intake-lock.ts", destination: "tools/autopilot-intake-lock.ts", label: "Autopilot helper tools/autopilot-intake-lock.ts" },
  { source: "tools/autopilot-ledger-transition-writer.ts", destination: "tools/autopilot-ledger-transition-writer.ts", label: "Autopilot helper tools/autopilot-ledger-transition-writer.ts" },
  { source: "tools/autopilot-check.ts", destination: "tools/autopilot-check.ts", label: "Autopilot helper tools/autopilot-check.ts" },
  { source: "tools/autopilot-programmatic-triggers.ts", destination: "tools/autopilot-programmatic-triggers.ts", label: "Autopilot helper tools/autopilot-programmatic-triggers.ts" },
  { source: "tools/autopilot-protected-path-guard.ts", destination: "tools/autopilot-protected-path-guard.ts", label: "Autopilot helper tools/autopilot-protected-path-guard.ts" },
  { source: "tools/autopilot-write-gate.ts", destination: "tools/autopilot-write-gate.ts", label: "Autopilot helper tools/autopilot-write-gate.ts" },
  { source: "tools/autopilot-trigger-scheduler.ts", destination: "tools/autopilot-trigger-scheduler.ts", label: "Autopilot helper tools/autopilot-trigger-scheduler.ts" },
  { source: "tools/autopilot-worker-report-marker.ts", destination: "tools/autopilot-worker-report-marker.ts", label: "Autopilot helper tools/autopilot-worker-report-marker.ts" },
  { source: "tools/autopilot-evidence.ts", destination: "tools/autopilot-evidence.ts", label: "Autopilot helper tools/autopilot-evidence.ts" },
  { source: "tools/autopilot-report-freshness.ts", destination: "tools/autopilot-report-freshness.ts", label: "Autopilot helper tools/autopilot-report-freshness.ts" },
  { source: "tools/autopilot-worktree-lifecycle.ts", destination: "tools/autopilot-worktree-lifecycle.ts", label: "Autopilot helper tools/autopilot-worktree-lifecycle.ts" },
  { source: "tools/autopilot-active-run.ts", destination: "tools/autopilot-active-run.ts", label: "Autopilot helper tools/autopilot-active-run.ts" },
  { source: "tools/autopilot-scope-policy.ts", destination: "tools/autopilot-scope-policy.ts", label: "Autopilot helper tools/autopilot-scope-policy.ts" },
  { source: "tools/autopilot-ledger.ts", destination: "tools/autopilot-ledger.ts", label: "Autopilot helper tools/autopilot-ledger.ts" },
  { source: "tools/autopilot-contract.ts", destination: "tools/autopilot-contract.ts", label: "Autopilot helper tools/autopilot-contract.ts" },
  { source: "tools/autopilot-ledger-type-gates.ts", destination: "tools/autopilot-ledger-type-gates.ts", label: "Autopilot helper tools/autopilot-ledger-type-gates.ts" },
  { source: "tools/autopilot-path-safety.ts", destination: "tools/autopilot-path-safety.ts", label: "Autopilot helper tools/autopilot-path-safety.ts" },
];
