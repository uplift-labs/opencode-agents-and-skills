#!/usr/bin/env node
import { buildChangeGraph, inferChangeSchedule, parallelReadyChanges, topologicalLevels } from "./autopilot-change-graph.ts";

type TestCase = { name: string; run: () => void };

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`);
  }
}

const tests: TestCase[] = [
  {
    name: "infers explicit schedule markers deterministically",
    run: () => {
      const schedule = inferChangeSchedule({
        changeId: "feature-b",
        docs: [{ path: "proposal.md", text: "Priority: high\nDepends-On: platform-a\nBlocks: docs-c\n" }],
      });
      assertEqual(schedule.priority, "high", "Priority marker should win.");
      assertEqual(schedule.dependencies, ["platform-a"], "Depends-On marker should become dependency.");
      assertEqual(schedule.blocks, ["docs-c"], "Blocks marker should be captured for reverse dependency.");
      assertEqual(schedule.source, "explicit", "Marker-backed schedule should be explicit.");
    },
  },
  {
    name: "builds levels, reverse blocks, and parallel ready output",
    run: () => {
      const graph = buildChangeGraph([
        { changeId: "platform-a", writeScope: ["tools/a"] },
        { changeId: "feature-b", docs: [{ path: "proposal.md", text: "Depends-On: platform-a\n" }], writeScope: ["tools/b"] },
        { changeId: "docs-c", docs: [{ path: "proposal.md", text: "Blocks: feature-b\n" }], writeScope: ["docs/c"] },
      ]);
      assertEqual(topologicalLevels(graph), [["docs-c", "platform-a"], ["feature-b"]], "Levels should include explicit and reverse dependencies.");
      assertEqual(parallelReadyChanges(graph), ["docs-c", "platform-a"], "Disjoint first-level changes should be parallel-ready.");
      assertEqual(graph.dependencyBlocked.find((item) => item.changeId === "feature-b")?.dependencies, ["docs-c", "platform-a"], "Feature should be blocked by dependency plus reverse block.");
    },
  },
  {
    name: "orders ready graph output by priority before id",
    run: () => {
      const graph = buildChangeGraph([
        { changeId: "low-z", priority: "low", writeScope: ["docs/low"] },
        { changeId: "medium-a", priority: "medium", writeScope: ["docs/medium"] },
        { changeId: "critical-b", priority: "critical", writeScope: ["docs/critical-b"] },
        { changeId: "critical-a", priority: "critical", writeScope: ["docs/critical-a"] },
        { changeId: "high-a", priority: "high", docs: [{ path: "proposal.md", text: "Depends-On: critical-a\n" }], writeScope: ["docs/high"] },
      ]);
      assertEqual(topologicalLevels(graph), [["critical-a", "critical-b", "medium-a", "low-z"], ["high-a"]], "Levels should be priority ordered within each dependency layer.");
      assertEqual(parallelReadyChanges(graph), ["critical-a", "critical-b", "medium-a", "low-z"], "Parallel-ready output should preserve priority order.");
      assertEqual(graph.nodes.map((node) => node.changeId), ["critical-a", "critical-b", "high-a", "medium-a", "low-z"], "Node output should be priority ordered for deterministic diagnostics.");
    },
  },
  {
    name: "reports conflicts and unresolved dependencies without inventing authority",
    run: () => {
      const graph = buildChangeGraph([
        { changeId: "change-a", docs: [{ path: "proposal.md", text: "Depends-On: missing-change\n" }], writeScope: ["tools/shared"] },
        { changeId: "change-b", writeScope: ["tools/shared/sub"] },
      ]);
      assertEqual(graph.nodes.find((node) => node.changeId === "change-a")?.unresolvedDependencies, ["missing-change"], "Missing dependency should be unresolved evidence.");
      assertEqual(graph.conflicts, [
        { changeId: "change-a", conflictsWith: ["change-b"] },
        { changeId: "change-b", conflictsWith: ["change-a"] },
      ], "Overlapping write scopes should be conflicts, not dependencies.");
    },
  },
  {
    name: "filters unsafe dependency ids before graph output",
    run: () => {
      const graph = buildChangeGraph([
        { changeId: "safe-change", dependencies: ["../escape", "valid-dependency", "bad/name"] },
        { changeId: "valid-dependency" },
      ]);
      assertEqual(graph.nodes.find((node) => node.changeId === "safe-change")?.dependencies, ["valid-dependency"], "Graph must not emit unsafe dependency ids.");
    },
  },
  {
    name: "detects dependency cycles deterministically",
    run: () => {
      const graph = buildChangeGraph([
        { changeId: "a", docs: [{ path: "proposal.md", text: "Depends-On: b\n" }] },
        { changeId: "b", docs: [{ path: "proposal.md", text: "Depends-On: a\n" }] },
      ]);
      assertEqual(graph.cycles, [["a", "b"]], "Cycle should be reported as stable id set.");
      assertEqual(graph.levels, [], "Cycle-only graph should have no topological levels.");
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
    console.error(`FAIL ${test.name}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (failed > 0) {
  throw new Error(`${failed} change graph test(s) failed.`);
}
console.log(`OK: autopilot change graph tests=${tests.length}`);
