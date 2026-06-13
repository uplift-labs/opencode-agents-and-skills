#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RetroFindingTarget = "project-local" | "opencode-dev-kit" | "none";

export type RetroFinding = {
  problem: string;
  evidence: string;
  impact: string;
  rootCause: string;
  recommendation: string;
  confidence: string;
  target: RetroFindingTarget;
};

export type RetroFollowUpChange = {
  id: string;
  target: RetroFindingTarget;
  status: "created" | "existing" | "skipped";
  path: string;
  problem: string;
};

export type RetroFollowUpResult = {
  changeId: string;
  changes: RetroFollowUpChange[];
  retrospectiveUpdated: boolean;
};

type CliOptions = {
  root: string;
  changeId?: string;
  format: "json" | "text";
  dryRun: boolean;
};

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function safeChangeId(changeId: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(changeId) && !changeId.includes("..") && !changeId.includes("/") && !changeId.includes("\\");
}

function slug(value: string): string {
  const slugged = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slugged.length > 0 ? slugged.slice(0, 48).replace(/-+$/g, "") : "finding";
}

function section(text: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^##\\s+${escaped}\\s*$\\n(?<body>[\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "m"));
  return match?.groups?.body ?? null;
}

function parseProblemRows(problemSection: string | null): RetroFinding[] {
  if (problemSection == null) {
    return [];
  }
  return problemSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .filter((line) => !/^\|\s*-+\s*\|/.test(line) && !/^\|\s*Problem\s*\|/i.test(line))
    .flatMap((line): RetroFinding[] => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.length !== 7) {
        return [];
      }
      const target = cells[6] as RetroFindingTarget;
      if (target !== "project-local" && target !== "opencode-dev-kit" && target !== "none") {
        return [];
      }
      return [{ problem: cells[0], evidence: cells[1], impact: cells[2], rootCause: cells[3], recommendation: cells[4], confidence: cells[5], target }];
    });
}

function normalizedCell(value: string): string {
  return value.trim().toLowerCase().replace(/[.。]+$/, "");
}

function isUnknownRootCause(value: string): boolean {
  return normalizedCell(value) === "unknown";
}

function taskTail(): string {
  return `## Retrospective Before Archive

- [ ] Review the completed change context, validation, reviewer gates, blockers, repeated work, wait time, token-heavy steps, and likely root causes.
- [ ] Write \`retrospective.md\` with evidence, problems, root causes, improvements, and archive gate decision.
- [ ] Create or update project-local OpenSpec follow-up changes for project-local findings.
- [ ] For reusable findings, create or update \`opencode-dev-kit\` OpenSpec proposals/changes only when the current repository owns them; otherwise record a local handoff and do not write cross-repo without explicit approval.
- [ ] Run \`npm run openspec:retro-followups -- <change-id>\` when available so actionable retrospective findings create or update follow-up OpenSpec changes before archive.
- [ ] Confirm archive is allowed only after the retro gate passes or an approved skip reason is recorded.
`;
}

function proposalText(sourceChangeId: string, finding: RetroFinding): string {
  const action = isUnknownRootCause(finding.rootCause)
    ? `Investigate the unknown root cause before implementing or documenting: ${finding.recommendation}`
    : `Address the root cause by implementing or documenting: ${finding.recommendation}`;
  return `# Proposal: ${finding.problem}

## Why

This follow-up was generated from \`${sourceChangeId}\` retrospective evidence.

- Problem: ${finding.problem}
- Evidence: ${finding.evidence}
- Impact: ${finding.impact}
- Root cause: ${finding.rootCause}
- Confidence: ${finding.confidence}
- Target: ${finding.target}

## What Changes

- ${action}
- Preserve the source retrospective link so archive review can trace why this follow-up exists.

## Non-Goals

- Do not expand beyond the retrospective finding without a separate OpenSpec decision.
- Do not write cross-repo artifacts unless this repository owns the reusable artifact or the user explicitly approves that scope.

## Validation

- Define focused validation in \`tasks.md\` before implementation.
`;
}

function tasksText(sourceChangeId: string, finding: RetroFinding): string {
  const rootCauseTask = isUnknownRootCause(finding.rootCause)
    ? `Investigate and document the root cause before designing the fix: ${finding.recommendation}`
    : `Confirm the retrospective root cause is still correct or update it before designing the fix: ${finding.rootCause}`;
  return `# Tasks: ${finding.problem}

## Follow-Up Scope

- [ ] Confirm the retrospective finding from \`${sourceChangeId}\` is still current.
- [ ] ${rootCauseTask}
- [ ] Define the smallest implementation or documentation slice for: ${finding.recommendation}
- [ ] Add or update the focused test, fixture, validator, or review evidence needed for this finding.
- [ ] Implement the minimal change and update docs/specs if behavior changes.

## Validation

- [ ] Run the focused validation command for this change.
- [ ] Run \`openspec validate --all\`.

${taskTail()}`;
}

function specText(changeId: string, sourceChangeId: string, finding: RetroFinding): string {
  const rootCauseRequirement = isUnknownRootCause(finding.rootCause)
    ? "the investigation records the discovered root cause before remediation"
    : `the follow-up preserves root cause: ${finding.rootCause}`;
  return `# ${changeId} Specification

## ADDED Requirements

### Requirement: Retrospective Finding Follow-Up Is Scoped

This follow-up SHALL resolve, validate, or explicitly reject the retrospective finding generated from \`${sourceChangeId}\` without expanding beyond the recorded root cause and recommendation unless a separate OpenSpec decision broadens scope.

#### Scenario: Finding is reassessed before implementation

- **GIVEN** the follow-up change is selected for implementation
- **WHEN** the implementer starts work on the generated finding
- **THEN** they review the original problem, evidence, impact, root cause, recommendation, confidence, and target
- **AND** ${rootCauseRequirement}
- **AND** they either implement the smallest valid slice for: ${finding.recommendation}
- **OR** record evidence that the finding is no longer current before closing the change.
`;
}

function outputLineMarker(target: RetroFindingTarget): string | null {
  if (target === "project-local") {
    return "Project follow-up changes";
  }
  if (target === "opencode-dev-kit") {
    return "opencode-dev-kit";
  }
  return null;
}

function replaceOutputLine(retrospective: string, marker: string, ids: string[]): string {
  const renderedIds = ids.length > 0 ? ids.map((id) => `\`${id}\``).join(", ") : "none";
  const lines = retrospective.split("\n");
  const index = lines.findIndex((line) => line.toLowerCase().includes(marker.toLowerCase()) && line.includes(":"));
  if (index >= 0) {
    const prefix = lines[index].slice(0, lines[index].indexOf(":") + 1);
    lines[index] = `${prefix} ${renderedIds}.`;
  }
  return lines.join("\n");
}

function replaceNoFindings(retrospective: string, createdCount: number): string {
  if (createdCount === 0) {
    return retrospective;
  }
  const lines = retrospective.split("\n");
  const index = lines.findIndex((line) => line.toLowerCase().includes("no findings reason") && line.includes(":"));
  if (index >= 0) {
    const prefix = lines[index].slice(0, lines[index].indexOf(":") + 1);
    lines[index] = `${prefix} n/a.`;
  }
  return lines.join("\n");
}

function updateRetrospectiveOutputs(retrospective: string, changes: RetroFollowUpChange[]): string {
  let updated = retrospective;
  for (const target of ["project-local", "opencode-dev-kit"] as const) {
    const marker = outputLineMarker(target);
    if (marker == null) {
      continue;
    }
    const ids = changes.filter((change) => change.target === target && change.status !== "skipped").map((change) => change.id);
    if (ids.length > 0) {
      updated = replaceOutputLine(updated, marker, ids);
    }
  }
  return replaceNoFindings(updated, changes.filter((change) => change.status !== "skipped").length);
}

function followUpId(sourceChangeId: string, finding: RetroFinding, index: number): string {
  return `retro-${slug(sourceChangeId)}-${String(index + 1).padStart(2, "0")}-${slug(finding.problem)}`.slice(0, 96).replace(/-+$/g, "");
}

function fileNeedsWrite(filePath: string, expected: string, requiredFragments: string[]): boolean {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return true;
  }
  const current = normalizeText(fs.readFileSync(filePath, "utf8"));
  return requiredFragments.some((fragment) => !current.includes(fragment)) || current !== expected;
}

export function createRetroFollowUps(root: string, changeId: string, options: { dryRun?: boolean } = {}): RetroFollowUpResult {
  if (!safeChangeId(changeId)) {
    throw new Error(`Invalid change id '${changeId}'.`);
  }
  const changeRoot = path.join(root, "openspec", "changes", changeId);
  const retrospectivePath = path.join(changeRoot, "retrospective.md");
  if (!fs.existsSync(retrospectivePath) || !fs.statSync(retrospectivePath).isFile()) {
    throw new Error(`Missing retrospective.md for ${changeId}.`);
  }
  const retrospective = normalizeText(fs.readFileSync(retrospectivePath, "utf8"));
  const findings = parseProblemRows(section(retrospective, "Problems Found"));
  const actionableFindings = findings.filter((finding) => finding.target !== "none");
  const changes: RetroFollowUpChange[] = [];

  actionableFindings.forEach((finding, index) => {
    const id = followUpId(changeId, finding, index);
    const followUpRoot = path.join(root, "openspec", "changes", id);
    const proposalPath = path.join(followUpRoot, "proposal.md");
    const tasksPath = path.join(followUpRoot, "tasks.md");
    const specPath = path.join(followUpRoot, "specs", id, "spec.md");
    const proposal = proposalText(changeId, finding);
    const tasks = tasksText(changeId, finding);
    const spec = specText(id, changeId, finding);
    const taskRootCauseFragment = isUnknownRootCause(finding.rootCause) ? "Investigate and document the root cause" : finding.rootCause;
    const specRootCauseFragment = isUnknownRootCause(finding.rootCause) ? "discovered root cause" : finding.rootCause;
    const proposalNeedsWrite = fileNeedsWrite(proposalPath, proposal, [finding.problem, finding.evidence, finding.impact, finding.rootCause, finding.recommendation]);
    const tasksNeedsWrite = fileNeedsWrite(tasksPath, tasks, [taskRootCauseFragment, finding.recommendation]);
    const specNeedsWrite = fileNeedsWrite(specPath, spec, ["## ADDED Requirements", "#### Scenario:", specRootCauseFragment, finding.recommendation]);
    const needsWrite = proposalNeedsWrite || tasksNeedsWrite || specNeedsWrite;
    changes.push({ id, target: finding.target, status: needsWrite ? "created" : "existing", path: normalizeText(path.relative(root, followUpRoot)).replaceAll("\\", "/"), problem: finding.problem });
    if (needsWrite && options.dryRun !== true) {
      fs.mkdirSync(followUpRoot, { recursive: true });
      if (proposalNeedsWrite) {
        fs.writeFileSync(proposalPath, proposal, "utf8");
      }
      if (tasksNeedsWrite) {
        fs.writeFileSync(tasksPath, tasks, "utf8");
      }
      if (specNeedsWrite) {
        fs.mkdirSync(path.dirname(specPath), { recursive: true });
        fs.writeFileSync(specPath, spec, "utf8");
      }
    }
  });

  const updatedRetrospective = updateRetrospectiveOutputs(retrospective, changes);
  const retrospectiveUpdated = updatedRetrospective !== retrospective;
  if (retrospectiveUpdated && options.dryRun !== true) {
    fs.writeFileSync(retrospectivePath, updatedRetrospective, "utf8");
  }
  return { changeId, changes, retrospectiveUpdated };
}

function defaultRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { root: process.cwd(), format: "json", dryRun: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--root") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --root.");
      }
      options.root = path.resolve(value);
      index++;
    } else if (arg === "--format") {
      const value = args[index + 1];
      if (value !== "json" && value !== "text") {
        throw new Error("--format must be json or text.");
      }
      options.format = value;
      index++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (options.changeId == null) {
      options.changeId = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

function renderText(result: RetroFollowUpResult): string {
  const lines = [`changeId: ${result.changeId}`, `retrospectiveUpdated: ${String(result.retrospectiveUpdated)}`];
  for (const change of result.changes) {
    lines.push(`${change.status}: ${change.id} (${change.target})`);
  }
  return `${lines.join("\n")}\n`;
}

function runCli(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.changeId == null) {
      throw new Error("Usage: node tools/openspec-retro-followups.ts <change-id> [--root <repo>] [--format json|text] [--dry-run]");
    }
    const result = createRetroFollowUps(options.root || defaultRoot(), options.changeId, { dryRun: options.dryRun });
    process.stdout.write(options.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderText(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
