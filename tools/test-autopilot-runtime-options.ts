#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listTaskLedgerFiles,
  readAutopilotQueueSummaries,
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

function writeLedger(repo: string, ledgerRoot: string, changeId: string, ledger: Record<string, unknown>): void {
  const filePath = path.join(repo, ledgerRoot, changeId, "automation", "task.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-autopilot-options-${name}-`));
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

try {
  withTempRepo("safe-roots", (repo) => {
    for (const ledgerRoot of ["../outside", "/tmp/outside", "C:/tmp/outside"]) {
      let threw = false;
      try {
        listTaskLedgerFiles(repo, { ledgerRoot });
      } catch (error) {
        threw = error instanceof Error && error.message.includes("safe relative repository path");
      }
      assert(threw, `Unsafe ledgerRoot ${ledgerRoot} must be rejected.`);
    }
    let prototypeThrew = false;
    try {
      listTaskLedgerFiles(repo, { prototypeLedgerRoot: "../prototype" });
    } catch (error) {
      prototypeThrew = error instanceof Error && error.message.includes("safe relative repository path");
    }
    assert(prototypeThrew, "Unsafe prototypeLedgerRoot must be rejected.");
  });
  console.log("PASS unsafe ledger roots are rejected");

  withTempRepo("custom-root-scope", (repo) => {
    const ledger = readFixture("valid-research.json");
    ledger.id = "task-custom";
    ledger.status = "Ready";
    ledger.history = [];
    writeLedger(repo, "custom/changes", "change-custom", ledger);
    const byChange = readAutopilotQueueSummaries(repo, { ledgerRoot: "custom/changes" }, { changeId: "change-custom" });
    assert(byChange.ledgers.length === 1 && byChange.ledgers[0]?.id === "task-custom", `Expected custom-root change scope to find task-custom, got ${JSON.stringify(byChange.ledgers.map((item) => item.id))}.`);
    const byTask = readAutopilotQueueSummaries(repo, { ledgerRoot: "custom/changes" }, { taskId: "task-custom" });
    assert(byTask.ledgers.length === 1 && byTask.ledgers[0]?.path.startsWith("custom/changes/change-custom/"), "Expected custom-root task scope to preserve custom ledger path.");
  });
  console.log("PASS custom ledger roots honor scoped filters");
} catch (error) {
  console.error("FAIL autopilot runtime options");
  console.error(error);
  process.exitCode = 1;
}
