import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { InitProjectSessionRetroLedgerOptions, ProjectSessionRetroLedger, ProjectSessionRetroSession, ProjectSessionRetroSource } from "./types.ts";
import { computeAnalysisProgress } from "./progress.ts";
import { hashRef, makeDateRange, maybePath, normalizeCount, normalizeForDedupe, normalizeMillis, normalizeNumber, pathWithinRoot, quoteIdent, redactPath, requireHome, resolveInputPath, TOOL_NAME, uniquePaths } from "./utils.ts";

type SessionToolSignals = {
  hasEditTool: boolean;
  hasGitReviewProxy: boolean;
  hasValidationProxy: boolean;
  toolErrorCount: number;
  toolNames: Set<string>;
};

type ReadSourceResult = {
  sessions: Array<{ ref: string; session: ProjectSessionRetroSession; timeCreatedMs: number | null; timeUpdatedMs: number | null }>;
  source: ProjectSessionRetroSource;
};

const EDIT_TOOLS = new Set([
  "apply_patch",
  "edit",
  "write",
  "serena_replace_content",
  "serena_replace_symbol_body",
  "serena_insert_after_symbol",
  "serena_insert_before_symbol",
  "serena_create_text_file",
  "serena_rename_symbol",
  "serena_safe_delete_symbol",
]);
const VALIDATION_COMMAND_PATTERNS = [
  /\b(test|pytest|vitest|cargo test|go test|dotnet test|mvn test|gradle test)\b/i,
  /\bvalidate\b/i,
  /\blint\b/i,
  /\b(typecheck|tsc|clippy|check)\b/i,
  /\b(build|cargo build|dotnet build)\b/i,
  /\b(fmt|format|prettier|rustfmt)\b/i,
];
const GIT_REVIEW_COMMAND_PATTERN = /\bgit\s+(status|diff|log)\b/i;
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
  "permission",
];

function candidateDataDirs(options: Pick<InitProjectSessionRetroLedgerOptions, "dataDirs" | "useDefaultPaths">): string[] {
  const candidates = [...(options.dataDirs ?? [])];
  if (options.useDefaultPaths === false) {
    return uniquePaths(candidates.map(resolveInputPath));
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
  return uniquePaths(candidates.map(resolveInputPath));
}

function discoverDbPaths(options: Pick<InitProjectSessionRetroLedgerOptions, "dataDirs" | "dbPaths" | "useDefaultPaths">): string[] {
  const dataDirs = candidateDataDirs(options);
  const candidates = [...(options.dbPaths ?? []).map(resolveInputPath)];
  const explicitDataDirs = new Set((options.dataDirs ?? []).map((dir) => normalizeForDedupe(resolveInputPath(dir))));
  for (const dir of dataDirs) {
    const dbPath = path.join(dir, "opencode.db");
    if (explicitDataDirs.has(normalizeForDedupe(dir)) || fs.existsSync(dbPath)) {
      candidates.push(dbPath);
    }
  }
  return uniquePaths(candidates);
}

function tableNames(db: InstanceType<typeof DatabaseSync>): string[] {
  const rows = db.prepare("select name from sqlite_master where type = 'table' order by name").all() as Array<{ name: unknown }>;
  return rows.map((row) => String(row.name));
}

function tableColumns(db: InstanceType<typeof DatabaseSync>, table: string): string[] {
  const rows = db.prepare(`pragma table_info(${quoteIdent(table)})`).all() as Array<{ name: unknown }>;
  return rows.map((row) => String(row.name));
}

function hasColumn(schema: Record<string, string[]>, table: string, column: string): boolean {
  return schema[table]?.includes(column) ?? false;
}

function selectSessionExpression(schema: Record<string, string[]>, column: string, alias: string): string {
  if (!hasColumn(schema, "session", column)) {
    return `null as ${quoteIdent(alias)}`;
  }
  return `s.${quoteIdent(column)} as ${quoteIdent(alias)}`;
}

function countBySession(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, schema: Record<string, string[]>, table: string): Map<string, number> {
  if (!tables.has(table) || !hasColumn(schema, table, "session_id")) {
    return new Map();
  }
  const rows = db.prepare(`select session_id as sessionID, count(*) as count from ${quoteIdent(table)} group by session_id`).all() as Array<{ count: unknown; sessionID: unknown }>;
  return new Map(rows.map((row) => [String(row.sessionID), normalizeCount(row.count)]));
}

function openTodoBySession(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, schema: Record<string, string[]>): Map<string, number> {
  if (!tables.has("todo") || !hasColumn(schema, "todo", "session_id") || !hasColumn(schema, "todo", "status")) {
    return new Map();
  }
  const rows = db.prepare("select session_id as sessionID, count(*) as count from todo where status in ('pending', 'in_progress') group by session_id").all() as Array<{ count: unknown; sessionID: unknown }>;
  return new Map(rows.map((row) => [String(row.sessionID), normalizeCount(row.count)]));
}

function safeJsonRecord(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return typeof parsed === "object" && parsed != null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch (_error) {
    return null;
  }
}

function asRecordOrEmpty(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getSessionToolSignals(signals: Map<string, SessionToolSignals>, sessionID: string): SessionToolSignals {
  const existing = signals.get(sessionID);
  if (existing) {
    return existing;
  }
  const created: SessionToolSignals = {
    hasEditTool: false,
    hasGitReviewProxy: false,
    hasValidationProxy: false,
    toolErrorCount: 0,
    toolNames: new Set<string>(),
  };
  signals.set(sessionID, created);
  return created;
}

function readPartSignals(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, schema: Record<string, string[]>): Map<string, SessionToolSignals> {
  const signals = new Map<string, SessionToolSignals>();
  if (!tables.has("part") || !hasColumn(schema, "part", "session_id") || !hasColumn(schema, "part", "data")) {
    return signals;
  }
  for (const row of db.prepare("select session_id, data from part").iterate() as Iterable<{ data: unknown; session_id: unknown }>) {
    const parsed = safeJsonRecord(row.data);
    if (!parsed || parsed.type !== "tool") {
      continue;
    }
    const sessionID = String(row.session_id);
    const current = getSessionToolSignals(signals, sessionID);
    const tool = typeof parsed.tool === "string" && parsed.tool !== "" ? parsed.tool : "<missing>";
    current.toolNames.add(tool);
    if (EDIT_TOOLS.has(tool)) {
      current.hasEditTool = true;
    }
    const state = asRecordOrEmpty(parsed.state);
    if (state.status === "error") {
      current.toolErrorCount++;
    }
    const input = asRecordOrEmpty(state.input);
    if (tool === "bash" && typeof input.command === "string") {
      if (VALIDATION_COMMAND_PATTERNS.some((pattern) => pattern.test(input.command as string))) {
        current.hasValidationProxy = true;
      }
      if (GIT_REVIEW_COMMAND_PATTERN.test(input.command)) {
        current.hasGitReviewProxy = true;
      }
    }
  }
  return signals;
}

function mechanicalSignals(signals: SessionToolSignals, openTodoCount: number): string[] {
  const result: string[] = [];
  if (signals.hasEditTool) {
    result.push("has_edit_tool");
  }
  if (signals.hasValidationProxy) {
    result.push("has_validation_proxy");
  }
  if (signals.hasGitReviewProxy) {
    result.push("has_git_review_proxy");
  }
  if (signals.toolErrorCount > 0) {
    result.push("has_tool_error");
  }
  if (openTodoCount > 0) {
    result.push("has_open_todo");
  }
  if (signals.hasEditTool && !signals.hasValidationProxy) {
    result.push("edit_without_validation_proxy");
  }
  if (signals.hasEditTool && openTodoCount > 0) {
    result.push("edit_with_open_todo");
  }
  return result;
}

function readMatchingProjectIds(db: InstanceType<typeof DatabaseSync>, tables: Set<string>, schema: Record<string, string[]>, projectRoot: string): Set<string> {
  const projectIds = new Set<string>();
  if (tables.has("project") && hasColumn(schema, "project", "id") && hasColumn(schema, "project", "worktree")) {
    for (const row of db.prepare("select id, worktree from project").iterate() as Iterable<{ id: unknown; worktree: unknown }>) {
      if (pathWithinRoot(typeof row.worktree === "string" ? row.worktree : null, projectRoot)) {
        projectIds.add(String(row.id));
      }
    }
  }
  if (tables.has("project_directory") && hasColumn(schema, "project_directory", "project_id") && hasColumn(schema, "project_directory", "directory")) {
    for (const row of db.prepare("select project_id as projectID, directory from project_directory").iterate() as Iterable<{ directory: unknown; projectID: unknown }>) {
      if (pathWithinRoot(typeof row.directory === "string" ? row.directory : null, projectRoot)) {
        projectIds.add(String(row.projectID));
      }
    }
  }
  if (tables.has("workspace") && hasColumn(schema, "workspace", "project_id") && hasColumn(schema, "workspace", "directory")) {
    for (const row of db.prepare("select project_id as projectID, directory from workspace").iterate() as Iterable<{ directory: unknown; projectID: unknown }>) {
      if (row.projectID != null && pathWithinRoot(typeof row.directory === "string" ? row.directory : null, projectRoot)) {
        projectIds.add(String(row.projectID));
      }
    }
  }
  return projectIds;
}

function emptySource(dbPath: string, showPaths: boolean): ProjectSessionRetroSource {
  const source: ProjectSessionRetroSource = {
    includedSessions: 0,
    readable: false,
    schemaTables: [],
    sessionsRead: 0,
    sourceRef: hashRef("source", dbPath),
    status: "unreadable",
    type: "sqlite-opencode-db",
    warnings: [],
  };
  const redacted = maybePath(dbPath, showPaths);
  if (redacted) {
    source.path = redacted;
  }
  return source;
}

function readSqliteSource(dbPath: string, projectRoot: string, showPaths: boolean): ReadSourceResult {
  const source = emptySource(dbPath, showPaths);
  if (!fs.existsSync(dbPath)) {
    source.status = "missing";
    source.warnings.push("candidate database file does not exist");
    return { sessions: [], source };
  }

  let db: InstanceType<typeof DatabaseSync> | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const tables = new Set(tableNames(db));
    source.schemaTables = [...tables].filter((name) => KNOWN_SQLITE_TABLES.includes(name)).sort();
    const schema = Object.fromEntries([...tables].map((table) => [table, tableColumns(db!, table)]));
    source.readable = true;

    if (!tables.has("session") || !hasColumn(schema, "session", "id")) {
      source.status = "unsupported-session-schema";
      source.warnings.push("missing session table or session.id column");
      return { sessions: [], source };
    }

    const matchingProjectIds = readMatchingProjectIds(db, tables, schema, projectRoot);
    const messageCounts = countBySession(db, tables, schema, "message");
    const partCounts = countBySession(db, tables, schema, "part");
    const todoCounts = countBySession(db, tables, schema, "todo");
    const openTodos = openTodoBySession(db, tables, schema);
    const toolSignals = readPartSignals(db, tables, schema);
    const select = [
      selectSessionExpression(schema, "id", "id"),
      selectSessionExpression(schema, "project_id", "project_id"),
      selectSessionExpression(schema, "parent_id", "parent_id"),
      selectSessionExpression(schema, "workspace_id", "workspace_id"),
      selectSessionExpression(schema, "directory", "directory"),
      selectSessionExpression(schema, "path", "path"),
      selectSessionExpression(schema, "time_created", "time_created"),
      selectSessionExpression(schema, "time_updated", "time_updated"),
      selectSessionExpression(schema, "agent", "agent"),
      selectSessionExpression(schema, "model", "model"),
      selectSessionExpression(schema, "cost", "cost"),
      selectSessionExpression(schema, "tokens_input", "tokens_input"),
      selectSessionExpression(schema, "tokens_output", "tokens_output"),
      selectSessionExpression(schema, "tokens_reasoning", "tokens_reasoning"),
      selectSessionExpression(schema, "tokens_cache_read", "tokens_cache_read"),
      selectSessionExpression(schema, "tokens_cache_write", "tokens_cache_write"),
    ];
    const orderBy = hasColumn(schema, "session", "time_created") ? " order by s.time_created, s.id" : " order by s.id";
    const rows = db.prepare(`select ${select.join(", ")} from session s${orderBy}`).all() as Array<Record<string, unknown>>;
    source.sessionsRead = rows.length;

    const sessions = rows.flatMap((row): ReadSourceResult["sessions"] => {
      const id = String(row.id);
      const projectID = row.project_id == null ? null : String(row.project_id);
      const directory = typeof row.directory === "string" ? row.directory : null;
      const sessionPath = typeof row.path === "string" ? row.path : null;
      const matchesProject = projectID != null && matchingProjectIds.has(projectID);
      if (!matchesProject && !pathWithinRoot(directory, projectRoot) && !pathWithinRoot(sessionPath, projectRoot)) {
        return [];
      }
      const parentID = row.parent_id == null ? null : String(row.parent_id);
      const workspaceID = row.workspace_id == null ? null : String(row.workspace_id);
      const created = normalizeMillis(row.time_created);
      const updated = normalizeMillis(row.time_updated);
      const signals = toolSignals.get(id) ?? {
        hasEditTool: false,
        hasGitReviewProxy: false,
        hasValidationProxy: false,
        toolErrorCount: 0,
        toolNames: new Set<string>(),
      };
      const openTodoCount = openTodos.get(id) ?? 0;
      const ref = hashRef("session", id);
      return [{
        ref,
        session: {
          metadata: {
            agent: row.agent == null ? null : String(row.agent),
            child: parentID != null && parentID !== "",
            cost: normalizeNumber(row.cost),
            dateRange: makeDateRange([created, updated]),
            mechanicalSignals: mechanicalSignals(signals, openTodoCount),
            messageRows: messageCounts.get(id) ?? 0,
            model: row.model == null ? null : String(row.model),
            parentRef: parentID ? hashRef("session", parentID) : null,
            partRows: partCounts.get(id) ?? 0,
            projectRef: projectID ? hashRef("project", projectID) : null,
            sourceRef: source.sourceRef,
            todoRows: todoCounts.get(id) ?? 0,
            tokens: {
              cacheRead: normalizeCount(row.tokens_cache_read),
              cacheWrite: normalizeCount(row.tokens_cache_write),
              input: normalizeCount(row.tokens_input),
              output: normalizeCount(row.tokens_output),
              reasoning: normalizeCount(row.tokens_reasoning),
            },
            toolNames: [...signals.toolNames].sort(),
            workspaceRef: workspaceID ? hashRef("workspace", workspaceID) : null,
          },
          coverage: {
            limits: ["init populated redacted metadata only; observations require session transcript review"],
            status: "partial",
          },
          observations: [],
        },
        timeCreatedMs: created,
        timeUpdatedMs: updated,
      }];
    });
    source.includedSessions = sessions.length;
    source.status = "ok";
    return { sessions, source };
  } catch (error) {
    source.status = "error";
    source.warnings.push(error instanceof Error ? error.message : String(error));
    return { sessions: [], source };
  } finally {
    db?.close();
  }
}

export function initProjectSessionRetroLedger(options: InitProjectSessionRetroLedgerOptions): ProjectSessionRetroLedger {
  const projectRoot = path.resolve(options.projectRoot);
  const sourceResults = discoverDbPaths(options).map((dbPath) => readSqliteSource(dbPath, projectRoot, options.showPaths === true));
  const bySessionRef = new Map<string, ReadSourceResult["sessions"][number]>();
  for (const result of sourceResults) {
    for (const session of result.sessions) {
      if (!bySessionRef.has(session.ref)) {
        bySessionRef.set(session.ref, session);
      }
    }
  }
  const sessions = [...bySessionRef.entries()].sort((left, right) => (left[1].timeCreatedMs ?? 0) - (right[1].timeCreatedMs ?? 0) || left[0].localeCompare(right[0]));
  const ledgerSessions: ProjectSessionRetroLedger["sessions"] = {};
  for (const [ref, entry] of sessions) {
    ledgerSessions[ref] = entry.session;
  }
  const ledger: ProjectSessionRetroLedger = {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    analysisProgress: { completedSessionCount: 0, lastAnalyzedSessionRef: null, nextSessionRef: null, remainingSessionCount: 0, sessionOrder: [] },
    openspecProposals: {},
    plans: {},
    rootCauses: {},
    schemaVersion: 1,
    scope: {
      dateRange: makeDateRange(sessions.flatMap((entry) => [entry[1].timeCreatedMs, entry[1].timeUpdatedMs])),
      mode: "current-project",
      projectRoot: options.showPaths === true ? redactPath(projectRoot) : undefined,
      projectRootRef: hashRef("projectRoot", projectRoot),
      sessionCount: sessions.length,
      source: "opencode-db",
    },
    sessions: ledgerSessions,
    sources: sourceResults.map((result) => result.source),
    tool: TOOL_NAME,
    trends: {},
    validation: { errors: [], warnings: [] },
  };
  ledger.analysisProgress = computeAnalysisProgress(ledger);
  return ledger;
}
