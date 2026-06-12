#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTaskLedger } from "./autopilot-ledger.ts";
import { createAutopilotController } from "./openspec-autopilot-controller.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function withTempRepo(name: string, run: (repo: string) => void | Promise<void>): Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `autopilot-materialization-${name}-`));
  return Promise.resolve(run(repo)).finally(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });
}

function writeTasks(repo: string, changeId: string, markdown: string, options: { archived?: boolean } = {}): void {
  const base = options.archived === true ? path.join(repo, "openspec", "changes", "archive", changeId) : path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, "tasks.md"), markdown.replace(/\r\n/g, "\n"), "utf8");
}

function writeTasksAtRoot(repo: string, ledgerRoot: string, changeId: string, markdown: string): void {
  const base = path.join(repo, ...ledgerRoot.split("/"), changeId);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, "tasks.md"), markdown.replace(/\r\n/g, "\n"), "utf8");
}

function writeTasksDirectory(repo: string, changeId: string): void {
  fs.mkdirSync(path.join(repo, "openspec", "changes", changeId, "tasks.md"), { recursive: true });
}

function writePackageJson(repo: string): void {
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({
    scripts: {
      validate: "node tools/validate-library.ts",
      test: "node tools/test-library.ts",
      "openspec:validate": "openspec validate --all",
      "autopilot:validate": "node tools/autopilot-ledger.ts",
    },
  }, null, 2), "utf8");
}

function writeLedger(repo: string, changeId: string, ledger: Record<string, unknown>): void {
  const filePath = ledgerPath(repo, changeId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8")) as Record<string, unknown>;
}

function readyResearchLedger(id: string): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = id;
  ledger.status = "Ready";
  ledger.history = [];
  ledger.mr = { required: true, status: "none" };
  return ledger;
}

function ledgerPath(repo: string, changeId: string): string {
  return path.join(repo, "openspec", "changes", changeId, "automation", "task.json");
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function snapshotFiles(rootPath: string, relativePath = ""): string[] {
  const current = path.join(rootPath, relativePath);
  if (!fs.existsSync(current)) {
    return [];
  }
  return fs.readdirSync(current, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const entryRelativePath = path.join(relativePath, entry.name);
      const normalized = entryRelativePath.split(path.sep).join("/");
      const entryPath = path.join(rootPath, entryRelativePath);
      if (entry.isDirectory()) {
        return [`${normalized}/\n<DIR>`, ...snapshotFiles(rootPath, entryRelativePath)];
      }
      return [`${normalized}\n${fs.readFileSync(entryPath, "utf8")}`];
    });
}

function trySymlinkDirectory(target: string, linkPath: string): boolean {
  try {
    fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch {
    return false;
  }
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

function assertLedgerMaterializedOutput(output: Record<string, unknown>, expected: { changeId: string; path: string; candidates?: Array<{ taskId: string; pathSuffix: string; selected: boolean; rank: number }> }): void {
  assert(output.reasonCode === "ledger_materialized", `Expected ledger_materialized, got ${String(output.reasonCode)}.`);
  assert(output.outcome === "advanced", `Expected advanced outcome, got ${String(output.outcome)}.`);
  assert(taskStarts(output).length === 0, "Materialization must not claim implementation workers.");
  const advancements = taskAdvancements(output);
  assert(advancements.length === 1, `Expected one materialization advancement, got ${advancements.length}.`);
  const advancement = advancements[0] as Record<string, unknown>;
  assert(advancement.action === "materialized-ledger", `Expected materialized-ledger action, got ${String(advancement.action)}.`);
  assert(advancement.taskId === expected.changeId, `Expected taskId ${expected.changeId}, got ${String(advancement.taskId)}.`);
  assert(advancement.changeId === expected.changeId, `Expected changeId ${expected.changeId}, got ${String(advancement.changeId)}.`);
  assert(advancement.path === expected.path, `Expected ledger path ${expected.path}, got ${String(advancement.path)}.`);
  assert(advancement.mutation === "plugin-owned-protected-ledger", `Expected protected ledger mutation evidence, got ${String(advancement.mutation)}.`);
  const validation = advancement.validation as Record<string, unknown> | undefined;
  assert(validation?.valid === true, "Materialization advancement must include validation.valid=true.");
  assert(Array.isArray(validation.warnings), "Materialization advancement must include validation warnings array.");
  assert(Array.isArray(output.taskSummaries), "taskSummaries must be an array.");
  const summary = (output.taskSummaries as Array<Record<string, unknown>>)[0];
  assert(summary?.taskId === expected.changeId, `Expected task summary id ${expected.changeId}, got ${String(summary?.taskId)}.`);
  assert(summary?.sourceKind === "ledger", `Expected ledger-backed summary, got ${String(summary?.sourceKind)}.`);
  assert(summary?.status === "Ready", `Expected Ready summary, got ${String(summary?.status)}.`);
  const selection = output.selection as Record<string, unknown>;
  assert(selection.selectedTaskId === expected.changeId, "Selection must preserve selected materialized task id.");
  if (expected.candidates != null) {
    const candidates = selection.candidates as Array<Record<string, unknown>>;
    assert(Array.isArray(candidates), "Selection candidates must be an array.");
    assert(candidates.length === expected.candidates.length, `Expected ${expected.candidates.length} selection candidates, got ${candidates.length}.`);
    for (const [index, candidate] of expected.candidates.entries()) {
      const actual = candidates[index] as Record<string, unknown> | undefined;
      assert(actual?.taskId === candidate.taskId, `Expected candidate ${index} taskId ${candidate.taskId}, got ${String(actual?.taskId)}.`);
      assert(String(actual?.path).endsWith(candidate.pathSuffix), `Expected candidate ${index} path suffix ${candidate.pathSuffix}, got ${String(actual?.path)}.`);
      assert(actual?.selected === candidate.selected, `Expected candidate ${index} selected=${String(candidate.selected)}, got ${String(actual?.selected)}.`);
      assert(actual?.rank === candidate.rank, `Expected candidate ${index} rank=${candidate.rank}, got ${String(actual?.rank)}.`);
    }
  }
  const nextAction = (output.nextActions as Array<Record<string, unknown>>)[0] as Record<string, unknown> | undefined;
  assert(nextAction?.tool === "autopilot_run_next", "Next action must allow a follow-up ledger-backed run.");
  assert((nextAction.args as Record<string, unknown> | undefined)?.changeId === expected.changeId, "Next action must scope follow-up run to the materialized changeId.");
  const loopGuard = output.loopGuard as Record<string, unknown>;
  assert(loopGuard.repeatedNoProgress === false, "Materialization loopGuard must not mark repeated no-progress.");
  assert(loopGuard.suppressRepeatRecommendation === false, "Materialization loopGuard must allow returned safe follow-up.");
}

function assertNpmLedgerValidation(ledgerFile: string): void {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm", "run", "autopilot:validate", "--", ledgerFile] : ["run", "autopilot:validate", "--", ledgerFile];
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", shell: false });
  if (result.error) {
    throw result.error;
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert(result.status === 0, `npm run autopilot:validate must accept the materialized ledger.\n${output}`);
  assert(output.includes('"valid": true'), `autopilot:validate output must report valid=true.\n${output}`);
}

const tests: TestCase[] = [
  {
    name: "explicit runNext materializes deterministic selected active change",
    run: () => withTempRepo("selected-primary", async (repo) => {
      writePackageJson(repo);
      writeTasks(repo, "z-change", "# Tasks\n\n- [ ] Later task\n");
      writeTasks(repo, "a-change", "# Tasks\n\n- [ ] First task\n- [x] Done task\n");
      const controller = createAutopilotController({ root: repo });

      const result = await controller.runNext({}, { kind: "model-tool", name: "autopilot_run_next" });
      assertLedgerMaterializedOutput(result.payload as unknown as Record<string, unknown>, {
        changeId: "a-change",
        path: "openspec/changes/a-change/automation/task.json",
        candidates: [
          { taskId: "a-change", pathSuffix: "automation/task.json", selected: true, rank: 1 },
          { taskId: "z-change", pathSuffix: "tasks.md", selected: false, rank: 2 },
        ],
      });
      assert(fs.existsSync(ledgerPath(repo, "a-change")), "Selected active change must receive automation/task.json.");
      assert(!fs.existsSync(ledgerPath(repo, "z-change")), "Non-selected active change must not be materialized by the same serial run.");

      const ledger = readJson(ledgerPath(repo, "a-change"));
      const validation = validateTaskLedger(ledger, { sourcePath: "openspec/changes/a-change/automation/task.json" });
      assert(validation.valid, `Materialized ledger must validate: ${validation.errors.join("; ")}`);
      assertNpmLedgerValidation(ledgerPath(repo, "a-change"));
      assert(ledger.id === "a-change", `Expected ledger id a-change, got ${String(ledger.id)}.`);
      assert(ledger.status === "Ready", `Expected Ready status, got ${String(ledger.status)}.`);
      const validationCommands = (((ledger.validation as Record<string, unknown>).commands as Array<Record<string, unknown>>) ?? []).map((command) => String(command.command));
      assert(validationCommands.includes("npm run validate"), "Materializer must include available validate script.");
      assert(validationCommands.includes("npm test"), "Materializer must include available test script.");
      assert(validationCommands.includes("npm run openspec:validate"), "Materializer must include available OpenSpec validation script.");
      assert(validationCommands.includes("npm run autopilot:validate -- openspec/changes/a-change/automation/task.json"), "Materializer must include scoped ledger validation script.");

      const followUp = await controller.runNext({ changeId: "a-change" }, { kind: "model-tool", name: "autopilot_run_next" });
      assert(followUp.payload.reasonCode === "ready_runtime_deferred", `Expected follow-up ready_runtime_deferred, got ${followUp.payload.reasonCode}.`);
      assert(followUp.payload.taskSummaries[0]?.sourceKind === "ledger", "Follow-up run must use ledger-backed summary.");
    }),
  },
  {
    name: "prompt-resolved changeId materializes resolved change instead of unrelated queue",
    run: () => withTempRepo("prompt-resolved", async (repo) => {
      writeTasks(repo, "a-unrelated-change", "# Tasks\n\n- [ ] Unrelated active task\n");
      writeTasks(repo, "resolved-change", "# Tasks\n\n- [ ] Prompt-resolved task\n");
      const controller = createAutopilotController({ root: repo });

      const result = await controller.runNext({ changeId: "resolved-change" }, { kind: "model-tool", name: "autopilot_run_next" });
      assertLedgerMaterializedOutput(result.payload as unknown as Record<string, unknown>, { changeId: "resolved-change", path: "openspec/changes/resolved-change/automation/task.json", candidates: [{ taskId: "resolved-change", pathSuffix: "automation/task.json", selected: true, rank: 1 }] });
      assert(fs.existsSync(ledgerPath(repo, "resolved-change")), "Prompt-resolved changeId must receive automation/task.json.");
      assert(!fs.existsSync(ledgerPath(repo, "a-unrelated-change")), "Prompt-resolved run must not materialize unrelated active queue primary.");
    }),
  },
  {
    name: "custom ledgerRoot materialization derives custom scope paths",
    run: () => withTempRepo("custom-root", async (repo) => {
      writeTasksAtRoot(repo, "custom/changes", "custom-change", "# Tasks\n\n- [ ] Custom root task\n");
      const controller = createAutopilotController({ root: repo }, { ledgerRoot: "custom/changes" });

      const result = await controller.runNext({}, { kind: "model-tool", name: "autopilot_run_next" });
      assertLedgerMaterializedOutput(result.payload as unknown as Record<string, unknown>, { changeId: "custom-change", path: "custom/changes/custom-change/automation/task.json", candidates: [{ taskId: "custom-change", pathSuffix: "automation/task.json", selected: true, rank: 1 }] });
      const ledger = readJson(path.join(repo, "custom", "changes", "custom-change", "automation", "task.json"));
      const scope = ledger.scope as Record<string, unknown>;
      assert(Array.isArray(scope.read) && scope.read.includes("custom/changes/custom-change/**"), "Custom root ledger read scope must use custom ledgerRoot.");
      assert(Array.isArray(scope.write) && scope.write.includes("custom/changes/custom-change/**"), "Custom root ledger write scope must use custom ledgerRoot.");
      assert(Array.isArray(scope.forbidden) && scope.forbidden.includes("custom/changes/*/automation/**"), "Custom root ledger forbidden scope must include custom protected automation path.");
      const validationCommands = (((ledger.validation as Record<string, unknown>).commands as Array<Record<string, unknown>>) ?? []).map((command) => String(command.command));
      assert(validationCommands.includes("npm run autopilot:validate -- custom/changes/custom-change/automation/task.json") === false, "Custom root without package.json must not invent validation commands.");
    }),
  },
  {
    name: "custom ledgerRoot validation command uses custom ledger path",
    run: () => withTempRepo("custom-root-validation", async (repo) => {
      writePackageJson(repo);
      writeTasksAtRoot(repo, "custom/changes", "custom-change", "# Tasks\n\n- [ ] Custom root task\n");
      const controller = createAutopilotController({ root: repo }, { ledgerRoot: "custom/changes" });

      await controller.runNext({}, { kind: "model-tool", name: "autopilot_run_next" });
      const ledger = readJson(path.join(repo, "custom", "changes", "custom-change", "automation", "task.json"));
      const validationCommands = (((ledger.validation as Record<string, unknown>).commands as Array<Record<string, unknown>>) ?? []).map((command) => String(command.command));
      assert(validationCommands.includes("npm run autopilot:validate -- custom/changes/custom-change/automation/task.json"), "Custom root validation command must use custom materialized ledger path.");
    }),
  },
  {
    name: "read-only tools do not materialize active changes",
    run: () => withTempRepo("read-only", async (repo) => {
      writeTasks(repo, "active-change", "# Tasks\n\n- [ ] Active task\n");
      const controller = createAutopilotController({ root: repo });
      const before = snapshotFiles(repo);

      const status = await controller.status({}, { kind: "model-tool", name: "autopilot_status" });
      assert(status.payload.reasonCode === "active_change_handoff", `Expected status handoff, got ${status.payload.reasonCode}.`);
      await controller.collect({}, { kind: "model-tool", name: "autopilot_collect" });
      await controller.answerBlocker({ questionId: "missing-question" }, { kind: "model-tool", name: "autopilot_answer_blocker" });
      await controller.stop({ target: "run" }, { kind: "model-tool", name: "autopilot_stop" });

      const after = snapshotFiles(repo);
      assert(JSON.stringify(after) === JSON.stringify(before), "Read-only/non-run tools must not create or mutate automation/task.json.");
    }),
  },
  {
    name: "existing ledgers remain authoritative and are not overwritten",
    run: () => withTempRepo("existing-ledger", async (repo) => {
      const existing = readyResearchLedger("existing-task");
      writeTasks(repo, "existing-change", "# Tasks\n\n- [ ] Active task\n");
      writeLedger(repo, "existing-change", existing);
      const before = snapshotFiles(repo);
      const controller = createAutopilotController({ root: repo });

      const result = await controller.runNext({ changeId: "existing-change" }, { kind: "model-tool", name: "autopilot_run_next" });
      assert(result.payload.reasonCode === "ready_runtime_deferred", `Expected existing ledger-backed behavior, got ${result.payload.reasonCode}.`);
      assert(JSON.stringify(snapshotFiles(repo)) === JSON.stringify(before), "Existing automation/task.json must not be overwritten or regenerated.");
    }),
  },
  {
    name: "unsupported scoped changes report cause evidence without publishing a ledger",
    run: () => withTempRepo("unsupported", async (repo) => {
      writeTasks(repo, "complete-change", "# Tasks\n\n- [x] Done task\n");
      writeTasks(repo, "archived-change", "# Tasks\n\n- [ ] Archived task\n", { archived: true });
      writeTasksDirectory(repo, "tasks-directory-change");
      const controller = createAutopilotController({ root: repo });

      const cases = [
        { changeId: "missing-change", reason: "has no tasks.md", pathSuffix: "openspec/changes/missing-change/tasks.md" },
        { changeId: "complete-change", reason: "has no unchecked tasks", pathSuffix: "openspec/changes/complete-change/tasks.md" },
        { changeId: "archived-change", reason: "is archived", pathSuffix: "openspec/changes/archive/archived-change/tasks.md" },
        { changeId: "tasks-directory-change", reason: "invalid active OpenSpec change tasks", pathSuffix: "openspec/changes/tasks-directory-change/tasks.md" },
        { changeId: "../unsafe-change", reason: "unsafe or unsupported", pathSuffix: undefined },
      ];
      for (const { changeId, reason, pathSuffix } of cases) {
        const result = await controller.runNext({ changeId }, { kind: "model-tool", name: "autopilot_run_next" });
        assert(result.payload.reasonCode === "invalid_ledgers", `Expected ${changeId} invalid_ledgers, got ${result.payload.reasonCode}.`);
        assert(result.payload.blockers.length > 0, `${changeId} must include materialization blocker evidence.`);
        const blocker = result.payload.blockers[0];
        assert(blocker?.reason.includes(reason), `Expected ${changeId} blocker reason to include ${reason}, got ${String(blocker?.reason)}.`);
        if (pathSuffix != null) {
          assert(blocker?.path?.endsWith(pathSuffix), `Expected ${changeId} blocker path suffix ${pathSuffix}, got ${String(blocker?.path)}.`);
        }
        assert(!fs.existsSync(ledgerPath(repo, changeId)), `${changeId} must not receive a materialized ledger.`);
      }
    }),
  },
  {
    name: "unreadable active tasks report cause evidence without publishing a ledger",
    run: () => withTempRepo("unreadable-tasks", async (repo) => {
      writeTasks(repo, "unreadable-change", "# Tasks\n\n- [ ] Unreadable task\n");
      const originalReadFileSync = fs.readFileSync;
      fs.readFileSync = ((filePath: fs.PathOrFileDescriptor, options?: unknown) => {
        if (typeof filePath === "string" && filePath.endsWith(path.join("unreadable-change", "tasks.md"))) {
          throw new Error("simulated unreadable tasks.md");
        }
        return originalReadFileSync(filePath, options as never);
      }) as typeof fs.readFileSync;
      try {
        const controller = createAutopilotController({ root: repo });
        const result = await controller.runNext({ changeId: "unreadable-change" }, { kind: "model-tool", name: "autopilot_run_next" });
        assert(result.payload.reasonCode === "invalid_ledgers", `Expected unreadable tasks invalid_ledgers, got ${result.payload.reasonCode}.`);
        const blocker = result.payload.blockers[0];
        assert(blocker?.reason === "invalid active OpenSpec change tasks", `Expected invalid active tasks blocker, got ${String(blocker?.reason)}.`);
        assert(blocker?.errors?.some((error) => error.includes("simulated unreadable tasks.md")) === true, "Unreadable tasks blocker must include read failure evidence.");
        assert(!fs.existsSync(ledgerPath(repo, "unreadable-change")), "Unreadable tasks must not receive a materialized ledger.");
      } finally {
        fs.readFileSync = originalReadFileSync;
      }
    }),
  },
  {
    name: "publication failure cleans materializer temp file without final ledger",
    run: () => withTempRepo("publish-failure", async (repo) => {
      writeTasks(repo, "publish-failure-change", "# Tasks\n\n- [ ] Publish failure task\n");
      const originalLinkSync = fs.linkSync;
      fs.linkSync = (() => {
        const error = new Error("simulated link failure") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }) as typeof fs.linkSync;
      try {
        const controller = createAutopilotController({ root: repo });
        const result = await controller.runNext({ changeId: "publish-failure-change" }, { kind: "model-tool", name: "autopilot_run_next" });
        assert(result.payload.reasonCode === "invalid_ledgers", `Expected publish failure invalid_ledgers, got ${result.payload.reasonCode}.`);
        assert(result.payload.blockers[0]?.reason.includes("Failed to publish materialized task ledger"), `Expected publish failure blocker, got ${String(result.payload.blockers[0]?.reason)}.`);
        assert(!fs.existsSync(ledgerPath(repo, "publish-failure-change")), "Failed publication must not leave final task.json.");
        const automationDir = path.join(repo, "openspec", "changes", "publish-failure-change", "automation");
        const tempFiles = fs.existsSync(automationDir) ? fs.readdirSync(automationDir).filter((entry) => entry.includes("materializing")) : [];
        assert(tempFiles.length === 0, `Failed publication must clean materializer-owned temp files, found ${tempFiles.join(", ")}.`);
      } finally {
        fs.linkSync = originalLinkSync;
      }
    }),
  },
  {
    name: "ledgerRoot symlink or junction does not redirect materialized ledger writes",
    run: () => withTempRepo("ledger-root-symlink", async (repo) => {
      const outsideParent = fs.mkdtempSync(path.join(os.tmpdir(), "autopilot-outside-changes-"));
      try {
        const outsideChanges = path.join(outsideParent, "changes");
        fs.mkdirSync(path.join(repo, "openspec"), { recursive: true });
        fs.mkdirSync(path.join(outsideChanges, "escape-change"), { recursive: true });
        fs.writeFileSync(path.join(outsideChanges, "escape-change", "tasks.md"), "# Tasks\n\n- [ ] Escape task\n", "utf8");
        assert(trySymlinkDirectory(outsideChanges, path.join(repo, "openspec", "changes")), "Test requires directory symlink/junction support for ledgerRoot guard.");
        const controller = createAutopilotController({ root: repo });

        const result = await controller.runNext({ changeId: "escape-change" }, { kind: "model-tool", name: "autopilot_run_next" });
        assert(result.payload.reasonCode === "invalid_ledgers", `Expected ledger root symlink blocker, got ${result.payload.reasonCode}.`);
        assert(result.payload.blockers.some((blocker) => blocker.reason.includes("ledger root must not be a symlink")), "Ledger root symlink run must include symlink blocker evidence.");
        assert(!fs.existsSync(path.join(outsideChanges, "escape-change", "automation", "task.json")), "Materializer must not write through ledgerRoot symlink/junction.");
      } finally {
        fs.rmSync(outsideParent, { recursive: true, force: true });
      }
    }),
  },
  {
    name: "custom ledgerRoot symlink or junction does not redirect materialized ledger writes",
    run: () => withTempRepo("custom-root-symlink", async (repo) => {
      const outsideParent = fs.mkdtempSync(path.join(os.tmpdir(), "autopilot-outside-custom-changes-"));
      try {
        const outsideChanges = path.join(outsideParent, "changes");
        fs.mkdirSync(path.join(repo, "custom"), { recursive: true });
        fs.mkdirSync(path.join(outsideChanges, "escape-change"), { recursive: true });
        fs.writeFileSync(path.join(outsideChanges, "escape-change", "tasks.md"), "# Tasks\n\n- [ ] Escape task\n", "utf8");
        assert(trySymlinkDirectory(outsideChanges, path.join(repo, "custom", "changes")), "Test requires directory symlink/junction support for custom ledgerRoot guard.");
        const controller = createAutopilotController({ root: repo }, { ledgerRoot: "custom/changes" });

        const result = await controller.runNext({ changeId: "escape-change" }, { kind: "model-tool", name: "autopilot_run_next" });
        assert(result.payload.reasonCode === "invalid_ledgers", `Expected custom ledger root symlink blocker, got ${result.payload.reasonCode}.`);
        assert(result.payload.blockers.some((blocker) => blocker.reason.includes("ledger root must not be a symlink")), "Custom ledger root symlink run must include symlink blocker evidence.");
        assert(!fs.existsSync(path.join(outsideChanges, "escape-change", "automation", "task.json")), "Materializer must not write through custom ledgerRoot symlink/junction.");
      } finally {
        fs.rmSync(outsideParent, { recursive: true, force: true });
      }
    }),
  },
  {
    name: "automation symlink or junction does not redirect materialized ledger writes",
    run: () => withTempRepo("automation-symlink", async (repo) => {
      writeTasks(repo, "symlink-change", "# Tasks\n\n- [ ] Symlink task\n");
      const outside = path.join(repo, "outside-target");
      const automation = path.join(repo, "openspec", "changes", "symlink-change", "automation");
      fs.mkdirSync(outside, { recursive: true });
      assert(trySymlinkDirectory(outside, automation), "Test requires directory symlink/junction support for automation guard.");
      const controller = createAutopilotController({ root: repo });

      const result = await controller.runNext({ changeId: "symlink-change" }, { kind: "model-tool", name: "autopilot_run_next" });
      assert(result.payload.reasonCode === "invalid_ledgers", `Expected symlink blocker, got ${result.payload.reasonCode}.`);
      assert(result.payload.blockers.some((blocker) => blocker.reason.includes("symlink") || blocker.reason.includes("escapes")), "Symlink/junction run must include path safety blocker evidence.");
      assert(!fs.existsSync(path.join(outside, "task.json")), "Materializer must not write task.json through automation symlink/junction.");
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
    console.error(`FAIL ${test.name}`);
    console.error(message);
  }
}

if (failed > 0) {
  process.exitCode = 1;
}
