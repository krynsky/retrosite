import { krynskyTimeline } from "./data/krynskyTimeline";
import type { ReportJobSummary } from "./types";

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
