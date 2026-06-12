import type { AutopilotReasonCode, AutopilotToolName } from "./autopilot-contract.ts";

export type AutopilotNextActionKind = "tool" | "validation" | "report" | "wait" | "ask_user" | "manual_review";
export type AutopilotNextActionSafety = "safe" | "requires_user" | "requires_credentials" | "not_available";

export type AutopilotNextAction = {
  label: string;
  kind: AutopilotNextActionKind;
  tool?: AutopilotToolName;
  args?: Record<string, unknown>;
  reason: string;
  safety: AutopilotNextActionSafety;
  expectedResult: string;
};

export function nextActionsFor(reasonCode: AutopilotReasonCode): AutopilotNextAction[] {
  if (reasonCode === "invalid_ledgers") {
    return [{ label: "Review invalid task ledgers", kind: "validation", reason: "At least one task ledger failed deterministic validation.", safety: "safe", expectedResult: "Fix or regenerate invalid ledger state before Autopilot continues." }];
  }
  if (reasonCode === "runtime_evidence_conflict") {
    return [{ label: "Review runtime evidence conflict", kind: "validation", reason: "Plugin-owned runtime evidence conflicts with current ledger state or legal transition validation.", safety: "safe", expectedResult: "Resolve stale worker reports, ledger drift, or invalid transition evidence before collecting again." }];
  }
  if (reasonCode === "advanced") {
    return [{ label: "Inspect Autopilot status", kind: "tool", tool: "autopilot_status", reason: "Plugin-owned runtime state accepted a legal claim or worker-report transition.", safety: "safe", expectedResult: "Status confirms the next safe Autopilot action before additional collection or dispatch." }];
  }
  if (reasonCode === "waiting_for_mr") {
    return [{ label: "Wait for MR review or merge", kind: "wait", reason: "Autopilot must not merge or bypass MR review gates automatically.", safety: "requires_user", expectedResult: "Reviewer or user merges, updates, or rejects the MR outside Autopilot." }];
  }
  if (reasonCode === "blocked_for_user") {
    return [{ label: "Review blocker before answering", kind: "manual_review", reason: "A task is blocked, but MVP output does not include a question envelope for autopilot_answer_blocker yet.", safety: "requires_user", expectedResult: "Wait for a returned questionId/options envelope before calling autopilot_answer_blocker." }];
  }
  if (reasonCode === "ready_runtime_deferred") {
    return [{ label: "Continue selected OpenSpec change manually", kind: "manual_review", reason: "Valid Ready work exists, but MVP runtime claim/dispatch and ledger mutation are deferred.", safety: "safe", expectedResult: "Use selection.selectedTaskId and selection.candidates to continue the deterministic primary slice without repeating autopilot_run_next." }];
  }
  if (reasonCode === "active_change_handoff") {
    return [{ label: "Apply selected OpenSpec change", kind: "manual_review", reason: "Unfinished active OpenSpec changes exist, but no applicable Autopilot task ledger owns runtime dispatch.", safety: "safe", expectedResult: "Use selection.selectedTaskId with openspec-apply-change and do not repeat autopilot_run_next for the same handoff." }];
  }
  if (reasonCode === "collect_deferred") {
    return [{ label: "Inspect Autopilot status", kind: "tool", tool: "autopilot_status", reason: "No scoped plugin-owned worker report was available for legal collection, so repeating collect would not advance state.", safety: "safe", expectedResult: "Status summarizes current ledgers without claiming progress." }];
  }
  if (reasonCode === "stop_no_active_state") {
    return [{ label: "Inspect Autopilot status", kind: "tool", tool: "autopilot_status", reason: "Stop did not change runtime state; status is the safe follow-up if confirmation is needed.", safety: "safe", expectedResult: "Status confirms current ledgers, blockers, and MR waits." }];
  }
  if (reasonCode === "stop_applied") {
    return [{ label: "Inspect Autopilot status", kind: "tool", tool: "autopilot_status", reason: "Stop updated plugin-owned active runtime state.", safety: "safe", expectedResult: "Status confirms remaining active runs, tasks, blockers, and MR waits." }];
  }
  if (reasonCode === "no_ledgers") {
    return [{ label: "Create or select an OpenSpec task ledger", kind: "manual_review", reason: "No plugin-owned task ledger was discovered.", safety: "safe", expectedResult: "A valid task ledger exists before Autopilot runtime tools are retried." }];
  }
  return [{ label: "Review OpenSpec task state", kind: "manual_review", reason: "Ledgers exist, but no task can safely advance through the MVP runtime.", safety: "safe", expectedResult: "A human or future runtime identifies the next bounded safe action." }];
}

export function nextActionsAfterAnswerBlocker(): AutopilotNextAction[] {
  return [{ label: "Inspect Autopilot status after blocker answer", kind: "tool", tool: "autopilot_status", reason: "MVP accepted the blocker answer envelope but did not mutate plugin-owned state.", safety: "safe", expectedResult: "Status confirms whether a real blocker remains before any further action." }];
}

export function nextActionsAfterRejectedAnswerBlocker(): AutopilotNextAction[] {
  return [{ label: "Inspect pending blocker question", kind: "manual_review", reason: "The blocker answer did not match a plugin-owned pending question or option envelope.", safety: "requires_user", expectedResult: "Call autopilot_answer_blocker only with a returned questionId and matching option data." }];
}
