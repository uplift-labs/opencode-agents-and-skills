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

- [x] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [x] Write \`retrospective.md\` with evidence, problems, root causes, improvements, and archive gate decision.
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

| Problem | Evidence | Impact | Root Cause | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- | --- |
| Project docs drift | README section stale | Reviewers miss current commands | README routing was not updated with the changed command contract | Create docs follow-up | high | project-local |
| Autopilot escape friction | ready_runtime_deferred repeated | Token waste | Escape-hatch guidance did not distinguish safe handoff from repeated no-progress calls | Improve reusable skill guidance | high | opencode-dev-kit |
| Fixed in scope | Reviewer finding patched | No remaining impact | Missing coverage was already addressed by the scoped fix | No follow-up needed | high | none |

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

function retrospectiveWithUnknownCause(changeId = "unknown"): string {
  return `# Retrospective: unknown

## Evidence Reviewed

- Tool outputs / validation: repeated failed validation without stable repro.

## Problems Found

| Problem | Evidence | Impact | Root Cause | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- | --- |
| Mystery failure | Repeated failed validation without stable repro | Agents cannot pick a safe fix | unknown | Investigate root cause with instrumentation before implementing a fix | medium | project-local |

## Outputs

- Project follow-up changes: none.
- \`opencode-dev-kit\` proposals/changes: none.
- No findings reason: Evidence reviewed before routing.

## Archive Gate Decision

- Decision: passed
- Reason: Unknown cause routed to investigation.
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
        const specPath = path.join(repo, change.path, "specs", change.id, "spec.md");
        const spec = fs.existsSync(specPath) ? fs.readFileSync(specPath, "utf8") : "";
        assert(spec.includes("## ADDED Requirements") && spec.includes("#### Scenario:"), `Missing valid spec delta for ${change.id}.`);
      }
      const projectProposal = fs.readFileSync(path.join(repo, "openspec", "changes", "retro-example-01-project-docs-drift", "proposal.md"), "utf8");
      assert(projectProposal.includes("Root cause: README routing was not updated with the changed command contract"), "Generated proposal must preserve the retrospective root cause.");
      const projectTasks = fs.readFileSync(path.join(repo, "openspec", "changes", "retro-example-01-project-docs-drift", "tasks.md"), "utf8");
      assert(projectTasks.includes("Confirm the retrospective root cause"), "Generated tasks must require root-cause confirmation before implementation.");
      const retrospective = fs.readFileSync(path.join(repo, "openspec", "changes", "example", "retrospective.md"), "utf8");
      assert(retrospective.includes("Project follow-up changes: `retro-example-01-project-docs-drift`."), "Project output must reference generated follow-up change.");
      assert(retrospective.includes("`opencode-dev-kit` proposals/changes: `retro-example-02-autopilot-escape-friction`."), "Reusable output must reference generated follow-up change.");
      assert(retrospective.includes("No findings reason: n/a."), "No-findings reason must be cleared when findings create changes.");
      const gate = evaluateRetroGate(repo, "example");
      assert(gate.valid && gate.archiveAllowed, `Generated follow-ups should satisfy retro gate, got ${JSON.stringify(gate.errors)}.`);
    }),
  },
  {
    name: "follow-up helper routes unknown root causes to investigation wording",
    run: () => withTempRepo("unknown", (repo) => {
      writeChange(repo, "investigate-case", retrospectiveWithUnknownCause("investigate-case"));
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
      assert(fs.existsSync(path.join(partial, "specs", "retro-example-01-project-docs-drift", "spec.md")), "Partial follow-up must get missing spec delta.");
      const gate = evaluateRetroGate(repo, "example");
      assert(gate.valid, `Completed partial follow-up should satisfy retro gate, got ${JSON.stringify(gate.errors)}.`);
    }),
  },
  {
    name: "follow-up helper adds missing spec to old generated changes",
    run: () => withTempRepo("missing-spec", (repo) => {
      writeChange(repo, "example");
      const existing = path.join(repo, "openspec", "changes", "retro-example-01-project-docs-drift");
      fs.mkdirSync(existing, { recursive: true });
      fs.writeFileSync(path.join(existing, "proposal.md"), "# Existing Proposal\n", "utf8");
      fs.writeFileSync(path.join(existing, "tasks.md"), "# Existing Tasks\n", "utf8");

      const result = createRetroFollowUps(repo, "example");
      const project = result.changes.find((change) => change.id === "retro-example-01-project-docs-drift");
      assert(project?.status === "created", `Missing spec follow-up must be repaired, got ${JSON.stringify(project)}.`);
      const updatedProposal = fs.readFileSync(path.join(existing, "proposal.md"), "utf8");
      assert(updatedProposal.includes("Root cause: README routing was not updated with the changed command contract"), "Existing proposal must be updated with current root cause evidence.");
      const updatedTasks = fs.readFileSync(path.join(existing, "tasks.md"), "utf8");
      assert(updatedTasks.includes("Confirm the retrospective root cause"), "Existing tasks must be updated with root-cause confirmation.");
      assert(fs.existsSync(path.join(existing, "specs", "retro-example-01-project-docs-drift", "spec.md")), "Old generated follow-up must get missing spec delta.");
      const gate = evaluateRetroGate(repo, "example");
      assert(gate.valid, `Repaired old follow-up should satisfy retro gate, got ${JSON.stringify(gate.errors)}.`);
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
