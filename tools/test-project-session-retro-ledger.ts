#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  createProjectSessionRetroProposals,
  initProjectSessionRetroLedger,
  refreshAnalysisProgress,
  validateProjectSessionRetroLedger,
} from "./opencode-project-session-retro-ledger.ts";
import type { ProjectSessionRetroLedger } from "./opencode-project-session-retro-ledger.ts";

type TestCase = {
  name: string;
  run: () => void;
};

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "opencode-project-session-retro-ledger.ts");

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `project-session-retro-ledger-${name}-`));
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(text: string, expected: string, message: string): void {
  assert(text.includes(expected), `${message}\nExpected: ${expected}\nActual:\n${text}`);
}

function invokeCli(args: string[], cwd: string): { exitCode: number; output: string; stderr: string; stdout: string } {
  const result = spawnSync("node", [cliPath, ...args], { cwd, encoding: "utf8", shell: false });
  if (result.error) {
    throw result.error;
  }
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { exitCode: result.status ?? 0, output: `${stdout}${stderr}`, stderr, stdout };
}

function createOpenCodeDbFixture(dbPath: string, projectRoot: string, otherRoot: string): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec([
      "create table project (id text primary key, worktree text, name text, time_created integer, time_updated integer);",
      "create table project_directory (project_id text not null, directory text not null, type text, strategy text, time_created integer);",
      "create table session (id text primary key, project_id text, parent_id text, directory text, path text, title text, time_created integer, time_updated integer, workspace_id text, agent text, model text, cost real, tokens_input integer, tokens_output integer, tokens_reasoning integer, tokens_cache_read integer, tokens_cache_write integer);",
      "create table message (id text primary key, session_id text not null, time_created integer, time_updated integer, data text);",
      "create table part (id text primary key, message_id text, session_id text not null, time_created integer, time_updated integer, data text);",
      "create table todo (session_id text not null, content text, status text, priority text, position integer, time_created integer, time_updated integer);",
    ].join("\n"));

    db.prepare("insert into project (id, worktree, name, time_created, time_updated) values (?, ?, ?, ?, ?)").run("project-current-secret", projectRoot, "Secret Current Project", 1700000000000, 1700000003000);
    db.prepare("insert into project (id, worktree, name, time_created, time_updated) values (?, ?, ?, ?, ?)").run("project-other-secret", otherRoot, "Secret Other Project", 1700000000000, 1700000003000);
    db.prepare("insert into project_directory (project_id, directory, type, strategy, time_created) values (?, ?, ?, ?, ?)").run("project-current-secret", projectRoot, "root", "git", 1700000000000);
    db.prepare("insert into project_directory (project_id, directory, type, strategy, time_created) values (?, ?, ?, ?, ?)").run("project-other-secret", otherRoot, "root", "git", 1700000000000);

    const insertSession = db.prepare("insert into session (id, project_id, parent_id, directory, path, title, time_created, time_updated, workspace_id, agent, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    insertSession.run("session-current-secret-1", "project-current-secret", null, projectRoot, path.join(projectRoot, "secret-file.txt"), "Secret Current Session One", 1700000001000, 1700000002000, "workspace-current-secret", "build", "model-a", 1.5, 10, 20, 3, 4, 5);
    insertSession.run("session-current-secret-2", "project-current-secret", "session-current-secret-1", path.join(projectRoot, "src"), path.join(projectRoot, "src", "secret-file.txt"), "Secret Current Session Two", 1700000003000, 1700000004000, "workspace-current-secret", "build", "model-a", 2.5, 11, 21, 4, 5, 6);
    insertSession.run("session-other-secret", "project-other-secret", null, otherRoot, path.join(otherRoot, "secret-file.txt"), "Secret Other Session", 1700000005000, 1700000006000, "workspace-other-secret", "build", "model-b", 3.5, 12, 22, 5, 6, 7);

    db.prepare("insert into message (id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?)").run("message-secret-1", "session-current-secret-1", 1700000001000, 1700000001000, JSON.stringify({ role: "user", content: "raw secret prompt" }));
    db.prepare("insert into message (id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?)").run("message-secret-2", "session-current-secret-2", 1700000003000, 1700000003000, JSON.stringify({ role: "assistant", content: "raw secret answer" }));
    db.prepare("insert into message (id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?)").run("message-other-secret", "session-other-secret", 1700000005000, 1700000005000, JSON.stringify({ role: "user", content: "raw other prompt" }));

    db.prepare("insert into part (id, message_id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?, ?)").run("part-secret-1", "message-secret-1", "session-current-secret-1", 1700000001000, 1700000001000, JSON.stringify({ type: "tool", tool: "bash", state: { status: "completed", input: { command: "npm test" } } }));
    db.prepare("insert into part (id, message_id, session_id, time_created, time_updated, data) values (?, ?, ?, ?, ?, ?)").run("part-secret-2", "message-secret-2", "session-current-secret-2", 1700000003000, 1700000003000, JSON.stringify({ type: "tool", tool: "apply_patch", state: { status: "completed" } }));
    db.prepare("insert into todo (session_id, content, status, priority, position, time_created, time_updated) values (?, ?, ?, ?, ?, ?, ?)").run("session-current-secret-2", "secret todo", "pending", "high", 1, 1700000003000, 1700000003000);
  } finally {
    db.close();
  }
}

function baseAnalyzedLedger(): ProjectSessionRetroLedger {
  return {
    schemaVersion: 1,
    tool: "opencode-project-session-retro-ledger",
    generatedAt: "2026-06-14T00:00:00.000Z",
    scope: {
      mode: "current-project",
      projectRootRef: "projectRoot_fixture",
      dateRange: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-02T00:00:00.000Z" },
      sessionCount: 2,
      source: "opencode-db",
    },
    sources: [],
    analysisProgress: {
      sessionOrder: ["session_a", "session_b"],
      completedSessionCount: 2,
      remainingSessionCount: 0,
      lastAnalyzedSessionRef: "session_b",
      nextSessionRef: null,
    },
    sessions: {
      session_a: {
        metadata: {
          dateRange: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
          messageRows: 1,
          partRows: 1,
          todoRows: 0,
          sourceRef: "source_fixture",
          projectRef: "project_fixture",
          parentRef: null,
          workspaceRef: null,
          child: false,
          agent: "agent_fixture",
          model: "model_fixture",
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
          mechanicalSignals: [],
          toolNames: [],
        },
        coverage: { status: "complete", limits: [] },
        observations: [
          {
            id: "obs-001",
            polarity: "negative",
            summary: "User caught reviewer gap",
            evidenceRefs: ["session_a#message-001"],
            impact: "high",
            confidence: "high",
            reviewerLearning: {
              reportedByUser: true,
              caughtByReviewer: false,
              reviewerShouldHaveCaught: true,
              reviewerAgent: "test-coverage-reviewer",
            },
          },
        ],
      },
      session_b: {
        metadata: {
          dateRange: { from: "2026-06-02T00:00:00.000Z", to: "2026-06-02T01:00:00.000Z" },
          messageRows: 1,
          partRows: 1,
          todoRows: 0,
          sourceRef: "source_fixture",
          projectRef: "project_fixture",
          parentRef: null,
          workspaceRef: null,
          child: false,
          agent: "agent_fixture",
          model: "model_fixture",
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
          mechanicalSignals: [],
          toolNames: [],
        },
        coverage: { status: "complete", limits: [] },
        observations: [
          {
            id: "obs-001",
            polarity: "negative",
            summary: "User caught reviewer gap again",
            evidenceRefs: ["session_b#message-001"],
            impact: "high",
            confidence: "high",
            reviewerLearning: {
              reportedByUser: true,
              caughtByReviewer: false,
              reviewerShouldHaveCaught: true,
              reviewerAgent: "test-coverage-reviewer",
            },
          },
        ],
      },
    },
    trends: {
      "trend-001": {
        polarity: "negative",
        summary: "Reviewer gaps reached the user repeatedly",
        observationRefs: ["session_a#obs-001", "session_b#obs-001"],
        sessionRefs: ["session_a", "session_b"],
        repeatability: { sessionCount: 2, thresholdMet: true, classification: "popular" },
        rootCauseIds: ["cause-001"],
      },
    },
    rootCauses: {
      "cause-001": {
        trendId: "trend-001",
        summary: "Reviewer contracts lack explicit user-correction feedback loops",
        status: "likely",
        recurrencePath: "User correction happens after reviewer gate because reviewer prompt does not require this check.",
        contributingFactors: ["Reviewer prompt omits user-correction mining"],
        evidenceRefs: ["session_a#obs-001", "session_b#obs-001"],
        planId: "plan-001",
      },
    },
    plans: {
      "plan-001": {
        causeId: "cause-001",
        kind: "remediation",
        goal: "Strengthen reviewer contracts for user-reported gaps",
        approach: "Update reviewer prompts and fixtures so user corrections become explicit review checks.",
        implementationSlices: ["Add fixture proving user corrections are routed into reviewer expectations."],
        acceptanceCriteria: ["Reviewer guidance requires checking user-correction patterns."],
        validation: ["npm test"],
        risks: ["Reviewer over-triggering"],
        openspecChangeId: null,
      },
    },
    openspecProposals: {},
    validation: { errors: [], warnings: [] },
  };
}

const tests: TestCase[] = [
  {
    name: "init creates redacted current-project session skeleton",
    run: () => withTempRepo("init", (repo) => {
      const projectRoot = path.join(repo, "project");
      const otherRoot = path.join(repo, "other");
      fs.mkdirSync(projectRoot, { recursive: true });
      fs.mkdirSync(otherRoot, { recursive: true });
      const dbPath = path.join(repo, "opencode.db");
      createOpenCodeDbFixture(dbPath, projectRoot, otherRoot);

      const ledger = initProjectSessionRetroLedger({
        dbPaths: [dbPath],
        generatedAt: "2026-06-14T00:00:00.000Z",
        projectRoot,
        showPaths: false,
        useDefaultPaths: false,
      });

      assert(ledger.scope.sessionCount === 2, `Expected two current-project sessions, got ${ledger.scope.sessionCount}.`);
      assert(Object.keys(ledger.sessions).length === 2, `Expected two session cards, got ${JSON.stringify(ledger.sessions, null, 2)}.`);
      assert(Object.values(ledger.sessions).every((session) => session.coverage.status === "partial"), "Init skeleton should mark per-session human analysis as partial.");
      assert(Object.values(ledger.sessions).some((session) => session.metadata.mechanicalSignals.includes("has_validation_proxy")), "Init should preserve redacted validation proxy signal.");
      assert(Object.values(ledger.sessions).some((session) => session.metadata.mechanicalSignals.includes("has_open_todo")), "Init should preserve redacted open TODO signal.");
      const serialized = JSON.stringify(ledger);
      for (const secret of [projectRoot, otherRoot, dbPath, "session-current-secret-1", "Secret Current Session", "raw secret prompt", "project-current-secret"]) {
        assert(!serialized.includes(secret), `Ledger must not expose raw secret by default: ${secret}`);
      }
      const validation = validateProjectSessionRetroLedger(ledger, { root: repo });
      assert(validation.valid, `Fresh skeleton should validate, got ${JSON.stringify(validation.errors, null, 2)}.`);
    }),
  },
  {
    name: "validator rejects invalid trend and unknown-cause fix plan",
    run: () => {
      const ledger = baseAnalyzedLedger();
      ledger.trends["trend-001"].sessionRefs = ["session_a"];
      ledger.trends["trend-001"].repeatability = { sessionCount: 1, thresholdMet: true, classification: "popular" };
      ledger.rootCauses["cause-001"].status = "unknown";
      ledger.plans["plan-001"].goal = "Apply guessed reviewer prompt fix";
      ledger.plans["plan-001"].approach = "Patch the prompt immediately without investigation.";
      ledger.plans["plan-001"].openspecChangeId = "retro-plan-001";
      ledger.openspecProposals["retro-plan-001"] = { planId: "plan-001", path: "openspec/changes/retro-plan-001", status: "blocked" };

      const result = validateProjectSessionRetroLedger(ledger, { root: process.cwd() });
      assert(!result.valid, "Invalid ledger should fail validation.");
      assert(result.errors.some((error) => error.includes("popular") && error.includes("at least 2")), `Expected popular threshold error, got ${JSON.stringify(result.errors)}.`);
      assert(result.errors.some((error) => error.includes("unknown root cause") && error.includes("investigation")), `Expected unknown root-cause investigation error, got ${JSON.stringify(result.errors)}.`);
    },
  },
  {
    name: "validator requires explicit learning route for negative observations",
    run: () => {
      const ledger = baseAnalyzedLedger();
      delete ledger.sessions.session_a.observations[0].reviewerLearning;
      const missingRoute = validateProjectSessionRetroLedger(ledger, { root: process.cwd() });
      assert(!missingRoute.valid, "Negative observation without learning route should fail validation.");
      assert(missingRoute.errors.some((error) => error.includes("negative observations must include mainAgentLearning or reviewerLearning")), `Expected missing learning route error, got ${JSON.stringify(missingRoute.errors)}.`);

      const reviewerFinding = baseAnalyzedLedger();
      reviewerFinding.sessions.session_a.observations[0].reviewerLearning = {
        caughtByReviewer: true,
        reportedByUser: false,
        reviewerAgent: "code-quality-reviewer",
        reviewerShouldHaveCaught: true,
      };
      const missingMainLearning = validateProjectSessionRetroLedger(reviewerFinding, { root: process.cwd() });
      assert(!missingMainLearning.valid, "Reviewer finding without main-agent learning should fail validation.");
      assert(missingMainLearning.errors.some((error) => error.includes("reviewer findings must include mainAgentLearning")), `Expected reviewer-to-main learning error, got ${JSON.stringify(missingMainLearning.errors)}.`);

      reviewerFinding.sessions.session_a.observations[0].mainAgentLearning = {
        improvementTarget: "Run the reviewer check earlier before handoff.",
        reviewerFinding: true,
        shouldHavePrevented: true,
      };
      const validRoute = validateProjectSessionRetroLedger(reviewerFinding, { root: process.cwd() });
      assert(validRoute.valid, `Reviewer finding with main-agent learning should validate, got ${JSON.stringify(validRoute.errors)}.`);
    },
  },
  {
    name: "validator separates intermediate and final proposal gates",
    run: () => {
      const ledger = baseAnalyzedLedger();
      const intermediate = validateProjectSessionRetroLedger(ledger, { root: process.cwd() });
      assert(intermediate.valid, `Intermediate plan ledger should validate before proposal generation, got ${JSON.stringify(intermediate.errors)}.`);
      assert(intermediate.warnings.some((warning) => warning.includes("openspecChangeId")), `Intermediate validation should warn about missing proposals, got ${JSON.stringify(intermediate.warnings)}.`);

      const finalGate = validateProjectSessionRetroLedger(ledger, { requireProposals: true, root: process.cwd() });
      assert(!finalGate.valid, "Final gate should require generated proposal refs and files.");
      assert(finalGate.errors.some((error) => error.includes("openspecChangeId")), `Expected final proposal error, got ${JSON.stringify(finalGate.errors)}.`);

      const blocked = baseAnalyzedLedger();
      blocked.plans["plan-001"].openspecChangeId = "blocked-change";
      blocked.openspecProposals["blocked-change"] = { planId: "plan-001", path: "openspec/changes/blocked-change", status: "blocked" };
      const blockedResult = validateProjectSessionRetroLedger(blocked, { requireProposals: true, root: process.cwd() });
      assert(!blockedResult.valid && blockedResult.errors.some((error) => error.includes("status must be created or existing")), `Expected blocked proposal status error, got ${JSON.stringify(blockedResult.errors)}.`);
    },
  },
  {
    name: "require-complete rejects unfinished retro stages",
    run: () => {
      const ledger = refreshAnalysisProgress(baseAnalyzedLedger());
      ledger.sessions.session_b.coverage.status = "partial";
      ledger.trends["trend-001"].repeatability.classification = "candidate";
      ledger.trends["trend-001"].rootCauseIds = [];
      ledger.rootCauses["cause-001"].planId = null;
      ledger.plans = {};
      const refreshed = refreshAnalysisProgress(ledger);
      const result = validateProjectSessionRetroLedger(refreshed, { requireComplete: true, root: process.cwd() });
      assert(!result.valid, "Incomplete retro should fail the complete gate.");
      assert(result.errors.some((error) => error.includes("every session must have coverage.status complete")), `Expected incomplete session error, got ${JSON.stringify(result.errors)}.`);
      assert(result.errors.some((error) => error.includes("remains candidate")), `Expected candidate trend error, got ${JSON.stringify(result.errors)}.`);
      assert(result.errors.some((error) => error.includes("needs a detailed plan")), `Expected missing plan error, got ${JSON.stringify(result.errors)}.`);

      const unlinked = refreshAnalysisProgress(baseAnalyzedLedger());
      unlinked.trends["trend-001"].observationRefs = ["session_a#obs-001"];
      const unlinkedResult = validateProjectSessionRetroLedger(unlinked, { requireComplete: true, root: process.cwd() });
      assert(unlinkedResult.errors.some((error) => error.includes("session_b#obs-001") && error.includes("not linked to any trend")), `Expected unlinked observation error, got ${JSON.stringify(unlinkedResult.errors)}.`);

      const noObservation = refreshAnalysisProgress(baseAnalyzedLedger());
      noObservation.sessions.session_a.observations = [];
      const noObservationResult = validateProjectSessionRetroLedger(noObservation, { requireComplete: true, root: process.cwd() });
      assert(noObservationResult.errors.some((error) => error.includes("complete but has no observations")), `Expected complete session without observations error, got ${JSON.stringify(noObservationResult.errors)}.`);

      const noRootCause = refreshAnalysisProgress(baseAnalyzedLedger());
      noRootCause.trends["trend-001"].rootCauseIds = [];
      const noRootCauseResult = validateProjectSessionRetroLedger(noRootCause, { requireComplete: true, root: process.cwd() });
      assert(noRootCauseResult.errors.some((error) => error.includes("needs root cause analysis")), `Expected missing root cause analysis error, got ${JSON.stringify(noRootCauseResult.errors)}.`);

      const severeNoRootCause = refreshAnalysisProgress(baseAnalyzedLedger());
      severeNoRootCause.trends["trend-001"].repeatability.classification = "severe-singleton";
      severeNoRootCause.trends["trend-001"].rootCauseIds = [];
      const severeNoRootCauseResult = validateProjectSessionRetroLedger(severeNoRootCause, { requireComplete: true, root: process.cwd() });
      assert(severeNoRootCauseResult.errors.some((error) => error.includes("needs root cause analysis")), `Expected severe-singleton root cause error, got ${JSON.stringify(severeNoRootCauseResult.errors)}.`);
    },
  },
  {
    name: "analysis progress refresh records resume checkpoint and stale state fails",
    run: () => {
      const ledger = baseAnalyzedLedger();
      ledger.sessions.session_b.coverage.status = "partial";
      const refreshed = refreshAnalysisProgress(ledger);
      assert(refreshed.analysisProgress.sessionOrder.join(",") === "session_a,session_b", `Unexpected session order: ${JSON.stringify(refreshed.analysisProgress)}.`);
      assert(refreshed.analysisProgress.completedSessionCount === 1, `Unexpected completed count: ${JSON.stringify(refreshed.analysisProgress)}.`);
      assert(refreshed.analysisProgress.remainingSessionCount === 1, `Unexpected remaining count: ${JSON.stringify(refreshed.analysisProgress)}.`);
      assert(refreshed.analysisProgress.lastAnalyzedSessionRef === "session_a", `Unexpected last analyzed: ${JSON.stringify(refreshed.analysisProgress)}.`);
      assert(refreshed.analysisProgress.nextSessionRef === "session_b", `Unexpected next session: ${JSON.stringify(refreshed.analysisProgress)}.`);

      const stale = baseAnalyzedLedger();
      stale.sessions.session_b.coverage.status = "partial";
      const result = validateProjectSessionRetroLedger(stale, { root: process.cwd() });
      assert(!result.valid && result.errors.some((error) => error.includes("analysisProgress must match")), `Expected stale progress error, got ${JSON.stringify(result.errors)}.`);
    },
  },
  {
    name: "CLI refresh updates stale analysis progress",
    run: () => withTempRepo("cli-refresh", (repo) => {
      const ledger = baseAnalyzedLedger();
      ledger.sessions.session_b.coverage.status = "partial";
      const ledgerPath = path.join(repo, "retro.json");
      fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
      const stale = invokeCli(["validate", "--input", ledgerPath, "--format", "json"], repo);
      assert(stale.exitCode !== 0 && JSON.parse(stale.stdout).errors.some((error: string) => error.includes("analysisProgress must match")), `Expected stale progress validation failure, got ${stale.output}`);

      const refreshed = invokeCli(["refresh", "--input", ledgerPath, "--format", "json"], repo);
      assert(refreshed.exitCode === 0, `CLI refresh should pass, got ${refreshed.exitCode}: ${refreshed.output}`);
      const progress = JSON.parse(refreshed.stdout) as { completedSessionCount?: number; lastAnalyzedSessionRef?: string; nextSessionRef?: string; remainingSessionCount?: number };
      assert(progress.completedSessionCount === 1 && progress.remainingSessionCount === 1, `Unexpected refreshed progress: ${refreshed.stdout}`);
      assert(progress.lastAnalyzedSessionRef === "session_a" && progress.nextSessionRef === "session_b", `Unexpected refreshed checkpoint: ${refreshed.stdout}`);
      const valid = invokeCli(["validate", "--input", ledgerPath, "--format", "json"], repo);
      assert(valid.exitCode === 0, `Refreshed ledger should validate without stale progress error, got ${valid.output}`);
    }),
  },
  {
    name: "validator rejects broken entity links and final missing files",
    run: () => {
      const ledger = baseAnalyzedLedger();
      ledger.sources = null as never;
      ledger.sessions.session_a.metadata.messageRows = -1;
      ledger.trends["trend-001"].rootCauseIds = ["missing-cause"];
      ledger.plans["plan-001"].openspecChangeId = "missing-files";
      ledger.openspecProposals["missing-files"] = { planId: "plan-001", path: "openspec/changes/missing-files", status: "created" };
      const result = validateProjectSessionRetroLedger(ledger, { requireProposals: true, root: process.cwd() });
      assert(!result.valid, "Broken ledger should fail validation.");
      assert(result.errors.some((error) => error.includes("sources must be an array")), `Expected sources schema error, got ${JSON.stringify(result.errors)}.`);
      assert(result.errors.some((error) => error.includes("metadata.messageRows")), `Expected metadata schema error, got ${JSON.stringify(result.errors)}.`);
      assert(result.errors.some((error) => error.includes("missing root cause")), `Expected missing root cause link error, got ${JSON.stringify(result.errors)}.`);
      assert(result.errors.some((error) => error.includes("must exist with proposal.md")), `Expected missing proposal files error, got ${JSON.stringify(result.errors)}.`);
    },
  },
  {
    name: "validator reports malformed complete ledger without throwing",
    run: () => {
      const malformed = {
        schemaVersion: 1,
        tool: "opencode-project-session-retro-ledger",
        generatedAt: "2026-06-14T00:00:00.000Z",
        scope: { mode: "current-project", projectRootRef: "project", dateRange: {}, sessionCount: 1, source: "opencode-db" },
        sources: [],
        analysisProgress: { sessionOrder: ["session_a"], completedSessionCount: 1, remainingSessionCount: 0, lastAnalyzedSessionRef: "session_a", nextSessionRef: null },
        sessions: { session_a: "malformed" },
        trends: { "trend-001": { repeatability: null, observationRefs: [], sessionRefs: [] } },
        rootCauses: {
          "cause-001": {
            trendId: "trend-001",
            summary: "Malformed backlink trend",
            status: "likely",
            recurrencePath: "malformed",
            contributingFactors: [],
            evidenceRefs: [],
            planId: null,
          },
        },
        plans: {},
        openspecProposals: {},
        validation: { errors: [], warnings: [] },
      };
      const result = validateProjectSessionRetroLedger(malformed, { requireComplete: true, requireProposals: true, root: process.cwd() });
      assert(!result.valid, "Malformed complete ledger should fail validation.");
      assert(result.errors.some((error) => error.includes("sessions.session_a must be an object")), `Expected malformed session error, got ${JSON.stringify(result.errors)}.`);
      assert(result.errors.some((error) => error.includes("repeatability")), `Expected malformed trend error, got ${JSON.stringify(result.errors)}.`);
      assert(result.errors.some((error) => error.includes("rootCauseIds must be an array")), `Expected malformed rootCauseIds backlink error, got ${JSON.stringify(result.errors)}.`);
    },
  },
  {
    name: "proposal dry-run previews without writes",
    run: () => withTempRepo("dry-run", (repo) => {
      const ledger = baseAnalyzedLedger();
      const before = JSON.stringify(ledger);
      const preview = createProjectSessionRetroProposals(repo, ledger, { dryRun: true });
      assert(JSON.stringify(ledger) === before, "Dry-run must not mutate input ledger.");
      assert(preview.changes.length === 1, `Expected one preview change, got ${JSON.stringify(preview.changes)}.`);
      assert(preview.changes[0].status === "draft", `Dry-run should report draft status, got ${JSON.stringify(preview.changes[0])}.`);
      assert(preview.ledger.validation.errors.length === 0, `Dry-run preview should not require files, got ${JSON.stringify(preview.ledger.validation.errors)}.`);
      const changeRoot = path.join(repo, preview.changes[0].path);
      assert(!fs.existsSync(changeRoot), "Dry-run must not create proposal files.");
      const strict = validateProjectSessionRetroLedger(preview.ledger, { requireProposals: true, root: repo });
      assert(!strict.valid && strict.errors.some((error) => error.includes("status must be created or existing")), `Strict validation should reject draft proposal, got ${JSON.stringify(strict.errors)}.`);
    }),
  },
  {
    name: "proposal generator blocks unsafe change ids before writes",
    run: () => withTempRepo("unsafe-change-id", (repo) => {
      const ledger = baseAnalyzedLedger();
      ledger.plans["plan-001"].openspecChangeId = "../outside";
      const result = createProjectSessionRetroProposals(repo, ledger);
      assert(result.changes[0].status === "blocked", `Unsafe change id should be blocked, got ${JSON.stringify(result.changes[0])}.`);
      assert(!fs.existsSync(path.join(repo, "outside")), "Unsafe change id must not write outside openspec/changes.");
      assert(!fs.existsSync(path.join(repo, "openspec")), "Unsafe change id must not create openspec directory before validation.");
      assert(result.ledger.validation.errors.some((error) => error.includes("safe change id")), `Blocked unsafe id should be recorded in validation errors, got ${JSON.stringify(result.ledger.validation.errors)}.`);
    }),
  },
  {
    name: "proposal generator preflights all plans before writing files",
    run: () => withTempRepo("multi-plan-preflight", (repo) => {
      const ledger = baseAnalyzedLedger();
      ledger.trends["trend-002"] = {
        polarity: "negative",
        summary: "Second trend exposes unsafe proposal id",
        observationRefs: ["session_a#obs-001"],
        sessionRefs: ["session_a"],
        repeatability: { sessionCount: 1, thresholdMet: true, classification: "severe-singleton" },
        rootCauseIds: ["cause-002"],
      };
      ledger.rootCauses["cause-002"] = {
        trendId: "trend-002",
        summary: "Unsafe proposal ids must block the whole write batch",
        status: "likely",
        recurrencePath: "A later invalid plan can fail after earlier plans wrote files.",
        contributingFactors: ["Proposal generation lacked whole-batch preflight"],
        evidenceRefs: ["session_a#obs-001"],
        planId: "plan-002",
      };
      ledger.plans["plan-002"] = {
        causeId: "cause-002",
        kind: "remediation",
        goal: "Block unsafe proposal ids before writes",
        approach: "Validate every planned proposal before creating any files.",
        implementationSlices: ["Preflight generated change ids before file writes."],
        acceptanceCriteria: ["Invalid later plans leave no generated proposal files."],
        validation: ["npm test"],
        risks: ["False blocks for valid generated ids"],
        openspecChangeId: "../outside",
      };

      const result = createProjectSessionRetroProposals(repo, ledger);
      assert(result.changes.some((change) => change.status === "blocked"), `Expected blocked unsafe plan, got ${JSON.stringify(result.changes)}.`);
      assert(!fs.existsSync(path.join(repo, "openspec")), "Any unsafe plan must block the whole batch before OpenSpec files are written.");
      assert(result.ledger.validation.errors.some((error) => error.includes("safe change id")), `Blocked unsafe id should be recorded in validation errors, got ${JSON.stringify(result.ledger.validation.errors)}.`);
    }),
  },
  {
    name: "proposal generator preflights safe invalid plans before writing files",
    run: () => withTempRepo("multi-plan-invalid-preflight", (repo) => {
      const ledger = baseAnalyzedLedger();
      ledger.trends["trend-002"] = {
        polarity: "negative",
        summary: "Second trend exposes invalid safe proposal plan",
        observationRefs: ["session_a#obs-001"],
        sessionRefs: ["session_a"],
        repeatability: { sessionCount: 1, thresholdMet: true, classification: "severe-singleton" },
        rootCauseIds: ["cause-002"],
      };
      ledger.rootCauses["cause-002"] = {
        trendId: "trend-002",
        summary: "Invalid safe plans must block the whole write batch",
        status: "likely",
        recurrencePath: "A later plan can fail validation after earlier plans wrote files.",
        contributingFactors: ["Proposal generation lacked full ledger preflight"],
        evidenceRefs: ["session_a#obs-001"],
        planId: "plan-002",
      };
      ledger.plans["plan-002"] = {
        causeId: "cause-002",
        kind: "invalid" as never,
        goal: "Block invalid safe plans before writes",
        approach: "Validate every planned proposal before creating any files.",
        implementationSlices: ["Preflight full ledger validity before file writes."],
        acceptanceCriteria: ["Invalid later plans leave no generated proposal files."],
        validation: ["npm test"],
        risks: ["False blocks for valid plans"],
        openspecChangeId: "invalid-safe-change",
      };

      const result = createProjectSessionRetroProposals(repo, ledger);
      assert(!fs.existsSync(path.join(repo, "openspec")), "Any invalid safe plan must block the whole batch before OpenSpec files are written.");
      assert(result.ledger.validation.errors.some((error) => error.includes("kind must be investigation, remediation, or preservation")), `Invalid plan kind should be recorded in validation errors, got ${JSON.stringify(result.ledger.validation.errors)}.`);
    }),
  },
  {
    name: "CLI proposals blocks unsafe change ids without mutating input",
    run: () => withTempRepo("cli-unsafe-change-id", (repo) => {
      const ledger = baseAnalyzedLedger();
      ledger.plans["plan-001"].openspecChangeId = "../outside";
      const ledgerPath = path.join(repo, "retro.json");
      fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
      const before = fs.readFileSync(ledgerPath, "utf8");
      const result = invokeCli(["proposals", "--input", ledgerPath, "--root", repo, "--format", "json"], repo);
      assert(result.exitCode !== 0, "CLI proposals should fail for unsafe change id.");
      const parsed = JSON.parse(result.stdout) as { changes?: Array<{ status?: unknown }> };
      assert(parsed.changes?.[0]?.status === "blocked", `Unsafe CLI proposal should report blocked, got ${result.stdout}`);
      assert(fs.readFileSync(ledgerPath, "utf8") === before, "Unsafe CLI proposal must not mutate input ledger.");
      assert(!fs.existsSync(path.join(repo, "outside")), "Unsafe CLI proposal must not write outside repository.");
      assert(!fs.existsSync(path.join(repo, "openspec")), "Unsafe CLI proposal must not create openspec directory.");
    }),
  },
  {
    name: "proposal generator creates idempotent OpenSpec follow-ups",
    run: () => withTempRepo("proposals", (repo) => {
      const ledger = baseAnalyzedLedger();
      const first = createProjectSessionRetroProposals(repo, ledger);
      assert(first.changes.length === 1, `Expected one generated proposal, got ${JSON.stringify(first.changes, null, 2)}.`);
      assert(first.changes[0].status === "created", `Expected created status, got ${JSON.stringify(first.changes[0])}.`);
      const changeId = first.changes[0].id;
      const proposalPath = path.join(repo, "openspec", "changes", changeId, "proposal.md");
      const tasksPath = path.join(repo, "openspec", "changes", changeId, "tasks.md");
      const specPath = path.join(repo, "openspec", "changes", changeId, "specs", changeId, "spec.md");
      assert(fs.existsSync(proposalPath), "Proposal file should be created.");
      assert(fs.existsSync(tasksPath), "Tasks file should be created.");
      assert(fs.existsSync(specPath), "Spec file should be created.");
      assertIncludes(fs.readFileSync(proposalPath, "utf8"), "Reviewer contracts lack explicit user-correction feedback loops", "Proposal should preserve root cause.");
      assertIncludes(fs.readFileSync(tasksPath, "utf8"), "Add or update the focused test, fixture, validator, or review evidence", "Tasks should preserve test-first gate.");

      const enrichedProposal = `${fs.readFileSync(proposalPath, "utf8")}\nHuman-added context must remain.\n`;
      fs.writeFileSync(proposalPath, enrichedProposal, "utf8");
      const second = createProjectSessionRetroProposals(repo, first.ledger);
      assert(second.changes[0].status === "existing", `Second run should reuse existing proposal, got ${JSON.stringify(second.changes[0])}.`);
      assert(fs.readFileSync(proposalPath, "utf8") === enrichedProposal, "Second run must preserve enriched existing proposal.");
      const validation = validateProjectSessionRetroLedger(second.ledger, { requireProposals: true, root: repo });
      assert(validation.valid, `Generated proposal ledger should validate, got ${JSON.stringify(validation.errors, null, 2)}.`);
    }),
  },
  {
    name: "validator rejects wrong proposal path and stale proposal files",
    run: () => withTempRepo("bad-proposal-files", (repo) => {
      const wrongPathLedger = baseAnalyzedLedger();
      wrongPathLedger.plans["plan-001"].openspecChangeId = "wrong-path";
      wrongPathLedger.openspecProposals["wrong-path"] = { planId: "plan-001", path: "openspec/changes/not-wrong-path", status: "created" };
      const wrongPath = validateProjectSessionRetroLedger(wrongPathLedger, { requireProposals: true, root: repo });
      assert(!wrongPath.valid && wrongPath.errors.some((error) => error.includes("path must be openspec/changes/wrong-path")), `Expected wrong path error, got ${JSON.stringify(wrongPath.errors)}.`);

      const staleLedger = baseAnalyzedLedger();
      const changeId = "stale-files";
      staleLedger.plans["plan-001"].openspecChangeId = changeId;
      staleLedger.openspecProposals[changeId] = { planId: "plan-001", path: `openspec/changes/${changeId}`, status: "created" };
      const root = path.join(repo, "openspec", "changes", changeId);
      fs.mkdirSync(path.join(root, "specs", changeId), { recursive: true });
      fs.writeFileSync(path.join(root, "proposal.md"), "# Stale proposal\n", "utf8");
      fs.writeFileSync(path.join(root, "tasks.md"), "# Stale tasks\n", "utf8");
      fs.writeFileSync(path.join(root, "specs", changeId, "spec.md"), "# Stale spec\n", "utf8");
      const stale = validateProjectSessionRetroLedger(staleLedger, { requireProposals: true, root: repo });
      assert(!stale.valid, "Stale proposal files should fail final validation.");
      assert(stale.errors.some((error) => error.includes("proposal.md must preserve")), `Expected stale proposal error, got ${JSON.stringify(stale.errors)}.`);
      assert(stale.errors.some((error) => error.includes("test-first validation gate")), `Expected stale tasks error, got ${JSON.stringify(stale.errors)}.`);
      assert(stale.errors.some((error) => error.includes("spec delta")), `Expected stale spec error, got ${JSON.stringify(stale.errors)}.`);
    }),
  },
  {
    name: "CLI proposals dry-run does not mutate input or write files",
    run: () => withTempRepo("cli-dry-run", (repo) => {
      const ledgerPath = path.join(repo, "retro.json");
      fs.writeFileSync(ledgerPath, `${JSON.stringify(baseAnalyzedLedger(), null, 2)}\n`, "utf8");
      const before = fs.readFileSync(ledgerPath, "utf8");
      const result = invokeCli(["proposals", "--input", ledgerPath, "--root", repo, "--dry-run", "--format", "json"], repo);
      assert(result.exitCode === 0, `CLI dry-run should pass, got ${result.exitCode}: ${result.output}`);
      const parsed = JSON.parse(result.stdout) as { changes?: Array<{ status?: unknown }> };
      assert(parsed.changes?.[0]?.status === "draft", `CLI dry-run should report draft, got ${result.stdout}`);
      assert(fs.readFileSync(ledgerPath, "utf8") === before, "CLI dry-run must not mutate input ledger.");
      assert(!fs.existsSync(path.join(repo, "openspec")), "CLI dry-run must not create OpenSpec files.");
    }),
  },
  {
    name: "CLI validate require-complete and require-proposals enforces final gate",
    run: () => withTempRepo("cli-require-proposals", (repo) => {
      const ledgerPath = path.join(repo, "retro.json");
      fs.writeFileSync(ledgerPath, `${JSON.stringify(baseAnalyzedLedger(), null, 2)}\n`, "utf8");
      const result = invokeCli(["validate", "--input", ledgerPath, "--root", repo, "--require-complete", "--require-proposals", "--format", "json"], repo);
      assert(result.exitCode !== 0, "CLI final gate should fail when plans have no generated proposals.");
      const parsed = JSON.parse(result.stdout) as { errors?: string[]; valid?: unknown };
      assert(parsed.valid === false, `CLI final gate should report valid false, got ${result.stdout}`);
      assert(parsed.errors?.some((error) => error.includes("openspecChangeId")), `CLI final gate should mention openspecChangeId, got ${result.stdout}`);

      const generated = createProjectSessionRetroProposals(repo, baseAnalyzedLedger());
      fs.writeFileSync(ledgerPath, `${JSON.stringify(generated.ledger, null, 2)}\n`, "utf8");
      const passed = invokeCli(["validate", "--input", ledgerPath, "--root", repo, "--require-complete", "--require-proposals", "--format", "json"], repo);
      assert(passed.exitCode === 0, `CLI final gate should pass generated complete ledger, got ${passed.exitCode}: ${passed.output}`);
      const passParsed = JSON.parse(passed.stdout) as { valid?: unknown };
      assert(passParsed.valid === true, `CLI final gate should report valid true, got ${passed.stdout}`);

      const partial = refreshAnalysisProgress(generated.ledger);
      partial.sessions.session_b.coverage.status = "partial";
      fs.writeFileSync(ledgerPath, `${JSON.stringify(refreshAnalysisProgress(partial), null, 2)}\n`, "utf8");
      const completeFailure = invokeCli(["validate", "--input", ledgerPath, "--root", repo, "--require-complete", "--require-proposals", "--format", "json"], repo);
      assert(completeFailure.exitCode !== 0, "CLI final gate should fail when proposals exist but a session is incomplete.");
      const completeFailureParsed = JSON.parse(completeFailure.stdout) as { errors?: string[] };
      assert(completeFailureParsed.errors?.some((error) => error.includes("every session must have coverage.status complete")), `Expected require-complete session error, got ${completeFailure.stdout}`);
    }),
  },
  {
    name: "CLI initializes and validates ledger with overwrite guard",
    run: () => withTempRepo("cli", (repo) => {
      const projectRoot = path.join(repo, "project");
      const otherRoot = path.join(repo, "other");
      fs.mkdirSync(projectRoot, { recursive: true });
      fs.mkdirSync(otherRoot, { recursive: true });
      const dbPath = path.join(repo, "opencode.db");
      const outPath = path.join(repo, "retro.json");
      createOpenCodeDbFixture(dbPath, projectRoot, otherRoot);

      const init = invokeCli(["init", "--project-root", projectRoot, "--db", dbPath, "--only-explicit", "--out", outPath], repo);
      assert(init.exitCode === 0, `CLI init should pass, got ${init.exitCode}: ${init.output}`);
      assert(fs.existsSync(outPath), "CLI init should write ledger file.");
      const beforeRefusedOverwrite = fs.readFileSync(outPath, "utf8");
      const refused = invokeCli(["init", "--project-root", projectRoot, "--db", dbPath, "--only-explicit", "--out", outPath], repo);
      assert(refused.exitCode !== 0 && refused.output.includes("--overwrite"), `CLI init should refuse overwrite, got ${refused.exitCode}: ${refused.output}`);
      assert(fs.readFileSync(outPath, "utf8") === beforeRefusedOverwrite, "Refused overwrite must not change output file bytes.");
      const overwritten = invokeCli(["init", "--project-root", projectRoot, "--db", dbPath, "--only-explicit", "--out", outPath, "--overwrite"], repo);
      assert(overwritten.exitCode === 0, `CLI init with --overwrite should pass, got ${overwritten.exitCode}: ${overwritten.output}`);

      const validate = invokeCli(["validate", "--input", outPath, "--format", "json"], repo);
      assert(validate.exitCode === 0, `CLI validate should pass, got ${validate.exitCode}: ${validate.output}`);
      const parsed = JSON.parse(validate.stdout) as { valid?: unknown };
      assert(parsed.valid === true, `CLI validate JSON should report valid true, got ${validate.output}`);

      const defaultOut = path.join(projectRoot, "retro.json");
      const initDefault = invokeCli(["init", "--project-root", projectRoot, "--db", dbPath, "--only-explicit"], repo);
      assert(initDefault.exitCode === 0, `CLI init without --out should write project-root retro.json, got ${initDefault.exitCode}: ${initDefault.output}`);
      assert(fs.existsSync(defaultOut), "CLI init without --out should create retro.json in project root.");
    }),
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
    console.error(`FAIL ${test.name}`);
    console.error(message);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`OK: project session retro ledger tests=${tests.length}`);
