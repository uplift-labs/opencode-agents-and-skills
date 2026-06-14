export type Confidence = "low" | "medium" | "high";
export type CoverageStatus = "complete" | "partial" | "blocked";
export type PlanKind = "investigation" | "remediation" | "preservation";
export type Polarity = "positive" | "negative";
export type ProposalStatus = "created" | "existing" | "blocked" | "draft";
export type RootCauseStatus = "confirmed" | "likely" | "unknown";
export type TrendClassification = "candidate" | "popular" | "severe-singleton" | "rejected";

export type DateRange = {
  from: string | null;
  to: string | null;
};

export type ProjectSessionRetroObservation = {
  id: string;
  polarity: Polarity;
  summary: string;
  evidenceRefs: string[];
  impact: Confidence;
  confidence: Confidence;
  mainAgentLearning?: {
    reviewerFinding: boolean;
    shouldHavePrevented: boolean;
    improvementTarget: string | null;
  };
  reviewerLearning?: {
    reportedByUser: boolean;
    caughtByReviewer: boolean;
    reviewerShouldHaveCaught: boolean;
    reviewerAgent: string | null;
  };
};

export type ProjectSessionRetroSession = {
  metadata: {
    dateRange: DateRange;
    messageRows: number;
    partRows: number;
    todoRows: number;
    sourceRef: string;
    projectRef: string | null;
    parentRef: string | null;
    workspaceRef: string | null;
    child: boolean;
    agent: string | null;
    model: string | null;
    cost: number;
    tokens: {
      input: number;
      output: number;
      reasoning: number;
      cacheRead: number;
      cacheWrite: number;
    };
    mechanicalSignals: string[];
    toolNames: string[];
  };
  coverage: {
    status: CoverageStatus;
    limits: string[];
  };
  observations: ProjectSessionRetroObservation[];
};

export type ProjectSessionRetroTrend = {
  polarity: Polarity;
  summary: string;
  observationRefs: string[];
  sessionRefs: string[];
  repeatability: {
    sessionCount: number;
    thresholdMet: boolean;
    classification: TrendClassification;
  };
  rootCauseIds: string[];
};

export type ProjectSessionRetroRootCause = {
  trendId: string;
  summary: string;
  status: RootCauseStatus;
  recurrencePath: string;
  contributingFactors: string[];
  evidenceRefs: string[];
  planId: string | null;
};

export type ProjectSessionRetroPlan = {
  causeId: string;
  kind: PlanKind;
  goal: string;
  approach: string;
  implementationSlices: string[];
  acceptanceCriteria: string[];
  validation: string[];
  risks: string[];
  openspecChangeId: string | null;
};

export type ProjectSessionRetroProposal = {
  planId: string;
  path: string;
  status: ProposalStatus;
};

export type ProjectSessionRetroSource = {
  type: "sqlite-opencode-db";
  sourceRef: string;
  path?: string;
  status: string;
  readable: boolean;
  schemaTables: string[];
  sessionsRead: number;
  includedSessions: number;
  warnings: string[];
};

export type ProjectSessionRetroLedger = {
  schemaVersion: 1;
  tool: "opencode-project-session-retro-ledger";
  generatedAt: string;
  scope: {
    mode: "current-project";
    projectRootRef: string;
    projectRoot?: string;
    dateRange: DateRange;
    sessionCount: number;
    source: "opencode-db";
  };
  sources: ProjectSessionRetroSource[];
  sessions: Record<string, ProjectSessionRetroSession>;
  analysisProgress: {
    sessionOrder: string[];
    completedSessionCount: number;
    remainingSessionCount: number;
    lastAnalyzedSessionRef: string | null;
    nextSessionRef: string | null;
  };
  trends: Record<string, ProjectSessionRetroTrend>;
  rootCauses: Record<string, ProjectSessionRetroRootCause>;
  plans: Record<string, ProjectSessionRetroPlan>;
  openspecProposals: Record<string, ProjectSessionRetroProposal>;
  validation: {
    errors: string[];
    warnings: string[];
  };
};

export type ProjectSessionRetroValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type ProjectSessionRetroValidationOptions = {
  requireComplete?: boolean;
  requireProposals?: boolean;
  root?: string;
};

export type ProjectSessionRetroProposalChange = {
  id: string;
  path: string;
  planId: string;
  causeId: string;
  status: "created" | "existing" | "blocked" | "draft";
};

export type ProjectSessionRetroProposalResult = {
  changes: ProjectSessionRetroProposalChange[];
  ledger: ProjectSessionRetroLedger;
};

export type InitProjectSessionRetroLedgerOptions = {
  dataDirs?: string[];
  dbPaths?: string[];
  generatedAt?: string;
  projectRoot: string;
  showPaths?: boolean;
  useDefaultPaths?: boolean;
};
