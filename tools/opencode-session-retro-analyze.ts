#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type OutputFormat = "json" | "markdown";

type Options = {
  dataDirs: string[];
  dbPaths: string[];
  format: OutputFormat;
  maxBuckets: number;
  outPath: string | null;
  overwrite: boolean;
  showPaths: boolean;
  useDefaultPaths: boolean;
};

type DateRange = {
  from: string | null;
  to: string | null;
};

type CountBucket = {
  count: number;
  key: string;
};

type StatusBucket = {
  count: number;
  status: string;
};

type ToolBucket = {
  count: number;
  tool: string;
};

type ToolStatusBucket = {
  count: number;
  status: string;
  tool: string;
};

type RedactedBucket = {
  childSessions?: number;
  count: number;
  dateRange?: DateRange;
  ref: string;
};

type DayBucket = {
  archivedSessions: number;
  childSessions: number;
  day: string;
  projectRefs: number;
  sessions: number;
};

type StructuredEnvelope = {
  keyCounts: CountBucket[];
  parsedRows: number;
  roleCounts?: CountBucket[];
  typeCounts?: CountBucket[];
  unreadableRows: number;
};

type ToolEnvelope = {
  errorToolStatusCounts: ToolStatusBucket[];
  errorStatusSessions: number;
  errorStatusToolParts: number;
  inputKeyCounts: CountBucket[];
  statusCounts: StatusBucket[];
  toolCounts: ToolBucket[];
  toolParts: number;
  toolStatusCounts: ToolStatusBucket[];
};

type SessionSummary = {
  archivedSessions: number;
  childSessions: number;
  compactingSessions: number;
  dateRange: DateRange;
  rootSessions: number;
  sessionShareRows: number;
  sessions: number;
  shareUrlSessions: number;
  summaryAdditions: number;
  summaryDeletions: number;
  summaryFiles: number;
  sessionsWithFileSummaries: number;
};

type SqliteAnalysis = {
  agentBuckets: RedactedBucket[];
  counts: Record<string, number>;
  dateRange: DateRange;
  dayBuckets: DayBucket[];
  eventTypeCounts: CountBucket[];
  messageEnvelope: StructuredEnvelope;
  modelBuckets: RedactedBucket[];
  partEnvelope: StructuredEnvelope;
  path?: string;
  permissionRows: number;
  projectBuckets: RedactedBucket[];
  readable: boolean;
  schema: Record<string, string[]>;
  schemaTables: string[];
  sessionInputDeliveries: CountBucket[];
  sessionMessageTypes: CountBucket[];
  sessionSummary: SessionSummary;
  sourceRef: string;
  status: string;
  todoCounts: Array<{ count: number; priority: string; status: string }>;
  toolEnvelope: ToolEnvelope;
  type: "sqlite-opencode-analysis";
  warnings: string[];
};

type Coverage = {
  dateRange: DateRange;
  messageRows: number;
  partRows: number;
  readableSources: number;
  sources: number;
  totalSessions: number;
};

type AnalysisReport = {
  coverage: Coverage;
  coverageLimits: string[];
  discovery: {
    checkedDataDirs: number;
    explicitDbPaths: number;
    showPaths: boolean;
    useDefaultPaths: boolean;
  };
  generatedAt: string;
  privacyNotes: string[];
  redacted: boolean;
  sources: SqliteAnalysis[];
  tool: string;
  version: number;
};

const TOOL_NAME = "opencode-session-retro-analyze";
const TOOL_VERSION = 1;
const DEFAULT_MAX_BUCKETS = 50;
const KNOWN_SQLITE_TABLES = [
  "project",
  "project_directory",
  "workspace",
  "session",
  "message",
  "part",
  "session_message",
  "session_input",
  "session_share",
  "todo",
  "event",
  "event_sequence",
  "permission",
  "session_context_epoch",
  "account",
  "account_state",
  "control_account",
  "data_migration",
  "migration",
  "__drizzle_migrations",
];

function printUsage(): void {
  console.log(`Usage:
  npm run retro:analyze -- [options]

Options:
  --db <path>              Read an explicit OpenCode SQLite database. Repeatable.
  --data-dir <path>        Add an OpenCode data directory containing opencode.db. Repeatable.
  --only-explicit          Use only --db and --data-dir paths.
  --format <json|markdown> Output format. Default: markdown.
  --out <path>             Write output to an existing directory path target instead of stdout.
  --overwrite              Allow --out to replace an existing file.
  --show-paths             Include home-redacted source paths. Default hides paths.
  --max-buckets <n>        Maximum rows per aggregate bucket list. Default: ${DEFAULT_MAX_BUCKETS}.
  --help                   Show this help.
`);
}

function readOptionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.trim() === "" || value.startsWith("-")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function readInlineOptionValue(value: string, name: string): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function readPositiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseFormat(value: string): OutputFormat {
  if (value === "json" || value === "markdown") {
    return value;
  }
  throw new Error(`Unsupported --format value: ${value}`);
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    dataDirs: [],
    dbPaths: [],
    format: "markdown",
    maxBuckets: DEFAULT_MAX_BUCKETS,
    outPath: null,
    overwrite: false,
    showPaths: false,
    useDefaultPaths: true,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--db") {
      options.dbPaths.push(resolveInputPath(readOptionValue(args, index, arg)));
      index++;
    } else if (arg.startsWith("--db=")) {
      options.dbPaths.push(resolveInputPath(readInlineOptionValue(arg.slice("--db=".length), "--db")));
    } else if (arg === "--data-dir") {
      options.dataDirs.push(resolveInputPath(readOptionValue(args, index, arg)));
      index++;
    } else if (arg.startsWith("--data-dir=")) {
      options.dataDirs.push(resolveInputPath(readInlineOptionValue(arg.slice("--data-dir=".length), "--data-dir")));
    } else if (arg === "--only-explicit") {
      options.useDefaultPaths = false;
    } else if (arg === "--format") {
      options.format = parseFormat(readOptionValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--format=")) {
      options.format = parseFormat(readInlineOptionValue(arg.slice("--format=".length), "--format"));
    } else if (arg === "--out") {
      options.outPath = resolveInputPath(readOptionValue(args, index, arg));
      index++;
    } else if (arg.startsWith("--out=")) {
      options.outPath = resolveInputPath(readInlineOptionValue(arg.slice("--out=".length), "--out"));
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else if (arg === "--show-paths") {
      options.showPaths = true;
    } else if (arg === "--max-buckets") {
      options.maxBuckets = readPositiveInteger(readOptionValue(args, index, arg), "--max-buckets");
      index++;
    } else if (arg.startsWith("--max-buckets=")) {
      options.maxBuckets = readPositiveInteger(readInlineOptionValue(arg.slice("--max-buckets=".length), "--max-buckets"), "--max-buckets");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function requireHome(): string {
  const home = os.homedir();
  if (!home) {
    throw new Error("Home directory is not available; pass explicit --db or --data-dir paths.");
  }
  return home;
}

function expandHome(input: string): string {
  if (input === "~") {
    return requireHome();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(requireHome(), input.slice(2));
  }
  return input;
}

function resolveInputPath(input: string): string {
  return path.resolve(expandHome(input));
}

function normalizeForDedupe(input: string): string {
  const resolved = path.resolve(input);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function uniquePaths(paths: string[]): string[] {
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

function candidateDataDirs(options: Options): string[] {
  const candidates = [...options.dataDirs];
  if (!options.useDefaultPaths) {
    return uniquePaths(candidates);
  }
  const home = requireHome();
  if (process.env.OPENCODE_DATA_DIR) {
    candidates.push(resolveInputPath(process.env.OPENCODE_DATA_DIR));
  }
  if (process.env.XDG_DATA_HOME) {
    candidates.push(path.join(resolveInputPath(process.env.XDG_DATA_HOME), "opencode"));
  }
  candidates.push(path.join(home, ".local", "share", "opencode"));
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, "opencode"));
  }
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, "opencode"));
  }
  candidates.push(path.join(home, "Library", "Application Support", "opencode"));
  return uniquePaths(candidates);
}

function discoverDbPaths(options: Options, dataDirs: string[]): string[] {
  const candidates = [...options.dbPaths];
  const explicitDataDirs = new Set(options.dataDirs.map((dir) => normalizeForDedupe(dir)));
  for (const dir of dataDirs) {
    const dbPath = path.join(dir, "opencode.db");
    if (explicitDataDirs.has(normalizeForDedupe(dir)) || fs.existsSync(dbPath)) {
      candidates.push(dbPath);
    }
  }
  return uniquePaths(candidates);
}

function hashRef(prefix: string, value: string | null | undefined): string {
  const normalized = value == null || value === "" ? "<missing>" : value;
  const digest = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
}

function redactPath(input: string): string {
  const home = requireHome();
  const resolved = path.resolve(input);
  const relativeToHome = path.relative(home, resolved);
  if (relativeToHome && !relativeToHome.startsWith("..") && !path.isAbsolute(relativeToHome)) {
    return path.join("~", relativeToHome).split(path.sep).join("/");
  }
  return `${hashRef("path", resolved)}:${path.basename(resolved)}`;
}

function maybePath(input: string, showPaths: boolean): string | undefined {
  return showPaths ? redactPath(input) : undefined;
}

function quoteIdent(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function normalizeCount(value: unknown): number {
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

function normalizeMillis(value: unknown): number | null {
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

function makeDateRange(values: Array<number | null>): DateRange {
  const concrete = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (concrete.length === 0) {
    return { from: null, to: null };
  }
  return { from: isoTime(Math.min(...concrete)), to: isoTime(Math.max(...concrete)) };
}

function mergeDateRanges(ranges: DateRange[]): DateRange {
  const millis = ranges.flatMap((range) => [Date.parse(range.from ?? ""), Date.parse(range.to ?? "")]).filter((value) => Number.isFinite(value));
  return makeDateRange(millis);
}

function tableNames(db: InstanceType<typeof DatabaseSync>): string[] {
  const rows = db.prepare("select name from sqlite_master where type = 'table' order by name").all() as Array<{ name: unknown }>;
  return rows.map((row) => String(row.name));
}

function tableColumns(db: InstanceType<typeof DatabaseSync>, table: string): string[] {
  const rows = db.prepare(`pragma table_info(${quoteIdent(table)})`).all() as Array<{ name: unknown }>;
  return rows.map((row) => String(row.name));
}

function countRows(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, table: string): number {
  if (!tables.has(table)) {
    return 0;
  }
  const row = db.prepare(`select count(*) as count from ${quoteIdent(table)}`).get() as { count: unknown } | undefined;
  return normalizeCount(row?.count);
}

function hasColumn(schema: Record<string, string[]>, table: string, column: string): boolean {
  return schema[table]?.includes(column) ?? false;
}

function safeSelectSessionCount(db: InstanceType<typeof DatabaseSync>, schema: Record<string, string[]>, condition: string): number {
  if (!schema.session) {
    return 0;
  }
  const row = db.prepare(`select count(*) as count from session where ${condition}`).get() as { count: unknown } | undefined;
  return normalizeCount(row?.count);
}

function sqlSumExpression(schema: Record<string, string[]>, table: string, column: string): string {
  return hasColumn(schema, table, column) ? `sum(coalesce(${quoteIdent(column)}, 0))` : "0";
}

function sqlCountCondition(schema: Record<string, string[]>, column: string, condition: string): string {
  return hasColumn(schema, "session", column) ? `sum(case when ${condition} then 1 else 0 end)` : "0";
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedCountBuckets(map: Map<string, number>, maxBuckets: number): CountBucket[] {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, maxBuckets)
    .map(([key, count]) => ({ key, count }));
}

function sortedStatusBuckets(map: Map<string, number>, maxBuckets: number): StatusBucket[] {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, maxBuckets)
    .map(([status, count]) => ({ status, count }));
}

function sortedToolBuckets(map: Map<string, number>, maxBuckets: number): ToolBucket[] {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, maxBuckets)
    .map(([tool, count]) => ({ tool, count }));
}

function sortedToolStatusBuckets(map: Map<string, number>, maxBuckets: number): ToolStatusBucket[] {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, maxBuckets)
    .map(([key, count]) => {
      const [tool, status] = key.split("\u0000", 2);
      return { tool, status, count };
    });
}

function safeJsonRecord(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (_error) {
    return null;
  }
}

function readMessageEnvelope(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, maxBuckets: number): StructuredEnvelope {
  const keyCounts = new Map<string, number>();
  const roleCounts = new Map<string, number>();
  let parsedRows = 0;
  let unreadableRows = 0;
  if (!tables.has("message")) {
    return { keyCounts: [], parsedRows, roleCounts: [], unreadableRows };
  }
  for (const row of db.prepare("select data from message").iterate() as Iterable<{ data: unknown }>) {
    const parsed = safeJsonRecord(row.data);
    if (!parsed) {
      unreadableRows++;
      continue;
    }
    parsedRows++;
    for (const key of Object.keys(parsed)) {
      increment(keyCounts, key);
    }
    const role = typeof parsed.role === "string" && parsed.role !== "" ? parsed.role : "<missing>";
    increment(roleCounts, role);
  }
  return {
    keyCounts: sortedCountBuckets(keyCounts, maxBuckets),
    parsedRows,
    roleCounts: sortedCountBuckets(roleCounts, maxBuckets),
    unreadableRows,
  };
}

function readPartEnvelopes(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, maxBuckets: number): { partEnvelope: StructuredEnvelope; toolEnvelope: ToolEnvelope } {
  const keyCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const toolCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const toolStatusCounts = new Map<string, number>();
  const errorToolStatusCounts = new Map<string, number>();
  const inputKeyCounts = new Map<string, number>();
  const errorStatusSessions = new Set<string>();
  let parsedRows = 0;
  let unreadableRows = 0;
  let toolParts = 0;
  let errorStatusToolParts = 0;
  if (!tables.has("part")) {
    return {
      partEnvelope: { keyCounts: [], parsedRows, typeCounts: [], unreadableRows },
      toolEnvelope: { errorToolStatusCounts: [], errorStatusSessions: 0, errorStatusToolParts, inputKeyCounts: [], statusCounts: [], toolCounts: [], toolParts, toolStatusCounts: [] },
    };
  }
  for (const row of db.prepare("select session_id, data from part").iterate() as Iterable<{ data: unknown; session_id: unknown }>) {
    const parsed = safeJsonRecord(row.data);
    if (!parsed) {
      unreadableRows++;
      continue;
    }
    parsedRows++;
    for (const key of Object.keys(parsed)) {
      increment(keyCounts, key);
    }
    const type = typeof parsed.type === "string" && parsed.type !== "" ? parsed.type : "<missing>";
    increment(typeCounts, type);
    if (type !== "tool") {
      continue;
    }
    toolParts++;
    const tool = typeof parsed.tool === "string" && parsed.tool !== "" ? parsed.tool : "<missing>";
    increment(toolCounts, tool);
    const state = typeof parsed.state === "object" && parsed.state != null && !Array.isArray(parsed.state) ? parsed.state as Record<string, unknown> : {};
    const status = typeof state.status === "string" && state.status !== "" ? state.status : "<missing>";
    increment(statusCounts, status);
    increment(toolStatusCounts, `${tool}\u0000${status}`);
    if (status === "error") {
      errorStatusToolParts++;
      errorStatusSessions.add(String(row.session_id));
      increment(errorToolStatusCounts, `${tool}\u0000${status}`);
    }
    const input = typeof state.input === "object" && state.input != null && !Array.isArray(state.input) ? state.input as Record<string, unknown> : null;
    if (input) {
      for (const inputKey of Object.keys(input)) {
        increment(inputKeyCounts, `${tool}.${inputKey}`);
      }
    }
  }
  return {
    partEnvelope: {
      keyCounts: sortedCountBuckets(keyCounts, maxBuckets),
      parsedRows,
      typeCounts: sortedCountBuckets(typeCounts, maxBuckets),
      unreadableRows,
    },
    toolEnvelope: {
      errorToolStatusCounts: sortedToolStatusBuckets(errorToolStatusCounts, maxBuckets),
      errorStatusSessions: errorStatusSessions.size,
      errorStatusToolParts,
      inputKeyCounts: sortedCountBuckets(inputKeyCounts, maxBuckets),
      statusCounts: sortedStatusBuckets(statusCounts, maxBuckets),
      toolCounts: sortedToolBuckets(toolCounts, maxBuckets),
      toolParts,
      toolStatusCounts: sortedToolStatusBuckets(toolStatusCounts, maxBuckets),
    },
  };
}

function readCountBuckets(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, schema: Record<string, string[]>, table: string, column: string, maxBuckets: number): CountBucket[] {
  if (!tables.has(table) || !hasColumn(schema, table, column)) {
    return [];
  }
  const rows = db.prepare(`select ${quoteIdent(column)} as key, count(*) as count from ${quoteIdent(table)} group by ${quoteIdent(column)} order by count desc, key limit ?`).all(maxBuckets) as Array<{ count: unknown; key: unknown }>;
  return rows.map((row) => ({ key: row.key == null || String(row.key) === "" ? "<missing>" : String(row.key), count: normalizeCount(row.count) }));
}

function readTodoCounts(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, schema: Record<string, string[]>, maxBuckets: number): Array<{ count: number; priority: string; status: string }> {
  if (!tables.has("todo") || !hasColumn(schema, "todo", "status") || !hasColumn(schema, "todo", "priority")) {
    return [];
  }
  const rows = db.prepare("select status, priority, count(*) as count from todo group by status, priority order by count desc, status, priority limit ?").all(maxBuckets) as Array<{ count: unknown; priority: unknown; status: unknown }>;
  return rows.map((row) => ({
    count: normalizeCount(row.count),
    priority: row.priority == null || String(row.priority) === "" ? "<missing>" : String(row.priority),
    status: row.status == null || String(row.status) === "" ? "<missing>" : String(row.status),
  }));
}

function readDayBuckets(db: InstanceType<typeof DatabaseSync>, schema: Record<string, string[]>, maxBuckets: number): DayBucket[] {
  if (!schema.session || !hasColumn(schema, "session", "time_created")) {
    return [];
  }
  const childExpr = hasColumn(schema, "session", "parent_id") ? "sum(case when parent_id is not null and parent_id != '' then 1 else 0 end)" : "0";
  const projectExpr = hasColumn(schema, "session", "project_id") ? "count(distinct project_id)" : "0";
  const archivedExpr = hasColumn(schema, "session", "time_archived") ? "sum(case when time_archived is not null then 1 else 0 end)" : "0";
  const rows = db.prepare(`select strftime('%Y-%m-%d', time_created / 1000, 'unixepoch') as day, count(*) as sessions, ${childExpr} as childSessions, ${projectExpr} as projectRefs, ${archivedExpr} as archivedSessions from session group by day order by day limit ?`).all(maxBuckets) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    archivedSessions: normalizeCount(row.archivedSessions),
    childSessions: normalizeCount(row.childSessions),
    day: row.day == null ? "<unknown>" : String(row.day),
    projectRefs: normalizeCount(row.projectRefs),
    sessions: normalizeCount(row.sessions),
  }));
}

function readRedactedBuckets(db: InstanceType<typeof DatabaseSync>, schema: Record<string, string[]>, column: string, prefix: string, maxBuckets: number): RedactedBucket[] {
  if (!schema.session || !hasColumn(schema, "session", column)) {
    return [];
  }
  const childExpr = hasColumn(schema, "session", "parent_id") ? "sum(case when parent_id is not null and parent_id != '' then 1 else 0 end)" : "0";
  const firstExpr = hasColumn(schema, "session", "time_created") ? "min(time_created)" : "null";
  const lastExpr = hasColumn(schema, "session", "time_updated") ? "max(time_updated)" : "null";
  const rows = db.prepare(`select ${quoteIdent(column)} as value, count(*) as count, ${childExpr} as childSessions, ${firstExpr} as firstTime, ${lastExpr} as lastTime from session group by ${quoteIdent(column)} order by count desc, value limit ?`).all(maxBuckets) as Array<Record<string, unknown>>;
  return rows.map((row, index) => ({
    childSessions: normalizeCount(row.childSessions),
    count: normalizeCount(row.count),
    dateRange: makeDateRange([normalizeMillis(row.firstTime), normalizeMillis(row.lastTime)]),
    ref: `${prefix}_${String(index + 1).padStart(2, "0")}`,
  }));
}

function readSessionSummary(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, schema: Record<string, string[]>): SessionSummary {
  const emptyRange = { from: null, to: null };
  if (!tables.has("session")) {
    return {
      archivedSessions: 0,
      childSessions: 0,
      compactingSessions: 0,
      dateRange: emptyRange,
      rootSessions: 0,
      sessionShareRows: countRows(db, tables, "session_share"),
      sessions: 0,
      shareUrlSessions: 0,
      summaryAdditions: 0,
      summaryDeletions: 0,
      summaryFiles: 0,
      sessionsWithFileSummaries: 0,
    };
  }
  const firstExpr = hasColumn(schema, "session", "time_created") ? "min(time_created)" : "null";
  const lastExpr = hasColumn(schema, "session", "time_updated") ? "max(time_updated)" : "null";
  const childExpr = sqlCountCondition(schema, "parent_id", "parent_id is not null and parent_id != ''");
  const archivedExpr = sqlCountCondition(schema, "time_archived", "time_archived is not null");
  const compactingExpr = sqlCountCondition(schema, "time_compacting", "time_compacting is not null");
  const shareUrlExpr = sqlCountCondition(schema, "share_url", "share_url is not null and share_url != ''");
  const withFilesExpr = sqlCountCondition(schema, "summary_files", "coalesce(summary_files, 0) > 0");
  const row = db.prepare(`select count(*) as sessions, ${childExpr} as childSessions, ${archivedExpr} as archivedSessions, ${compactingExpr} as compactingSessions, ${shareUrlExpr} as shareUrlSessions, ${withFilesExpr} as sessionsWithFileSummaries, ${sqlSumExpression(schema, "session", "summary_files")} as summaryFiles, ${sqlSumExpression(schema, "session", "summary_additions")} as summaryAdditions, ${sqlSumExpression(schema, "session", "summary_deletions")} as summaryDeletions, ${firstExpr} as firstTime, ${lastExpr} as lastTime from session`).get() as Record<string, unknown>;
  const sessions = normalizeCount(row.sessions);
  const childSessions = normalizeCount(row.childSessions);
  return {
    archivedSessions: normalizeCount(row.archivedSessions),
    childSessions,
    compactingSessions: normalizeCount(row.compactingSessions),
    dateRange: makeDateRange([normalizeMillis(row.firstTime), normalizeMillis(row.lastTime)]),
    rootSessions: Math.max(0, sessions - childSessions),
    sessionShareRows: countRows(db, tables, "session_share"),
    sessions,
    shareUrlSessions: normalizeCount(row.shareUrlSessions),
    summaryAdditions: normalizeCount(row.summaryAdditions),
    summaryDeletions: normalizeCount(row.summaryDeletions),
    summaryFiles: normalizeCount(row.summaryFiles),
    sessionsWithFileSummaries: normalizeCount(row.sessionsWithFileSummaries),
  };
}

function newEmptySource(dbPath: string, showPaths: boolean): SqliteAnalysis {
  const source: SqliteAnalysis = {
    agentBuckets: [],
    counts: {},
    dateRange: { from: null, to: null },
    dayBuckets: [],
    eventTypeCounts: [],
    messageEnvelope: { keyCounts: [], parsedRows: 0, roleCounts: [], unreadableRows: 0 },
    modelBuckets: [],
    partEnvelope: { keyCounts: [], parsedRows: 0, typeCounts: [], unreadableRows: 0 },
    permissionRows: 0,
    projectBuckets: [],
    readable: false,
    schema: {},
    schemaTables: [],
    sessionInputDeliveries: [],
    sessionMessageTypes: [],
    sessionSummary: {
      archivedSessions: 0,
      childSessions: 0,
      compactingSessions: 0,
      dateRange: { from: null, to: null },
      rootSessions: 0,
      sessionShareRows: 0,
      sessions: 0,
      shareUrlSessions: 0,
      summaryAdditions: 0,
      summaryDeletions: 0,
      summaryFiles: 0,
      sessionsWithFileSummaries: 0,
    },
    sourceRef: hashRef("source", dbPath),
    status: "unreadable",
    todoCounts: [],
    toolEnvelope: { errorToolStatusCounts: [], errorStatusSessions: 0, errorStatusToolParts: 0, inputKeyCounts: [], statusCounts: [], toolCounts: [], toolParts: 0, toolStatusCounts: [] },
    type: "sqlite-opencode-analysis",
    warnings: [],
  };
  const redactedPath = maybePath(dbPath, showPaths);
  if (redactedPath) {
    source.path = redactedPath;
  }
  return source;
}

function readSqliteAnalysis(dbPath: string, showPaths: boolean, maxBuckets: number): SqliteAnalysis {
  const source = newEmptySource(dbPath, showPaths);
  if (!fs.existsSync(dbPath)) {
    source.status = "missing";
    source.warnings.push("candidate database file does not exist");
    return source;
  }

  let db: InstanceType<typeof DatabaseSync> | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const tables = new Set(tableNames(db));
    source.schemaTables = [...tables].filter((name) => KNOWN_SQLITE_TABLES.includes(name)).sort();
    source.schema = Object.fromEntries(source.schemaTables.map((table) => [table, tableColumns(db!, table)]));
    for (const table of KNOWN_SQLITE_TABLES) {
      const count = countRows(db, tables, table);
      if (count > 0 || tables.has(table)) {
        source.counts[table] = count;
      }
    }
    source.readable = true;

    if (!tables.has("session")) {
      source.status = "not-opencode-session-db";
      source.warnings.push("missing session table");
      return source;
    }

    source.sessionSummary = readSessionSummary(db, tables, source.schema);
    source.dateRange = source.sessionSummary.dateRange;
    source.projectBuckets = readRedactedBuckets(db, source.schema, "project_id", "project", maxBuckets);
    source.agentBuckets = readRedactedBuckets(db, source.schema, "agent", "agent", maxBuckets);
    source.modelBuckets = readRedactedBuckets(db, source.schema, "model", "model", maxBuckets);
    source.dayBuckets = readDayBuckets(db, source.schema, maxBuckets);
    source.messageEnvelope = readMessageEnvelope(db, tables, maxBuckets);
    const partEnvelopes = readPartEnvelopes(db, tables, maxBuckets);
    source.partEnvelope = partEnvelopes.partEnvelope;
    source.toolEnvelope = partEnvelopes.toolEnvelope;
    source.todoCounts = readTodoCounts(db, tables, source.schema, maxBuckets);
    source.eventTypeCounts = readCountBuckets(db, tables, source.schema, "event", "type", maxBuckets);
    source.sessionMessageTypes = readCountBuckets(db, tables, source.schema, "session_message", "type", maxBuckets);
    source.sessionInputDeliveries = readCountBuckets(db, tables, source.schema, "session_input", "delivery", maxBuckets);
    source.permissionRows = countRows(db, tables, "permission");
    if (source.counts.account || source.counts.control_account) {
      source.warnings.push("account tables are present; token-bearing values were not read or emitted");
    }
    source.status = "ok";
    return source;
  } catch (error) {
    source.status = "error";
    source.warnings.push(error instanceof Error ? error.message : String(error));
    return source;
  } finally {
    db?.close();
  }
}

function buildCoverage(sources: SqliteAnalysis[]): Coverage {
  return {
    dateRange: mergeDateRanges(sources.map((source) => source.dateRange)),
    messageRows: sources.reduce((sum, source) => sum + (source.counts.message ?? 0), 0),
    partRows: sources.reduce((sum, source) => sum + (source.counts.part ?? 0), 0),
    readableSources: sources.filter((source) => source.readable).length,
    sources: sources.length,
    totalSessions: sources.reduce((sum, source) => sum + source.sessionSummary.sessions, 0),
  };
}

function buildReport(options: Options): AnalysisReport {
  const dataDirs = candidateDataDirs(options);
  const dbPaths = discoverDbPaths(options, dataDirs);
  const sources = dbPaths.map((dbPath) => readSqliteAnalysis(dbPath, options.showPaths, options.maxBuckets));
  const coverageLimits = sources.flatMap((source) => source.warnings.map((warning) => `${source.sourceRef}: ${warning}`));
  if (sources.length === 0) {
    coverageLimits.push("no OpenCode SQLite sources discovered; pass --db or --data-dir for explicit sources");
  }
  return {
    coverage: buildCoverage(sources),
    coverageLimits,
    discovery: {
      checkedDataDirs: dataDirs.length,
      explicitDbPaths: options.dbPaths.length,
      showPaths: options.showPaths,
      useDefaultPaths: options.useDefaultPaths,
    },
    generatedAt: new Date().toISOString(),
    privacyNotes: [
      "Session titles, project names, workspace names, stable ids, message data, part data, todo content, command values, account tokens, and share secrets are not emitted.",
      options.showPaths ? "Raw paths are not emitted; home-redacted source paths are emitted because --show-paths was requested." : "Paths are not emitted by default; use --show-paths only when home-redacted source paths are acceptable.",
      "Agent, model, and project groupings are emitted as rank-local redacted refs only.",
      "Message and part JSON are inspected only for top-level structured keys, roles, types, tool names, tool statuses, and input key names; content values are not emitted.",
    ],
    redacted: true,
    sources,
    tool: TOOL_NAME,
    version: TOOL_VERSION,
  };
}

function markdownTable(headers: string[], rows: string[][]): string[] {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ];
}

function renderCountBuckets(rows: CountBucket[]): string {
  return rows.map((row) => `${row.key}: ${row.count}`).join(", ") || "none";
}

function renderToolBuckets(rows: ToolBucket[]): string {
  return rows.map((row) => `${row.tool}: ${row.count}`).join(", ") || "none";
}

function renderStatusBuckets(rows: StatusBucket[]): string {
  return rows.map((row) => `${row.status}: ${row.count}`).join(", ") || "none";
}

function renderMarkdown(report: AnalysisReport): string {
  const lines: string[] = [];
  lines.push("# OpenCode Session Retro Analysis");
  lines.push("");
  lines.push("## Scope And Coverage");
  lines.push("");
  lines.push(...markdownTable(["Field", "Value"], [
    ["Generated", report.generatedAt],
    ["Redacted", report.redacted ? "yes" : "no"],
    ["SQLite sources", String(report.coverage.sources)],
    ["Readable sources", String(report.coverage.readableSources)],
    ["Sessions", String(report.coverage.totalSessions)],
    ["Message rows", String(report.coverage.messageRows)],
    ["Part rows", String(report.coverage.partRows)],
    ["Date range", `${report.coverage.dateRange.from ?? "unknown"}..${report.coverage.dateRange.to ?? "unknown"}`],
  ]));
  lines.push("");
  lines.push("## SQLite Sources");
  lines.push("");
  lines.push(...markdownTable(["Source", "Status", "Sessions", "Messages", "Parts", "Tools", "Tool errors", "Date Range"], report.sources.map((source) => [
    source.sourceRef,
    source.status,
    String(source.sessionSummary.sessions),
    String(source.counts.message ?? 0),
    String(source.counts.part ?? 0),
    String(source.toolEnvelope.toolParts),
    String(source.toolEnvelope.errorStatusToolParts),
    `${source.dateRange.from ?? "unknown"}..${source.dateRange.to ?? "unknown"}`,
  ])));
  lines.push("");
  for (const source of report.sources) {
    lines.push(`## Source ${source.sourceRef}`);
    lines.push("");
    lines.push(...markdownTable(["Metric", "Value"], [
      ["Root / child sessions", `${source.sessionSummary.rootSessions} / ${source.sessionSummary.childSessions}`],
      ["Archived / compacting sessions", `${source.sessionSummary.archivedSessions} / ${source.sessionSummary.compactingSessions}`],
      ["Sessions with file summaries", String(source.sessionSummary.sessionsWithFileSummaries)],
      ["Summary files/additions/deletions", `${source.sessionSummary.summaryFiles} / ${source.sessionSummary.summaryAdditions} / ${source.sessionSummary.summaryDeletions}`],
      ["Share URL sessions / session_share rows", `${source.sessionSummary.shareUrlSessions} / ${source.sessionSummary.sessionShareRows}`],
      ["Permission rows", String(source.permissionRows)],
      ["Message parsed/unreadable", `${source.messageEnvelope.parsedRows} / ${source.messageEnvelope.unreadableRows}`],
      ["Part parsed/unreadable", `${source.partEnvelope.parsedRows} / ${source.partEnvelope.unreadableRows}`],
      ["Tool error sessions/parts", `${source.toolEnvelope.errorStatusSessions} / ${source.toolEnvelope.errorStatusToolParts}`],
      ["Tool status counts", renderStatusBuckets(source.toolEnvelope.statusCounts)],
      ["Tool counts", renderToolBuckets(source.toolEnvelope.toolCounts)],
      ["Message role counts", renderCountBuckets(source.messageEnvelope.roleCounts ?? [])],
      ["Part type counts", renderCountBuckets(source.partEnvelope.typeCounts ?? [])],
      ["Event types", renderCountBuckets(source.eventTypeCounts)],
    ]));
    lines.push("");
    lines.push("### Tool Error Hotspots");
    lines.push("");
    const toolErrorRows = source.toolEnvelope.errorToolStatusCounts.map((row) => [
      row.tool,
      row.status,
      String(row.count),
    ]);
    lines.push(...markdownTable(["Tool", "Status", "Count"], toolErrorRows.length > 0 ? toolErrorRows : [["none", "none", "0"]]));
    lines.push("");
    lines.push("### Todo Rollup");
    lines.push("");
    const todoRows = source.todoCounts.map((row) => [row.status, row.priority, String(row.count)]);
    lines.push(...markdownTable(["Status", "Priority", "Count"], todoRows.length > 0 ? todoRows : [["none", "none", "0"]]));
    lines.push("");
    lines.push("### Day Buckets");
    lines.push("");
    const dayRows = source.dayBuckets.map((row) => [
      row.day,
      String(row.sessions),
      String(row.childSessions),
      String(row.archivedSessions),
      String(row.projectRefs),
    ]);
    lines.push(...markdownTable(["Day", "Sessions", "Child", "Archived", "Projects"], dayRows.length > 0 ? dayRows : [["none", "0", "0", "0", "0"]]));
    lines.push("");
    lines.push("### Session Message Types");
    lines.push("");
    const sessionMessageRows = source.sessionMessageTypes.map((row) => [row.key, String(row.count)]);
    lines.push(...markdownTable(["Type", "Count"], sessionMessageRows.length > 0 ? sessionMessageRows : [["none", "0"]]));
    lines.push("");
  }
  lines.push("## Coverage Limits");
  lines.push("");
  if (report.coverageLimits.length === 0) {
    lines.push("- none");
  } else {
    for (const limit of report.coverageLimits) {
      lines.push(`- ${limit}`);
    }
  }
  lines.push("");
  lines.push("## Privacy Notes");
  lines.push("");
  for (const note of report.privacyNotes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeOutput(options: Options, content: string): void {
  if (!options.outPath) {
    console.log(content.trimEnd());
    return;
  }
  const parent = path.dirname(options.outPath);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    throw new Error(`Output parent directory does not exist: ${parent}`);
  }
  if (fs.existsSync(options.outPath) && !options.overwrite) {
    throw new Error(`Output file already exists: ${options.outPath}. Pass --overwrite to replace it.`);
  }
  fs.writeFileSync(options.outPath, content, "utf8");
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  const content = options.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);
  writeOutput(options, content);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
