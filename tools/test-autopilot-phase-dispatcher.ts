#!/usr/bin/env node
import {
  resolveAutopilotPhaseDispatch,
  type AutopilotPhaseDispatchDecision,
  type AutopilotPhaseDispatchInput,
} from "./autopilot-phase-dispatcher.ts";
import { autopilotMrWaitStatuses, type AutopilotTaskType } from "./autopilot-contract.ts";

type TestCase = {
  name: string;
  run: () => void;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function input(overrides: Partial<AutopilotPhaseDispatchInput> = {}): AutopilotPhaseDispatchInput {
  return {
    taskId: "task-a",
    taskType: "feature",
    status: "Ready",
    mrStatus: "none",
    blockers: [],
    phaseEvidence: {},
    ...overrides,
  };
}

function dispatchDecision(decision: AutopilotPhaseDispatchDecision, message: string): Extract<AutopilotPhaseDispatchDecision, { action: "dispatch" }> {
  assert(decision.action === "dispatch", `${message}: expected dispatch, got ${decision.action}.`);
  return decision;
}

function assertIncludesAll(values: string[], expected: string[], message: string): void {
  for (const value of expected) {
    assert(values.includes(value), `${message}: expected ${value}.`);
  }
}

const tests: TestCase[] = [
  {
    name: "Ready feature dispatches Analyze first",
    run: () => {
      const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input()), "Ready feature");
      assert(decision.fromStatus === "Ready" && decision.toStatus === "Analyze", "Ready feature must dispatch Analyze, not whole-change implementation.");
      assert(decision.phase === "analyze", "Ready feature must use analyze phase.");
      assertIncludesAll(decision.evidenceRequirements, ["planSummary", "slices", "scope", "testStrategy"], "Ready feature Analyze dispatch evidence");
    },
  },
  {
    name: "Ready typo can dispatch direct minimal implementation",
    run: () => {
      const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input({ taskType: "typo" })), "Ready typo");
      assert(decision.fromStatus === "Ready" && decision.toStatus === "Implementation", "Ready typo may use the validator's direct minimal implementation transition.");
      assert(decision.phase === "implementation", "Ready typo direct dispatch must use implementation phase.");
      assert(decision.minimalAnalyze === true, "Ready typo direct dispatch must be explicitly marked minimal analyze.");
      assertIncludesAll(decision.evidenceRequirements, ["autoMinimalAnalyze", "changedFiles", "noOpReason", "validation", "secretScan"], "Ready typo direct implementation evidence");
    },
  },
  {
    name: "Ready feature with autoMinimalAnalyze can dispatch implementation",
    run: () => {
      const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input({ phaseEvidence: { analyze: { autoMinimalAnalyze: true } } })), "Ready autoMinimalAnalyze");
      assert(decision.fromStatus === "Ready" && decision.toStatus === "Implementation", "Ready autoMinimalAnalyze should dispatch direct implementation.");
      assert(decision.minimalAnalyze === true, "Ready autoMinimalAnalyze dispatch must carry minimalAnalyze evidence flag.");
      assertIncludesAll(decision.evidenceRequirements, ["autoMinimalAnalyze", "changedFiles", "noOpReason", "validation", "secretScan"], "Ready autoMinimalAnalyze direct implementation evidence");
    },
  },
  {
    name: "Analyze feature dispatches Implementation",
    run: () => {
      const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input({ status: "Analyze" })), "Analyze feature");
      assert(decision.fromStatus === "Analyze" && decision.toStatus === "Implementation", "Analyze feature must dispatch Implementation.");
      assert(decision.phase === "implementation", "Analyze feature must use implementation phase.");
      assertIncludesAll(decision.evidenceRequirements, ["planSummary", "slices", "scope", "testStrategy"], "Analyze feature implementation evidence");
    },
  },
  {
    name: "Analyze bugfix dispatches Implementation with validator type gate fields",
    run: () => {
      const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input({ taskType: "bugfix", status: "Analyze" })), "Analyze bugfix");
      assert(decision.fromStatus === "Analyze" && decision.toStatus === "Implementation", "Analyze bugfix must dispatch Implementation.");
      assertIncludesAll(decision.evidenceRequirements, ["planSummary", "slices", "scope", "testStrategy", "reproduction", "characterization", "regressionTest", "infeasibleReason"], "Analyze bugfix implementation evidence");
    },
  },
  {
    name: "Analyze planning dispatches Review with no-implementation evidence",
    run: () => {
      const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input({ taskType: "planning", status: "Analyze" })), "Analyze planning");
      assert(decision.fromStatus === "Analyze" && decision.toStatus === "Review", "Analyze planning may dispatch Review without implementation.");
      assert(decision.phase === "review", "Analyze planning no-implementation path must use review phase.");
      assert(decision.evidenceRequirements.includes("artifact"), "Analyze planning must require artifact evidence.");
      assert(decision.evidenceRequirements.includes("reasonNoImplementation"), "Analyze planning must require no-implementation reason.");
    },
  },
  {
    name: "Implementation type gates dispatch Review with validator fields",
    run: () => {
      const cases: Array<{ taskType: AutopilotTaskType; expected: string[] }> = [
        { taskType: "tooling", expected: ["toolingGate", "fixture", "validator", "cliContract", "generatedOutput"] },
        { taskType: "config", expected: ["configGate", "schemaCheck", "fixture", "generatedConfig", "reloadPolicy", "limitsDefaults", "limits", "defaults"] },
        { taskType: "performance", expected: ["benchmark", "profile", "loadTest", "sloEvidence", "infeasibleReason"] },
        { taskType: "protocol", expected: ["goldenVectors", "negativeCases", "compatibilityVectors", "wireEvidence", "infeasibleReason"] },
      ];
      for (const { taskType, expected } of cases) {
        const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input({ taskType, status: "Implementation" })), `Implementation ${taskType}`);
        assert(decision.fromStatus === "Implementation" && decision.toStatus === "Review", `Implementation ${taskType} must dispatch Review.`);
        assertIncludesAll(decision.evidenceRequirements, ["changedFiles", "noOpReason", "validation", "secretScan", ...expected], `Implementation ${taskType} review evidence`);
      }
    },
  },
  {
    name: "Review feature dispatches Acceptance with reviewer evidence",
    run: () => {
      const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input({ status: "Review" })), "Review feature");
      assert(decision.fromStatus === "Review" && decision.toStatus === "Acceptance", "Review feature must dispatch Acceptance.");
      assertIncludesAll(decision.evidenceRequirements, ["reviewerDecisions", "reviewerSkips"], "Review feature acceptance evidence");
    },
  },
  {
    name: "Acceptance with any MR wait status returns wait decision",
    run: () => {
      for (const mrStatus of autopilotMrWaitStatuses) {
        const decision = resolveAutopilotPhaseDispatch(input({ status: "Acceptance", mrStatus }));
        assert(decision.action === "wait", `${mrStatus}: expected wait, got ${decision.action}.`);
        assert(decision.reasonCode === "waiting_for_mr", `${mrStatus}: Acceptance with waiting MR must use waiting_for_mr reason.`);
        assert(decision.mrStatus === mrStatus, `${mrStatus}: wait decision must preserve MR status evidence.`);
      }
    },
  },
  {
    name: "Acceptance feature dispatches Done verification with MR evidence",
    run: () => {
      const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input({ status: "Acceptance", mrStatus: "merged" })), "Acceptance feature");
      assert(decision.fromStatus === "Acceptance" && decision.toStatus === "Done", "Acceptance feature should verify Done.");
      assertIncludesAll(decision.evidenceRequirements, ["mergeEvidence", "mrMerged", "validation"], "Acceptance feature Done evidence");
    },
  },
  {
    name: "Acceptance research without MR dispatches Done verification",
    run: () => {
      const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input({ taskType: "research", status: "Acceptance", mrStatus: "not-required" })), "Acceptance research");
      assert(decision.fromStatus === "Acceptance" && decision.toStatus === "Done", "Acceptance research with no-MR policy may verify Done.");
      assertIncludesAll(decision.evidenceRequirements, ["noMrAcceptancePolicy", "validation"], "Acceptance research Done evidence");
    },
  },
  {
    name: "Acceptance research with MR still requires merge evidence",
    run: () => {
      for (const mrStatus of ["merged", "none"] as const) {
        const decision = dispatchDecision(resolveAutopilotPhaseDispatch(input({ taskType: "research", status: "Acceptance", mrStatus })), `Acceptance research ${mrStatus}`);
        assert(decision.fromStatus === "Acceptance" && decision.toStatus === "Done", `Acceptance research ${mrStatus} should verify Done.`);
        assertIncludesAll(decision.evidenceRequirements, ["mergeEvidence", "mrMerged", "validation"], `Acceptance research ${mrStatus} Done evidence`);
      }
    },
  },
  {
    name: "Blocked returns blocker decision",
    run: () => {
      const decision = resolveAutopilotPhaseDispatch(input({ status: "Blocked", blockers: [{ reason: "Need credentials", questionId: "q-1" }] }));
      assert(decision.action === "blocked", `Expected blocked, got ${decision.action}.`);
      assert(decision.reasonCode === "blocked_for_user", "Blocked status must use blocked_for_user reason.");
      assert(decision.blockers.length === 1 && decision.blockers[0]?.reason === "Need credentials", "Blocked decision must preserve blocker reason evidence.");
      assert(decision.blockers[0]?.questionId === "q-1", "Blocked decision must preserve blocker question evidence.");
    },
  },
  {
    name: "Terminal statuses return terminal decisions",
    run: () => {
      for (const status of ["Done", "Failed", "Cancelled"] as const) {
        const decision = resolveAutopilotPhaseDispatch(input({ status }));
        assert(decision.action === "terminal", `${status}: expected terminal, got ${decision.action}.`);
        assert(decision.reasonCode === "no_actionable_tasks", `${status}: terminal decision must use no_actionable_tasks.`);
        assert(decision.status === status, `${status}: terminal decision must preserve terminal status.`);
      }
    },
  },
];

try {
  for (const test of tests) {
    test.run();
    console.log(`PASS ${test.name}`);
  }
} catch (error) {
  console.error("FAIL autopilot phase dispatcher");
  console.error(error);
  process.exitCode = 1;
}
