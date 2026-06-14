export type AutopilotProtectedPathGuardDecision = {
  action: "allow" | "block";
  reason: string;
  paths: string[];
};

export type AutopilotWorkerScope = {
  read: string[];
  write: string[];
  forbidden: string[];
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
  const candidate = normalizedPath(value).toLowerCase();
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

function shellWords(command: string): string[] {
  const words: string[] = [];
  for (const match of command.matchAll(/"([^"]+)"|'([^']+)'|([^\s'"`;|&<>]+)/g)) {
    const word = shellPathToken(match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (word.length > 0) {
      words.push(word);
    }
  }
  return words;
}

function normalizedCommandWord(value: string): string {
  return value.toLowerCase().replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
}

function isNpmCommand(value: string | undefined): boolean {
  return value != null && /^npm(?:\.cmd|\.exe)?$/.test(normalizedCommandWord(value));
}

function isNodeCommand(value: string | undefined): boolean {
  return value != null && /^node(?:\.cmd|\.exe)?$/.test(normalizedCommandWord(value));
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

function bashHasIndirectProtectedPathConstruction(command: string, workdir?: string): boolean {
  const normalized = command.replaceAll("\\", "/").toLowerCase();
  const compact = normalized.replace(/[^a-z0-9._/-]+/g, "/");
  const collapsedWithDots = normalized.replace(/[^a-z0-9.]+/g, "");
  const collapsedAlpha = normalized.replace(/[^a-z0-9]+/g, "");
  const normalizedWorkdir = workdir == null ? "" : normalizedPath(workdir).toLowerCase();
  const commandHasAutomationFragments = /\bautomation\b/.test(normalized) || (/\bauto\b/.test(normalized) && /\bmation\b/.test(normalized)) || collapsedAlpha.includes("automation");
  return /openspec\/changes\/[^/]+\/automation(?:\/|$)/.test(compact)
    || /\.autopilot(?:\/|$)/.test(compact)
    || collapsedWithDots.includes(".autopilot")
    || /(?:^|\/)\.\/autopilot(?:\/|$)/.test(compact)
    || /(?:^|\/)\.auto\/pilot(?:\/|$)/.test(compact)
    || (normalized.includes(".auto") && /\bpilot\b/.test(normalized))
    || /openspec.*changes.*automation/.test(collapsedAlpha)
    || (((/\bopenspec\b/.test(normalized) || (/\bopen\b/.test(normalized) && /\bspec\b/.test(normalized))) && /\bchanges\b/.test(normalized) && commandHasAutomationFragments))
    || (/(?:^|\/)openspec\/changes\/[^/]+(?:\/|$)/.test(normalizedWorkdir) && commandHasAutomationFragments);
}

function shellHasControlSyntax(command: string): boolean {
  return /[\r\n`]|\$\(|;|&&|\|\||[|<>]/.test(command);
}

function bashLooksReadOnly(command: string): boolean {
  const normalized = command.trim().toLowerCase().replaceAll("\\", "/");
  if (shellHasControlSyntax(normalized)) {
    return false;
  }
  if (bashMustFailClosedAsMutation(command)) {
    return false;
  }
  const words = shellWords(command).map(normalizedCommandWord);
  return /^(get-content|test-path|rg|grep|select-string)\b/.test(normalized)
    || (isNodeCommand(words[0]) && words[1] === "tools/autopilot-ledger.ts");
}

function bashMustFailClosedAsMutation(command: string): boolean {
  const words = shellWords(command).map(normalizedCommandWord);
  if (isNpmCommand(words[0])) {
    return true;
  }
  if (!isNodeCommand(words[0])) {
    return false;
  }
  return words.slice(1).some((word) => /^tools\/test-[a-z0-9-]+\.ts$/.test(word) || word.startsWith("tools/autopilot-ledger.ts") && word !== "tools/autopilot-ledger.ts");
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

function workerBlock(paths: string[], reason: string): AutopilotProtectedPathGuardDecision {
  return { action: "block", reason: `${reason}. protected Autopilot state and worker scope boundaries must be enforced by the plugin.`, paths: Array.from(new Set(paths)).sort((left, right) => left.localeCompare(right)) };
}

function globPatternToRegExp(pattern: string): RegExp {
  const normalized = normalizedPath(pattern);
  let source = "^";
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index++;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  source += "$";
  return new RegExp(source);
}

function pathMatchesAny(candidate: string, patterns: string[]): boolean {
  const normalized = normalizedPath(candidate);
  return patterns.some((pattern) => globPatternToRegExp(pattern).test(normalized));
}

function unsafeComparablePath(value: string): boolean {
  const raw = value.trim().replace(/^['"]|['"]$/g, "").replaceAll("\\", "/");
  return raw.length === 0 || raw.startsWith("/") || /^[A-Za-z]:\//.test(raw) || raw.split("/").includes("..");
}

function shellMutatingCandidatePaths(command: string, workdir?: string): string[] {
  return bashPathTokens(command).map((token) => workdir == null ? token : `${workdir}/${token}`);
}

function workerMutationPaths(tool: string, args: unknown): { paths: string[]; readOnly: boolean; unclassified: boolean } {
  if (tool === "apply_patch") {
    return !isRecord(args) || typeof args.patchText !== "string"
      ? { paths: ["unclassified"], readOnly: false, unclassified: true }
      : { paths: patchPaths(args.patchText), readOnly: false, unclassified: false };
  }

  if (directPathTools.has(tool)) {
    const paths = collectDirectPaths(args);
    return { paths: paths.length > 0 ? paths : ["unclassified"], readOnly: false, unclassified: paths.length === 0 };
  }

  if (tool === "bash" || toolNameLooksShellLike(tool) || commandFromArgs(args) != null) {
    const command = commandFromArgs(args);
    if (!isRecord(args) || command == null) {
      return { paths: ["unclassified"], readOnly: false, unclassified: true };
    }
    if (shellHasControlSyntax(command)) {
      return { paths: ["unclassified"], readOnly: false, unclassified: true };
    }
    if (bashLooksReadOnly(command)) {
      return { paths: [], readOnly: true, unclassified: false };
    }
    if (bashMustFailClosedAsMutation(command)) {
      return { paths: ["unclassified"], readOnly: false, unclassified: true };
    }
    const cwd = typeof args.cwd === "string" && args.cwd.trim().length > 0 ? args.cwd : undefined;
    const workdir = typeof args.workdir === "string" && args.workdir.trim().length > 0 ? args.workdir : cwd;
    const paths = shellMutatingCandidatePaths(command, workdir);
    return { paths: paths.length > 0 ? paths : ["unclassified"], readOnly: false, unclassified: paths.length === 0 };
  }

  if (toolNameLooksMutating(tool)) {
    const paths = collectStrings(args);
    return { paths: paths.length > 0 ? paths : ["unclassified"], readOnly: false, unclassified: paths.length === 0 };
  }

  return { paths: [], readOnly: true, unclassified: false };
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
    const indirectProtectedPath = bashHasIndirectProtectedPathConstruction(command, workdir);
    return (protectedPaths.length > 0 || indirectProtectedPath) && !bashLooksReadOnly(command)
      ? block(protectedPaths.length > 0 ? protectedPaths : ["unclassified"], `${tool} cannot directly mutate protected Autopilot state paths`)
      : allow(`${tool} command does not directly mutate protected Autopilot state paths`);
  }

  const directPaths = toolNameLooksMutating(tool) ? collectStrings(args) : collectDirectPaths(args);
  const protectedPaths = directPaths.filter(protectedPath);
  if (protectedPaths.length > 0 && toolNameLooksMutating(tool)) {
    return block(protectedPaths, `${tool} cannot directly mutate protected Autopilot state paths`);
  }

  return allow("tool is not a protected Autopilot path mutation surface");
}

export function guardAutopilotWorkerScopeToolCall(tool: string, args: unknown, scope: AutopilotWorkerScope): AutopilotProtectedPathGuardDecision {
  const protectedDecision = guardAutopilotProtectedPathToolCall(tool, args);
  if (protectedDecision.action === "block") {
    return protectedDecision;
  }

  const classified = workerMutationPaths(tool, args);
  if (classified.readOnly) {
    return allow("worker tool call is read-only or does not expose a mutation surface");
  }
  if (classified.unclassified) {
    return workerBlock(classified.paths, `${tool} arguments cannot be classified safely for worker write scope`);
  }

  const unsafe = classified.paths.filter(unsafeComparablePath);
  if (unsafe.length > 0) {
    return workerBlock(unsafe, "worker write path is absolute, empty, or contains traversal and cannot be compared safely");
  }

  const forbidden = classified.paths.filter((candidate) => protectedPath(candidate) || pathMatchesAny(candidate, scope.forbidden));
  if (forbidden.length > 0) {
    return workerBlock(forbidden, "worker write path targets forbidden scope");
  }

  const outside = classified.paths.filter((candidate) => !pathMatchesAny(candidate, scope.write));
  if (outside.length > 0) {
    return workerBlock(outside, "worker write path is outside assigned write scope");
  }

  return allow("worker write paths are inside assigned write scope and outside forbidden scope");
}
