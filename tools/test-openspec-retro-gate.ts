#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRetroGate, migrateLegacyRetrospective } from "./openspec-retro-gate.ts";

type TestCase = {
  name: string;
  run: () => void;
};

type FindingFixture = {
  problem: string;
  evidence: string;
  impact: string;
  rootCause: string;
  recommendation: string;
  confidence: "low" | "medium" | "high";
  target: "project-local" | "opencode-dev-kit" | "none";
  followUpChangeId: string | null;
  noFollowUpReason: string | null;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedAt = "2026-06-13T00:00:00.000Z";
const projectFinding: FindingFixture = {
  problem: "Project docs drift",
  evidence: "README section stale",
  impact: "Reviewers miss current commands",
  rootCause: "README routing was not updated with the changed command contract",
  recommendation: "Create follow-up",
  confidence: "high",
  target: "project-local",
  followUpChangeId: "retro-example-01-project-docs-drift",
  noFollowUpReason: null,
};
const devkitFinding: FindingFixture = {
  problem: "Workflow routing friction",
  evidence: "No-progress handoff repeated",
  impact: "Token waste",
  rootCause: "Routing guidance did not distinguish safe handoff from repeated no-progress calls",
  recommendation: "Improve reusable skill guidance",
  confidence: "high",
  target: "opencode-dev-kit",
  followUpChangeId: "retro-example-02-workflow-routing-friction",
  noFollowUpReason: null,
};
const unknownFinding: FindingFixture = {
  problem: "Mystery failure",
  evidence: "Repeated failed validation without stable repro",
  impact: "Agents cannot pick a safe fix",
  rootCause: "unknown",
  recommendation: "Investigate root cause with instrumentation before implementing a fix",
  confidence: "medium",
  target: "project-local",
  followUpChangeId: "retro-unknown-investigation-01-mystery-failure",
  noFollowUpReason: null,
};

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-retro-gate-${name}-`));
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function writeChange(repo: string, changeId: string, files: Record<string, string>): void {
  const base = path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(base, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const filePath = path.join(base, relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
  }
}

function tasksWithJsonRetro(): string {
  return `# Tasks: Example

## Implementation

- [x] Do the work.

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [x] Write \`openspec/changes/example/automation/retro.json\` with evidence, problems, root causes, improvements, follow-up ids, and archive gate decision.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [x] For reusable findings, create or update \`opencode-dev-kit\` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [x] Run \`npm run openspec:retro-followups -- example\` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [x] Confirm archive is allowed only after the JSON retro gate passes or an approved skip reason is recorded in \`automation/retro.json\`.
`;
}

function legacyTasksWithRetro(): string {
  return tasksWithJsonRetro().replace("openspec/changes/example/automation/retro.json", "retrospective.md").replace("JSON retro gate", "retro gate").replace(" in `automation/retro.json`", "");
}

function retroJson(changeId: string, problems: FindingFixture[] = [], overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    changeId,
    generatedAt,
    evidenceReviewed: [
      {
        kind: "command",
        source: "npm test",
        status: "passed",
        summary: "Focused validation passed.",
      },
    ],
    problems,
    outputs: {
      projectFollowUpChanges: problems.filter((problem) => problem.target === "project-local" && problem.followUpChangeId).map((problem) => problem.followUpChangeId),
      opencodeDevKitChanges: problems.filter((problem) => problem.target === "opencode-dev-kit" && problem.followUpChangeId).map((problem) => problem.followUpChangeId),
      noFindingsReason: problems.length === 0 ? "Evidence reviewed; no actionable findings." : null,
    },
    archiveGate: {
      decision: "passed",
      reason: problems.length === 0 ? "No findings with evidence reviewed." : "Findings routed to durable OpenSpec changes.",
      approver: null,
    },
    ...overrides,
  }, null, 2)}\n`;
}

function writeRetroJson(repo: string, changeId: string, json = retroJson(changeId)): void {
  writeChange(repo, changeId, {
    "tasks.md": tasksWithJsonRetro().replaceAll("example", changeId),
    "automation/retro.json": json,
  });
}

function findingForFollowUp(changeId: string): FindingFixture {
  if (changeId.includes("workflow-routing")) {
    return devkitFinding;
  }
  if (changeId.includes("mystery-failure")) {
    return unknownFinding;
  }
  return projectFinding;
}

function writeFollowUpWithoutSpec(repo: string, changeId: string, finding = findingForFollowUp(changeId)): void {
  const base = path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(base, { recursive: true });
  const rootCauseTask = finding.rootCause === "unknown"
    ? `Investigate and document the root cause before designing the fix: ${finding.recommendation}`
    : `Confirm root cause: ${finding.rootCause}`;
  fs.writeFileSync(path.join(base, "proposal.md"), `# Proposal: ${finding.problem}\n\n- Problem: ${finding.problem}\n- Evidence: ${finding.evidence}\n- Impact: ${finding.impact}\n- Root cause: ${finding.rootCause}\n- Recommendation: ${finding.recommendation}\n`, "utf8");
  fs.writeFileSync(path.join(base, "tasks.md"), `# Tasks: ${finding.problem}\n\n- [ ] ${rootCauseTask}\n- [ ] Implement or investigate: ${finding.recommendation}\n`, "utf8");
}

function writeFollowUp(repo: string, changeId: string, finding = findingForFollowUp(changeId)): void {
  writeFollowUpWithoutSpec(repo, changeId, finding);
  const base = path.join(repo, "openspec", "changes", changeId);
  const specPath = path.join(base, "specs", changeId, "spec.md");
  const specRootCause = finding.rootCause === "unknown" ? "discovered root cause" : finding.rootCause;
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, `# ${changeId} Specification\n\n## ADDED Requirements\n\n### Requirement: Follow-Up Preserves Retrospective Evidence\n\nThe follow-up SHALL preserve the routed retrospective root cause and recommendation.\n\n#### Scenario: Routed evidence is available\n\n- **GIVEN** a retrospective finding references this follow-up\n- **WHEN** the archive gate checks routed findings\n- **THEN** the follow-up proposal, tasks, and spec delta preserve root cause: ${specRootCause}.\n- **AND** the follow-up implements or investigates: ${finding.recommendation}.\n`, "utf8");
}

function routedFindingsRetro(changeId = "example"): string {
  const projectFollowUp = `retro-${changeId}-01-project-docs-drift`;
  const devkitFollowUp = `retro-${changeId}-02-workflow-routing-friction`;
  return `# Retrospective: example

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, tasks.
- Tool outputs / validation: npm test passed.

## Problems Found

| Problem | Evidence | Impact | Root Cause | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- | --- |
| Project docs drift | README section stale | Reviewers miss current commands | README routing was not updated with the changed command contract | Create follow-up | high | project-local |
| Workflow routing friction | No-progress handoff repeated | Token waste | Routing guidance did not distinguish safe handoff from repeated no-progress calls | Improve reusable skill guidance | high | opencode-dev-kit |

## Outputs

- Project follow-up changes: \`${projectFollowUp}\`.
- \`opencode-dev-kit\` proposals/changes: \`${devkitFollowUp}\`.
- No findings reason: n/a.

## Archive Gate Decision

- Decision: passed
- Reason: Findings routed to durable OpenSpec changes.
- Approver, if skipped: none
`;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertErrorIncludes(errors: string[], expected: string): void {
  assert(errors.some((error) => error.includes(expected)), `Expected errors to include ${expected}, got ${JSON.stringify(errors)}.`);
}

function readRepoText(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
}

const tests: TestCase[] = [
  {
    name: "retro gate requires automation retro json",
    run: () => withTempRepo("missing-json", (repo) => {
      writeChange(repo, "example", { "tasks.md": tasksWithJsonRetro(), "retrospective.md": routedFindingsRetro() });
      const result = evaluateRetroGate(repo, "example");
      assert(!result.valid, "Missing automation/retro.json must fail.");
      assert(!result.archiveAllowed, "Missing automation/retro.json must block archive.");
      assertErrorIncludes(result.errors, "automation/retro.json");
    }),
  },
  {
    name: "retro gate accepts concise no-findings json retrospective",
    run: () => withTempRepo("no-findings", (repo) => {
      writeRetroJson(repo, "example");
      const result = evaluateRetroGate(repo, "example");
      assert(result.valid, `No-findings retro.json should pass, got ${JSON.stringify(result.errors)}.`);
      assert(result.archiveAllowed, "No-findings retro.json should allow archive.");
    }),
  },
  {
    name: "retro gate validates approved skip reason and approver",
    run: () => withTempRepo("approved-skip", (repo) => {
      writeRetroJson(repo, "example", retroJson("example", [], { archiveGate: { decision: "approved-skip", reason: "Product owner approved archive without findings.", approver: "product-owner" } }));
      const accepted = evaluateRetroGate(repo, "example");
      assert(accepted.valid && accepted.archiveAllowed, `Approved skip with reason and approver should pass, got ${JSON.stringify(accepted.errors)}.`);

      writeRetroJson(repo, "broken", retroJson("broken", [], { archiveGate: { decision: "approved-skip", reason: "", approver: null } }));
      const rejected = evaluateRetroGate(repo, "broken");
      assert(!rejected.valid, "Approved skip without reason/approver must fail.");
      assertErrorIncludes(rejected.errors, "approved skip");
    }),
  },
  {
    name: "retro gate validates strict schema and routed findings",
    run: () => withTempRepo("finding-routing", (repo) => {
      writeRetroJson(repo, "example", retroJson("example", [projectFinding, devkitFinding]));
      writeFollowUp(repo, "retro-example-01-project-docs-drift");
      writeFollowUp(repo, "retro-example-02-workflow-routing-friction");
      const accepted = evaluateRetroGate(repo, "example");
      assert(accepted.valid && accepted.archiveAllowed, `Routed findings should pass, got ${JSON.stringify(accepted.errors)}.`);

      writeRetroJson(repo, "missing-schema", retroJson("missing-schema", []).replace('  "schemaVersion": 1,\n', ""));
      assertErrorIncludes(evaluateRetroGate(repo, "missing-schema").errors, "schemaVersion");

      writeRetroJson(repo, "wrong-change", retroJson("other-change"));
      assertErrorIncludes(evaluateRetroGate(repo, "wrong-change").errors, "changeId");

      writeRetroJson(repo, "unknown-field", retroJson("unknown-field", [], { extra: true }));
      assertErrorIncludes(evaluateRetroGate(repo, "unknown-field").errors, "Unknown field");

      writeRetroJson(repo, "malformed-finding", retroJson("malformed-finding", [{ ...projectFinding, evidence: "" }]));
      assertErrorIncludes(evaluateRetroGate(repo, "malformed-finding").errors, "problem entries must include");

      writeRetroJson(repo, "missing-follow-up-id", retroJson("missing-follow-up-id", [{ ...projectFinding, followUpChangeId: null }]));
      assertErrorIncludes(evaluateRetroGate(repo, "missing-follow-up-id").errors, "followUpChangeId");

      writeRetroJson(repo, "missing-follow-up", retroJson("missing-follow-up", [{ ...projectFinding, followUpChangeId: "retro-missing-follow-up-01-project-docs-drift" }]));
      assertErrorIncludes(evaluateRetroGate(repo, "missing-follow-up").errors, "must exist with proposal.md");

      writeRetroJson(repo, "unknown-with-fix", retroJson("unknown-with-fix", [{ ...unknownFinding, followUpChangeId: "retro-unknown-with-fix-01-mystery-failure", recommendation: "Apply guessed fix immediately" }]));
      writeFollowUp(repo, "retro-unknown-with-fix-01-mystery-failure", { ...unknownFinding, recommendation: "Apply guessed fix immediately" });
      assertErrorIncludes(evaluateRetroGate(repo, "unknown-with-fix").errors, "unknown root cause");

      writeRetroJson(repo, "bad-decision", retroJson("bad-decision", [], { archiveGate: { decision: "maybe", reason: "bad", approver: null } }));
      assertErrorIncludes(evaluateRetroGate(repo, "bad-decision").errors, "Archive gate decision");
    }),
  },
  {
    name: "retro gate migrates supported legacy markdown and blocks malformed tables",
    run: () => withTempRepo("migration", (repo) => {
      writeChange(repo, "example", { "tasks.md": legacyTasksWithRetro(), "retrospective.md": routedFindingsRetro("example") });
      const migrated = migrateLegacyRetrospective(repo, "example", { generatedAt });
      assert(migrated.migrated, `Expected migrated result, got ${JSON.stringify(migrated)}.`);
      writeFollowUp(repo, "retro-example-01-project-docs-drift");
      writeFollowUp(repo, "retro-example-02-workflow-routing-friction");
      const accepted = evaluateRetroGate(repo, "example");
      assert(accepted.valid && accepted.archiveAllowed, `Migrated retro.json should satisfy gate, got ${JSON.stringify(accepted.errors)}.`);

      writeChange(repo, "malformed", {
        "tasks.md": legacyTasksWithRetro().replaceAll("example", "malformed"),
        "retrospective.md": routedFindingsRetro("malformed").replace("| Workflow routing friction | No-progress handoff repeated | Token waste | Routing guidance did not distinguish safe handoff from repeated no-progress calls | Improve reusable skill guidance | high | opencode-dev-kit |", "| Workflow routing friction | No-progress handoff repeated | Token waste | opencode-dev-kit |"),
      });
      const blocked = migrateLegacyRetrospective(repo, "malformed", { dryRun: true, generatedAt });
      assert(!blocked.migrated, "Malformed Markdown table must block migration.");
      assert(blocked.errors.some((error) => error.includes("seven columns")), `Expected malformed table error, got ${JSON.stringify(blocked.errors)}.`);
    }),
  },
  {
    name: "OpenSpec workflow skills document json retrospective gate",
    run: () => {
      const archive = readRepoText(".opencode/skills/openspec-archive-change/SKILL.md");
      const propose = readRepoText(".opencode/skills/openspec-propose/SKILL.md");
      const apply = readRepoText(".opencode/skills/openspec-apply-change/SKILL.md");
      const readme = readRepoText("README.md");

      for (const [label, text] of Object.entries({ archive, propose, apply, readme })) {
        assert(text.includes("automation/retro.json"), `${label} must require automation/retro.json.`);
        assert(!text.includes("Write `retrospective.md`"), `${label} must not instruct agents to write retrospective.md.`);
      }
      assert(archive.includes("openspec:retro-followups") && archive.includes("openspec:retro-gate") && archive.toLowerCase().includes("root cause") && archive.includes("approved skip"), "openspec-archive-change must enforce follow-up generation, root-cause evidence, the retro gate, and approved skip path.");
      assert(propose.includes("## Retrospective Before Archive") && propose.includes("openspec:retro-followups"), "openspec-propose must include the final JSON retrospective task template.");
      assert(apply.includes("openspec:retro-followups") && apply.includes("before archive"), "openspec-apply-change must hand completed changes to follow-up generation and the JSON retrospective gate before archive.");
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
    console.error(`FAIL ${test.name}`);
    console.error(message);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`OK: openspec retro gate tests=${tests.length}`);
