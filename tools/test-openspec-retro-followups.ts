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

function withTempRepo(name: string, run: (repo: string) => void): void {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `openspec-retro-followups-${name}-`));
  try {
    run(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

function tasksWithRetro(): string {
  return `# Tasks: Example

## Implementation

- [x] Do the work.

## Retrospective Before Archive

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, and token-heavy steps.
- [x] Write \`retrospective.md\` with evidence, problems, improvements, and archive gate decision.
- [x] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [x] Create or update reusable \`opencode-dev-kit\` OpenSpec proposals/changes for Autopilot, skill, agent, instruction, validator, or evidence-pack findings.
- [x] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
`;
}

function retrospectiveWithFindings(): string {
  return `# Retrospective: example

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, tasks.
- Tool outputs / validation: npm test passed.
- Reviewer gates: instruction-artifact-reviewer passed.
- Autopilot/runtime events: ready_runtime_deferred.

## Problems Found

| Problem | Evidence | Impact | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- |
| Project docs drift | README section stale | Reviewers miss current commands | Create docs follow-up | high | project-local |
| Autopilot escape friction | ready_runtime_deferred repeated | Token waste | Improve reusable skill guidance | high | opencode-dev-kit |
| Fixed in scope | Reviewer finding patched | No remaining impact | No follow-up needed | high | none |

## Outputs

- Project follow-up changes: none.
- \`opencode-dev-kit\` proposals/changes: none.
- No findings reason: Evidence reviewed before routing.

## Archive Gate Decision

- Decision: passed
- Reason: Findings routed to durable OpenSpec changes.
- Approver, if skipped: none
`;
}

function writeChange(repo: string, changeId: string, retrospective = retrospectiveWithFindings()): void {
  const base = path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, "tasks.md"), tasksWithRetro(), "utf8");
  fs.writeFileSync(path.join(base, "retrospective.md"), retrospective, "utf8");
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const tests: TestCase[] = [
  {
    name: "follow-up helper creates changes and updates retrospective outputs",
    run: () => withTempRepo("create", (repo) => {
      writeChange(repo, "example");
      const result = createRetroFollowUps(repo, "example");
      assert(result.changes.length === 2, `Expected two follow-up changes, got ${result.changes.length}.`);
      assert(result.changes.every((change) => change.status === "created"), `Expected created statuses, got ${JSON.stringify(result.changes)}.`);
      for (const change of result.changes) {
        assert(fs.existsSync(path.join(repo, change.path, "proposal.md")), `Missing proposal for ${change.id}.`);
        assert(fs.existsSync(path.join(repo, change.path, "tasks.md")), `Missing tasks for ${change.id}.`);
      }
      const retrospective = fs.readFileSync(path.join(repo, "openspec", "changes", "example", "retrospective.md"), "utf8");
      assert(retrospective.includes("Project follow-up changes: `retro-example-01-project-docs-drift`."), "Project output must reference generated follow-up change.");
      assert(retrospective.includes("`opencode-dev-kit` proposals/changes: `retro-example-02-autopilot-escape-friction`."), "Reusable output must reference generated follow-up change.");
      assert(retrospective.includes("No findings reason: n/a."), "No-findings reason must be cleared when findings create changes.");
      const gate = evaluateRetroGate(repo, "example");
      assert(gate.valid && gate.archiveAllowed, `Generated follow-ups should satisfy retro gate, got ${JSON.stringify(gate.errors)}.`);
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
    name: "follow-up helper fills partial existing changes",
    run: () => withTempRepo("partial", (repo) => {
      writeChange(repo, "example");
      const partial = path.join(repo, "openspec", "changes", "retro-example-01-project-docs-drift");
      fs.mkdirSync(partial, { recursive: true });
      fs.writeFileSync(path.join(partial, "proposal.md"), "# Existing Proposal\n", "utf8");
      const result = createRetroFollowUps(repo, "example");
      const project = result.changes.find((change) => change.id === "retro-example-01-project-docs-drift");
      assert(project?.status === "created", `Partial follow-up must be completed, got ${JSON.stringify(project)}.`);
      assert(fs.existsSync(path.join(partial, "tasks.md")), "Partial follow-up must get missing tasks.md.");
      const gate = evaluateRetroGate(repo, "example");
      assert(gate.valid, `Completed partial follow-up should satisfy retro gate, got ${JSON.stringify(gate.errors)}.`);
    }),
  },
  {
    name: "follow-up helper reports no writes for no actionable findings",
    run: () => withTempRepo("none", (repo) => {
      writeChange(repo, "example", retrospectiveWithFindings().replace("project-local", "none").replace("opencode-dev-kit", "none"));
      const result = createRetroFollowUps(repo, "example");
      assert(result.changes.length === 0, `No actionable targets must create no changes, got ${JSON.stringify(result.changes)}.`);
      assert(!result.retrospectiveUpdated, "No actionable targets must not update retrospective outputs.");
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
