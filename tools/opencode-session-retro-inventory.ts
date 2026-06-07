#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type OutputFormat = "json" | "markdown";

type Options = {
  batchSize: number;
  dataDirs: string[];
  dbPaths: string[];
  desktopDirs: string[];
  format: OutputFormat;
  includeDesktop: boolean;
  maxBatches: number;
  outPath: string | null;
  overwrite: boolean;
  showPaths: boolean;
  useDefaultPaths: boolean;
};

type DateRange = {
  from: string | null;
  to: string | null;
};

type SessionInventory = {
  agent: string | null;
  archived: boolean;
  child: boolean;
  compacting: boolean;
  cost: number;
  dateRange: DateRange;
  messageRows: number;
  model: string | null;
  parentRef: string | null;
  partRows: number;
  projectRef: string | null;
  sessionMessageRows: number;
  sessionRef: string;
  sourceRef: string;
  timeCreatedMs: number | null;
  timeUpdatedMs: number | null;
  todoRows: number;
  tokens: {
    cacheRead: number;
    cacheWrite: number;
    input: number;
    output: number;
    reasoning: number;
  };
  workspaceRef: string | null;
};

type SqliteSource = {
  counts: Record<string, number>;
  dateRange: DateRange;
  path?: string;
  readable: boolean;
  schemaTables: string[];
  sessions: SessionInventory[];
  sourceRef: string;
  status: string;
  type: "sqlite-opencode-db";
  warnings: string[];
};

type DesktopSource = {
  bytes: number;
  keyCategories: Record<string, number>;
  path?: string;
  promptLikeKeys: number;
  readable: boolean;
  sessionScopedKeys: number;
  sourceRef: string;
  status: string;
  topLevelKeys: number;
  type: "desktop-state";
  warnings: string[];
  workspaceScopedKeys: number;
};

type BatchSummary = {
  batchRef: string;
  childSessions: number;
  dateRange: DateRange;
  messageRows: number;
  partRows: number;
  projectRefs: number;
  sessionRefs: string[];
  sessions: number;
};

type CoverageSummary = {
  archivedSessions: number;
  childSessions: number;
  compactingSessions: number;
  dateRange: DateRange;
  desktopStateFiles: number;
  duplicateSessions: number;
  messageRows: number;
  models: Record<string, number>;
  partRows: number;
  projectRefs: number;
  rootSessions: number;
  sessionMessageRows: number;
  sources: number;
  sqliteSources: number;
  todoRows: number;
  totalSessions: number;
  uniqueSessions: number;
};

type InventoryReport = {
  batches: BatchSummary[];
  coverage: CoverageSummary;
  coverageLimits: string[];
  desktopSources: DesktopSource[];
  discovery: {
    checkedDataDirs: number;
    checkedDesktopDirs: number;
    explicitDbPaths: number;
    includeDesktop: boolean;
    showPaths: boolean;
    useDefaultPaths: boolean;
  };
  generatedAt: string;
  redacted: boolean;
  sessions: SessionInventory[];
  sqliteSources: SqliteSource[];
  tool: string;
  version: number;
};

const TOOL_NAME = "opencode-session-retro-inventory";
const TOOL_VERSION = 1;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_BATCHES = 40;
const KNOWN_SQLITE_TABLES = [
  "project",
  "workspace",
  "session",
  "message",
  "part",
  "session_message",
  "session_input",
  "session_share",
  "todo",
  "event",
  "permission",
];

function printUsage(): void {
  console.log(`Usage:
  npm run retro:inventory -- [options]

Options:
  --db <path>              Read an explicit OpenCode SQLite database. Repeatable.
  --data-dir <path>        Add an OpenCode data directory containing opencode.db. Repeatable.
  --desktop-dir <path>     Add an OpenCode Desktop state directory. Repeatable.
  --no-desktop             Skip Desktop state discovery.
  --only-explicit          Use only --db, --data-dir, and --desktop-dir paths.
  --format <json|markdown> Output format. Default: markdown.
  --out <path>             Write output to an existing directory path target instead of stdout.
  --overwrite              Allow --out to replace an existing file.
  --show-paths             Include home-redacted source paths. Default hides paths.
  --batch-size <n>         Sessions per suggested batch. Default: ${DEFAULT_BATCH_SIZE}.
  --max-batches <n>        Maximum batch summaries in output. Default: ${DEFAULT_MAX_BATCHES}.
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
    batchSize: DEFAULT_BATCH_SIZE,
    dataDirs: [],
    dbPaths: [],
    desktopDirs: [],
    format: "markdown",
    includeDesktop: true,
    maxBatches: DEFAULT_MAX_BATCHES,
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
    } else if (arg === "--desktop-dir") {
      options.desktopDirs.push(resolveInputPath(readOptionValue(args, index, arg)));
      index++;
    } else if (arg.startsWith("--desktop-dir=")) {
      options.desktopDirs.push(resolveInputPath(readInlineOptionValue(arg.slice("--desktop-dir=".length), "--desktop-dir")));
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
    } else if (arg === "--no-desktop") {
      options.includeDesktop = false;
    } else if (arg === "--only-explicit") {
      options.useDefaultPaths = false;
    } else if (arg === "--batch-size") {
      options.batchSize = readPositiveInteger(readOptionValue(args, index, arg), "--batch-size");
      index++;
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = readPositiveInteger(readInlineOptionValue(arg.slice("--batch-size=".length), "--batch-size"), "--batch-size");
    } else if (arg === "--max-batches") {
      options.maxBatches = readPositiveInteger(readOptionValue(args, index, arg), "--max-batches");
      index++;
    } else if (arg.startsWith("--max-batches=")) {
      options.maxBatches = readPositiveInteger(readInlineOptionValue(arg.slice("--max-batches=".length), "--max-batches"), "--max-batches");
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

function candidateDesktopDirs(options: Options): string[] {
  const candidates = [...options.desktopDirs];
  if (!options.useDefaultPaths) {
    return uniquePaths(candidates);
  }
  const home = requireHome();
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, "ai.opencode.desktop"));
  }
  candidates.push(path.join(home, "Library", "Application Support", "ai.opencode.desktop"));
  candidates.push(path.join(home, ".config", "ai.opencode.desktop"));
  candidates.push(path.join(home, ".local", "share", "ai.opencode.desktop"));
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

function discoverDesktopStateFiles(desktopDirs: string[]): string[] {
  const files: string[] = [];
  for (const dir of desktopDirs) {
    if (!safeIsDirectory(dir)) {
      continue;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }
      if ((entry.name.startsWith("opencode.") && entry.name.endsWith(".dat")) || entry.name === "opencode.settings") {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  return uniquePaths(files).sort((a, b) => a.localeCompare(b));
}

function safeIsDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch (_error) {
    return false;
  }
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

function normalizeNumber(value: unknown): number {
  return normalizeCount(value);
}

function normalizeMillis(value: unknown): number | null {
  const numeric = normalizeNumber(value);
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

function tableNames(db: InstanceType<typeof DatabaseSync>): string[] {
  const rows = db.prepare("select name from sqlite_master where type = 'table' order by name").all() as Array<{ name: unknown }>;
  return rows.map((row) => String(row.name));
}

function tableColumns(db: InstanceType<typeof DatabaseSync>, table: string): Set<string> {
  const rows = db.prepare(`pragma table_info(${quoteIdent(table)})`).all() as Array<{ name: unknown }>;
  return new Set(rows.map((row) => String(row.name)));
}

function countRows(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, table: string): number {
  if (!tables.has(table)) {
    return 0;
  }
  const row = db.prepare(`select count(*) as count from ${quoteIdent(table)}`).get() as { count: unknown } | undefined;
  return normalizeCount(row?.count);
}

function countBySession(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, table: string): Map<string, number> {
  if (!tables.has(table)) {
    return new Map();
  }
  const columns = tableColumns(db, table);
  if (!columns.has("session_id")) {
    return new Map();
  }
  const rows = db.prepare(`select session_id as sessionID, count(*) as count from ${quoteIdent(table)} group by session_id`).all() as Array<{ count: unknown; sessionID: unknown }>;
  return new Map(rows.map((row) => [String(row.sessionID), normalizeCount(row.count)]));
}

function selectSessionExpression(columns: Set<string>, column: string, alias: string): string {
  if (!columns.has(column)) {
    return `null as ${quoteIdent(alias)}`;
  }
  return `s.${quoteIdent(column)} as ${quoteIdent(alias)}`;
}

function readSqliteSource(dbPath: string, showPaths: boolean): SqliteSource {
  const source: SqliteSource = {
    counts: {},
    dateRange: { from: null, to: null },
    readable: false,
    schemaTables: [],
    sessions: [],
    sourceRef: hashRef("source", dbPath),
    status: "unreadable",
    type: "sqlite-opencode-db",
    warnings: [],
  };
  const redactedPath = maybePath(dbPath, showPaths);
  if (redactedPath) {
    source.path = redactedPath;
  }
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

    const sessionColumns = tableColumns(db, "session");
    if (!sessionColumns.has("id")) {
      source.status = "unsupported-session-schema";
      source.warnings.push("session table has no id column");
      return source;
    }

    const messageCounts = countBySession(db, tables, "message");
    const partCounts = countBySession(db, tables, "part");
    const sessionMessageCounts = countBySession(db, tables, "session_message");
    const todoCounts = countBySession(db, tables, "todo");
    const select = [
      selectSessionExpression(sessionColumns, "id", "id"),
      selectSessionExpression(sessionColumns, "project_id", "project_id"),
      selectSessionExpression(sessionColumns, "parent_id", "parent_id"),
      selectSessionExpression(sessionColumns, "workspace_id", "workspace_id"),
      selectSessionExpression(sessionColumns, "time_created", "time_created"),
      selectSessionExpression(sessionColumns, "time_updated", "time_updated"),
      selectSessionExpression(sessionColumns, "time_archived", "time_archived"),
      selectSessionExpression(sessionColumns, "time_compacting", "time_compacting"),
      selectSessionExpression(sessionColumns, "agent", "agent"),
      selectSessionExpression(sessionColumns, "model", "model"),
      selectSessionExpression(sessionColumns, "cost", "cost"),
      selectSessionExpression(sessionColumns, "tokens_input", "tokens_input"),
      selectSessionExpression(sessionColumns, "tokens_output", "tokens_output"),
      selectSessionExpression(sessionColumns, "tokens_reasoning", "tokens_reasoning"),
      selectSessionExpression(sessionColumns, "tokens_cache_read", "tokens_cache_read"),
      selectSessionExpression(sessionColumns, "tokens_cache_write", "tokens_cache_write"),
    ];
    const orderBy = sessionColumns.has("time_created") ? " order by s.time_created, s.id" : " order by s.id";
    const rows = db.prepare(`select ${select.join(", ")} from session s${orderBy}`).all() as Array<Record<string, unknown>>;

    source.sessions = rows.map((row) => {
      const id = String(row.id);
      const parentID = row.parent_id == null ? null : String(row.parent_id);
      const projectID = row.project_id == null ? null : String(row.project_id);
      const workspaceID = row.workspace_id == null ? null : String(row.workspace_id);
      const created = normalizeMillis(row.time_created);
      const updated = normalizeMillis(row.time_updated);
      return {
        agent: row.agent == null ? null : String(row.agent),
        archived: normalizeMillis(row.time_archived) != null,
        child: parentID != null && parentID !== "",
        compacting: normalizeMillis(row.time_compacting) != null,
        cost: normalizeNumber(row.cost),
        dateRange: makeDateRange([created, updated]),
        messageRows: messageCounts.get(id) ?? 0,
        model: row.model == null ? null : String(row.model),
        parentRef: parentID ? hashRef("session", parentID) : null,
        partRows: partCounts.get(id) ?? 0,
        projectRef: projectID ? hashRef("project", projectID) : null,
        sessionMessageRows: sessionMessageCounts.get(id) ?? 0,
        sessionRef: hashRef("session", id),
        sourceRef: source.sourceRef,
        timeCreatedMs: created,
        timeUpdatedMs: updated,
        todoRows: todoCounts.get(id) ?? 0,
        tokens: {
          cacheRead: normalizeCount(row.tokens_cache_read),
          cacheWrite: normalizeCount(row.tokens_cache_write),
          input: normalizeCount(row.tokens_input),
          output: normalizeCount(row.tokens_output),
          reasoning: normalizeCount(row.tokens_reasoning),
        },
        workspaceRef: workspaceID ? hashRef("workspace", workspaceID) : null,
      } satisfies SessionInventory;
    });
    source.dateRange = makeDateRange(source.sessions.flatMap((session) => [session.timeCreatedMs, session.timeUpdatedMs]));
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

function readDesktopSource(filePath: string, showPaths: boolean): DesktopSource {
  const source: DesktopSource = {
    bytes: 0,
    keyCategories: {},
    promptLikeKeys: 0,
    readable: false,
    sessionScopedKeys: 0,
    sourceRef: hashRef("desktop", filePath),
    status: "unreadable",
    topLevelKeys: 0,
    type: "desktop-state",
    warnings: [],
    workspaceScopedKeys: 0,
  };
  const redactedPath = maybePath(filePath, showPaths);
  if (redactedPath) {
    source.path = redactedPath;
  }
  try {
    const stat = fs.statSync(filePath);
    source.bytes = stat.size;
    const text = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
      source.status = "unsupported-json";
      source.warnings.push("desktop state JSON root is not an object");
      return source;
    }
    const keys = Object.keys(parsed);
    source.topLevelKeys = keys.length;
    source.promptLikeKeys = keys.filter((key) => /prompt|message/i.test(key)).length;
    source.sessionScopedKeys = keys.filter((key) => key.startsWith("session:")).length;
    source.workspaceScopedKeys = keys.filter((key) => key.startsWith("workspace:")).length;
    for (const key of keys) {
      const category = safeDesktopKeyCategory(key);
      source.keyCategories[category] = (source.keyCategories[category] ?? 0) + 1;
    }
    source.readable = true;
    source.status = "ok";
    return source;
  } catch (error) {
    source.status = "error";
    source.warnings.push(safeDesktopError(error));
    return source;
  }
}

function safeDesktopKeyCategory(key: string): string {
  if (key.startsWith("session:")) {
    return "session";
  }
  if (key.startsWith("workspace:")) {
    return "workspace";
  }
  if (key.startsWith("command.")) {
    return "command";
  }
  const knownGlobalKeys = new Set([
    "layout",
    "layout.page",
    "model",
    "notification",
    "open.app",
    "prompt-history",
    "server",
    "tauriMigrated",
  ]);
  if (knownGlobalKeys.has(key)) {
    return key;
  }
  return "other";
}

function safeDesktopError(error: unknown): string {
  if (error instanceof SyntaxError) {
    return "desktop state JSON parse failed";
  }
  if (error instanceof Error && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");
    return code ? `desktop state read failed: ${code}` : "desktop state read failed";
  }
  return "desktop state read failed";
}

function summarizeSessions(sessions: SessionInventory[], sources: number, sqliteSources: number, desktopSources: number): CoverageSummary {
  const projectRefs = new Set<string>();
  const models: Record<string, number> = {};
  let messageRows = 0;
  let partRows = 0;
  let sessionMessageRows = 0;
  let todoRows = 0;
  let archivedSessions = 0;
  let childSessions = 0;
  let compactingSessions = 0;
  for (const session of sessions) {
    if (session.projectRef) {
      projectRefs.add(session.projectRef);
    }
    const model = session.model ?? "<unknown>";
    models[model] = (models[model] ?? 0) + 1;
    messageRows += session.messageRows;
    partRows += session.partRows;
    sessionMessageRows += session.sessionMessageRows;
    todoRows += session.todoRows;
    archivedSessions += session.archived ? 1 : 0;
    childSessions += session.child ? 1 : 0;
    compactingSessions += session.compacting ? 1 : 0;
  }
  return {
    archivedSessions,
    childSessions,
    compactingSessions,
    dateRange: makeDateRange(sessions.flatMap((session) => [session.timeCreatedMs, session.timeUpdatedMs])),
    desktopStateFiles: desktopSources,
    duplicateSessions: 0,
    messageRows,
    models: sortRecordByCount(models),
    partRows,
    projectRefs: projectRefs.size,
    rootSessions: sessions.length - childSessions,
    sessionMessageRows,
    sources,
    sqliteSources,
    todoRows,
    totalSessions: sessions.length,
    uniqueSessions: sessions.length,
  };
}

function sortRecordByCount(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(input).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function uniqueSessions(sqliteSources: SqliteSource[]): { duplicateSessions: number; sessions: SessionInventory[] } {
  const seen = new Set<string>();
  const sessions: SessionInventory[] = [];
  let duplicateSessions = 0;
  for (const source of sqliteSources) {
    for (const session of source.sessions) {
      if (seen.has(session.sessionRef)) {
        duplicateSessions++;
        continue;
      }
      seen.add(session.sessionRef);
      sessions.push(session);
    }
  }
  sessions.sort((left, right) => (left.timeCreatedMs ?? 0) - (right.timeCreatedMs ?? 0) || left.sessionRef.localeCompare(right.sessionRef));
  return { duplicateSessions, sessions };
}

function makeBatches(sessions: SessionInventory[], batchSize: number, maxBatches: number): BatchSummary[] {
  const batches: BatchSummary[] = [];
  for (let index = 0; index < sessions.length && batches.length < maxBatches; index += batchSize) {
    const batchSessions = sessions.slice(index, index + batchSize);
    const projectRefs = new Set(batchSessions.map((session) => session.projectRef).filter((value): value is string => value != null));
    batches.push({
      batchRef: `batch_${String(batches.length + 1).padStart(3, "0")}`,
      childSessions: batchSessions.filter((session) => session.child).length,
      dateRange: makeDateRange(batchSessions.flatMap((session) => [session.timeCreatedMs, session.timeUpdatedMs])),
      messageRows: batchSessions.reduce((sum, session) => sum + session.messageRows, 0),
      partRows: batchSessions.reduce((sum, session) => sum + session.partRows, 0),
      projectRefs: projectRefs.size,
      sessionRefs: batchSessions.map((session) => session.sessionRef),
      sessions: batchSessions.length,
    });
  }
  return batches;
}

function buildCoverageLimits(sqliteSources: SqliteSource[], desktopSources: DesktopSource[], options: Options): string[] {
  const limits: string[] = [];
  if (sqliteSources.length === 0) {
    limits.push("No SQLite candidate paths were discovered; pass --db or --data-dir for explicit coverage.");
  }
  if (sqliteSources.every((source) => source.sessions.length === 0)) {
    limits.push("No readable session rows were found in discovered SQLite sources.");
  }
  for (const source of sqliteSources) {
    for (const warning of source.warnings) {
      limits.push(`${source.sourceRef}: ${warning}`);
    }
  }
  if (options.includeDesktop && desktopSources.length === 0) {
    limits.push("No Desktop state files were found in candidate Desktop directories; pass --desktop-dir if Desktop stores data elsewhere.");
  }
  for (const source of desktopSources) {
    for (const warning of source.warnings) {
      limits.push(`${source.sourceRef}: ${warning}`);
    }
  }
  return limits;
}

function buildReport(options: Options): InventoryReport {
  const dataDirs = candidateDataDirs(options);
  const desktopDirs = options.includeDesktop ? candidateDesktopDirs(options) : [];
  const dbPaths = discoverDbPaths(options, dataDirs);
  const sqliteSources = dbPaths.map((dbPath) => readSqliteSource(dbPath, options.showPaths));
  const desktopFiles = options.includeDesktop ? discoverDesktopStateFiles(desktopDirs) : [];
  const desktopSources = desktopFiles.map((filePath) => readDesktopSource(filePath, options.showPaths));
  const unique = uniqueSessions(sqliteSources);
  const coverage = summarizeSessions(unique.sessions, sqliteSources.length + desktopSources.length, sqliteSources.length, desktopSources.length);
  coverage.duplicateSessions = unique.duplicateSessions;
  coverage.uniqueSessions = unique.sessions.length;
  return {
    batches: makeBatches(unique.sessions, options.batchSize, options.maxBatches),
    coverage,
    coverageLimits: buildCoverageLimits(sqliteSources, desktopSources, options),
    desktopSources,
    discovery: {
      checkedDataDirs: dataDirs.length,
      checkedDesktopDirs: desktopDirs.length,
      explicitDbPaths: options.dbPaths.length,
      includeDesktop: options.includeDesktop,
      showPaths: options.showPaths,
      useDefaultPaths: options.useDefaultPaths,
    },
    generatedAt: new Date().toISOString(),
    redacted: !options.showPaths,
    sessions: unique.sessions,
    sqliteSources,
    tool: TOOL_NAME,
    version: TOOL_VERSION,
  };
}

function renderDateRange(range: DateRange): string {
  if (!range.from && !range.to) {
    return "unknown";
  }
  return `${range.from ?? "unknown"}..${range.to ?? "unknown"}`;
}

function renderRecordTop(record: Record<string, number>, max = 8): string {
  const entries = Object.entries(record).slice(0, max);
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([key, count]) => `${key}: ${count}`).join(", ");
}

function renderMarkdown(report: InventoryReport): string {
  const lines: string[] = [];
  lines.push("# OpenCode Session Retro Inventory");
  lines.push("");
  lines.push("## Scope And Coverage");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Generated | ${report.generatedAt} |`);
  lines.push(`| Redacted | ${report.redacted ? "yes" : "paths shown"} |`);
  lines.push(`| SQLite sources | ${report.coverage.sqliteSources} |`);
  lines.push(`| Desktop state files | ${report.coverage.desktopStateFiles} |`);
  lines.push(`| Sessions | ${report.coverage.totalSessions} unique, ${report.coverage.duplicateSessions} duplicate rows skipped |`);
  lines.push(`| Root / child sessions | ${report.coverage.rootSessions} / ${report.coverage.childSessions} |`);
  lines.push(`| Archived / compacting sessions | ${report.coverage.archivedSessions} / ${report.coverage.compactingSessions} |`);
  lines.push(`| Project refs | ${report.coverage.projectRefs} |`);
  lines.push(`| Message rows | ${report.coverage.messageRows} legacy message rows, ${report.coverage.sessionMessageRows} session_message rows |`);
  lines.push(`| Part rows | ${report.coverage.partRows} |`);
  lines.push(`| Todo rows | ${report.coverage.todoRows} |`);
  lines.push(`| Date range | ${renderDateRange(report.coverage.dateRange)} |`);
  lines.push(`| Models | ${renderRecordTop(report.coverage.models)} |`);
  lines.push("");
  lines.push("## SQLite Sources");
  lines.push("");
  lines.push("| Source | Status | Sessions | Messages | Parts | Date Range | Tables |");
  lines.push("| --- | --- | ---: | ---: | ---: | --- | --- |");
  for (const source of report.sqliteSources) {
    lines.push(`| ${source.path ?? source.sourceRef} | ${source.status} | ${source.sessions.length} | ${source.counts.message ?? 0} | ${source.counts.part ?? 0} | ${renderDateRange(source.dateRange)} | ${source.schemaTables.join(", ") || "none"} |`);
  }
  if (report.sqliteSources.length === 0) {
    lines.push("| none | not-found | 0 | 0 | 0 | unknown | none |");
  }
  lines.push("");
  lines.push("## Desktop State Sources");
  lines.push("");
  lines.push("| Source | Status | Bytes | Keys | Prompt-like Keys | Session Keys | Workspace Keys | Categories |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const source of report.desktopSources) {
    lines.push(`| ${source.path ?? source.sourceRef} | ${source.status} | ${source.bytes} | ${source.topLevelKeys} | ${source.promptLikeKeys} | ${source.sessionScopedKeys} | ${source.workspaceScopedKeys} | ${renderRecordTop(source.keyCategories)} |`);
  }
  if (report.desktopSources.length === 0) {
    lines.push("| none | not-found | 0 | 0 | 0 | 0 | 0 | none |");
  }
  lines.push("");
  lines.push("## Suggested Batches");
  lines.push("");
  lines.push("| Batch | Sessions | Child | Projects | Messages | Parts | Date Range |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const batch of report.batches) {
    lines.push(`| ${batch.batchRef} | ${batch.sessions} | ${batch.childSessions} | ${batch.projectRefs} | ${batch.messageRows} | ${batch.partRows} | ${renderDateRange(batch.dateRange)} |`);
  }
  if (report.batches.length === 0) {
    lines.push("| none | 0 | 0 | 0 | 0 | 0 | unknown |");
  }
  lines.push("");
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
  lines.push("- Raw transcript text, message data, part data, session titles, project names, project paths, prompts, and stable ids are not emitted.");
  lines.push("- Use `--format json --out <path>` for a machine-readable redacted batch manifest before any read-only content analysis fan-out.");
  lines.push("- Use `--show-paths` only when home-redacted source paths are acceptable for the report audience.");
  lines.push("");
  return lines.join("\n");
}

function renderReport(report: InventoryReport, format: OutputFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }
  return renderMarkdown(report);
}

function writeOutput(output: string, outPath: string | null, overwrite: boolean): void {
  if (!outPath) {
    process.stdout.write(output);
    return;
  }
  const parent = path.dirname(outPath);
  if (!safeIsDirectory(parent)) {
    throw new Error(`Output parent directory does not exist: ${parent}`);
  }
  if (fs.existsSync(outPath) && !overwrite) {
    throw new Error(`Output file already exists; pass --overwrite to replace it: ${outPath}`);
  }
  fs.writeFileSync(outPath, output, "utf8");
  console.log(`wrote ${outPath}`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);
  writeOutput(renderReport(report, options.format), options.outPath, options.overwrite);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
