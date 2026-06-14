#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRetroFollowUps } from "./openspec-retro-followups.ts";
import { evaluateRetroGate } from "./openspec-retro-gate.ts";

type TestCase = {
  name: string;
  run: () => void;
};

const generatedAt = "2026-06-13T00:00:00.000Z";

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-retro-followups-${name}-`));
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function tasksWithRetro(changeId: string): string {
  return `# Tasks: Example

## Implementation

- [x] Do the work.

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [x] Write \`openspec/changes/${changeId}/automation/retro.json\` with evidence, problems, root causes, improvements, follow-up ids, and archive gate decision.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [x] For reusable findings, create or update \`opencode-dev-kit\` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [x] Run \`npm run openspec:retro-followups -- ${changeId}\` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [x] Confirm archive is allowed only after the JSON retro gate passes or an approved skip reason is recorded in \`automation/retro.json\`.
`;
}

function retroJson(changeId: string, problems = defaultProblems()): string {
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
      projectFollowUpChanges: [],
      opencodeDevKitChanges: [],
      noFindingsReason: problems.length === 0 ? "Evidence reviewed; no actionable findings." : "Evidence reviewed before routing.",
    },
    archiveGate: {
      decision: "passed",
      reason: problems.length === 0 ? "No findings with evidence reviewed." : "Findings routed to durable OpenSpec changes.",
      approver: null,
    },
  }, null, 2)}\n`;
}

function defaultProblems(): Record<string, unknown>[] {
  return [
    {
      problem: "Project docs drift",
      evidence: "README section stale",
      impact: "Reviewers miss current commands",
      rootCause: "README routing was not updated with the changed command contract",
      recommendation: "Create docs follow-up",
      confidence: "high",
      target: "project-local",
      followUpChangeId: null,
      noFollowUpReason: null,
    },
    {
      problem: "Workflow routing friction",
      evidence: "No-progress handoff repeated",
      impact: "Token waste",
      rootCause: "Routing guidance did not distinguish safe handoff from repeated no-progress calls",
      recommendation: "Improve reusable skill guidance",
      confidence: "high",
      target: "opencode-dev-kit",
      followUpChangeId: null,
      noFollowUpReason: null,
    },
    {
      problem: "Fixed in scope",
      evidence: "Reviewer finding patched",
      impact: "No remaining impact",
      rootCause: "Missing coverage was already addressed by the scoped fix",
      recommendation: "No follow-up needed",
      confidence: "high",
      target: "none",
      followUpChangeId: null,
      noFollowUpReason: "Fixed in scope.",
    },
  ];
}

function unknownCauseProblems(): Record<string, unknown>[] {
  return [
    {
      problem: "Mystery failure",
      evidence: "Repeated failed validation without stable repro",
      impact: "Agents cannot pick a safe fix",
      rootCause: "unknown",
      recommendation: "Investigate root cause with instrumentation before implementing a fix",
      confidence: "medium",
      target: "project-local",
      followUpChangeId: null,
      noFollowUpReason: null,
    },
  ];
}

function writeChange(repo: string, changeId: string, json = retroJson(changeId)): void {
  const base = path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(path.join(base, "automation"), { recursive: true });
  fs.writeFileSync(path.join(base, "tasks.md"), tasksWithRetro(changeId), "utf8");
  fs.writeFileSync(path.join(base, "automation", "retro.json"), json, "utf8");
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const tests: TestCase[] = [
  {
    name: "follow-up helper creates changes and updates retro json outputs",
    run: () => withTempRepo("create", (repo) => {
      writeChange(repo, "example");
      const result = createRetroFollowUps(repo, "example");
      assert(result.changes.length === 2, `Expected two follow-up changes, got ${result.changes.length}.`);
      assert(result.changes.every((change) => change.status === "created"), `Expected created statuses, got ${JSON.stringify(result.changes)}.`);
      for (const change of result.changes) {
        assert(fs.existsSync(path.join(repo, change.path, "proposal.md")), `Missing proposal for ${change.id}.`);
        assert(fs.existsSync(path.join(repo, change.path, "tasks.md")), `Missing tasks for ${change.id}.`);
        const specPath = path.join(repo, change.path, "specs", change.id, "spec.md");
        const spec = fs.existsSync(specPath) ? fs.readFileSync(specPath, "utf8") : "";
        assert(spec.includes("## ADDED Requirements") && spec.includes("#### Scenario:"), `Missing valid spec delta for ${change.id}.`);
      }
      const retro = JSON.parse(fs.readFileSync(path.join(repo, "openspec", "changes", "example", "automation", "retro.json"), "utf8")) as Record<string, unknown>;
      assert(JSON.stringify(retro).includes("retro-example-01-project-docs-drift"), "Project output must reference generated follow-up change.");
      assert(JSON.stringify(retro).includes("retro-example-02-workflow-routing-friction"), "Reusable output must reference generated follow-up change.");
      assert((retro.outputs as { noFindingsReason?: unknown }).noFindingsReason === null, "No-findings reason must be cleared when findings create changes.");
      const gate = evaluateRetroGate(repo, "example");
      assert(gate.valid && gate.archiveAllowed, `Generated follow-ups should satisfy retro gate, got ${JSON.stringify(gate.errors)}.`);
    }),
  },
  {
    name: "follow-up helper routes unknown root causes to investigation wording",
    run: () => withTempRepo("unknown", (repo) => {
      writeChange(repo, "investigate-case", retroJson("investigate-case", unknownCauseProblems()));
      const result = createRetroFollowUps(repo, "investigate-case");
      assert(result.changes.length === 1, `Expected one investigation follow-up, got ${JSON.stringify(result.changes)}.`);
      const proposal = fs.readFileSync(path.join(repo, "openspec", "changes", "retro-investigate-case-01-mystery-failure", "proposal.md"), "utf8");
      assert(proposal.includes("Investigate the unknown root cause"), "Unknown-cause proposal must use investigation wording.");
      const tasks = fs.readFileSync(path.join(repo, "openspec", "changes", "retro-investigate-case-01-mystery-failure", "tasks.md"), "utf8");
      assert(tasks.includes("Investigate and document the root cause"), "Unknown-cause tasks must require root-cause investigation.");
      const second = createRetroFollowUps(repo, "investigate-case");
      assert(second.changes.every((change) => change.status === "existing"), `Unknown root-cause follow-up must be idempotent, got ${JSON.stringify(second.changes)}.`);
      const gate = evaluateRetroGate(repo, "investigate-case");
      assert(gate.valid && gate.archiveAllowed, `Unknown root-cause follow-up should satisfy gate, got ${JSON.stringify(gate.errors)}.`);
    }),
  },
  {
    name: "follow-up helper is idempotent for existing changes",
    run: () => withTempRepo("idempotent", (repo) => {
      writeChange(repo, "example");
      const first = createRetroFollowUps(repo, "example");
      const second = createRetroFollowUps(repo, "example");
      assert(first.changes.every((change) => change.status === "created"), "First run must create changes.");
      assert(second.changes.every((change) => change.status === "existing"), `Second run must report existing changes, got ${JSON.stringify(second.changes)}.`);
      const gate = evaluateRetroGate(repo, "example");
      assert(gate.valid, `Idempotent follow-up output should keep retro gate valid, got ${JSON.stringify(gate.errors)}.`);
    }),
  },
  {
    name: "follow-up helper reports no writes for no actionable findings",
    run: () => withTempRepo("none", (repo) => {
      writeChange(repo, "example", retroJson("example", []));
      const result = createRetroFollowUps(repo, "example");
      assert(result.changes.length === 0, `No actionable targets must create no changes, got ${JSON.stringify(result.changes)}.`);
      assert(!result.retrospectiveUpdated, "No actionable targets must not update retro json outputs.");
    }),
  },
  {
    name: "follow-up helper preserves enriched existing files when required fragments exist",
    run: () => withTempRepo("preserve-enriched", (repo) => {
      writeChange(repo, "example");
      const existing = path.join(repo, "openspec", "changes", "retro-example-01-project-docs-drift");
      fs.mkdirSync(path.join(existing, "specs", "retro-example-01-project-docs-drift"), { recursive: true });
      const proposal = "# Custom Proposal\n\nProject docs drift\nREADME section stale\nReviewers miss current commands\nREADME routing was not updated with the changed command contract\nCreate docs follow-up\n\nHuman-added context must remain.\n";
      const tasks = "# Custom Tasks\n\nConfirm the retrospective root cause: README routing was not updated with the changed command contract\nCreate docs follow-up\n\nHuman-added task context must remain.\n";
      const spec = "# Custom Spec\n\n## ADDED Requirements\n\n#### Scenario: Preserve custom spec\n\nRoot cause: README routing was not updated with the changed command contract.\nCreate docs follow-up.\nHuman-added spec context must remain.\n";
      fs.writeFileSync(path.join(existing, "proposal.md"), proposal, "utf8");
      fs.writeFileSync(path.join(existing, "tasks.md"), tasks, "utf8");
      fs.writeFileSync(path.join(existing, "specs", "retro-example-01-project-docs-drift", "spec.md"), spec, "utf8");

      const result = createRetroFollowUps(repo, "example");
      const project = result.changes.find((change) => change.id === "retro-example-01-project-docs-drift");
      assert(project?.status === "existing", `Enriched follow-up must not be overwritten, got ${JSON.stringify(project)}.`);
      assert(fs.readFileSync(path.join(existing, "proposal.md"), "utf8") === proposal, "Proposal with required fragments must remain unchanged.");
      assert(fs.readFileSync(path.join(existing, "tasks.md"), "utf8") === tasks, "Tasks with required fragments must remain unchanged.");
      assert(fs.readFileSync(path.join(existing, "specs", "retro-example-01-project-docs-drift", "spec.md"), "utf8") === spec, "Spec with required fragments must remain unchanged.");
    }),
  },
  {
    name: "follow-up helper uses finding indexes for duplicate problem titles",
    run: () => withTempRepo("duplicate-problems", (repo) => {
      const duplicateProblems = [
        {
          problem: "Duplicate problem",
          evidence: "First evidence",
          impact: "First impact",
          rootCause: "First root cause",
          recommendation: "First recommendation",
          confidence: "high",
          target: "project-local",
          followUpChangeId: null,
          noFollowUpReason: null,
        },
        {
          problem: "Duplicate problem",
          evidence: "Second evidence",
          impact: "Second impact",
          rootCause: "Second root cause",
          recommendation: "Second recommendation",
          confidence: "medium",
          target: "opencode-dev-kit",
          followUpChangeId: null,
          noFollowUpReason: null,
        },
      ];
      writeChange(repo, "dupes", retroJson("dupes", duplicateProblems));
      const result = createRetroFollowUps(repo, "dupes");
      assert(result.changes.length === 2, `Expected two duplicate-title follow-ups, got ${JSON.stringify(result.changes)}.`);
      const retro = JSON.parse(fs.readFileSync(path.join(repo, "openspec", "changes", "dupes", "automation", "retro.json"), "utf8")) as { problems: Array<{ followUpChangeId: string | null }> };
      assert(retro.problems[0]?.followUpChangeId === "retro-dupes-01-duplicate-problem", `First duplicate follow-up wrong: ${JSON.stringify(retro.problems)}.`);
      assert(retro.problems[1]?.followUpChangeId === "retro-dupes-02-duplicate-problem", `Second duplicate follow-up wrong: ${JSON.stringify(retro.problems)}.`);
    }),
  },
  {
    name: "follow-up helper ignores whitespace noFollowUpReason",
    run: () => withTempRepo("blank-no-followup", (repo) => {
      const [problem] = defaultProblems();
      writeChange(repo, "example", retroJson("example", [{ ...problem, noFollowUpReason: "   " }]));
      const result = createRetroFollowUps(repo, "example");
      assert(result.changes.length === 1, `Blank noFollowUpReason must still create follow-up, got ${JSON.stringify(result.changes)}.`);
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

console.log(`OK: openspec retro follow-up tests=${tests.length}`);
