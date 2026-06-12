#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import autopilotPlugin from "../.opencode/plugins/openspec-autopilot.ts";
import {
  autopilotActionabilityValues,
  autopilotMrStatuses,
  autopilotMrWaitStatuses,
  autopilotProtectedPathPatterns,
  autopilotReasonCodes,
  autopilotSelectionModes,
  autopilotParallelDecisions,
  autopilotSelectionReasons,
  autopilotTaskStatuses,
  autopilotTaskTypes,
  autopilotToolNames,
} from "./autopilot-contract.ts";
import { autopilotLedgerPolicy, taskStatuses, taskTypes } from "./autopilot-ledger.ts";
import { autopilotOutputContract } from "./openspec-autopilot-output.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

type PluginToolResult = {
  output: string;
  metadata?: Record<string, unknown>;
};

type PluginToolDefinition = {
  description: string;
  args: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context?: unknown) => Promise<string | PluginToolResult>;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");
const expectedPluginToolArgs = {
  autopilot_run_next: ["changeId", "taskId"],
  autopilot_status: ["changeId"],
  autopilot_collect: ["taskId"],
  autopilot_answer_blocker: ["questionId", "taskId", "selectedLabel", "action"],
  autopilot_stop: ["target", "id", "reason"],
} satisfies Record<(typeof autopilotToolNames)[number], readonly string[]>;
const ignoredAnswerTaskId = "__ignored_answer_task_id_sentinel__";
const ignoredSelectedLabel = "__ignored_selected_label_sentinel__";
const ignoredAction = "__ignored_action_sentinel__";
const ignoredStopId = "__ignored_stop_id_sentinel__";
const ignoredStopReason = "__ignored_stop_reason_sentinel__";

function assertArrayEqual(actual: unknown, expected: readonly string[], label: string): void {
  if (!Array.isArray(actual)) {
    throw new Error(`${label} must be an exported array.`);
  }
  const actualStrings = actual.map((value) => String(value));
  if (actualStrings.length !== expected.length || actualStrings.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} drifted from shared contract.\nExpected: ${expected.join(", ")}\nActual: ${actualStrings.join(", ")}`);
  }
}

function readPluginToolNames(): string[] {
  const pluginPath = path.join(root, ".opencode", "plugins", "openspec-autopilot.ts");
  const text = fs.readFileSync(pluginPath, "utf8");
  return Array.from(text.matchAll(/^\s*(autopilot_[a-z_]+):\s*tool\(/gm), (match) => match[1]);
}

function readPackageScripts(): Record<string, string> {
  const packagePath = path.join(root, "package.json");
  const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { scripts?: Record<string, unknown> };
  const scripts: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed.scripts ?? {})) {
    if (typeof value === "string") {
      scripts[name] = value;
    }
  }
  return scripts;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8")) as Record<string, unknown>;
}

function historyOf(ledger: Record<string, unknown>): Array<Record<string, unknown>> {
  assert(Array.isArray(ledger.history), "Fixture history must be an array.");
  return ledger.history as Array<Record<string, unknown>>;
}

function revisionOf(ledger: Record<string, unknown>): Record<string, unknown> {
  assert(typeof ledger.revision === "object" && ledger.revision != null && !Array.isArray(ledger.revision), "Fixture revision must be an object.");
  return ledger.revision as Record<string, unknown>;
}

function readyResearchLedger(id: string): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = id;
  ledger.status = "Ready";
  ledger.history = [];
  ledger.mr = { required: true, status: "none" };
  revisionOf(ledger).number = 1;
  return ledger;
}

function invalidReadyLedger(id: string): Record<string, unknown> {
  const ledger = readyResearchLedger(id);
  delete ledger.testDecision;
  return ledger;
}

function blockedResearchLedger(id: string): Record<string, unknown> {
  const ledger = readyResearchLedger(id);
  ledger.blockers = [{ reason: "User must choose provider credentials." }];
  return ledger;
}

function dependencyBlockedLedger(id: string): Record<string, unknown> {
  const ledger = readyResearchLedger(id);
  ledger.dependencies = ["missing-dependency"];
  return ledger;
}

function dependencySatisfiedLedger(id: string, dependencyId: string): Record<string, unknown> {
  const ledger = readyResearchLedger(id);
  ledger.dependencies = [dependencyId];
  return ledger;
}

function doneResearchLedger(id: string): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = id;
  ledger.status = "Done";
  ledger.mr = {
    required: false,
    status: "not-required",
    noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR.",
  };
  historyOf(ledger).push({
    from: "Acceptance",
    to: "Done",
    at: "2026-06-10T00:03:00.000Z",
    by: "plugin",
    source: "autopilot_collect",
    evidence: { noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR." },
  });
  revisionOf(ledger).number = 4;
  return ledger;
}

function waitingResearchLedger(id: string): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = id;
  historyOf(ledger);
  return ledger;
}

function withTempRepo(name: string, run: (repo: string) => void | Promise<void>): Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-autopilot-plugin-${name}-`));
  return Promise.resolve(run(repo)).finally(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });
}

function writeLedger(repo: string, changeId: string, ledger: Record<string, unknown>): void {
  const filePath = path.join(repo, "openspec", "changes", changeId, "automation", "task.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function snapshotFiles(rootPath: string, relativePath = ""): string[] {
  const current = path.join(rootPath, relativePath);
  return fs.readdirSync(current, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const entryRelativePath = path.join(relativePath, entry.name);
      const normalized = entryRelativePath.split(path.sep).join("/");
      const entryPath = path.join(rootPath, entryRelativePath);
      if (entry.isDirectory()) {
        return snapshotFiles(rootPath, entryRelativePath);
      }
      return [`${normalized}\n${fs.readFileSync(entryPath, "utf8")}`];
    });
}

function assertLoopGuard(output: Record<string, unknown>, expectedEquivalentCall: string): void {
  assert(typeof output.loopGuard === "object" && output.loopGuard != null && !Array.isArray(output.loopGuard), "loopGuard must be an object.");
  const loopGuard = output.loopGuard as Record<string, unknown>;
  assert(loopGuard.equivalentCall === expectedEquivalentCall, `Expected loopGuard equivalentCall=${expectedEquivalentCall}, got ${String(loopGuard.equivalentCall)}.`);
  assert(loopGuard.repeatedNoProgress === true, "loopGuard must mark repeated no-progress semantics.");
  assert(loopGuard.suppressRepeatRecommendation === true, "loopGuard must suppress repeat recommendation.");
}

function assertArgumentContext(metadata: Record<string, unknown>, expected: { acknowledged: string[]; ignored: string[]; mutation: string }): void {
  assert(typeof metadata.argumentContext === "object" && metadata.argumentContext != null && !Array.isArray(metadata.argumentContext), "metadata.argumentContext must document sanitized no-op argument handling.");
  const context = metadata.argumentContext as Record<string, unknown>;
  assertArrayEqual(context.acknowledged, expected.acknowledged, "metadata.argumentContext.acknowledged");
  assertArrayEqual(context.ignored, expected.ignored, "metadata.argumentContext.ignored");
  assert(context.mutation === expected.mutation, `Expected argumentContext mutation=${expected.mutation}, got ${String(context.mutation)}.`);
}

function assertAutopilotOutputShape(output: Record<string, unknown>, label: string): void {
  assert(typeof output.reasonCode === "string", `${label} must include reasonCode.`);
  assert(Array.isArray(output.taskSummaries), `${label} must include taskSummaries array.`);
  assert(Array.isArray(output.nextActions), `${label} must include nextActions array.`);
  assert(typeof output.loopGuard === "object" && output.loopGuard != null && !Array.isArray(output.loopGuard), `${label} must include loopGuard object.`);
  assert(typeof output.selection === "object" && output.selection != null && !Array.isArray(output.selection), `${label} must include selection object.`);
  for (const action of output.nextActions) {
    assert(typeof action === "object" && action != null && !Array.isArray(action), `${label} nextActions entries must be objects.`);
    const nextAction = action as Record<string, unknown>;
    for (const key of ["label", "kind", "reason", "safety", "expectedResult"]) {
      assert(typeof nextAction[key] === "string" && String(nextAction[key]).trim().length > 0, `${label} nextActions entries must include non-empty ${key}.`);
    }
  }
}

async function pluginTools(repo: string, options: Record<string, unknown> = {}): Promise<Record<string, PluginToolDefinition>> {
  const hooks = await autopilotPlugin.server({ directory: repo, worktree: repo } as never, options as never);
  assert(typeof hooks.tool === "object" && hooks.tool != null && !Array.isArray(hooks.tool), "Autopilot plugin server must return a tool map.");
  return hooks.tool as Record<string, PluginToolDefinition>;
}

async function executePluginTool(tools: Record<string, PluginToolDefinition>, name: string, args: Record<string, unknown>): Promise<{ payload: Record<string, unknown>; metadata: Record<string, unknown> }> {
  const definition = tools[name];
  assert(definition != null, `Missing plugin tool ${name}.`);
  const result = await definition.execute(args, undefined);
  assert(typeof result === "object" && result != null && !Array.isArray(result), `${name} must return structured tool output.`);
  assert(typeof result.output === "string", `${name} must return a JSON output string.`);
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  assertAutopilotOutputShape(payload, name);
  return { payload, metadata: result.metadata ?? {} };
}

function taskIds(output: Record<string, unknown>): string[] {
  assert(Array.isArray(output.taskSummaries), "taskSummaries must be an array.");
  return output.taskSummaries.map((summary) => {
    assert(typeof summary === "object" && summary != null && !Array.isArray(summary), "Each task summary must be an object.");
    return String((summary as Record<string, unknown>).taskId);
  });
}

function taskAdvancements(output: Record<string, unknown>): Array<Record<string, unknown>> {
  assert(Array.isArray(output.tasksAdvanced), "tasksAdvanced must be an array.");
  return output.tasksAdvanced.map((item) => {
    assert(typeof item === "object" && item != null && !Array.isArray(item), "tasksAdvanced entries must be objects.");
    return item as Record<string, unknown>;
  });
}

function taskStarts(output: Record<string, unknown>): Array<Record<string, unknown>> {
  assert(Array.isArray(output.tasksStarted), "tasksStarted must be an array.");
  return output.tasksStarted.map((item) => {
    assert(typeof item === "object" && item != null && !Array.isArray(item), "tasksStarted entries must be objects.");
    return item as Record<string, unknown>;
  });
}

function assertPluginToolArgKeys(tools: Record<string, PluginToolDefinition>): void {
  assertArrayEqual(Object.keys(expectedPluginToolArgs), autopilotToolNames, "plugin arg contract tool names");
  for (const name of autopilotToolNames) {
    assert(typeof tools[name].args === "object" && tools[name].args != null && !Array.isArray(tools[name].args), `${name} must expose an args schema map.`);
    assertArrayEqual(Object.keys(tools[name].args), expectedPluginToolArgs[name], `${name} args schema keys`);
  }
}

function assertNoProgressClaims(output: Record<string, unknown>, label: string): void {
  assert(Array.isArray(output.tasksStarted) && output.tasksStarted.length === 0, `${label} must not claim started tasks.`);
  assert(Array.isArray(output.tasksAdvanced) && output.tasksAdvanced.length === 0, `${label} must not claim advanced tasks.`);
}

function assertStopEntry(actual: Record<string, unknown>, expected: Record<string, string>, label: string): void {
  for (const [key, value] of Object.entries(expected)) {
    assert(actual[key] === value, `${label} expected ${key}=${value}, got ${String(actual[key])}.`);
  }
  assert(actual.action === "stopped", `${label} must mark action=stopped.`);
  assert(actual.mutation === "plugin-owned-runtime-only", `${label} must mark plugin-owned runtime-only mutation.`);
}

function assertStopApplied(result: { payload: Record<string, unknown>; metadata: Record<string, unknown> }, expectedEntries: Array<Record<string, string>>, expectedContext: { acknowledged: string[]; ignored: string[] }, label: string): void {
  assert(result.payload.reasonCode === "stop_applied", `${label} expected stop_applied, got ${String(result.payload.reasonCode)}.`);
  assert(result.payload.outcome === "advanced", `${label} expected advanced outcome, got ${String(result.payload.outcome)}.`);
  const advancements = taskAdvancements(result.payload);
  assert(advancements.length === expectedEntries.length, `${label} expected ${expectedEntries.length} stopped entries, got ${advancements.length}.`);
  expectedEntries.forEach((entry, index) => assertStopEntry(advancements[index] ?? {}, entry, `${label} entry ${index + 1}`));
  assertArgumentContext(result.metadata, {
    acknowledged: expectedContext.acknowledged,
    ignored: expectedContext.ignored,
    mutation: "plugin-owned-runtime-only",
  });
}

function assertStopNoop(result: { payload: Record<string, unknown>; metadata: Record<string, unknown> }, expectedContext: { acknowledged: string[]; ignored: string[] }, label: string): void {
  assert(result.payload.reasonCode === "stop_no_active_state", `${label} expected stop_no_active_state, got ${String(result.payload.reasonCode)}.`);
  assert(result.payload.outcome === "idle", `${label} expected idle outcome, got ${String(result.payload.outcome)}.`);
  assertNoProgressClaims(result.payload, label);
  assertArgumentContext(result.metadata, {
    acknowledged: expectedContext.acknowledged,
    ignored: expectedContext.ignored,
    mutation: "none",
  });
}

function selectionCandidateCount(output: Record<string, unknown>): number {
  assert(typeof output.selection === "object" && output.selection != null && !Array.isArray(output.selection), "selection must be an object.");
  const candidates = (output.selection as Record<string, unknown>).candidates;
  assert(Array.isArray(candidates), "selection.candidates must be an array.");
  return candidates.length;
}

const tests: TestCase[] = [
  {
    name: "ledger task types and statuses match shared contract",
    run: () => {
      assertArrayEqual(taskTypes, autopilotTaskTypes, "tools/autopilot-ledger.ts taskTypes");
      assertArrayEqual(taskStatuses, autopilotTaskStatuses, "tools/autopilot-ledger.ts taskStatuses");
    },
  },
  {
    name: "ledger protected paths and MR statuses match shared contract",
    run: () => {
      assertArrayEqual(autopilotLedgerPolicy.protectedLedgerPathPatterns, autopilotProtectedPathPatterns, "ledger protected path patterns");
      assertArrayEqual(autopilotLedgerPolicy.mrStatuses, autopilotMrStatuses, "ledger MR lifecycle statuses");
    },
  },
  {
    name: "plugin tool names match shared contract",
    run: () => {
      assertArrayEqual(readPluginToolNames(), autopilotToolNames, "plugin autopilot_* tool names");
    },
  },
  {
    name: "output public values match shared contract",
    run: () => {
      assertArrayEqual(autopilotOutputContract.reasonCodes, autopilotReasonCodes, "output reason codes");
      assertArrayEqual(autopilotOutputContract.actionabilityValues, autopilotActionabilityValues, "output actionability values");
      assertArrayEqual(autopilotOutputContract.mrWaitStatuses, autopilotMrWaitStatuses, "output MR wait statuses");
      assertArrayEqual(autopilotOutputContract.selectionModes, autopilotSelectionModes, "output selection modes");
      assertArrayEqual(autopilotOutputContract.parallelDecisions, autopilotParallelDecisions, "output parallel decisions");
      assertArrayEqual(autopilotOutputContract.selectionReasons, autopilotSelectionReasons, "output selection reasons");
    },
  },
  {
    name: "package exposes documented Autopilot validation scripts",
    run: () => {
      const scripts = readPackageScripts();
      if (scripts["autopilot:validate"] !== "node tools/autopilot-ledger.ts") {
        throw new Error("package.json must expose autopilot:validate as node tools/autopilot-ledger.ts.");
      }
      if (scripts["openspec:validate"] !== "openspec validate --all") {
        throw new Error("package.json must expose openspec:validate as openspec validate --all.");
      }
    },
  },
  {
    name: "plugin server exposes and executes every public Autopilot tool",
    run: () => withTempRepo("all-tools", async (repo) => {
      const tools = await pluginTools(repo);
      assertArrayEqual(Object.keys(tools), autopilotToolNames, "plugin server tool map");
      assertPluginToolArgKeys(tools);
      for (const name of autopilotToolNames) {
        const args = name === "autopilot_answer_blocker" ? { questionId: "question-1" } : {};
        const { payload, metadata } = await executePluginTool(tools, name, args);
        assert(metadata.service === "openspec-autopilot", `${name} metadata must identify openspec-autopilot service.`);
        assert(metadata.outcome === payload.outcome, `${name} metadata outcome must mirror payload outcome.`);
      }
    }),
  },
  {
    name: "plugin tools honor scoped args and prove MVP no-op semantics",
    run: () => withTempRepo("scoped-and-noop", async (repo) => {
      writeLedger(repo, "change-a", readyResearchLedger("task-a"));
      writeLedger(repo, "change-b", waitingResearchLedger("task-b"));
      writeLedger(repo, "change-c", readyResearchLedger("task-c"));
      writeLedger(repo, "change-invalid", invalidReadyLedger("task-invalid"));
      writeLedger(repo, "change-blocked", blockedResearchLedger("task-blocked"));
      writeLedger(repo, "change-dependent", dependencyBlockedLedger("task-dependent"));
      writeLedger(repo, "change-done", doneResearchLedger("task-done"));
      writeLedger(repo, "change-dependent-satisfied", dependencySatisfiedLedger("task-dependent-satisfied", "task-done"));
      const before = snapshotFiles(repo);
      const tools = await pluginTools(repo);

      const runNextByChange = await executePluginTool(tools, "autopilot_run_next", { changeId: "change-a" });
      assert(taskIds(runNextByChange.payload).join(",") === "task-a", `run_next changeId scope must select only task-a, got ${taskIds(runNextByChange.payload).join(",")}.`);
      assert((runNextByChange.payload.selection as Record<string, unknown>).selectedTaskId === "task-a", "run_next changeId scope must expose selected task-a in selection evidence.");

      const runNextInvalidByChange = await executePluginTool(tools, "autopilot_run_next", { changeId: "change-invalid" });
      assert(runNextInvalidByChange.payload.reasonCode === "invalid_ledgers", `Expected changeId scoped invalid task to return invalid_ledgers, got ${String(runNextInvalidByChange.payload.reasonCode)}.`);
      assert(selectionCandidateCount(runNextInvalidByChange.payload) === 0, "run_next changeId scope must not select invalid tasks as Ready primary candidates.");
      assertNoProgressClaims(runNextInvalidByChange.payload, "changeId scoped invalid run_next");

      const runNextBlockedByChange = await executePluginTool(tools, "autopilot_run_next", { changeId: "change-blocked" });
      assert(runNextBlockedByChange.payload.reasonCode === "blocked_for_user", `Expected changeId scoped blocked task to return blocked_for_user, got ${String(runNextBlockedByChange.payload.reasonCode)}.`);
      assert(selectionCandidateCount(runNextBlockedByChange.payload) === 0, "run_next changeId scope must not select blocked tasks as Ready primary candidates.");
      assertNoProgressClaims(runNextBlockedByChange.payload, "changeId scoped blocked run_next");

      const runNextWaitingByChange = await executePluginTool(tools, "autopilot_run_next", { changeId: "change-b" });
      assert(runNextWaitingByChange.payload.reasonCode === "waiting_for_mr", `Expected changeId scoped waiting task to return waiting_for_mr, got ${String(runNextWaitingByChange.payload.reasonCode)}.`);
      assert(selectionCandidateCount(runNextWaitingByChange.payload) === 0, "run_next changeId scope must not select MR-wait tasks as Ready primary candidates.");
      assertNoProgressClaims(runNextWaitingByChange.payload, "changeId scoped MR-wait run_next");

      const runNextDependentByChange = await executePluginTool(tools, "autopilot_run_next", { changeId: "change-dependent" });
      assert(runNextDependentByChange.payload.reasonCode === "no_actionable_tasks", `Expected changeId scoped dependency-blocked task to return no_actionable_tasks, got ${String(runNextDependentByChange.payload.reasonCode)}.`);
      assert((runNextDependentByChange.payload.selection as Record<string, unknown>).selectedTaskId == null, "run_next changeId scope must not select dependency-blocked tasks as Ready primary candidates.");
      assert(selectionCandidateCount(runNextDependentByChange.payload) === 1, "run_next changeId scope must expose dependency-blocked candidate evidence.");
      assertNoProgressClaims(runNextDependentByChange.payload, "changeId scoped dependency-blocked run_next");

      const runNextSatisfiedByChange = await executePluginTool(tools, "autopilot_run_next", { changeId: "change-dependent-satisfied" });
      assert(runNextSatisfiedByChange.payload.reasonCode === "ready_runtime_deferred", `Expected changeId scoped dependency-satisfied task to return ready_runtime_deferred, got ${String(runNextSatisfiedByChange.payload.reasonCode)}.`);
      assert((runNextSatisfiedByChange.payload.selection as Record<string, unknown>).selectedTaskId === "task-dependent-satisfied", "run_next changeId scope must select dependency-satisfied Ready task using full ledger graph.");
      assertNoProgressClaims(runNextSatisfiedByChange.payload, "changeId scoped dependency-satisfied run_next");

      const runNextByTask = await executePluginTool(tools, "autopilot_run_next", { taskId: "task-b" });
      assert(taskIds(runNextByTask.payload).join(",") === "task-b", `run_next taskId scope must select only task-b, got ${taskIds(runNextByTask.payload).join(",")}.`);
      assert(runNextByTask.payload.reasonCode === "waiting_for_mr", `Expected scoped waiting task to stop at waiting_for_mr, got ${String(runNextByTask.payload.reasonCode)}.`);
      assert(((runNextByTask.payload.selection as Record<string, unknown>).candidates as unknown[]).length === 0, "run_next taskId scope must not select MR-wait tasks as Ready primary candidates.");
      assertNoProgressClaims(runNextByTask.payload, "scoped MR-wait run_next");

      const runNextByInvalidTask = await executePluginTool(tools, "autopilot_run_next", { taskId: "task-invalid" });
      assert(runNextByInvalidTask.payload.reasonCode === "invalid_ledgers", `Expected scoped invalid task to return invalid_ledgers, got ${String(runNextByInvalidTask.payload.reasonCode)}.`);
      assert(selectionCandidateCount(runNextByInvalidTask.payload) === 0, "run_next taskId scope must not select invalid tasks as Ready primary candidates.");
      assertNoProgressClaims(runNextByInvalidTask.payload, "scoped invalid run_next");

      const runNextByBlockedTask = await executePluginTool(tools, "autopilot_run_next", { taskId: "task-blocked" });
      assert(runNextByBlockedTask.payload.reasonCode === "blocked_for_user", `Expected scoped blocked task to return blocked_for_user, got ${String(runNextByBlockedTask.payload.reasonCode)}.`);
      assert(selectionCandidateCount(runNextByBlockedTask.payload) === 0, "run_next taskId scope must not select blocked tasks as Ready primary candidates.");
      assertNoProgressClaims(runNextByBlockedTask.payload, "scoped blocked run_next");

      const runNextByDependentTask = await executePluginTool(tools, "autopilot_run_next", { taskId: "task-dependent" });
      assert(runNextByDependentTask.payload.reasonCode === "no_actionable_tasks", `Expected scoped dependency-blocked task to return no_actionable_tasks, got ${String(runNextByDependentTask.payload.reasonCode)}.`);
      assert((runNextByDependentTask.payload.selection as Record<string, unknown>).selectedTaskId == null, "run_next taskId scope must not select dependency-blocked tasks as Ready primary candidates.");
      assert(selectionCandidateCount(runNextByDependentTask.payload) === 1, "run_next taskId scope must expose dependency-blocked candidate evidence.");
      assertNoProgressClaims(runNextByDependentTask.payload, "scoped dependency-blocked run_next");

      const runNextBySatisfiedTask = await executePluginTool(tools, "autopilot_run_next", { taskId: "task-dependent-satisfied" });
      assert(runNextBySatisfiedTask.payload.reasonCode === "ready_runtime_deferred", `Expected scoped dependency-satisfied task to return ready_runtime_deferred, got ${String(runNextBySatisfiedTask.payload.reasonCode)}.`);
      assert((runNextBySatisfiedTask.payload.selection as Record<string, unknown>).selectedTaskId === "task-dependent-satisfied", "run_next taskId scope must select dependency-satisfied Ready task using full ledger graph.");
      assertNoProgressClaims(runNextBySatisfiedTask.payload, "scoped dependency-satisfied run_next");

      const runNextByReadyTask = await executePluginTool(tools, "autopilot_run_next", { taskId: "task-c" });
      assert(taskIds(runNextByReadyTask.payload).join(",") === "task-c", `run_next Ready taskId scope must select only task-c, got ${taskIds(runNextByReadyTask.payload).join(",")}.`);
      assert((runNextByReadyTask.payload.selection as Record<string, unknown>).selectedTaskId === "task-c", "run_next Ready taskId scope must expose selected task-c in selection evidence.");
      assertNoProgressClaims(runNextByReadyTask.payload, "scoped Ready run_next");

      const runNextMismatch = await executePluginTool(tools, "autopilot_run_next", { changeId: "change-a", taskId: "task-b" });
      assert(runNextMismatch.payload.reasonCode === "no_ledgers", `Expected mismatched run_next filters to return no_ledgers, got ${String(runNextMismatch.payload.reasonCode)}.`);
      assert(taskIds(runNextMismatch.payload).length === 0, `Mismatched run_next filters must select no task, got ${taskIds(runNextMismatch.payload).join(",")}.`);

      const runNext = await executePluginTool(tools, "autopilot_run_next", { changeId: "change-a", taskId: "task-a" });
      assert(runNext.payload.reasonCode === "ready_runtime_deferred", `Expected scoped run_next ready_runtime_deferred, got ${String(runNext.payload.reasonCode)}.`);
      assertLoopGuard(runNext.payload, "autopilot_run_next");
      assert(taskIds(runNext.payload).join(",") === "task-a", `run_next scope must select only task-a, got ${taskIds(runNext.payload).join(",")}.`);
      assert((runNext.payload.selection as Record<string, unknown>).selectedTaskId === "task-a", "run_next combined scope must expose selected task-a in selection evidence.");
      assertNoProgressClaims(runNext.payload, "scoped Ready combined run_next");

      const claimingTools = await pluginTools(repo, { runtimeState: { claimReadyTasks: true } });
      const claimedRunNext = await executePluginTool(claimingTools, "autopilot_run_next", { changeId: "change-a", taskId: "task-a" });
      assert(claimedRunNext.payload.outcome === "advanced", `Expected plugin-owned claim mode to advance, got ${String(claimedRunNext.payload.outcome)}.`);
      assert(claimedRunNext.payload.reasonCode === "advanced", `Expected plugin-owned claim mode reason advanced, got ${String(claimedRunNext.payload.reasonCode)}.`);
      const starts = taskStarts(claimedRunNext.payload);
      assert(starts.length === 1, `Expected one started task in claim mode, got ${starts.length}.`);
      assert(starts[0]?.taskId === "task-a", `Expected claim mode to start task-a, got ${String(starts[0]?.taskId)}.`);
      assert((claimedRunNext.payload.selection as Record<string, unknown>).selectedTaskId === "task-a", "claimed run_next must preserve selected task-a evidence.");

      const status = await executePluginTool(tools, "autopilot_status", { changeId: "change-b" });
      assert(status.payload.reasonCode === "waiting_for_mr", `Expected scoped status waiting_for_mr, got ${String(status.payload.reasonCode)}.`);
      assert(taskIds(status.payload).join(",") === "task-b", `status scope must select only task-b, got ${taskIds(status.payload).join(",")}.`);

      const collect = await executePluginTool(tools, "autopilot_collect", { taskId: "task-b" });
      assert(collect.payload.reasonCode === "collect_deferred", `Expected collect_deferred, got ${String(collect.payload.reasonCode)}.`);
      assert(taskIds(collect.payload).join(",") === "task-b", `collect taskId scope must select only task-b, got ${taskIds(collect.payload).join(",")}.`);
      assertLoopGuard(collect.payload, "autopilot_collect");
      assertNoProgressClaims(collect.payload, "collect");

      const toolsWithWorkerReport = await pluginTools(repo, {
        runtimeState: {
          workerReports: [
            {
              reportId: "report-ready-analyze",
              taskId: "task-a",
              fromStatus: "Ready",
              toStatus: "Analyze",
              completedAt: "2026-06-10T00:00:00.000Z",
              workerId: "worker-1",
              evidence: { workerSummary: "Ready task claimed for analysis." },
            },
          ],
        },
      });
      const collectedReport = await executePluginTool(toolsWithWorkerReport, "autopilot_collect", { taskId: "task-a" });
      assert(collectedReport.payload.outcome === "advanced", `Expected collect with legal worker report to advance, got ${String(collectedReport.payload.outcome)}.`);
      assert(collectedReport.payload.reasonCode === "advanced", `Expected collect with legal worker report reason advanced, got ${String(collectedReport.payload.reasonCode)}.`);
      const advancements = taskAdvancements(collectedReport.payload);
      assert(advancements.length === 1, `Expected one collect advancement, got ${advancements.length}.`);
      assert(advancements[0]?.taskId === "task-a", `Expected collect advancement for task-a, got ${String(advancements[0]?.taskId)}.`);
      assert(advancements[0]?.from === "Ready" && advancements[0]?.to === "Analyze", `Expected Ready -> Analyze advancement, got ${String(advancements[0]?.from)} -> ${String(advancements[0]?.to)}.`);

      const toolsWithConflictingReport = await pluginTools(repo, {
        runtimeState: {
          workerReports: [
            {
              reportId: "report-stale-status",
              taskId: "task-a",
              fromStatus: "Implementation",
              toStatus: "Review",
              completedAt: "2026-06-10T00:01:00.000Z",
              workerId: "worker-1",
            },
          ],
        },
      });
      const conflictingReport = await executePluginTool(toolsWithConflictingReport, "autopilot_collect", { taskId: "task-a" });
      assert(conflictingReport.payload.outcome === "failed", `Expected conflicting worker report to fail, got ${String(conflictingReport.payload.outcome)}.`);
      assert(conflictingReport.payload.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${String(conflictingReport.payload.reasonCode)}.`);
      assert(taskAdvancements(conflictingReport.payload).length === 0, "conflicting worker report must not claim task advancement.");
      assert(JSON.stringify(conflictingReport.payload.blockers).includes("report-stale-status"), "conflicting worker report output must include report evidence.");

      const unknownAnswer = await executePluginTool(tools, "autopilot_answer_blocker", {
        questionId: "unknown-question",
        taskId: ignoredAnswerTaskId,
        selectedLabel: ignoredSelectedLabel,
        action: ignoredAction,
      });
      assert(unknownAnswer.payload.outcome === "failed", `Expected unknown blocker answer to fail, got ${String(unknownAnswer.payload.outcome)}.`);
      assert(unknownAnswer.payload.reasonCode === "blocked_for_user", `Expected unknown blocker answer blocked_for_user reason, got ${String(unknownAnswer.payload.reasonCode)}.`);
      assert(String(unknownAnswer.payload.summary).includes("unknown-question"), "unknown blocker answer must name the rejected questionId.");
      assert(selectionCandidateCount(unknownAnswer.payload) === 0, "unknown blocker answer must not expose selection candidates.");
      assertNoProgressClaims(unknownAnswer.payload, "unknown answer_blocker");

      const toolsWithPendingQuestion = await pluginTools(repo, {
        runtimeState: {
          blockerQuestions: [
            { questionId: "question-1", taskId: "task-blocked", options: [{ label: "Proceed", action: "continue" }] },
          ],
        },
      });

      const mismatchedAnswer = await executePluginTool(toolsWithPendingQuestion, "autopilot_answer_blocker", {
        questionId: "question-1",
        taskId: "task-blocked",
        selectedLabel: ignoredSelectedLabel,
        action: ignoredAction,
      });
      assert(mismatchedAnswer.payload.outcome === "failed", `Expected mismatched blocker answer to fail, got ${String(mismatchedAnswer.payload.outcome)}.`);
      assert(mismatchedAnswer.payload.reasonCode === "blocked_for_user", `Expected mismatched blocker answer blocked_for_user reason, got ${String(mismatchedAnswer.payload.reasonCode)}.`);
      assert(String(mismatchedAnswer.payload.summary).includes("question-1"), "mismatched blocker answer must name the rejected questionId.");
      assert(selectionCandidateCount(mismatchedAnswer.payload) === 0, "mismatched blocker answer must not expose selection candidates.");
      assertNoProgressClaims(mismatchedAnswer.payload, "mismatched answer_blocker");

      const answer = await executePluginTool(toolsWithPendingQuestion, "autopilot_answer_blocker", {
        questionId: "question-1",
        taskId: "task-blocked",
        selectedLabel: "Proceed",
        action: "continue",
      });
      assert(answer.payload.reasonCode === "blocked_for_user", `Expected answer blocker blocked_for_user acknowledgement, got ${String(answer.payload.reasonCode)}.`);
      assert(String(answer.payload.summary).includes("question-1"), "answer_blocker must acknowledge the required questionId argument.");
      assertArgumentContext(answer.metadata, {
        acknowledged: ["questionId", "taskId", "selectedLabel", "action"],
        ignored: [],
        mutation: "none",
      });
      assert(answer.payload.nextRecommendedCall === "autopilot_status", "answer_blocker no-op acknowledgement must recommend status.");
      assert(taskIds(answer.payload).length === 0, "answer_blocker MVP no-op must not claim task summaries were changed.");
      assertLoopGuard(answer.payload, "autopilot_answer_blocker");
      assertNoProgressClaims(answer.payload, "answer_blocker");

      const stop = await executePluginTool(tools, "autopilot_stop", { target: "task", id: ignoredStopId, reason: ignoredStopReason });
      assertStopNoop(stop, { acknowledged: ["target"], ignored: ["id", "reason"] }, "stop without active runtime state");
      assert(String(stop.payload.summary).includes("stop target task"), "stop must acknowledge the target argument.");
      assert(!JSON.stringify(stop).includes(ignoredStopId), "stop MVP no-op output must not leak ignored id or imply task mutation.");
      assert(!JSON.stringify(stop).includes(ignoredStopReason), "stop MVP no-op output must not leak ignored reason.");
      assert(stop.payload.nextRecommendedCall === "autopilot_status", "stop no-op acknowledgement must recommend status.");
      assert(taskIds(stop.payload).length === 0, "stop MVP no-op must not claim task summaries were changed.");
      assertLoopGuard(stop.payload, "autopilot_stop");

      const activeTaskStopTools = await pluginTools(repo, { runtimeState: { activeRun: { runId: "run-1", taskIds: ["task-active", "task-other"] } } });
      const activeStop = await executePluginTool(activeTaskStopTools, "autopilot_stop", { target: "task", id: "task-active", reason: ignoredStopReason });
      assertStopApplied(activeStop, [{ target: "task", taskId: "task-active", runId: "run-1" }], { acknowledged: ["target", "id"], ignored: ["reason"] }, "active task stop");
      const repeatedStop = await executePluginTool(activeTaskStopTools, "autopilot_stop", { target: "task", id: "task-active", reason: ignoredStopReason });
      assertStopNoop(repeatedStop, { acknowledged: ["target"], ignored: ["id", "reason"] }, "repeated active task stop");
      const preservedTaskStop = await executePluginTool(activeTaskStopTools, "autopilot_stop", { target: "task", id: "task-other", reason: ignoredStopReason });
      assertStopApplied(preservedTaskStop, [{ target: "task", taskId: "task-other", runId: "run-1" }], { acknowledged: ["target", "id"], ignored: ["reason"] }, "preserved second task stop");

      const wrongTaskStopTools = await pluginTools(repo, { runtimeState: { activeRun: { runId: "run-2", taskIds: ["task-active"] } } });
      const wrongTaskStop = await executePluginTool(wrongTaskStopTools, "autopilot_stop", { target: "task", id: "missing-task", reason: ignoredStopReason });
      assertStopNoop(wrongTaskStop, { acknowledged: ["target"], ignored: ["id", "reason"] }, "wrong task id stop");
      const taskAfterWrongStop = await executePluginTool(wrongTaskStopTools, "autopilot_stop", { target: "task", id: "task-active", reason: ignoredStopReason });
      assertStopApplied(taskAfterWrongStop, [{ target: "task", taskId: "task-active", runId: "run-2" }], { acknowledged: ["target", "id"], ignored: ["reason"] }, "task stop after wrong id no-op");

      const runStopTools = await pluginTools(repo, { runtimeState: { activeRun: { runId: "run-3", taskIds: ["task-a", "task-b"] } } });
      const wrongRunStop = await executePluginTool(runStopTools, "autopilot_stop", { target: "run", id: "missing-run", reason: ignoredStopReason });
      assertStopNoop(wrongRunStop, { acknowledged: ["target"], ignored: ["id", "reason"] }, "wrong run id stop");
      const activeRunStop = await executePluginTool(runStopTools, "autopilot_stop", { target: "run", id: "run-3", reason: ignoredStopReason });
      assertStopApplied(activeRunStop, [{ target: "run", runId: "run-3" }], { acknowledged: ["target", "id"], ignored: ["reason"] }, "active run stop");
      const repeatedRunStop = await executePluginTool(runStopTools, "autopilot_stop", { target: "run", id: "run-3", reason: ignoredStopReason });
      assertStopNoop(repeatedRunStop, { acknowledged: ["target"], ignored: ["id", "reason"] }, "repeated active run stop");

      const allStopTools = await pluginTools(repo, { runtimeState: { activeRun: { runId: "run-4", taskIds: ["task-a", "task-b"] } } });
      const activeAllStop = await executePluginTool(allStopTools, "autopilot_stop", { target: "all", id: ignoredStopId, reason: ignoredStopReason });
      assertStopApplied(activeAllStop, [{ target: "run", runId: "run-4" }, { target: "task", taskId: "task-a" }, { target: "task", taskId: "task-b" }], { acknowledged: ["target"], ignored: ["id", "reason"] }, "active all stop");
      assert(!JSON.stringify(activeAllStop).includes(ignoredStopId), "active all stop must not leak ignored id value.");
      const repeatedAllStop = await executePluginTool(allStopTools, "autopilot_stop", { target: "all", id: ignoredStopId, reason: ignoredStopReason });
      assertStopNoop(repeatedAllStop, { acknowledged: ["target"], ignored: ["id", "reason"] }, "repeated active all stop");

      const after = snapshotFiles(repo);
      assert(JSON.stringify(after) === JSON.stringify(before), "MVP plugin tools must not create, delete, or mutate temp repo files in this runtime-deferred/no-op slice.");
    }),
  },
];

let failed = 0;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} autopilot contract test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot contract tests=${tests.length}`);
