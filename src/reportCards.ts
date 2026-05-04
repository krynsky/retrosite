import type { ReportJob, ReportJobSummary } from "./types";
import { reportEntryKey, timelinePath } from "./helpers";

export function reportJobToSummary(job: ReportJob): ReportJobSummary {
  const entries = [...(job.report?.curatedEntries ?? []), ...(job.report?.entries ?? [])];
  const thumbnailKey = job.report?.thumbnailEntryKey ?? "";
  const renderedEntry = entries.find((entry) => thumbnailKey && reportEntryKey(entry) === thumbnailKey && entry.screenshotUrl)
    ?? entries.find((entry) => entry.screenshotUrl);

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
    depthMode: job.depthMode ?? "adaptive",
    screenshotLimit: job.screenshotLimit,
    archiveProfile: job.archiveProfile ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    generatedReportUrl: timelinePath(job.host),
    generatedShareUrl: `${timelinePath(job.host)}/share`,
    stats: job.report?.stats ?? null,
    error: job.error,
    thumbnailUrl: renderedEntry?.screenshotUrl ?? job.report?.thumbnailUrl ?? null,
    notifyEmail: null,
    notificationStatus: job.notificationStatus,
    activeJobCount: job.activeJobCount,
    maxActiveJobs: job.maxActiveJobs,
    queuePosition: job.queuePosition,
    isActiveJob: job.isActiveJob
  };
}
