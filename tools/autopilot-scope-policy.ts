import { autopilotProtectedPathPatterns } from "./autopilot-contract.ts";

type ScopeLedger = {
  taskType: string;
  writeScope: string[];
  forbiddenScope: string[];
};

type ScopePattern = {
  prefix: string;
  exact: boolean;
};

export type ScopeCompatibility = {
  compatible: boolean;
  acceptedSoftConflictScopes: string[];
  rejectedReasons: string[];
};

export type ScopeCompatibilityOptions = {
  conflictTolerance?: "none" | "small";
  softConflictScopes?: string[];
};

const commonProtectedForbiddenScopes = new Set<string>([...autopilotProtectedPathPatterns, "openspec/changes/*/automation/**"]);

export function normalizedScopeText(pattern: string): string {
  return pattern.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function normalizeScopePattern(pattern: string): ScopePattern | null {
  const normalized = normalizedScopeText(pattern);
  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    return null;
  }
  const globIndex = normalized.search(/[!?*[\]{}]/);
  if (globIndex < 0) {
    return { prefix: normalized, exact: true };
  }
  const rawPrefix = normalized.slice(0, globIndex);
  const prefix = rawPrefix.endsWith("/") ? rawPrefix : rawPrefix.slice(0, rawPrefix.lastIndexOf("/") + 1);
  return prefix.length > 0 ? { prefix, exact: false } : null;
}

function scopePatternsMayOverlap(left: ScopePattern, right: ScopePattern): boolean {
  if (left.exact && right.exact) {
    return left.prefix === right.prefix || left.prefix.startsWith(`${right.prefix}/`) || right.prefix.startsWith(`${left.prefix}/`);
  }
  if (left.exact) {
    return left.prefix.startsWith(right.prefix);
  }
  if (right.exact) {
    return right.prefix.startsWith(left.prefix);
  }
  return left.prefix.startsWith(right.prefix) || right.prefix.startsWith(left.prefix);
}

function normalizedScopePatterns(scopes: string[]): Array<{ raw: string; pattern: ScopePattern }> | null {
  const patterns = scopes.map((raw) => ({ raw: normalizedScopeText(raw), pattern: normalizeScopePattern(raw) }));
  if (patterns.some((entry) => entry.pattern == null)) {
    return null;
  }
  return patterns as Array<{ raw: string; pattern: ScopePattern }>;
}

function writeScopesAreDisjoint(leftWriteScope: string[], rightWriteScope: string[]): boolean {
  if (leftWriteScope.length === 0 || rightWriteScope.length === 0) {
    return false;
  }
  const leftPatterns = leftWriteScope.map(normalizeScopePattern);
  const rightPatterns = rightWriteScope.map(normalizeScopePattern);
  if (leftPatterns.some((pattern) => pattern == null) || rightPatterns.some((pattern) => pattern == null)) {
    return false;
  }
  return leftPatterns.every((leftPattern) => rightPatterns.every((rightPattern) => !scopePatternsMayOverlap(leftPattern, rightPattern)));
}

function taskSpecificForbiddenScope(ledger: ScopeLedger): string[] {
  return ledger.forbiddenScope.filter((scope) => !commonProtectedForbiddenScopes.has(scope));
}

function writesAvoidForbidden(writeLedger: ScopeLedger, forbiddenLedger: ScopeLedger): boolean {
  const forbiddenScope = taskSpecificForbiddenScope(forbiddenLedger);
  if (forbiddenScope.length === 0) {
    return true;
  }
  if (writeLedger.writeScope.length === 0) {
    return false;
  }
  const writePatterns = writeLedger.writeScope.map(normalizeScopePattern);
  const forbiddenPatterns = forbiddenScope.map(normalizeScopePattern);
  if (writePatterns.some((pattern) => pattern == null) || forbiddenPatterns.some((pattern) => pattern == null)) {
    return false;
  }
  return writePatterns.every((writePattern) => forbiddenPatterns.every((forbiddenPattern) => !scopePatternsMayOverlap(writePattern, forbiddenPattern)));
}

export function scopesAreParallelCompatible(left: ScopeLedger, right: ScopeLedger): boolean {
  return writeScopesAreDisjoint(left.writeScope, right.writeScope) && writesAvoidForbidden(left, right) && writesAvoidForbidden(right, left);
}

export function writeScopeComparable(ledger: ScopeLedger): boolean {
  return ledger.writeScope.length > 0 && ledger.writeScope.every((scope) => normalizeScopePattern(scope) != null);
}

function protectedScopePattern(pattern: string): boolean {
  const normalized = normalizedScopeText(pattern);
  return normalized.startsWith(".autopilot/")
    || normalized.startsWith("openspec/changes/*/automation/")
    || /^openspec\/changes\/[^/]+\/automation(?:\/|$)/.test(normalized)
    || normalized.includes("/automation/task.json")
    || normalized.includes("/automation/feedback/")
    || normalized.includes("/automation/artifacts/");
}

function centralCoordinationScope(pattern: string): boolean {
  const normalized = normalizedScopeText(pattern);
  const basename = normalized.split("/").at(-1) ?? normalized;
  if (protectedScopePattern(normalized)) {
    return true;
  }
  if (["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "opencode.json", "opencode.jsonc", "AGENTS.md"].includes(normalized)) {
    return true;
  }
  if (["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"].includes(basename) && !normalized.startsWith("fixtures/")) {
    return true;
  }
  return normalized.startsWith(".opencode/plugins/")
    || normalized.startsWith(".opencode/commands/")
    || normalized.startsWith(".opencode/command/")
    || normalized === ".opencode/opencode.json"
    || normalized === ".opencode/opencode.jsonc"
    || normalized === "tools/autopilot-active-run.ts"
    || normalized === "tools/autopilot-worktree-lifecycle.ts"
    || normalized === "tools/openspec-autopilot-runtime.ts"
    || normalized === "tools/openspec-autopilot-output.ts"
    || normalized === "tools/autopilot-scope-policy.ts"
    || normalized === "tools/autopilot-contract.ts"
    || normalized === "tools/autopilot-ledger.ts"
    || normalized === "tools/autopilot-ledger-type-gates.ts";
}

export function ledgerWritesCentralScope(ledger: ScopeLedger): boolean {
  return ledger.writeScope.some(centralCoordinationScope);
}

function sourceConfigOrSecretScope(pattern: string): boolean {
  const normalized = normalizedScopeText(pattern);
  const basename = normalized.split("/").at(-1) ?? normalized;
  if (protectedScopePattern(normalized) || centralCoordinationScope(normalized)) {
    return true;
  }
  if (/secret|credential|token|key|\.env/i.test(normalized)) {
    return true;
  }
  if (normalized.startsWith("src/") || normalized.startsWith("lib/") || normalized.startsWith("tools/") || normalized.startsWith(".opencode/plugins/")) {
    return true;
  }
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|ya?ml|toml|lock)$/i.test(basename) && !normalized.startsWith("docs/") && !normalized.startsWith("fixtures/");
}

function lowRiskTaskType(ledger: ScopeLedger): boolean {
  return ["docs", "typo", "research", "planning"].includes(ledger.taskType);
}

function lowRiskSafeScope(scope: string): boolean {
  const normalized = normalizedScopeText(scope);
  return normalizeScopePattern(scope) != null
    && !sourceConfigOrSecretScope(normalized)
    && !centralCoordinationScope(normalized)
    && (normalized.startsWith("docs/") || normalized.startsWith("fixtures/") || normalized.startsWith("examples/") || normalized.startsWith("openspec/changes/"));
}

export function lowRiskLedger(ledger: ScopeLedger): boolean {
  return ledger.writeScope.length > 0 && ledger.writeScope.every((scope) => lowRiskSafeScope(scope)) && (lowRiskTaskType(ledger) || ledger.writeScope.every((scope) => {
    const normalized = normalizedScopeText(scope);
    return normalized.startsWith("docs/") || normalized.startsWith("fixtures/") || normalized.startsWith("examples/");
  }));
}

export function lowRiskTypeWritesUnsafeScope(ledger: ScopeLedger): boolean {
  return lowRiskTaskType(ledger) && !ledger.writeScope.every(lowRiskSafeScope);
}

function patternCoveredByScope(pattern: ScopePattern, scope: ScopePattern): boolean {
  if (scope.exact) {
    return pattern.exact && pattern.prefix === scope.prefix;
  }
  return pattern.prefix.startsWith(scope.prefix);
}

function softScopeCoveringOverlap(left: ScopePattern, right: ScopePattern, softScopes: Array<{ raw: string; pattern: ScopePattern }>): string | null {
  for (const soft of softScopes) {
    if (patternCoveredByScope(left, soft.pattern) && patternCoveredByScope(right, soft.pattern)) {
      return soft.raw;
    }
  }
  return null;
}

export function ledgerHasIndependentPrimaryScope(ledger: ScopeLedger, softConflictScopes: string[]): boolean {
  const softPatterns = normalizedScopePatterns(softConflictScopes) ?? [];
  return ledger.writeScope.some((scope) => {
    const pattern = normalizeScopePattern(scope);
    return pattern != null && !softPatterns.some((soft) => patternCoveredByScope(pattern, soft.pattern));
  });
}

export function scopeCompatibilityFor(left: ScopeLedger, right: ScopeLedger, options: ScopeCompatibilityOptions): ScopeCompatibility {
  const leftPatterns = normalizedScopePatterns(left.writeScope);
  const rightPatterns = normalizedScopePatterns(right.writeScope);
  const softScopes = normalizedScopePatterns(options.softConflictScopes ?? []) ?? [];
  const accepted = new Set<string>();
  const rejectedReasons = new Set<string>();

  if (leftPatterns == null || rightPatterns == null || left.writeScope.length === 0 || right.writeScope.length === 0) {
    return { compatible: false, acceptedSoftConflictScopes: [], rejectedReasons: ["unknown or unsupported write scope"] };
  }
  if (!writesAvoidForbidden(left, right) || !writesAvoidForbidden(right, left)) {
    return { compatible: false, acceptedSoftConflictScopes: [], rejectedReasons: ["candidate writes into another task forbidden scope"] };
  }

  for (const leftPattern of leftPatterns) {
    for (const rightPattern of rightPatterns) {
      if (!scopePatternsMayOverlap(leftPattern.pattern, rightPattern.pattern)) {
        continue;
      }
      const disallowedScope = sourceConfigOrSecretScope(leftPattern.raw) || sourceConfigOrSecretScope(rightPattern.raw);
      const softScope = options.conflictTolerance === "small"
        ? softScopeCoveringOverlap(leftPattern.pattern, rightPattern.pattern, softScopes)
        : null;
      if (softScope != null && !disallowedScope) {
        accepted.add(softScope);
      } else if (disallowedScope) {
        rejectedReasons.add("source/config overlap cannot be accepted as a soft conflict");
      } else if (options.conflictTolerance === "small") {
        rejectedReasons.add("write overlap is not declared in softConflictScopes");
      } else {
        rejectedReasons.add("write scopes overlap while conflictTolerance is none");
      }
    }
  }

  return {
    compatible: rejectedReasons.size === 0,
    acceptedSoftConflictScopes: Array.from(accepted).sort(),
    rejectedReasons: Array.from(rejectedReasons).sort(),
  };
}
