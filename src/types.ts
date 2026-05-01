export type YearSummary = {
  year: string;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
  sampleOriginal: string;
  sampleDigest: string;
};

export type Candidate = {
  timestamp: string;
  date: string;
  original: string;
  replayUrl: string;
  reason: string;
  rank?: number;
};

export type DiscoveryResult = {
  host: string;
  queriedVariants: string[];
  variantStatus?: Array<{
    variant: string;
    status: string;
    attempts: number;
    captureCount: number;
    error: string | null;
  }>;
  warning?: string | null;
  captureCount: number;
  yearSummary: YearSummary[];
  candidates: Candidate[];
};

export type DraftReportEntry = {
  timestamp: string;
  date: string;
  title: string;
  notes: string;
  techStack: string;
  source: string;
  original: string;
  screenshotStatus: string;
  screenshotUrl: string | null;
  screenshotError: string | null;
  screenshotQuality: {
    bytes: number;
    width: number;
    height: number;
    visualScore?: number | null;
    qualityScore?: number;
    classification: string;
    reasons?: string[];
    diagnostics?: Record<string, unknown>;
  } | null;
  replacementOf: string | null;
  replacementAttempts: Array<{
    timestamp: string;
    date: string;
    original: string;
  }>;
  candidateRank?: number;
};

export type DraftReport = {
  title: string;
  summary: string;
  publicationStatus?: "draft" | "published";
  publishedAt?: string | null;
  stats: {
    captureCount: number;
    candidateCount: number;
    yearCount: number;
    range: string;
    renderedCount?: number;
    usableRenderCount?: number;
    selectedCount?: number;
  };
  entries: DraftReportEntry[];
  curatedEntries?: DraftReportEntry[];
  generatedReportUrl?: string;
  generatedShareUrl?: string;
};

export type ReportVersionSummary = {
  version: number;
  id: string;
  status: string;
  screenshotLimit: number;
  createdAt: string;
  updatedAt: string;
  entryCount: number;
};

export type ReportJob = {
  id: string;
  target: string;
  host: string;
  version?: number;
  status: "queued" | "running" | "complete" | "incomplete" | "failed" | "canceled";
  stage: string;
  progress: number;
  message: string;
  screenshotLimit: number;
  createdAt: string;
  updatedAt: string;
  events: Array<{
    at: string;
    stage: string;
    message: string;
  }>;
  discovery: DiscoveryResult | null;
  report: DraftReport | null;
  error: string | null;
  notifyEmail: string | null;
  notificationStatus: "not_requested" | "captured" | "queued" | "failed";
  activeJobCount?: number;
  maxActiveJobs?: number;
  queuePosition?: number | null;
  isActiveJob?: boolean;
};

export type ReportJobSummary = {
  id: string;
  target: string;
  host: string;
  version?: number;
  status: "queued" | "running" | "complete" | "incomplete" | "failed" | "canceled";
  stage: string;
  progress: number;
  message: string;
  screenshotLimit: number;
  createdAt: string;
  updatedAt: string;
  generatedReportUrl: string | null;
  generatedShareUrl: string | null;
  stats: DraftReport["stats"] | null;
  error: string | null;
  thumbnailUrl: string | null;
  notifyEmail: string | null;
  notificationStatus: "not_requested" | "captured" | "queued" | "failed";
  activeJobCount?: number;
  maxActiveJobs?: number;
  queuePosition?: number | null;
  isActiveJob?: boolean;
};

export type QueueSummary = {
  activeJobCount: number;
  maxActiveJobs: number;
};

export type AppConfig = {
  mode: "local" | "request-only";
  canGenerateReports: boolean;
  canEditReports: boolean;
  canSubmitRequests: boolean;
  requestSink: string;
};

export type TimelineRequest = {
  id: string;
  url: string;
  target: string;
  domain: string;
  path: string;
  email: string | null;
  notes: string;
  status: "new" | string;
  createdAt: string;
};
