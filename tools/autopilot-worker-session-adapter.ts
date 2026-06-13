export type AutopilotWorkerSessionCapability = {
  available: boolean;
  reason?: string;
};

export type AutopilotWorkerSessionDispatchInput = {
  runId: string;
  taskId: string;
  workerId: string;
  reportId: string;
  title: string;
  metadata: Record<string, unknown>;
  agent?: string;
  model?: string;
  promptForSession: (sessionId: string) => string;
};

export type AutopilotWorkerSessionDispatchResult =
  | { ok: true; sessionId: string; prompt: string }
  | { ok: false; reason: string };

export type AutopilotWorkerSessionCreateResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: string };

export type AutopilotWorkerSessionPromptResult =
  | { ok: true; prompt: string }
  | { ok: false; reason: string };

export type AutopilotReportReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export type AutopilotWorkerSessionAdapter = {
  capability(): Promise<AutopilotWorkerSessionCapability>;
  createSession(input: AutopilotWorkerSessionDispatchInput): Promise<AutopilotWorkerSessionCreateResult>;
  promptSession(input: AutopilotWorkerSessionDispatchInput & { sessionId: string }): Promise<AutopilotWorkerSessionPromptResult>;
  dispatch(input: AutopilotWorkerSessionDispatchInput): Promise<AutopilotWorkerSessionDispatchResult>;
  readFinalReport(input: { sessionId: string; reportId: string }): Promise<AutopilotReportReadResult>;
};

export type CreateOpenCodeWorkerSessionAdapterInput = {
  client: unknown;
  parentSessionId?: string;
  directory?: string;
  worktree?: string;
};

type Callable = (...args: unknown[]) => Promise<unknown> | unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function sessionApi(client: unknown): Record<string, unknown> | null {
  return isRecord(client) && isRecord(client.session) ? client.session : null;
}

function method(api: Record<string, unknown> | null, name: string): Callable | null {
  const candidate = api?.[name];
  return typeof candidate === "function" ? candidate as Callable : null;
}

function dispatchCapability(client: unknown): AutopilotWorkerSessionCapability {
  const api = sessionApi(client);
  const missing: string[] = [];
  if (method(api, "create") == null) {
    missing.push("session.create");
  }
  if (method(api, "promptAsync") == null) {
    missing.push("session.promptAsync");
  }
  if (method(api, "messages") == null) {
    missing.push("session.messages");
  }
  if (missing.length > 0) {
    return { available: false, reason: `OpenCode worker-session capability unavailable: missing ${missing.join(", ")}.` };
  }
  return { available: true };
}

function sessionIdFromCreateResult(result: unknown): string | null {
  const candidates: unknown[] = [result];
  if (isRecord(result)) {
    candidates.push(result.data, result.session, result.info);
  }
  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }
    const value = optionalString(candidate.id) ?? optionalString(candidate.sessionID) ?? optionalString(candidate.sessionId);
    if (value != null) {
      return value;
    }
  }
  return null;
}

function sessionDirectory(options: CreateOpenCodeWorkerSessionAdapterInput): string | undefined {
  return optionalString(options.worktree) ?? optionalString(options.directory);
}

function queryWithDirectory(options: CreateOpenCodeWorkerSessionAdapterInput, extra: Record<string, unknown> = {}): Record<string, unknown> | undefined {
  const query = Object.fromEntries(Object.entries({
    directory: sessionDirectory(options),
    ...extra,
  }).filter((entry): entry is [string, unknown] => entry[1] != null));
  return Object.keys(query).length > 0 ? query : undefined;
}

function sdkModel(model: string | undefined): { providerID: string; modelID: string } | undefined {
  const value = optionalString(model);
  if (value == null) {
    return undefined;
  }
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) {
    return undefined;
  }
  return { providerID: value.slice(0, slash), modelID: value.slice(slash + 1) };
}

function createPayload(input: AutopilotWorkerSessionDispatchInput, options: CreateOpenCodeWorkerSessionAdapterInput): Record<string, unknown> {
  return Object.fromEntries(Object.entries({
    body: Object.fromEntries(Object.entries({
      parentID: optionalString(options.parentSessionId),
      title: input.title,
    }).filter((entry): entry is [string, unknown] => entry[1] != null)),
    query: queryWithDirectory(options),
  }).filter((entry): entry is [string, unknown] => entry[1] != null));
}

function promptPayload(input: AutopilotWorkerSessionDispatchInput, sessionId: string, prompt: string, options: CreateOpenCodeWorkerSessionAdapterInput): Record<string, unknown> {
  return Object.fromEntries(Object.entries({
    path: { id: sessionId },
    query: queryWithDirectory(options),
    body: Object.fromEntries(Object.entries({
      agent: optionalString(input.agent),
      model: sdkModel(input.model),
      parts: [{ type: "text", text: prompt, metadata: input.metadata }],
    }).filter((entry): entry is [string, unknown] => entry[1] != null)),
  }).filter((entry): entry is [string, unknown] => entry[1] != null));
}

function messagesPayload(input: { sessionId: string }, options: CreateOpenCodeWorkerSessionAdapterInput): Record<string, unknown> {
  return Object.fromEntries(Object.entries({
    path: { id: input.sessionId },
    query: queryWithDirectory(options, { limit: 200 }),
  }).filter((entry): entry is [string, unknown] => entry[1] != null));
}

function readMessagesPayload(result: unknown): unknown {
  if (!isRecord(result)) {
    return result;
  }
  return result.data ?? result.messages ?? result.items ?? result;
}

function messageLooksLikeAssistantOutput(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const info = isRecord(value.info) ? value.info : undefined;
  const role = optionalString(info?.role ?? value.role);
  return role === "assistant";
}

function finalReportPayload(result: unknown): unknown {
  const payload = readMessagesPayload(result);
  return Array.isArray(payload) ? payload.filter(messageLooksLikeAssistantOutput) : payload;
}

function collectTextParts(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextParts(item, output);
    }
    return output;
  }
  if (!isRecord(value)) {
    return output;
  }
  const type = optionalString(value.type);
  const text = optionalString(value.text) ?? optionalString(value.content);
  if ((type == null || type === "text") && text != null) {
    output.push(text);
  }
  if (Array.isArray(value.parts)) {
    collectTextParts(value.parts, output);
  }
  if (Array.isArray(value.messages)) {
    collectTextParts(value.messages, output);
  }
  return output;
}

export function createOpenCodeWorkerSessionAdapter(options: CreateOpenCodeWorkerSessionAdapterInput): AutopilotWorkerSessionAdapter {
  const adapter: AutopilotWorkerSessionAdapter = {
    async capability(): Promise<AutopilotWorkerSessionCapability> {
      return dispatchCapability(options.client);
    },

    async createSession(input: AutopilotWorkerSessionDispatchInput): Promise<AutopilotWorkerSessionCreateResult> {
      const capability = dispatchCapability(options.client);
      if (!capability.available) {
        return { ok: false, reason: capability.reason ?? "OpenCode worker-session capability unavailable." };
      }
      const api = sessionApi(options.client);
      const create = method(api, "create");
      if (create == null) {
        return { ok: false, reason: "OpenCode worker-session capability disappeared before session.create." };
      }
      try {
        const created = await create(createPayload(input, options));
        const sessionId = sessionIdFromCreateResult(created);
        if (sessionId == null) {
          return { ok: false, reason: "OpenCode session.create did not return a usable worker session id." };
        }
        return { ok: true, sessionId };
      } catch (error) {
        return { ok: false, reason: `OpenCode worker-session create failed: ${error instanceof Error ? error.message : String(error)}` };
      }
    },

    async promptSession(input: AutopilotWorkerSessionDispatchInput & { sessionId: string }): Promise<AutopilotWorkerSessionPromptResult> {
      const api = sessionApi(options.client);
      const promptAsync = method(api, "promptAsync");
      if (promptAsync == null) {
        return { ok: false, reason: "OpenCode worker-session capability disappeared before session.promptAsync." };
      }
      try {
        const prompt = input.promptForSession(input.sessionId);
        await promptAsync(promptPayload(input, input.sessionId, prompt, options));
        return { ok: true, prompt };
      } catch (error) {
        return { ok: false, reason: `OpenCode worker-session prompt failed: ${error instanceof Error ? error.message : String(error)}` };
      }
    },

    async dispatch(input: AutopilotWorkerSessionDispatchInput): Promise<AutopilotWorkerSessionDispatchResult> {
      const created = await adapter.createSession(input);
      if (!created.ok) {
        return created;
      }
      const prompted = await adapter.promptSession({ ...input, sessionId: created.sessionId });
      if (!prompted.ok) {
        return prompted;
      }
      return { ok: true, sessionId: created.sessionId, prompt: prompted.prompt };
    },

    async readFinalReport(input: { sessionId: string; reportId: string }): Promise<AutopilotReportReadResult> {
      const api = sessionApi(options.client);
      const messages = method(api, "messages");
      if (messages == null) {
        return { ok: false, reason: "OpenCode worker-session report read unavailable: missing session.messages." };
      }
      let result: unknown;
      try {
        result = await messages(messagesPayload(input, options));
      } catch (error) {
        return { ok: false, reason: `OpenCode worker-session report read failed: ${error instanceof Error ? error.message : String(error)}` };
      }
      const text = collectTextParts(finalReportPayload(result)).join("\n");
      if (text.trim().length === 0) {
        return { ok: false, reason: `Worker session ${input.sessionId} has no readable text report output.` };
      }
      return { ok: true, text };
    },
  };
  return adapter;
}
