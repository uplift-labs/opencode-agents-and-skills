import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DateRange } from "./types.ts";

export const TOOL_NAME = "opencode-project-session-retro-ledger";

export function requireHome(): string {
  const home = os.homedir();
  if (!home) {
    throw new Error("Home directory is not available; pass explicit --db or --data-dir paths.");
  }
  return home;
}

export function expandHome(input: string): string {
  if (input === "~") {
    return requireHome();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(requireHome(), input.slice(2));
  }
  return input;
}

export function resolveInputPath(input: string): string {
  return path.resolve(expandHome(input));
}

export function normalizeForDedupe(input: string): string {
  const resolved = path.resolve(input);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of paths) {
    const key = normalizeForDedupe(candidate);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(candidate);
    }
  }
  return result;
}

export function hashRef(prefix: string, value: string | null | undefined): string {
  const normalized = value == null || value === "" ? "<missing>" : value;
  const digest = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
}

export function redactPath(input: string): string {
  const home = requireHome();
  const resolved = path.resolve(input);
  const relativeToHome = path.relative(home, resolved);
  if (relativeToHome && !relativeToHome.startsWith("..") && !path.isAbsolute(relativeToHome)) {
    return path.join("~", relativeToHome).split(path.sep).join("/");
  }
  return `${hashRef("path", resolved)}:${path.basename(resolved)}`;
}

export function maybePath(input: string, showPaths: boolean): string | undefined {
  return showPaths ? redactPath(input) : undefined;
}

export function quoteIdent(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

export function normalizeCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function normalizeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeMillis(value: unknown): number | null {
  const numeric = normalizeCount(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

function isoTime(value: number | null): string | null {
  if (value == null) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function makeDateRange(values: Array<number | null>): DateRange {
  const concrete = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (concrete.length === 0) {
    return { from: null, to: null };
  }
  return { from: isoTime(Math.min(...concrete)), to: isoTime(Math.max(...concrete)) };
}

export function pathWithinRoot(candidate: string | null | undefined, root: string): boolean {
  if (candidate == null || candidate.trim() === "") {
    return false;
  }
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const normalizedRoot = process.platform === "win32" ? resolvedRoot.toLowerCase() : resolvedRoot;
  const normalizedCandidate = process.platform === "win32" ? resolvedCandidate.toLowerCase() : resolvedCandidate;
  const relative = path.relative(normalizedRoot, normalizedCandidate);
  return relative === "" || (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function safeChangeId(changeId: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(changeId) && !changeId.includes("..") && !changeId.includes("/") && !changeId.includes("\\");
}

export function slug(value: string): string {
  const slugged = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slugged.length > 0 ? slugged.slice(0, 56).replace(/-+$/g, "") : "finding";
}

export function relativePosix(root: string, target: string): string {
  return path.relative(root, target).replaceAll("\\", "/");
}

export function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function fileNeedsWrite(filePath: string, requiredFragments: string[]): boolean {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return true;
  }
  const current = normalizeText(fs.readFileSync(filePath, "utf8"));
  return requiredFragments.some((fragment) => fragment !== "" && !current.includes(fragment));
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function hasOnlyKnownValues<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

export function writeJsonFile(filePath: string, value: unknown, options: { overwrite?: boolean } = {}): void {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    throw new Error(`Output parent directory does not exist: ${parent}`);
  }
  if (fs.existsSync(filePath) && options.overwrite !== true) {
    throw new Error(`Output file already exists; pass --overwrite to replace it: ${filePath}`);
  }
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
