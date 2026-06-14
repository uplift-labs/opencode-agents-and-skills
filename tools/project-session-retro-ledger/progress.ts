import type { ProjectSessionRetroLedger } from "./types.ts";

export function computeAnalysisProgress(ledger: Pick<ProjectSessionRetroLedger, "sessions">, existingOrder?: string[]): ProjectSessionRetroLedger["analysisProgress"] {
  const sessionKeys = Object.keys(ledger.sessions);
  const sessionKeySet = new Set(sessionKeys);
  const orderedExisting = (existingOrder ?? []).filter((ref) => sessionKeySet.has(ref));
  const missingFromOrder = sessionKeys.filter((ref) => !orderedExisting.includes(ref));
  const sessionOrder = [...orderedExisting, ...missingFromOrder];
  let completedSessionCount = 0;
  let firstIncompleteIndex = -1;
  for (let index = 0; index < sessionOrder.length; index++) {
    const ref = sessionOrder[index];
    if (ledger.sessions[ref]?.coverage?.status === "complete") {
      completedSessionCount++;
    } else if (firstIncompleteIndex < 0) {
      firstIncompleteIndex = index;
    }
  }
  const lastAnalyzedIndex = firstIncompleteIndex < 0 ? sessionOrder.length - 1 : firstIncompleteIndex - 1;
  return {
    completedSessionCount,
    lastAnalyzedSessionRef: lastAnalyzedIndex >= 0 ? sessionOrder[lastAnalyzedIndex] : null,
    nextSessionRef: firstIncompleteIndex >= 0 ? sessionOrder[firstIncompleteIndex] : null,
    remainingSessionCount: Math.max(0, sessionOrder.length - completedSessionCount),
    sessionOrder,
  };
}

export function refreshAnalysisProgress<T extends ProjectSessionRetroLedger>(ledger: T): T {
  return {
    ...ledger,
    analysisProgress: computeAnalysisProgress(ledger, ledger.analysisProgress?.sessionOrder),
  };
}
