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

const userSteps = [
  { id: "queued", label: "Queue", description: "Waiting in queue…" },
  { id: "discovering", label: "Discover", description: "Searching the Wayback Machine…" },
  { id: "selecting", label: "Index", description: "Grouping capture years…" },
  { id: "rendering", label: "Render", description: "Taking screenshots…" },
  { id: "repairing", label: "Repair", description: "Replacing weak captures…" },
  { id: "curating", label: "Curate", description: "Building your timeline…" }
];

const adminStageSteps = reportStageSteps.filter((step) => step.id !== "queued");

function userStepState(jobStage: string, jobStatus: string, stepId: string): "done" | "active" | "pending" {
  if (jobStatus === "failed") {
    return stepId === jobStage ? "active" : "pending";
  }
  if (jobStatus === "complete" || jobStatus === "incomplete") {
    return "done";
  }
  const currentIndex = userSteps.findIndex((s) => s.id === jobStage);
  const stepIndex = userSteps.findIndex((s) => s.id === stepId);
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

export function JobProgress({
  job,
  isAdmin = false,
  canceling,
  onCancel,
  retrying,
  onRetry,
  showActions = true
}: {
  job: ReportJob;
  isAdmin?: boolean;
  canceling: boolean;
  onCancel: () => void;
  retrying: boolean;
  onRetry: () => void;
  showActions?: boolean;
}) {
  const isRunning = job.status === "queued" || job.status === "running";
  const activeUserStep = userSteps.find((s) => s.id === job.stage);

  return (
    <section className="report-job-panel generated-job-panel" aria-label="Report job progress">
      <div className="discovery-header">
        <div>
          <span className="eyebrow">
            <Sparkles size={16} />
            Report job
          </span>
          <h1>{job.host}</h1>
          {isAdmin
            ? <p>{job.message}</p>
            : <p className="friendly-stage-message">{activeUserStep?.description ?? job.message}</p>
          }
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
            {!isRunning && (
              <a className="ghost-link compact" href="/">
                Create another report
              </a>
            )}
          </div>
        )}
      </div>

      <div className="job-progress" aria-label={`Report progress ${job.progress}%`}>
        <span style={{ width: `${job.progress}%` }} />
      </div>

      {!isAdmin && (
        <ol className="user-step-list" aria-label="Report steps">
          {userSteps.map((step, index) => (
            <li key={step.id} className={`user-step ${userStepState(job.stage, job.status, step.id)}`}>
              <span className="user-step-number">{index + 1}</span>
              <span className="user-step-label">{step.label}</span>
            </li>
          ))}
        </ol>
      )}

      {isAdmin && (
        <>
          <div className="job-stage-summary">
            <strong>{reportStageLabel(job.stage)}</strong>
            <span>{queueProgressText(job)}</span>
          </div>

          {job.archiveProfile && (
            <div className="job-depth-summary">
              <strong>{job.archiveProfile.depthMode} depth</strong>
              <span>
                {job.archiveProfile.captureCount.toLocaleString()} captures, {job.archiveProfile.archiveSize} archive,
                rendering up to {job.archiveProfile.screenshotLimit} final screenshots.
              </span>
              <span>{job.archiveProfile.reason}</span>
            </div>
          )}

          <div className="job-stage-list" aria-label="Report job stages">
            {adminStageSteps.map((step) => {
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
        </>
      )}

      {job.error && <p className="error-note">{job.error}</p>}
      {job.status === "failed" && <p className="warning-note">{reportFailureHint(job.error)}</p>}
    </section>
  );
}
