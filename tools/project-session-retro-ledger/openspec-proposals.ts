import fs from "node:fs";
import path from "node:path";
import type { ProjectSessionRetroLedger, ProjectSessionRetroPlan, ProjectSessionRetroProposalResult, ProjectSessionRetroRootCause, ProjectSessionRetroTrend } from "./types.ts";
import { refreshAnalysisProgress } from "./progress.ts";
import { fileNeedsWrite, isNonEmptyString, relativePosix, safeChangeId, slug } from "./utils.ts";
import { validateProjectSessionRetroLedger } from "./validator.ts";

type PreparedProposal = {
  causeId: string;
  changeRoot: string;
  id: string;
  needsWrite: boolean;
  path: string;
  plan: ProjectSessionRetroPlan;
  planId: string;
  proposal: string;
  proposalNeedsWrite: boolean;
  spec: string;
  specNeedsWrite: boolean;
  status: ProjectSessionRetroProposalResult["changes"][number]["status"];
  tasks: string;
  tasksNeedsWrite: boolean;
};

function generatedChangeId(planId: string, plan: ProjectSessionRetroPlan, index: number): string {
  return `project-session-retro-${String(index + 1).padStart(2, "0")}-${slug(planId)}-${slug(plan.goal)}`.slice(0, 96).replace(/-+$/g, "");
}

function proposalText(changeId: string, planId: string, plan: ProjectSessionRetroPlan, cause: ProjectSessionRetroRootCause, trend: ProjectSessionRetroTrend | undefined): string {
  const action = plan.kind === "investigation"
    ? `Investigate root cause before remediation: ${plan.approach}`
    : `Address or preserve the root cause through the planned minimal change: ${plan.approach}`;
  return `# Proposal: ${plan.goal}

## Why

Project session retrospective evidence promoted a repeated trend into a root-cause-backed plan.

- Change id: ${changeId}
- Plan id: ${planId}
- Plan kind: ${plan.kind}
- Trend: ${trend?.summary ?? "unknown"}
- Root cause: ${cause.summary}
- Root cause status: ${cause.status}
- Recurrence path: ${cause.recurrencePath}

## What Changes

- ${action}
- Preserve the retrospective chain from session observations to trend, root cause, plan, and OpenSpec follow-up.

## Scope

${plan.implementationSlices.map((slice) => `- ${slice}`).join("\n")}

## Non-Goals

- Do not expand beyond the recorded root cause without another OpenSpec decision.
- Do not treat an unknown root cause as a guessed fix.

## Acceptance Criteria

${plan.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")}

## Validation

${plan.validation.map((command) => `- ${command}`).join("\n")}
`;
}

function tasksText(plan: ProjectSessionRetroPlan, cause: ProjectSessionRetroRootCause): string {
  const rootCauseTask = plan.kind === "investigation"
    ? `Investigate and document the root cause before designing remediation: ${cause.summary}`
    : `Confirm the retrospective root cause is still correct: ${cause.summary}`;
  return `# Tasks: ${plan.goal}

## Follow-Up Scope

- [ ] Confirm the project-session retrospective evidence is still current.
- [ ] ${rootCauseTask}
- [ ] Add or update the focused test, fixture, validator, or review evidence needed for this plan.
- [ ] Implement the smallest slice that satisfies the acceptance criteria.
- [ ] Update affected skill, agent, README, or validation docs when behavior changes.

## Validation

${plan.validation.map((command) => `- [ ] Run \`${command}\`.`).join("\n")}
- [ ] Run ` + "`openspec validate --all`" + ` when OpenSpec files are present.
`;
}

function specText(changeId: string, plan: ProjectSessionRetroPlan, cause: ProjectSessionRetroRootCause): string {
  const rootCauseRequirement = plan.kind === "investigation"
    ? "the investigation records the discovered root cause before remediation"
    : `the follow-up preserves root cause: ${cause.summary}`;
  return `# ${changeId} Specification

## ADDED Requirements

### Requirement: Project Session Retrospective Follow-Up Is Traceable

The follow-up SHALL resolve, validate, or intentionally reject the project-session retrospective plan without losing the observation-to-trend-to-root-cause chain.

#### Scenario: Follow-up starts from retrospective plan

- **GIVEN** the follow-up change is selected for implementation
- **WHEN** the implementer starts work
- **THEN** they review the original trend, root cause, recurrence path, plan goal, and acceptance criteria
- **AND** ${rootCauseRequirement}
- **AND** they implement or investigate the smallest valid slice for: ${plan.goal}.
`;
}

export function createProjectSessionRetroProposals(root: string, ledger: ProjectSessionRetroLedger, options: { dryRun?: boolean } = {}): ProjectSessionRetroProposalResult {
  const updated = JSON.parse(JSON.stringify(ledger)) as ProjectSessionRetroLedger;
  const changes: ProjectSessionRetroProposalResult["changes"] = [];
  const prepared: PreparedProposal[] = [];
  const rootPath = path.resolve(root);
  const planEntries = Object.entries(updated.plans).sort(([left], [right]) => left.localeCompare(right));
  planEntries.forEach(([planId, plan], index) => {
    const cause = updated.rootCauses[plan.causeId];
    if (!cause) {
      changes.push({ causeId: plan.causeId, id: plan.openspecChangeId ?? generatedChangeId(planId, plan, index), path: "", planId, status: "blocked" });
      return;
    }
    const trend = updated.trends[cause.trendId];
    const changeId = isNonEmptyString(plan.openspecChangeId) ? plan.openspecChangeId : generatedChangeId(planId, plan, index);
    if (!safeChangeId(changeId)) {
      plan.openspecChangeId = changeId;
      updated.openspecProposals[changeId] = { path: "", planId, status: "blocked" };
      changes.push({ causeId: plan.causeId, id: changeId, path: "", planId, status: "blocked" });
      return;
    }
    const changeRoot = path.join(rootPath, "openspec", "changes", changeId);
    const proposalPath = path.join(changeRoot, "proposal.md");
    const tasksPath = path.join(changeRoot, "tasks.md");
    const specPath = path.join(changeRoot, "specs", changeId, "spec.md");
    const proposal = proposalText(changeId, planId, plan, cause, trend);
    const tasks = tasksText(plan, cause);
    const spec = specText(changeId, plan, cause);
    const proposalNeedsWrite = fileNeedsWrite(proposalPath, [plan.goal, plan.approach, cause.summary, cause.recurrencePath]);
    const tasksNeedsWrite = fileNeedsWrite(tasksPath, [plan.goal, cause.summary, "Add or update the focused test, fixture, validator, or review evidence"]);
    const specNeedsWrite = fileNeedsWrite(specPath, ["## ADDED Requirements", "#### Scenario:", plan.goal, plan.kind === "investigation" ? "discovered root cause" : cause.summary]);
    const needsWrite = proposalNeedsWrite || tasksNeedsWrite || specNeedsWrite;
    const status = needsWrite ? "draft" : "existing";
    plan.openspecChangeId = changeId;
    updated.openspecProposals[changeId] = { path: relativePosix(rootPath, changeRoot), planId, status };
    prepared.push({ causeId: plan.causeId, changeRoot, id: changeId, needsWrite, path: relativePosix(rootPath, changeRoot), plan, planId, proposal, proposalNeedsWrite, spec, specNeedsWrite, status, tasks, tasksNeedsWrite });
  });
  const hasBlockedChange = changes.some((change) => change.status === "blocked");
  for (const item of prepared) {
    item.plan.openspecChangeId = item.id;
    updated.openspecProposals[item.id] = { path: item.path, planId: item.planId, status: item.status };
    changes.push({ causeId: item.causeId, id: item.id, path: item.path, planId: item.planId, status: item.status });
  }
  const preflightLedger = refreshAnalysisProgress(updated);
  const preflightValidation = validateProjectSessionRetroLedger(preflightLedger, { requireProposals: false, root: rootPath });
  if (options.dryRun === true || hasBlockedChange || preflightValidation.errors.length > 0) {
    preflightLedger.validation = { errors: preflightValidation.errors, warnings: preflightValidation.warnings };
    return { changes, ledger: preflightLedger };
  }
  for (const item of prepared) {
    const status = item.needsWrite ? "created" : "existing";
    updated.openspecProposals[item.id] = { path: item.path, planId: item.planId, status };
    const change = changes.find((entry) => entry.planId === item.planId);
    if (change) {
      change.status = status;
    }
    if (item.needsWrite) {
      const proposalPath = path.join(item.changeRoot, "proposal.md");
      const tasksPath = path.join(item.changeRoot, "tasks.md");
      const specPath = path.join(item.changeRoot, "specs", item.id, "spec.md");
      fs.mkdirSync(item.changeRoot, { recursive: true });
      if (item.proposalNeedsWrite) {
        fs.writeFileSync(proposalPath, item.proposal, "utf8");
      }
      if (item.tasksNeedsWrite) {
        fs.writeFileSync(tasksPath, item.tasks, "utf8");
      }
      if (item.specNeedsWrite) {
        fs.mkdirSync(path.dirname(specPath), { recursive: true });
        fs.writeFileSync(specPath, item.spec, "utf8");
      }
    }
  }
  const refreshed = refreshAnalysisProgress(updated);
  const validation = validateProjectSessionRetroLedger(refreshed, { requireProposals: options.dryRun !== true, root: rootPath });
  refreshed.validation = { errors: validation.errors, warnings: validation.warnings };
  return { changes, ledger: refreshed };
}
