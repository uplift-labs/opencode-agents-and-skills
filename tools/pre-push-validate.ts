#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type ValidationCommand = {
  label: string;
  command: string;
  args: string[];
};

export function buildPrePushValidationPlan(root: string): ValidationCommand[] {
  const plan: ValidationCommand[] = [
    { label: "Repository validation", command: "npm", args: ["run", "validate"] },
    { label: "Repository tests", command: "npm", args: ["test"] },
  ];

  if (fs.existsSync(path.join(root, "openspec"))) {
    plan.push({ label: "OpenSpec validation", command: "openspec", args: ["validate", "--all"] });
  }

  return plan;
}

export function exitCodeFromSpawnResult(result: { status: number | null; signal?: NodeJS.Signals | null }): number {
  if (result.status == null) {
    return 1;
  }
  return result.status;
}

function runCommand(root: string, command: ValidationCommand): number {
  console.log(`==> ${command.label}: ${command.command} ${command.args.join(" ")}`);
  const executable = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : command.command;
  const args = process.platform === "win32" ? ["/d", "/s", "/c", [command.command, ...command.args].join(" ")] : command.args;
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`Failed to start ${command.label}: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`${command.label} terminated by signal ${result.signal}.`);
  }
  return exitCodeFromSpawnResult(result);
}

function defaultRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function runCli(): number {
  const root = defaultRoot();
  for (const command of buildPrePushValidationPlan(root)) {
    const exitCode = runCommand(root, command);
    if (exitCode !== 0) {
      console.error(`Pre-push validation failed at ${command.label}.`);
      return exitCode;
    }
  }
  console.log("Pre-push validation passed.");
  return 0;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href);
}

if (isMainModule()) {
  process.exitCode = runCli();
}
