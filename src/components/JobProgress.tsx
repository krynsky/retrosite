import { Sparkles } from "lucide-react";
import type { ReportJob } from "../types";
import {
  reportStageSteps,
  reportStageLabel,
  reportStageState,
  stageEventsForJob,
  canCancelJob,
  canRetryJob,
  reportFailureHint,
  queueProgressText
} from "../helpers";

export function JobProgress({
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
