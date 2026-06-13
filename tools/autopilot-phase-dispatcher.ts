import {
  autopilotMrWaitStatuses,
  type AutopilotMrStatus,
  type AutopilotReasonCode,
  type AutopilotTaskStatus,
  type AutopilotTaskType,
} from "./autopilot-contract.ts";
import { autopilotLedgerTypeGateRules } from "./autopilot-ledger-type-gates.ts";

export type AutopilotPhaseName = "analyze" | "implementation" | "review" | "acceptance";

export type AutopilotPhaseBlocker = {
  reason: string;
  questionId?: string;
};

export type AutopilotPhaseDispatchInput = {
  taskId: string;
  taskType: AutopilotTaskType;
  status: AutopilotTaskStatus;
  mrStatus?: AutopilotMrStatus;
  blockers?: AutopilotPhaseBlocker[];
  phaseEvidence?: Record<string, unknown>;
};

export type AutopilotDispatchDecision = {
  action: "dispatch";
  taskId: string;
  taskType: AutopilotTaskType;
  phase: AutopilotPhaseName;
  fromStatus: AutopilotTaskStatus;
  toStatus: AutopilotTaskStatus;
  workerGoal: string;
  evidenceRequirements: string[];
  minimalAnalyze?: boolean;
};

export type AutopilotWaitDecision = {
  action: "wait";
  reasonCode: AutopilotReasonCode;
  taskId: string;
  mrStatus?: AutopilotMrStatus;
  reason: string;
};

export type AutopilotBlockedDecision = {
  action: "blocked";
  reasonCode: AutopilotReasonCode;
  taskId: string;
  blockers: AutopilotPhaseBlocker[];
};

export type AutopilotTerminalDecision = {
  action: "terminal";
  reasonCode: AutopilotReasonCode;
  taskId: string;
  status: Extract<AutopilotTaskStatus, "Done" | "Failed" | "Cancelled">;
};

export type AutopilotPhaseDispatchDecision = AutopilotDispatchDecision | AutopilotWaitDecision | AutopilotBlockedDecision | AutopilotTerminalDecision;

const mrWaitStatuses = new Set<string>(autopilotMrWaitStatuses);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function analyzeEvidence(input: AutopilotPhaseDispatchInput): Record<string, unknown> {
  const evidence = input.phaseEvidence?.analyze;
  return isRecord(evidence) ? evidence : {};
}

function canUseMinimalAnalyze(input: AutopilotPhaseDispatchInput): boolean {
  return input.taskType === "typo" || analyzeEvidence(input).autoMinimalAnalyze === true;
}

function typeGateFieldsFor(taskType: AutopilotTaskType, from: AutopilotTaskStatus, to: AutopilotTaskStatus): string[] {
  return autopilotLedgerTypeGateRules.find((rule) => rule.taskType === taskType && rule.from === from && rule.to === to)?.fields ?? [];
}

function dispatch(input: AutopilotPhaseDispatchInput, phase: AutopilotPhaseName, toStatus: AutopilotTaskStatus, workerGoal: string, evidenceRequirements: string[], minimalAnalyze?: boolean): AutopilotDispatchDecision {
  return {
    action: "dispatch",
    taskId: input.taskId,
    taskType: input.taskType,
    phase,
    fromStatus: input.status,
    toStatus,
    workerGoal,
    evidenceRequirements,
    ...(minimalAnalyze === true ? { minimalAnalyze: true } : {}),
  };
}

function acceptanceEvidenceRequirements(input: AutopilotPhaseDispatchInput): string[] {
  if ((input.taskType === "research" || input.taskType === "planning") && input.mrStatus === "not-required") {
    return ["noMrAcceptancePolicy", "validation"];
  }
  return ["mergeEvidence", "mrMerged", "validation"];
}

export function resolveAutopilotPhaseDispatch(input: AutopilotPhaseDispatchInput): AutopilotPhaseDispatchDecision {
  if (input.status === "Done" || input.status === "Failed" || input.status === "Cancelled") {
    return {
      action: "terminal",
      reasonCode: "no_actionable_tasks",
      taskId: input.taskId,
      status: input.status,
    };
  }

  if (input.status === "Blocked") {
    return {
      action: "blocked",
      reasonCode: "blocked_for_user",
      taskId: input.taskId,
      blockers: input.blockers ?? [],
    };
  }

  if (input.status === "Acceptance" && input.mrStatus && mrWaitStatuses.has(input.mrStatus)) {
    return {
      action: "wait",
      reasonCode: "waiting_for_mr",
      taskId: input.taskId,
      mrStatus: input.mrStatus,
      reason: "Acceptance is waiting for MR review or update evidence.",
    };
  }

  if (input.status === "Ready") {
    if (canUseMinimalAnalyze(input)) {
      return dispatch(input, "implementation", "Implementation", "Perform the minimal implementation allowed from Ready by task policy.", ["autoMinimalAnalyze", "changedFiles", "noOpReason", "validation", "secretScan"], true);
    }
    return dispatch(input, "analyze", "Analyze", "Analyze the selected task and produce the smallest safe implementation plan.", ["planSummary", "slices", "scope", "testStrategy"]);
  }

  if (input.status === "Analyze") {
    if (input.taskType === "research" || input.taskType === "planning") {
      return dispatch(input, "review", "Review", "Produce the research or planning artifact and explain why implementation is not required.", ["artifact", "reasonNoImplementation"]);
    }
    return dispatch(input, "implementation", "Implementation", "Implement the analyzed task slice according to the recorded plan and test strategy.", ["planSummary", "slices", "scope", "testStrategy", ...typeGateFieldsFor(input.taskType, "Analyze", "Implementation")]);
  }

  if (input.status === "Implementation") {
    return dispatch(input, "review", "Review", "Complete implementation evidence and prepare the task for reviewer gates.", ["changedFiles", "noOpReason", "validation", "secretScan", ...typeGateFieldsFor(input.taskType, "Implementation", "Review")]);
  }

  if (input.status === "Review") {
    return dispatch(input, "acceptance", "Acceptance", "Collect required reviewer decisions or explicit reviewer skip reasons.", ["reviewerDecisions", "reviewerSkips"]);
  }

  if (input.status === "Acceptance") {
    return dispatch(input, "acceptance", "Done", "Verify final acceptance policy before marking the task done.", acceptanceEvidenceRequirements(input));
  }

  const _exhaustive: never = input.status;
  return _exhaustive;
}
