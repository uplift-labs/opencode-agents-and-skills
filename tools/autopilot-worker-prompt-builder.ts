import type { AutopilotDispatchDecision } from "./autopilot-phase-dispatcher.ts";
import type { LedgerSummary } from "./openspec-autopilot-output.ts";

export type BuildAutopilotWorkerPromptInput = {
  runId: string;
  workerId: string;
  sessionId: string;
  reportId: string;
  ledger: LedgerSummary;
  decision: AutopilotDispatchDecision;
};

type ValidationCommand = {
  command: string;
  reason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function bulletList(values: string[]): string {
  if (values.length === 0) {
    return "- none";
  }
  return values.map((value) => `- ${value}`).join("\n");
}

function rawLedgerScope(ledger: LedgerSummary): { read: string[]; write: string[]; forbidden: string[] } {
  const scope = isRecord(ledger.ledger?.scope) ? ledger.ledger.scope : {};
  return {
    read: uniqueSorted(stringArray(scope.read)),
    write: uniqueSorted(stringArray(scope.write).length > 0 ? stringArray(scope.write) : ledger.writeScope),
    forbidden: uniqueSorted(stringArray(scope.forbidden).length > 0 ? stringArray(scope.forbidden) : ledger.forbiddenScope),
  };
}

function validationCommands(ledger: LedgerSummary): ValidationCommand[] {
  const validation = isRecord(ledger.ledger?.validation) ? ledger.ledger.validation : {};
  if (!Array.isArray(validation.commands)) {
    return [];
  }
  return validation.commands.flatMap((entry): ValidationCommand[] => {
    if (!isRecord(entry)) {
      return [];
    }
    const command = optionalString(entry.command);
    if (command == null) {
      return [];
    }
    const reason = optionalString(entry.reason);
    return [{ command, ...(reason != null ? { reason } : {}) }];
  }).sort((left, right) => left.command.localeCompare(right.command));
}

function validationSection(commands: ValidationCommand[]): string {
  if (commands.length === 0) {
    return "- No validation command was declared. Explain the skipped validation reason in the report.";
  }
  return commands.map((entry) => `- ${entry.command}${entry.reason != null ? ` (${entry.reason})` : ""}`).join("\n");
}

function testDecision(ledger: LedgerSummary): string {
  const raw = isRecord(ledger.ledger?.testDecision) ? ledger.ledger.testDecision : {};
  return optionalString(raw.decision) ?? "required";
}

function reportExample(input: BuildAutopilotWorkerPromptInput): string {
  return JSON.stringify({
    schemaVersion: 1,
    reportId: input.reportId,
    runId: input.runId,
    workerId: input.workerId,
    sessionId: input.sessionId,
    taskId: input.ledger.id,
    ledgerPath: input.ledger.path,
    fromStatus: input.decision.fromStatus,
    toStatus: input.decision.toStatus,
    changedFiles: [],
    validation: [],
    testDecision: testDecision(input.ledger),
    secretScan: { status: "pending" },
    evidence: {
      summary: "Replace with concise phase evidence.",
      requiredEvidence: input.decision.evidenceRequirements,
    },
    blockers: [],
    mr: { status: "none" },
  }, null, 2);
}

export function buildAutopilotWorkerPrompt(input: BuildAutopilotWorkerPromptInput): string {
  const scope = rawLedgerScope(input.ledger);
  const validation = validationCommands(input.ledger);
  return [
    "You are an OpenSpec Autopilot worker. Execute exactly the assigned phase and return one strict report envelope.",
    "",
    "## Task",
    `- Task: ${input.ledger.id}`,
    `- Ledger Path: ${input.ledger.path}`,
    `- Task Type: ${input.ledger.taskType}`,
    `- Priority: ${input.ledger.priority}`,
    `- Phase: ${input.decision.phase}`,
    `- Status Transition: ${input.decision.fromStatus} -> ${input.decision.toStatus}`,
    `- Worker Goal: ${input.decision.workerGoal}`,
    "",
    "## Required Evidence",
    bulletList(input.decision.evidenceRequirements),
    "",
    "## Scope Boundaries",
    "Read Scope",
    bulletList(scope.read),
    "",
    "Write Scope",
    bulletList(scope.write),
    "",
    "Forbidden Scope",
    bulletList(scope.forbidden),
    "",
    "Do not edit protected Autopilot paths, including openspec/changes/*/automation/** and .autopilot/**.",
    "Do not write outside Write Scope. If required work is outside scope, report a blocker instead of editing it.",
    "Do not commit, push, create MRs, merge, deploy, or clean up worktrees.",
    "",
    "## Validation Expectations",
    validationSection(validation),
    "",
    "Run the smallest relevant validation for your phase when feasible. Record skipped validation with a concrete reason.",
    "",
    "## Strict Report Contract",
    `Emit exactly one complete marker line: AUTOPILOT_WORKER_REPORT ${input.reportId} COMPLETE`,
    "Then emit exactly one JSON object matching this shape. Do not emit another AUTOPILOT_WORKER_REPORT marker.",
    "",
    "```json",
    reportExample(input),
    "```",
  ].join("\n");
}
