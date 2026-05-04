import { useEffect, useMemo, useState } from "react";
import { Clipboard, FileText, Loader2, RefreshCw } from "lucide-react";
import { krynskyTimeline } from "../data/krynskyTimeline";
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

function useSeedReportRange() {
  return useMemo(() => {
    const first = krynskyTimeline[0].date.slice(0, 4);
    const last = krynskyTimeline[krynskyTimeline.length - 1].date.slice(0, 4);
    return `${first} – ${last}`;
  }, []);
}

export function ReportPage({ domain, version }: { domain: string; version?: number }) {
  const seedRange = useSeedReportRange();

  const [job, setJob] = useState<ReportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [shareCopyMessage, setShareCopyMessage] = useState("");
  const [versions, setVersions] = useState<ReportVersionSummary[]>([]);
  const [rerunning, setRerunning] = useState(false);
  const { config } = useAppConfig();

  const isRunning = job?.status === "queued" || job?.status === "running";
  const entries = job?.report?.curatedEntries ?? [];
  const hasEntries = entries.length > 0;
  const isAdmin = config.canEditReports;
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

  async function rerunReport() {
    if (!job) return;
    setRerunning(true);
    setActionError("");
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(domain)}/rerun`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to re-run report.");
      window.location.assign(timelinePath(payload.host ?? domain));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to re-run report.");
      setRerunning(false);
    }
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

  const isSeedView = job?.id === "krynsky-com-seed" && !hasEntries;
  const reportDomain = job?.host ?? "";
  const reportRange = isSeedView ? seedRange : (job?.report?.stats.range.replace("-", " – ") ?? "");

  const isLatestVersion = version == null;
  const jobIsTerminal = job && !isRunning;

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

        {job && !isSeedView && (isRunning || !job.report) && (
          <JobProgress
            job={job}
            isAdmin={isAdmin}
            canceling={actionSaving}
            onCancel={() => void cancelJob()}
            retrying={actionSaving}
            onRetry={() => void retryJob()}
            showActions={true}
          />
        )}

        {actionError && <p className="error-note">{actionError}</p>}

        {job && isSeedView && (
          <TimelineView
            domain={reportDomain}
            range={reportRange}
            seedEntries={krynskyTimeline}
          />
        )}

        {job && !isSeedView && hasEntries && (
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
                  <button type="button" className="primary-link compact" onClick={() => void copyShareLink()}>
                    <Clipboard size={16} />
                    Copy share link
                  </button>
                  {isAdmin && jobIsTerminal && isLatestVersion && (
                    <button
                      type="button"
                      className="primary-link compact"
                      disabled={rerunning}
                      onClick={() => void rerunReport()}
                    >
                      {rerunning ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                      Re-run report
                    </button>
                  )}
                </>
              }
            />
            {shareCopyMessage && <p className="success-note">{shareCopyMessage}</p>}

            <RunSummary job={job} isAdmin={isAdmin} />

            {isAdmin && versions.length > 1 && (
              <div className="version-history">
                <h3>Version history</h3>
                <div className="version-list">
                  {versions.map((v) => {
                    const isCurrent = (job.version ?? 1) === v.version;
                    const versionUrl = v.version === versions[0].version
                      ? timelinePath(domain)
                      : `${timelinePath(domain)}/v/${v.version}`;
                    return (
                      <a
                        key={v.version}
                        href={versionUrl}
                        className={`version-item${isCurrent ? " active" : ""}`}
                      >
                        <strong>v{v.version}</strong>
                        <span className="version-status">{v.status}</span>
                        <span>{v.entryCount} entries</span>
                        <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {isAdmin && (
              <AdminControls job={job} onJobChange={setJob} />
            )}
          </>
        )}
      </section>
    </main>
  );
}
