#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTaskLedger } from "./autopilot-ledger.ts";

type TestCase = {
  name: string;
  fixture?: string;
  value?: () => unknown;
  valid: boolean;
  expected?: string[];
  expectedErrorCount?: number;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");
const validator = path.join(root, "tools", "autopilot-ledger.ts");

const tests: TestCase[] = [
  { name: "valid feature", fixture: "valid-feature.json", valid: true },
  { name: "valid bugfix", fixture: "valid-bugfix.json", valid: true },
  { name: "valid bugfix with infeasible reason", value: validBugfixInfeasibleReason, valid: true },
  { name: "valid tooling", fixture: "valid-tooling.json", valid: true },
  { name: "valid config", fixture: "valid-config.json", valid: true },
  { name: "valid performance", fixture: "valid-performance.json", valid: true },
  { name: "valid performance with infeasible reason", value: validPerformanceInfeasibleReason, valid: true },
  { name: "valid protocol", fixture: "valid-protocol.json", valid: true },
  { name: "valid protocol with infeasible reason", value: validProtocolInfeasibleReason, valid: true },
  { name: "valid typo", fixture: "valid-typo.json", valid: true },
  { name: "valid research", fixture: "valid-research.json", valid: true },
  { name: "valid feature Done after MR merge", value: validFeatureDoneMerged, valid: true },
  { name: "valid research Done with no-MR policy", value: validResearchDoneNoMrPolicy, valid: true },
  { name: "valid optional schedule", value: validOptionalSchedule, valid: true },
  { name: "valid optional locked intake", value: validOptionalLockedIntake, valid: true },
  { name: "valid legacy ledger without schedule", fixture: "valid-feature.json", valid: true },
  {
    name: "invalid schedule dependency mismatch",
    value: invalidScheduleDependencyMismatch,
    valid: false,
    expected: ["schedule.dependencies", "must match top-level dependencies"],
  },
  {
    name: "invalid schedule duplicate self dependency",
    value: invalidScheduleDuplicateSelfDependency,
    valid: false,
    expected: ["must not include the ledger id", "duplicate feature-ready-auth-flow"],
  },
  {
    name: "invalid schedule priority mismatch",
    value: invalidSchedulePriorityMismatch,
    valid: false,
    expected: ["schedule.priority", "must match top-level priority"],
  },
  {
    name: "invalid intake task type downgrade",
    value: invalidIntakeTaskTypeDowngrade,
    valid: false,
    expected: ["intake.taskType", "must match locked top-level taskType"],
  },
  {
    name: "invalid bugfix missing reproduction gate",
    fixture: "invalid-bugfix-missing-reproduction.json",
    valid: false,
    expected: ["bugfix Analyze -> Implementation requires structured reproduction"],
    expectedErrorCount: 1,
  },
  {
    name: "invalid bugfix prose-only reproduction gate",
    value: invalidBugfixProseOnlyReproductionGate,
    valid: false,
    expected: ["bugfix Analyze -> Implementation requires structured reproduction"],
    expectedErrorCount: 1,
  },
  {
    name: "invalid tooling missing deterministic gate",
    fixture: "invalid-tooling-missing-gate.json",
    valid: false,
    expected: ["tooling Implementation -> Review requires structured toolingGate"],
    expectedErrorCount: 1,
  },
  {
    name: "invalid tooling summary-only deterministic gate",
    value: invalidToolingSummaryOnlyGate,
    valid: false,
    expected: ["tooling Implementation -> Review requires structured toolingGate"],
    expectedErrorCount: 1,
  },
  {
    name: "invalid config missing deterministic gate",
    fixture: "invalid-config-missing-gate.json",
    valid: false,
    expected: ["config Implementation -> Review requires structured configGate"],
    expectedErrorCount: 1,
  },
  {
    name: "invalid config infeasible reason does not satisfy gate",
    value: invalidConfigInfeasibleReasonDoesNotSatisfyGate,
    valid: false,
    expected: ["config Implementation -> Review requires structured configGate"],
    expectedErrorCount: 1,
  },
  {
    name: "invalid performance missing evidence gate",
    fixture: "invalid-performance-missing-evidence.json",
    valid: false,
    expected: ["performance Implementation -> Review requires structured benchmark"],
    expectedErrorCount: 1,
  },
  {
    name: "invalid performance prose-only evidence gate",
    value: invalidPerformanceProseOnlyEvidenceGate,
    valid: false,
    expected: ["performance Implementation -> Review requires structured benchmark"],
    expectedErrorCount: 1,
  },
  {
    name: "invalid protocol missing evidence gate",
    fixture: "invalid-protocol-missing-evidence.json",
    valid: false,
    expected: ["protocol Implementation -> Review requires structured goldenVectors"],
    expectedErrorCount: 1,
  },
  {
    name: "invalid protocol empty infeasible reason",
    value: invalidProtocolEmptyInfeasibleReason,
    valid: false,
    expected: ["protocol Implementation -> Review requires structured goldenVectors"],
    expectedErrorCount: 1,
  },
  {
    name: "invalid behavior task without testDecision",
    fixture: "invalid-behavior-missing-test-decision.json",
    valid: false,
    expected: ["testDecision is required"],
  },
  {
    name: "invalid Acceptance -> Done without MR merge evidence",
    fixture: "invalid-acceptance-done-missing-merge.json",
    valid: false,
    expected: ["Acceptance -> Done requires MR merged evidence"],
  },
  {
    name: "invalid terminal transition",
    fixture: "invalid-terminal-transition.json",
    valid: false,
    expected: ["Terminal status cannot transition"],
  },
  {
    name: "invalid reviewer silent skip",
    fixture: "invalid-reviewer-silent-skip.json",
    valid: false,
    expected: ["test-coverage-reviewer"],
  },
  {
    name: "invalid feature Ready -> Implementation without autoMinimalAnalyze",
    value: invalidFeatureReadyImplementationWithoutAutoMinimalAnalyze,
    valid: false,
    expected: ["Ready -> Implementation requires taskType=typo or explicit autoMinimalAnalyze"],
  },
  {
    name: "invalid feature Analyze -> Review",
    value: invalidFeatureAnalyzeReview,
    valid: false,
    expected: ["Analyze -> Review is allowed only for research or planning tasks"],
  },
  {
    name: "invalid Implementation -> Review missing validation and secret scan",
    value: invalidImplementationReviewMissingValidationAndSecretScan,
    valid: false,
    expected: ["Implementation -> Review requires validation evidence", "Implementation -> Review requires secret scan status"],
  },
  {
    name: "invalid Implementation -> Review missing changed files and no-op reason",
    value: invalidImplementationReviewMissingChangedFilesAndNoOpReason,
    valid: false,
    expected: ["Implementation -> Review requires changed files or a no-op reason"],
  },
  {
    name: "invalid Review -> Acceptance with failed reviewer",
    value: invalidReviewAcceptanceFailedReviewer,
    valid: false,
    expected: ["Review -> Acceptance requires required reviewer code-quality-reviewer to be passed", "must be passed or approved before Acceptance"],
  },
];

function readFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8")) as unknown;
}

function cloneFixture(name: string): Record<string, unknown> {
  return JSON.parse(JSON.stringify(readFixture(name))) as Record<string, unknown>;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function historyOf(ledger: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(ledger.history)) {
    throw new Error("Fixture history must be an array.");
  }
  return ledger.history as Array<Record<string, unknown>>;
}

function validFeatureDoneMerged(): unknown {
  const ledger = cloneFixture("valid-feature.json");
  ledger.status = "Done";
  const mr = asRecord(ledger.mr, "Fixture mr must be an object.");
  mr.status = "merged";
  mr.mergeEvidence = "MR merged by user after review.";
  historyOf(ledger).push({
    from: "Acceptance",
    to: "Done",
    at: "2026-06-10T00:04:00.000Z",
    by: "plugin",
    source: "autopilot_collect",
    evidence: { mergeEvidence: "MR merged by user after review." },
  });
  asRecord(ledger.revision, "Fixture revision must be an object.").number = 5;
  return ledger;
}

function validResearchDoneNoMrPolicy(): unknown {
  const ledger = cloneFixture("valid-research.json");
  ledger.status = "Done";
  const mr = asRecord(ledger.mr, "Fixture mr must be an object.");
  mr.required = false;
  mr.status = "not-required";
  mr.noMrAcceptancePolicy = "Research-only artifact accepted without file-changing MR.";
  historyOf(ledger).push({
    from: "Acceptance",
    to: "Done",
    at: "2026-06-10T00:03:00.000Z",
    by: "plugin",
    source: "autopilot_collect",
    evidence: { noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR." },
  });
  asRecord(ledger.revision, "Fixture revision must be an object.").number = 4;
  return ledger;
}

function validOptionalSchedule(): unknown {
  const ledger = cloneFixture("valid-feature.json");
  ledger.priority = "high";
  ledger.dependencies = ["base-change"];
  ledger.schedule = {
    priority: "high",
    dependencies: ["base-change"],
    source: "explicit",
    evidence: [{ kind: "Depends-On", value: "base-change", source: "openspec/changes/feature-change/proposal.md" }],
  };
  return ledger;
}

function validOptionalLockedIntake(): unknown {
  const ledger = cloneFixture("valid-feature.json");
  ledger.intake = {
    schemaVersion: 1,
    locked: true,
    source: "materialized-active-change",
    classifiedAt: "2026-06-10T00:00:00.000Z",
    classifiedBy: "autopilot-materializer",
    taskType: "feature",
    taskCaliber: "standard",
    riskClass: "medium",
    requiredGates: ["analyze", "test-decision", "review", "acceptance", "mr-policy"],
    requiredArtifacts: ["proposal.md", "tasks.md"],
    phaseProfile: ["analyze", "implementation", "review", "acceptance"],
    reviewPolicy: ["code-quality-reviewer", "test-coverage-reviewer"],
    classificationEvidence: [{ kind: "materialization", value: "taskType:feature", source: "openspec/changes/feature-ready-auth-flow" }],
  };
  return ledger;
}

function invalidIntakeTaskTypeDowngrade(): unknown {
  const ledger = validOptionalLockedIntake() as Record<string, unknown>;
  ledger.taskType = "typo";
  return ledger;
}

function invalidScheduleDependencyMismatch(): unknown {
  const ledger = validOptionalSchedule() as Record<string, unknown>;
  ledger.dependencies = ["base-change"];
  ledger.schedule = { ...(ledger.schedule as Record<string, unknown>), dependencies: ["other-change"] };
  return ledger;
}

function invalidScheduleDuplicateSelfDependency(): unknown {
  const ledger = cloneFixture("valid-feature.json");
  ledger.dependencies = ["feature-ready-auth-flow", "feature-ready-auth-flow"];
  ledger.schedule = {
    priority: "high",
    dependencies: ["feature-ready-auth-flow", "feature-ready-auth-flow"],
    source: "explicit",
    evidence: [{ kind: "Depends-On", value: "feature-ready-auth-flow", source: "openspec/changes/feature-ready-auth-flow/tasks.md" }],
  };
  return ledger;
}

function invalidSchedulePriorityMismatch(): unknown {
  const ledger = validOptionalSchedule() as Record<string, unknown>;
  ledger.priority = "low";
  return ledger;
}

function validBugfixInfeasibleReason(): unknown {
  const ledger = cloneFixture("invalid-bugfix-missing-reproduction.json");
  const analyzeToImplementation = asRecord(historyOf(ledger)[1], "Expected Analyze -> Implementation transition.");
  const evidence = asRecord(analyzeToImplementation.evidence, "Expected transition evidence.");
  evidence.infeasibleReason = "The defect cannot be reproduced in this isolated validator fixture.";
  return ledger;
}

function validPerformanceInfeasibleReason(): unknown {
  const ledger = cloneFixture("invalid-performance-missing-evidence.json");
  const implementationToReview = asRecord(historyOf(ledger)[2], "Expected Implementation -> Review transition.");
  const evidence = asRecord(implementationToReview.evidence, "Expected transition evidence.");
  evidence.infeasibleReason = "Benchmark runner is unavailable in this isolated validator fixture.";
  return ledger;
}

function validProtocolInfeasibleReason(): unknown {
  const ledger = cloneFixture("invalid-protocol-missing-evidence.json");
  const implementationToReview = asRecord(historyOf(ledger)[2], "Expected Implementation -> Review transition.");
  const evidence = asRecord(implementationToReview.evidence, "Expected transition evidence.");
  evidence.infeasibleReason = "Golden vectors are infeasible for this isolated validator fixture.";
  return ledger;
}

function invalidFeatureReadyImplementationWithoutAutoMinimalAnalyze(): unknown {
  const ledger = cloneFixture("valid-feature.json");
  ledger.status = "Implementation";
  ledger.history = [
    {
      from: "Ready",
      to: "Implementation",
      at: "2026-06-10T00:00:00.000Z",
      by: "plugin",
      source: "autopilot_run_next",
      evidence: { reason: "Invalid direct implementation." },
    },
  ];
  return ledger;
}

function invalidFeatureAnalyzeReview(): unknown {
  const ledger = cloneFixture("valid-research.json");
  ledger.taskType = "feature";
  ledger.status = "Review";
  ledger.history = [
    { from: "Ready", to: "Analyze", at: "2026-06-10T00:00:00.000Z", by: "plugin", source: "autopilot_run_next", evidence: { reason: "Task selected." } },
    {
      from: "Analyze",
      to: "Review",
      at: "2026-06-10T00:01:00.000Z",
      by: "plugin",
      source: "autopilot_collect",
      evidence: { artifact: "research.md", reasonNoImplementation: "Invalid skip." },
    },
  ];
  return ledger;
}

function invalidImplementationReviewMissingValidationAndSecretScan(): unknown {
  const ledger = cloneFixture("valid-feature.json");
  const implementationToReview = asRecord(historyOf(ledger)[2], "Expected Implementation -> Review transition.");
  implementationToReview.evidence = { changedFiles: ["src/auth/flow.ts", "tests/auth/flow.test.ts"] };
  return ledger;
}

function invalidImplementationReviewMissingChangedFilesAndNoOpReason(): unknown {
  const ledger = cloneFixture("valid-feature.json");
  const implementationToReview = asRecord(historyOf(ledger)[2], "Expected Implementation -> Review transition.");
  implementationToReview.evidence = {
    validation: { status: "passed", commands: ["<validation-command>"] },
    secretScan: { status: "placeholder", reason: "Scanner integration deferred." },
  };
  return ledger;
}

function invalidBugfixProseOnlyReproductionGate(): unknown {
  const ledger = cloneFixture("invalid-bugfix-missing-reproduction.json");
  const analyzeToImplementation = asRecord(historyOf(ledger)[1], "Expected Analyze -> Implementation transition.");
  const evidence = asRecord(analyzeToImplementation.evidence, "Expected transition evidence.");
  evidence.reproduction = "Manual reproduction was attempted.";
  return ledger;
}

function invalidToolingSummaryOnlyGate(): unknown {
  const ledger = cloneFixture("invalid-tooling-missing-gate.json");
  const implementationToReview = asRecord(historyOf(ledger)[2], "Expected Implementation -> Review transition.");
  const evidence = asRecord(implementationToReview.evidence, "Expected transition evidence.");
  evidence.toolingGate = { summary: "Tooling gate ran." };
  return ledger;
}

function invalidConfigInfeasibleReasonDoesNotSatisfyGate(): unknown {
  const ledger = cloneFixture("invalid-config-missing-gate.json");
  const implementationToReview = asRecord(historyOf(ledger)[2], "Expected Implementation -> Review transition.");
  const evidence = asRecord(implementationToReview.evidence, "Expected transition evidence.");
  evidence.infeasibleReason = "Config gate skipped without schema, fixture, generated config, limits/defaults, or reload-policy evidence.";
  return ledger;
}

function invalidPerformanceProseOnlyEvidenceGate(): unknown {
  const ledger = cloneFixture("invalid-performance-missing-evidence.json");
  const implementationToReview = asRecord(historyOf(ledger)[2], "Expected Implementation -> Review transition.");
  const evidence = asRecord(implementationToReview.evidence, "Expected transition evidence.");
  evidence.benchmark = "Benchmark looked faster.";
  return ledger;
}

function invalidProtocolEmptyInfeasibleReason(): unknown {
  const ledger = cloneFixture("invalid-protocol-missing-evidence.json");
  const implementationToReview = asRecord(historyOf(ledger)[2], "Expected Implementation -> Review transition.");
  const evidence = asRecord(implementationToReview.evidence, "Expected transition evidence.");
  evidence.infeasibleReason = "   ";
  return ledger;
}

function invalidReviewAcceptanceFailedReviewer(): unknown {
  const ledger = cloneFixture("valid-feature.json");
  const reviewPolicy = asRecord(ledger.reviewPolicy, "Fixture reviewPolicy must be an object.");
  const required = reviewPolicy.required as Array<Record<string, unknown>>;
  required[0].status = "failed";
  const reviewToAcceptance = asRecord(historyOf(ledger)[3], "Expected Review -> Acceptance transition.");
  reviewToAcceptance.evidence = {
    reviewerDecisions: [
      { reviewer: "code-quality-reviewer", decision: "failed" },
      { reviewer: "test-coverage-reviewer", decision: "passed" },
    ],
  };
  return ledger;
}

function loadTestValue(test: TestCase): unknown {
  if (test.value) {
    return test.value();
  }
  if (!test.fixture) {
    throw new Error(`Test ${test.name} has no fixture or value factory.`);
  }
  return readFixture(test.fixture);
}

function invokeValidator(args: string[]): { exitCode: number; output: string } {
  const result = spawnSync("node", [validator, ...args], { cwd: root, encoding: "utf8", shell: false });
  if (result.error) {
    throw result.error;
  }
  return { exitCode: result.status ?? 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function assertCliContract(): void {
  const valid = invokeValidator([path.join("fixtures", "autopilot-ledger", "valid-feature.json")]);
  if (valid.exitCode !== 0 || !valid.output.includes('"valid": true')) {
    throw new Error(`Valid CLI fixture should exit 0 with JSON valid=true.\n${valid.output}`);
  }

  const invalid = invokeValidator([path.join("fixtures", "autopilot-ledger", "invalid-terminal-transition.json")]);
  if (invalid.exitCode === 0 || !invalid.output.includes('"valid": false') || !invalid.output.includes("Terminal status cannot transition")) {
    throw new Error(`Invalid CLI fixture should exit non-zero with JSON valid=false.\n${invalid.output}`);
  }

  const usage = invokeValidator([]);
  if (usage.exitCode !== 2 || !usage.output.includes("Usage:")) {
    throw new Error(`CLI without args should exit 2 with usage.\n${usage.output}`);
  }
}

let failed = 0;
for (const test of tests) {
  try {
    const result = validateTaskLedger(loadTestValue(test), { sourcePath: test.fixture ?? test.name });
    if (result.valid !== test.valid) {
      throw new Error(`Expected valid=${test.valid}, got valid=${result.valid}.\n${result.errors.join("\n")}`);
    }
    if (test.valid && result.errors.length > 0) {
      throw new Error(`Valid fixture should not return errors.\nErrors:\n${result.errors.join("\n")}`);
    }
    if (result.warnings.length > 0) {
      throw new Error(`Autopilot ledger tests expect no warnings.\nWarnings:\n${result.warnings.join("\n")}`);
    }
    for (const expected of test.expected ?? []) {
      if (!result.errors.some((error) => error.includes(expected))) {
        throw new Error(`Expected error containing ${expected}.\nErrors:\n${result.errors.join("\n")}`);
      }
    }
    if (test.expectedErrorCount != null && result.errors.length !== test.expectedErrorCount) {
      throw new Error(`Expected ${test.expectedErrorCount} error(s), got ${result.errors.length}.\nErrors:\n${result.errors.join("\n")}`);
    }
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${test.name}\n${message}`);
  }
}

try {
  assertCliContract();
  console.log("PASS autopilot ledger CLI contract");
} catch (error) {
  failed++;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL autopilot ledger CLI contract\n${message}`);
}

if (failed > 0) {
  console.error(`${failed} autopilot ledger test(s) failed.`);
  process.exit(1);
}

console.log(`${tests.length + 1} autopilot ledger tests passed.`);
