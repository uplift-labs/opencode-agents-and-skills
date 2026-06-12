export const autopilotTaskTypes = [
  "feature",
  "bugfix",
  "refactor",
  "docs",
  "typo",
  "research",
  "planning",
  "tooling",
  "config",
  "performance",
  "protocol",
] as const;

export const autopilotTaskStatuses = ["Ready", "Analyze", "Implementation", "Review", "Acceptance", "Done", "Blocked", "Failed", "Cancelled"] as const;

export const autopilotMrStatuses = ["none", "created", "updated", "waiting-review", "merged", "not-required"] as const;

export const autopilotMrWaitStatuses = ["created", "updated", "waiting-review"] as const;

export const autopilotReasonCodes = [
  "no_ledgers",
  "invalid_ledgers",
  "ready_runtime_deferred",
  "waiting_for_mr",
  "blocked_for_user",
  "collect_deferred",
  "stop_no_active_state",
  "stop_applied",
  "runtime_evidence_conflict",
  "no_actionable_tasks",
  "advanced",
] as const;

export const autopilotActionabilityValues = ["actionable", "invalid", "waiting_for_mr", "blocked_for_user", "runtime_deferred", "terminal", "not_selected"] as const;

export const autopilotSelectionModes = ["serial_default", "parallel_implementation"] as const;

export const autopilotParallelDecisions = ["not_evaluated", "parallel_ready", "not_parallel_safe", "parallel_started"] as const;

export const autopilotSelectionReasons = [
  "selected_primary",
  "serial_default",
  "selected_primary_unknown_priority",
  "serial_default_unknown_priority",
  "dependency_blocked",
  "parallel_started",
  "scope_conflict",
  "missing_parallel_guard",
  "wip_limit",
] as const;

export const autopilotToolNames = ["autopilot_run_next", "autopilot_status", "autopilot_collect", "autopilot_answer_blocker", "autopilot_stop"] as const;

export const autopilotProtectedPathPatterns = [
  "openspec/changes/*/automation/task.json",
  "openspec/changes/*/automation/feedback/**",
  "openspec/changes/*/automation/artifacts/**",
  ".autopilot/**",
] as const;

export type AutopilotTaskType = (typeof autopilotTaskTypes)[number];
export type AutopilotTaskStatus = (typeof autopilotTaskStatuses)[number];
export type AutopilotMrStatus = (typeof autopilotMrStatuses)[number];
export type AutopilotMrWaitStatus = (typeof autopilotMrWaitStatuses)[number];
export type AutopilotReasonCode = (typeof autopilotReasonCodes)[number];
export type AutopilotActionability = (typeof autopilotActionabilityValues)[number];
export type AutopilotSelectionMode = (typeof autopilotSelectionModes)[number];
export type AutopilotParallelDecision = (typeof autopilotParallelDecisions)[number];
export type AutopilotSelectionReason = (typeof autopilotSelectionReasons)[number];
export type AutopilotToolName = (typeof autopilotToolNames)[number];
