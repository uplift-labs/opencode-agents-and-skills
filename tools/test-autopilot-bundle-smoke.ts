#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { autopilotToolNames } from "./autopilot-contract.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

type PluginToolResult = {
  output: string;
  metadata?: Record<string, unknown>;
};

type PluginToolDefinition = {
  execute: (args: Record<string, unknown>, context?: unknown) => Promise<string | PluginToolResult>;
};

type PluginHooks = {
  tool?: Record<string, PluginToolDefinition>;
  event?: (input: { event: { type: string; properties?: Record<string, unknown> } }) => Promise<void> | void;
  "tool.execute.before"?: (input: { tool: string; sessionID: string; callID: string }, output: { args: Record<string, unknown> }) => Promise<void> | void;
  "tool.execute.after"?: (input: { tool: string; sessionID: string; callID: string; args: Record<string, unknown> }, output: unknown) => Promise<void> | void;
};

type TuiCommand = {
  name: string;
  run: () => void | Promise<void>;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = path.join(root, ".opencode", "plugins", "openspec-autopilot.ts");
const tuiPluginPath = path.join(root, ".opencode", "tui-plugins", "openspec-autopilot-tui.ts");
const requiredBundleFiles = [
  ".opencode/skills/openspec-autopilot/SKILL.md",
  ".opencode/plugins/openspec-autopilot.ts",
  ".opencode/tui-plugins/openspec-autopilot-tui.ts",
  ".opencode/package.json",
  "opencode.json",
] as const;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function toRepoRelative(filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function assertFileExists(relativePath: string): void {
  const filePath = path.join(root, relativePath);
  assert(fs.existsSync(filePath) && fs.statSync(filePath).isFile(), `Required Autopilot bundle file is missing: ${relativePath}`);
}

function readReadmeBundleSection(): string {
  const readme = readText("README.md");
  const start = readme.indexOf("Autopilot MVP bundle:");
  assert(start >= 0, "README must document the Autopilot MVP bundle.");
  const rest = readme.slice(start);
  const end = rest.indexOf("Rollback is the reverse operation");
  assert(end >= 0, "README Autopilot MVP bundle section must end before rollback guidance.");
  return rest.slice(0, end);
}

function readReadmeSection(heading: string): string {
  const readme = readText("README.md");
  const start = readme.indexOf(`${heading}\n`);
  assert(start >= 0, `README must document ${heading}.`);
  const rest = readme.slice(start + heading.length + 1);
  const end = rest.search(/^##\s+/m);
  return end >= 0 ? rest.slice(0, end) : rest;
}

function assertReadmeDocuments(relativePath: string, bundleSection: string): void {
  assert(bundleSection.includes(relativePath), `README Autopilot MVP bundle must document ${relativePath}.`);
}

function assertReadmeDocumentsPluginDependencyInstall(bundleSection: string): void {
  assert(bundleSection.includes("@opencode-ai/plugin"), "README Autopilot MVP bundle must name the plugin runtime dependency.");
  assert(
    /(?:install|package)[^\n.]*@opencode-ai\/plugin|@opencode-ai\/plugin[^\n.]*?(?:install|package|bundled equivalent)/i.test(bundleSection),
    "README Autopilot MVP bundle must explain installing or packaging @opencode-ai/plugin for target projects.",
  );
  assert(
    /Only merge `command\.autopilot`[^\n.]*Autopilot skill and plugin bundle are available/i.test(bundleSection),
    "README Autopilot MVP bundle must condition command.autopilot on the Autopilot skill and plugin bundle being available.",
  );
}

function assertReadmeDocumentsValidationGates(validateSection: string): void {
  assert(validateSection.includes("npm run openspec:validate"), "README Validate section must document the openspec:validate package script.");
  assert(validateSection.includes("node tools/test-autopilot-bundle-smoke.ts"), "README Validate section must document the direct Autopilot bundle smoke command.");
  assert(validateSection.includes("node tools/autopilot-report-freshness.ts"), "README Validate section must document the Autopilot report freshness helper command.");
  assert(validateSection.includes("--mode archive-strict"), "README Validate section must document archive-strict freshness mode.");
}

function relativeImportSpecifiers(sourceText: string): string[] {
  const specifiers = new Set<string>();
  for (const match of sourceText.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    if (match[1].startsWith(".")) {
      specifiers.add(match[1]);
    }
  }
  for (const match of sourceText.matchAll(/\bimport\s+["']([^"']+)["']/g)) {
    if (match[1].startsWith(".")) {
      specifiers.add(match[1]);
    }
  }
  return Array.from(specifiers).sort();
}

function resolveImport(fromFile: string, specifier: string): string {
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  if (path.extname(resolved)) {
    return resolved;
  }
  return `${resolved}.ts`;
}

function collectRelativeImportClosure(entrypoint: string): string[] {
  const pending = [entrypoint];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop() as string;
    const normalized = path.resolve(current);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    assert(fs.existsSync(normalized) && fs.statSync(normalized).isFile(), `Plugin import path does not resolve to a file: ${toRepoRelative(normalized)}`);
    const text = fs.readFileSync(normalized, "utf8");
    for (const specifier of relativeImportSpecifiers(text)) {
      pending.push(resolveImport(normalized, specifier));
    }
  }
  return Array.from(seen).map(toRepoRelative).sort();
}

function readJsonRecord(relativePath: string): Record<string, unknown> {
  const parsed = JSON.parse(readText(relativePath)) as unknown;
  assert(typeof parsed === "object" && parsed != null && !Array.isArray(parsed), `${relativePath} must contain a JSON object.`);
  return parsed as Record<string, unknown>;
}

function assertSkillContract(): void {
  const skill = readText(".opencode/skills/openspec-autopilot/SKILL.md");
  assert(/^name:\s*openspec-autopilot$/m.test(skill), "Autopilot skill frontmatter must declare name: openspec-autopilot.");
  assert(/description:\s*.+autopilot/i.test(skill), "Autopilot skill frontmatter must keep an Autopilot trigger description.");
}

function assertPluginPackageContract(): void {
  const packageJson = readJsonRecord(".opencode/package.json");
  const dependencies = packageJson.dependencies;
  assert(typeof dependencies === "object" && dependencies != null && !Array.isArray(dependencies), ".opencode/package.json must define dependencies.");
  const pluginDependency = (dependencies as Record<string, unknown>)["@opencode-ai/plugin"];
  assert(typeof pluginDependency === "string" && pluginDependency.trim().length > 0, ".opencode/package.json must depend on @opencode-ai/plugin for local plugin loading.");
}

function assertAutopilotCommandContract(): void {
  const config = readJsonRecord("opencode.json");
  const command = config.command;
  assert(typeof command === "object" && command != null && !Array.isArray(command), "opencode.json must define command map.");
  const autopilot = (command as Record<string, unknown>).autopilot;
  assert(typeof autopilot === "object" && autopilot != null && !Array.isArray(autopilot), "opencode.json must define command.autopilot.");
  const template = (autopilot as Record<string, unknown>).template;
  assert(typeof template === "string" && template.includes("autopilot_run_next"), "command.autopilot.template must route to autopilot_run_next.");
  assert(template.includes("$ARGUMENTS"), "command.autopilot.template must preserve user-supplied scope arguments.");
}

function withTempRepo(name: string, run: (repo: string) => void | Promise<void>): Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-autopilot-bundle-${name}-`));
  return Promise.resolve(run(repo)).finally(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });
}

function writeTasks(repo: string, changeId: string): void {
  const filePath = path.join(repo, "openspec", "changes", changeId, "tasks.md");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "# Tasks\n\n- [ ] Next task\n", "utf8");
}

function acceptanceResearchLedger(id: string): Record<string, unknown> {
  const ledger = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "autopilot-ledger", "valid-research.json"), "utf8")) as Record<string, unknown>;
  ledger.id = id;
  ledger.scope = {
    read: ["docs/**", "openspec/**"],
    write: [`openspec/changes/${id}/**`],
    forbidden: ["src/**", "openspec/changes/*/automation/**", ".autopilot/**"],
  };
  ledger.mr = {
    required: false,
    status: "not-required",
    noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR.",
  };
  return ledger;
}

function readyResearchLedger(id: string, priority = "medium"): Record<string, unknown> {
  const ledger = acceptanceResearchLedger(id);
  ledger.status = "Ready";
  ledger.priority = priority;
  ledger.history = [];
  ledger.mr = { required: true, status: "none" };
  return ledger;
}

function writeLedger(repo: string, changeId: string, ledger: Record<string, unknown>): void {
  const filePath = path.join(repo, "openspec", "changes", changeId, "automation", "task.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function importPlugin(filePath: string): Promise<Record<string, unknown>> {
  const imported = await import(pathToFileURL(filePath).href) as { default?: unknown };
  assert(typeof imported.default === "object" && imported.default != null && !Array.isArray(imported.default), `${toRepoRelative(filePath)} default export must be an object.`);
  return imported.default as Record<string, unknown>;
}

async function importAutopilotPlugin(): Promise<{ id?: unknown; server?: unknown; tui?: unknown }> {
  const imported = await import(pathToFileURL(pluginPath).href) as { default?: unknown };
  assert(typeof imported.default === "object" && imported.default != null && !Array.isArray(imported.default), "Autopilot plugin default export must be an object.");
  return imported.default as { id?: unknown; server?: unknown; tui?: unknown };
}

async function importAutopilotTuiPlugin(): Promise<{ id?: unknown; server?: unknown; tui?: unknown }> {
  const imported = await import(pathToFileURL(tuiPluginPath).href) as { default?: unknown };
  assert(typeof imported.default === "object" && imported.default != null && !Array.isArray(imported.default), "Autopilot TUI plugin default export must be an object.");
  return imported.default as { id?: unknown; server?: unknown; tui?: unknown };
}

function tuiCommandsFrom(layers: Array<{ commands?: unknown }>): TuiCommand[] {
  return layers.flatMap((layer) => Array.isArray(layer.commands) ? layer.commands : []).map((command) => {
    assert(typeof command === "object" && command != null && !Array.isArray(command), "TUI command must be an object.");
    const record = command as Record<string, unknown>;
    assert(typeof record.name === "string", "TUI command must have a string name.");
    assert(typeof record.run === "function", `TUI command ${record.name} must have a run function.`);
    return { name: record.name, run: record.run as () => void | Promise<void> };
  });
}

const tests: TestCase[] = [
  {
    name: "README bundle documents every source-equivalent plugin dependency",
    run: () => {
      const bundleSection = readReadmeBundleSection();
      for (const relativePath of requiredBundleFiles) {
        assertFileExists(relativePath);
        assertReadmeDocuments(relativePath, bundleSection);
      }
      for (const entrypoint of [pluginPath, tuiPluginPath]) {
        for (const relativePath of collectRelativeImportClosure(entrypoint)) {
          assertFileExists(relativePath);
          if (relativePath.startsWith("tools/")) {
            assertReadmeDocuments(relativePath, bundleSection);
          }
        }
      }
      assertReadmeDocumentsPluginDependencyInstall(bundleSection);
    },
  },
  {
    name: "Autopilot bundle has skill package and command contracts",
    run: () => {
      assertSkillContract();
      assertPluginPackageContract();
      assertAutopilotCommandContract();
    },
  },
  {
    name: "Autopilot plugin entrypoints are loader-compatible",
    run: async () => {
      const serverPlugin = await importPlugin(pluginPath);
      const tuiPlugin = await importPlugin(tuiPluginPath);
      assert(typeof serverPlugin.id === "string" && serverPlugin.id === "openspec.autopilot", "Autopilot server plugin id must stay stable for loader diagnostics.");
      assert(typeof serverPlugin.server === "function", "Autopilot server entrypoint must expose server.");
      assert(serverPlugin.tui == null, "Autopilot server entrypoint must not also expose tui; OpenCode rejects default plugin objects with both server and tui.");
      assert(typeof tuiPlugin.id === "string" && tuiPlugin.id === "openspec.autopilot.tui", "Autopilot TUI plugin id must be distinct and stable.");
      assert(typeof tuiPlugin.tui === "function", "Autopilot TUI entrypoint must expose tui.");
      assert(tuiPlugin.server == null, "Autopilot TUI entrypoint must not also expose server; OpenCode rejects default plugin objects with both server and tui.");
    },
  },
  {
    name: "README validation section documents Autopilot contract gates",
    run: () => {
      assertReadmeDocumentsValidationGates(readReadmeSection("## Validate"));
    },
  },
  {
    name: "source-equivalent Autopilot plugin imports and executes status tool",
    run: () => withTempRepo("execute-status", async (repo) => {
      const plugin = await importAutopilotPlugin();
      assert(plugin.id === "openspec.autopilot", "Autopilot plugin id must be stable for loader diagnostics.");
      assert(typeof plugin.server === "function", "Autopilot plugin must expose a server plugin entrypoint.");
      const hooks = await plugin.server({ directory: repo, worktree: repo }, undefined) as { tool?: Record<string, PluginToolDefinition> };
      assert(typeof hooks.tool === "object" && hooks.tool != null && !Array.isArray(hooks.tool), "Autopilot plugin server must return tool definitions.");
      assert(JSON.stringify(Object.keys(hooks.tool).sort()) === JSON.stringify([...autopilotToolNames].sort()), "Autopilot plugin server must expose every public autopilot_* tool.");
      const result = await hooks.tool.autopilot_status.execute({});
      assert(typeof result === "object" && result != null && !Array.isArray(result), "autopilot_status must return structured tool output.");
      const payload = JSON.parse(result.output) as Record<string, unknown>;
      assert(payload.reasonCode === "no_ledgers", "source-equivalent status smoke should run without ledgers and return no_ledgers.");
      assert(Array.isArray(payload.nextActions), "source-equivalent status smoke must include current output shape.");
    }),
  },
  {
    name: "source-equivalent event hook schedules observe file status without run-next",
    run: () => withTempRepo("event-file-status", async (repo) => {
      writeTasks(repo, "trigger-change");
      const plugin = await importAutopilotPlugin();
      const logs: Array<Record<string, unknown>> = [];
      const hooks = await plugin.server(
        {
          directory: repo,
          worktree: repo,
          client: { app: { log: async (entry: { body: Record<string, unknown> }) => logs.push(entry.body) } },
        },
        { triggers: { fileWatch: { debounceMs: 1, cooldownMs: 1 } } },
      ) as PluginHooks;
      assert(typeof hooks.event === "function", "Autopilot plugin must expose an event hook for programmatic triggers.");
      await hooks.event({ event: { type: "file.watcher.updated", properties: { file: path.join(repo, "openspec", "changes", "trigger-change", "tasks.md"), event: "change" } } });
      await waitFor(() => logs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "status"), "observe file status trigger log");
      assert(!logs.some((log) => (log.extra as Record<string, unknown> | undefined)?.jobKind === "run_next"), "Passive file event must not schedule run_next.");
    }),
  },
  {
    name: "source-equivalent invalid triggers shape disables event jobs but keeps write gates",
    run: () => withTempRepo("invalid-triggers-shape", async (repo) => {
      writeTasks(repo, "trigger-change");
      const plugin = await importAutopilotPlugin();
      const logs: Array<Record<string, unknown>> = [];
      const hooks = await plugin.server(
        {
          directory: repo,
          worktree: repo,
          client: { app: { log: async (entry: { body: Record<string, unknown> }) => logs.push(entry.body) } },
        },
        { triggers: false, runtimeState: { activeRun: { runId: "run-1", taskIds: ["task-runtime-state"] } } },
      ) as PluginHooks;
      assert(typeof hooks.event === "function", "Autopilot plugin must still expose event hook for invalid trigger shape.");
      assert(typeof hooks["tool.execute.after"] === "function", "Autopilot plugin must still expose tool after hook for invalid trigger shape.");
      assert(typeof hooks["tool.execute.before"] === "function", "Autopilot plugin must still expose before hook for write gates.");

      await hooks.event({ event: { type: "file.watcher.updated", properties: { file: path.join(repo, "openspec", "changes", "trigger-change", "tasks.md"), event: "change" } } });
      await hooks["tool.execute.after"](
        { tool: "autopilot_run_next", sessionID: "session-1", callID: "call-advanced", args: {} },
        { output: JSON.stringify({ reasonCode: "ledger_materialized", tasksAdvanced: [{ taskId: "trigger-change", changeId: "trigger-change" }] }) },
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      assert(!logs.some((log) => log.message === "trigger job enqueued" || log.message === "trigger job completed"), "Invalid top-level triggers shape must not enqueue or run event-driven jobs.");

      let protectedBlocked = false;
      try {
        await hooks["tool.execute.before"]({ tool: "write", sessionID: "main-session", callID: "invalid-triggers-protected" }, { args: { filePath: "openspec/changes/trigger-change/automation/task.json", content: "{}" } });
      } catch (error) {
        protectedBlocked = error instanceof Error && error.message.includes("protected Autopilot state");
      }
      assert(protectedBlocked, "Invalid top-level triggers shape must keep protected-path guard enabled.");

      let activeBlocked = false;
      try {
        await hooks["tool.execute.before"]({ tool: "write", sessionID: "main-session", callID: "invalid-triggers-active" }, { args: { filePath: "docs/out.md", content: "x" } });
      } catch (error) {
        activeBlocked = error instanceof Error && error.message.includes("active write ownership");
      }
      assert(activeBlocked, "Invalid top-level triggers shape must keep active-lock guard enabled.");
    }),
  },
  {
    name: "source-equivalent tool after hook schedules cheap checkpoint without no-progress loop",
    run: () => withTempRepo("tool-after-checkpoint", async (repo) => {
      writeTasks(repo, "trigger-change");
      const plugin = await importAutopilotPlugin();
      const logs: Array<Record<string, unknown>> = [];
      const hooks = await plugin.server(
        {
          directory: repo,
          worktree: repo,
          client: { app: { log: async (entry: { body: Record<string, unknown> }) => logs.push(entry.body) } },
        },
        { triggers: { postToolCheckpoints: { debounceMs: 1, cooldownMs: 1 } } },
      ) as PluginHooks;
      assert(typeof hooks["tool.execute.after"] === "function", "Autopilot plugin must expose a tool.execute.after hook for post-tool checkpoints.");
      await hooks["tool.execute.after"](
        { tool: "autopilot_run_next", sessionID: "session-1", callID: "call-advanced", args: {} },
        { output: JSON.stringify({ reasonCode: "ledger_materialized", tasksAdvanced: [{ taskId: "trigger-change", changeId: "trigger-change" }] }) },
      );
      await waitFor(() => logs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "check"), "post-tool checkpoint log");
      const completedAfterProgress = logs.filter((log) => log.message === "trigger job completed").length;
      await hooks["tool.execute.after"](
        { tool: "autopilot_run_next", sessionID: "session-1", callID: "call-no-progress", args: {} },
        { output: JSON.stringify({ reasonCode: "ready_runtime_deferred", loopGuard: { repeatedNoProgress: true, suppressRepeatRecommendation: true } }) },
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert(logs.filter((log) => log.message === "trigger job completed").length === completedAfterProgress, "No-progress output must not schedule another checkpoint loop.");
      assert(!logs.some((log) => (log.extra as Record<string, unknown> | undefined)?.jobKind === "run_next"), "Post-tool checkpoint must not repeat run_next.");
    }),
  },
  {
    name: "source-equivalent before hook blocks direct protected Autopilot writes",
    run: () => withTempRepo("before-protected-guard", async (repo) => {
      const plugin = await importAutopilotPlugin();
      const hooks = await plugin.server({ directory: repo, worktree: repo }, { triggers: { protectedPathGuard: { enabled: true } } }) as PluginHooks;
      assert(typeof hooks["tool.execute.before"] === "function", "Autopilot plugin must expose a tool.execute.before protected-path guard.");
      let blocked = false;
      try {
        await hooks["tool.execute.before"](
          { tool: "apply_patch", sessionID: "session-1", callID: "call-guard" },
          { args: { patchText: "*** Begin Patch\n*** Update File: openspec/changes/change-a/automation/task.json\n@@\n-{}\n+{}\n*** End Patch" } },
        );
      } catch (error) {
        blocked = error instanceof Error && error.message.includes("protected Autopilot state");
      }
      assert(blocked, "Protected-path guard must block apply_patch writes to automation/task.json.");

      for (const [tool, args] of [
        ["bash", { command: "Set-Content task.json '{}'", cwd: "openspec/changes/change-a/automation" }],
        ["future_write_tool", { target: "openspec/changes/change-a/automation/runtime.json", content: "{}" }],
        ["serena_execute_shell_command", { command: "Set-Content openspec/changes/change-a/automation/task.json '{}'" }],
      ] as const) {
        let protectedWriteBlocked = false;
        try {
          await hooks["tool.execute.before"]({ tool, sessionID: "session-1", callID: `call-${tool}` }, { args });
        } catch (error) {
          protectedWriteBlocked = error instanceof Error && error.message.includes("protected Autopilot state");
        }
        assert(protectedWriteBlocked, `Protected-path guard must block ${tool} protected writes.`);
      }

      await hooks["tool.execute.before"](
        { tool: "apply_patch", sessionID: "session-1", callID: "call-safe" },
        { args: { patchText: "*** Begin Patch\n*** Update File: openspec/changes/change-a/tasks.md\n@@\n-- [ ] Task\n+- [x] Task\n*** End Patch" } },
      );
    }),
  },
  {
    name: "source-equivalent before hook blocks in-memory active ownership",
    run: () => withTempRepo("before-runtime-state-active-lock", async (repo) => {
      const plugin = await importAutopilotPlugin();
      const hooks = await plugin.server({ directory: repo, worktree: repo }, { runtimeState: { activeRun: { runId: "run-1", taskIds: ["task-runtime-state"] } } }) as PluginHooks;
      assert(typeof hooks["tool.execute.before"] === "function", "Autopilot plugin must expose before hook for runtimeState active lock.");
      let blocked = false;
      try {
        await hooks["tool.execute.before"]({ tool: "write", sessionID: "main-session", callID: "runtime-state-active-lock" }, { args: { filePath: "docs/out.md", content: "x" } });
      } catch (error) {
        blocked = error instanceof Error && error.message.includes("active write ownership");
      }
      assert(blocked, "In-memory runtimeState active ownership must block main-session ordinary writes.");
    }),
  },
  {
    name: "source-equivalent before hook loads durable active ownership without worker dispatch",
    run: () => withTempRepo("before-durable-active-lock", async (repo) => {
      const runtimePath = path.join(repo, ".autopilot", "runtime", "state.json");
      fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
      fs.writeFileSync(runtimePath, JSON.stringify({
        schemaVersion: 1,
        consumedWorkerReportIds: [],
        runs: {
          "run-1": {
            runId: "run-1",
            status: "running",
            createdAt: "2026-06-10T00:00:00.000Z",
            updatedAt: "2026-06-10T00:00:01.000Z",
            taskId: "task-durable",
            ledgerPath: "openspec/changes/durable/automation/task.json",
            fromStatus: "Implementation",
            expectedReportId: "report-1",
            workerId: "worker-1",
            workerSessionId: "worker-session-1",
            scope: { read: ["docs/**"], write: ["docs/allowed/**"], forbidden: ["openspec/changes/*/automation/**", ".autopilot/**"] },
          },
        },
      }, null, 2), "utf8");
      const plugin = await importAutopilotPlugin();
      const hooks = await plugin.server({ directory: repo, worktree: repo }, { triggers: { triggerMode: "observe" } }) as PluginHooks;
      assert(typeof hooks["tool.execute.before"] === "function", "Autopilot plugin must expose before hook for durable active lock.");

      let blockedMain = false;
      try {
        await hooks["tool.execute.before"]({ tool: "write", sessionID: "main-session", callID: "durable-main-lock" }, { args: { filePath: "docs/out.md", content: "x" } });
      } catch (error) {
        blockedMain = error instanceof Error && error.message.includes("active write ownership");
      }
      assert(blockedMain, "Durable runtime active ownership must block main-session writes even when workerDispatch is disabled.");

      await hooks["tool.execute.before"]({ tool: "write", sessionID: "worker-session-1", callID: "durable-worker-scope-allow" }, { args: { filePath: "docs/allowed/out.md", content: "x" } });
      let blockedWorker = false;
      try {
        await hooks["tool.execute.before"]({ tool: "write", sessionID: "worker-session-1", callID: "durable-worker-scope" }, { args: { filePath: "docs/out.md", content: "x" } });
      } catch (error) {
        blockedWorker = error instanceof Error && error.message.includes("worker scope boundaries");
      }
      assert(blockedWorker, "Durable runtime worker scope must be enforced even when workerDispatch is disabled.");
    }),
  },
  {
    name: "source-equivalent worker idle trigger collects owned report once",
    run: () => withTempRepo("worker-idle-collect", async (repo) => {
      writeLedger(repo, "worker-change", acceptanceResearchLedger("worker-task"));
      const runtimeState = {
        workerSessions: [{ sessionID: "worker-session-1", taskId: "worker-task", reportId: "worker-report-1", status: "idle" }],
        workerReports: [{
          reportId: "worker-report-1",
          taskId: "worker-task",
          fromStatus: "Acceptance",
          toStatus: "Done",
          completedAt: "2026-06-12T00:00:00.000Z",
          evidence: { noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR." },
        }],
      };
      const plugin = await importAutopilotPlugin();
      const logs: Array<Record<string, unknown>> = [];
      const hooks = await plugin.server(
        {
          directory: repo,
          worktree: repo,
          client: { app: { log: async (entry: { body: Record<string, unknown> }) => logs.push(entry.body) } },
        },
        { runtimeState, triggers: { triggerMode: "controlled", workerCollect: { debounceMs: 1 } } },
      ) as PluginHooks;
      assert(typeof hooks.event === "function", "Autopilot plugin must expose event hook for worker idle collection.");
      await hooks.event({ event: { type: "session.status", properties: { sessionID: "worker-session-1", status: { type: "idle" } } } });
      await waitFor(
        () => logs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "collect" && (log.extra as Record<string, unknown> | undefined)?.reasonCode === "advanced"),
        "owned worker collect trigger log",
      );
      const completedAfterFirstIdle = logs.filter((log) => log.message === "trigger job completed").length;
      assert(JSON.stringify(runtimeState).includes("worker-report-1"), "Runtime state should retain consumed report evidence after collect.");

      await new Promise((resolve) => setTimeout(resolve, 1050));
      await hooks.event({ event: { type: "session.status", properties: { sessionID: "worker-session-1", status: { type: "idle" } } } });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert(logs.filter((log) => log.message === "trigger job completed").length === completedAfterFirstIdle, "Repeated idle for consumed report must not schedule another collect job.");
    }),
  },
  {
    name: "source-equivalent runtime-owned jobs revalidate before execution",
    run: () => withTempRepo("runtime-revalidation", async (repo) => {
      writeLedger(repo, "worker-change", acceptanceResearchLedger("worker-task"));
      const workerRuntimeState = {
        workerSessions: [{ sessionID: "worker-session-1", taskId: "worker-task", reportId: "worker-report-1", status: "idle", reportConsumed: false }],
        workerReports: [{ reportId: "worker-report-1", taskId: "worker-task", fromStatus: "Acceptance", toStatus: "Done", completedAt: "2026-06-12T00:00:00.000Z", evidence: { noMrPolicy: "Research-only artifact accepted without MR." } }],
      };
      const plugin = await importAutopilotPlugin();
      const workerLogs: Array<Record<string, unknown>> = [];
      const workerHooks = await plugin.server(
        { directory: repo, worktree: repo, client: { app: { log: async (entry: { body: Record<string, unknown> }) => workerLogs.push(entry.body) } } },
        { runtimeState: workerRuntimeState, triggers: { triggerMode: "controlled", workerCollect: { debounceMs: 25 } } },
      ) as PluginHooks;
      await workerHooks.event?.({ event: { type: "session.status", properties: { sessionID: "worker-session-1", status: { type: "idle" } } } });
      workerRuntimeState.workerSessions[0].reportConsumed = true;
      await waitFor(
        () => workerLogs.some((log) => log.message === "trigger job suppressed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "collect"),
        "stale collect suppression log",
      );
      assert(!workerLogs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "collect"), "Stale worker collect must not reach the controller.");

      const runRuntimeState = { activeRun: { runId: "run-1", taskIds: ["task-a"], sessionIDs: ["session-1"], locksValid: true, blockers: false, lastRunNextOutput: { reasonCode: "advanced" } } };
      const runLogs: Array<Record<string, unknown>> = [];
      const runHooks = await plugin.server(
        { directory: repo, worktree: repo, client: { app: { log: async (entry: { body: Record<string, unknown> }) => runLogs.push(entry.body) } } },
        { runtimeState: runRuntimeState, triggers: { triggerMode: "autonomous", runNextEvents: { enabled: true, cooldownMs: 1 } } },
      ) as PluginHooks;
      await runHooks.event?.({ event: { type: "session.status", properties: { sessionID: "session-1", status: { type: "idle" } } } });
      runRuntimeState.activeRun.blockers = true;
      await waitFor(
        () => runLogs.some((log) => log.message === "trigger job suppressed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "run_next"),
        "stale run_next suppression log",
      );
      assert(!runLogs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "run_next"), "Stale autonomous run_next must not reach the controller.");
    }),
  },
  {
    name: "source-equivalent worker report marker before idle is collected after idle",
    run: () => withTempRepo("worker-marker-before-idle", async (repo) => {
      writeLedger(repo, "marker-change", acceptanceResearchLedger("marker-task"));
      const runtimeState = {
        workerSessions: [{ sessionID: "worker-session-2", taskId: "marker-task", status: "busy" }],
        workerReports: [{
          reportId: "marker-report-1",
          taskId: "marker-task",
          fromStatus: "Acceptance",
          toStatus: "Done",
          completedAt: "2026-06-12T00:01:00.000Z",
          evidence: { noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR." },
        }],
      };
      const plugin = await importAutopilotPlugin();
      const logs: Array<Record<string, unknown>> = [];
      const hooks = await plugin.server(
        {
          directory: repo,
          worktree: repo,
          client: { app: { log: async (entry: { body: Record<string, unknown> }) => logs.push(entry.body) } },
        },
        { runtimeState, triggers: { triggerMode: "controlled", workerCollect: { debounceMs: 1 } } },
      ) as PluginHooks;
      assert(typeof hooks.event === "function", "Autopilot plugin must expose event hook for marker-before-idle collection.");
      await hooks.event({ event: { type: "message.part.updated", properties: { sessionID: "worker-session-2", reportId: "marker-report-1", complete: true, part: { type: "text", text: "AUTOPILOT_WORKER_REPORT marker-report-1 COMPLETE" } } } });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert(!logs.some((log) => log.message === "trigger job completed"), "Busy report marker must not collect before idle.");

      await hooks.event({ event: { type: "session.status", properties: { sessionID: "worker-session-2", status: { type: "idle" } } } });
      await waitFor(
        () => logs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "collect" && (log.extra as Record<string, unknown> | undefined)?.reasonCode === "advanced"),
        "marker-before-idle collect trigger log",
      );
    }),
  },
  {
    name: "source-equivalent blocker and permission reply triggers require owned evidence",
    run: () => withTempRepo("blocker-permission-events", async (repo) => {
      const runtimeState = {
        blockerQuestions: [{
          requestID: "question-request-1",
          questionId: "question-1",
          taskId: "task-a",
          options: [{ label: "Proceed", action: "continue" }],
        }],
        pendingPermissions: [{ requestID: "permission-request-1", taskId: "task-a" }],
      };
      const plugin = await importAutopilotPlugin();
      const logs: Array<Record<string, unknown>> = [];
      const hooks = await plugin.server(
        {
          directory: repo,
          worktree: repo,
          client: { app: { log: async (entry: { body: Record<string, unknown> }) => logs.push(entry.body) } },
        },
        { runtimeState, triggers: { triggerMode: "controlled", blockerReplies: { enabled: true }, permissionReplies: { enabled: true } } },
      ) as PluginHooks;
      assert(typeof hooks.event === "function", "Autopilot plugin must expose event hook for blocker and permission replies.");

      await hooks.event({ event: { type: "question.replied", properties: { requestID: "question-request-1", answers: [["Proceed"]] } } });
      await waitFor(
        () => logs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "answer_blocker"),
        "owned blocker answer trigger log",
      );
      const blockerLog = logs.find((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "answer_blocker");
      assert((blockerLog?.extra as Record<string, unknown> | undefined)?.outcome === "idle", `Owned blocker answer should be accepted without failed validation, got ${JSON.stringify(blockerLog)}.`);
      await waitFor(
        () => logs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "status"),
        "owned blocker answer status follow-up log",
      );
      const completedAfterBlocker = logs.filter((log) => log.message === "trigger job completed").length;

      await hooks.event({ event: { type: "permission.replied", properties: { requestID: "permission-request-1", reply: "reject" } } });
      await waitFor(
        () => logs.filter((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "status").length >= 2,
        "owned permission reply status trigger log",
      );
      const completedAfterOwned = logs.filter((log) => log.message === "trigger job completed").length;
      assert(completedAfterOwned > completedAfterBlocker, "Permission reply should add its own status checkpoint after blocker status follow-up.");

      await hooks.event({ event: { type: "question.replied", properties: { requestID: "unknown-question", answers: [["Proceed"]] } } });
      await hooks.event({ event: { type: "permission.replied", properties: { requestID: "unknown-permission", reply: "once" } } });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert(logs.filter((log) => log.message === "trigger job completed").length === completedAfterOwned, "Unknown blocker/permission replies must not schedule Autopilot jobs.");
    }),
  },
  {
    name: "source-equivalent workspace and worktree triggers require owned waits",
    run: () => withTempRepo("workspace-worktree-events", async (repo) => {
      const runtimeState = {
        waitingWorkspaces: ["workspace-a"],
        waitingWorktrees: [{ name: "worktree-a", taskId: "task-a" }],
        activeRun: { runId: "run-1", taskIds: ["task-a", "task-b"], locksValid: true },
      };
      const plugin = await importAutopilotPlugin();
      const logs: Array<Record<string, unknown>> = [];
      const hooks = await plugin.server(
        {
          directory: repo,
          worktree: repo,
          client: { app: { log: async (entry: { body: Record<string, unknown> }) => logs.push(entry.body) } },
        },
        { runtimeState, triggers: { triggerMode: "controlled" } },
      ) as PluginHooks;
      assert(typeof hooks.event === "function", "Autopilot plugin must expose event hook for workspace/worktree events.");

      await hooks.event({ event: { type: "workspace.ready", properties: { name: "workspace-a" } } });
      await waitFor(
        () => logs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "status"),
        "owned workspace ready status trigger log",
      );
      await hooks.event({ event: { type: "worktree.failed", properties: { name: "worktree-a", message: "failed" } } });
      await waitFor(
        () => logs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "stop"),
        "owned worktree failed stop trigger log",
      );
      const taskStopLog = logs.find((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "stop");
      assert(JSON.stringify((taskStopLog?.extra as Record<string, unknown> | undefined)?.tasksAdvanced).includes("task-a"), `Worktree failed stop must target task-a, got ${JSON.stringify(taskStopLog)}.`);
      assert(JSON.stringify(runtimeState.activeRun?.taskIds) === JSON.stringify(["task-b"]), `Task-scoped stop must leave only task-b active, got ${JSON.stringify(runtimeState.activeRun)}.`);
      runtimeState.waitingWorkspaces = [{ name: "workspace-run", runId: "run-1" }];
      await hooks.event({ event: { type: "workspace.failed", properties: { name: "workspace-run", message: "failed" } } });
      await waitFor(
        () => logs.filter((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "stop").length >= 2,
        "owned workspace failed run stop trigger log",
      );
      const runStopLog = logs.filter((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "stop").at(-1);
      assert(JSON.stringify((runStopLog?.extra as Record<string, unknown> | undefined)?.tasksAdvanced).includes("run-1"), `Workspace failed stop must target run-1, got ${JSON.stringify(runStopLog)}.`);
      assert(runtimeState.activeRun == null, `Run-scoped stop must remove active run, got ${JSON.stringify(runtimeState.activeRun)}.`);
      const completedAfterOwned = logs.filter((log) => log.message === "trigger job completed").length;

      await hooks.event({ event: { type: "workspace.ready", properties: { name: "unknown-workspace" } } });
      await hooks.event({ event: { type: "worktree.ready", properties: { name: "unknown-worktree" } } });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert(logs.filter((log) => log.message === "trigger job completed").length === completedAfterOwned, "Unknown workspace/worktree events must not schedule Autopilot jobs.");
    }),
  },
  {
    name: "source-equivalent autonomous run-next trigger requires explicit owned prerequisites",
    run: () => withTempRepo("autonomous-run-next-events", async (repo) => {
      writeLedger(repo, "task-a", readyResearchLedger("task-a", "medium"));
      writeLedger(repo, "task-b", readyResearchLedger("task-b", "high"));
      const plugin = await importAutopilotPlugin();
      const disabledLogs: Array<Record<string, unknown>> = [];
      const disabledHooks = await plugin.server(
        { directory: repo, worktree: repo, client: { app: { log: async (entry: { body: Record<string, unknown> }) => disabledLogs.push(entry.body) } } },
        { runtimeState: { activeRun: { runId: "run-1", taskIds: ["task-a"], sessionIDs: ["session-1"], locksValid: true } }, triggers: { triggerMode: "autonomous", runNextEvents: { enabled: false } } },
      ) as PluginHooks;
      await disabledHooks.event?.({ event: { type: "session.status", properties: { sessionID: "session-1", status: { type: "idle" } } } });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert(!disabledLogs.some((log) => (log.extra as Record<string, unknown> | undefined)?.jobKind === "run_next"), "Disabled runNextEvents must not schedule run_next.");

      const blockedLogs: Array<Record<string, unknown>> = [];
      const blockedHooks = await plugin.server(
        { directory: repo, worktree: repo, client: { app: { log: async (entry: { body: Record<string, unknown> }) => blockedLogs.push(entry.body) } } },
        { runtimeState: { activeRun: { runId: "run-1", taskIds: ["task-a"], sessionIDs: ["session-1"], locksValid: true, blockers: true } }, triggers: { triggerMode: "autonomous", runNextEvents: { enabled: true, cooldownMs: 1 } } },
      ) as PluginHooks;
      await blockedHooks.event?.({ event: { type: "session.status", properties: { sessionID: "session-1", status: { type: "idle" } } } });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert(!blockedLogs.some((log) => (log.extra as Record<string, unknown> | undefined)?.jobKind === "run_next"), "Active blockers must suppress autonomous run_next.");

      const allowedLogs: Array<Record<string, unknown>> = [];
      const lastRunNextOutput = { reasonCode: "advanced", loopGuard: { repeatedNoProgress: false, suppressRepeatRecommendation: false } };
      const allowedRuntimeState = { activeRun: { runId: "run-1", taskIds: ["task-a"], sessionIDs: ["session-1"], locksValid: true, lastRunNextOutput } };
      const allowedHooks = await plugin.server(
        { directory: repo, worktree: repo, client: { app: { log: async (entry: { body: Record<string, unknown> }) => allowedLogs.push(entry.body) } } },
        { runtimeState: allowedRuntimeState, triggers: { triggerMode: "autonomous", runNextEvents: { enabled: true, cooldownMs: 1 } } },
      ) as PluginHooks;
      await allowedHooks.event?.({ event: { type: "session.status", properties: { sessionID: "session-1", status: { type: "idle" } } } });
      await waitFor(
        () => allowedLogs.some((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "run_next"),
        "eligible autonomous run_next trigger log",
      );
      const runLog = allowedLogs.find((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "run_next");
      assert(JSON.stringify((runLog?.extra as Record<string, unknown> | undefined)?.taskSummaryIds).includes("task-a"), `Autonomous run_next must inspect scoped task-a, got ${JSON.stringify(runLog)}.`);
      assert(!JSON.stringify((runLog?.extra as Record<string, unknown> | undefined)?.taskSummaryIds).includes("task-b"), `Autonomous run_next must not inspect higher-priority unscoped task-b, got ${JSON.stringify(runLog)}.`);
      assert(allowedRuntimeState.activeRun.lastRunNextOutput.reasonCode === "ready_runtime_deferred", `Autonomous run_next must refresh latest output evidence, got ${JSON.stringify(allowedRuntimeState.activeRun.lastRunNextOutput)}.`);
      const completedAfterFirstRun = allowedLogs.filter((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "run_next").length;
      await allowedHooks.event?.({ event: { type: "session.status", properties: { sessionID: "session-1", status: { type: "idle" } } } });
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert(allowedLogs.filter((log) => log.message === "trigger job completed" && (log.extra as Record<string, unknown> | undefined)?.jobKind === "run_next").length === completedAfterFirstRun, "Refreshed no-progress run_next output must suppress repeated autonomous idle events.");
    }),
  },
  {
    name: "source-equivalent TUI commands register zero-LLM status and check actions",
    run: () => withTempRepo("tui-commands", async (repo) => {
      writeTasks(repo, "tui-change");
      const plugin = await importAutopilotTuiPlugin() as { tui?: (api: unknown, options?: unknown) => Promise<void> | void };
      assert(typeof plugin.tui === "function", "Autopilot plugin must expose a TUI entrypoint for zero-LLM commands.");
      const layers: Array<{ commands?: unknown }> = [];
      const toasts: Array<{ message: string; variant?: string }> = [];
      const dialogs: unknown[] = [];
      const api = {
        state: { path: { directory: repo, worktree: repo } },
        keymap: { registerLayer: (layer: { commands?: unknown }) => layers.push(layer) },
        ui: {
          toast: (toast: { message: string; variant?: string }) => toasts.push(toast),
          dialog: { replace: (factory: () => unknown) => dialogs.push(factory()), clear: () => undefined },
          DialogPrompt: (input: unknown) => input,
        },
      };
      await plugin.tui(api);
      assert(layers.length === 0, "TUI commands should be disabled unless tuiCommands.enabled is true.");
      await plugin.tui(api, { triggers: { tuiCommands: { enabled: true } } });
      const commands = tuiCommandsFrom(layers);
      const names = commands.map((command) => command.name).sort();
      assert(JSON.stringify(names) === JSON.stringify(["autopilot.check", "autopilot.run", "autopilot.status", "autopilot.stop"]), `Unexpected TUI command names: ${JSON.stringify(names)}.`);

      await commands.find((command) => command.name === "autopilot.status")?.run();
      await commands.find((command) => command.name === "autopilot.check")?.run();
      assert(toasts.some((toast) => toast.message.includes("Autopilot status")), `TUI status must report through toast, got ${JSON.stringify(toasts)}.`);
      assert(toasts.some((toast) => toast.message.includes("Autopilot cheap check")), `TUI check must report through toast, got ${JSON.stringify(toasts)}.`);

      await commands.find((command) => command.name === "autopilot.run")?.run();
      assert(dialogs.length === 1, "TUI run command should gather optional scope through a dialog when available.");
      const prompt = dialogs[0] as { onConfirm?: (value: string) => void | Promise<void> };
      assert(typeof prompt.onConfirm === "function", "TUI run dialog must expose an onConfirm fallback path.");
      await prompt.onConfirm("tui-change");
      assert(toasts.some((toast) => toast.message.includes("/autopilot tui-change")), `TUI run confirm must include scoped prompt-mediated fallback, got ${JSON.stringify(toasts)}.`);
      await commands.find((command) => command.name === "autopilot.stop")?.run();
      assert(toasts.some((toast) => toast.message.includes("prompt-mediated fallback")), `TUI run/stop fallback must be explicit, got ${JSON.stringify(toasts)}.`);
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
  console.error(`${failed} autopilot bundle smoke test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot bundle smoke tests=${tests.length}`);
