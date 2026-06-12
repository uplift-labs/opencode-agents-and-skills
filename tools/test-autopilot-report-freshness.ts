#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  formatAutopilotFreshnessReportJson,
  inspectAutopilotChangeFreshness,
  type AutopilotFreshnessReport,
} from "./autopilot-report-freshness.ts";

type TestCase = {
  name: string;
  run: () => void;
};

function newTempRepo(name: string): string {
  const parent = path.join(os.tmpdir(), "agents-and-skills-freshness-tests");
  fs.mkdirSync(parent, { recursive: true });
  const repo = path.join(parent, `${name}-${crypto.randomUUID().replace(/-/g, "")}`);
  fs.mkdirSync(repo, { recursive: true });
  return repo;
}

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = newTempRepo(name);
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function writeText(repo: string, relativePath: string, content: string): void {
  const filePath = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeTasks(repo: string, changeId: string, tasks: string[]): void {
  writeText(repo, `openspec/changes/${changeId}/tasks.md`, ["# Tasks", "", ...tasks, ""].join("\n"));
}

function writeReport(repo: string, changeId: string, lines: string[]): void {
  writeText(repo, `openspec/changes/${changeId}/live-regression-report.md`, [...lines, ""].join("\n"));
}

function writeLedger(repo: string, changeId: string, status: string): void {
  writeText(repo, `openspec/changes/${changeId}/automation/task.json`, `${JSON.stringify({ id: `${changeId}-task`, status }, null, 2)}\n`);
}

function currentOutputJsonBlock(): string[] {
  return [
    "```json",
    JSON.stringify({
      outcome: "idle",
      tasksStarted: [],
      tasksAdvanced: [],
      mrsWaiting: [],
      questions: [],
      blockers: [],
      nextRecommendedCall: null,
      summary: "Current output shape.",
      reasonCode: "ready_runtime_deferred",
      taskSummaries: [],
      nextActions: [],
      loopGuard: { repeatedNoProgress: true, suppressRepeatRecommendation: true },
      selection: { mode: "serial_default", maxImplementationClaims: 1, candidates: [] },
    }, null, 2),
    "```",
  ];
}

function missingSelectionOutputJsonBlock(): string[] {
  return [
    "```json",
    JSON.stringify({
      outcome: "idle",
      tasksStarted: [],
      tasksAdvanced: [],
      mrsWaiting: [],
      questions: [],
      blockers: [],
      nextRecommendedCall: null,
      summary: "Missing only selection.",
      reasonCode: "ready_runtime_deferred",
      taskSummaries: [],
      nextActions: [],
      loopGuard: { repeatedNoProgress: true, suppressRepeatRecommendation: true },
    }, null, 2),
    "```",
  ];
}

function staleOutputJsonBlock(): string[] {
  return [
    "```json",
    "{",
    "  \"outcome\": \"idle\",",
    "  \"tasksStarted\": [],",
    "  \"tasksAdvanced\": [],",
    "  \"mrsWaiting\": [],",
    "  \"questions\": [],",
    "  \"blockers\": [],",
    "  \"nextRecommendedCall\": null,",
    "  \"summary\": \"old MVP shape\"",
    "}",
    "```",
  ];
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${String(expected)}\nActual: ${String(actual)}`);
  }
}

function item(report: AutopilotFreshnessReport, id: string) {
  const found = report.items.find((entry) => entry.id === id);
  assert(found != null, `Expected freshness item ${id}.`);
  return found;
}

function assertTopLevelJsonKeyOrder(rendered: string): void {
  const keys = ["tool", "mode", "valid", "changeId", "paths", "summary", "items"];
  let previousIndex = -1;
  for (const key of keys) {
    const currentIndex = rendered.indexOf(`\"${key}\"`);
    assert(currentIndex > previousIndex, `Rendered freshness JSON must keep stable top-level key order at ${key}.`);
    previousIndex = currentIndex;
  }
  assert(rendered.endsWith("\n"), "Rendered freshness JSON must end with a newline.");
}

const tests: TestCase[] = [
  {
    name: "stale Autopilot output shape maps to advisory warning and archive error",
    run: () => withTempRepo("stale-output", (repo) => {
      writeTasks(repo, "stale-output", ["- [x] Add current output fields"]);
      writeReport(repo, "stale-output", ["# Live Regression Report", "", "Status: in progress.", "", ...staleOutputJsonBlock()]);

      const advisory = inspectAutopilotChangeFreshness({ root: repo, changeId: "stale-output", mode: "advisory" });
      assertEqual(advisory.valid, true, "Advisory stale output should not block development.");
      assertEqual(item(advisory, "autopilot-output-shape").status, "stale", "Advisory stale output should be stale.");
      assertEqual(item(advisory, "autopilot-output-shape").level, "warning", "Advisory stale output should be a warning.");

      const strict = inspectAutopilotChangeFreshness({ root: repo, changeId: "stale-output", mode: "archive-strict" });
      assertEqual(strict.valid, false, "Archive-strict stale output should block archive.");
      assertEqual(item(strict, "autopilot-output-shape").status, "stale", "Archive-strict stale output should be stale.");
      assertEqual(item(strict, "autopilot-output-shape").level, "error", "Archive-strict stale output should be an error.");
    }),
  },
  {
    name: "missing selection output shape is stale in archive-strict mode",
    run: () => withTempRepo("missing-selection", (repo) => {
      writeTasks(repo, "missing-selection", ["- [x] Add current output fields"]);
      writeReport(repo, "missing-selection", ["# Live Regression Report", "", "Status: in progress.", "", ...missingSelectionOutputJsonBlock()]);

      const strict = inspectAutopilotChangeFreshness({ root: repo, changeId: "missing-selection", mode: "archive-strict" });
      assertEqual(strict.valid, false, "Archive-strict output missing selection should block archive.");
      assertEqual(item(strict, "autopilot-output-shape").status, "stale", "Missing selection output should be stale.");
      assertEqual(item(strict, "autopilot-output-shape").level, "error", "Missing selection output should be an error.");
    }),
  },
  {
    name: "completed-only report with unchecked tasks is a contradiction without ready-to-land wording",
    run: () => withTempRepo("completed-unchecked", (repo) => {
      writeTasks(repo, "completed-unchecked", ["- [x] Add current output fields", "- [ ] Update report freshness check"]);
      writeReport(repo, "completed-unchecked", ["# Live Regression Report", "", "Status: completed.", "", ...currentOutputJsonBlock()]);

      const advisory = inspectAutopilotChangeFreshness({ root: repo, changeId: "completed-unchecked", mode: "advisory" });
      assertEqual(item(advisory, "tasks-completion-consistency").status, "contradiction", "Completed-only unchecked tasks should be a contradiction.");
      assertEqual(item(advisory, "tasks-completion-consistency").level, "warning", "Advisory completed-only unchecked tasks should warn.");

      const strict = inspectAutopilotChangeFreshness({ root: repo, changeId: "completed-unchecked", mode: "archive-strict" });
      assertEqual(strict.valid, false, "Archive-strict completed-only unchecked tasks should block archive.");
      assertEqual(item(strict, "tasks-completion-consistency").level, "error", "Archive-strict completed-only unchecked tasks should be an error.");
    }),
  },
  {
    name: "Ready ledger explanation is required for completed-only report",
    run: () => withTempRepo("ready-completed-negative", (repo) => {
      writeTasks(repo, "ready-completed-negative", ["- [x] Capture Ready ledger evidence"]);
      writeReport(repo, "ready-completed-negative", ["# Live Regression Report", "", "Status: completed.", "", ...currentOutputJsonBlock()]);
      writeLedger(repo, "ready-completed-negative", "Ready");

      const report = inspectAutopilotChangeFreshness({ root: repo, changeId: "ready-completed-negative", mode: "archive-strict" });
      assertEqual(report.valid, false, "Completed-only Ready ledger without explanation should block archive.");
      assertEqual(item(report, "ready-ledger-state-explanation").status, "stale", "Completed-only Ready ledger without explanation should be stale.");
      assertEqual(item(report, "ready-ledger-state-explanation").level, "error", "Completed-only Ready ledger without explanation should be an error.");
    }),
  },
  {
    name: "Ready ledger explanation is required for explicit ready-to-land report",
    run: () => withTempRepo("ready-land-negative", (repo) => {
      writeTasks(repo, "ready-land-negative", ["- [x] Capture Ready ledger evidence"]);
      writeReport(repo, "ready-land-negative", ["# Live Regression Report", "", "Status: in progress.", "", ...currentOutputJsonBlock(), "", "## Ready-To-Land Status", "", "Ready to land."]);
      writeLedger(repo, "ready-land-negative", "Ready");

      const report = inspectAutopilotChangeFreshness({ root: repo, changeId: "ready-land-negative", mode: "archive-strict" });
      assertEqual(report.valid, false, "Ready-to-land Ready ledger without explanation should block archive.");
      assertEqual(item(report, "ready-ledger-state-explanation").status, "stale", "Ready-to-land Ready ledger without explanation should be stale.");
    }),
  },
  {
    name: "Ready ledger with explicit plugin-owned state explanation passes archive-strict",
    run: () => withTempRepo("ready-explained", (repo) => {
      writeTasks(repo, "ready-explained", ["- [x] Capture Ready ledger evidence"]);
      writeReport(repo, "ready-explained", [
        "# Live Regression Report",
        "",
        "Status: completed.",
        "",
        ...currentOutputJsonBlock(),
        "",
        "## Ready-To-Land Status",
        "",
        "Ready to land. The automation/task.json ledger remains Ready because protected plugin-owned state is not mutated by this evidence report.",
      ]);
      writeLedger(repo, "ready-explained", "Ready");

      const report = inspectAutopilotChangeFreshness({ root: repo, changeId: "ready-explained", mode: "archive-strict" });
      assertEqual(report.valid, true, "Archive-strict freshness should accept Ready ledgers with explicit plugin-owned-state explanation.");
      assertEqual(item(report, "ready-ledger-state-explanation").status, "pass", "Ready ledger explanation should be reported as pass.");
    }),
  },
  {
    name: "unsupported-only evidence returns unknown and does not block by itself",
    run: () => withTempRepo("unsupported-only", (repo) => {
      writeTasks(repo, "unsupported-only", ["- [ ] Add unsupported consistency probe"]);
      writeReport(repo, "unsupported-only", ["# Live Regression Report", "", "Status: in progress.", "", ...currentOutputJsonBlock()]);

      const report = inspectAutopilotChangeFreshness({
        root: repo,
        changeId: "unsupported-only",
        mode: "archive-strict",
        consistencyEvidence: [
          {
            id: "unsupported-probe",
            taskIncludes: "Add unsupported consistency probe",
            evidence: [{ path: "tools/missing-evidence.ts", contains: "missing marker" }],
          },
          {
            id: "empty-rule",
            taskIncludes: "Add unsupported consistency probe",
            evidence: [],
          },
          {
            id: "blank-marker",
            taskIncludes: "Add unsupported consistency probe",
            evidence: [{ path: "tools/missing-evidence.ts", contains: "   " }],
          },
        ],
      });

      assertEqual(report.valid, true, "Unsupported-only evidence should not block without an explicit contradiction.");
      assertEqual(item(report, "active-change-evidence:unsupported-probe").status, "unknown", "Unsupported evidence should return unknown.");
      assertEqual(item(report, "active-change-evidence:unsupported-probe").level, "unknown", "Unsupported evidence should not be promoted to error.");
      assertEqual(item(report, "active-change-evidence:empty-rule").status, "unknown", "Empty evidence rule should return unknown.");
      assertEqual(item(report, "active-change-evidence:blank-marker").status, "unknown", "Blank evidence marker should return unknown.");
      assertEqual(report.summary.error, 0, "Unsupported-only evidence should not produce errors.");
      assert(report.summary.unknown >= 1, "Unsupported-only evidence should increment unknown summary.");
    }),
  },
  {
    name: "active-change evidence rejects out-of-root paths as unsupported",
    run: () => withTempRepo("out-of-root-evidence", (repo) => {
      const outsideEvidence = path.join(path.dirname(repo), `${path.basename(repo)}-outside-evidence.ts`);
      fs.writeFileSync(outsideEvidence, "escaped marker\n", "utf8");
      try {
        writeTasks(repo, "out-of-root-evidence", ["- [ ] Add out-of-root consistency probe"]);
        writeReport(repo, "out-of-root-evidence", ["# Live Regression Report", "", "Status: in progress.", "", ...currentOutputJsonBlock()]);

        const report = inspectAutopilotChangeFreshness({
          root: repo,
          changeId: "out-of-root-evidence",
          mode: "archive-strict",
          consistencyEvidence: [
            {
              id: "traversal-path",
              taskIncludes: "Add out-of-root consistency probe",
              evidence: [{ path: `../${path.basename(outsideEvidence)}`, contains: "escaped marker" }],
            },
            {
              id: "absolute-path",
              taskIncludes: "Add out-of-root consistency probe",
              evidence: [{ path: outsideEvidence, contains: "escaped marker" }],
            },
          ],
        });

        assertEqual(report.valid, true, "Out-of-root evidence must not create archive-strict contradictions.");
        assertEqual(item(report, "active-change-evidence:absolute-path").status, "unknown", "Absolute evidence path should be unsupported.");
        assertEqual(item(report, "active-change-evidence:traversal-path").status, "unknown", "Traversal evidence path should be unsupported.");
        const rendered = formatAutopilotFreshnessReportJson(report);
        assert(!rendered.includes(outsideEvidence), "Rendered freshness output must not echo absolute out-of-root evidence paths.");
        assert(!rendered.includes(`../${path.basename(outsideEvidence)}`), "Rendered freshness output must not echo traversal evidence paths.");
        assert(rendered.includes("<invalid-evidence-path>"), "Rendered freshness output should use a stable invalid-path placeholder.");
      } finally {
        fs.rmSync(outsideEvidence, { force: true });
      }
    }),
  },
  {
    name: "active-change source and test evidence both required before unchecked task contradiction",
    run: () => withTempRepo("source-test-evidence", (repo) => {
      writeTasks(repo, "source-test-evidence", ["- [ ] Add report freshness fixtures"]);
      writeReport(repo, "source-test-evidence", ["# Live Regression Report", "", "Status: in progress.", "", ...currentOutputJsonBlock()]);
      writeText(repo, "tools/autopilot-report-freshness.ts", "export function inspectAutopilotChangeFreshness() {}\n");

      const sourceOnly = inspectAutopilotChangeFreshness({
        root: repo,
        changeId: "source-test-evidence",
        mode: "archive-strict",
        consistencyEvidence: [
          {
            id: "freshness-helper-and-test",
            taskIncludes: "Add report freshness fixtures",
            evidence: [
              { path: "tools/autopilot-report-freshness.ts", contains: "inspectAutopilotChangeFreshness" },
              { path: "tools/test-autopilot-report-freshness.ts", contains: "active-change source and test evidence" },
            ],
          },
        ],
      });
      assertEqual(item(sourceOnly, "active-change-evidence:freshness-helper-and-test").status, "unknown", "Missing test marker should keep evidence unsupported.");

      writeText(repo, "tools/test-autopilot-report-freshness.ts", "// active-change source and test evidence\n");
      const sourceAndTest = inspectAutopilotChangeFreshness({
        root: repo,
        changeId: "source-test-evidence",
        mode: "archive-strict",
        consistencyEvidence: [
          {
            id: "freshness-helper-and-test",
            taskIncludes: "Add report freshness fixtures",
            evidence: [
              { path: "tools/test-autopilot-report-freshness.ts", contains: "active-change source and test evidence" },
              { path: "tools/autopilot-report-freshness.ts", contains: "inspectAutopilotChangeFreshness" },
            ],
          },
        ],
      });
      const activeItem = item(sourceAndTest, "active-change-evidence:freshness-helper-and-test");
      assertEqual(sourceAndTest.valid, false, "Source+test evidence with unchecked task should block archive.");
      assertEqual(activeItem.status, "contradiction", "Source+test evidence with unchecked task should be a contradiction.");
      assertEqual(activeItem.level, "error", "Archive-strict source+test evidence contradiction should be an error.");
      assertEqual(JSON.stringify(activeItem.evidence), JSON.stringify([...activeItem.evidence].sort()), "Evidence paths should be sorted for stable JSON output.");
    }),
  },
  {
    name: "freshness parser avoids unrelated summary JSON and negated ready-to-land prose",
    run: () => withTempRepo("negative-prose", (repo) => {
      writeTasks(repo, "negative-prose", ["- [x] Capture evidence"]);
      writeReport(repo, "negative-prose", [
        "# Live Regression Report",
        "",
        "Status: in progress.",
        "",
        "```json",
        "{ \"summary\": \"unrelated report summary\" }",
        "```",
        "",
        "Not ready to land. No plugin-owned explanation recorded.",
      ]);
      writeLedger(repo, "negative-prose", "Ready");

      const report = inspectAutopilotChangeFreshness({ root: repo, changeId: "negative-prose", mode: "archive-strict" });
      assertEqual(report.valid, true, "Negated ready-to-land prose and unrelated summary JSON should not create strict errors.");
      assertEqual(item(report, "autopilot-output-shape").status, "unknown", "Unrelated one-field summary JSON should not be treated as Autopilot output.");
      assertEqual(item(report, "ready-ledger-state-explanation").status, "pass", "Negated ready-to-land prose should not require Ready ledger explanation.");
      assertTopLevelJsonKeyOrder(formatAutopilotFreshnessReportJson(report));
    }),
  },
  {
    name: "freshness parser avoids unrelated two-key JSON and negated completed status",
    run: () => withTempRepo("negative-completed", (repo) => {
      writeTasks(repo, "negative-completed", ["- [x] Capture evidence"]);
      writeReport(repo, "negative-completed", [
        "# Live Regression Report",
        "",
        "Status: not completed.",
        "",
        "```json",
        "{ \"questions\": [], \"summary\": \"unrelated report summary\" }",
        "```",
      ]);
      writeLedger(repo, "negative-completed", "Ready");

      const report = inspectAutopilotChangeFreshness({ root: repo, changeId: "negative-completed", mode: "archive-strict" });
      assertEqual(report.valid, true, "Negated completed status and unrelated two-key JSON should not create strict errors.");
      assertEqual(item(report, "autopilot-output-shape").status, "unknown", "Unrelated two-key JSON should not be treated as Autopilot output.");
      assertEqual(item(report, "tasks-completion-consistency").status, "pass", "Negated completed status should not contradict checked tasks.");
      assertEqual(item(report, "ready-ledger-state-explanation").status, "pass", "Negated completed status should not require Ready ledger explanation.");
    }),
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
  console.error(`${failed} autopilot report freshness test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot report freshness tests=${tests.length}`);
