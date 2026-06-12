#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { isSymlinkPath, realPathIsInside } from "./autopilot-path-safety.ts";
import type { LedgerSummary } from "./openspec-autopilot-output.ts";

type ActiveChangeFilter = {
  changeId?: string;
};

type ChecklistCounts = {
  checked: number;
  unchecked: number;
  total: number;
};

function toRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function countMarkdownChecklistItems(text: string): ChecklistCounts {
  let checked = 0;
  let unchecked = 0;
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*[-*]\s+\[([ xX])\]\s+/.exec(line);
    if (match == null) {
      continue;
    }
    if (match[1] === " ") {
      unchecked++;
    } else {
      checked++;
    }
  }
  return { checked, unchecked, total: checked + unchecked };
}

function invalidActiveChangeSummary(root: string, changeId: string, taskPath: string, reason: string): LedgerSummary {
  return {
    path: toRelative(root, taskPath),
    id: changeId,
    sourceKind: "active-change",
    taskType: "planning",
    status: "Blocked",
    priority: "medium",
    dependencies: [],
    writeScope: [],
    forbiddenScope: ["openspec/changes/*/automation/**", ".autopilot/**"],
    writeScopeSize: 0,
    valid: false,
    errors: [reason],
    blockers: [{ reason }],
    checkedTasks: 0,
    uncheckedTasks: 0,
    totalTasks: 0,
  };
}

function activeChangeSummary(root: string, changeId: string, taskPath: string, counts: ChecklistCounts): LedgerSummary | null {
  if (counts.unchecked === 0) {
    return null;
  }
  return {
    path: toRelative(root, taskPath),
    id: changeId,
    sourceKind: "active-change",
    taskType: "planning",
    status: "Ready",
    priority: "medium",
    dependencies: [],
    writeScope: [],
    forbiddenScope: ["openspec/changes/*/automation/**", ".autopilot/**"],
    writeScopeSize: 0,
    valid: true,
    errors: [],
    blockers: [],
    checkedTasks: counts.checked,
    uncheckedTasks: counts.unchecked,
    totalTasks: counts.total,
  };
}

function readActiveChange(root: string, changeId: string, taskPath: string): LedgerSummary[] {
  try {
    if (!fs.existsSync(taskPath)) {
      return [];
    }
    const stat = fs.statSync(taskPath);
    if (!stat.isFile()) {
      return [invalidActiveChangeSummary(root, changeId, taskPath, "Active OpenSpec tasks.md exists but is not a file.")];
    }
    const counts = countMarkdownChecklistItems(fs.readFileSync(taskPath, "utf8"));
    const summary = activeChangeSummary(root, changeId, taskPath, counts);
    return summary == null ? [] : [summary];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [invalidActiveChangeSummary(root, changeId, taskPath, `Failed to read active OpenSpec tasks.md: ${message}`)];
  }
}

export function readActiveChangeSummaries(root: string, ledgerRoot: string, filter: ActiveChangeFilter = {}): LedgerSummary[] {
  const changesRoot = path.join(root, ledgerRoot);
  if (!fs.existsSync(changesRoot) || !fs.statSync(changesRoot).isDirectory()) {
    return [];
  }
  if (isSymlinkPath(changesRoot) || !realPathIsInside(root, changesRoot)) {
    return [];
  }

  return fs.readdirSync(changesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "archive")
    .filter((entry) => filter.changeId == null || entry.name === filter.changeId)
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => readActiveChange(root, entry.name, path.join(changesRoot, entry.name, "tasks.md")));
}
