import { Loader2 } from "lucide-react";
import type { ReportJobSummary } from "../types";
import { formatJobTime, reportStageLabel } from "../helpers";

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
  const reportUrl = `/reports/generated/${job.id}`;

  return (
    <article className={`report-card ${job.status}`}>
      <a href={reportUrl} className="report-card-link">
        {job.thumbnailUrl && (
          <img src={job.thumbnailUrl} alt={`${job.host} report thumbnail`} className="report-card-thumb" />
        )}
        <div className="report-card-body">
          <h3>{job.host}</h3>
          <span className="report-card-status">
            {isRunning && <Loader2 className="spin" size={14} />}
            {job.status} — {reportStageLabel(job.stage)}
          </span>
          {job.stats?.range && <span className="report-card-range">{job.stats.range}</span>}
          <span className="report-card-time">{formatJobTime(job.updatedAt)}</span>
        </div>
      </a>
      {isRunning && (
        <div className="job-progress compact-progress" aria-label={`${job.host} progress ${job.progress}%`}>
          <span style={{ width: `${job.progress}%` }} />
        </div>
      )}
      {admin && onDelete && (
        <button
          type="button"
          className="ghost-link compact report-card-delete"
          onClick={(e) => { e.preventDefault(); onDelete(job.id); }}
        >
          Delete
        </button>
      )}
    </article>
  );
}
