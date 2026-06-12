#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  collectAutopilotEvidence,
  renderEvidenceMarkdown,
  summarizeCommandOutput,
  writeEvidenceReport,
  type CommandRunner,
} from "./autopilot-evidence.ts";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "fixtures", "autopilot-ledger");

function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8")) as Record<string, unknown>;
}

function withTempRepo(name: string, run: (repo: string) => void | Promise<void>): void | Promise<void> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `autopilot-evidence-${name}-`));
  const finish = () => fs.rmSync(repo, { recursive: true, force: true });
  let result: void | Promise<void>;
  try {
    result = run(repo);
  } catch (error) {
    finish();
    throw error;
  }
  if (result instanceof Promise) {
    return result.finally(finish);
  }
  finish();
  return undefined;
}

function writeLedger(repo: string, changeId: string, id: string, taskType: string): void {
  const ledger = readFixture(taskType === "typo" ? "valid-typo.json" : taskType === "research" ? "valid-research.json" : "valid-feature.json");
  ledger.id = id;
  ledger.taskType = taskType;
  ledger.status = "Ready";
  const filePath = path.join(repo, "openspec", "changes", changeId, "automation", "task.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function writeChange(repo: string, changeId: string): void {
  const changeRoot = path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(changeRoot, { recursive: true });
  fs.writeFileSync(path.join(changeRoot, "proposal.md"), `# Proposal: ${changeId}\n`, "utf8");
  fs.writeFileSync(path.join(changeRoot, "tasks.md"), `# Tasks\n\n## Retrospective Before Archive\n\n- [ ] Write \`retrospective.md\`.\n`, "utf8");
}

function snapshotProtected(repo: string): string {
  const protectedFiles = [
    path.join(repo, ".autopilot", "state.json"),
    path.join(repo, "openspec", "changes", "example", "automation", "task.json"),
  ];
  return JSON.stringify(protectedFiles.map((file) => ({ file, exists: fs.existsSync(file), text: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null })));
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrowsContains(run: () => void, expected: string): void {
  try {
    run();
    throw new Error(`Expected error containing ${expected}.`);
  } catch (error) {
    assert(String(error).includes(expected), `Expected error to include ${expected}, got ${String(error)}.`);
  }
}

function ids(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

const tests: TestCase[] = [
  {
    name: "collect mode emits stable JSON without protected writes",
    run: () => withTempRepo("collect", (repo) => {
      writeChange(repo, "example");
      writeLedger(repo, "example", "task-feature", "feature");
      fs.mkdirSync(path.join(repo, ".autopilot"), { recursive: true });
      fs.writeFileSync(path.join(repo, ".autopilot", "state.json"), "{}\n", "utf8");
      const before = snapshotProtected(repo);
      const pack = collectAutopilotEvidence(repo, {
        changeId: "example",
        generatedAt: "2026-06-12T00:00:00.000Z",
        commandRunner: () => {
          throw new Error("collect mode must not execute validation commands");
        },
      });
      const after = snapshotProtected(repo);

      assert(before === after, "Collect mode must not write protected Autopilot paths.");
      assert(pack.schemaVersion === 1, "Evidence pack schemaVersion must be 1.");
      assert(pack.changeId === "example", "Evidence pack must include change id.");
      assert(ids(pack.ledgers).join(",") === "ledger:task-feature", `Ledgers must be stable sorted, got ${ids(pack.ledgers).join(",")}.`);
      assert(pack.validationPlan.some((item) => item.command === "npm run validate"), "Validation plan must include npm run validate.");
      assert(pack.validationResults.length === 0, "Collect mode must not execute validation commands.");
    }),
  },
  {
    name: "validate mode rejects unsafe change id before command execution",
    run: () => withTempRepo("unsafe-change", (repo) => {
      let called = false;
      assertThrowsContains(() => collectAutopilotEvidence(repo, {
        changeId: "bad;echo-owned",
        mode: "validate",
        commandRunner: () => {
          called = true;
          return { command: "never", exitCode: 0 };
        },
      }), "Invalid OpenSpec change id");
      assert(!called, "Unsafe change id must be rejected before command runner invocation.");
    }),
  },
  {
    name: "validate mode summarizes fake command output with redaction",
    run: () => withTempRepo("validate", (repo) => {
      writeChange(repo, "example");
      writeLedger(repo, "example", "task-feature", "feature");
      const runner: CommandRunner = (command) => ({
        command,
        exitCode: command === "npm test" ? 1 : 0,
        stdout: `ok ${repo} SECRET_TOKEN=abc123`,
        stderr: command === "npm test" ? "failed with api_key: secret" : "",
        durationMs: 12,
      });
      const pack = collectAutopilotEvidence(repo, { changeId: "example", mode: "validate", generatedAt: "2026-06-12T00:00:00.000Z", commandRunner: runner });
      assert(pack.validationResults.length === pack.validationPlan.length, "Validate mode must produce one result per planned command.");
      assert(pack.validationResults.some((item) => item.status === "error" && item.command === "npm test"), "Failed fake npm test must be summarized as error.");
      assert(!JSON.stringify(pack).includes(repo), "Evidence pack must redact absolute repo paths by default.");
      assert(!JSON.stringify(pack).includes("abc123") && !JSON.stringify(pack).includes("secret"), "Evidence pack must redact secret-like output values.");
    }),
  },
  {
    name: "reviewer plan covers task types and changed-file signals",
    run: () => withTempRepo("reviewers", (repo) => {
      const expectedByType: Record<string, string[]> = {
        feature: ["code-quality-reviewer", "test-coverage-reviewer"],
        bugfix: ["code-quality-reviewer", "test-coverage-reviewer"],
        refactor: ["code-quality-reviewer", "test-coverage-reviewer"],
        tooling: ["code-quality-reviewer", "test-coverage-reviewer"],
        config: ["deployment-config-reviewer"],
        performance: ["performance-reliability-reviewer"],
        protocol: ["protocol-api-reviewer", "wire-protocol-reviewer"],
        docs: [],
        typo: [],
        research: [],
        planning: [],
      };
      for (const [taskType, expectedReviewers] of Object.entries(expectedByType)) {
        const changeId = `example-${taskType}`;
        writeChange(repo, changeId);
        writeLedger(repo, changeId, `task-${taskType}`, taskType);
        const pack = collectAutopilotEvidence(repo, { changeId, generatedAt: "2026-06-12T00:00:00.000Z" });
        const reviewers = new Set(pack.reviewerPlan.filter((item) => item.status === "required").map((item) => item.reviewer));
        for (const reviewer of expectedReviewers) {
          assert(reviewers.has(reviewer), `${taskType} task must require ${reviewer}.`);
        }
        if (expectedReviewers.length === 0) {
          assert(reviewers.size === 0, `${taskType} task must not require reviewers without changed-file signals, got ${Array.from(reviewers).join(",")}.`);
        }
      }
      writeChange(repo, "example");
      writeLedger(repo, "example", "task-config", "config");
      const pack = collectAutopilotEvidence(repo, {
        changeId: "example",
        changedFiles: [".opencode/skills/example/SKILL.md", "tools/example.ts", "README.md"],
        generatedAt: "2026-06-12T00:00:00.000Z",
      });
      const reviewers = new Set(pack.reviewerPlan.filter((item) => item.status === "required").map((item) => item.reviewer));
      assert(reviewers.has("deployment-config-reviewer"), "Config task must require deployment-config-reviewer.");
      assert(reviewers.has("instruction-artifact-reviewer"), "Skill/README changes must require instruction-artifact-reviewer.");
      assert(reviewers.has("code-quality-reviewer"), "TypeScript tool changes must require code-quality-reviewer.");
    }),
  },
  {
    name: "collect mode derives reviewer gates from git status changed files",
    run: () => withTempRepo("git-reviewers", (repo) => {
      const init = spawnSync("git", ["init"], { cwd: repo, encoding: "utf8", shell: false });
      assert((init.status ?? 0) === 0, `git init must succeed for reviewer derivation test: ${init.stderr ?? init.stdout}`);
      writeChange(repo, "example");
      writeLedger(repo, "example", "task-research", "research");
      fs.mkdirSync(path.join(repo, "tools"), { recursive: true });
      fs.mkdirSync(path.join(repo, ".opencode", "skills", "example"), { recursive: true });
      fs.mkdirSync(path.join(repo, "instructions"), { recursive: true });
      fs.writeFileSync(path.join(repo, "tools", "example.ts"), "export {};\n", "utf8");
      fs.writeFileSync(path.join(repo, "README.md"), "# Example\n", "utf8");
      fs.writeFileSync(path.join(repo, ".opencode", "skills", "example", "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n", "utf8");
      fs.writeFileSync(path.join(repo, "instructions", "example.md"), "# Example Instruction\n", "utf8");
      const pack = collectAutopilotEvidence(repo, { changeId: "example", generatedAt: "2026-06-12T00:00:00.000Z" });
      const reviewers = new Set(pack.reviewerPlan.map((item) => item.reviewer));
      assert(reviewers.has("code-quality-reviewer"), "Git status tools/*.ts changes must require code-quality-reviewer.");
      assert(reviewers.has("instruction-artifact-reviewer"), "Git status README/.opencode changes must require instruction-artifact-reviewer.");
    }),
  },
  {
    name: "collect mode derives instruction reviewer from instructions git status",
    run: () => withTempRepo("git-instructions-reviewer", (repo) => {
      const init = spawnSync("git", ["init"], { cwd: repo, encoding: "utf8", shell: false });
      assert((init.status ?? 0) === 0, `git init must succeed for instruction reviewer derivation test: ${init.stderr ?? init.stdout}`);
      writeChange(repo, "example");
      writeLedger(repo, "example", "task-research", "research");
      fs.mkdirSync(path.join(repo, "instructions"), { recursive: true });
      fs.writeFileSync(path.join(repo, "instructions", "example.md"), "# Example Instruction\n", "utf8");
      const pack = collectAutopilotEvidence(repo, { changeId: "example", generatedAt: "2026-06-12T00:00:00.000Z" });
      const reviewers = new Set(pack.reviewerPlan.map((item) => item.reviewer));
      assert(reviewers.has("instruction-artifact-reviewer"), "Git status instructions/*.md changes must require instruction-artifact-reviewer.");
    }),
  },
  {
    name: "freshness and retrospective sections report unknowns and candidate routing",
    run: () => withTempRepo("retro", (repo) => {
      writeChange(repo, "example");
      const pack = collectAutopilotEvidence(repo, { changeId: "example", generatedAt: "2026-06-12T00:00:00.000Z" });
      assert(pack.freshness.some((item) => item.status === "unknown" && item.summary.includes("unsupported")), "Unsupported freshness input must report unknown.");
      assert(!pack.retrospective.archiveGatePassed, "Evidence pack must not claim the retrospective gate passed.");
      assert(pack.retrospective.checklist.some((item) => item.id === "retro:evidence-reviewed"), "Retrospective checklist must include evidence review.");
      assert(pack.retrospective.candidateFollowUps.some((item) => item.target === "opencode-dev-kit"), "Retrospective routing must include opencode-dev-kit candidate follow-up path.");
    }),
  },
  {
    name: "Markdown rendering is deterministic and report writes require approved path",
    run: () => withTempRepo("markdown", (repo) => {
      writeChange(repo, "example");
      writeLedger(repo, "example", "task-feature", "feature");
      const pack = collectAutopilotEvidence(repo, { changeId: "example", generatedAt: "2026-06-12T00:00:00.000Z" });
      const first = renderEvidenceMarkdown(pack);
      const second = renderEvidenceMarkdown(pack);
      assert(first === second, "Markdown rendering must be deterministic for the same pack.");
      for (const heading of ["## Tool Smoke", "## Scenario Matrix", "## Findings", "## Follow-Up Changes", "## Validation", "## Reviewer Gates", "## Residual Risks", "## Ready-To-Land Status", "## Retrospective Evidence"]) {
        assert(first.includes(heading), `Markdown must include ${heading}.`);
      }
      assert(first.includes("Impact | Recommendation | Confidence | Validation Path"), "Findings table must include impact, recommendation, confidence, and validation path columns.");
      const reportPath = path.join(repo, "openspec", "changes", "example", "evidence-report.md");
      writeEvidenceReport(repo, pack, reportPath);
      assert(fs.existsSync(reportPath), "Report mode must write to explicit approved report path.");
      assertThrowsContains(() => writeEvidenceReport(repo, pack, reportPath), "overwrite");
      for (const blockedPath of [
        path.join(repo, "README.md"),
        path.join(repo, ".autopilot", "evidence.md"),
        path.join(repo, "openspec", "changes", "other", "evidence.md"),
        path.join(repo, "openspec", "changes", "example", "automation", "evidence.md"),
        path.join(repo, "openspec", "changes", "example", "automation", "feedback", "evidence.md"),
        path.join(repo, "openspec", "changes", "example", "automation", "artifacts", "evidence.md"),
        path.join(repo, "..", "outside-evidence.md"),
      ]) {
        assertThrowsContains(() => writeEvidenceReport(repo, pack, blockedPath), "protected");
      }
    }),
  },
  {
    name: "command output summary is compact and redacted",
    run: () => {
      const summary = summarizeCommandOutput("npm test", 1, `line1\nline2\nC:\\secret\\repo\\file.ts\n/home/user/repo/file.ts\nTOKEN=abc123\nAuthorization: Bearer abc.def\nBearer standalone.token`, "api_key: xyz", "C:/secret/repo");
      assert(summary.status === "error", "Non-zero exit code must summarize as error.");
      assert(!summary.summary.includes("abc123") && !summary.summary.includes("abc.def") && !summary.summary.includes("standalone.token") && !summary.summary.includes("xyz"), "Summary must redact secret-like values.");
      assert(!summary.summary.includes("C:/secret/repo") && !summary.summary.includes("C:\\secret\\repo"), "Summary must redact absolute paths.");
      assert(!summary.summary.includes("/home/user/repo"), "Summary must redact POSIX absolute paths.");
      const bearerOnly = summarizeCommandOutput("npm test", 1, "Bearer standalone.token", "", "C:/secret/repo");
      assert(bearerOnly.summary.includes("Bearer <redacted>"), `Standalone Bearer token must be visibly redacted, got ${bearerOnly.summary}.`);
      assert(!bearerOnly.summary.includes("standalone.token"), "Standalone Bearer token value must not appear in summary.");
      const markdown = renderEvidenceMarkdown({
        schemaVersion: 1,
        changeId: "example",
        generatedAt: "2026-06-12T00:00:00.000Z",
        gitStatus: { clean: true, entries: [], truncated: false },
        ledgers: [],
        toolSmoke: [],
        validationPlan: [],
        validationResults: [{ ...summary, summary: "left | right" }],
        reviewerPlan: [],
        freshness: [],
        scenarios: [],
        findings: [],
        retrospective: { archiveGatePassed: false, checklist: [], candidateFollowUps: [] },
        residualRisks: [],
      });
      assert(markdown.includes("left \\| right"), "Markdown table cells must escape pipe characters.");
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
    console.error(`FAIL ${test.name}`);
    console.error(message);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`OK: autopilot evidence tests=${tests.length}`);
