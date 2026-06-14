#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { inferChangeSchedule } from "./autopilot-change-graph.ts";
import { isSymlinkPath, realPathIsInside } from "./autopilot-path-safety.ts";
import type { LedgerSummary } from "./openspec-autopilot-output.ts";

type ActiveChangeFilter = {
  changeId?: string;
};

export type ChecklistCounts = {
  checked: number;
  unchecked: number;
  total: number;
};

function toRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export function countMarkdownChecklistItems(text: string): ChecklistCounts {
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
  const schedule = inferChangeSchedule({ root, changeId });
  return {
    path: toRelative(root, taskPath),
    id: changeId,
    sourceKind: "active-change",
    taskType: "planning",
    status: "Ready",
    priority: schedule.priority,
    dependencies: schedule.dependencies,
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

function readActiveChange(root: string, changeId: string, changePath: string, taskPath: string): LedgerSummary[] {
  try {
    if (isSymlinkPath(changePath) || !realPathIsInside(root, changePath)) {
      return [invalidActiveChangeSummary(root, changeId, taskPath, "Active OpenSpec change directory must not be a symlink or escape the repository root.")];
    }
    if (!fs.existsSync(taskPath)) {
      return [];
    }
    if (isSymlinkPath(taskPath) || !realPathIsInside(changePath, taskPath) || !realPathIsInside(root, taskPath)) {
      return [invalidActiveChangeSummary(root, changeId, taskPath, "Active OpenSpec tasks.md must not be a symlink or escape the change directory.")];
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
    .filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && entry.name !== "archive")
    .filter((entry) => filter.changeId == null || entry.name === filter.changeId)
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const changePath = path.join(changesRoot, entry.name);
      return readActiveChange(root, entry.name, changePath, path.join(changePath, "tasks.md"));
    });
}
