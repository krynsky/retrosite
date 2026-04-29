import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Clipboard,
  FileText,
  Loader2,
  Maximize2,
  Search,
  Sparkles,
  ZoomIn
} from "lucide-react";
import { krynskyTimeline } from "./data/krynskyTimeline";

type YearSummary = {
  year: string;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
  sampleOriginal: string;
  sampleDigest: string;
};

type Candidate = {
  timestamp: string;
  date: string;
  original: string;
  replayUrl: string;
  reason: string;
};

type DiscoveryResult = {
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

type DraftReportEntry = {
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
    classification: string;
    reasons?: string[];
  } | null;
  replacementOf: string | null;
  replacementAttempts: Array<{
    timestamp: string;
    date: string;
    original: string;
  }>;
};

type DraftReport = {
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
    selectedCount?: number;
  };
  entries: DraftReportEntry[];
  curatedEntries?: DraftReportEntry[];
  generatedReportUrl?: string;
  generatedShareUrl?: string;
};

type ReportJob = {
  id: string;
  target: string;
  host: string;
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

type ReportJobSummary = {
  id: string;
  target: string;
  host: string;
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

type QueueSummary = {
  activeJobCount: number;
  maxActiveJobs: number;
};

const processSteps = [
  {
    number: "01",
    title: "Discover",
    summary: "Query exact homepage captures across http, https, root, and www variants.",
    detail:
      "Retrosite starts by asking the Wayback Machine CDX index for exact homepage captures. It checks the common URL variants because older sites often moved between www, non-www, http, and https over time."
  },
  {
    number: "02",
    title: "Render",
    summary: "Capture full-page Wayback replays and mark broken, stripped, or partially styled versions.",
    detail:
      "Candidate captures need to be opened and rendered because archive data alone cannot tell whether a page visually survived. Broken stylesheets, missing images, partial hydration, and stripped fallback pages are marked for replacement."
  },
  {
    number: "03",
    title: "Curate",
    summary: "Group visually distinct eras, keep the best replay, and record omitted gaps.",
    detail:
      "The report should show meaningful visual eras, not every timestamp. Nearby captures are compared so the clearest representative screenshot is kept, while replay gaps and unreliable eras are documented honestly."
  },
  {
    number: "04",
    title: "Publish",
    summary: "Export a shareable timeline with screenshots, source links, tech stack notes, and caveats.",
    detail:
      "The final output combines screenshots, Wayback links, inferred technology notes, and render caveats into a visual timeline that can be read as a history of the site's design."
  }
];

const reportStageSteps = [
  {
    id: "queued",
    title: "Queue",
    detail: "The job is saved and waiting for the runner."
  },
  {
    id: "discovering",
    title: "Discover",
    detail: "Retrosite queries Wayback Machine variants for homepage captures."
  },
  {
    id: "selecting",
    title: "Index",
    detail: "Capture years and candidate eras are grouped."
  },
  {
    id: "rendering",
    title: "Render",
    detail: "Candidate captures are opened and screenshotted in Chrome."
  },
  {
    id: "repairing",
    title: "Repair",
    detail: "Weak captures are replaced with nearby same-year captures when possible."
  },
  {
    id: "curating",
    title: "Curate",
    detail: "Usable screenshots are selected for the draft timeline."
  },
  {
    id: "complete",
    title: "Ready",
    detail: "The draft is ready to edit, publish, and share."
  },
  {
    id: "incomplete",
    title: "Needs review",
    detail: "The run finished, but too few usable screenshots were rendered."
  },
  {
    id: "canceled",
    title: "Canceled",
    detail: "The job was stopped before it finished."
  }
];

function buildDiscoveryMarkdown(discovery: DiscoveryResult) {
  const rows = discovery.candidates
    .map((candidate) => `| ${candidate.date} | Candidate capture | Needs screenshot review | [Wayback](${candidate.replayUrl}) |`)
    .join("\n");

  return `# ${discovery.host} Wayback Visual Timeline Draft

Discovered ${discovery.captureCount} unique homepage captures across ${discovery.yearSummary.length} years.

| Date | Version | Tech stack | Source |
|---|---|---|---|
${rows}

Next step: render these candidate captures, replace weak replays, and keep only visually distinct eras.`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 250);
}

function summarizeJob(job: ReportJob): ReportJobSummary {
  const renderedEntry = job.report?.curatedEntries?.find((entry) => entry.screenshotUrl)
    ?? job.report?.entries.find((entry) => entry.screenshotUrl);

  return {
    id: job.id,
    target: job.target,
    host: job.host,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    screenshotLimit: job.screenshotLimit ?? 5,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    generatedReportUrl: job.report?.generatedReportUrl ?? null,
    generatedShareUrl: job.report?.generatedShareUrl ?? (job.report?.generatedReportUrl ? `${job.report.generatedReportUrl}/share` : null),
    stats: job.report?.stats ?? null,
    error: job.error,
    thumbnailUrl: renderedEntry?.screenshotUrl ?? null,
    notifyEmail: job.notifyEmail ?? null,
    notificationStatus: job.notificationStatus ?? "not_requested",
    activeJobCount: job.activeJobCount ?? 0,
    maxActiveJobs: job.maxActiveJobs ?? 3,
    queuePosition: job.queuePosition ?? null,
    isActiveJob: Boolean(job.isActiveJob)
  };
}

function formatJobTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function reportEntryKey(entry: DraftReportEntry) {
  return `${entry.timestamp}:${entry.original}`;
}

function reportStageLabel(stage: string) {
  return reportStageSteps.find((step) => step.id === stage)?.title ?? stage;
}

function reportStageState(job: Pick<ReportJob, "stage" | "status">, stageId: string) {
  if (job.status === "failed") {
    return stageId === job.stage ? "failed" : "pending";
  }

  const currentIndex = reportStageSteps.findIndex((step) => step.id === job.stage);
  const stageIndex = reportStageSteps.findIndex((step) => step.id === stageId);
  if (stageIndex < currentIndex || job.status === "complete") {
    return "done";
  }
  if (stageIndex === currentIndex) {
    return "active";
  }
  return "pending";
}

function stageEventsForJob(job: Pick<ReportJob, "events">, stageId: string) {
  return job.events
    .slice(-8)
    .filter((event) => event.stage === stageId)
    .slice(-2);
}

function canCancelJob(job: Pick<ReportJob | ReportJobSummary, "status">) {
  return job.status === "queued" || job.status === "running";
}

function canRetryJob(job: Pick<ReportJob | ReportJobSummary, "status">) {
  return job.status === "failed" || job.status === "incomplete" || job.status === "canceled";
}

function reportFailureHint(error: string | null) {
  if (!error) {
    return "Retry the report. If it fails again, try a lower depth or a different homepage variant.";
  }

  if (/timed out|fetch failed|Wayback CDX/i.test(error)) {
    return "The Wayback index was slow or unreachable. Retry usually works; use Quick depth if the domain has a large archive.";
  }

  if (/No homepage captures|No captures/i.test(error)) {
    return "Retrosite could not find exact homepage captures for this domain. Try the canonical domain without paths or subdomains.";
  }

  return "Retry the report. If it fails again, lower the depth and keep the failed job details for debugging.";
}

function queueProgressText(job: Pick<ReportJob | ReportJobSummary, "activeJobCount" | "queuePosition" | "progress">) {
  if (job.queuePosition) {
    return `Queue ${job.queuePosition}/${job.activeJobCount ?? job.queuePosition} - ${job.progress}% complete`;
  }

  return `${job.progress}% complete`;
}

function queueSummaryFromJob(job: Pick<ReportJob, "activeJobCount" | "maxActiveJobs">): QueueSummary {
  return {
    activeJobCount: job.activeJobCount ?? 0,
    maxActiveJobs: job.maxActiveJobs ?? 3
  };
}

function entryQualityLabel(entry: DraftReportEntry) {
  if (entry.screenshotStatus === "failed") {
    return "Screenshot failed";
  }
  if (entry.screenshotQuality?.classification === "weak") {
    return "Needs review";
  }
  if (entry.replacementOf) {
    return "Replacement used";
  }
  if (entry.screenshotQuality?.classification === "usable") {
    return "Usable capture";
  }
  return "Pending review";
}

function entryQualityTone(entry: DraftReportEntry) {
  if (entry.screenshotStatus === "failed" || entry.screenshotQuality?.classification === "weak") {
    return "warning";
  }
  if (entry.replacementOf || entry.replacementAttempts.length > 0) {
    return "repair";
  }
  return "usable";
}

function entryQualityDetails(entry: DraftReportEntry) {
  const details = [];
  if (entry.screenshotQuality?.reasons?.length) {
    details.push(`Flagged: ${entry.screenshotQuality.reasons.join(", ")}.`);
  }
  if (entry.replacementOf) {
    details.push(`This is a replacement capture for ${entry.replacementOf}.`);
  }
  if (entry.replacementAttempts.length > 0) {
    details.push(`${entry.replacementAttempts.length} same-year replacement attempt${entry.replacementAttempts.length === 1 ? "" : "s"} checked.`);
  }
  if (entry.screenshotError) {
    details.push(`Render error: ${entry.screenshotError}`);
  }
  return details;
}

function generatedSharePath(job: ReportJob | ReportJobSummary) {
  if ("report" in job) {
    return job.report?.generatedShareUrl ?? (job.report?.generatedReportUrl ? `${job.report.generatedReportUrl}/share` : `/reports/generated/${job.id}/share`);
  }

  return job.generatedShareUrl ?? (job.generatedReportUrl ? `${job.generatedReportUrl}/share` : `/reports/generated/${job.id}/share`);
}

function absoluteAppUrl(pathname: string) {
  return `${window.location.origin}${pathname}`;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function SiteNav() {
  return (
    <header className="site-nav">
      <a href="/" className="site-mark">
        Retrosite
      </a>
      <nav aria-label="Primary navigation">
        <a href="/about">About</a>
      </nav>
    </header>
  );
}

function AboutPage() {
  return (
    <main>
      <SiteNav />
      <section className="about-hero">
        <span className="eyebrow">
          <Archive size={16} />
          About the process
        </span>
        <h1>How Retrosite creates a visual archive report</h1>
        <p>
          Retrosite turns historical Wayback Machine captures into a curated report that shows how a website changed
          over time, with screenshots, source links, technology notes, and replay caveats.
        </p>
      </section>

      <section className="about-process" aria-label="Report creation process">
        {processSteps.map((step) => (
          <article key={step.number}>
            <span>{step.number}</span>
            <h2>{step.title}</h2>
            <p>{step.summary}</p>
            <p>{step.detail}</p>
          </article>
        ))}
      </section>

      <section className="about-notes">
        <div>
          <h2>What the report includes</h2>
          <p>
            A finished report includes selected screenshots, capture dates, Wayback source links, inferred stack details,
            notes about visual changes, and transparent explanations for eras that could not be rendered reliably.
          </p>
        </div>
        <div>
          <h2>Why curation matters</h2>
          <p>
            Archive indexes contain many duplicates and many technically successful captures that do not visually replay.
            The useful artifact is a human-readable timeline of design eras, not a raw dump of every capture.
          </p>
        </div>
        <div>
          <h2>No LLM required</h2>
          <p>
            The MVP runs from deterministic archive discovery, screenshot rendering, visual-quality checks, and editable
            draft fields. An LLM could improve captions later, but the report pipeline does not depend on one.
          </p>
        </div>
      </section>
    </main>
  );
}

function GeneratedJobProgress({
  job,
  canceling,
  onCancel,
  retrying,
  onRetry,
  showActions = true,
  stats
}: {
  job: ReportJob;
  canceling: boolean;
  onCancel: () => void;
  retrying: boolean;
  onRetry: () => void;
  showActions?: boolean;
  stats?: Array<string | false | null | undefined>;
}) {
  const visibleStats = stats?.filter((stat): stat is string => Boolean(stat)) ?? [];

  return (
    <section className="report-job-panel generated-job-panel" aria-label="Generated report job progress">
      <div className="discovery-header">
        <div>
          <span className="eyebrow">
            <Sparkles size={16} />
            Report job
          </span>
          <h1>{job.host}</h1>
          <p>{job.message}</p>
        </div>
        {showActions && (
          <div className="generated-actions inline-actions">
            {canCancelJob(job) && (
              <button type="button" className="ghost-link compact" disabled={canceling} onClick={onCancel}>
                Cancel job
              </button>
            )}
            {canRetryJob(job) && (
              <button type="button" className="primary-link compact" disabled={retrying} onClick={onRetry}>
                Retry job
              </button>
            )}
            <a className="ghost-link compact" href="/">
              Create another report
            </a>
          </div>
        )}
      </div>

      {visibleStats.length > 0 && (
        <section className="job-report-stats" aria-label="Generated report stats">
          {visibleStats.map((stat) => (
            <span key={stat}>{stat}</span>
          ))}
        </section>
      )}

      <div className="job-progress" aria-label={`Report progress ${job.progress}%`}>
        <span style={{ width: `${job.progress}%` }} />
      </div>

      <div className="job-stage-summary">
        <strong>{reportStageLabel(job.stage)}</strong>
        <span>{queueProgressText(job)}</span>
      </div>

      <div className="job-stage-list" aria-label="Report job stages">
        {reportStageSteps.map((step) => {
          const stageUpdates = stageEventsForJob(job, step.id);

          return (
            <div key={step.id} className={reportStageState(job, step.id)}>
              <strong>{step.title}</strong>
              <span>{step.detail}</span>
              {stageUpdates.length > 0 && (
                <ul className="job-stage-updates" aria-label={`${step.title} status updates`}>
                  {stageUpdates.map((event) => (
                    <li key={`${event.at}-${event.message}`}>{event.message}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {job.error && <p className="error-note">{job.error}</p>}
      {job.status === "failed" && <p className="warning-note">{reportFailureHint(job.error)}</p>}
    </section>
  );
}

function GeneratedReportPage({
  job,
  loading,
  error,
  onJobChange
}: {
  job: ReportJob | null;
  loading: boolean;
  error: string;
  onJobChange: (job: ReportJob) => void;
}) {
  const [curationSavingKey, setCurationSavingKey] = useState("");
  const [curationError, setCurationError] = useState("");
  const [editingEntryKey, setEditingEntryKey] = useState("");
  const [entryDraft, setEntryDraft] = useState({ title: "", notes: "", techStack: "" });
  const [editingReport, setEditingReport] = useState(false);
  const [reportDraft, setReportDraft] = useState({ title: "", summary: "" });
  const [reportSaving, setReportSaving] = useState(false);
  const [reportError, setReportError] = useState("");
  const [shareCopyMessage, setShareCopyMessage] = useState("");
  const selectedEntries = job?.report?.curatedEntries ?? [];
  const selectedEntryKeys = useMemo(() => new Set(selectedEntries.map(reportEntryKey)), [selectedEntries]);
  const curatedEntriesByKey = useMemo(
    () => new Map(selectedEntries.map((entry) => [reportEntryKey(entry), entry])),
    [selectedEntries]
  );
  const entries = useMemo(() => {
    const renderedEntries = job?.report?.entries?.filter((entry) => entry.screenshotStatus === "rendered") ?? [];
    return renderedEntries
      .map((entry) => curatedEntriesByKey.get(reportEntryKey(entry)) ?? entry)
      .sort((a, b) => {
        const aIncluded = selectedEntryKeys.has(reportEntryKey(a));
        const bIncluded = selectedEntryKeys.has(reportEntryKey(b));
        if (aIncluded !== bIncluded) {
          return aIncluded ? -1 : 1;
        }
        return a.date.localeCompare(b.date);
      });
  }, [curatedEntriesByKey, job?.report?.entries, selectedEntryKeys]);
  const qualityReviewCount = entries.filter(
    (entry) => entry.screenshotQuality?.classification === "weak" || entry.replacementOf || entry.replacementAttempts.length > 0
  ).length;
  const reportStats = job?.report
    ? [
        `${job.report.stats.captureCount} captures found`,
        `${job.screenshotLimit} max screenshots`,
        `${job.report.stats.renderedCount ?? 0} screenshots rendered`,
        `${job.report.stats.selectedCount ?? selectedEntries.length} selected`,
        job.report.stats.range,
        qualityReviewCount > 0 && `${qualityReviewCount} review signals`
      ]
    : undefined;

  async function updateEntryCuration(
    entry: DraftReportEntry,
    included?: boolean,
    edits?: Pick<DraftReportEntry, "title" | "notes" | "techStack">
  ) {
    if (!job) {
      return;
    }

    const key = reportEntryKey(entry);
    setCurationSavingKey(key);
    setCurationError("");
    try {
      const response = await fetch(`/api/reports/${job.id}/entries`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          timestamp: entry.timestamp,
          original: entry.original,
          ...(typeof included === "boolean" ? { included } : {}),
          ...(edits ? { title: edits.title, notes: edits.notes, techStack: edits.techStack } : {})
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update report curation.");
      }
      onJobChange(payload);
      if (editingEntryKey === key) {
        setEditingEntryKey("");
      }
    } catch (caught) {
      setCurationError(caught instanceof Error ? caught.message : "Unable to update report curation.");
    } finally {
      setCurationSavingKey("");
    }
  }

  function startEntryEdit(entry: DraftReportEntry) {
    setEditingEntryKey(reportEntryKey(entry));
    setEntryDraft({ title: entry.title, notes: entry.notes, techStack: entry.techStack });
    setCurationError("");
  }

  function cancelEntryEdit() {
    setEditingEntryKey("");
    setEntryDraft({ title: "", notes: "", techStack: "" });
  }

  async function saveEntryEdit(entry: DraftReportEntry) {
    await updateEntryCuration(entry, undefined, entryDraft);
  }

  function startReportEdit() {
    if (!job?.report) {
      return;
    }
    setEditingReport(true);
    setReportDraft({ title: job.report.title, summary: job.report.summary });
    setReportError("");
  }

  function cancelReportEdit() {
    setEditingReport(false);
    setReportDraft({ title: "", summary: "" });
  }

  async function updateReportDetails(patch: {
    title?: string;
    summary?: string;
    publicationStatus?: "draft" | "published";
    publish?: boolean;
  }) {
    if (!job) {
      return;
    }

    setReportSaving(true);
    setReportError("");
    try {
      const response = await fetch(`/api/reports/${job.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(patch)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update report details.");
      }
      onJobChange(payload);
      setEditingReport(false);
    } catch (caught) {
      setReportError(caught instanceof Error ? caught.message : "Unable to update report details.");
    } finally {
      setReportSaving(false);
    }
  }

  async function saveReportEdit() {
    await updateReportDetails(reportDraft);
  }

  async function copyShareLink() {
    if (!job) {
      return;
    }

    setShareCopyMessage("");
    setReportError("");
    try {
      await copyTextToClipboard(absoluteAppUrl(generatedSharePath(job)));
      setShareCopyMessage("Share link copied.");
    } catch (caught) {
      setReportError(caught instanceof Error ? caught.message : "Unable to copy share link.");
    }
  }

  async function cancelGeneratedJob() {
    if (!job || !canCancelJob(job)) {
      return;
    }

    setReportSaving(true);
    setReportError("");
    try {
      const response = await fetch(`/api/reports/${job.id}/cancel`, {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to cancel report job.");
      }
      onJobChange(payload);
    } catch (caught) {
      setReportError(caught instanceof Error ? caught.message : "Unable to cancel report job.");
    } finally {
      setReportSaving(false);
    }
  }

  async function retryGeneratedJob() {
    if (!job || !canRetryJob(job)) {
      return;
    }

    setReportSaving(true);
    setReportError("");
    try {
      const response = await fetch(`/api/reports/${job.id}/retry`, {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to retry report job.");
      }
      window.location.assign(`/reports/generated/${payload.id}`);
    } catch (caught) {
      setReportError(caught instanceof Error ? caught.message : "Unable to retry report job.");
    } finally {
      setReportSaving(false);
    }
  }

  return (
    <main>
      <SiteNav />
      <section className="generated-report-page">
        {loading && (
          <div className="generated-loading">
            <Loader2 className="spin" size={22} />
            Loading generated report
          </div>
        )}
        {error && <p className="error-note">{error}</p>}
        {job && (
          <GeneratedJobProgress
            job={job}
            canceling={reportSaving}
            onCancel={() => void cancelGeneratedJob()}
            retrying={reportSaving}
            onRetry={() => void retryGeneratedJob()}
            showActions={!job.report}
            stats={reportStats}
          />
        )}
        {job && !job.report && reportError && <p className="error-note">{reportError}</p>}
        {job?.report && (
          <>
            <div className="section-heading generated-report-heading">
              <span className="eyebrow">
                <Sparkles size={16} />
                {job.status === "incomplete"
                  ? "Needs review"
                  : job.report.publicationStatus === "published"
                    ? "Published report"
                    : "Generated draft"}
              </span>
              {editingReport ? (
                <div className="report-edit-form">
                  <label>
                    Report title
                    <input
                      value={reportDraft.title}
                      onChange={(event) => setReportDraft((draft) => ({ ...draft, title: event.target.value }))}
                      maxLength={140}
                    />
                  </label>
                  <label>
                    Summary
                    <textarea
                      value={reportDraft.summary}
                      onChange={(event) => setReportDraft((draft) => ({ ...draft, summary: event.target.value }))}
                      rows={4}
                      maxLength={500}
                    />
                  </label>
                </div>
              ) : (
                <>
                  <h1>{job.report.title}</h1>
                  <p>{job.report.summary}</p>
                </>
              )}
            </div>

            <div className="generated-actions">
              {editingReport ? (
                <>
                  <button
                    type="button"
                    className="primary-link compact"
                    disabled={reportSaving}
                    onClick={() => void saveReportEdit()}
                  >
                    Save report
                  </button>
                  <button
                    type="button"
                    className="ghost-link compact"
                    disabled={reportSaving}
                    onClick={cancelReportEdit}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="ghost-link compact" disabled={reportSaving} onClick={startReportEdit}>
                  Edit report
                </button>
              )}
              <button
                type="button"
                className="primary-link compact"
                disabled={reportSaving || selectedEntries.length === 0 || job.status === "incomplete"}
                onClick={() =>
                  void updateReportDetails({
                    publicationStatus: job.report!.publicationStatus === "published" ? "draft" : "published"
                  })
                }
              >
                {job.report.publicationStatus === "published" ? "Return to draft" : "Publish draft"}
              </button>
              {canRetryJob(job) && (
                <button
                  type="button"
                  className="primary-link compact"
                  disabled={reportSaving}
                  onClick={() => void retryGeneratedJob()}
                >
                  Retry job
                </button>
              )}
              <a className="primary-link compact" href={`/api/reports/${job.id}/export.md`}>
                <FileText size={16} />
                Export Markdown
              </a>
              <a className="ghost-link compact" href={`/api/reports/${job.id}/export.html`}>
                <FileText size={16} />
                Export HTML
              </a>
              <a className="ghost-link compact" href={`/reports/generated/${job.id}/share`}>
                View share page <ArrowUpRight size={15} />
              </a>
              <button type="button" className="ghost-link compact" onClick={() => void copyShareLink()}>
                <Clipboard size={16} />
                Copy share link
              </button>
            </div>
            {shareCopyMessage && <p className="success-note">{shareCopyMessage}</p>}
            {job.report.publicationStatus === "published" && (
              <p className="success-note">
                Published{job.report.publishedAt ? ` ${formatJobTime(job.report.publishedAt)}` : ""}. This report is ready to share or export.
              </p>
            )}
            {job.status === "incomplete" && (
              <p className="warning-note">
                This run finished with too few usable screenshots. Retry will sample more same-year Wayback captures.
              </p>
            )}
            {reportError && <p className="error-note">{reportError}</p>}
            {curationError && <p className="error-note">{curationError}</p>}

            <div className="generated-entry-list">
              {entries.map((entry) => {
                const key = reportEntryKey(entry);
                const included = selectedEntryKeys.has(key);
                const saving = curationSavingKey === key;
                const editing = editingEntryKey === key;
                const qualityDetails = entryQualityDetails(entry);
                return (
                <article
                  key={`${entry.date}-${entry.original}`}
                  className={`generated-entry ${included ? "included" : "excluded"}`}
                >
                  <div>
                    <span>{entry.date}</span>
                    <em>{included ? "Included" : "Excluded"}</em>
                    {editing ? (
                      <div className="entry-edit-form">
                        <label>
                          Title
                          <input
                            value={entryDraft.title}
                            onChange={(event) => setEntryDraft((draft) => ({ ...draft, title: event.target.value }))}
                            maxLength={140}
                          />
                        </label>
                        <label>
                          Tech stack
                          <input
                            value={entryDraft.techStack}
                            onChange={(event) =>
                              setEntryDraft((draft) => ({ ...draft, techStack: event.target.value }))
                            }
                            maxLength={220}
                          />
                        </label>
                        <label>
                          Notes
                          <textarea
                            value={entryDraft.notes}
                            onChange={(event) => setEntryDraft((draft) => ({ ...draft, notes: event.target.value }))}
                            rows={4}
                            maxLength={500}
                          />
                        </label>
                      </div>
                    ) : (
                      <>
                        <h2>{entry.title}</h2>
                        <dl className="generated-entry-meta">
                          <div>
                            <dt>Tech stack</dt>
                            <dd>{entry.techStack}</dd>
                          </div>
                        </dl>
                        <p>{entry.notes}</p>
                      </>
                    )}
                    <div className={`entry-quality ${entryQualityTone(entry)}`}>
                      <strong>{entryQualityLabel(entry)}</strong>
                      {qualityDetails.length > 0 ? (
                        <ul>
                          {qualityDetails.map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      ) : (
                        <span>No render caveats recorded.</span>
                      )}
                    </div>
                    <div className="generated-entry-actions">
                      <a href={entry.source} target="_blank" rel="noreferrer">
                        Wayback capture <ArrowUpRight size={15} />
                      </a>
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className="primary-link compact"
                            disabled={saving}
                            onClick={() => void saveEntryEdit(entry)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="ghost-link compact"
                            disabled={saving}
                            onClick={cancelEntryEdit}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="ghost-link compact"
                            disabled={saving}
                            onClick={() => startEntryEdit(entry)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-link compact"
                            disabled={saving}
                            onClick={() => void updateEntryCuration(entry, !included)}
                          >
                            {included ? "Exclude" : "Include"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {entry.screenshotUrl && <img src={entry.screenshotUrl} alt={`${entry.date} rendered capture`} />}
                </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function GeneratedShareReportPage({
  job,
  loading,
  error
}: {
  job: ReportJob | null;
  loading: boolean;
  error: string;
}) {
  const entries = job?.report?.curatedEntries ?? [];
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [imageMode, setImageMode] = useState<"focus" | "full">("focus");
  const [shareCopyMessage, setShareCopyMessage] = useState("");
  const [shareCopyError, setShareCopyError] = useState("");
  const activeEntry = entries[Math.min(activeEntryIndex, Math.max(entries.length - 1, 0))] ?? null;
  const shareTitle = job?.report ? `${job.host}: ${job.report.stats.range.replace("-", " - ")}` : "";
  const activeQualityDetails = activeEntry ? entryQualityDetails(activeEntry) : [];

  useEffect(() => {
    setActiveEntryIndex(0);
    setImageMode("focus");
  }, [job?.id]);

  async function copyShareLink() {
    if (!job) {
      return;
    }

    setShareCopyMessage("");
    setShareCopyError("");
    try {
      await copyTextToClipboard(absoluteAppUrl(generatedSharePath(job)));
      setShareCopyMessage("Share link copied.");
    } catch (caught) {
      setShareCopyError(caught instanceof Error ? caught.message : "Unable to copy share link.");
    }
  }

  return (
    <main>
      <SiteNav />
      <section className="timeline-section report-page generated-share-page">
        {loading && (
          <div className="generated-loading">
            <Loader2 className="spin" size={22} />
            Loading share report
          </div>
        )}
        {error && <p className="error-note">{error}</p>}
        {job?.report && (
          <>
            <header className="share-report-heading">
              <div className="section-heading">
                <h1>{shareTitle}</h1>
              </div>
              <div className="share-actions">
                <a className="primary-link compact" href={`/api/reports/${job.id}/export.md`}>
                  <FileText size={16} />
                  Export Markdown
                </a>
                <a className="ghost-link compact" href={`/api/reports/${job.id}/export.html`}>
                  <FileText size={16} />
                  Export HTML
                </a>
                <a className="ghost-link compact" href={`/reports/generated/${job.id}`}>
                  Edit report <ArrowUpRight size={15} />
                </a>
                <button type="button" className="ghost-link compact" onClick={() => void copyShareLink()}>
                  <Clipboard size={16} />
                  Copy share link
                </button>
              </div>
              {shareCopyMessage && <p className="success-note">{shareCopyMessage}</p>}
              {shareCopyError && <p className="error-note">{shareCopyError}</p>}
              {job.report.publicationStatus !== "published" && (
                <p className="warning-note">This is a draft preview. Publish the report when curation is complete.</p>
              )}
            </header>

            <div className="timeline-layout">
              <nav className="timeline-nav" aria-label="Published report entries">
                {entries.map((entry, index) => (
                  <button
                    key={`${entry.timestamp}-${entry.original}`}
                    type="button"
                    className={index === activeEntryIndex ? "active" : ""}
                    aria-label={`${entry.date.slice(0, 4)} ${entry.title}: ${entry.techStack}`}
                    onClick={() => setActiveEntryIndex(index)}
                  >
                    <span>{entry.date.slice(0, 4)}</span>
                    {entry.techStack}
                  </button>
                ))}
              </nav>

              {activeEntry && (
                <div className="timeline-main">
                  <article className="timeline-detail">
                    <div className="detail-copy">
                      <span>{activeEntry.date}</span>
                      <h3>{activeEntry.title}</h3>
                      <p>{activeEntry.notes}</p>
                      <dl>
                        <div>
                          <dt>Tech stack</dt>
                          <dd>{activeEntry.techStack}</dd>
                        </div>
                        <div>
                          <dt>Source</dt>
                          <dd>
                            <a href={activeEntry.source} target="_blank" rel="noreferrer">
                              Wayback capture <ArrowUpRight size={15} />
                            </a>
                          </dd>
                        </div>
                      </dl>
                      <div className={`entry-quality ${entryQualityTone(activeEntry)}`}>
                        <strong>{entryQualityLabel(activeEntry)}</strong>
                        {activeQualityDetails.length > 0 ? (
                          <ul>
                            {activeQualityDetails.map((detail) => (
                              <li key={detail}>{detail}</li>
                            ))}
                          </ul>
                        ) : (
                          <span>No render caveats recorded.</span>
                        )}
                      </div>
                    </div>
                    {activeEntry.screenshotUrl && (
                      <div
                        className={`screenshot-frame ${imageMode}`}
                        style={
                          {
                            "--focus-scale": 1,
                            "--focus-origin": "center top",
                            "--focus-height": "42rem"
                          } as CSSProperties
                        }
                      >
                        <div className="image-mode-toggle" aria-label="Screenshot view mode">
                          <button
                            type="button"
                            className={imageMode === "focus" ? "active" : ""}
                            onClick={() => setImageMode("focus")}
                          >
                            <ZoomIn size={16} />
                            Focus
                          </button>
                          <button
                            type="button"
                            className={imageMode === "full" ? "active" : ""}
                            onClick={() => setImageMode("full")}
                          >
                            <Maximize2 size={16} />
                            Full
                          </button>
                        </div>
                        <img src={activeEntry.screenshotUrl} alt={`${activeEntry.date} ${activeEntry.title}`} />
                      </div>
                    )}
                  </article>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export function App() {
  const [domain, setDomain] = useState("krynsky.com");
  const [screenshotLimit, setScreenshotLimit] = useState(5);
  const [activeEntryIndex, setActiveEntryIndex] = useState(krynskyTimeline.length - 1);
  const [imageMode, setImageMode] = useState<"focus" | "full">("focus");
  const [reportJob, setReportJob] = useState<ReportJob | null>(null);
  const [generatedJob, setGeneratedJob] = useState<ReportJob | null>(null);
  const [generatedLoading, setGeneratedLoading] = useState(false);
  const [generatedError, setGeneratedError] = useState("");
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [recentJobs, setRecentJobs] = useState<ReportJobSummary[]>([]);
  const [recentError, setRecentError] = useState("");
  const [serviceQueue, setServiceQueue] = useState<QueueSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const activeEntry = krynskyTimeline[activeEntryIndex];
  const oldestEntry = krynskyTimeline[0];
  const yearSpan = useMemo(() => {
    const first = krynskyTimeline[0].date.slice(0, 4);
    const last = krynskyTimeline[krynskyTimeline.length - 1].date.slice(0, 4);
    return `${first}-${last}`;
  }, []);
  const reportYearLabel = useMemo(() => {
    const first = krynskyTimeline[0].date.slice(0, 4);
    const last = krynskyTimeline[krynskyTimeline.length - 1].date.slice(0, 4);
    return `${first} - ${last}`;
  }, []);
  const pathname = window.location.pathname;
  const isAboutPage = pathname === "/about";
  const isKrynskyReportPage = pathname === "/reports/krynsky-com";
  const generatedShareReportMatch = pathname.match(/^\/reports\/generated\/([^/]+)\/share$/);
  const generatedShareReportId = generatedShareReportMatch?.[1] ?? "";
  const generatedReportMatch = pathname.match(/^\/reports\/generated\/([^/]+)$/);
  const generatedReportId = generatedReportMatch?.[1] ?? "";
  const activeGeneratedReportId = generatedReportId || generatedShareReportId;
  const isHomePage = !isAboutPage && !isKrynskyReportPage && !activeGeneratedReportId;
  const reportRunning = reportJob?.status === "queued" || reportJob?.status === "running";
  const generatedJobRunning = generatedJob?.status === "queued" || generatedJob?.status === "running";
  const recentJobsRunning = recentJobs.some((job) => job.status === "queued" || job.status === "running");

  useEffect(() => {
    if (!activeGeneratedReportId) {
      return;
    }

    let cancelled = false;
    async function loadGeneratedReport() {
      if (!generatedJobRunning) {
        setGeneratedLoading(true);
      }
      setGeneratedError("");
      try {
        const response = await fetch(`/api/reports/${activeGeneratedReportId}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load generated report.");
        }
        if (!cancelled) {
          setGeneratedJob(payload);
        }
      } catch (caught) {
        if (!cancelled) {
          setGeneratedError(caught instanceof Error ? caught.message : "Unable to load generated report.");
        }
      } finally {
        if (!cancelled) {
          setGeneratedLoading(false);
        }
      }
    }

    void loadGeneratedReport();
    const interval = generatedJobRunning ? window.setInterval(loadGeneratedReport, 1200) : null;
    return () => {
      cancelled = true;
      if (interval) {
        window.clearInterval(interval);
      }
    };
  }, [activeGeneratedReportId, generatedJobRunning]);

  useEffect(() => {
    if (!isHomePage) {
      return;
    }

    let cancelled = false;
    async function loadRecentJobs() {
      try {
        const response = await fetch("/api/reports?limit=8");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load recent reports.");
        }
        if (!cancelled) {
          setRecentJobs(payload.jobs ?? []);
          if (payload.queue) {
            setServiceQueue(payload.queue);
          }
          setRecentError("");
        }
      } catch (caught) {
        if (!cancelled) {
          setRecentError(caught instanceof Error ? caught.message : "Unable to load recent reports.");
        }
      }
    }

    void loadRecentJobs();
    const interval = window.setInterval(loadRecentJobs, recentJobsRunning ? 1200 : 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isHomePage, recentJobsRunning]);

  useEffect(() => {
    if (!reportJob || !reportRunning) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/reports/${reportJob.id}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to check report progress.");
        }
        setReportJob(payload);
        setServiceQueue(queueSummaryFromJob(payload));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to check report progress.");
      }
    }, 800);

    return () => window.clearInterval(interval);
  }, [reportJob, reportRunning]);

  async function startReport(target: string, requestedScreenshotLimit = screenshotLimit, requestedNotifyEmail = "") {
    setLoading(true);
    setError("");
    setExportMessage("");
    setReportJob(null);

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          url: target,
          screenshotLimit: requestedScreenshotLimit,
          notifyEmail: requestedNotifyEmail
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create report job.");
      }
      setReportJob(payload);
      setServiceQueue(queueSummaryFromJob(payload));
      setRecentJobs((jobs) => [summarizeJob(payload), ...jobs.filter((job) => job.id !== payload.id)].slice(0, 8));
      window.location.assign(`/reports/generated/${payload.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create report job.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await startReport(domain);
  }

  async function cancelActiveReportJob() {
    if (!reportJob || !canCancelJob(reportJob)) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/${reportJob.id}/cancel`, {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to cancel report job.");
      }
      setReportJob(payload);
      setServiceQueue(queueSummaryFromJob(payload));
      setRecentJobs((jobs) => [summarizeJob(payload), ...jobs.filter((job) => job.id !== payload.id)].slice(0, 8));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to cancel report job.");
    } finally {
      setLoading(false);
    }
  }

  function handleExportDraft() {
    if (!reportJob?.discovery) {
      return;
    }

    downloadText(`${reportJob.host}-timeline-draft.md`, buildDiscoveryMarkdown(reportJob.discovery));
    setExportMessage(`Export started for ${reportJob.host}-timeline-draft.md.`);
  }

  if (isAboutPage) {
    return <AboutPage />;
  }

  if (isKrynskyReportPage) {
    return (
      <main>
        <SiteNav />
        <section className="timeline-section report-page">
          <div className="section-heading">
            <h1>krynsky.com: {reportYearLabel}</h1>
          </div>

          <div className="timeline-layout">
            <nav className="timeline-nav" aria-label="Timeline entries">
              {krynskyTimeline.map((entry, index) => (
                <button
                  key={entry.date}
                  type="button"
                  className={index === activeEntryIndex ? "active" : ""}
                  aria-label={`${entry.date.slice(0, 4)} ${entry.title}: ${entry.techStack}`}
                  onClick={() => setActiveEntryIndex(index)}
                >
                  <span>{entry.date.slice(0, 4)}</span>
                  {entry.techStack}
                </button>
              ))}
            </nav>

            <div className="timeline-main">
              <article className="timeline-detail">
                <div className="detail-copy">
                  <span>{activeEntry.date}</span>
                  <h3>{activeEntry.title}</h3>
                  <p>{activeEntry.notes}</p>
                  <dl>
                    <div>
                      <dt>Tech stack</dt>
                      <dd>{activeEntry.techStack}</dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>
                        <a href={activeEntry.source} target="_blank" rel="noreferrer">
                          Wayback capture <ArrowUpRight size={15} />
                        </a>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div
                  className={`screenshot-frame ${imageMode}`}
                  style={
                    {
                      "--focus-scale": activeEntry.focusScale ?? 1.08,
                      "--focus-origin": activeEntry.focusOrigin ?? "center top",
                      "--focus-height": activeEntry.focusHeight ?? "42rem"
                    } as CSSProperties
                  }
                >
                  <div className="image-mode-toggle" aria-label="Screenshot view mode">
                    <button
                      type="button"
                      className={imageMode === "focus" ? "active" : ""}
                      onClick={() => setImageMode("focus")}
                    >
                      <ZoomIn size={16} />
                      Focus
                    </button>
                    <button
                      type="button"
                      className={imageMode === "full" ? "active" : ""}
                      onClick={() => setImageMode("full")}
                    >
                      <Maximize2 size={16} />
                      Full
                    </button>
                  </div>
                  <img src={activeEntry.image} alt={activeEntry.title} />
                </div>
              </article>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (generatedShareReportId) {
    return <GeneratedShareReportPage job={generatedJob} loading={generatedLoading} error={generatedError} />;
  }

  if (generatedReportId) {
    return (
      <GeneratedReportPage
        job={generatedJob}
        loading={generatedLoading}
        error={generatedError}
        onJobChange={setGeneratedJob}
      />
    );
  }

  return (
    <main>
      <SiteNav />
      <section className="hero-shell">
        <div className="hero-copy">
          <h1>Retrosite</h1>
          <p>
            Turn a domain into a historical visual timeline using the wayback machine.
          </p>
          <div className="hero-actions">
            <form className="builder-form hero-builder-form" onSubmit={handleDiscover}>
              <label>
                Domain
                <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" />
              </label>
              <label className="report-depth-field">
                Depth
                <select
                  value={screenshotLimit}
                  onChange={(event) => setScreenshotLimit(Number(event.target.value))}
                  aria-label="Report depth"
                >
                  <option value={5}>Quick</option>
                  <option value={12}>Standard</option>
                  <option value={24}>Deep</option>
                </select>
              </label>
              <button type="submit" disabled={loading || reportRunning}>
                {loading || reportRunning ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
                Create Report
              </button>
            </form>
            <div className="builder-note-row">
              <p className="builder-note">Use a public root domain. Local, private, and duplicate running jobs are blocked.</p>
              {serviceQueue && (
                <p className="builder-service-status">
                  {serviceQueue.activeJobCount}/{serviceQueue.maxActiveJobs} jobs active
                </p>
              )}
            </div>
            <a className="featured-report-card" href="/reports/krynsky-com">
              <div className="featured-report-copy">
                <h2>krynsky.com</h2>
                <p>{krynskyTimeline.length} screenshots from {yearSpan.replace("-", " - ")}</p>
              </div>
              <div className="featured-report-image">
                <img src={oldestEntry.image} alt={oldestEntry.title} />
              </div>
            </a>
          </div>
        </div>
      </section>

      {(recentError || recentJobs.length > 0) && (
        <section className="recent-reports-section" aria-label="Recent report jobs">
          <div className="section-heading">
            <span className="eyebrow">
              <FileText size={16} />
              Recent reports
            </span>
            <h2>Generated report jobs</h2>
          </div>

          {recentError && <p className="error-note">{recentError}</p>}

          <div className="recent-report-list">
            {recentJobs.map((job) => (
              <article key={job.id} className={`recent-report-item ${job.status}`}>
                <div className="recent-report-main">
                  <div>
                    <span>{job.status} - {reportStageLabel(job.stage)}</span>
                    <h3>{job.host}</h3>
                    <p>{job.error ?? job.message}</p>
                  </div>
                  {job.thumbnailUrl && <img src={job.thumbnailUrl} alt={`${job.host} generated report thumbnail`} />}
                </div>

                <div className="recent-report-meta">
                  <span>{formatJobTime(job.updatedAt)}</span>
                  <span>{job.screenshotLimit} max screenshots</span>
                  <span>{reportStageLabel(job.stage)}</span>
                  {job.stats?.range && <span>{job.stats.range}</span>}
                  {job.stats?.selectedCount && <span>{job.stats.selectedCount} selected</span>}
                  {job.queuePosition && <span>Queue {job.queuePosition}/{job.activeJobCount ?? job.queuePosition}</span>}
                  {(job.status === "queued" || job.status === "running") && <span>{job.progress}%</span>}
                </div>

                {(job.status === "queued" || job.status === "running") && (
                  <div className="job-progress compact-progress" aria-label={`${job.host} progress ${job.progress}%`}>
                    <span style={{ width: `${job.progress}%` }} />
                  </div>
                )}

                <div className="recent-report-actions">
                  {job.generatedReportUrl && (
                    <a className="primary-link compact" href={job.generatedReportUrl}>
                      Open report <ArrowUpRight size={15} />
                    </a>
                  )}
                  {job.generatedReportUrl && (
                    <a className="ghost-link compact" href={`/api/reports/${job.id}/export.md`}>
                      <FileText size={15} />
                      Markdown
                    </a>
                  )}
                  {job.generatedReportUrl && (
                    <a className="ghost-link compact" href={`/api/reports/${job.id}/export.html`}>
                      <FileText size={15} />
                      HTML
                    </a>
                  )}
                  {job.generatedReportUrl && (
                    <a className="ghost-link compact" href={generatedSharePath(job)}>
                      Share <ArrowUpRight size={15} />
                    </a>
                  )}
                  {job.status === "failed" && (
                    <p className="recent-failure-hint">{reportFailureHint(job.error)}</p>
                  )}
                  {canRetryJob(job) && (
                    <button
                      type="button"
                      className="ghost-link compact"
                      onClick={() => void startReport(job.host, job.screenshotLimit)}
                    >
                      Retry
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {(error || reportJob) && (
        <section className="builder-section" id="builder">
          {error && <p className="error-note">{error}</p>}

          {reportJob && (
            <section className="report-job-panel" aria-label="Report job progress">
              <div className="discovery-header">
                <div>
                  <span className="eyebrow">
                    <Sparkles size={16} />
                    Report job
                  </span>
                  <h3>{reportJob.host}</h3>
                  <p>{reportJob.message}</p>
                </div>
                <div className="generated-actions inline-actions">
                  {canCancelJob(reportJob) && (
                    <button
                      type="button"
                      className="ghost-link compact"
                      disabled={loading}
                      onClick={() => void cancelActiveReportJob()}
                    >
                      Cancel job
                    </button>
                  )}
                  {reportJob.discovery && (
                    <button
                      type="button"
                      className="ghost-link compact"
                      onClick={handleExportDraft}
                    >
                      <FileText size={17} />
                      Export draft
                    </button>
                  )}
                </div>
              </div>

              <div className="job-progress" aria-label={`Report progress ${reportJob.progress}%`}>
                <span style={{ width: `${reportJob.progress}%` }} />
              </div>

              <div className="job-stage-summary">
                <strong>{reportStageLabel(reportJob.stage)}</strong>
                <span>{queueProgressText(reportJob)}</span>
              </div>

              <div className="job-stage-list" aria-label="Report job stages">
                {reportStageSteps.map((step) => {
                  const stageUpdates = stageEventsForJob(reportJob, step.id);

                  return (
                    <div key={step.id} className={reportStageState(reportJob, step.id)}>
                      <strong>{step.title}</strong>
                      <span>{step.detail}</span>
                      {stageUpdates.length > 0 && (
                        <ul className="job-stage-updates" aria-label={`${step.title} status updates`}>
                          {stageUpdates.map((event) => (
                            <li key={`${event.at}-${event.message}`}>{event.message}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>

              {reportJob.error && <p className="error-note">{reportJob.error}</p>}
              {reportJob.status === "failed" && <p className="warning-note">{reportFailureHint(reportJob.error)}</p>}
              {exportMessage && <p className="success-note">{exportMessage}</p>}

              {reportJob.discovery && (
                <>
                  {reportJob.discovery.warning && <p className="warning-note">{reportJob.discovery.warning}</p>}
                  <div className="variant-status-list" aria-label="Wayback query status">
                    {reportJob.discovery.variantStatus?.map((variant) => (
                      <span key={variant.variant} className={variant.status === "ok" ? "ok" : "failed"}>
                        {variant.variant} - {variant.status === "ok" ? `${variant.captureCount} captures` : "failed"}
                      </span>
                    ))}
                  </div>
                  <div className="year-strip">
                    {reportJob.discovery.yearSummary.slice(0, 28).map((year) => (
                      <span key={year.year} title={`${year.count} captures`}>
                        {year.year}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {reportJob.report && (
                <div className="draft-report">
                  <div>
                    <span className="eyebrow">Draft report</span>
                    <h4>{reportJob.report.title}</h4>
                    <p>{reportJob.report.summary}</p>
                  </div>
                  <div className="draft-report-stats">
                    <span>{reportJob.report.stats.captureCount} captures</span>
                    <span>{reportJob.report.stats.candidateCount} candidate eras</span>
                    <span>{reportJob.screenshotLimit} max screenshots</span>
                    <span>{reportJob.report.stats.renderedCount ?? 0} rendered</span>
                    <span>{reportJob.report.stats.range}</span>
                  </div>
                  {reportJob.report.generatedReportUrl && (
                    <a className="primary-link compact" href={reportJob.report.generatedReportUrl}>
                      Open generated report <ArrowUpRight size={16} />
                    </a>
                  )}
                  {reportJob.report.generatedReportUrl && (
                    <a className="ghost-link compact" href={`/api/reports/${reportJob.id}/export.html`}>
                      <FileText size={16} />
                      Export HTML
                    </a>
                  )}
                  <div className="candidate-list">
                    {reportJob.report.entries.slice(0, 12).map((entry) => (
                      <a key={`${entry.date}-${entry.original}`} href={entry.source} target="_blank" rel="noreferrer">
                        {entry.screenshotUrl && (
                          <img src={entry.screenshotUrl} alt={`${entry.date} candidate capture screenshot`} />
                        )}
                        <strong>{entry.date}</strong>
                        <span>{entry.original}</span>
                        <em>
                          {entry.replacementOf ? "replacement " : ""}
                          {entry.screenshotQuality?.classification ?? entry.screenshotStatus}
                        </em>
                        <ArrowUpRight size={16} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </section>
      )}

    </main>
  );
}
