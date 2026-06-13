#!/usr/bin/env node
import {
  parseAutopilotWorkerReportEnvelope,
  type AutopilotWorkerReportParseResult,
} from "./autopilot-worker-report-parser.ts";
import type { AutopilotRunRecord } from "./autopilot-runtime-store.ts";

type TestCase = {
  name: string;
  run: () => void;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectedRun(overrides: Partial<AutopilotRunRecord> = {}): AutopilotRunRecord {
  return {
    runId: "run-1",
    status: "running",
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:01.000Z",
    taskId: "task-a",
    ledgerPath: "openspec/changes/change-a/automation/task.json",
    fromStatus: "Analyze",
    expectedToStatus: "Implementation",
    expectedReportId: "report-1",
    workerId: "worker-1",
    workerSessionId: "session-1",
    scope: { read: ["openspec/changes/change-a"], write: ["src"], forbidden: [".autopilot/**", "openspec/changes/*/automation/**"] },
    ...overrides,
  };
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    reportId: "report-1",
    runId: "run-1",
    workerId: "worker-1",
    sessionId: "session-1",
    taskId: "task-a",
    ledgerPath: "openspec/changes/change-a/automation/task.json",
    fromStatus: "Analyze",
    toStatus: "Implementation",
    changedFiles: ["src/example.ts"],
    validation: [{ command: "npm test", status: "passed" }],
    testDecision: "required",
    secretScan: { status: "passed" },
    evidence: { summary: "Implementation completed." },
    blockers: [],
    mr: { status: "none" },
    ...overrides,
  };
}

function reportText(payload: Record<string, unknown> = validPayload(), markerReportId = "report-1"): string {
  return [
    "Worker summary before the envelope.",
    `AUTOPILOT_WORKER_REPORT ${markerReportId} COMPLETE`,
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n");
}

function parse(text: string, run = expectedRun(), consumedReportIds: string[] = []): AutopilotWorkerReportParseResult {
  return parseAutopilotWorkerReportEnvelope({ text, run, consumedReportIds });
}

function assertRejected(result: AutopilotWorkerReportParseResult, reasonCode: string, message: string): void {
  assert(!result.ok, `${message}: expected rejection.`);
  assert(result.reasonCode === reasonCode, `${message}: expected ${reasonCode}, got ${result.ok ? "ok" : result.reasonCode}.`);
  assert(result.errors.length > 0, `${message}: rejection must include errors.`);
}

const tests: TestCase[] = [
  {
    name: "accepts one complete matching worker report envelope",
    run: () => {
      const result = parse(reportText());
      assert(result.ok, `Expected valid report, got ${result.ok ? "ok" : result.errors.join("; ")}.`);
      assert(result.report.reportId === "report-1", "Accepted report must keep report id.");
      assert(result.report.runId === "run-1" && result.report.workerId === "worker-1" && result.report.sessionId === "session-1", "Accepted report must keep runtime identity evidence.");
      assert(result.report.taskId === "task-a" && result.report.ledgerPath.endsWith("task.json"), "Accepted report must keep task evidence.");
      assert(result.report.fromStatus === "Analyze" && result.report.toStatus === "Implementation", "Accepted report must keep status transition evidence.");
      assert(result.report.changedFiles.join(",") === "src/example.ts", "Accepted report must keep changed files.");
      assert(result.report.validation[0]?.command === "npm test" && result.report.secretScan.status === "passed", "Accepted report must keep validation and secret-scan evidence.");
      assert(result.report.testDecision === "required" && result.report.evidence.summary === "Implementation completed.", "Accepted report must keep test decision and summary evidence.");
      assert(result.report.blockers.length === 0, "Accepted report must keep empty blockers array.");
      assert(result.report.mr.status === "none", "Accepted report must keep MR status.");
    },
  },
  {
    name: "accepts any valid target status when run has no expected target status",
    run: () => {
      const result = parse(reportText(validPayload({ toStatus: "Review" })), expectedRun({ expectedToStatus: undefined }));
      assert(result.ok, `Expected report without expected target status to parse, got ${result.ok ? "ok" : result.errors.join("; ")}.`);
      assert(result.report.toStatus === "Review", "Accepted report must keep proposed target status.");
    },
  },
  {
    name: "preserves non-empty blockers and nested evidence",
    run: () => {
      const result = parse(reportText(validPayload({
        evidence: { summary: "Blocked by reviewer.", nested: { retry: true } },
        blockers: [{ reason: "review failed", questionId: "q-1" }],
        toStatus: "Blocked",
      })), expectedRun({ expectedToStatus: "Blocked" }));
      assert(result.ok, `Expected blocker report to parse, got ${result.ok ? "ok" : result.errors.join("; ")}.`);
      assert(result.report.blockers.length === 1 && result.report.blockers[0]?.reason === "review failed" && result.report.blockers[0]?.questionId === "q-1", "Accepted report must preserve blocker evidence exactly.");
      const nested = result.report.evidence.nested as { retry?: boolean } | undefined;
      assert(nested?.retry === true, "Accepted report must preserve nested evidence.");
    },
  },
  {
    name: "rejects stored run missing required session evidence",
    run: () => assertRejected(parse(reportText(), expectedRun({ workerSessionId: undefined })), "mismatched_evidence", "missing stored session evidence"),
  },
  {
    name: "rejects missing worker report marker",
    run: () => assertRejected(parse(JSON.stringify(validPayload())), "missing_marker", "missing marker"),
  },
  {
    name: "rejects partial worker report marker",
    run: () => assertRejected(parse("AUTOPILOT_WORKER_REPORT report-1\n{}"), "partial_marker", "partial marker"),
  },
  {
    name: "rejects partial marker mixed with complete marker",
    run: () => assertRejected(parse(`AUTOPILOT_WORKER_REPORT report-1\n${reportText()}`), "partial_marker", "partial plus complete marker"),
  },
  {
    name: "rejects split-line or inline complete marker",
    run: () => {
      assertRejected(parse("AUTOPILOT_WORKER_REPORT report-1\nCOMPLETE\n{}"), "partial_marker", "split-line complete marker");
      assertRejected(parse(`prefix AUTOPILOT_WORKER_REPORT report-1 COMPLETE\n${JSON.stringify(validPayload())}`), "partial_marker", "inline complete marker");
    },
  },
  {
    name: "rejects duplicate complete worker report envelopes",
    run: () => assertRejected(parse(`${reportText()}\n${reportText()}`), "duplicate_report", "duplicate report"),
  },
  {
    name: "rejects invalid JSON payload",
    run: () => assertRejected(parse("AUTOPILOT_WORKER_REPORT report-1 COMPLETE\n{not json"), "invalid_json", "invalid JSON"),
  },
  {
    name: "rejects unknown report id before trusting payload",
    run: () => assertRejected(parse(reportText(validPayload({ reportId: "unknown-report" }), "unknown-report")), "unknown_report_id", "unknown report id"),
  },
  {
    name: "rejects duplicate consumed report id",
    run: () => assertRejected(parse(reportText(), expectedRun(), ["report-1"]), "duplicate_report_id", "duplicate consumed report"),
  },
  {
    name: "rejects mismatched run task session and status evidence",
    run: () => {
      const cases: Array<[string, Record<string, unknown>]> = [
        ["runId", { runId: "other-run" }],
        ["workerId", { workerId: "other-worker" }],
        ["sessionId", { sessionId: "other-session" }],
        ["taskId", { taskId: "other-task" }],
        ["ledgerPath", { ledgerPath: "openspec/changes/other/automation/task.json" }],
        ["fromStatus", { fromStatus: "Ready" }],
        ["toStatus", { toStatus: "Review" }],
      ];
      for (const [field, override] of cases) {
        const result = parse(reportText(validPayload(override)));
        assertRejected(result, "mismatched_evidence", `mismatched ${field}`);
        assert(!result.ok && result.errors.some((error) => error.includes(field)), `Mismatch for ${field} must name the field.`);
      }
      const payloadReportId = parse(reportText(validPayload({ reportId: "other-report" })));
      assertRejected(payloadReportId, "mismatched_evidence", "mismatched payload reportId");
      assert(!payloadReportId.ok && payloadReportId.errors.some((error) => error.includes("reportId")), "Payload report id mismatch must name reportId.");
    },
  },
  {
    name: "rejects invalid report payload shape",
    run: () => {
      const result = parse(reportText(validPayload({ changedFiles: [""], validation: [{ command: "", status: "unknown" }], mr: { status: "unknown" }, extra: "nope" })));
      assertRejected(result, "invalid_payload", "invalid payload shape");
      assert(!result.ok && result.errors.some((error) => error.includes("extra")), "Invalid payload must reject unknown fields.");
      assert(!result.ok && result.errors.some((error) => error.includes("changedFiles")), "Invalid payload must reject empty changed file entries.");
      assert(!result.ok && result.errors.some((error) => error.includes("validation")), "Invalid payload must reject invalid validation entries.");
      assert(!result.ok && result.errors.some((error) => error.includes("mr.status")), "Invalid payload must reject invalid MR status.");
    },
  },
];

let failed = 0;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${test.name}\n${message}`);
  }
}

if (failed > 0) {
  console.error(`${failed} autopilot worker report parser test(s) failed.`);
  process.exit(1);
}

console.log(`OK: autopilot worker report parser tests=${tests.length}`);
