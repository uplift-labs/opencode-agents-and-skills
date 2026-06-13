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

function assertAutopilotEligibilityBoundaries(text: string, label: string): void {
  const normalized = text.toLowerCase();
  for (const phrase of ["/autopilot", "работай", "ready OpenSpec task ledgers", "strict task-type", "safe parallel OpenSpec work"]) {
    assert(normalized.includes(phrase.toLowerCase()), `${label} must document Autopilot eligibility phrase: ${phrase}.`);
  }
  for (const phrase of ["casual codebase questions", "one obvious small edit", "next-step", "openspec-apply-change", "orchestrator"]) {
    assert(normalized.includes(phrase.toLowerCase()), `${label} must document Autopilot non-eligibility or handoff phrase: ${phrase}.`);
  }
}

function assertAutopilotEscapeHatch(text: string, label: string): void {
  const normalized = text.toLowerCase();
  for (const phrase of ["ready_runtime_deferred", "no_ledgers", "no_actionable_tasks", "stale evidence", "evidence conflict"]) {
    assert(normalized.includes(phrase.toLowerCase()), `${label} must document Autopilot escape-hatch phrase: ${phrase}.`);
  }
  assert(/do not repeat|without repeating|must not repeat/i.test(text), `${label} must prohibit repeated equivalent no-progress Autopilot calls.`);
  assert(/hand ?off|route to|manual direct/i.test(text), `${label} must document a named stop or handoff path.`);
}

function assertActiveChangeHandoff(text: string, label: string): void {
  const normalized = text.toLowerCase();
  for (const phrase of ["active_change_handoff", "active OpenSpec changes", "tasks.md", "openspec-apply-change"]) {
    assert(normalized.includes(phrase.toLowerCase()), `${label} must document active-change handoff phrase: ${phrase}.`);
  }
  assert(/no_ledgers[\s\S]{0,240}unfinished active OpenSpec changes|unfinished active OpenSpec changes[\s\S]{0,240}no_ledgers/i.test(text), `${label} must state no_ledgers is not the stop state when unfinished active OpenSpec changes exist.`);
}

function assertAutopilotMaterialization(text: string, label: string): void {
  const normalized = text.toLowerCase();
  for (const phrase of ["ledger_materialized", "automation/task.json", "tasksAdvanced", "validation evidence", "nextActions"] as const) {
    assert(normalized.includes(phrase.toLowerCase()), `${label} must document Autopilot materialization phrase: ${phrase}.`);
  }
  assert(text.includes("<ledgerRoot>"), `${label} must document materialized ledger paths with <ledgerRoot> rather than only default openspec/changes.`);
  assert(/ledger_materialized[\s\S]{0,260}(follow|safe|nextActions|autopilot_run_next)|automation\/task\.json[\s\S]{0,260}(follow|safe|nextActions|autopilot_run_next)/i.test(text), `${label} must explain the safe ledger-backed follow-up after materialization.`);
  assert(/no implementation worker|worker[^.\n]{0,80}not[^.\n]{0,80}claim|not claim[^.\n]{0,80}worker/i.test(text), `${label} must state materialization does not claim implementation worker work.`);
}

function assertActiveChangeTriggerBoundary(text: string, label: string): void {
  assert(/unfinished active OpenSpec changes[\s\S]{0,220}(explicit|\/autopilot|handoff)|\/autopilot[\s\S]{0,220}unfinished active OpenSpec changes/i.test(text), `${label} must scope unfinished active OpenSpec change routing to explicit Autopilot or handoff contexts.`);
  assert(/direct[\s\S]{0,120}openspec-apply-change|openspec-apply-change[\s\S]{0,120}direct/i.test(text), `${label} must preserve direct openspec-apply-change routing for direct accepted changes.`);
}

function assertAutoParallelDocs(text: string, label: string): void {
  for (const phrase of [
    "auto_parallel_implementation",
    "autoDecision",
    "riskClass",
    "conflictTolerance",
    "accepted soft",
    "rejected",
    "fan-in",
    "parallel_ready",
    "parallel_started",
    "tasksStarted",
    "worktreePath",
    "MR merged",
    "archive",
    "cleanup",
  ]) {
    assert(text.toLowerCase().includes(phrase.toLowerCase()), `${label} must document auto-parallel phrase: ${phrase}.`);
  }
  assert(/maxImplementationClaims[\s\S]{0,120}(numeric|resolved)|resolved[\s\S]{0,120}maxImplementationClaims/i.test(text), `${label} must state auto maxImplementationClaims is resolved numeric output.`);
  assert(/enabled:\s*true[\s\S]{0,160}(mode|maxImplementationClaims)|mode[\s\S]{0,160}enabled:\s*true/i.test(text), `${label} must state explicit auto policy still requires parallelImplementation.enabled=true.`);
  assert(/terminal[\s\S]{0,120}fan-in|fan-in[\s\S]{0,120}terminal/i.test(text), `${label} must document fan-in before terminal readiness.`);
  assert(/archive-ready[\s\S]{0,80}MR-ready[\s\S]{0,120}(agent\/reviewer|reviewer\/agent|reviewer gates|agent gates)|MR-ready[\s\S]{0,80}archive-ready[\s\S]{0,120}(agent\/reviewer|reviewer\/agent|reviewer gates|agent gates)/i.test(text), `${label} must document archive-ready and MR-ready fan-in handoffs through agent/reviewer gates.`);
  assert(/worktree[\s\S]{0,180}(MR|merged)[\s\S]{0,180}(archive|cleanup)|cleanup[\s\S]{0,180}(MR|merged)[\s\S]{0,180}archive/i.test(text), `${label} must document worktree cleanup after MR merged and archive evidence.`);
}

function assertAutopilotCheckDocs(text: string, label: string): void {
  for (const phrase of [
    "autopilot:check",
    "--level cheap",
    "--level standard",
    "--level prepush",
    "--level final",
    "not-applicable",
    "retro follow-ups",
  ]) {
    assert(text.toLowerCase().includes(phrase.toLowerCase()), `${label} must document Autopilot check phrase: ${phrase}.`);
  }
  assert(/autopilot_run_next[\s\S]{0,120}autopilot_collect[\s\S]{0,160}advanced|advanced[\s\S]{0,160}autopilot_run_next[\s\S]{0,120}autopilot_collect/i.test(text), `${label} must tie cheap checkpoints to advanced run_next/collect output.`);
  assert(/status-only[\s\S]{0,80}(do not|not require)|do not[\s\S]{0,80}status-only/i.test(text), `${label} must not require cheap checkpoints after status-only reads.`);
  assert(/final[\s\S]{0,160}(not read-only|write-authorized|may create\/update)|may create\/update[\s\S]{0,160}final/i.test(text), `${label} must warn that final checks can write follow-up/retrospective outputs.`);
  assert(/prepush[\s\S]{0,180}ready-to-land|ready-to-land[\s\S]{0,180}prepush/i.test(text), `${label} must route routine ready-to-land evidence to prepush rather than final.`);
}

function assertProgrammaticTriggerDocs(text: string, label: string): void {
  for (const phrase of [
    "triggerMode",
    "off",
    "observe",
    "controlled",
    "autonomous",
    "file.watcher.updated",
    "tool.execute.after",
    "tool.execute.before",
    "autopilot_collect",
    "autopilot_answer_blocker",
    "protected-path guard",
    "autopilot.status",
    "autopilot.check",
    "autopilot.run",
    "autopilot.stop",
    "zero-LLM",
    "prompt-mediated",
  ]) {
    assert(text.toLowerCase().includes(phrase.toLowerCase()), `${label} must document programmatic trigger phrase: ${phrase}.`);
  }
  assert(/passive[\s\S]{0,160}(status|cheap check)[\s\S]{0,160}(never|not)[\s\S]{0,160}autopilot_run_next|autopilot_run_next[\s\S]{0,160}(never|not)[\s\S]{0,160}passive/i.test(text), `${label} must state passive events do not call autopilot_run_next by default.`);
  assert(/controlled[\s\S]{0,220}plugin-owned[\s\S]{0,220}(worker|blocker|permission|workspace|worktree)/i.test(text), `${label} must tie controlled runtime triggers to plugin-owned evidence.`);
  assert(/permission(?:\.replied| replies)[\s\S]{0,120}status-only|status-only[\s\S]{0,120}permission(?:\.replied| replies)/i.test(text), `${label} must document MVP permission replies as status-only.`);
  assert(/restart OpenCode/i.test(text), `${label} must include restart guidance for plugin/TUI trigger changes.`);
}

function assertPromptIntakeDocs(text: string, label: string): void {
  const normalized = text.toLowerCase();
  for (const phrase of [
    "/autopilot <free-form prompt>",
    "free-form prompt",
    "exact",
    "ambiguous",
    "changeId",
    "taskId",
    "openspec-explore",
    "openspec-propose",
    "direct edit",
    "raw",
    "derived",
    "prompt family",
    "queue summary",
    "resolved scope",
  ]) {
    assert(normalized.includes(phrase.toLowerCase()), `${label} must document prompt-intake phrase: ${phrase}.`);
  }
  for (const family of autopilotTaskTypes) {
    assert(normalized.includes(family.toLowerCase()), `${label} must document canonical prompt family label: ${family}.`);
  }
  assert(/ambiguous[\s\S]{0,220}(block|options|do not call|without advancement)|multiple exact scopes[\s\S]{0,220}(block|options|do not call|without advancement)/i.test(text), `${label} must document ambiguous exact-scope blocking/options before advancement.`);
  assert(/free-form prompt[\s\S]{0,260}(not|never)[\s\S]{0,160}(changeId|taskId)|(changeId|taskId)[\s\S]{0,260}(not|never)[\s\S]{0,160}free-form prompt/i.test(text), `${label} must prohibit treating free-form prompts as changeId/taskId scope.`);
  assert(/free-form prompt[\s\S]{0,260}(not|never|do not)[\s\S]{0,180}(unrelated|queued|queue)[\s\S]{0,160}autopilot_run_next|unrelated[\s\S]{0,180}(not|never|do not)[\s\S]{0,180}autopilot_run_next/i.test(text), `${label} must state free-form prompts do not advance unrelated queued Autopilot work.`);
  assert(/read-only[\s\S]{0,180}(autopilot_status|status)|autopilot_status[\s\S]{0,180}read-only/i.test(text), `${label} must route free-form prompt queue inspection through read-only status evidence.`);
  assert(/raw[\s\S]{0,160}(prompt|free-form)[\s\S]{0,180}(not|never|do not)[\s\S]{0,120}(persist|echo)|do not[\s\S]{0,120}(persist|echo)[\s\S]{0,180}raw[\s\S]{0,120}(prompt|free-form)/i.test(text), `${label} must prohibit raw free-form prompt persistence or echo by default.`);
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
      const eligibility = extractMarkdownSection(skill, "## Eligibility");
      assertAutopilotEligibilityBoundaries(eligibility, "openspec-autopilot Eligibility section");
      const firstAction = extractMarkdownSection(skill, "## First Action");
      assert(firstAction.includes("changeId") && firstAction.includes("taskId"), "openspec-autopilot First Action must document scoped changeId/taskId arguments.");
      assert(firstAction.includes("call with no args only when no scope is supplied"), "openspec-autopilot First Action must call with no args only when no scope is supplied.");
      assert(firstAction.includes("should intersect"), "openspec-autopilot First Action must say combined changeId/taskId scopes are intentional intersections only.");
      assertPromptIntakeDocs(firstAction, "openspec-autopilot First Action prompt intake");
      assert(/safe parallel OpenSpec work/i.test(skill), "openspec-autopilot skill must keep the safe-parallel OpenSpec trigger discoverable.");
      assert(/safe parallel OpenSpec work with plugin\/runtime selection evidence/i.test(skill), "openspec-autopilot skill must qualify safe-parallel trigger with plugin/runtime selection evidence.");
      assert(skill.includes('reasonCode: "ready_runtime_deferred"'), "openspec-autopilot skill must qualify ready_runtime_deferred as reasonCode wording.");
      const stopRow = extractLineContaining(extractMarkdownSection(skill, "## Public Tools"), "`autopilot_stop`", "openspec-autopilot Public Tools");
      assert(stopRow.includes("stop_applied") && stopRow.includes('outcome: "advanced"') && stopRow.includes("tasksAdvanced"), "openspec-autopilot autopilot_stop row must document active stop output semantics.");
      assert(/plugin-owned active runtime state was changed/i.test(stopRow), "openspec-autopilot autopilot_stop row must tie stop_applied to plugin-owned active runtime state changes.");
    },
  },
  {
    name: "openspec-autopilot skill documents escape-hatch behavior",
    run: () => {
      const skill = readText(".opencode/skills/openspec-autopilot/SKILL.md");
      const escapeHatch = extractMarkdownSection(skill, "## Escape Hatch");
      assertAutopilotEscapeHatch(escapeHatch, "openspec-autopilot Escape Hatch section");
      assertActiveChangeHandoff(skill, "openspec-autopilot skill");
      assertAutopilotMaterialization(skill, "openspec-autopilot skill");
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
      assert(outputContractBlock.includes("<ledgerRoot>/<change>/tasks.md"), "openspec-autopilot output contract must document active-change tasks.md paths with ledgerRoot.");
      assertAutopilotMaterialization(publicTools, "openspec-autopilot Public Tools materialization docs");
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
    name: "openspec-autopilot skill documents auto parallel contract",
    run: () => {
      const skill = readText(".opencode/skills/openspec-autopilot/SKILL.md");
      assertAutoParallelDocs(extractMarkdownSection(skill, "## Public Tools"), "openspec-autopilot Public Tools auto-parallel docs");
    },
  },
  {
    name: "Autopilot validation checkpoints stay documented",
    run: () => {
      const skill = readText(".opencode/skills/openspec-autopilot/SKILL.md");
      const readme = readText("README.md");
      assertAutopilotCheckDocs(skill, "openspec-autopilot skill");
      assertAutopilotCheckDocs(readme, "README");
      assert(/pre-push gate[\s\S]{0,240}Autopilot ledger validation/i.test(readme), "README must document pre-push Autopilot ledger validation.");
    },
  },
  {
    name: "Autopilot programmatic trigger docs stay synchronized",
    run: () => {
      const skill = readText(".opencode/skills/openspec-autopilot/SKILL.md");
      const readme = readText("README.md");
      assertProgrammaticTriggerDocs(skill, "openspec-autopilot skill");
      assertProgrammaticTriggerDocs(readme, "README");
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
    name: "README routing documents Autopilot boundaries and handoffs",
    run: () => {
      const readme = readText("README.md");
      const routing = extractMarkdownSection(readme, "## Routing Map");
      assertAutopilotEligibilityBoundaries(routing, "README Routing Map");
      assertAutopilotEscapeHatch(routing, "README Routing Map");
      assertActiveChangeHandoff(routing, "README Routing Map");
      assertAutopilotMaterialization(routing, "README Routing Map");
      assertActiveChangeTriggerBoundary(routing, "README Routing Map");
      assertPromptIntakeDocs(routing, "README Routing Map prompt intake");
    },
  },
  {
    name: "README skill catalog documents Autopilot materialization and handoff",
    run: () => {
      const readme = readText("README.md");
      const catalog = extractMarkdownSection(readme, "## Skill Catalog");
      const openSpecCatalog = extractMarkdownSection(catalog, "### OpenSpec");
      const line = extractLineContaining(openSpecCatalog, "`openspec-autopilot`", "README OpenSpec Skill Catalog");
      assertActiveChangeHandoff(line, "README OpenSpec Skill Catalog openspec-autopilot entry");
      assertAutopilotMaterialization(line, "README OpenSpec Skill Catalog openspec-autopilot entry");
      assertPromptIntakeDocs(openSpecCatalog, "README OpenSpec Skill Catalog prompt intake");
      assert(line.includes("openspec-apply-change"), "README OpenSpec Skill Catalog entry must mention openspec-apply-change continuation for active_change_handoff.");
    },
  },
  {
    name: "README documents auto parallel contract",
    run: () => {
      const readme = readText("README.md");
      assertAutoParallelDocs(`${extractAutopilotRoutingBullet(readme)}\n${extractLineContaining(extractMarkdownSection(extractMarkdownSection(readme, "## Skill Catalog"), "### OpenSpec"), "`openspec-autopilot`", "README OpenSpec Skill Catalog")}`, "README auto-parallel docs");
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
      assert(template.includes("autopilot_run_next"), "command.autopilot template must document autopilot_run_next for empty or exact-scope arguments.");
      assert(template.includes("$ARGUMENTS"), "command.autopilot template must expose user-supplied scope through $ARGUMENTS.");
      assertAutopilotEligibilityBoundaries(template, "opencode.json command.autopilot template");
      assertAutopilotEscapeHatch(template, "opencode.json command.autopilot template");
      assertActiveChangeHandoff(template, "opencode.json command.autopilot template");
      assertAutopilotMaterialization(template, "opencode.json command.autopilot template");
      assertActiveChangeTriggerBoundary(template, "opencode.json command.autopilot template");
      assertPromptIntakeDocs(template, "opencode.json command.autopilot template prompt intake");
      assert(!template.includes("handoffTarget"), "command.autopilot template must not document a public handoffTarget before the output contract exposes it.");
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
