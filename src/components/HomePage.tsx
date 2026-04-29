import { FormEvent, useEffect, useState } from "react";
import { FileText, Loader2, Search } from "lucide-react";
import { krynskyTimeline } from "../data/krynskyTimeline";
import type { ReportJobSummary } from "../types";
import { SiteNav } from "./SiteNav";
import { ReportCard } from "./ReportCard";

function seedReportCard(): ReportJobSummary {
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
    generatedReportUrl: "/reports/krynsky-com",
    generatedShareUrl: "/reports/krynsky-com",
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

export function HomePage() {
  const [domain, setDomain] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [recentJobs, setRecentJobs] = useState<ReportJobSummary[]>([]);
  const [recentError, setRecentError] = useState("");

  const searchParams = new URLSearchParams(window.location.search);
  const isAdmin = searchParams.get("admin") === "1";

  const recentJobsRunning = recentJobs.some(
    (job) => job.status === "queued" || job.status === "running"
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRecentJobs() {
      try {
        const response = await fetch("/api/reports?limit=8");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load recent reports.");
        }
        if (!cancelled) {
          setRecentJobs(payload.jobs ?? []);
          setRecentError("");
        }
      } catch (caught) {
        if (!cancelled) {
          setRecentError(caught instanceof Error ? caught.message : "Unable to load recent reports.");
        }
      }
    }

    void loadRecentJobs();
    const interval = window.setInterval(loadRecentJobs, recentJobsRunning ? 1200 : 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [recentJobsRunning]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!domain.trim()) return;

    setSubmitLoading(true);
    setSubmitError("");

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: domain.trim() })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create report job.");
      }

      const host = payload.host ?? domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      window.location.assign(`/report/${encodeURIComponent(host)}`);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Unable to create report job.");
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to delete report.");
      }
      setRecentJobs((jobs) => jobs.filter((job) => job.id !== id));
    } catch (caught) {
      setRecentError(caught instanceof Error ? caught.message : "Unable to delete report.");
    }
  }

  const seed = seedReportCard();
  const allCards = [seed, ...recentJobs];
  const displayCards = allCards.slice(0, 8);

  return (
    <main>
      <SiteNav />

      <section className="hero-shell">
        <div className="hero-copy">
          <h1>Retrosite</h1>
          <p>Turn a domain into a historical visual timeline using the wayback machine.</p>

          <div className="hero-actions">
            <form className="builder-form hero-builder-form" onSubmit={handleSubmit}>
              <label>
                Domain
                <input
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="example.com"
                  required
                />
              </label>
              <button type="submit" disabled={submitLoading}>
                {submitLoading ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
                Create Report
              </button>
            </form>

            {submitError && <p className="error-note">{submitError}</p>}
          </div>
        </div>
      </section>

      <section className="recent-reports-section" aria-label="Report cards">
        <div className="section-heading">
          <span className="eyebrow">
            <FileText size={16} />
            Reports
          </span>
          <h2>Generated reports</h2>
        </div>

        {recentError && <p className="error-note">{recentError}</p>}

        <div className="report-card-grid">
          {displayCards.map((job) => (
            <ReportCard
              key={job.id}
              job={job}
              admin={isAdmin}
              onDelete={job.id === "krynsky-com-seed" ? undefined : handleDelete}
            />
          ))}
        </div>

        <div className="view-more-row">
          <a href="/reports" className="ghost-link compact">
            View more
          </a>
        </div>
      </section>
    </main>
  );
}
