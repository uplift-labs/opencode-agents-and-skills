#!/usr/bin/env node
import { strict as assert } from "node:assert";
import { emptyPromptsListResponse, promptGetResponse, routeClientLine, routeServerLine } from "./headroom-mcp-wrapper.ts";

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [
  {
    name: "prompts/list returns Headroom usage policy prompt",
    run: () => {
      const routed = routeClientLine(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "prompts/list", params: {} }));
      assert.equal(routed.kind, "reply");
      const parsed = JSON.parse(routed.line);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, 7);
      assert.equal(parsed.result.prompts.length, 1);
      assert.equal(parsed.result.prompts[0].name, "headroom_usage_policy");
    },
  },
  {
    name: "prompts/get returns usage policy text",
    run: () => {
      const routed = routeClientLine(JSON.stringify({ jsonrpc: "2.0", id: 8, method: "prompts/get", params: { name: "headroom_usage_policy" } }));
      assert.equal(routed.kind, "reply");
      const parsed = JSON.parse(routed.line);
      assert.equal(parsed.result.messages[0].role, "user");
      assert.match(parsed.result.messages[0].content.text, /Use Headroom MCP only/);
      assert.match(parsed.result.messages[0].content.text, /headroom_retrieve/);
    },
  },
  {
    name: "prompts/get rejects unknown prompts",
    run: () => {
      const parsed = JSON.parse(promptGetResponse(9, "unknown"));
      assert.equal(parsed.id, 9);
      assert.equal(parsed.error.code, -32602);
    },
  },
  {
    name: "notifications and normal requests forward unchanged",
    run: () => {
      const initialize = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
      const initialized = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
      assert.deepEqual(routeClientLine(initialize), { kind: "forward", line: initialize });
      assert.deepEqual(routeClientLine(initialized), { kind: "forward", line: initialized });
    },
  },
  {
    name: "invalid and non-object lines are safe pass-through or drop",
    run: () => {
      assert.deepEqual(routeClientLine("not-json"), { kind: "forward", line: "not-json" });
      assert.deepEqual(routeClientLine(""), { kind: "drop" });
      assert.deepEqual(routeClientLine("[]"), { kind: "forward", line: "[]" });
    },
  },
  {
    name: "prompts response preserves request id shapes",
    run: () => {
      assert.equal(JSON.parse(emptyPromptsListResponse("abc")).id, "abc");
      assert.equal(JSON.parse(emptyPromptsListResponse(null)).id, null);
    },
  },
  {
    name: "initialize response advertises prompts capability",
    run: () => {
      const line = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { experimental: {}, tools: { listChanged: false } },
          serverInfo: { name: "headroom", version: "1.27.2" },
        },
      });
      const parsed = JSON.parse(routeServerLine(line));
      assert.deepEqual(parsed.result.capabilities.prompts, { listChanged: false });
      assert.deepEqual(parsed.result.capabilities.tools, { listChanged: false });
    },
  },
];

let passed = 0;
for (const test of tests) {
  test.run();
  passed += 1;
  console.log(`PASS ${test.name}`);
}

console.log(`OK: headroom MCP wrapper tests=${passed}`);
