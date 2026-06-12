#!/usr/bin/env node
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export type AutopilotWorktreeActionKind = "create_worktree" | "remove_worktree" | "prune_worktrees";

export type AutopilotWorktreeAction = {
  action: AutopilotWorktreeActionKind;
  taskId?: string;
  changeId?: string;
  worktreePath?: string;
  branch?: string;
  command: string[];
};

export type AutopilotWorktreeBlocker = {
  taskId?: string;
  changeId?: string;
  reason: string;
};

export type AutopilotWorktreeStream = {
  taskId: string;
  changeId: string;
  worktreePath?: string;
  branch?: string;
};

export type AutopilotWorktreeCleanupRecord = Omit<AutopilotWorktreeStream, "worktreePath"> & {
  worktreePath: string;
  worktreeStatus?: "planned" | "created" | "removed";
  mrStatus?: "none" | "open" | "merged" | "closed" | "not-required";
  archiveStatus?: "active" | "completed" | "archived";
};

export type AutopilotWorktreePlan = {
  actions: AutopilotWorktreeAction[];
  blockers: AutopilotWorktreeBlocker[];
  worktrees: Record<string, string>;
};

export type AutopilotWorktreeCreationOptions = {
  root?: string;
  branchPrefix?: string;
  baseRef?: string;
};

export type AutopilotWorktreeLifecycleMode = "create" | "cleanup";

export type AutopilotWorktreeLifecycleInput = {
  mode?: AutopilotWorktreeLifecycleMode;
  streams?: AutopilotWorktreeStream[];
  records?: AutopilotWorktreeCleanupRecord[];
  options?: AutopilotWorktreeCreationOptions;
};

const defaultRoot = "autopilot";
const defaultBranchPrefix = "autopilot";
const defaultBaseRef = "HEAD";

function safeSegment(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

function normalizedRelativePath(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return null;
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }
  return normalized;
}

function safeRoot(value: string | undefined, fallback: string): string | null {
  const normalized = normalizedRelativePath(value ?? fallback);
  if (normalized == null || normalized.includes("/")) {
    return null;
  }
  return safeSegment(normalized) ? normalized : null;
}

function safeGitRef(value: string): boolean {
  return value.length > 0
    && !value.startsWith("-")
    && !/[\s\\~^:?*[\]\x00-\x1F\x7F]/.test(value)
    && !value.includes("..")
    && !value.includes("@{")
    && !value.endsWith(".")
    && !value.endsWith("/")
    && !value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..");
}

export function worktreePathForStream(changeId: string, taskId: string, root = defaultRoot): string | null {
  const normalizedRoot = safeRoot(root, defaultRoot);
  if (normalizedRoot == null || !safeSegment(changeId) || !safeSegment(taskId)) {
    return null;
  }
  return `${normalizedRoot}/${changeId}/${taskId}`;
}

function branchForStream(changeId: string, taskId: string, branchPrefix = defaultBranchPrefix): string | null {
  const normalizedPrefix = safeRoot(branchPrefix, defaultBranchPrefix);
  if (normalizedPrefix == null || !safeSegment(changeId) || !safeSegment(taskId)) {
    return null;
  }
  return `${normalizedPrefix}/${changeId}/${taskId}`;
}

export function validateOwnedWorktreePath(pathValue: string, taskId: string, root = defaultRoot): { path?: string; reason?: string } {
  const normalizedRoot = safeRoot(root, defaultRoot);
  if (normalizedRoot == null) {
    return { reason: "worktree root must be a single safe relative segment" };
  }
  const normalized = normalizedRelativePath(pathValue);
  if (normalized == null) {
    return { reason: "worktree path must be an owned relative autopilot path without traversal" };
  }
  if (!normalized.startsWith(`${normalizedRoot}/`)) {
    return { reason: "worktree path must be an owned relative autopilot path" };
  }
  if (!normalized.split("/").includes(taskId)) {
    return { reason: "worktree path does not include task id as a path segment" };
  }
  return { path: normalized };
}

function validOwnedBranchName(branchValue: string, changeId: string, taskId: string, branchPrefix = defaultBranchPrefix): { branch?: string; reason?: string } {
  const normalizedPrefix = safeRoot(branchPrefix, defaultBranchPrefix);
  if (normalizedPrefix == null) {
    return { reason: "branch prefix must be a single safe relative segment" };
  }
  const normalized = normalizedRelativePath(branchValue);
  if (normalized == null || !normalized.startsWith(`${normalizedPrefix}/`)) {
    return { reason: "worktree branch must be an owned relative autopilot branch without traversal" };
  }
  if (!safeGitRef(normalized)) {
    return { reason: "worktree branch must be a safe git ref name" };
  }
  const segments = normalized.split("/");
  if (!segments.includes(changeId) || !segments.includes(taskId)) {
    return { reason: "worktree branch must include change id and task id path segments" };
  }
  return { branch: normalized };
}

export function planParallelWorktreeCreation(streams: AutopilotWorktreeStream[], options: AutopilotWorktreeCreationOptions = {}): AutopilotWorktreePlan {
  const blockers: AutopilotWorktreeBlocker[] = [];
  const actions: AutopilotWorktreeAction[] = [];
  const worktrees: Record<string, string> = {};
  const usedPaths = new Set<string>();
  const root = options.root ?? defaultRoot;
  const baseRef = options.baseRef ?? defaultBaseRef;
  if (!safeGitRef(baseRef)) {
    return { actions: [], blockers: [{ reason: "baseRef must be a safe git ref token" }], worktrees: {} };
  }

  for (const stream of streams) {
    const taskId = stream.taskId.trim();
    const changeId = stream.changeId.trim();
    if (!safeSegment(taskId) || !safeSegment(changeId)) {
      blockers.push({ taskId: stream.taskId, changeId: stream.changeId, reason: "task id and change id must be safe path segments before worktree creation" });
      continue;
    }
    const plannedPath = stream.worktreePath ?? worktreePathForStream(changeId, taskId, root);
    const rawBranch = stream.branch ?? branchForStream(changeId, taskId, options.branchPrefix);
    if (plannedPath == null || rawBranch == null) {
      blockers.push({ taskId, changeId, reason: "worktree path and branch could not be derived from safe stream identifiers" });
      continue;
    }
    const pathValidation = validateOwnedWorktreePath(plannedPath, taskId, root);
    if (pathValidation.path == null) {
      blockers.push({ taskId, changeId, reason: pathValidation.reason ?? "invalid worktree path" });
      continue;
    }
    const branchValidation = validOwnedBranchName(rawBranch, changeId, taskId, options.branchPrefix);
    if (branchValidation.branch == null) {
      blockers.push({ taskId, changeId, reason: branchValidation.reason ?? "invalid worktree branch" });
      continue;
    }
    if (usedPaths.has(pathValidation.path)) {
      blockers.push({ taskId, changeId, reason: `worktree path ${pathValidation.path} is already assigned to another stream` });
      continue;
    }
    usedPaths.add(pathValidation.path);
    worktrees[taskId] = pathValidation.path;
    actions.push({
      action: "create_worktree",
      taskId,
      changeId,
      worktreePath: pathValidation.path,
      branch: branchValidation.branch,
      command: ["git", "worktree", "add", "-b", branchValidation.branch, pathValidation.path, baseRef],
    });
  }

  return blockers.length > 0 ? { actions: [], blockers, worktrees: {} } : { actions, blockers, worktrees };
}

export function planArchiveWorktreeCleanup(records: AutopilotWorktreeCleanupRecord[], options: Pick<AutopilotWorktreeCreationOptions, "root"> = {}): AutopilotWorktreePlan {
  const blockers: AutopilotWorktreeBlocker[] = [];
  const actions: AutopilotWorktreeAction[] = [];
  const worktrees: Record<string, string> = {};

  for (const record of records) {
    const pathValidation = validateOwnedWorktreePath(record.worktreePath, record.taskId, options.root ?? defaultRoot);
    if (pathValidation.path == null) {
      blockers.push({ taskId: record.taskId, changeId: record.changeId, reason: pathValidation.reason ?? "invalid worktree path" });
      continue;
    }
    worktrees[record.taskId] = pathValidation.path;
    if (record.mrStatus !== "merged") {
      blockers.push({ taskId: record.taskId, changeId: record.changeId, reason: "parallel worktree cleanup requires MR merged evidence" });
      continue;
    }
    if (record.archiveStatus !== "archived") {
      blockers.push({ taskId: record.taskId, changeId: record.changeId, reason: "parallel worktree cleanup requires archived change evidence" });
      continue;
    }
    if (record.worktreeStatus !== "removed") {
      actions.push({
        action: "remove_worktree",
        taskId: record.taskId,
        changeId: record.changeId,
        worktreePath: pathValidation.path,
        branch: record.branch,
        command: ["git", "worktree", "remove", pathValidation.path],
      });
    }
  }

  if (blockers.length === 0 && actions.some((action) => action.action === "remove_worktree")) {
    actions.push({ action: "prune_worktrees", command: ["git", "worktree", "prune"] });
  }

  return blockers.length > 0 ? { actions: [], blockers, worktrees } : { actions, blockers, worktrees };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function parseLifecycleInput(value: unknown): AutopilotWorktreeLifecycleInput {
  if (!isRecord(value)) {
    throw new Error("Worktree lifecycle input must be a JSON object.");
  }
  return value as AutopilotWorktreeLifecycleInput;
}

export function planWorktreeLifecycleFromInput(input: AutopilotWorktreeLifecycleInput): AutopilotWorktreePlan {
  const mode = input.mode ?? (input.records != null ? "cleanup" : "create");
  if (mode === "cleanup") {
    return planArchiveWorktreeCleanup(input.records ?? [], input.options);
  }
  return planParallelWorktreeCreation(input.streams ?? [], input.options);
}

function cliArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const inputPath = cliArgument("--input");
    if (inputPath == null) {
      throw new Error("Usage: node tools/autopilot-worktree-lifecycle.ts --input <plan.json>");
    }
    const input = parseLifecycleInput(JSON.parse(fs.readFileSync(inputPath, "utf8")));
    const mode = cliArgument("--mode");
    if (mode === "create" || mode === "cleanup") {
      input.mode = mode;
    }
    console.log(JSON.stringify(planWorktreeLifecycleFromInput(input), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
