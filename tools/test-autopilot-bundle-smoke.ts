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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = path.join(root, ".opencode", "plugins", "openspec-autopilot.ts");
const requiredBundleFiles = [
  ".opencode/skills/openspec-autopilot/SKILL.md",
  ".opencode/plugins/openspec-autopilot.ts",
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

async function importAutopilotPlugin(): Promise<{ id?: unknown; server?: unknown }> {
  const imported = await import(pathToFileURL(pluginPath).href) as { default?: unknown };
  assert(typeof imported.default === "object" && imported.default != null && !Array.isArray(imported.default), "Autopilot plugin default export must be an object.");
  return imported.default as { id?: unknown; server?: unknown };
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
      for (const relativePath of collectRelativeImportClosure(pluginPath)) {
        assertFileExists(relativePath);
        if (relativePath.startsWith("tools/")) {
          assertReadmeDocuments(relativePath, bundleSection);
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
