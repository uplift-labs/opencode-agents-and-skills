#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  autopilotMrStatuses,
  autopilotProtectedPathPatterns,
  autopilotTaskStatuses,
  autopilotTaskTypes,
  type AutopilotTaskStatus,
  type AutopilotTaskType,
} from "./autopilot-contract.ts";
import { validateTypeSpecificEvidenceGate } from "./autopilot-ledger-type-gates.ts";

export const taskTypes = autopilotTaskTypes;

export const taskStatuses = autopilotTaskStatuses;

export type TaskType = AutopilotTaskType;
export type TaskStatus = AutopilotTaskStatus;

export type ValidateTaskLedgerOptions = {
  sourcePath?: string;
};

export type ValidateTaskLedgerResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

type RecordValue = Record<string, unknown>;

const taskTypeSet = new Set<string>(taskTypes);
const taskStatusSet = new Set<string>(taskStatuses);
const mrStatusSet = new Set<string>(autopilotMrStatuses);
const terminalStatuses = new Set<string>(["Done", "Failed", "Cancelled"]);
const nonTerminalStatuses = taskStatuses.filter((status) => !terminalStatuses.has(status));
const testDecisionValues = new Set([
  "required",
  "not-applicable",
  "skipped-infeasible",
  "existing-coverage",
  "characterization",
  "acceptance",
]);
const requiredReviewStatuses = new Set(["pending", "passed", "failed", "needs-work"]);
const schedulePriorityValues = new Set(["critical", "high", "medium", "low"]);
const scheduleSourceValues = new Set(["explicit", "inferred", "default"]);
const intakeSources = new Set(["materialized-active-change", "prompt-intake"]);
const intakeClassifiers = new Set(["autopilot-materializer", "autopilot_intake"]);
const intakeCalibers = new Set(["small", "standard", "large"]);
const intakeRiskClasses = new Set(["low", "medium", "high"]);

const legalTransitionTargets: Record<TaskStatus, Set<TaskStatus>> = {
  Ready: new Set(["Analyze", "Implementation", "Failed", "Cancelled"]),
  Analyze: new Set(["Implementation", "Review", "Blocked", "Failed", "Cancelled"]),
  Implementation: new Set(["Review", "Blocked", "Failed", "Cancelled"]),
  Review: new Set(["Implementation", "Acceptance", "Blocked", "Failed", "Cancelled"]),
  Acceptance: new Set(["Implementation", "Done", "Blocked", "Failed", "Cancelled"]),
  Blocked: new Set(["Analyze", "Implementation", "Review", "Acceptance", "Failed", "Cancelled"]),
  Done: new Set(),
  Failed: new Set(),
  Cancelled: new Set(),
};

const protectedLedgerPathPatterns = autopilotProtectedPathPatterns;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readRecord(value: RecordValue, key: string): RecordValue | null {
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function readArray(value: RecordValue, key: string): unknown[] | null {
  const nested = value[key];
  return Array.isArray(nested) ? nested : null;
}

function readStringArray(value: RecordValue, key: string): string[] | null {
  const nested = value[key];
  if (!Array.isArray(nested) || nested.some((item) => typeof item !== "string")) {
    return null;
  }
  return nested;
}

function sourcePrefix(options: ValidateTaskLedgerOptions): string {
  return options.sourcePath ? `${options.sourcePath}: ` : "";
}

function addError(errors: string[], options: ValidateTaskLedgerOptions, pathName: string, message: string): void {
  errors.push(`${sourcePrefix(options)}${pathName}: ${message}`);
}

function requireRecord(parent: RecordValue, key: string, errors: string[], options: ValidateTaskLedgerOptions): RecordValue | null {
  const nested = readRecord(parent, key);
  if (!nested) {
    addError(errors, options, key, "object is required");
  }
  return nested;
}

function requireArray(parent: RecordValue, key: string, errors: string[], options: ValidateTaskLedgerOptions): unknown[] | null {
  const nested = readArray(parent, key);
  if (!nested) {
    addError(errors, options, key, "array is required");
  }
  return nested;
}

function requireStringArray(parent: RecordValue, key: string, errors: string[], options: ValidateTaskLedgerOptions): string[] | null {
  const nested = readStringArray(parent, key);
  if (!nested) {
    addError(errors, options, key, "string array is required");
  }
  return nested;
}

function requireBoolean(parent: RecordValue, key: string, errors: string[], options: ValidateTaskLedgerOptions): boolean | null {
  const value = parent[key];
  if (typeof value !== "boolean") {
    addError(errors, options, key, "boolean is required");
    return null;
  }
  return value;
}

function getTaskType(ledger: RecordValue): TaskType | null {
  const value = ledger.taskType;
  return typeof value === "string" && taskTypeSet.has(value) ? (value as TaskType) : null;
}

function getStatus(ledger: RecordValue): TaskStatus | null {
  const value = ledger.status;
  return typeof value === "string" && taskStatusSet.has(value) ? (value as TaskStatus) : null;
}

function getEvidence(ledger: RecordValue, transition: RecordValue, phase: string): RecordValue {
  const transitionEvidence = readRecord(transition, "evidence");
  if (transitionEvidence) {
    return transitionEvidence;
  }

  const phaseEvidence = readRecord(ledger, "phaseEvidence");
  const phaseRecord = phaseEvidence ? readRecord(phaseEvidence, phase) : null;
  return phaseRecord ?? {};
}

function getEvidenceScopes(ledger: RecordValue, transition: RecordValue, phase: string): RecordValue[] {
  const scopes: RecordValue[] = [];
  const transitionEvidence = readRecord(transition, "evidence");
  if (transitionEvidence) {
    scopes.push(transitionEvidence);
  }

  const phaseEvidence = readRecord(ledger, "phaseEvidence");
  const phaseRecord = phaseEvidence ? readRecord(phaseEvidence, phase) : null;
  if (phaseRecord && phaseRecord !== transitionEvidence) {
    scopes.push(phaseRecord);
  }
  return scopes;
}

function hasNonEmptyString(value: RecordValue, key: string): boolean {
  return isNonEmptyString(value[key]);
}

function hasNonEmptyStringArray(value: RecordValue, key: string): boolean {
  const nested = value[key];
  return Array.isArray(nested) && nested.some((item) => isNonEmptyString(item));
}

function transitionHasAutoMinimalAnalyze(ledger: RecordValue, evidence: RecordValue): boolean {
  if (evidence.autoMinimalAnalyze === true) {
    return true;
  }
  const phaseEvidence = readRecord(ledger, "phaseEvidence");
  const analyze = phaseEvidence ? readRecord(phaseEvidence, "analyze") : null;
  return analyze?.autoMinimalAnalyze === true;
}

function planEvidenceSatisfied(ledger: RecordValue, evidence: RecordValue): boolean {
  const plan = readRecord(ledger, "plan") ?? {};
  const hasSummary = hasNonEmptyString(evidence, "planSummary") || hasNonEmptyString(plan, "summary");
  const hasSlices = hasNonEmptyStringArray(evidence, "slices") || hasNonEmptyStringArray(plan, "slices");
  const hasScope = hasNonEmptyString(evidence, "scope") || hasNonEmptyString(plan, "scope");
  const hasTestStrategy = hasNonEmptyString(evidence, "testStrategy") || hasNonEmptyString(plan, "testStrategy");
  const hasNoImplementationReason =
    hasNonEmptyString(evidence, "noImplementationReason") || hasNonEmptyString(evidence, "reasonNoImplementation") || hasNonEmptyString(plan, "noImplementationReason");
  return hasSummary && hasSlices && hasScope && (hasTestStrategy || hasNoImplementationReason);
}

function validateShape(ledger: RecordValue, errors: string[], options: ValidateTaskLedgerOptions): void {
  if (ledger.schemaVersion !== 1) {
    addError(errors, options, "schemaVersion", "must be 1");
  }
  if (!isNonEmptyString(ledger.id)) {
    addError(errors, options, "id", "non-empty string is required");
  }
  if (!isNonEmptyString(ledger.taskType) || !taskTypeSet.has(ledger.taskType)) {
    addError(errors, options, "taskType", `must be one of ${taskTypes.join(", ")}`);
  }
  if (!isNonEmptyString(ledger.status) || !taskStatusSet.has(ledger.status)) {
    addError(errors, options, "status", `must be one of ${taskStatuses.join(", ")}`);
  }
  if (!isNonEmptyString(ledger.priority)) {
    addError(errors, options, "priority", "non-empty string is required");
  }
  const dependencies = requireStringArray(ledger, "dependencies", errors, options);
  validateSchedule(ledger, dependencies ?? [], errors, options);

  const scope = requireRecord(ledger, "scope", errors, options);
  if (scope) {
    requireStringArray(scope, "read", errors, options);
    requireStringArray(scope, "write", errors, options);
    const forbidden = requireStringArray(scope, "forbidden", errors, options);
    if (forbidden) {
      for (const protectedPattern of protectedLedgerPathPatterns) {
        const automationUmbrellaCoversPattern =
          forbidden.includes("openspec/changes/*/automation/**") && protectedPattern.startsWith("openspec/changes/*/automation/");
        if (!forbidden.includes(protectedPattern) && !automationUmbrellaCoversPattern) {
          addError(errors, options, "scope.forbidden", `must include protected path ${protectedPattern}`);
        }
      }
    }
  }

  const autonomy = requireRecord(ledger, "autonomy", errors, options);
  if (autonomy) {
    requireBoolean(autonomy, "allowCommit", errors, options);
    requireBoolean(autonomy, "allowPush", errors, options);
    requireBoolean(autonomy, "allowCreateMr", errors, options);
    const allowMerge = requireBoolean(autonomy, "allowMerge", errors, options);
    if (allowMerge === true) {
      addError(errors, options, "autonomy.allowMerge", "must be false; automatic merge is outside MVP policy");
    }
  }

  const validation = requireRecord(ledger, "validation", errors, options);
  if (validation) {
    const commands = requireArray(validation, "commands", errors, options);
    if (commands) {
      for (let index = 0; index < commands.length; index++) {
        if (!isRecord(commands[index])) {
          addError(errors, options, `validation.commands[${index}]`, "object is required");
        }
      }
    }
  }

  const phaseProfile = requireRecord(ledger, "phaseProfile", errors, options);
  if (phaseProfile) {
    for (const phase of ["analyze", "implementation", "review", "acceptance"]) {
      const phaseRecord = readRecord(phaseProfile, phase);
      if (!phaseRecord) {
        addError(errors, options, `phaseProfile.${phase}`, "object is required");
      } else {
        requireBoolean(phaseRecord, "required", errors, options);
      }
    }
  }
  validateLockedIntake(ledger, errors, options);

  requireRecord(ledger, "phaseEvidence", errors, options);
  validateTestDecision(ledger, errors, options);
  requireRecord(ledger, "plan", errors, options);
  validateReviewPolicy(ledger, errors, options);
  validateMr(ledger, errors, options);
  requireArray(ledger, "blockers", errors, options);
  requireArray(ledger, "feedback", errors, options);
  validateHistory(ledger, errors, options);
  validateRevision(ledger, errors, options);
}

function validateLockedIntake(ledger: RecordValue, errors: string[], options: ValidateTaskLedgerOptions): void {
  if (ledger.intake == null) {
    return;
  }
  const intake = readRecord(ledger, "intake");
  if (!intake) {
    addError(errors, options, "intake", "object is required when present");
    return;
  }
  if (intake.schemaVersion !== 1) {
    addError(errors, options, "intake.schemaVersion", "must be 1");
  }
  if (intake.locked !== true) {
    addError(errors, options, "intake.locked", "must be true");
  }
  if (!isNonEmptyString(intake.source) || !intakeSources.has(intake.source)) {
    addError(errors, options, "intake.source", `must be one of ${Array.from(intakeSources).join(", ")}`);
  }
  if (!isNonEmptyString(intake.classifiedAt)) {
    addError(errors, options, "intake.classifiedAt", "non-empty timestamp string is required");
  }
  if (!isNonEmptyString(intake.classifiedBy) || !intakeClassifiers.has(intake.classifiedBy)) {
    addError(errors, options, "intake.classifiedBy", `must be one of ${Array.from(intakeClassifiers).join(", ")}`);
  }
  if (!isNonEmptyString(intake.taskType) || !taskTypeSet.has(intake.taskType)) {
    addError(errors, options, "intake.taskType", `must be one of ${taskTypes.join(", ")}`);
  } else if (intake.taskType !== ledger.taskType) {
    addError(errors, options, "intake.taskType", "must match locked top-level taskType");
  }
  if (!isNonEmptyString(intake.taskCaliber) || !intakeCalibers.has(intake.taskCaliber)) {
    addError(errors, options, "intake.taskCaliber", `must be one of ${Array.from(intakeCalibers).join(", ")}`);
  }
  if (!isNonEmptyString(intake.riskClass) || !intakeRiskClasses.has(intake.riskClass)) {
    addError(errors, options, "intake.riskClass", `must be one of ${Array.from(intakeRiskClasses).join(", ")}`);
  }
  for (const key of ["requiredGates", "requiredArtifacts", "phaseProfile", "reviewPolicy"] as const) {
    const values = readStringArray(intake, key);
    if (values == null || values.length === 0) {
      addError(errors, options, `intake.${key}`, "non-empty string array is required");
    }
  }
  const requiredGates = readStringArray(intake, "requiredGates") ?? [];
  for (const gate of ["analyze", "review", "acceptance"]) {
    if (!requiredGates.includes(gate)) {
      addError(errors, options, "intake.requiredGates", `must include locked gate ${gate}`);
    }
  }
  const phases = readStringArray(intake, "phaseProfile") ?? [];
  for (const phase of ["analyze", "implementation", "review", "acceptance"]) {
    if (!phases.includes(phase)) {
      addError(errors, options, "intake.phaseProfile", `must include locked phase ${phase}`);
    }
  }
  const evidence = readArray(intake, "classificationEvidence");
  if (evidence == null || evidence.length === 0) {
    addError(errors, options, "intake.classificationEvidence", "non-empty array is required");
    return;
  }
  for (let index = 0; index < evidence.length; index++) {
    const item = evidence[index];
    if (!isRecord(item)) {
      addError(errors, options, `intake.classificationEvidence[${index}]`, "object is required");
      continue;
    }
    if (!isNonEmptyString(item.kind)) {
      addError(errors, options, `intake.classificationEvidence[${index}].kind`, "non-empty string is required");
    }
    if (!isNonEmptyString(item.value)) {
      addError(errors, options, `intake.classificationEvidence[${index}].value`, "non-empty string is required");
    }
    if (!isNonEmptyString(item.source)) {
      addError(errors, options, `intake.classificationEvidence[${index}].source`, "non-empty string is required");
    }
  }
}

function validateSchedule(ledger: RecordValue, dependencies: string[], errors: string[], options: ValidateTaskLedgerOptions): void {
  if (ledger.schedule == null) {
    return;
  }
  const schedule = readRecord(ledger, "schedule");
  if (!schedule) {
    addError(errors, options, "schedule", "object is required when present");
    return;
  }
  const priority = schedule.priority;
  if (!isNonEmptyString(priority) || !schedulePriorityValues.has(priority)) {
    addError(errors, options, "schedule.priority", `must be one of ${Array.from(schedulePriorityValues).join(", ")}`);
  } else if (ledger.priority !== priority) {
    addError(errors, options, "schedule.priority", "must match top-level priority");
  }

  const scheduleDependencies = readStringArray(schedule, "dependencies");
  if (scheduleDependencies == null) {
    addError(errors, options, "schedule.dependencies", "string array is required");
  } else {
    const selfDependencies = scheduleDependencies.filter((dependency) => dependency === ledger.id);
    if (selfDependencies.length > 0) {
      addError(errors, options, "schedule.dependencies", "must not include the ledger id");
    }
    const duplicates = scheduleDependencies.filter((dependency, index) => scheduleDependencies.indexOf(dependency) !== index);
    if (duplicates.length > 0) {
      addError(errors, options, "schedule.dependencies", `must be sorted unique values; duplicate ${Array.from(new Set(duplicates)).join(", ")}`);
    }
    const sorted = [...scheduleDependencies].sort((left, right) => left.localeCompare(right));
    if (JSON.stringify(sorted) !== JSON.stringify(scheduleDependencies)) {
      addError(errors, options, "schedule.dependencies", "must be sorted unique values");
    }
    if (JSON.stringify(scheduleDependencies) !== JSON.stringify(dependencies)) {
      addError(errors, options, "schedule.dependencies", "must match top-level dependencies");
    }
  }

  const source = schedule.source;
  if (!isNonEmptyString(source) || !scheduleSourceValues.has(source)) {
    addError(errors, options, "schedule.source", `must be one of ${Array.from(scheduleSourceValues).join(", ")}`);
  }

  const evidence = readArray(schedule, "evidence");
  if (evidence == null) {
    addError(errors, options, "schedule.evidence", "array is required");
    return;
  }
  for (let index = 0; index < evidence.length; index++) {
    const item = evidence[index];
    if (!isRecord(item)) {
      addError(errors, options, `schedule.evidence[${index}]`, "object is required");
      continue;
    }
    if (!isNonEmptyString(item.kind)) {
      addError(errors, options, `schedule.evidence[${index}].kind`, "non-empty string is required");
    }
    if (!isNonEmptyString(item.value)) {
      addError(errors, options, `schedule.evidence[${index}].value`, "non-empty string is required");
    }
    if (!isNonEmptyString(item.source)) {
      addError(errors, options, `schedule.evidence[${index}].source`, "non-empty string is required");
    }
  }
}

function validateTestDecision(ledger: RecordValue, errors: string[], options: ValidateTaskLedgerOptions): void {
  const testDecision = readRecord(ledger, "testDecision");
  if (!testDecision) {
    addError(errors, options, "testDecision", "testDecision is required for every autopilot task");
    return;
  }
  if (!isNonEmptyString(testDecision.decision) || !testDecisionValues.has(testDecision.decision)) {
    addError(errors, options, "testDecision.decision", `must be one of ${Array.from(testDecisionValues).join(", ")}`);
  }
  if (!isNonEmptyString(testDecision.reason)) {
    addError(errors, options, "testDecision.reason", "non-empty reason is required");
  }
}

function validateReviewPolicy(ledger: RecordValue, errors: string[], options: ValidateTaskLedgerOptions): void {
  const reviewPolicy = requireRecord(ledger, "reviewPolicy", errors, options);
  if (!reviewPolicy) {
    return;
  }
  const required = requireArray(reviewPolicy, "required", errors, options) ?? [];
  const skipped = requireArray(reviewPolicy, "skipped", errors, options) ?? [];
  const accounted = new Set<string>();

  for (let index = 0; index < required.length; index++) {
    const item = required[index];
    if (!isRecord(item)) {
      addError(errors, options, `reviewPolicy.required[${index}]`, "object is required");
      continue;
    }
    if (!isNonEmptyString(item.reviewer)) {
      addError(errors, options, `reviewPolicy.required[${index}].reviewer`, "non-empty string is required");
    } else {
      accounted.add(item.reviewer);
    }
    if (!isNonEmptyString(item.status) || !requiredReviewStatuses.has(item.status)) {
      addError(errors, options, `reviewPolicy.required[${index}].status`, `must be one of ${Array.from(requiredReviewStatuses).join(", ")}`);
    }
    if (!isNonEmptyString(item.reason)) {
      addError(errors, options, `reviewPolicy.required[${index}].reason`, "non-empty reason is required");
    }
  }

  for (let index = 0; index < skipped.length; index++) {
    const item = skipped[index];
    if (!isRecord(item)) {
      addError(errors, options, `reviewPolicy.skipped[${index}]`, "object is required");
      continue;
    }
    if (!isNonEmptyString(item.reviewer)) {
      addError(errors, options, `reviewPolicy.skipped[${index}].reviewer`, "non-empty string is required");
    } else {
      accounted.add(item.reviewer);
    }
    if (!isNonEmptyString(item.reason)) {
      addError(errors, options, `reviewPolicy.skipped[${index}].reason`, "non-empty skip reason is required");
    }
  }

  for (const reviewer of relevantReviewers(ledger)) {
    if (!accounted.has(reviewer)) {
      addError(errors, options, "reviewPolicy", `${reviewer} must be required or explicitly skipped with a reason`);
    }
  }
}

function validateMr(ledger: RecordValue, errors: string[], options: ValidateTaskLedgerOptions): void {
  const mr = requireRecord(ledger, "mr", errors, options);
  if (!mr) {
    return;
  }
  requireBoolean(mr, "required", errors, options);
  if (!isNonEmptyString(mr.status)) {
    addError(errors, options, "mr.status", "non-empty string is required");
  }
  if (mr.required === true && !mrStatusSet.has(String(mr.status))) {
    addError(errors, options, "mr.status", "must be a known MR lifecycle status");
  }
}

function validateHistory(ledger: RecordValue, errors: string[], options: ValidateTaskLedgerOptions): void {
  const history = requireArray(ledger, "history", errors, options);
  const status = getStatus(ledger);
  if (!history || !status) {
    return;
  }
  if (history.length === 0) {
    if (status !== "Ready") {
      addError(errors, options, "history", "empty history is allowed only while status is Ready");
    }
    return;
  }

  let previousTo: string | null = null;
  for (let index = 0; index < history.length; index++) {
    const item = history[index];
    if (!isRecord(item)) {
      addError(errors, options, `history[${index}]`, "object is required");
      continue;
    }
    validateTransitionRecord(ledger, item, index, errors, options);
    if (previousTo && item.from !== previousTo) {
      addError(errors, options, `history[${index}]`, `from=${String(item.from)} does not match previous to=${previousTo}`);
    }
    if (typeof item.to === "string") {
      previousTo = item.to;
    }
  }

  const last = history[history.length - 1];
  if (isRecord(last) && last.to !== status) {
    addError(errors, options, "history", `last transition target ${String(last.to)} must match status ${status}`);
  }
}

function validateRevision(ledger: RecordValue, errors: string[], options: ValidateTaskLedgerOptions): void {
  const revision = requireRecord(ledger, "revision", errors, options);
  if (!revision) {
    return;
  }
  if (typeof revision.number !== "number" || !Number.isInteger(revision.number) || revision.number < 0) {
    addError(errors, options, "revision.number", "non-negative integer is required");
  }
  if (!isNonEmptyString(revision.contentHash)) {
    addError(errors, options, "revision.contentHash", "non-empty string or placeholder is required");
  }
  if (!isNonEmptyString(revision.updatedBy)) {
    addError(errors, options, "revision.updatedBy", "non-empty writer/source marker is required");
  }
  if (!isNonEmptyString(revision.updatedAt)) {
    addError(errors, options, "revision.updatedAt", "non-empty timestamp is required");
  }
}

function validateTransitionRecord(ledger: RecordValue, transition: RecordValue, index: number, errors: string[], options: ValidateTaskLedgerOptions): void {
  const from = transition.from;
  const to = transition.to;
  if (!isNonEmptyString(from) || !taskStatusSet.has(from)) {
    addError(errors, options, `history[${index}].from`, `must be one of ${taskStatuses.join(", ")}`);
    return;
  }
  if (!isNonEmptyString(to) || !taskStatusSet.has(to)) {
    addError(errors, options, `history[${index}].to`, `must be one of ${taskStatuses.join(", ")}`);
    return;
  }
  if (!isNonEmptyString(transition.at)) {
    addError(errors, options, `history[${index}].at`, "timestamp string is required");
  }
  if (!isNonEmptyString(transition.by)) {
    addError(errors, options, `history[${index}].by`, "writer string is required");
  }
  if (!isNonEmptyString(transition.source)) {
    addError(errors, options, `history[${index}].source`, "source string is required");
  }

  if (terminalStatuses.has(from)) {
    addError(errors, options, `history[${index}]`, `Terminal status cannot transition from ${from} to ${to}`);
    return;
  }

  const allowedTargets = legalTransitionTargets[from as TaskStatus];
  if (!allowedTargets.has(to as TaskStatus)) {
    addError(errors, options, `history[${index}]`, `${from} -> ${to} is not a legal transition`);
    return;
  }

  validateTransitionEvidence(ledger, from as TaskStatus, to as TaskStatus, transition, index, errors, options);
}

function validateTransitionEvidence(
  ledger: RecordValue,
  from: TaskStatus,
  to: TaskStatus,
  transition: RecordValue,
  index: number,
  errors: string[],
  options: ValidateTaskLedgerOptions,
): void {
  const taskType = getTaskType(ledger);
  const evidence = getEvidence(ledger, transition, from.toLowerCase());

  if (from === "Ready" && to === "Implementation") {
    if (taskType !== "typo" && !transitionHasAutoMinimalAnalyze(ledger, evidence)) {
      addError(errors, options, `history[${index}].evidence`, "Ready -> Implementation requires taskType=typo or explicit autoMinimalAnalyze evidence");
    }
  }

  if (from === "Analyze" && to === "Implementation" && !planEvidenceSatisfied(ledger, evidence)) {
    addError(errors, options, `history[${index}].evidence`, "Analyze -> Implementation requires plan summary, slices, scope, and test strategy or no-implementation reason");
  }

  if (from === "Analyze" && to === "Review") {
    if (taskType !== "research" && taskType !== "planning") {
      addError(errors, options, `history[${index}]`, "Analyze -> Review is allowed only for research or planning tasks");
    }
    if (!hasNonEmptyString(evidence, "artifact")) {
      addError(errors, options, `history[${index}].evidence.artifact`, "Analyze -> Review requires a research/planning artifact");
    }
    if (!hasNonEmptyString(evidence, "reasonNoImplementation") && !hasNonEmptyString(evidence, "noImplementationReason")) {
      addError(errors, options, `history[${index}].evidence.reasonNoImplementation`, "Analyze -> Review requires a reason no implementation phase is needed");
    }
  }

  if (from === "Implementation" && to === "Review") {
    const changedFiles = readStringArray(evidence, "changedFiles");
    if ((!changedFiles || changedFiles.length === 0) && !hasNonEmptyString(evidence, "noOpReason")) {
      addError(errors, options, `history[${index}].evidence`, "Implementation -> Review requires changed files or a no-op reason");
    }
    if (!readRecord(ledger, "testDecision")) {
      addError(errors, options, `history[${index}].evidence`, "Implementation -> Review requires testDecision");
    }
    const validation = readRecord(evidence, "validation");
    if (!validation || (!hasNonEmptyString(validation, "status") && !hasNonEmptyString(validation, "skippedReason"))) {
      addError(errors, options, `history[${index}].evidence.validation`, "Implementation -> Review requires validation evidence or skipped reason");
    }
    const secretScan = readRecord(evidence, "secretScan");
    if (!secretScan || !hasNonEmptyString(secretScan, "status")) {
      addError(errors, options, `history[${index}].evidence.secretScan`, "Implementation -> Review requires secret scan status or placeholder");
    }

  }

  const typeGateMessage = validateTypeSpecificEvidenceGate({ taskType, from, to, evidenceScopes: getEvidenceScopes(ledger, transition, from.toLowerCase()) });
  if (typeGateMessage) {
    addError(errors, options, `history[${index}].evidence`, typeGateMessage);
  }

  if (from === "Review" && to === "Acceptance") {
    const reviewerDecisions = readArray(evidence, "reviewerDecisions") ?? [];
    const reviewerSkips = readArray(evidence, "reviewerSkips") ?? [];
    if (reviewerDecisions.length === 0 && reviewerSkips.length === 0) {
      addError(errors, options, `history[${index}].evidence`, "Review -> Acceptance requires reviewer decisions or explicit reviewer skip reasons");
    }
    validateAcceptanceReviewerEvidence(ledger, reviewerDecisions, reviewerSkips, index, errors, options);
  }

  if (from === "Acceptance" && to === "Done") {
    const mr = readRecord(ledger, "mr") ?? {};
    const hasMergedEvidence = mr.status === "merged" && (hasNonEmptyString(mr, "mergeEvidence") || hasNonEmptyString(evidence, "mergeEvidence") || evidence.mrMerged === true);
    const hasNoMrPolicy =
      (taskType === "research" || taskType === "planning") &&
      mr.status === "not-required" &&
      (hasNonEmptyString(evidence, "noMrAcceptancePolicy") || hasNonEmptyString(mr, "noMrAcceptancePolicy"));
    if (!hasMergedEvidence && !hasNoMrPolicy) {
      addError(errors, options, `history[${index}].evidence`, "Acceptance -> Done requires MR merged evidence or explicit no-MR acceptance policy for non-file-changing research/planning");
    }
  }

  if (to === "Blocked") {
    const hasBlockerReason = hasNonEmptyString(evidence, "blockerReason") || hasNonEmptyString(evidence, "reason");
    if (!hasBlockerReason) {
      addError(errors, options, `history[${index}].evidence.blockerReason`, "transition to Blocked requires a blocker reason");
    }
    if (evidence.userActionRequired === true && !hasNonEmptyStringArray(evidence, "recommendedOptions")) {
      addError(errors, options, `history[${index}].evidence.recommendedOptions`, "user-action blocker requires recommended options");
    }
  }
}

function validateAcceptanceReviewerEvidence(
  ledger: RecordValue,
  reviewerDecisions: unknown[],
  reviewerSkips: unknown[],
  transitionIndex: number,
  errors: string[],
  options: ValidateTaskLedgerOptions,
): void {
  const reviewPolicy = readRecord(ledger, "reviewPolicy") ?? {};
  const required = readArray(reviewPolicy, "required") ?? [];
  for (let index = 0; index < required.length; index++) {
    const item = required[index];
    if (!isRecord(item) || !isNonEmptyString(item.reviewer)) {
      continue;
    }
    if (item.status !== "passed") {
      addError(errors, options, `history[${transitionIndex}].evidence`, `Review -> Acceptance requires required reviewer ${item.reviewer} to be passed`);
    }
  }

  for (let index = 0; index < reviewerDecisions.length; index++) {
    const decision = reviewerDecisions[index];
    if (!isRecord(decision)) {
      addError(errors, options, `history[${transitionIndex}].evidence.reviewerDecisions[${index}]`, "object is required");
      continue;
    }
    if (!isNonEmptyString(decision.reviewer)) {
      addError(errors, options, `history[${transitionIndex}].evidence.reviewerDecisions[${index}].reviewer`, "non-empty string is required");
    }
    if (decision.decision !== "passed" && decision.decision !== "approved") {
      addError(errors, options, `history[${transitionIndex}].evidence.reviewerDecisions[${index}].decision`, "must be passed or approved before Acceptance");
    }
  }

  for (let index = 0; index < reviewerSkips.length; index++) {
    const skip = reviewerSkips[index];
    if (!isRecord(skip)) {
      addError(errors, options, `history[${transitionIndex}].evidence.reviewerSkips[${index}]`, "object is required");
      continue;
    }
    if (!isNonEmptyString(skip.reviewer)) {
      addError(errors, options, `history[${transitionIndex}].evidence.reviewerSkips[${index}].reviewer`, "non-empty string is required");
    }
    if (!isNonEmptyString(skip.reason)) {
      addError(errors, options, `history[${transitionIndex}].evidence.reviewerSkips[${index}].reason`, "non-empty skip reason is required");
    }
  }
}

function relevantReviewers(ledger: RecordValue): string[] {
  const taskType = getTaskType(ledger);
  const reviewers = new Set<string>();
  if (!taskType) {
    return [];
  }

  if (["feature", "bugfix", "refactor", "tooling"].includes(taskType)) {
    reviewers.add("code-quality-reviewer");
  }
  if (["feature", "bugfix", "refactor", "tooling", "protocol"].includes(taskType)) {
    reviewers.add("test-coverage-reviewer");
  }
  if (taskType === "config") {
    reviewers.add("deployment-config-reviewer");
  }
  if (taskType === "performance") {
    reviewers.add("performance-reliability-reviewer");
  }
  if (taskType === "protocol") {
    reviewers.add("protocol-api-reviewer");
    reviewers.add("wire-protocol-reviewer");
  }
  if (taskType === "planning") {
    reviewers.add("implementation-readiness-reviewer");
  }

  const scope = readRecord(ledger, "scope");
  const writeScope = scope ? readStringArray(scope, "write") ?? [] : [];
  const instructionArtifactTouched = writeScope.some((value) => /(^|\/)(\.opencode|instructions|AGENTS\.md)|SKILL\.md|agents?\//.test(value));
  if ((taskType === "docs" || taskType === "tooling" || taskType === "config") && instructionArtifactTouched) {
    reviewers.add("instruction-artifact-reviewer");
  }

  return Array.from(reviewers).sort();
}

export function validateTaskLedger(value: unknown, options: ValidateTaskLedgerOptions = {}): ValidateTaskLedgerResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(value)) {
    addError(errors, options, "<root>", "task ledger must be a JSON object");
    return { valid: false, errors, warnings };
  }

  validateShape(value, errors, options);
  return { valid: errors.length === 0, errors, warnings };
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function runCli(args: string[]): number {
  if (args.length === 0) {
    console.error("Usage: node tools/autopilot-ledger.ts <task-ledger.json> [...more.json]");
    return 2;
  }

  const files = args.map((arg) => path.resolve(arg));
  const results = files.map((file) => {
    try {
      const result = validateTaskLedger(readJsonFile(file), { sourcePath: path.relative(process.cwd(), file) || file });
      return { file, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { file, valid: false, errors: [`${path.relative(process.cwd(), file) || file}: ${message}`], warnings: [] };
    }
  });

  const output = {
    valid: results.every((result) => result.valid),
    files: results.map((result) => ({
      file: path.relative(process.cwd(), result.file) || result.file,
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
    })),
  };
  console.log(JSON.stringify(output, null, 2));
  return output.valid ? 0 : 1;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entrypoint)).href || import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href && path.resolve(entrypoint) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  process.exitCode = runCli(process.argv.slice(2));
}

export const autopilotLedgerPolicy = {
  protectedLedgerPathPatterns,
  mrStatuses: autopilotMrStatuses,
  nonTerminalStatuses,
  terminalStatuses: Array.from(terminalStatuses),
};
