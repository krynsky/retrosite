import { useEffect, useState } from "react";
import { Clipboard, FileText, Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { ReportJob, ReportVersionSummary } from "../types";
import {
  absoluteAppUrl,
  canCancelJob,
  canRetryJob,
  copyTextToClipboard,
  generatedSharePath,
  timelineAssetPath,
  timelinePath
} from "../helpers";
import { useAppConfig } from "../useAppConfig";
import { SiteNav } from "./SiteNav";
import { JobProgress } from "./JobProgress";
import { RunSummary } from "./RunSummary";
import { TimelineView } from "./TimelineView";
import { AdminControls } from "./AdminControls";

export function ReportPage({ domain, version }: { domain: string; version?: number }) {
  const [job, setJob] = useState<ReportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [shareCopyMessage, setShareCopyMessage] = useState("");
  const [versions, setVersions] = useState<ReportVersionSummary[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deletingVersionId, setDeletingVersionId] = useState("");
  const { config } = useAppConfig();

  const isRunning = job?.status === "queued" || job?.status === "running";
  const curatedEntries = job?.report?.curatedEntries ?? [];
  const renderedEntries = job?.report?.entries?.filter((entry) => (
    entry.screenshotStatus === "rendered" && Boolean(entry.screenshotUrl)
  )) ?? [];
  const entries = curatedEntries.length > 0 ? curatedEntries : renderedEntries;
  const hasEntries = entries.length > 0;
  const isAdmin = config.canEditReports;
  const isDemoSite = config.mode === "request-only";
  const staticMarkdownExport = job?.report?.exports?.markdownUrl;
  const staticHtmlExport = job?.report?.exports?.htmlUrl;

  useEffect(() => {
    let cancelled = false;

    async function fetchJob() {
      if (!isRunning) {
        setLoading(true);
      }
      setFetchError("");
      try {
        const versionParam = version != null ? `?version=${version}` : "";
        const response = await fetch(`/api/reports/${encodeURIComponent(domain)}${versionParam}`);
        if (response.ok) {
          const payload = await response.json();
          if (!cancelled) {
            setJob(payload);
          }
        } else {
          if (version == null) {
            let staticResponse = await fetch(`/timelines/${timelineAssetPath(domain)}/timeline.json`);
            if (!staticResponse.ok && domain.includes("/")) {
              staticResponse = await fetch(`/timelines/${encodeURIComponent(domain)}/timeline.json`);
            }
            if (staticResponse.ok) {
              const staticPayload = await staticResponse.json();
              if (!cancelled) {
                setJob(staticPayload);
              }
              return;
            }
          }
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error ?? "Unable to load report.");
        }
      } catch (caught) {
        if (!cancelled) {
          setFetchError(caught instanceof Error ? caught.message : "Unable to load report.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchJob();
    const interval = isRunning ? window.setInterval(fetchJob, 1200) : null;
    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, version, isRunning]);

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;
    async function fetchVersions() {
      try {
        const response = await fetch(`/api/reports/${encodeURIComponent(domain)}/versions`);
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) setVersions(payload.versions ?? []);
      } catch {
        // non-critical
      }
    }
    void fetchVersions();
    return () => { cancelled = true; };
  }, [domain, isAdmin, job?.version]);

  async function cancelJob() {
    if (!job || !canCancelJob(job)) return;
    setActionSaving(true);
    setActionError("");
    try {
      const response = await fetch(`/api/reports/${job.id}/cancel`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to cancel job.");
      setJob(payload);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to cancel job.");
    } finally {
      setActionSaving(false);
    }
  }

  async function retryJob() {
    if (!job || !canRetryJob(job)) return;
    setActionSaving(true);
    setActionError("");
    try {
      const response = await fetch(`/api/reports/${job.id}/retry`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to retry job.");
      window.location.assign(timelinePath(payload.host ?? domain));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to retry job.");
      setActionSaving(false);
    }
  }

  async function deleteReportById(reportId: string, options?: { current?: boolean }) {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    if (options?.current) {
      setDeleting(true);
    } else {
      setDeletingVersionId(reportId);
    }
    setActionError("");
    try {
      const response = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to delete report.");
      }
      if (options?.current || job?.id === reportId) {
        window.location.assign(timelinePath(domain));
        return;
      }
      setVersions((currentVersions) => currentVersions.filter((versionItem) => versionItem.id !== reportId));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to delete report.");
    } finally {
      if (options?.current) {
        setDeleting(false);
      } else {
        setDeletingVersionId("");
      }
    }
  }

  async function deleteReport() {
    if (!job) return;
    await deleteReportById(job.id, { current: true });
  }

  async function copyShareLink() {
    if (!job) return;
    setShareCopyMessage("");
    setActionError("");
    try {
      await copyTextToClipboard(absoluteAppUrl(generatedSharePath(job)));
      setShareCopyMessage("Share link copied.");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to copy share link.");
    }
  }

  const reportDomain = job?.host ?? "";
  const reportRange = job?.report?.stats.range.replace("-", " - ") ?? "";

  const isLatestVersion = version == null;
  const jobIsTerminal = job && !isRunning;
  const canManageReport = isAdmin && jobIsTerminal;
  const hasReportWithoutEntries = Boolean(job?.report && !hasEntries && !isRunning);
  const shouldShowJobProgress = Boolean(job && (isRunning || !job.report || hasReportWithoutEntries));
  const versionHistory = isAdmin && versions.length > 1 && (
    <div className="version-history">
      <h3>Version history</h3>
      <div className="version-list">
        {versions.map((v) => {
          const isCurrent = (job?.version ?? 1) === v.version;
          const isVersionActive = v.status === "queued" || v.status === "running";
          const canDeleteVersion = !isVersionActive;
          const versionUrl = v.version === versions[0].version
            ? timelinePath(domain)
            : `${timelinePath(domain)}/v/${v.version}`;
          return (
            <div key={v.version} className="version-row">
              <a
                href={versionUrl}
                className={`version-item${isCurrent ? " active" : ""}`}
              >
                <strong>v{v.version}</strong>
                <span className="version-status">{v.status}</span>
                <span>{v.entryCount} entries</span>
                <span>{new Date(v.createdAt).toLocaleDateString()}</span>
              </a>
              {canDeleteVersion && (
                <button
                  type="button"
                  className="ghost-link compact version-delete"
                  disabled={Boolean(deletingVersionId) || deleting}
                  onClick={() => void deleteReportById(v.id)}
                >
                  {deletingVersionId === v.id ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                  Delete
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <main className="page paper-bg">
      <SiteNav />
      <section className="generated-report-page">
        {loading && (
          <div className="generated-loading">
            <Loader2 className="spin" size={22} />
            Loading report
          </div>
        )}
        {fetchError && <p className="error-note">{fetchError}</p>}

        {version != null && job && (
          <p className="warning-note">
            Viewing version {version}.{" "}
            <a href={timelinePath(domain)}>
              Go to latest version
            </a>
          </p>
        )}

        {job && shouldShowJobProgress && (
          <>
            <JobProgress
              job={job}
              isAdmin={isAdmin}
              canceling={actionSaving}
              onCancel={() => void cancelJob()}
              retrying={actionSaving}
              onRetry={() => void retryJob()}
              showActions={true}
            />
            {canManageReport && (
              <div className="generated-actions inline-actions report-admin-actions">
                <button
                  type="button"
                  className="ghost-link compact"
                  disabled={deleting}
                  onClick={() => void deleteReport()}
                >
                  {deleting ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                  Delete report
                </button>
              </div>
            )}
            {versionHistory}
            {hasReportWithoutEntries && (
              <>
                <RunSummary job={job} isAdmin={isAdmin} />
                {isAdmin && (
                  <AdminControls job={job} onJobChange={setJob} />
                )}
              </>
            )}
          </>
        )}

        {actionError && <p className="error-note">{actionError}</p>}

        {job && hasEntries && (
          <>
            <TimelineView
              domain={reportDomain}
              range={reportRange}
              createdAt={job.createdAt}
              generatedEntries={entries}
              actions={
                <>
                  <a className="primary-link compact" href={staticMarkdownExport ?? `/api/reports/${job.id}/export.md`}>
                    <FileText size={16} />
                    Export Markdown
                  </a>
                  <a className="primary-link compact" href={staticHtmlExport ?? `/api/reports/${job.id}/export.html`}>
                    <FileText size={16} />
                    Export HTML
                  </a>
                  {isDemoSite && (
                    <button type="button" className="primary-link compact" onClick={() => void copyShareLink()}>
                      <Clipboard size={16} />
                      Copy share link
                    </button>
                  )}
                  {canManageReport && (
                    <>
                      {isLatestVersion && (
                        <a
                          className="primary-link compact"
                          href={`/?target=${encodeURIComponent(job.host ?? domain)}`}
                        >
                          <RefreshCw size={16} />
                          New version
                        </a>
                      )}
                      <button
                        type="button"
                        className="ghost-link compact"
                        disabled={deleting}
                        onClick={() => void deleteReport()}
                      >
                        {deleting ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                        Delete report
                      </button>
                    </>
                  )}
                </>
              }
            />
            {shareCopyMessage && <p className="success-note">{shareCopyMessage}</p>}

            <RunSummary job={job} isAdmin={isAdmin} />

            {versionHistory}

            {isAdmin && (
              <AdminControls job={job} onJobChange={setJob} />
            )}
          </>
        )}
      </section>
    </main>
  );
}

