#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type ValidationCommand = {
  label: string;
  command: string;
  args: string[];
  skipReason?: string;
};

export type ValidationCommandResult = {
  status: number | null;
  signal?: NodeJS.Signals | null;
  error?: Error | null;
};

export type ValidationCommandRunner = (root: string, command: ValidationCommand) => ValidationCommandResult;

export type PrePushGitDiffRunner = (root: string, args: string[]) => { status: number | null; stdout?: string; error?: Error | null };

export type ValidationOutput = {
  log: (message: string) => void;
  error: (message: string) => void;
};

export type BuildPrePushValidationPlanOptions = {
  changedFiles?: string[];
};

export type RunPrePushValidationOptions = {
  runner?: ValidationCommandRunner;
  output?: ValidationOutput;
  changedFiles?: string[];
};

export type RunPrePushValidationFromInputOptions = RunPrePushValidationOptions & {
  diffRunner?: PrePushGitDiffRunner;
};

const emptyTreeSha = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function quoteWindowsCommandArg(value: string): string {
  if (/^[A-Za-z0-9._/:\\=-]+$/.test(value)) {
    return value;
  }
  return `"${value.replaceAll("\"", "\\\"")}"`;
}

function spawnValidationCommand(root: string, command: ValidationCommand): ReturnType<typeof spawnSync> {
  if (command.command === "node") {
    return spawnSync(process.execPath, command.args, { cwd: root, encoding: "utf8", stdio: "inherit", shell: false });
  }
  if (process.platform === "win32") {
    const executable = process.env.ComSpec ?? "cmd.exe";
    const commandLine = [command.command, ...command.args].map(quoteWindowsCommandArg).join(" ");
    return spawnSync(executable, ["/d", "/s", "/c", commandLine], { cwd: root, encoding: "utf8", stdio: "inherit", shell: false });
  }
  return spawnSync(command.command, command.args, { cwd: root, encoding: "utf8", stdio: "inherit", shell: false });
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function isZeroSha(value: string): boolean {
  return /^0{40}$/.test(value);
}

function isCommitSha(value: string): boolean {
  return /^[0-9a-fA-F]{40}$/.test(value);
}

function defaultPrePushGitDiffRunner(root: string, args: string[]): { status: number | null; stdout?: string; error?: Error | null } {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 1024 * 1024 });
  return { status: result.status, stdout: result.stdout ?? "", error: result.error ?? null };
}

function changedFilesFromOutput(output: string): string[] {
  return output.split(/\r?\n/).map((line) => normalizePath(line.trim())).filter((line) => line.length > 0);
}

function activeOpenSpecScopeFiles(root: string): string[] {
  const changesRoot = path.join(root, "openspec", "changes");
  if (!fs.existsSync(changesRoot)) {
    return [];
  }
  return fs.readdirSync(changesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "archive")
    .flatMap((entry) => {
      const tasksPath = path.join(changesRoot, entry.name, "tasks.md");
      return fs.existsSync(tasksPath) ? [`openspec/changes/${entry.name}/tasks.md`] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

export function collectPrePushChangedFiles(root: string, input: string, runner: PrePushGitDiffRunner = defaultPrePushGitDiffRunner): string[] | undefined {
  const files: string[] = [];
  let sawRefUpdate = false;
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const [, localSha, , remoteSha] = trimmed.split(/\s+/);
    if (!isCommitSha(localSha ?? "") || !isCommitSha(remoteSha ?? "") || isZeroSha(localSha)) {
      continue;
    }
    sawRefUpdate = true;
    const args = isZeroSha(remoteSha)
      ? ["diff", "--name-only", "--diff-filter=ACMRT", emptyTreeSha, localSha]
      : ["diff", "--name-only", "--diff-filter=ACMRT", remoteSha, localSha];
    const result = runner(root, args);
    if (result.error || result.status !== 0) {
      return activeOpenSpecScopeFiles(root);
    }
    files.push(...changedFilesFromOutput(result.stdout ?? ""));
  }
  if (!sawRefUpdate) {
    return undefined;
  }
  return Array.from(new Set(files)).sort((left, right) => left.localeCompare(right));
}

export function buildPrePushValidationPlan(root: string, options: BuildPrePushValidationPlanOptions = {}): ValidationCommand[] {
  const plan: ValidationCommand[] = [
    { label: "Repository validation", command: "npm", args: ["run", "validate"] },
  ];

  if (fs.existsSync(path.join(root, "openspec"))) {
    plan.push({ label: "OpenSpec operation prepush gate", command: "npm", args: ["run", "openspec:gate", "--", "--operation", "prepush"] });
    plan.push({ label: "Repository tests", command: "npm", args: ["test"] });
    plan.push({ label: "OpenSpec validation", command: "npm", args: ["run", "openspec:validate"] });
  } else {
    plan.push({ label: "Repository tests", command: "npm", args: ["test"] });
  }

  return plan;
}

export function exitCodeFromSpawnResult(result: { status: number | null; signal?: NodeJS.Signals | null }): number {
  if (result.status == null) {
    return 1;
  }
  return result.status;
}

function defaultCommandRunner(root: string, command: ValidationCommand): ValidationCommandResult {
  const result = spawnValidationCommand(root, command);
  return { status: result.status, signal: result.signal, error: result.error ?? null };
}

function runCommand(root: string, command: ValidationCommand, runner: ValidationCommandRunner, output: ValidationOutput): number {
  if (command.skipReason) {
    output.log(`==> ${command.label}: not-applicable - ${command.skipReason}`);
    return 0;
  }
  output.log(`==> ${command.label}: ${command.command} ${command.args.join(" ")}`);
  const result = runner(root, command);
  if (result.error) {
    output.error(`Failed to start ${command.label}: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    output.error(`${command.label} terminated by signal ${result.signal}.`);
  }
  return exitCodeFromSpawnResult(result);
}

function defaultRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function runPrePushValidation(root: string, options: RunPrePushValidationOptions = {}): number {
  const runner = options.runner ?? defaultCommandRunner;
  const output = options.output ?? { log: console.log, error: console.error };
  for (const command of buildPrePushValidationPlan(root, { changedFiles: options.changedFiles })) {
    const exitCode = runCommand(root, command, runner, output);
    if (exitCode !== 0) {
      output.error(`Pre-push validation failed at ${command.label}.`);
      return exitCode;
    }
  }
  output.log("Pre-push validation passed.");
  return 0;
}

export function runPrePushValidationFromInput(root: string, input: string, options: RunPrePushValidationFromInputOptions = {}): number {
  return runPrePushValidation(root, {
    ...options,
    changedFiles: options.changedFiles ?? collectPrePushChangedFiles(root, input, options.diffRunner),
  });
}

function runCli(): number {
  const root = defaultRoot();
  const stdin = process.stdin.isTTY ? "" : fs.readFileSync(0, "utf8");
  return runPrePushValidationFromInput(root, stdin);
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href);
}

if (isMainModule()) {
  process.exitCode = runCli();
}
