#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  autopilotActionabilityValues,
  autopilotMrStatuses,
  autopilotMrWaitStatuses,
  autopilotParallelDecisions,
  autopilotProtectedPathPatterns,
  autopilotReasonCodes,
  autopilotSelectionReasons,
  autopilotSelectionModes,
  autopilotTaskStatuses,
  autopilotTaskTypes,
  autopilotToolNames,
} from "./autopilot-contract.ts";

type TestCase = {
  name: string;
  run: () => void;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const primaryOutputFields = ["reasonCode", "taskSummaries", "nextActions", "loopGuard", "selection"] as const;
const compatibilityFallbackField = "nextRecommendedCall";

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertContainsAllFields(text: string, label: string): void {
  for (const field of primaryOutputFields) {
    assert(text.includes(field), `${label} must mention current primary Autopilot output field ${field}.`);
  }
}

function assertContainsAllValues(text: string, values: readonly string[], label: string): void {
  for (const value of values) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(value)}([^A-Za-z0-9_]|$)`);
    assert(pattern.test(text), `${label} must document public Autopilot value ${value}.`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertCompatibilityFallback(text: string, label: string): void {
  assert(text.includes(compatibilityFallbackField), `${label} must mention ${compatibilityFallbackField} when describing legacy guidance.`);
  assert(
    /nextRecommendedCall[^\n.]{0,120}compatibility fallback|compatibility fallback[^\n.]{0,120}nextRecommendedCall/i.test(text),
    `${label} must describe ${compatibilityFallbackField} as a compatibility fallback, not primary guidance.`,
  );
}

function assertNoAuthoritativeStaleFields(text: string, label: string): void {
  let inFence = false;
  const staleAuthority = /\b(prefer|primary|authoritative|main|report|honou?r|follow|use)\b.*\bnextRecommendedCall\b|\bnextRecommendedCall\b.*\b(prefer|primary|authoritative|main|report|honou?r|follow|use)\b/i;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line.includes(compatibilityFallbackField)) {
      continue;
    }
    const isFallbackLine = /compatibility fallback|legacy fallback|schema|example/i.test(line);
    assert(!staleAuthority.test(line) || isFallbackLine, `${label} line ${index + 1} documents ${compatibilityFallbackField} as authoritative instead of fallback: ${line.trim()}`);
  }
}

function extractMarkdownSection(text: string, heading: string): string {
  const start = text.indexOf(`${heading}\n`);
  assert(start >= 0, `Missing README section ${heading}.`);
  const rest = text.slice(start + heading.length + 1);
  const next = rest.search(/^##\s+/m);
  return next >= 0 ? rest.slice(0, next) : rest;
}

function extractParagraphContaining(text: string, marker: string, label: string): string {
  const paragraph = text.split(/\r?\n\s*\r?\n/).find((candidate) => candidate.includes(marker));
  assert(paragraph != null, `Missing ${label} paragraph containing ${marker}.`);
  return paragraph;
}

function extractFenceContaining(text: string, marker: string, label: string): string {
  const fence = Array.from(text.matchAll(/```[a-z]*\n([\s\S]*?)```/g), (match) => match[1]).find((candidate) => candidate.includes(marker));
  assert(fence != null, `Missing ${label} fenced block containing ${marker}.`);
  return fence;
}

function extractAutopilotRoutingBullet(readme: string): string {
  const routing = extractMarkdownSection(readme, "## Routing Map");
  const line = routing.split(/\r?\n/).find((candidate) => candidate.includes("openspec-autopilot") && candidate.includes("autopilot_run_next"));
  assert(line != null, "README Routing Map must include an Autopilot routing bullet with openspec-autopilot and autopilot_run_next.");
  return line;
}

function readAutopilotCommandTemplate(): string {
  const parsed = JSON.parse(readText("opencode.json")) as { command?: { autopilot?: { template?: unknown; prompt?: unknown } } };
  const command = parsed.command?.autopilot;
  assert(command != null, "opencode.json must define command.autopilot.");
  assert(typeof command.template === "string", "command.autopilot must use schema-backed template text.");
  assert(command.prompt == null, "command.autopilot must not use stale prompt field when template is the documented command surface.");
  return command.template;
}

function assertExplainsDeterministicSelection(text: string, label: string): void {
  assert(/explain[^\n.]{0,120}deterministic[^\n.]{0,120}selection|deterministic[^\n.]{0,120}selection[^\n.]{0,120}explain/i.test(text), `${label} must tell agents to explain deterministic selection.`);
}

function extractLineContaining(text: string, needle: string, label: string): string {
  const line = text.split(/\r?\n/).find((candidate) => candidate.includes(needle));
  assert(line != null, `${label} must contain ${needle}.`);
  return line;
}

const tests: TestCase[] = [
  {
    name: "openspec-autopilot skill documents current primary output fields",
    run: () => {
      const skill = readText(".opencode/skills/openspec-autopilot/SKILL.md");
      assertContainsAllFields(skill, "openspec-autopilot skill");
      assertCompatibilityFallback(skill, "openspec-autopilot skill");
      assertNoAuthoritativeStaleFields(skill, "openspec-autopilot skill");
    },
  },
  {
    name: "openspec-autopilot skill documents scoped args and safe parallel trigger",
    run: () => {
      const skill = readText(".opencode/skills/openspec-autopilot/SKILL.md");
      const firstAction = extractMarkdownSection(skill, "## First Action");
      assert(firstAction.includes("changeId") && firstAction.includes("taskId"), "openspec-autopilot First Action must document scoped changeId/taskId arguments.");
      assert(firstAction.includes("call with no args only when no scope is supplied"), "openspec-autopilot First Action must call with no args only when no scope is supplied.");
      assert(firstAction.includes("should intersect"), "openspec-autopilot First Action must say combined changeId/taskId scopes are intentional intersections only.");
      assert(/safe parallel OpenSpec work/i.test(skill), "openspec-autopilot skill must keep the safe-parallel OpenSpec trigger discoverable.");
      assert(/safe parallel OpenSpec work with plugin\/runtime selection evidence/i.test(skill), "openspec-autopilot skill must qualify safe-parallel trigger with plugin/runtime selection evidence.");
      assert(skill.includes('reasonCode: "ready_runtime_deferred"'), "openspec-autopilot skill must qualify ready_runtime_deferred as reasonCode wording.");
      const stopRow = extractLineContaining(extractMarkdownSection(skill, "## Public Tools"), "`autopilot_stop`", "openspec-autopilot Public Tools");
      assert(stopRow.includes("stop_applied") && stopRow.includes('outcome: "advanced"') && stopRow.includes("tasksAdvanced"), "openspec-autopilot autopilot_stop row must document active stop output semantics.");
      assert(/plugin-owned active runtime state was changed/i.test(stopRow), "openspec-autopilot autopilot_stop row must tie stop_applied to plugin-owned active runtime state changes.");
    },
  },
  {
    name: "openspec-autopilot skill documents no-op argument metadata",
    run: () => {
      const skill = readText(".opencode/skills/openspec-autopilot/SKILL.md");
      const publicTools = extractMarkdownSection(skill, "## Public Tools");
      const paragraph = extractParagraphContaining(publicTools, "metadata.argumentContext", "no-op argument metadata");
      assert(paragraph.includes("acknowledged") && paragraph.includes("ignored") && paragraph.includes("mutation"), "openspec-autopilot skill must document argumentContext keys in the metadata paragraph.");
      assert(/ignored[^\n.]{0,160}values|values[^\n.]{0,160}ignored/i.test(paragraph), "openspec-autopilot skill must state ignored argument values are not echoed.");
      assert(paragraph.includes('mutation: "none"') && paragraph.includes('mutation: "plugin-owned-runtime-only"'), "openspec-autopilot skill must distinguish no-op and runtime-only metadata mutation values.");
      assert(/without protected-file mutation|no protected/i.test(paragraph), "openspec-autopilot skill must state runtime-only mutation does not mutate protected files.");
    },
  },
  {
    name: "openspec-autopilot skill documents shared public contract values",
    run: () => {
      const skill = readText(".opencode/skills/openspec-autopilot/SKILL.md");
      const publicTools = extractMarkdownSection(skill, "## Public Tools");
      const outputContractBlock = extractFenceContaining(publicTools, '"outcome"', "Autopilot output contract");
      assertContainsAllValues(outputContractBlock, autopilotReasonCodes, "openspec-autopilot output contract reasonCode list");
      assertContainsAllValues(outputContractBlock, autopilotTaskTypes, "openspec-autopilot output contract taskType list");
      assertContainsAllValues(outputContractBlock, autopilotTaskStatuses, "openspec-autopilot output contract status list");
      assertContainsAllValues(outputContractBlock, autopilotMrStatuses, "openspec-autopilot output contract mrStatus list");
      assertContainsAllValues(outputContractBlock, autopilotMrWaitStatuses, "openspec-autopilot output contract MR wait status list");
      assertContainsAllValues(outputContractBlock, autopilotActionabilityValues, "openspec-autopilot output contract actionability list");
      assertContainsAllValues(outputContractBlock, autopilotSelectionModes, "openspec-autopilot output contract selection mode list");
      assertContainsAllValues(outputContractBlock, autopilotParallelDecisions, "openspec-autopilot output contract parallel decision list");
      assertContainsAllValues(outputContractBlock, autopilotSelectionReasons, "openspec-autopilot output contract selection reason list");
      assertContainsAllValues(outputContractBlock, autopilotToolNames, "openspec-autopilot output contract tool list");
      assertContainsAllValues(extractMarkdownSection(skill, "## Authority Boundary"), autopilotProtectedPathPatterns, "openspec-autopilot protected path list");
      assert(
        publicTools.includes("maxImplementationClaims: 1")
          && publicTools.includes("not_evaluated")
          && publicTools.includes("parallel_ready")
          && publicTools.includes("visibility evidence only"),
        "openspec-autopilot skill must document current MVP-vNext serial selection and parallel-ready visibility semantics.",
      );
    },
  },
  {
    name: "README Autopilot routing section documents current output fields",
    run: () => {
      const readme = readText("README.md");
      const routingBullet = extractAutopilotRoutingBullet(readme);
      assertContainsAllFields(routingBullet, "README Autopilot routing bullet");
      assertCompatibilityFallback(routingBullet, "README Autopilot routing bullet");
      assertNoAuthoritativeStaleFields(routingBullet, "README Autopilot routing bullet");
      assert(readme.includes("command.autopilot"), "README must keep /autopilot command routing discoverable.");
    },
  },
  {
    name: "README install sections keep OpenCode restart guidance",
    run: () => {
      const readme = readText("README.md");
      const manualPlugins = extractMarkdownSection(readme, "### Manual Plugins");
      const manualCommands = extractMarkdownSection(readme, "### Manual Commands");
      assert(/restart OpenCode/i.test(manualPlugins), "README Manual Plugins section must tell users to restart OpenCode after plugin bundle changes.");
      assert(/restart OpenCode/i.test(manualCommands), "README Manual Commands section must tell users to restart OpenCode after command, skill, or plugin changes.");
    },
  },
  {
    name: "opencode /autopilot command template documents current output fields",
    run: () => {
      const template = readAutopilotCommandTemplate();
      assertContainsAllFields(template, "opencode.json command.autopilot template");
      assertCompatibilityFallback(template, "opencode.json command.autopilot template");
      assertNoAuthoritativeStaleFields(template, "opencode.json command.autopilot template");
      assertExplainsDeterministicSelection(template, "opencode.json command.autopilot template");
      assert(template.includes("openspec-autopilot"), "command.autopilot template must route through openspec-autopilot skill.");
      assert(template.includes("autopilot_run_next"), "command.autopilot template must call autopilot_run_next first by default.");
      assert(template.includes("$ARGUMENTS"), "command.autopilot template must expose user-supplied scope through $ARGUMENTS.");
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
  console.error(`${failed} autopilot instruction drift test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot instruction drift tests=${tests.length}`);
