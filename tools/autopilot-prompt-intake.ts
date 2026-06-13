import { autopilotTaskTypes, type AutopilotTaskType } from "./autopilot-contract.ts";

export type AutopilotPromptIntakeCategory = "empty" | "change-scope" | "task-scope" | "combined-scope" | "ambiguous-scope" | "freeform-prompt";

export type AutopilotPromptFamily = AutopilotTaskType | "unclear";

export type AutopilotPromptWorkflow = "autopilot_run_next" | "autopilot_status" | "openspec-explore" | "openspec-propose" | "openspec-apply-change" | "direct-edit" | "adaptive-delivery" | "manual-review";

export type AutopilotPromptToolName = "autopilot_run_next" | "autopilot_status";

export type AutopilotPromptScope = {
  changeId?: string;
  taskId?: string;
};

export type AutopilotPromptQueueItem = {
  id: string;
  sourceKind: "ledger" | "active-change";
  changeId?: string;
};

export type AutopilotPromptIntakeInput = {
  argumentsText?: string | null;
  changeIds?: readonly string[];
  knownChangeIds?: readonly string[];
  taskIds?: readonly string[];
  knownTaskIds?: readonly string[];
  taskChangeIds?: Readonly<Record<string, string>>;
  existingQueue?: readonly AutopilotPromptQueueItem[];
  availableTools?: readonly AutopilotPromptToolName[];
};

export type AutopilotPromptIntakeResult = {
  category: AutopilotPromptIntakeCategory;
  promptFamily: AutopilotPromptFamily | null;
  recommendedWorkflow: AutopilotPromptWorkflow;
  handoffWorkflow?: AutopilotPromptWorkflow;
  claimCapableAction: boolean;
  resolvedScope?: AutopilotPromptScope;
  runNextArgs?: AutopilotPromptScope;
  queueState: "unknown" | "none" | "present";
  queueSummary: {
    total: number;
    ledgers: number;
    activeChanges: number;
  };
  unrelatedQueuePolicy: "not_applicable" | "status_required_before_handoff" | "do_not_advance_without_scope_selection";
  ambiguities: string[];
  nextActions: Array<{
    label: string;
    workflow: AutopilotPromptWorkflow;
    safety: "safe" | "requires_user" | "not_available";
    reason: string;
  }>;
};

export type AutopilotPromptIntakeToolPlan = {
  intake: AutopilotPromptIntakeResult;
  firstTool: AutopilotPromptToolName | null;
  firstToolArgs?: AutopilotPromptScope;
  blockedTool?: AutopilotPromptToolName;
  reason: string;
};

type ExplicitScopeParse = {
  hasScopeFlag: boolean;
  changes: string[];
  tasks: string[];
  leftovers: string[];
  errors: string[];
};

const supportedFamilies = new Set<AutopilotPromptFamily>([...autopilotTaskTypes, "unclear"]);

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right));
}

function queueSummary(existingQueue: readonly AutopilotPromptQueueItem[] | undefined): AutopilotPromptIntakeResult["queueSummary"] {
  const queue = existingQueue ?? [];
  return {
    total: queue.length,
    ledgers: queue.filter((item) => item.sourceKind === "ledger").length,
    activeChanges: queue.filter((item) => item.sourceKind === "active-change").length,
  };
}

function queueState(input: AutopilotPromptIntakeInput, summary: AutopilotPromptIntakeResult["queueSummary"]): AutopilotPromptIntakeResult["queueState"] {
  if (input.existingQueue == null) {
    return "unknown";
  }
  return summary.total > 0 ? "present" : "none";
}

function toolAvailable(input: AutopilotPromptIntakeInput, toolName: AutopilotPromptToolName): boolean {
  return input.availableTools != null && input.availableTools.includes(toolName);
}

function unavailableToolPlan(intake: AutopilotPromptIntakeResult, toolName: AutopilotPromptToolName): AutopilotPromptIntakeToolPlan {
  const { runNextArgs: _runNextArgs, ...blockedIntake } = intake;
  return {
    intake: {
      ...blockedIntake,
      recommendedWorkflow: "manual-review",
      claimCapableAction: false,
      nextActions: [
        {
          label: "Report missing Autopilot plugin tool",
          workflow: "manual-review",
          safety: "not_available",
          reason: `${toolName} is not available in the current tool list; stop instead of using a substitute action.`,
        },
      ],
    },
    firstTool: null,
    blockedTool: toolName,
    reason: `${toolName} is not available in the current tool list; stop and report the missing Autopilot plugin tool surface instead of searching for CLI/script substitutes or simulating plugin-owned state.`,
  };
}

function resultForScope(category: "empty" | "change-scope" | "task-scope" | "combined-scope", scope: AutopilotPromptScope, input: AutopilotPromptIntakeInput): AutopilotPromptIntakeResult {
  const summary = queueSummary(input.existingQueue);
  const state = queueState(input, summary);
  return {
    category,
    promptFamily: null,
    recommendedWorkflow: "autopilot_run_next",
    claimCapableAction: true,
    resolvedScope: scope,
    runNextArgs: scope,
    queueState: state,
    queueSummary: summary,
    unrelatedQueuePolicy: "not_applicable",
    ambiguities: [],
    nextActions: [
      {
        label: category === "empty" ? "Call unscoped autopilot_run_next" : "Call scoped autopilot_run_next",
        workflow: "autopilot_run_next",
        safety: "safe",
        reason: category === "empty" ? "No non-whitespace command arguments were supplied." : "Command arguments resolved to exact scope ids.",
      },
    ],
  };
}

function ambiguousResult(ambiguities: string[], input: AutopilotPromptIntakeInput): AutopilotPromptIntakeResult {
  const summary = queueSummary(input.existingQueue);
  const state = queueState(input, summary);
  return {
    category: "ambiguous-scope",
    promptFamily: null,
    recommendedWorkflow: "manual-review",
    claimCapableAction: false,
    queueState: state,
    queueSummary: summary,
    unrelatedQueuePolicy: "not_applicable",
    ambiguities: ambiguities.length > 0 ? ambiguities : ["Command arguments did not resolve to one exact scope."],
    nextActions: [
      {
        label: "Resolve Autopilot scope ambiguity",
        workflow: "manual-review",
        safety: "requires_user",
        reason: "Autopilot cannot safely choose between multiple or invalid explicit scopes.",
      },
    ],
  };
}

function freeformResult(argumentsText: string, input: AutopilotPromptIntakeInput): AutopilotPromptIntakeResult {
  const summary = queueSummary(input.existingQueue);
  const state = queueState(input, summary);
  const promptFamily = classifyPromptFamily(argumentsText);
  const handoffWorkflow = recommendedWorkflowForFamily(promptFamily);
  const recommendedWorkflow = state === "unknown" ? "autopilot_status" : handoffWorkflow;
  return {
    category: "freeform-prompt",
    promptFamily,
    recommendedWorkflow,
    claimCapableAction: false,
    handoffWorkflow: recommendedWorkflow === handoffWorkflow ? undefined : handoffWorkflow,
    queueState: state,
    queueSummary: summary,
    unrelatedQueuePolicy: state === "unknown" ? "status_required_before_handoff" : state === "present" ? "do_not_advance_without_scope_selection" : "not_applicable",
    ambiguities: [],
    nextActions: [
      {
        label: nextActionLabelForWorkflow(recommendedWorkflow),
        workflow: recommendedWorkflow,
        safety: "safe",
        reason: state === "unknown"
          ? "Arguments are free-form task text; inspect queue state read-only before final handoff."
          : state === "present"
          ? "Arguments are free-form task text; existing queue work must stay separate until an exact scope is selected."
          : "Arguments are free-form task text without an exact Autopilot scope.",
      },
    ],
  };
}

function tokenizeArguments(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const char of text) {
    if (quote != null) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function parseExplicitScopes(argumentsText: string): ExplicitScopeParse {
  const tokens = tokenizeArguments(argumentsText);
  const result: ExplicitScopeParse = { hasScopeFlag: false, changes: [], tasks: [], leftovers: [], errors: [] };

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] as string;
    const changeInline = /^--(?:change|changeId)=(.*)$/.exec(token);
    const taskInline = /^--(?:task|taskId)=(.*)$/.exec(token);
    if (changeInline != null) {
      result.hasScopeFlag = true;
      if (changeInline[1].length === 0) {
        result.errors.push("--change is missing a value.");
      } else {
        result.changes.push(changeInline[1]);
      }
      continue;
    }
    if (taskInline != null) {
      result.hasScopeFlag = true;
      if (taskInline[1].length === 0) {
        result.errors.push("--task is missing a value.");
      } else {
        result.tasks.push(taskInline[1]);
      }
      continue;
    }
    if (token === "--change" || token === "--changeId") {
      result.hasScopeFlag = true;
      const value = tokens[index + 1];
      if (value == null || value.startsWith("--")) {
        result.errors.push(`${token} is missing a value.`);
      } else {
        result.changes.push(value);
        index++;
      }
      continue;
    }
    if (token === "--task" || token === "--taskId") {
      result.hasScopeFlag = true;
      const value = tokens[index + 1];
      if (value == null || value.startsWith("--")) {
        result.errors.push(`${token} is missing a value.`);
      } else {
        result.tasks.push(value);
        index++;
      }
      continue;
    }
    result.leftovers.push(token);
  }

  return result;
}

function taskIntersectsChange(taskId: string, changeId: string, input: AutopilotPromptIntakeInput): boolean {
  if (input.taskChangeIds?.[taskId] === changeId) {
    return true;
  }
  return (input.existingQueue ?? []).some((item) => item.sourceKind === "ledger" && item.id === taskId && item.changeId === changeId);
}

function resolveExplicitScopes(parse: ExplicitScopeParse, changes: Set<string>, tasks: Set<string>, input: AutopilotPromptIntakeInput): AutopilotPromptIntakeResult {
  const ambiguities = [...parse.errors];
  const resolvedChanges = uniqueSorted(parse.changes.filter((value) => changes.has(value)));
  const resolvedTasks = uniqueSorted(parse.tasks.filter((value) => tasks.has(value)));
  const unresolvedChanges = uniqueSorted(parse.changes.filter((value) => !changes.has(value)));
  const unresolvedTasks = uniqueSorted(parse.tasks.filter((value) => !tasks.has(value)));

  if (unresolvedChanges.length > 0) {
    ambiguities.push("One or more explicit change scopes did not exactly resolve.");
  }
  if (unresolvedTasks.length > 0) {
    ambiguities.push("One or more explicit task scopes did not exactly resolve.");
  }
  if (resolvedChanges.length > 1) {
    ambiguities.push("More than one exact change scope was supplied.");
  }
  if (resolvedTasks.length > 1) {
    ambiguities.push("More than one exact task scope was supplied.");
  }
  if (parse.leftovers.length > 0) {
    ambiguities.push("Free-form text was mixed with explicit scope flags.");
  }
  if (ambiguities.length > 0) {
    return ambiguousResult(ambiguities, input);
  }

  const changeId = resolvedChanges[0];
  const taskId = resolvedTasks[0];
  if (changeId != null && taskId != null) {
    if (!taskIntersectsChange(taskId, changeId, input)) {
      return ambiguousResult(["Exact changeId and taskId were both supplied without task-to-change intersection evidence."], input);
    }
    return resultForScope("combined-scope", { changeId, taskId }, input);
  }
  if (changeId != null) {
    return resultForScope("change-scope", { changeId }, input);
  }
  if (taskId != null) {
    return resultForScope("task-scope", { taskId }, input);
  }
  return ambiguousResult(["Explicit scope flags were supplied without an exact resolved scope."], input);
}

function detectTokenScopeMix(tokens: readonly string[], changes: Set<string>, tasks: Set<string>): string[] {
  if (tokens.length < 2) {
    return [];
  }
  const exactScopeTokens = tokens.filter((token) => changes.has(token) || tasks.has(token));
  if (exactScopeTokens.length !== tokens.length || exactScopeTokens.length < 2) {
    return [];
  }
  return ["Multiple exact scope ids were supplied without explicit --change/--task flags."];
}

function hasPattern(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function classifyPromptFamily(argumentsText: string): AutopilotPromptFamily {
  const text = argumentsText.toLowerCase();
  const families: AutopilotPromptFamily[] = [];
  const checks: Array<[AutopilotPromptFamily, RegExp]> = [
    ["typo", /\b(typo|spelling|misspell(?:ed|ing)?|grammar)\b/],
    ["bugfix", /\b(bugfix|bug|error|failure|regression|repro|crash|broken|timeout|exception)\b/],
    ["feature", /\b(feature|capability|add support|support for|implement support|new capability)\b/],
    ["refactor", /\b(refactor|cleanup|restructure|behavior-preserving)\b/],
    ["research", /\b(research|investigate|investigation|explore|find out|why)\b/],
    ["planning", /\b(plan|planning|roadmap|migration|rollout|proposal)\b/],
    ["docs", /\b(doc|docs|documentation|readme|guide|manual)\b/],
    ["tooling", /\b(tooling|script|npm|validator|generator|lint|prepush|pre-push|test runner)\b/],
    ["config", /\b(config|configuration|schema|settings|option|options|permission)\b/],
    ["performance", /\b(performance|latency|throughput|benchmark|slow|speed|hot path|tail latency)\b/],
    ["protocol", /\b(protocol|framing|wire|codec|schema evolution|request correlation|transport)\b/],
  ];

  for (const [family, pattern] of checks) {
    if (hasPattern(text, pattern)) {
      families.push(family);
    }
  }

  const uniqueFamilies = uniqueSorted(families).filter((family): family is AutopilotPromptFamily => supportedFamilies.has(family));
  if (uniqueFamilies.includes("typo")) {
    const riskyFamilies = uniqueFamilies.filter((family) => family !== "typo" && family !== "docs");
    return riskyFamilies.length === 0 ? "typo" : "unclear";
  }
  return uniqueFamilies.length === 1 ? uniqueFamilies[0] as AutopilotPromptFamily : "unclear";
}

function recommendedWorkflowForFamily(family: AutopilotPromptFamily): AutopilotPromptWorkflow {
  switch (family) {
    case "bugfix":
    case "research":
    case "planning":
    case "unclear":
      return "openspec-explore";
    case "docs":
    case "typo":
      return "direct-edit";
    case "feature":
    case "tooling":
    case "config":
    case "performance":
    case "protocol":
    case "refactor":
      return "openspec-propose";
  }
}

function nextActionLabelForWorkflow(workflow: AutopilotPromptWorkflow): string {
  switch (workflow) {
    case "autopilot_run_next":
      return "Continue scoped Autopilot";
    case "autopilot_status":
      return "Inspect queue status";
    case "openspec-explore":
      return "Explore prompt evidence";
    case "openspec-propose":
      return "Draft OpenSpec proposal";
    case "openspec-apply-change":
      return "Apply existing OpenSpec change";
    case "direct-edit":
      return "Use direct edit workflow";
    case "adaptive-delivery":
      return "Use adaptive delivery";
    case "manual-review":
      return "Review prompt manually";
  }
}

export function classifyAutopilotPromptIntake(input: AutopilotPromptIntakeInput): AutopilotPromptIntakeResult {
  const argumentsText = input.argumentsText?.trim() ?? "";
  if (argumentsText.length === 0) {
    return resultForScope("empty", {}, input);
  }

  const queueChangeIds = (input.existingQueue ?? []).filter((item) => item.sourceKind === "active-change").map((item) => item.id);
  const queueTaskIds = (input.existingQueue ?? []).filter((item) => item.sourceKind === "ledger").map((item) => item.id);
  const changes = new Set(uniqueSorted([...(input.changeIds ?? []), ...(input.knownChangeIds ?? []), ...queueChangeIds]));
  const tasks = new Set(uniqueSorted([...(input.taskIds ?? []), ...(input.knownTaskIds ?? []), ...queueTaskIds]));
  const explicit = parseExplicitScopes(argumentsText);
  if (explicit.hasScopeFlag) {
    return resolveExplicitScopes(explicit, changes, tasks, input);
  }

  const exactChange = changes.has(argumentsText);
  const exactTask = tasks.has(argumentsText);
  if (exactChange && exactTask) {
    return ambiguousResult(["Argument exactly matches both a change id and a task id."], input);
  }
  if (exactChange) {
    return resultForScope("change-scope", { changeId: argumentsText }, input);
  }
  if (exactTask) {
    return resultForScope("task-scope", { taskId: argumentsText }, input);
  }

  const scopeMix = detectTokenScopeMix(tokenizeArguments(argumentsText), changes, tasks);
  if (scopeMix.length > 0) {
    return ambiguousResult(scopeMix, input);
  }

  return freeformResult(argumentsText, input);
}

export function planAutopilotPromptIntake(input: AutopilotPromptIntakeInput): AutopilotPromptIntakeToolPlan {
  const intake = classifyAutopilotPromptIntake(input);
  if (intake.claimCapableAction) {
    if (!toolAvailable(input, "autopilot_run_next")) {
      return unavailableToolPlan(intake, "autopilot_run_next");
    }
    return {
      intake,
      firstTool: "autopilot_run_next",
      firstToolArgs: intake.runNextArgs,
      reason: "Arguments resolved to empty or exact Autopilot scope.",
    };
  }
  if (intake.category === "freeform-prompt" && intake.queueState === "unknown") {
    if (!toolAvailable(input, "autopilot_status")) {
      return unavailableToolPlan(intake, "autopilot_status");
    }
    return {
      intake,
      firstTool: "autopilot_status",
      reason: "Free-form prompt intake requires read-only queue status before handoff.",
    };
  }
  return {
    intake,
    firstTool: null,
    reason: intake.category === "ambiguous-scope" ? "Ambiguous scope must be resolved before any Autopilot advancement." : "Free-form prompt intake has handoff evidence and must not advance unrelated queue work.",
  };
}
