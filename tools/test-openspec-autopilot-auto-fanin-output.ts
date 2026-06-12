#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCollectOutput,
  readLedgerSummaries,
} from "./openspec-autopilot-output.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8")) as Record<string, unknown>;
}

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-autopilot-${name}-`));
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function writeLedger(repo: string, changeId: string, ledger: Record<string, unknown>): void {
  const filePath = path.join(repo, "openspec", "changes", changeId, "automation", "task.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function acceptanceResearchLedger(id: string, writeScope: string[]): Record<string, unknown> {
  const ledger = readFixture("valid-research.json");
  ledger.id = id;
  ledger.scope = {
    read: ["docs/**", "openspec/**"],
    write: writeScope,
    forbidden: ["src/**", "openspec/changes/*/automation/**", ".autopilot/**"],
  };
  ledger.mr = {
    required: false,
    status: "not-required",
    noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR.",
  };
  return ledger;
}

try {
  withTempRepo("selection-auto-fan-in-terminal", (repo) => {
    writeLedger(repo, "change-a", acceptanceResearchLedger("task-a", ["openspec/changes/change-a/**"]));
    writeLedger(repo, "change-b", acceptanceResearchLedger("task-b", ["openspec/changes/change-b/**"]));
    const output = createCollectOutput(readLedgerSummaries(repo), {
      runtimeState: {
        activeRun: {
          runId: "claim-task-a-task-b",
          taskIds: ["task-a", "task-b"],
          fanInValidationRequired: true,
        },
        workerReports: [
          {
            reportId: "done-without-fan-in",
            taskId: "task-a",
            fromStatus: "Acceptance",
            toStatus: "Done",
            completedAt: "2026-06-10T00:04:00.000Z",
            evidence: { noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR." },
          },
        ],
      },
    });
    assert(output.outcome === "failed", `Expected missing fan-in collect to fail, got ${output.outcome}.`);
    assert(output.reasonCode === "runtime_evidence_conflict", `Expected runtime_evidence_conflict, got ${output.reasonCode}.`);
    assert(output.tasksAdvanced.length === 0, `Expected no terminal advancement without fan-in evidence, got ${output.tasksAdvanced.length}.`);
    assert(output.blockers.some((blocker) => blocker.reason.includes("fan-in integration validation")), "Missing fan-in collect must explain the integration validation requirement.");

    const passedOutput = createCollectOutput(readLedgerSummaries(repo), {
      runtimeState: {
        activeRun: {
          runId: "claim-task-a-task-b",
          taskIds: ["task-a", "task-b"],
          fanInValidationRequired: true,
        },
        workerReports: [
          {
            reportId: "done-with-fan-in",
            taskId: "task-a",
            fromStatus: "Acceptance",
            toStatus: "Done",
            completedAt: "2026-06-10T00:04:00.000Z",
            evidence: {
              noMrAcceptancePolicy: "Research-only artifact accepted without file-changing MR.",
              fanInValidation: {
                status: "passed",
                workerReportsCollected: true,
                protectedLedgerMutation: false,
              },
            },
          },
        ],
      },
    });
    assert(passedOutput.outcome === "advanced", `Expected passed fan-in collect to advance, got ${passedOutput.outcome}.`);
    assert(passedOutput.tasksAdvanced.length === 1, `Expected one terminal advancement with fan-in evidence, got ${passedOutput.tasksAdvanced.length}.`);
  });
  console.log("PASS auto parallel terminal collect requires fan-in validation evidence");
} catch (error) {
  console.error("FAIL auto parallel terminal collect requires fan-in validation evidence");
  console.error(error);
  process.exitCode = 1;
}
