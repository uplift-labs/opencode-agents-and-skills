export type AutopilotProtectedPathGuardDecision = {
  action: "allow" | "block";
  reason: string;
  paths: string[];
};

const directPathTools = new Set([
  "edit",
  "write",
  "str_replace_editor",
  "serena_create_text_file",
  "serena_insert_after_symbol",
  "serena_insert_before_symbol",
  "serena_rename_symbol",
  "serena_replace_content",
  "serena_replace_symbol_body",
  "serena_safe_delete_symbol",
]);

const pathKeys = new Set(["cwd", "destination", "dest", "file", "filename", "fileName", "filePath", "outFile", "output", "path", "relativePath", "relative_path", "target", "workdir"]);
const commandKeys = new Set(["cmd", "command", "script"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function normalizedPath(value: string): string {
  const raw = value.trim().replace(/^['"]|['"]$/g, "").replaceAll("\\", "/").replace(/^\.\//, "");
  const prefix = raw.startsWith("/") ? "/" : "";
  const parts: string[] = [];
  for (const part of raw.split("/")) {
    if (part.length === 0 || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length > 0) {
        parts.pop();
      }
      continue;
    }
    parts.push(part);
  }
  return `${prefix}${parts.join("/")}`;
}

function protectedPath(value: string): boolean {
  const candidate = normalizedPath(value);
  return candidate === ".autopilot"
    || candidate.startsWith(".autopilot/")
    || candidate.includes("/.autopilot/")
    || candidate.endsWith("/.autopilot")
    || /(?:^|\/)openspec\/changes\/[^/]+\/automation(?:\/|$)/.test(candidate);
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizedPath))).sort((left, right) => left.localeCompare(right));
}

function collectDirectPaths(value: unknown, parentKey = "", output: string[] = []): string[] {
  if (typeof value === "string") {
    if (pathKeys.has(parentKey)) {
      output.push(value);
    }
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDirectPaths(item, parentKey, output);
    }
    return output;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectDirectPaths(item, key, output);
    }
  }
  return output;
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }
    return output;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      collectStrings(item, output);
    }
  }
  return output;
}

function patchPaths(patchText: string): string[] {
  const paths: string[] = [];
  for (const match of patchText.matchAll(/^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/gm)) {
    paths.push(match[1]);
  }
  for (const match of patchText.matchAll(/^\*\*\* Move to:\s*(.+)$/gm)) {
    paths.push(match[1]);
  }
  return paths;
}

function shellPathToken(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/[),]+$/g, "");
}

function bashPathTokens(command: string): string[] {
  const tokens: string[] = [];
  for (const match of command.matchAll(/"([^"]+)"|'([^']+)'|([^\s'"`;|&<>]+)/g)) {
    const token = shellPathToken(match[1] ?? match[2] ?? match[3] ?? "");
    if (token.includes("/") || token.includes("\\") || token.includes(".autopilot") || token.includes("automation") || /\.[A-Za-z0-9]+$/.test(token)) {
      tokens.push(token);
    }
  }
  return tokens;
}

function bashProtectedPathMentions(command: string, workdir?: string): string[] {
  const normalized = command.replaceAll("\\", "/");
  const paths: string[] = [];
  for (const match of normalized.matchAll(/([^\s'"`;|&<>)]*\.autopilot(?:\/[^\s'"`;|&<>)]*)?)/g)) {
    paths.push(match[1]);
  }
  for (const match of normalized.matchAll(/([^\s'"`;|&<>)]*openspec\/changes\/[^/\s'"`;|&<>)]*\/automation(?:\/[^\s'"`;|&<>)]*)?)/g)) {
    paths.push(match[1]);
  }
  if (workdir != null) {
    paths.push(workdir);
    for (const token of bashPathTokens(command)) {
      paths.push(`${workdir}/${token}`);
    }
  }
  return paths;
}

function shellHasControlSyntax(command: string): boolean {
  return /[\r\n`]|\$\(|;|&&|\|\||[|<>]/.test(command);
}

function bashLooksReadOnly(command: string): boolean {
  const normalized = command.trim().toLowerCase().replaceAll("\\", "/");
  if (shellHasControlSyntax(normalized)) {
    return false;
  }
  return /^(get-content|test-path|rg|grep|select-string)\b/.test(normalized)
    || /^npm\s+run\s+autopilot:validate\b/.test(normalized)
    || /^node\s+tools\/autopilot-ledger\.ts\b/.test(normalized);
}

function toolNameLooksMutating(tool: string): boolean {
  const normalized = tool.toLowerCase();
  return normalized.includes("str_replace")
    || /(?:^|[_.:-])(create|delete|edit|insert|move|patch|remove|rename|replace|write)(?:$|[_.:-])/.test(normalized);
}

function toolNameLooksShellLike(tool: string): boolean {
  const normalized = tool.toLowerCase();
  return /(?:^|[_.:-])(bash|command|powershell|shell|terminal)(?:$|[_.:-])/.test(normalized);
}

function commandFromArgs(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  for (const [key, item] of Object.entries(value)) {
    if (commandKeys.has(key) && typeof item === "string" && item.trim().length > 0) {
      return item;
    }
  }
  return undefined;
}

function block(paths: string[], reason: string): AutopilotProtectedPathGuardDecision {
  return { action: "block", reason, paths: sortedUnique(paths) };
}

function allow(reason: string): AutopilotProtectedPathGuardDecision {
  return { action: "allow", reason, paths: [] };
}

export function guardAutopilotProtectedPathToolCall(tool: string, args: unknown): AutopilotProtectedPathGuardDecision {
  if (tool === "apply_patch") {
    if (!isRecord(args) || typeof args.patchText !== "string") {
      return block(["unclassified"], "apply_patch arguments cannot be classified safely for protected Autopilot state paths");
    }
    const patchText = args.patchText;
    const protectedPaths = patchPaths(patchText).filter(protectedPath);
    return protectedPaths.length > 0
      ? block(protectedPaths, "apply_patch cannot directly mutate protected Autopilot state paths")
      : allow("apply_patch does not target protected Autopilot state paths");
  }

  if (directPathTools.has(tool)) {
    const directPaths = collectDirectPaths(args);
    if (directPaths.length === 0) {
      return block(["unclassified"], `${tool} arguments cannot be classified safely for protected Autopilot state paths`);
    }
    const protectedPaths = directPaths.filter(protectedPath);
    return protectedPaths.length > 0
      ? block(protectedPaths, `${tool} cannot directly mutate protected Autopilot state paths`)
      : allow(`${tool} does not target protected Autopilot state paths`);
  }

  if (tool === "bash" || toolNameLooksShellLike(tool) || commandFromArgs(args) != null) {
    const command = commandFromArgs(args);
    if (!isRecord(args) || command == null) {
      return block(["unclassified"], `${tool} arguments cannot be classified safely for protected Autopilot state paths`);
    }
    const cwd = typeof args.cwd === "string" && args.cwd.trim().length > 0 ? args.cwd : undefined;
    const workdir = typeof args.workdir === "string" && args.workdir.trim().length > 0 ? args.workdir : cwd;
    const protectedPaths = bashProtectedPathMentions(command, workdir).filter(protectedPath);
    return protectedPaths.length > 0 && !bashLooksReadOnly(command)
      ? block(protectedPaths, `${tool} cannot directly mutate protected Autopilot state paths`)
      : allow(`${tool} command does not directly mutate protected Autopilot state paths`);
  }

  const directPaths = toolNameLooksMutating(tool) ? collectStrings(args) : collectDirectPaths(args);
  const protectedPaths = directPaths.filter(protectedPath);
  if (protectedPaths.length > 0 && toolNameLooksMutating(tool)) {
    return block(protectedPaths, `${tool} cannot directly mutate protected Autopilot state paths`);
  }

  return allow("tool is not a protected Autopilot path mutation surface");
}
