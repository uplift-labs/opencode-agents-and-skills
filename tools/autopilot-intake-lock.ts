import type { AutopilotTaskType } from "./autopilot-contract.ts";

export type AutopilotLockedIntake = {
  schemaVersion: 1;
  locked: true;
  source: "materialized-active-change" | "prompt-intake";
  classifiedAt: string;
  classifiedBy: "autopilot-materializer" | "autopilot_intake";
  taskType: AutopilotTaskType;
  taskCaliber: "small" | "standard" | "large";
  riskClass: "low" | "medium" | "high";
  requiredGates: string[];
  requiredArtifacts: string[];
  phaseProfile: string[];
  reviewPolicy: string[];
  classificationEvidence: Array<{ kind: string; value: string; source: string }>;
};

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

export function buildMaterializedActiveChangeIntake(input: { changeId: string; taskType: AutopilotTaskType; classifiedAt: string; evidence?: Array<{ kind: string; value: string; source: string }> }): AutopilotLockedIntake {
  return {
    schemaVersion: 1,
    locked: true,
    source: "materialized-active-change",
    classifiedAt: input.classifiedAt,
    classifiedBy: "autopilot-materializer",
    taskType: input.taskType,
    taskCaliber: "standard",
    riskClass: "medium",
    requiredGates: ["analyze", "test-decision", "review", "acceptance", "mr-policy"],
    requiredArtifacts: ["proposal.md", "tasks.md"],
    phaseProfile: ["acceptance", "analyze", "implementation", "review"],
    reviewPolicy: ["implementation-readiness-reviewer"],
    classificationEvidence: sortedUnique([`change:${input.changeId}`, `taskType:${input.taskType}`, "source:active-change"])
      .map((value) => ({ kind: "materialization", value, source: `openspec/changes/${input.changeId}` }))
      .concat(input.evidence ?? []),
  };
}

export function lockedIntakeRequiredGates(intake: AutopilotLockedIntake): string[] {
  return sortedUnique(intake.requiredGates);
}
