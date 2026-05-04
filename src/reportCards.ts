import { krynskyTimeline } from "./data/krynskyTimeline";
import type { ReportJob, ReportJobSummary } from "./types";
import { timelinePath } from "./helpers";

export function seedReportCard(): ReportJobSummary {
  const first = krynskyTimeline[0];
  const last = krynskyTimeline[krynskyTimeline.length - 1];
  const firstYear = first.date.slice(0, 4);
  const lastYear = last.date.slice(0, 4);

  return {
    id: "krynsky-com-seed",
    target: "https://krynsky.com",
    host: "krynsky.com",
    status: "complete",
    stage: "complete",
    progress: 100,
    message: "",
    screenshotLimit: krynskyTimeline.length,
    createdAt: first.date,
    updatedAt: last.date,
    generatedReportUrl: "/timeline/krynsky.com",
    generatedShareUrl: "/timeline/krynsky.com/share",
    stats: {
      captureCount: krynskyTimeline.length,
      candidateCount: krynskyTimeline.length,
      yearCount: krynskyTimeline.length,
      range: `${firstYear}-${lastYear}`,
      renderedCount: krynskyTimeline.length,
      selectedCount: krynskyTimeline.length
    },
    error: null,
    thumbnailUrl: first.image,
    notifyEmail: null,
    notificationStatus: "not_requested",
    activeJobCount: 0,
    maxActiveJobs: 3,
    queuePosition: null,
    isActiveJob: false
  };
}

export function reportJobToSummary(job: ReportJob): ReportJobSummary {
  const renderedEntry = job.report?.curatedEntries?.find((entry) => entry.screenshotUrl)
    ?? job.report?.entries?.find((entry) => entry.screenshotUrl);

  return {
    id: job.id,
    storageKey: job.storageKey,
    target: job.target,
    host: job.host,
    version: job.version,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    screenshotLimit: job.screenshotLimit,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    generatedReportUrl: timelinePath(job.host),
    generatedShareUrl: `${timelinePath(job.host)}/share`,
    stats: job.report?.stats ?? null,
    error: job.error,
    thumbnailUrl: renderedEntry?.screenshotUrl ?? null,
    notifyEmail: null,
    notificationStatus: job.notificationStatus,
    activeJobCount: job.activeJobCount,
    maxActiveJobs: job.maxActiveJobs,
    queuePosition: job.queuePosition,
    isActiveJob: job.isActiveJob
  };
}
