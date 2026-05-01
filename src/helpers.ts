import type { ReportJob, ReportJobSummary, DraftReportEntry, DiscoveryResult, QueueSummary } from "./types";

export const reportStageSteps = [
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

export function buildDiscoveryMarkdown(discovery: DiscoveryResult) {
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

export function downloadText(filename: string, text: string) {
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

export function summarizeJob(job: ReportJob): ReportJobSummary {
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

export function formatJobTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function reportEntryKey(entry: DraftReportEntry) {
  return `${entry.timestamp}:${entry.original}`;
}

export function reportStageLabel(stage: string) {
  return reportStageSteps.find((step) => step.id === stage)?.title ?? stage;
}

export function reportStageState(job: Pick<ReportJob, "stage" | "status">, stageId: string) {
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

export function stageEventsForJob(job: Pick<ReportJob, "events">, stageId: string) {
  return job.events
    .slice(-8)
    .filter((event) => event.stage === stageId)
    .slice(-2);
}

export function canCancelJob(job: Pick<ReportJob | ReportJobSummary, "status">) {
  return job.status === "queued" || job.status === "running";
}

export function canRetryJob(job: Pick<ReportJob | ReportJobSummary, "status">) {
  return job.status === "failed" || job.status === "incomplete" || job.status === "canceled";
}

export function reportFailureHint(error: string | null) {
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

export function queueProgressText(job: Pick<ReportJob | ReportJobSummary, "activeJobCount" | "queuePosition" | "progress">) {
  if (job.queuePosition) {
    return `Queue ${job.queuePosition}/${job.activeJobCount ?? job.queuePosition} - ${job.progress}% complete`;
  }

  return `${job.progress}% complete`;
}

export function queueSummaryFromJob(job: Pick<ReportJob, "activeJobCount" | "maxActiveJobs">): QueueSummary {
  return {
    activeJobCount: job.activeJobCount ?? 0,
    maxActiveJobs: job.maxActiveJobs ?? 3
  };
}

export function entryQualityLabel(entry: DraftReportEntry) {
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

export function entryQualityTone(entry: DraftReportEntry) {
  if (entry.screenshotStatus === "failed" || entry.screenshotQuality?.classification === "weak") {
    return "warning";
  }
  if (entry.replacementOf || entry.replacementAttempts.length > 0) {
    return "repair";
  }
  return "usable";
}

export function entryQualityDetails(entry: DraftReportEntry) {
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

export function generatedSharePath(job: ReportJob | ReportJobSummary) {
  return `/timeline/${encodeURIComponent(job.host)}/share`;
}

export function absoluteAppUrl(pathname: string) {
  return `${window.location.origin}${pathname}`;
}

export async function copyTextToClipboard(text: string) {
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
