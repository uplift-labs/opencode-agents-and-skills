#!/usr/bin/env node
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

export type RoutedClientMessage =
  | { kind: "reply"; line: string }
  | { kind: "forward"; line: string }
  | { kind: "drop" };

const headroomPrompts = [
  {
    name: "headroom_usage_policy",
    title: "Use Headroom Safely",
    description: "Token-saving workflow for compressing large logs, search results, JSON, and tool outputs without losing exact evidence.",
    arguments: [],
  },
] as const;

const headroomUsagePolicy = [
  "Use Headroom MCP only when it saves more context than it adds:",
  "- Good candidates: large logs, search results, JSON payloads, validation output, repeated tool output, broad inventories.",
  "- Poor candidates: small outputs, exact code under active edit, short errors already visible, safety-critical details that must be quoted exactly.",
  "- After `headroom_compress`, keep the returned hash in the working notes or final evidence when relevant.",
  "- Before relying on exact code, line numbers, errors, commands, security findings, or safety-critical facts, call `headroom_retrieve` with an empty query and inspect the full original.",
  "- Filtered retrieval is a convenience for navigation, not sole evidence for exact claims.",
  "- Prefer targeted `Glob`, `Grep`, bounded `Read`, and explicit `rtk <command>` before compressing avoidable broad output.",
].join("\n");

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function emptyPromptsListResponse(id: unknown): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    result: { prompts: headroomPrompts },
  });
}

export function promptGetResponse(id: unknown, name: string): string {
  if (name !== "headroom_usage_policy") {
    return JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: `Unknown prompt: ${name}`,
      },
    });
  }

  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    result: {
      description: headroomPrompts[0].description,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: headroomUsagePolicy,
          },
        },
      ],
    },
  });
}

function promptNameFromParams(params: unknown): string | undefined {
  if (!isJsonRpcRequest(params)) {
    return undefined;
  }
  return typeof params.name === "string" ? params.name : undefined;
}

export function routeServerLine(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return line;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return line;
  }

  if (!isJsonRpcRequest(parsed)) {
    return line;
  }

  const result = isJsonRpcRequest(parsed.result) ? parsed.result : undefined;
  const capabilities = isJsonRpcRequest(result?.capabilities) ? result.capabilities : undefined;
  if (!capabilities || !isJsonRpcRequest(result?.serverInfo)) {
    return line;
  }

  const next = {
    ...parsed,
    result: {
      ...result,
      capabilities: {
        ...capabilities,
        prompts: { listChanged: false },
      },
    },
  };
  return JSON.stringify(next);
}

export function routeClientLine(line: string): RoutedClientMessage {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return { kind: "drop" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: "forward", line };
  }

  if (!isJsonRpcRequest(parsed)) {
    return { kind: "forward", line };
  }

  if (parsed.method === "prompts/list" && Object.hasOwn(parsed, "id")) {
    return { kind: "reply", line: emptyPromptsListResponse(parsed.id) };
  }

  if (parsed.method === "prompts/list") {
    return { kind: "drop" };
  }

  if (parsed.method === "prompts/get" && Object.hasOwn(parsed, "id")) {
    const name = promptNameFromParams(parsed.params);
    if (!name) {
      return {
        kind: "reply",
        line: JSON.stringify({
          jsonrpc: "2.0",
          id: parsed.id,
          error: { code: -32602, message: "prompts/get requires params.name" },
        }),
      };
    }
    return { kind: "reply", line: promptGetResponse(parsed.id, name) };
  }

  if (parsed.method === "prompts/get") {
    return { kind: "drop" };
  }

  return { kind: "forward", line };
}

function writeLine(stream: NodeJS.WritableStream, line: string): void {
  stream.write(`${line}\n`);
}

function splitLines(buffer: string): { lines: string[]; remainder: string } {
  const parts = buffer.split(/\r?\n/);
  return { lines: parts.slice(0, -1), remainder: parts.at(-1) ?? "" };
}

export function startHeadroomMcpWrapper(): ChildProcessWithoutNullStreams {
  const child = spawn("headroom", ["mcp", "serve"], {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdinBuffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    stdinBuffer += chunk;
    const split = splitLines(stdinBuffer);
    stdinBuffer = split.remainder;

    for (const line of split.lines) {
      const routed = routeClientLine(line);
      if (routed.kind === "reply") {
        writeLine(process.stdout, routed.line);
      } else if (routed.kind === "forward") {
        writeLine(child.stdin, routed.line);
      }
    }
  });

  process.stdin.on("end", () => {
    if (stdinBuffer.trim().length > 0) {
      const routed = routeClientLine(stdinBuffer);
      if (routed.kind === "reply") {
        writeLine(process.stdout, routed.line);
      } else if (routed.kind === "forward") {
        writeLine(child.stdin, routed.line);
      }
    }
    child.stdin.end();
  });

  let childStdoutBuffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    childStdoutBuffer += chunk;
    const split = splitLines(childStdoutBuffer);
    childStdoutBuffer = split.remainder;

    for (const line of split.lines) {
      writeLine(process.stdout, routeServerLine(line));
    }
  });

  child.stdout.on("end", () => {
    if (childStdoutBuffer.length > 0) {
      writeLine(process.stdout, routeServerLine(childStdoutBuffer));
    }
  });

  child.stderr.pipe(process.stderr);

  child.on("error", (error) => {
    console.error(`[headroom-mcp-wrapper] failed to start headroom: ${error.message}`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 0;
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }

  return child;
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  startHeadroomMcpWrapper();
}
