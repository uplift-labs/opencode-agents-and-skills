#!/usr/bin/env node
import { createOpenCodeWorkerSessionAdapter, type AutopilotWorkerSessionDispatchInput } from "./autopilot-worker-session-adapter.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

type Call = { method: string; input: unknown };

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function dispatchInput(overrides: Partial<AutopilotWorkerSessionDispatchInput> = {}): AutopilotWorkerSessionDispatchInput {
  return {
    runId: "run-1",
    taskId: "task-a",
    workerId: "worker-1",
    reportId: "report-1",
    title: "[autopilot run-1 worker-1] task-a",
    metadata: { autopilotRunId: "run-1", taskId: "task-a", workerId: "worker-1", reportId: "report-1" },
    promptForSession: (sessionId) => `worker prompt for ${sessionId}`,
    ...overrides,
  };
}

function bodyOf(call: Call): Record<string, unknown> {
  const input = call.input;
  assert(typeof input === "object" && input != null && !Array.isArray(input), `${call.method} input must be object.`);
  const record = input as Record<string, unknown>;
  const body = record.body;
  assert(typeof body === "object" && body != null && !Array.isArray(body), `${call.method} input body must be object.`);
  return body as Record<string, unknown>;
}

function pathOf(call: Call): Record<string, unknown> {
  const input = call.input;
  assert(typeof input === "object" && input != null && !Array.isArray(input), `${call.method} input must be object.`);
  const record = input as Record<string, unknown>;
  const path = record.path;
  assert(typeof path === "object" && path != null && !Array.isArray(path), `${call.method} input path must be object.`);
  return path as Record<string, unknown>;
}

function queryOf(call: Call): Record<string, unknown> {
  const input = call.input;
  assert(typeof input === "object" && input != null && !Array.isArray(input), `${call.method} input must be object.`);
  const record = input as Record<string, unknown>;
  const query = record.query;
  assert(typeof query === "object" && query != null && !Array.isArray(query), `${call.method} input query must be object.`);
  return query as Record<string, unknown>;
}

function firstTextPart(body: Record<string, unknown>): Record<string, unknown> {
  const parts = body.parts;
  assert(Array.isArray(parts), "promptAsync body must include parts array.");
  const first = parts[0];
  assert(typeof first === "object" && first != null && !Array.isArray(first), "first prompt part must be object.");
  return first as Record<string, unknown>;
}

const tests: TestCase[] = [
  {
    name: "capability is unavailable without session create and promptAsync APIs",
    run: async () => {
      const adapter = createOpenCodeWorkerSessionAdapter({ client: { session: {} }, parentSessionId: "parent-1" });
      const capability = await adapter.capability();
      assert(capability.available === false, "adapter must report unavailable capability when session APIs are missing.");
      assert(capability.reason?.includes("session.create") === true, `capability reason must mention missing create API, got ${capability.reason}.`);
    },
  },
  {
    name: "dispatch creates exactly one child session and prompts it asynchronously",
    run: async () => {
      const calls: Call[] = [];
      const client = {
        session: {
          create: async (input: unknown) => {
            calls.push({ method: "session.create", input });
            return { id: "session-worker-1" };
          },
          promptAsync: async (input: unknown) => {
            calls.push({ method: "session.promptAsync", input });
            return { ok: true };
          },
          messages: async () => [],
        },
      };
      const adapter = createOpenCodeWorkerSessionAdapter({ client, parentSessionId: "parent-1", directory: "D:/base", worktree: "D:/repo" });
      const capability = await adapter.capability();
      assert(capability.available === true, `adapter should be available, got ${JSON.stringify(capability)}.`);
      const result = await adapter.dispatch(dispatchInput({ agent: "build", model: "openai/gpt-5.5" }));

      assert(result.ok === true, `dispatch should succeed, got ${JSON.stringify(result)}.`);
      assert(result.ok && result.sessionId === "session-worker-1", "dispatch must return created child session id.");
      assert(calls.length === 2, `dispatch must make exactly two API calls, got ${calls.length}.`);
      assert(calls[0]?.method === "session.create", "first dispatch call must create the child session.");
      assert(calls[1]?.method === "session.promptAsync", "second dispatch call must prompt the child session.");

      const createBody = bodyOf(calls[0]!);
      assert(createBody.parentID === "parent-1", "child session create must include parentID.");
      assert(createBody.title === "[autopilot run-1 worker-1] task-a", "child session title must be deterministic.");
      assert(!("metadata" in createBody), "session.create body must not include unsupported metadata field.");
      assert(!("permission" in createBody), "session.create body must not include unsupported permission field.");
      assert(queryOf(calls[0]!).directory === "D:/repo", "session.create query must prefer worktree as the execution directory when available.");

      const promptBody = bodyOf(calls[1]!);
      assert(pathOf(calls[1]!).id === "session-worker-1", "promptAsync path must target the created session id.");
      assert(queryOf(calls[1]!).directory === "D:/repo", "promptAsync query must prefer worktree as the execution directory when available.");
      assert(promptBody.agent === "build", "promptAsync body must include agent when provided.");
      assert(JSON.stringify(promptBody.model) === JSON.stringify({ providerID: "openai", modelID: "gpt-5.5" }), `promptAsync model must use SDK provider/model shape, got ${JSON.stringify(promptBody.model)}.`);
      const textPart = firstTextPart(promptBody);
      assert(textPart.type === "text", "promptAsync prompt part must be text.");
      assert(textPart.text === "worker prompt for session-worker-1", "prompt must be generated after the session id is known.");
      assert(JSON.stringify(textPart.metadata).includes("autopilotRunId"), "text part metadata must include autopilot run evidence.");
    },
  },
  {
    name: "dispatch fails closed when capability is unavailable",
    run: async () => {
      const calls: Call[] = [];
      const adapter = createOpenCodeWorkerSessionAdapter({
        client: {
          session: {
            create: async (input: unknown) => {
              calls.push({ method: "session.create", input });
              return { id: "session-worker-1" };
            },
          },
        },
        parentSessionId: "parent-1",
      });
      const result = await adapter.dispatch(dispatchInput());
      assert(result.ok === false, "dispatch must fail when promptAsync is unavailable.");
      assert(result.ok === false && result.reason.includes("session.promptAsync"), `dispatch reason must name missing promptAsync API, got ${JSON.stringify(result)}.`);
      assert(calls.length === 0, "dispatch must not create a child session when capability is unavailable.");
    },
  },
  {
    name: "dispatch returns structured failure when session.create throws",
    run: async () => {
      const client = {
        session: {
          create: async () => {
            throw new Error("create boom");
          },
          promptAsync: async () => ({ ok: true }),
          messages: async () => [],
        },
      };
      const adapter = createOpenCodeWorkerSessionAdapter({ client, parentSessionId: "parent-1" });
      const result = await adapter.dispatch(dispatchInput());
      assert(result.ok === false, "dispatch must fail instead of throwing when session.create throws.");
      assert(result.ok === false && result.reason.includes("create boom"), `dispatch failure must include thrown create error, got ${JSON.stringify(result)}.`);
    },
  },
  {
    name: "dispatch returns structured failure when promptAsync throws after session creation",
    run: async () => {
      const client = {
        session: {
          create: async () => ({ id: "session-worker-1" }),
          promptAsync: async () => {
            throw new Error("prompt boom");
          },
          messages: async () => [],
        },
      };
      const adapter = createOpenCodeWorkerSessionAdapter({ client, parentSessionId: "parent-1" });
      const result = await adapter.dispatch(dispatchInput());
      assert(result.ok === false, "dispatch must fail instead of throwing when promptAsync throws.");
      assert(result.ok === false && result.reason.includes("prompt boom"), `dispatch failure must include thrown prompt error, got ${JSON.stringify(result)}.`);
    },
  },
  {
    name: "readFinalReport returns text from session messages",
    run: async () => {
      const calls: Call[] = [];
      const client = {
        session: {
          create: async () => ({ id: "unused" }),
          promptAsync: async () => ({ ok: true }),
          messages: async (input: unknown) => ({
            ...(calls.push({ method: "session.messages", input }) > 0 ? {} : {}),
            data: [
              { info: { role: "assistant" }, parts: [{ type: "text", text: "before" }] },
              { info: { role: "assistant" }, parts: [{ type: "text", text: "AUTOPILOT_WORKER_REPORT report-1 COMPLETE" }] },
            ],
          }),
        },
      };
      const adapter = createOpenCodeWorkerSessionAdapter({ client, parentSessionId: "parent-1", directory: "D:/repo" });
      const result = await adapter.readFinalReport({ sessionId: "session-worker-1", reportId: "report-1" });
      assert(result.ok === true, `readFinalReport should succeed, got ${JSON.stringify(result)}.`);
      assert(result.ok && result.text.includes("before"), "readFinalReport must include text parts.");
      assert(result.ok && result.text.includes("AUTOPILOT_WORKER_REPORT report-1 COMPLETE"), "readFinalReport must preserve complete report marker.");
      assert(pathOf(calls[0]!).id === "session-worker-1", "session.messages path must target the worker session id.");
      assert(queryOf(calls[0]!).directory === "D:/repo", "session.messages query must include directory when available.");
      assert(queryOf(calls[0]!).limit === 200, "session.messages query must request a bounded message window.");
    },
  },
  {
    name: "readFinalReport ignores user prompt marker and reports message read failures structurally",
    run: async () => {
      const promptText = "Worker instructions include AUTOPILOT_WORKER_REPORT report-1 COMPLETE as an output format example.";
      const client = {
        session: {
          create: async () => ({ id: "unused" }),
          promptAsync: async () => ({ ok: true }),
          messages: async () => ({
            data: [
              { info: { role: "user" }, parts: [{ type: "text", text: promptText }] },
              { info: { role: "assistant" }, parts: [{ type: "text", text: "AUTOPILOT_WORKER_REPORT report-1 COMPLETE\n{\"schemaVersion\":1}" }] },
            ],
          }),
        },
      };
      const adapter = createOpenCodeWorkerSessionAdapter({ client, parentSessionId: "parent-1" });
      const result = await adapter.readFinalReport({ sessionId: "session-worker-1", reportId: "report-1" });
      assert(result.ok === true, `readFinalReport should ignore user prompt marker, got ${JSON.stringify(result)}.`);
      assert(result.ok && !result.text.includes("output format example"), "readFinalReport must not include user prompt text in final report parsing input.");

      const throwingAdapter = createOpenCodeWorkerSessionAdapter({
        client: {
          session: {
            create: async () => ({ id: "unused" }),
            promptAsync: async () => ({ ok: true }),
            messages: async () => {
              throw new Error("messages boom");
            },
          },
        },
      });
      const thrown = await throwingAdapter.readFinalReport({ sessionId: "session-worker-1", reportId: "report-1" });
      assert(thrown.ok === false, "readFinalReport must return structured failure when session.messages throws.");
      assert(thrown.ok === false && thrown.reason.includes("messages boom"), `messages throw reason must be preserved, got ${JSON.stringify(thrown)}.`);
    },
  },
  {
    name: "readFinalReport rejects roleless prompt-shaped report markers",
    run: async () => {
      const promptLikeReport = "AUTOPILOT_WORKER_REPORT report-1 COMPLETE\n{\"schemaVersion\":1}";
      const adapter = createOpenCodeWorkerSessionAdapter({
        client: {
          session: {
            create: async () => ({ id: "unused" }),
            promptAsync: async () => ({ ok: true }),
            messages: async () => ({
              data: [
                { parts: [{ type: "text", text: promptLikeReport }] },
              ],
            }),
          },
        },
      });

      const result = await adapter.readFinalReport({ sessionId: "session-worker-1", reportId: "report-1" });

      assert(result.ok === false, `Roleless message text must fail closed instead of parsing as assistant report, got ${JSON.stringify(result)}.`);
      assert(result.ok === false && result.reason.includes("no readable text"), `Roleless rejection should report no readable assistant output, got ${JSON.stringify(result)}.`);
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} autopilot worker session adapter test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot worker session adapter tests=${tests.length}`);
