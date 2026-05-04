import { Loader2 } from "lucide-react";
import type { ReportJobSummary } from "../types";
import { formatJobTime, reportStageLabel, timelinePath } from "../helpers";

export function ReportCard({
  job,
  admin,
  onDelete
}: {
  job: ReportJobSummary;
  admin?: boolean;
  onDelete?: (id: string) => void;
}) {
  const isRunning = job.status === "queued" || job.status === "running";
  const reportUrl = timelinePath(job.host);
  const statusLabel = job.status.toUpperCase();
  const stageLabel = reportStageLabel(job.stage).toUpperCase();

  return (
    <article className={`timeline-card timeline-card--${job.status}`}>
      <a href={reportUrl} className="timeline-card-link">
        <div className="timeline-thumb">
          {job.thumbnailUrl ? (
            <img src={job.thumbnailUrl} alt={`${job.host} archive thumbnail`} />
          ) : (
            <div className="timeline-thumb-empty" aria-hidden="true" />
          )}
        </div>
        <div className="timeline-card-domain">{job.host}</div>
        <div className="timeline-card-status">
          {isRunning && <Loader2 className="spin" size={11} aria-hidden="true" />}
          {statusLabel} <span className="timeline-card-status-dash">—</span> {stageLabel}
        </div>
        {job.stats?.range && <div className="timeline-card-range">{job.stats.range}</div>}
        <div className="timeline-card-time">{formatJobTime(job.updatedAt)}</div>
      </a>
      {isRunning && (
        <div className="timeline-card-progress" aria-label={`${job.host} progress ${job.progress}%`}>
          <span style={{ width: `${job.progress}%` }} />
        </div>
      )}
      {admin && onDelete && (
        <button
          type="button"
          className="timeline-card-delete"
          onClick={(e) => {
            e.preventDefault();
            onDelete(job.id);
          }}
        >
          Delete
        </button>
      )}
    </article>
  );
}
