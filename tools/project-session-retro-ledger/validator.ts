import fs from "node:fs";
import path from "node:path";
import type { ProjectSessionRetroLedger, ProjectSessionRetroPlan, ProjectSessionRetroProposal, ProjectSessionRetroRootCause, ProjectSessionRetroTrend, ProjectSessionRetroValidationOptions, ProjectSessionRetroValidationResult } from "./types.ts";
import { computeAnalysisProgress } from "./progress.ts";
import { hasOnlyKnownValues, isNonEmptyString, isPlainRecord, safeChangeId, TOOL_NAME } from "./utils.ts";

function validateStringArray(value: unknown, label: string, errors: string[]): string[] {
  if (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item))) {
    errors.push(`${label} must be an array of non-empty strings.`);
    return [];
  }
  return value;
}

function validateSources(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("sources must be an array.");
    return;
  }
  value.forEach((source, index) => {
    if (!isPlainRecord(source)) {
      errors.push(`sources[${index}] must be an object.`);
      return;
    }
    if (source.type !== "sqlite-opencode-db") {
      errors.push(`sources[${index}].type must be sqlite-opencode-db.`);
    }
    if (!isNonEmptyString(source.sourceRef)) {
      errors.push(`sources[${index}].sourceRef must be non-empty.`);
    }
    if (!isNonEmptyString(source.status)) {
      errors.push(`sources[${index}].status must be non-empty.`);
    }
    if (typeof source.readable !== "boolean") {
      errors.push(`sources[${index}].readable must be boolean.`);
    }
    validateStringArray(source.schemaTables, `sources[${index}].schemaTables`, errors);
    for (const field of ["sessionsRead", "includedSessions"]) {
      if (!Number.isInteger(source[field]) || Number(source[field]) < 0) {
        errors.push(`sources[${index}].${field} must be a non-negative integer.`);
      }
    }
    validateStringArray(source.warnings, `sources[${index}].warnings`, errors);
  });
}

function validateScope(ledger: Record<string, unknown>, sessionCount: number, errors: string[], warnings: string[]): void {
  if (!isPlainRecord(ledger.scope)) {
    errors.push("scope must be an object.");
    return;
  }
  if (ledger.scope.mode !== "current-project") {
    errors.push("scope.mode must be current-project.");
  }
  if (ledger.scope.source !== "opencode-db") {
    errors.push("scope.source must be opencode-db.");
  }
  if (!isNonEmptyString(ledger.scope.projectRootRef)) {
    errors.push("scope.projectRootRef must be non-empty.");
  }
  if (!Number.isInteger(ledger.scope.sessionCount) || Number(ledger.scope.sessionCount) < 0) {
    errors.push("scope.sessionCount must be a non-negative integer.");
  } else if (ledger.scope.sessionCount !== sessionCount) {
    warnings.push("scope.sessionCount does not match sessions object size.");
  }
  if (!isPlainRecord(ledger.scope.dateRange)) {
    errors.push("scope.dateRange must be an object.");
  }
}

function validateSessionObservations(sessions: Record<string, unknown>, errors: string[]): Set<string> {
  const observationRefs = new Set<string>();
  for (const [sessionRef, sessionValue] of Object.entries(sessions)) {
    if (!isPlainRecord(sessionValue)) {
      errors.push(`sessions.${sessionRef} must be an object.`);
      continue;
    }
    if (!isPlainRecord(sessionValue.metadata)) {
      errors.push(`sessions.${sessionRef}.metadata must be an object.`);
    } else {
      validateSessionMetadata(sessionRef, sessionValue.metadata, errors);
    }
    const coverage = sessionValue.coverage;
    if (!isPlainRecord(coverage) || !hasOnlyKnownValues(coverage.status, ["complete", "partial", "blocked"])) {
      errors.push(`sessions.${sessionRef}.coverage.status must be complete, partial, or blocked.`);
    }
    if (isPlainRecord(coverage)) {
      validateStringArray(coverage.limits, `sessions.${sessionRef}.coverage.limits`, errors);
    }
    if (!Array.isArray(sessionValue.observations)) {
      errors.push(`sessions.${sessionRef}.observations must be an array.`);
      continue;
    }
    const localObservationIds = new Set<string>();
    sessionValue.observations.forEach((observation, index) => {
      if (!isPlainRecord(observation)) {
        errors.push(`sessions.${sessionRef}.observations[${index}] must be an object.`);
        return;
      }
      if (!isNonEmptyString(observation.id)) {
        errors.push(`sessions.${sessionRef}.observations[${index}].id must be a non-empty string.`);
        return;
      }
      if (localObservationIds.has(observation.id)) {
        errors.push(`sessions.${sessionRef}.observations duplicate id ${observation.id}.`);
      }
      localObservationIds.add(observation.id);
      observationRefs.add(`${sessionRef}#${observation.id}`);
      if (!hasOnlyKnownValues(observation.polarity, ["positive", "negative"])) {
        errors.push(`sessions.${sessionRef}.observations.${observation.id}.polarity must be positive or negative.`);
      }
      if (!isNonEmptyString(observation.summary)) {
        errors.push(`sessions.${sessionRef}.observations.${observation.id}.summary must be non-empty.`);
      }
      validateStringArray(observation.evidenceRefs, `sessions.${sessionRef}.observations.${observation.id}.evidenceRefs`, errors);
      if (!hasOnlyKnownValues(observation.impact, ["low", "medium", "high"]) || !hasOnlyKnownValues(observation.confidence, ["low", "medium", "high"])) {
        errors.push(`sessions.${sessionRef}.observations.${observation.id} impact and confidence must be low, medium, or high.`);
      }
      const hasMainAgentLearning = isPlainRecord(observation.mainAgentLearning);
      const hasReviewerLearning = isPlainRecord(observation.reviewerLearning);
      if (observation.polarity === "negative" && !hasMainAgentLearning && !hasReviewerLearning) {
        errors.push(`sessions.${sessionRef}.observations.${observation.id} negative observations must include mainAgentLearning or reviewerLearning.`);
      }
      if (hasMainAgentLearning) {
        validateMainAgentLearning(sessionRef, observation.id, observation.mainAgentLearning, errors);
      }
      if (hasReviewerLearning) {
        validateReviewerLearning(sessionRef, observation.id, observation.reviewerLearning, errors);
        if (observation.reviewerLearning.caughtByReviewer === true && !hasMainAgentLearning) {
          errors.push(`sessions.${sessionRef}.observations.${observation.id} reviewer findings must include mainAgentLearning so the main agent improves before the next review.`);
        }
      }
    });
  }
  return observationRefs;
}

function validateMainAgentLearning(sessionRef: string, observationId: string, value: Record<string, unknown>, errors: string[]): void {
  if (typeof value.reviewerFinding !== "boolean") {
    errors.push(`sessions.${sessionRef}.observations.${observationId}.mainAgentLearning.reviewerFinding must be boolean.`);
  }
  if (typeof value.shouldHavePrevented !== "boolean") {
    errors.push(`sessions.${sessionRef}.observations.${observationId}.mainAgentLearning.shouldHavePrevented must be boolean.`);
  }
  nullableString(value.improvementTarget, `sessions.${sessionRef}.observations.${observationId}.mainAgentLearning.improvementTarget`, errors);
}

function validateReviewerLearning(sessionRef: string, observationId: string, value: Record<string, unknown>, errors: string[]): void {
  if (typeof value.reportedByUser !== "boolean") {
    errors.push(`sessions.${sessionRef}.observations.${observationId}.reviewerLearning.reportedByUser must be boolean.`);
  }
  if (typeof value.caughtByReviewer !== "boolean") {
    errors.push(`sessions.${sessionRef}.observations.${observationId}.reviewerLearning.caughtByReviewer must be boolean.`);
  }
  if (typeof value.reviewerShouldHaveCaught !== "boolean") {
    errors.push(`sessions.${sessionRef}.observations.${observationId}.reviewerLearning.reviewerShouldHaveCaught must be boolean.`);
  }
  nullableString(value.reviewerAgent, `sessions.${sessionRef}.observations.${observationId}.reviewerLearning.reviewerAgent`, errors);
}

function nullableString(value: unknown, label: string, errors: string[]): void {
  if (value !== null && typeof value !== "string") {
    errors.push(`${label} must be a string or null.`);
  }
}

function nonNegativeNumber(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    errors.push(`${label} must be a non-negative number.`);
  }
}

function nonNegativeInteger(value: unknown, label: string, errors: string[]): void {
  if (!Number.isInteger(value) || Number(value) < 0) {
    errors.push(`${label} must be a non-negative integer.`);
  }
}

function validateSessionMetadata(sessionRef: string, metadata: Record<string, unknown>, errors: string[]): void {
  if (!isPlainRecord(metadata.dateRange)) {
    errors.push(`sessions.${sessionRef}.metadata.dateRange must be an object.`);
  }
  for (const field of ["messageRows", "partRows", "todoRows"]) {
    nonNegativeInteger(metadata[field], `sessions.${sessionRef}.metadata.${field}`, errors);
  }
  if (!isNonEmptyString(metadata.sourceRef)) {
    errors.push(`sessions.${sessionRef}.metadata.sourceRef must be non-empty.`);
  }
  for (const field of ["projectRef", "parentRef", "workspaceRef", "agent", "model"]) {
    nullableString(metadata[field], `sessions.${sessionRef}.metadata.${field}`, errors);
  }
  if (typeof metadata.child !== "boolean") {
    errors.push(`sessions.${sessionRef}.metadata.child must be boolean.`);
  }
  nonNegativeNumber(metadata.cost, `sessions.${sessionRef}.metadata.cost`, errors);
  validateStringArray(metadata.mechanicalSignals, `sessions.${sessionRef}.metadata.mechanicalSignals`, errors);
  validateStringArray(metadata.toolNames, `sessions.${sessionRef}.metadata.toolNames`, errors);
  if (!isPlainRecord(metadata.tokens)) {
    errors.push(`sessions.${sessionRef}.metadata.tokens must be an object.`);
    return;
  }
  for (const field of ["input", "output", "reasoning", "cacheRead", "cacheWrite"]) {
    nonNegativeInteger(metadata.tokens[field], `sessions.${sessionRef}.metadata.tokens.${field}`, errors);
  }
}

function validateProposalFiles(root: string, changeId: string, proposal: ProjectSessionRetroProposal, plan: ProjectSessionRetroPlan, cause: ProjectSessionRetroRootCause | undefined, errors: string[]): void {
  if (proposal.status !== "created" && proposal.status !== "existing") {
    return;
  }
  if (!safeChangeId(changeId)) {
    errors.push(`openspecProposals.${changeId} is not a safe change id.`);
    return;
  }
  const changeRoot = path.resolve(root, proposal.path);
  const expectedRoot = path.resolve(root, "openspec", "changes", changeId);
  if (changeRoot !== expectedRoot) {
    errors.push(`openspecProposals.${changeId}.path must be openspec/changes/${changeId}.`);
    return;
  }
  const proposalPath = path.join(changeRoot, "proposal.md");
  const tasksPath = path.join(changeRoot, "tasks.md");
  const specPath = path.join(changeRoot, "specs", changeId, "spec.md");
  for (const required of [proposalPath, tasksPath, specPath]) {
    if (!fs.existsSync(required) || !fs.statSync(required).isFile()) {
      errors.push(`${changeId} must exist with proposal.md, tasks.md, and specs/${changeId}/spec.md.`);
      return;
    }
  }
  const proposalText = fs.readFileSync(proposalPath, "utf8");
  const tasksText = fs.readFileSync(tasksPath, "utf8");
  const specText = fs.readFileSync(specPath, "utf8");
  const fragments = [plan.goal, plan.approach, cause?.summary ?? ""].filter((fragment) => fragment !== "");
  for (const fragment of fragments) {
    if (!proposalText.includes(fragment)) {
      errors.push(`${changeId} proposal.md must preserve plan/root-cause fragment: ${fragment}.`);
    }
  }
  if (!tasksText.includes("Add or update the focused test, fixture, validator, or review evidence")) {
    errors.push(`${changeId} tasks.md must preserve the test-first validation gate.`);
  }
  if (!specText.includes("## ADDED Requirements") || !specText.includes("#### Scenario:")) {
    errors.push(`${changeId} spec delta must include ADDED Requirements and a Scenario.`);
  }
}

export function validateProjectSessionRetroLedger(ledger: unknown, options: ProjectSessionRetroValidationOptions = {}): ProjectSessionRetroValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const root = path.resolve(options.root ?? process.cwd());
  const requireComplete = options.requireComplete === true;
  const requireProposals = options.requireProposals === true;

  if (!isPlainRecord(ledger)) {
    return { errors: ["ledger must be a JSON object."], valid: false, warnings };
  }
  if (ledger.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }
  if (ledger.tool !== TOOL_NAME) {
    errors.push(`tool must be ${TOOL_NAME}.`);
  }
  if (!isNonEmptyString(ledger.generatedAt) || Number.isNaN(Date.parse(ledger.generatedAt))) {
    errors.push("generatedAt must be an ISO timestamp.");
  }

  const sessions = isPlainRecord(ledger.sessions) ? ledger.sessions as Record<string, unknown> : {};
  if (!isPlainRecord(ledger.sessions)) {
    errors.push("sessions must be an object keyed by redacted session ref.");
  }
  validateScope(ledger, Object.keys(sessions).length, errors, warnings);
  validateSources(ledger.sources, errors);
  const observationRefs = validateSessionObservations(sessions, errors);
  const computedProgress = validateAnalysisProgress(ledger, sessions, errors);

  const trends = isPlainRecord(ledger.trends) ? ledger.trends as Record<string, ProjectSessionRetroTrend> : {};
  const rootCauses = isPlainRecord(ledger.rootCauses) ? ledger.rootCauses as Record<string, ProjectSessionRetroRootCause> : {};
  const plans = isPlainRecord(ledger.plans) ? ledger.plans as Record<string, ProjectSessionRetroPlan> : {};
  const proposals = isPlainRecord(ledger.openspecProposals) ? ledger.openspecProposals as Record<string, ProjectSessionRetroProposal> : {};
  if (!isPlainRecord(ledger.trends)) {
    errors.push("trends must be an object.");
  }
  if (!isPlainRecord(ledger.rootCauses)) {
    errors.push("rootCauses must be an object.");
  }
  if (!isPlainRecord(ledger.plans)) {
    errors.push("plans must be an object.");
  }
  if (!isPlainRecord(ledger.openspecProposals)) {
    errors.push("openspecProposals must be an object.");
  }

  for (const [trendId, trend] of Object.entries(trends)) {
    if (!isPlainRecord(trend)) {
      errors.push(`trends.${trendId} must be an object.`);
      continue;
    }
    if (!hasOnlyKnownValues(trend.polarity, ["positive", "negative"])) {
      errors.push(`trends.${trendId}.polarity must be positive or negative.`);
    }
    if (!isNonEmptyString(trend.summary)) {
      errors.push(`trends.${trendId}.summary must be non-empty.`);
    }
    const trendObservationRefs = validateStringArray(trend.observationRefs, `trends.${trendId}.observationRefs`, errors);
    for (const ref of trendObservationRefs) {
      if (!observationRefs.has(ref)) {
        errors.push(`trends.${trendId}.observationRefs references missing observation ${ref}.`);
      }
    }
    const sessionRefs = validateStringArray(trend.sessionRefs, `trends.${trendId}.sessionRefs`, errors);
    for (const ref of sessionRefs) {
      if (!(ref in sessions)) {
        errors.push(`trends.${trendId}.sessionRefs references missing session ${ref}.`);
      }
    }
    if (!isPlainRecord(trend.repeatability)) {
      errors.push(`trends.${trendId}.repeatability must be an object.`);
    } else {
      if (!Number.isInteger(trend.repeatability.sessionCount) || trend.repeatability.sessionCount < 0) {
        errors.push(`trends.${trendId}.repeatability.sessionCount must be a non-negative integer.`);
      }
      if (trend.repeatability.sessionCount !== sessionRefs.length) {
        warnings.push(`trends.${trendId}.repeatability.sessionCount does not match sessionRefs length.`);
      }
      if (!hasOnlyKnownValues(trend.repeatability.classification, ["candidate", "popular", "severe-singleton", "rejected"])) {
        errors.push(`trends.${trendId}.repeatability.classification is invalid.`);
      }
      if (trend.repeatability.classification === "popular" && trend.repeatability.sessionCount < 2) {
        errors.push(`trends.${trendId} popular trends require at least 2 independent sessions.`);
      }
    }
    for (const rootCauseId of validateStringArray(trend.rootCauseIds, `trends.${trendId}.rootCauseIds`, errors)) {
      if (!(rootCauseId in rootCauses)) {
        errors.push(`trends.${trendId}.rootCauseIds references missing root cause ${rootCauseId}.`);
      }
    }
  }

  for (const [causeId, cause] of Object.entries(rootCauses)) {
    if (!isPlainRecord(cause)) {
      errors.push(`rootCauses.${causeId} must be an object.`);
      continue;
    }
    if (!isNonEmptyString(cause.trendId) || !(cause.trendId in trends)) {
      errors.push(`rootCauses.${causeId}.trendId must reference an existing trend.`);
    } else if (!isPlainRecord(trends[cause.trendId]) || !Array.isArray(trends[cause.trendId].rootCauseIds)) {
      errors.push(`trends.${cause.trendId}.rootCauseIds must be an array referencing ${causeId}.`);
    } else if (!trends[cause.trendId].rootCauseIds.includes(causeId)) {
      errors.push(`trends.${cause.trendId}.rootCauseIds must reference ${causeId}.`);
    }
    if (!isNonEmptyString(cause.summary)) {
      errors.push(`rootCauses.${causeId}.summary must be non-empty.`);
    }
    if (!hasOnlyKnownValues(cause.status, ["confirmed", "likely", "unknown"])) {
      errors.push(`rootCauses.${causeId}.status must be confirmed, likely, or unknown.`);
    }
    validateStringArray(cause.contributingFactors, `rootCauses.${causeId}.contributingFactors`, errors);
    for (const ref of validateStringArray(cause.evidenceRefs, `rootCauses.${causeId}.evidenceRefs`, errors)) {
      if (ref.includes("#") && !observationRefs.has(ref)) {
        errors.push(`rootCauses.${causeId}.evidenceRefs references missing observation ${ref}.`);
      }
    }
    if (cause.planId != null && (!(cause.planId in plans))) {
      errors.push(`rootCauses.${causeId}.planId references missing plan ${cause.planId}.`);
    }
  }

  for (const [planId, plan] of Object.entries(plans)) {
    if (!isPlainRecord(plan)) {
      errors.push(`plans.${planId} must be an object.`);
      continue;
    }
    if (!hasOnlyKnownValues(plan.kind, ["investigation", "remediation", "preservation"])) {
      errors.push(`plans.${planId}.kind must be investigation, remediation, or preservation.`);
    }
    if (!isNonEmptyString(plan.causeId) || !(plan.causeId in rootCauses)) {
      errors.push(`plans.${planId}.causeId must reference an existing root cause.`);
      continue;
    }
    const cause = rootCauses[plan.causeId];
    if (cause.planId !== planId) {
      errors.push(`rootCauses.${plan.causeId}.planId must reference ${planId}.`);
    }
    if (cause.status === "unknown" && plan.kind !== "investigation") {
      errors.push(`plans.${planId} for unknown root cause must set kind to investigation before remediation.`);
    }
    if (!isNonEmptyString(plan.goal) || !isNonEmptyString(plan.approach)) {
      errors.push(`plans.${planId}.goal and approach must be non-empty.`);
    }
    validateStringArray(plan.implementationSlices, `plans.${planId}.implementationSlices`, errors);
    validateStringArray(plan.acceptanceCriteria, `plans.${planId}.acceptanceCriteria`, errors);
    validateStringArray(plan.validation, `plans.${planId}.validation`, errors);
    validateStringArray(plan.risks, `plans.${planId}.risks`, errors);
    if (!isNonEmptyString(plan.openspecChangeId)) {
      const message = `plans.${planId}.openspecChangeId must reference a generated OpenSpec proposal.`;
      if (requireProposals) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
      continue;
    }
    const proposal = proposals[plan.openspecChangeId];
    if (!proposal) {
      errors.push(`plans.${planId}.openspecChangeId references missing openspecProposals.${plan.openspecChangeId}.`);
      continue;
    }
    if (requireProposals && proposal.status !== "created" && proposal.status !== "existing") {
      errors.push(`openspecProposals.${plan.openspecChangeId}.status must be created or existing when proposals are required.`);
    }
    if (proposal.planId !== planId) {
      errors.push(`openspecProposals.${plan.openspecChangeId}.planId must reference ${planId}.`);
    }
    validateProposalFiles(root, plan.openspecChangeId, proposal, plan, cause, errors);
  }

  for (const [changeId, proposal] of Object.entries(proposals)) {
    if (!safeChangeId(changeId)) {
      errors.push(`openspecProposals.${changeId} is not a safe change id.`);
    }
    if (!isPlainRecord(proposal)) {
      errors.push(`openspecProposals.${changeId} must be an object.`);
      continue;
    }
    if (!isNonEmptyString(proposal.planId) || !(proposal.planId in plans)) {
      errors.push(`openspecProposals.${changeId}.planId must reference an existing plan.`);
    }
    if (!isNonEmptyString(proposal.path)) {
      errors.push(`openspecProposals.${changeId}.path must be non-empty.`);
    }
    if (!hasOnlyKnownValues(proposal.status, ["created", "existing", "blocked", "draft"])) {
      errors.push(`openspecProposals.${changeId}.status must be created, existing, blocked, or draft.`);
    }
  }

  if (requireComplete) {
    validateCompleteRetro({ computedProgress, observationRefs, plans, rootCauses, sessions, trends }, errors);
  }

  return { errors, valid: errors.length === 0, warnings };
}

function validateAnalysisProgress(ledger: Record<string, unknown>, sessions: Record<string, unknown>, errors: string[]): ProjectSessionRetroLedger["analysisProgress"] | null {
  if (!isPlainRecord(ledger.analysisProgress)) {
    errors.push("analysisProgress must be an object.");
    return null;
  }
  const typedSessions = sessions as ProjectSessionRetroLedger["sessions"];
  const progress = ledger.analysisProgress as Record<string, unknown>;
  const sessionOrder = validateStringArray(progress.sessionOrder, "analysisProgress.sessionOrder", errors);
  const computed = computeAnalysisProgress({ sessions: typedSessions }, sessionOrder);
  const matches = Array.isArray(progress.sessionOrder)
    && JSON.stringify(progress.sessionOrder) === JSON.stringify(computed.sessionOrder)
    && progress.completedSessionCount === computed.completedSessionCount
    && progress.remainingSessionCount === computed.remainingSessionCount
    && progress.lastAnalyzedSessionRef === computed.lastAnalyzedSessionRef
    && progress.nextSessionRef === computed.nextSessionRef;
  if (!matches) {
    errors.push("analysisProgress must match sessions coverage; run `npm run retro:project-ledger -- refresh --input retro.json` after updating session coverage.");
  }
  return computed;
}

function validateCompleteRetro(input: {
  computedProgress: ProjectSessionRetroLedger["analysisProgress"] | null;
  observationRefs: Set<string>;
  plans: Record<string, ProjectSessionRetroPlan>;
  rootCauses: Record<string, ProjectSessionRetroRootCause>;
  sessions: Record<string, unknown>;
  trends: Record<string, ProjectSessionRetroTrend>;
}, errors: string[]): void {
  if (input.computedProgress == null || input.computedProgress.remainingSessionCount !== 0) {
    errors.push("retro is incomplete: every session must have coverage.status complete before push.");
  }
  for (const [sessionRef, session] of Object.entries(input.sessions)) {
    if (!isPlainRecord(session)) {
      continue;
    }
    if (isPlainRecord(session.coverage) && session.coverage.status === "complete" && Array.isArray(session.observations) && session.observations.length === 0) {
      errors.push(`retro is incomplete: sessions.${sessionRef} is complete but has no observations.`);
    }
  }
  const trendObservationRefs = new Set<string>();
  for (const trend of Object.values(input.trends)) {
    if (isPlainRecord(trend) && Array.isArray(trend.observationRefs)) {
      for (const ref of trend.observationRefs) {
        if (typeof ref === "string") {
          trendObservationRefs.add(ref);
        }
      }
    }
  }
  for (const observationRef of input.observationRefs) {
    if (!trendObservationRefs.has(observationRef)) {
      errors.push(`retro is incomplete: observation ${observationRef} is not linked to any trend.`);
    }
  }
  for (const [trendId, trend] of Object.entries(input.trends)) {
    if (!isPlainRecord(trend) || !isPlainRecord(trend.repeatability)) {
      continue;
    }
    const rootCauseIds = Array.isArray(trend.rootCauseIds) ? trend.rootCauseIds : [];
    if (trend.repeatability.classification === "candidate") {
      errors.push(`retro is incomplete: trends.${trendId} remains candidate.`);
    }
    if ((trend.repeatability.classification === "popular" || trend.repeatability.classification === "severe-singleton") && rootCauseIds.length === 0) {
      errors.push(`retro is incomplete: trends.${trendId} needs root cause analysis.`);
    }
  }
  for (const [causeId, cause] of Object.entries(input.rootCauses)) {
    if (!isPlainRecord(cause)) {
      continue;
    }
    if (!cause.planId || !(cause.planId in input.plans)) {
      errors.push(`retro is incomplete: rootCauses.${causeId} needs a detailed plan.`);
    }
  }
}
