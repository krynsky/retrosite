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
  savePageNow?: boolean;
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
    fallback?: boolean;
  }>;
  warning?: string | null;
  captureCount: number;
  yearSummary: YearSummary[];
  candidates: Candidate[];
};

export type DepthMode = "adaptive" | "quick" | "standard" | "deep";
export type ArchiveMode = "best-year" | "homepage" | "specific-path" | "broad";

export type ArchiveProfile = {
  depthMode: DepthMode;
  archiveSize: "small" | "medium" | "large" | "huge";
  captureCount: number;
  failedQueryCount: number;
  screenshotLimit: number;
  reason: string;
};

export type ArchivedPathSuggestion = {
  path: string;
  target: string;
  captureCount: number;
  yearCount: number;
  uniqueDigestCount: number;
  firstCaptureDate: string;
  latestCaptureDate: string;
  sampleOriginal: string;
  calendarUrl: string;
  score: number;
  reason: string;
};

export type ArchivedPathDiscovery = {
  host: string;
  target: string;
  paths: ArchivedPathSuggestion[];
};

export type ArchivePreflight = {
  host: string;
  firstCaptureDate: string | null;
  latestCaptureDate: string | null;
  captureCount: number;
  captureYearCount: number;
  yearSpan: number;
  uniqueDigestCount: number;
  candidateCount: number;
  estimatedRunSize: ArchiveProfile["archiveSize"];
  recommendedDepthMode: DepthMode;
  recommendedScreenshotLimit: number;
  weakYears: Array<{
    year: string;
    count: number;
    reason: string;
  }>;
  warnings: string[];
  archiveProfile: ArchiveProfile;
};

export type ArchiveInspection = {
  preflight: ArchivePreflight;
  pathDiscovery: ArchivedPathDiscovery;
  pathDiscoveryError?: string;
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
  savePageNow?: boolean;
};

export type SavePageNowResult = {
  status: string;
  liveUrl?: string;
  httpStatus?: number | null;
  timestamp?: string;
  replayUrl?: string;
  reason?: string;
} | null;

export type DraftReport = {
  title: string;
  summary: string;
  publicationStatus?: "draft" | "published";
  publishedAt?: string | null;
  runSummary?: {
    discovery?: {
      variants: number;
      captures: number;
      years: number;
      candidates: number;
    };
    rendering?: {
      attempted: number;
      usable: number;
      weak: number;
      failed: number;
      replacements: number;
    };
    curation?: {
      eligible: number;
      finalEntries: number;
      yearsRepresented: number;
      totalYears: number;
      weakOnlyYears: number;
    };
  };
  exports?: {
    markdownUrl?: string;
    htmlUrl?: string;
  };
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
  thumbnailEntryKey?: string | null;
  thumbnailUrl?: string | null;
  generatedReportUrl?: string;
  generatedShareUrl?: string;
};

export type ReportVersionSummary = {
  version: number;
  id: string;
  status: string;
  depthMode?: DepthMode;
  screenshotLimit: number;
  archiveProfile?: ArchiveProfile | null;
  createdAt: string;
  updatedAt: string;
  entryCount: number;
};

export type ReportJob = {
  id: string;
  storageKey?: string | null;
  target: string;
  host: string;
  version?: number;
  status: "queued" | "running" | "complete" | "incomplete" | "failed" | "canceled";
  stage: string;
  progress: number;
  message: string;
  depthMode: DepthMode;
  archiveMode?: ArchiveMode;
  screenshotLimit: number;
  archiveProfile: ArchiveProfile | null;
  createdAt: string;
  updatedAt: string;
  events: Array<{
    at: string;
    stage: string;
    message: string;
  }>;
  savePageNow?: SavePageNowResult;
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
  storageKey?: string | null;
  target: string;
  host: string;
  version?: number;
  status: "queued" | "running" | "complete" | "incomplete" | "failed" | "canceled";
  stage: string;
  progress: number;
  message: string;
  depthMode: DepthMode;
  archiveMode?: ArchiveMode;
  screenshotLimit: number;
  archiveProfile: ArchiveProfile | null;
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
  requestStatusUrl: string | null;
};

export type TimelineRequest = {
  id: string;
  url: string;
  target: string;
  domain: string;
  path: string;
  status: "new" | string;
  createdAt: string;
  issueUrl?: string | null;
};
