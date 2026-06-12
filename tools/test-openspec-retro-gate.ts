#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRetroGate } from "./openspec-retro-gate.ts";

type TestCase = {
  name: string;
  run: () => void;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function writeFollowUp(repo: string, changeId: string): void {
  const base = path.join(repo, "openspec", "changes", changeId);
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, "proposal.md"), `# Proposal: ${changeId}\n`, "utf8");
  fs.writeFileSync(path.join(base, "tasks.md"), `# Tasks: ${changeId}\n`, "utf8");
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

function noFindingsRetro(): string {
  return `# Retrospective: example

## Scope

- Change: \`example\`
- Archive decision: ready

## Evidence Reviewed

- OpenSpec artifacts: proposal, tasks, spec.
- Tool outputs / validation: npm test passed.
- Reviewer gates: not required, docs-only.
- Autopilot/runtime events: none.

## Problems Found

| Problem | Evidence | Impact | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- |

## Outputs

- Project follow-up changes: none.
- \`opencode-dev-kit\` proposals/changes: none.
- No findings reason: Evidence reviewed; no actionable process or quality findings.

## Archive Gate Decision

- Decision: passed
- Reason: No findings with evidence reviewed.
- Approver, if skipped: none
`;
}

function routedFindingsRetro(): string {
  return `# Retrospective: example

## Evidence Reviewed

- OpenSpec artifacts: proposal, design, tasks.
- Tool outputs / validation: npm test passed.
- Reviewer gates: instruction-artifact-reviewer passed.
- Autopilot/runtime events: ready_runtime_deferred, no_ledgers, no_actionable_tasks, stale evidence, evidence conflict.

## Problems Found

| Problem | Evidence | Impact | Recommendation | Confidence | Target |
| --- | --- | --- | --- | --- | --- |
| Project docs drift | README section stale | Reviewers miss current commands | Create follow-up | high | project-local |
| Autopilot escape friction | ready_runtime_deferred repeated | Token waste | Improve reusable skill guidance | high | opencode-dev-kit |

## Outputs

- Project follow-up changes: \`retro-example-01-project-docs-drift\`.
- \`opencode-dev-kit\` proposals/changes: \`retro-example-02-autopilot-escape-friction\`.
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
    name: "retro gate fails when retrospective is missing",
    run: () => withTempRepo("missing-retro", (repo) => {
      writeChange(repo, "example", { "tasks.md": tasksWithRetro() });
      const result = evaluateRetroGate(repo, "example");
      assert(!result.valid, "Missing retrospective.md must fail the retro gate.");
      assert(!result.archiveAllowed, "Missing retrospective.md must block archive.");
      assertErrorIncludes(result.errors, "retrospective.md");
    }),
  },
  {
    name: "retro gate fails when tasks lack final retrospective section",
    run: () => withTempRepo("missing-final-task", (repo) => {
      writeChange(repo, "example", {
        "tasks.md": "# Tasks\n\n## Implementation\n\n- [x] Do the work.\n",
        "retrospective.md": noFindingsRetro(),
      });
      const result = evaluateRetroGate(repo, "example");
      assert(!result.valid, "Missing final retrospective task section must fail the retro gate.");
      assertErrorIncludes(result.errors, "Retrospective Before Archive");
    }),
  },
  {
    name: "retro gate accepts concise no-findings retrospective",
    run: () => withTempRepo("no-findings", (repo) => {
      writeChange(repo, "example", {
        "tasks.md": tasksWithRetro(),
        "retrospective.md": noFindingsRetro(),
      });
      const result = evaluateRetroGate(repo, "example");
      assert(result.valid, `No-findings retrospective should pass, got ${JSON.stringify(result.errors)}.`);
      assert(result.archiveAllowed, "No-findings retrospective should allow archive.");
    }),
  },
  {
    name: "retro gate validates approved skip reason and approver",
    run: () => withTempRepo("approved-skip", (repo) => {
      writeChange(repo, "example", {
        "tasks.md": tasksWithRetro(),
        "retrospective.md": noFindingsRetro().replace("- Decision: passed", "- Decision: approved-skip").replace("- Approver, if skipped: none", "- Approver, if skipped: product-owner"),
      });
      const accepted = evaluateRetroGate(repo, "example");
      assert(accepted.valid && accepted.archiveAllowed, `Approved skip with reason and approver should pass, got ${JSON.stringify(accepted.errors)}.`);

      writeChange(repo, "broken", {
        "tasks.md": tasksWithRetro(),
        "retrospective.md": noFindingsRetro().replace("- Decision: passed", "- Decision: approved-skip").replace("- Reason: No findings with evidence reviewed.", "- Reason: "),
      });
      const rejected = evaluateRetroGate(repo, "broken");
      assert(!rejected.valid, "Approved skip without reason/approver must fail.");
      assertErrorIncludes(rejected.errors, "approved skip");

      writeChange(repo, "missing-approver", {
        "tasks.md": tasksWithRetro(),
        "retrospective.md": noFindingsRetro().replace("- Decision: passed", "- Decision: approved-skip"),
      });
      const missingApprover = evaluateRetroGate(repo, "missing-approver");
      assert(!missingApprover.valid, "Approved skip with missing approver must fail.");
      assertErrorIncludes(missingApprover.errors, "approved skip");
    }),
  },
  {
    name: "retro gate requires durable routing for findings",
    run: () => withTempRepo("finding-routing", (repo) => {
      writeChange(repo, "example", {
        "tasks.md": tasksWithRetro(),
        "retrospective.md": routedFindingsRetro(),
      });
      writeFollowUp(repo, "retro-example-01-project-docs-drift");
      writeFollowUp(repo, "retro-example-02-autopilot-escape-friction");
      const accepted = evaluateRetroGate(repo, "example");
      assert(accepted.valid && accepted.archiveAllowed, `Routed findings should pass, got ${JSON.stringify(accepted.errors)}.`);

      writeChange(repo, "broken", {
        "tasks.md": tasksWithRetro(),
        "retrospective.md": routedFindingsRetro()
          .replace("- Project follow-up changes: `retro-example-01-project-docs-drift`.", "- Project follow-up changes: none.")
          .replace("- `opencode-dev-kit` proposals/changes: `retro-example-02-autopilot-escape-friction`.", "- `opencode-dev-kit` proposals/changes: none."),
      });
      const rejected = evaluateRetroGate(repo, "broken");
      assert(!rejected.valid, "Unrouted findings must fail.");
      assertErrorIncludes(rejected.errors, "Project-local retrospective findings");
      assertErrorIncludes(rejected.errors, "opencode-dev-kit retrospective findings");

      writeChange(repo, "missing-follow-up", {
        "tasks.md": tasksWithRetro(),
        "retrospective.md": routedFindingsRetro()
          .replace("`retro-example-01-project-docs-drift`", "`missing-project-follow-up`")
          .replace("`retro-example-02-autopilot-escape-friction`", "`missing-devkit-follow-up`"),
      });
      const missingFollowUp = evaluateRetroGate(repo, "missing-follow-up");
      assert(!missingFollowUp.valid, "Referenced follow-up changes must exist before archive.");
      assertErrorIncludes(missingFollowUp.errors, "must exist with proposal.md and tasks.md");

      writeChange(repo, "missing-row", {
        "tasks.md": tasksWithRetro(),
        "retrospective.md": routedFindingsRetro()
          .replace("| Autopilot escape friction | ready_runtime_deferred repeated | Token waste | Improve reusable skill guidance | high | opencode-dev-kit |", "| More project drift | repeated manual report edits | Token waste | Create another project follow-up | high | project-local |")
          .replace("- Project follow-up changes: `retro-example-01-project-docs-drift`.", "- Project follow-up changes: `retro-example-01-project-docs-drift`.")
          .replace("- `opencode-dev-kit` proposals/changes: `retro-example-02-autopilot-escape-friction`.", "- `opencode-dev-kit` proposals/changes: none."),
      });
      const missingRow = evaluateRetroGate(repo, "missing-row");
      assert(!missingRow.valid, "Every actionable row must reference its generated follow-up change, not just one per target.");
      assertErrorIncludes(missingRow.errors, "must reference generated follow-up");

      writeChange(repo, "malformed", {
        "tasks.md": tasksWithRetro(),
        "retrospective.md": routedFindingsRetro().replace("| Project docs drift | README section stale | Reviewers miss current commands | Create follow-up | high | project-local |", "| Project docs drift |  | Reviewers miss current commands |  |  | project |"),
      });
      const malformed = evaluateRetroGate(repo, "malformed");
      assert(!malformed.valid, "Malformed finding rows and unknown targets must fail.");
      assertErrorIncludes(malformed.errors, "problem rows");
      assertErrorIncludes(malformed.errors, "finding target");

      writeChange(repo, "wrong-columns", {
        "tasks.md": tasksWithRetro(),
        "retrospective.md": routedFindingsRetro().replace("| Autopilot escape friction | ready_runtime_deferred repeated | Token waste | Improve reusable skill guidance | high | opencode-dev-kit |", "| Autopilot escape friction | ready_runtime_deferred repeated | Token waste | opencode-dev-kit |"),
      });
      const wrongColumns = evaluateRetroGate(repo, "wrong-columns");
      assert(!wrongColumns.valid, "Structurally malformed finding rows must fail.");
      assertErrorIncludes(wrongColumns.errors, "six columns");
    }),
  },
  {
    name: "retro gate validates safe ids and final-section scoped wording",
    run: () => withTempRepo("safe-id-and-final-section", (repo) => {
      writeChange(repo, "example", {
        "tasks.md": `# Tasks\n\n## Earlier\n\n- Mention retrospective.md, project-local OpenSpec, opencode-dev-kit, and archive gate here.\n\n## Retrospective Before Archive\n\n- [ ] Write \`retrospective.md\`.\n`,
        "retrospective.md": noFindingsRetro(),
      });
      const unsafe = evaluateRetroGate(repo, "bad/../id");
      assert(!unsafe.valid, "Unsafe change id must fail.");
      assertErrorIncludes(unsafe.errors, "Invalid change id");
      const scoped = evaluateRetroGate(repo, "example");
      assert(!scoped.valid, "Required wording outside the final retro section must not satisfy the gate.");
      assertErrorIncludes(scoped.errors, "project-local OpenSpec");
      assertErrorIncludes(scoped.errors, "opencode-dev-kit");
    }),
  },
  {
    name: "OpenSpec workflow skills document retrospective gate",
    run: () => {
      const archive = readRepoText(".opencode/skills/openspec-archive-change/SKILL.md");
      const propose = readRepoText(".opencode/skills/openspec-propose/SKILL.md");
      const apply = readRepoText(".opencode/skills/openspec-apply-change/SKILL.md");
      const autopilot = readRepoText(".opencode/skills/openspec-autopilot/SKILL.md");
      const nextStep = readRepoText(".opencode/skills/next-step/SKILL.md");

      assert(archive.includes("openspec:retro-followups") && archive.includes("openspec:retro-gate") && archive.includes("retrospective.md") && archive.includes("approved skip"), "openspec-archive-change must enforce follow-up generation, the retro gate, and approved skip path.");
      assert(propose.includes("## Retrospective Before Archive") && propose.includes("Write `retrospective.md`"), "openspec-propose must include the final retrospective task template.");
      assert(propose.includes("openspec:retro-followups"), "openspec-propose must include follow-up generation in the final retrospective task template.");
      assert(apply.includes("retrospective.md") && apply.includes("openspec:retro-followups") && apply.includes("before archive"), "openspec-apply-change must hand completed changes to follow-up generation and the retrospective gate before archive.");
      assert(autopilot.includes("retrospective.md") && autopilot.includes("openspec:retro-followups") && autopilot.includes("archive gate"), "openspec-autopilot must treat missing retrospectives/follow-ups as an acceptance/archive blocker.");
      assert(nextStep.includes("completed-but-not-retroed") && nextStep.includes("Retrospective Before Archive"), "next-step must surface completed-but-not-retroed changes as available work.");
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
