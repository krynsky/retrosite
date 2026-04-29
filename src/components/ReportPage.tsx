import { useEffect, useMemo, useState } from "react";
import { Clipboard, FileText, Loader2 } from "lucide-react";
import { krynskyTimeline } from "../data/krynskyTimeline";
import type { ReportJob } from "../types";
import { absoluteAppUrl, canCancelJob, canRetryJob, copyTextToClipboard, generatedSharePath } from "../helpers";
import { SiteNav } from "./SiteNav";
import { JobProgress } from "./JobProgress";
import { TimelineView } from "./TimelineView";
import { AdminControls } from "./AdminControls";

function useSeedReportTitle() {
  return useMemo(() => {
    const first = krynskyTimeline[0].date.slice(0, 4);
    const last = krynskyTimeline[krynskyTimeline.length - 1].date.slice(0, 4);
    return `krynsky.com: ${first} - ${last}`;
  }, []);
}

export function ReportPage({ domain }: { domain: string }) {
  const isSeed = domain === "krynsky.com" || domain === "krynsky-com-seed";
  const seedTitle = useSeedReportTitle();

  const [job, setJob] = useState<ReportJob | null>(null);
  const [loading, setLoading] = useState(!isSeed);
  const [fetchError, setFetchError] = useState("");
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [shareCopyMessage, setShareCopyMessage] = useState("");

  const isRunning = job?.status === "queued" || job?.status === "running";
  const entries = job?.report?.curatedEntries ?? [];
  const hasEntries = entries.length > 0;

  const isAdmin = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("admin") === "1";
  }, []);

  useEffect(() => {
    if (isSeed) return;

    let cancelled = false;

    async function fetchJob() {
      if (!isRunning) {
        setLoading(true);
      }
      setFetchError("");
      try {
        const response = await fetch(`/api/reports/${encodeURIComponent(domain)}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load report.");
        }
        if (!cancelled) {
          setJob(payload);
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
  }, [domain, isSeed, isRunning]);

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
      window.location.assign(`/report/${encodeURIComponent(payload.host ?? domain)}`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to retry job.");
      setActionSaving(false);
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

  if (isSeed) {
    return (
      <main>
        <SiteNav />
        <section className="timeline-section report-page">
          <TimelineView title={seedTitle} seedEntries={krynskyTimeline} />
        </section>
      </main>
    );
  }

  const reportTitle = job?.report
    ? `${job.host}: ${job.report.stats.range.replace("-", " - ")}`
    : job?.host ?? "";

  return (
    <main>
      <SiteNav />
      <section className="generated-report-page">
        {loading && (
          <div className="generated-loading">
            <Loader2 className="spin" size={22} />
            Loading report
          </div>
        )}
        {fetchError && <p className="error-note">{fetchError}</p>}

        {job && (isRunning || !job.report) && (
          <JobProgress
            job={job}
            canceling={actionSaving}
            onCancel={() => void cancelJob()}
            retrying={actionSaving}
            onRetry={() => void retryJob()}
            showActions={true}
          />
        )}

        {actionError && <p className="error-note">{actionError}</p>}

        {job && hasEntries && (
          <>
            <TimelineView title={reportTitle} generatedEntries={entries} />

            <div className="generated-actions">
              <a className="primary-link compact" href={`/api/reports/${job.id}/export.md`}>
                <FileText size={16} />
                Export Markdown
              </a>
              <a className="ghost-link compact" href={`/api/reports/${job.id}/export.html`}>
                <FileText size={16} />
                Export HTML
              </a>
              <button type="button" className="ghost-link compact" onClick={() => void copyShareLink()}>
                <Clipboard size={16} />
                Copy share link
              </button>
            </div>
            {shareCopyMessage && <p className="success-note">{shareCopyMessage}</p>}

            {isAdmin && (
              <AdminControls job={job} onJobChange={setJob} />
            )}
          </>
        )}
      </section>
    </main>
  );
}
