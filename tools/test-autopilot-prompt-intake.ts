#!/usr/bin/env node
import {
  classifyAutopilotPromptIntake,
  planAutopilotPromptIntake,
  type AutopilotPromptFamily,
  type AutopilotPromptIntakeResult,
} from "./autopilot-prompt-intake.ts";

type TestCase = {
  name: string;
  run: () => void;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoRunNextArgs(result: AutopilotPromptIntakeResult): void {
  assert(result.runNextArgs == null, `Expected no runNextArgs, got ${JSON.stringify(result.runNextArgs)}.`);
  assert(result.claimCapableAction === false, "Unresolved prompt intake must not allow claim-capable advancement.");
}

function assertFamily(prompt: string, expected: AutopilotPromptFamily, workflow: string): void {
  const result = classifyAutopilotPromptIntake({ argumentsText: prompt, existingQueue: [] });
  assert(result.category === "freeform-prompt", `Expected freeform-prompt for ${prompt}, got ${result.category}.`);
  assert(result.queueState === "none", `Expected confirmed empty queue state for ${prompt}, got ${result.queueState}.`);
  assert(result.unrelatedQueuePolicy === "not_applicable", `Expected no unrelated queue policy for ${prompt}, got ${result.unrelatedQueuePolicy}.`);
  assert(result.promptFamily === expected, `Expected ${expected} family for ${prompt}, got ${result.promptFamily}.`);
  assert(result.recommendedWorkflow === workflow, `Expected ${workflow} workflow for ${prompt}, got ${result.recommendedWorkflow}.`);
  assertNoRunNextArgs(result);
}

const knownScopes = {
  changeIds: ["add-login-timeout-fix", "shared-scope", "feature-flags"] as const,
  taskIds: ["autopilot-task-a", "shared-scope"] as const,
};

const tests: TestCase[] = [
  {
    name: "empty arguments keep unscoped autopilot flow",
    run: () => {
      for (const argumentsText of [undefined, "", "   \t\n  "]) {
        const result = classifyAutopilotPromptIntake({ argumentsText, ...knownScopes });
        assert(result.category === "empty", `Expected empty category, got ${result.category}.`);
        assert(result.recommendedWorkflow === "autopilot_run_next", `Expected run_next workflow, got ${result.recommendedWorkflow}.`);
        assert(result.claimCapableAction === true, "Empty explicit Autopilot may call unscoped autopilot_run_next.");
        assert(JSON.stringify(result.runNextArgs) === "{}", `Expected empty runNextArgs, got ${JSON.stringify(result.runNextArgs)}.`);
      }
    },
  },
  {
    name: "exact scopes resolve without fuzzy prompt matching",
    run: () => {
      const change = classifyAutopilotPromptIntake({ argumentsText: "add-login-timeout-fix", ...knownScopes });
      assert(change.category === "change-scope", `Expected change-scope, got ${change.category}.`);
      assert(change.resolvedScope?.changeId === "add-login-timeout-fix", "Exact change id must resolve as changeId.");
      assert(change.runNextArgs?.changeId === "add-login-timeout-fix", "Exact change id must be passed as changeId.");

      const task = classifyAutopilotPromptIntake({ argumentsText: "--task autopilot-task-a", ...knownScopes });
      assert(task.category === "task-scope", `Expected task-scope, got ${task.category}.`);
      assert(task.resolvedScope?.taskId === "autopilot-task-a", "Explicit task flag must resolve as taskId.");
      assert(task.runNextArgs?.taskId === "autopilot-task-a", "Explicit task flag must be passed as taskId.");

      const bareTask = classifyAutopilotPromptIntake({ argumentsText: "autopilot-task-a", ...knownScopes });
      assert(bareTask.category === "task-scope", `Expected bare task-scope, got ${bareTask.category}.`);
      assert(bareTask.runNextArgs?.taskId === "autopilot-task-a", "Bare exact task id must be passed as taskId.");

      const combined = classifyAutopilotPromptIntake({ argumentsText: "--change feature-flags --task autopilot-task-a", ...knownScopes, taskChangeIds: { "autopilot-task-a": "feature-flags" } });
      assert(combined.category === "combined-scope", `Expected combined-scope, got ${combined.category}.`);
      assert(combined.runNextArgs?.changeId === "feature-flags", "Combined scope must preserve changeId.");
      assert(combined.runNextArgs?.taskId === "autopilot-task-a", "Combined scope must preserve taskId.");
      assert(combined.claimCapableAction === true, "Resolved exact scopes may call scoped autopilot_run_next.");

      const fuzzy = classifyAutopilotPromptIntake({ argumentsText: "please work on add-login-timeout-fix", ...knownScopes });
      assert(fuzzy.category === "freeform-prompt", `Expected fuzzy text to remain freeform, got ${fuzzy.category}.`);
      assertNoRunNextArgs(fuzzy);

      const queuedChange = classifyAutopilotPromptIntake({
        argumentsText: "queued-change",
        existingQueue: [{ id: "queued-change", sourceKind: "active-change" }],
      });
      assert(queuedChange.category === "change-scope", `Expected queued active change to resolve as change-scope, got ${queuedChange.category}.`);
      assert(queuedChange.runNextArgs?.changeId === "queued-change", "Active-change queue id must resolve as changeId.");

      const queuedTask = classifyAutopilotPromptIntake({
        argumentsText: "queued-task",
        existingQueue: [{ id: "queued-task", sourceKind: "ledger" }],
      });
      assert(queuedTask.category === "task-scope", `Expected queued ledger to resolve as task-scope, got ${queuedTask.category}.`);
      assert(queuedTask.runNextArgs?.taskId === "queued-task", "Ledger queue id must resolve as taskId.");
    },
  },
  {
    name: "ambiguous scopes block instead of guessing",
    run: () => {
      const shared = classifyAutopilotPromptIntake({ argumentsText: "shared-scope", ...knownScopes });
      assert(shared.category === "ambiguous-scope", `Expected ambiguous-scope for shared id, got ${shared.category}.`);
      assert(shared.ambiguities.length > 0, "Ambiguous exact scope must explain ambiguity.");
      assertNoRunNextArgs(shared);

      const duplicates = classifyAutopilotPromptIntake({ argumentsText: "--change add-login-timeout-fix --change feature-flags", ...knownScopes });
      assert(duplicates.category === "ambiguous-scope", `Expected ambiguous duplicate flags, got ${duplicates.category}.`);
      assertNoRunNextArgs(duplicates);

      for (const argumentsText of [
        "--change",
        "--change=",
        "--task missing-task",
        "--change feature-flags --task autopilot-task-a",
        "--change add-login-timeout-fix extra",
        "add-login-timeout-fix autopilot-task-a",
      ]) {
        const result = classifyAutopilotPromptIntake({ argumentsText, ...knownScopes });
        assert(result.category === "ambiguous-scope", `Expected ambiguous-scope for ${argumentsText}, got ${result.category}.`);
        assertNoRunNextArgs(result);
      }
    },
  },
  {
    name: "freeform prompt requires status when queue inventory is unknown",
    run: () => {
      const prompt = "fix the login timeout bug";
      const plan = planAutopilotPromptIntake({ argumentsText: prompt, ...knownScopes });
      assert(plan.intake.category === "freeform-prompt", `Expected freeform-prompt, got ${plan.intake.category}.`);
      assert(plan.intake.queueState === "unknown", `Expected unknown queue state, got ${plan.intake.queueState}.`);
      assert(plan.intake.recommendedWorkflow === "autopilot_status", `Expected status workflow, got ${plan.intake.recommendedWorkflow}.`);
      assert(plan.intake.handoffWorkflow === "openspec-explore", `Expected explore handoff, got ${plan.intake.handoffWorkflow}.`);
      assert(plan.firstTool === "autopilot_status", `Expected first tool autopilot_status, got ${plan.firstTool}.`);
      assertNoRunNextArgs(plan.intake);
      assert(!JSON.stringify(plan).includes(prompt), "Command-intake plan must not echo raw prompt text by default.");
    },
  },
  {
    name: "freeform prompt separates unscheduled prompt from existing queue",
    run: () => {
      const prompt = "fix the login timeout bug";
      const result = classifyAutopilotPromptIntake({
        argumentsText: prompt,
        ...knownScopes,
        existingQueue: [
          { id: "feature-flags", sourceKind: "active-change" },
          { id: "autopilot-task-a", sourceKind: "ledger" },
        ],
      });
      assert(result.category === "freeform-prompt", `Expected freeform-prompt, got ${result.category}.`);
      assert(result.promptFamily === "bugfix", `Expected bugfix family, got ${result.promptFamily}.`);
      assert(result.queueState === "present", `Expected present queue state, got ${result.queueState}.`);
      assert(result.unrelatedQueuePolicy === "do_not_advance_without_scope_selection", `Expected queue separation policy, got ${result.unrelatedQueuePolicy}.`);
      assert(result.recommendedWorkflow === "openspec-explore", `Expected bug prompt to route to openspec-explore, got ${result.recommendedWorkflow}.`);
      assertNoRunNextArgs(result);
      assert(!JSON.stringify(result).includes(prompt), "Prompt-intake output must not echo raw prompt text by default.");
    },
  },
  {
    name: "prompt families route conservatively",
    run: () => {
      assertFamily("add support for export presets", "feature", "openspec-propose");
      assertFamily("bugfix auth login", "bugfix", "openspec-explore");
      assertFamily("refactor validation helper", "refactor", "openspec-propose");
      assertFamily("research why the scheduler waits", "research", "openspec-explore");
      assertFamily("plan the migration rollout", "planning", "openspec-explore");
      assertFamily("fix docs typo in README", "typo", "direct-edit");
      assertFamily("update documentation for install", "docs", "direct-edit");
      assertFamily("improve npm tooling script", "tooling", "openspec-propose");
      assertFamily("change configuration schema", "config", "openspec-propose");
      assertFamily("reduce latency in hot path", "performance", "openspec-propose");
      assertFamily("add protocol framing test", "protocol", "openspec-propose");
      assertFamily("make the thing better", "unclear", "openspec-explore");

      const mixed = classifyAutopilotPromptIntake({ argumentsText: "research and implement a protocol performance feature", existingQueue: [] });
      assert(mixed.category === "freeform-prompt", `Expected mixed prompt to be freeform, got ${mixed.category}.`);
      assert(mixed.promptFamily === "unclear", `Expected mixed prompt to be unclear, got ${mixed.promptFamily}.`);
      assert(mixed.recommendedWorkflow === "openspec-explore", `Expected mixed prompt to route to exploration, got ${mixed.recommendedWorkflow}.`);
      assertNoRunNextArgs(mixed);

      for (const prompt of [
        "fix grammar and add export feature",
        "fix typo in protocol framing",
        "spelling error causing crash",
      ]) {
        const result = classifyAutopilotPromptIntake({ argumentsText: prompt, existingQueue: [] });
        assert(result.promptFamily === "unclear", `Expected mixed typo prompt to be unclear for ${prompt}, got ${result.promptFamily}.`);
        assert(result.recommendedWorkflow === "openspec-explore", `Expected mixed typo prompt to route to exploration, got ${result.recommendedWorkflow}.`);
        assertNoRunNextArgs(result);
      }
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} autopilot prompt intake test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot prompt intake tests=${tests.length}`);
