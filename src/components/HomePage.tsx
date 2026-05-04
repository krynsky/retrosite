import { FormEvent, lazy, Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ReportJobSummary, TimelineRequest } from "../types";
import { useAppConfig } from "../useAppConfig";
import { SiteNav } from "./SiteNav";
import { ReportCard } from "./ReportCard";
import { Polaroid } from "./primitives/Polaroid";
import { MarkerText } from "./primitives/MarkerText";
import { DomainField } from "./primitives/DomainField";
import { StampButton } from "./primitives/StampButton";
import { PixelIcon } from "./primitives/PixelIcon";

const HOME_CARD_LIMIT = 6;
const twitterScreenshot = "/twitter.png";
const LocalTimelineForm = lazy(() => import("./LocalTimelineForm"));

function PixelArrow() {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0" y="6" width="14" height="2" fill="var(--ink)" />
      <rect x="14" y="4" width="2" height="6" fill="var(--ink)" />
      <rect x="16" y="2" width="2" height="10" fill="var(--ink)" />
      <rect x="18" y="0" width="2" height="14" fill="var(--ink)" />
    </svg>
  );
}

export function HomePage() {
  const [domain, setDomain] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState<{
    target: string;
    issueUrl: string | null;
  } | null>(null);
  const { config, loaded: configLoaded } = useAppConfig();
  const [recentJobs, setRecentJobs] = useState<ReportJobSummary[]>([]);
  const [recentError, setRecentError] = useState("");

  const recentJobsRunning = recentJobs.some(
    (job) => job.status === "queued" || job.status === "running"
  );
  const requestOnlyMode = config.mode === "request-only";
  const isAdmin = config.canEditReports;

  useEffect(() => {
    if (!configLoaded) {
      return;
    }

    let cancelled = false;

    if (requestOnlyMode) {
      async function loadPublishedTimelines() {
        try {
          const response = await fetch("/timelines/index.json");
          if (!response.ok) {
            throw new Error("Published timeline index was not found.");
          }
          const payload = await response.json();
          if (!cancelled) {
            setRecentJobs(Array.isArray(payload.timelines) ? payload.timelines : []);
            setRecentError("");
          }
        } catch {
          if (!cancelled) {
            setRecentJobs([]);
          }
        }
      }

      void loadPublishedTimelines();
      return () => {
        cancelled = true;
      };
    }

    async function loadRecentJobs() {
      try {
        const response = await fetch("/api/reports?limit=20");
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load recent timelines.");
        }
        if (!cancelled) {
          setRecentJobs(payload.jobs ?? []);
          setRecentError("");
        }
      } catch (caught) {
        if (!cancelled) {
          setRecentError(caught instanceof Error ? caught.message : "Unable to load recent timelines.");
        }
      }
    }

    void loadRecentJobs();
    const interval = window.setInterval(loadRecentJobs, recentJobsRunning ? 1200 : 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [configLoaded, recentJobsRunning, requestOnlyMode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!domain.trim()) return;

    setSubmitLoading(true);
    setSubmitError("");
    setRequestSuccess(null);

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: domain.trim() })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to submit timeline request.");
      }

      const requestRecord = payload.request as TimelineRequest;
      setRequestSuccess({
        target: requestRecord.target,
        issueUrl: requestRecord.issueUrl ?? null
      });
      setDomain("");
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Unable to submit timeline request.");
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to delete timeline.");
      }
      setRecentJobs((jobs) => jobs.filter((job) => job.id !== id));
    } catch (caught) {
      setRecentError(caught instanceof Error ? caught.message : "Unable to delete timeline.");
    }
  }

  const allCards = recentJobs;
  const displayCards = allCards.slice(0, HOME_CARD_LIMIT);
  const totalSaved = allCards.length;

  return (
    <main className="page paper-bg">
      <SiteNav />

      <section className="hero">
        <div className="hero-left">
          <h1 className="hero-headline">
            Create a website<br />
            timeline using<br />
            <MarkerText tone="double">the Wayback Machine</MarkerText>
          </h1>

          {!configLoaded && (
            <form className="domain-block" aria-label="Timeline form loading">
              <DomainField placeholder="example.com/path" disabled aria-label="Domain or path" />
              <StampButton type="button" tone="primary" size="lg" disabled icon={<PixelArrow />}>
                Loading
              </StampButton>
            </form>
          )}
          {configLoaded && requestOnlyMode && (
            <>
              <form className="domain-block" onSubmit={handleSubmit}>
                <DomainField
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="example.com/path"
                  required
                  aria-label="Domain or path"
                />
                <StampButton
                  type="submit"
                  tone="primary"
                  size="lg"
                  disabled={submitLoading}
                  icon={submitLoading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <PixelArrow />}
                >
                  Request Timeline
                </StampButton>
                {config.requestStatusUrl && (
                  <p className="request-status-link">
                    You can view the status of previous submissions{" "}
                    <a href={config.requestStatusUrl} target="_blank" rel="noreferrer">
                      here
                    </a>.
                  </p>
                )}
              </form>
              {submitError && <p className="error-note">{submitError}</p>}
              {requestSuccess && (
                <p className="success-note">
                  Request saved for {requestSuccess.target}.
                  {requestSuccess.issueUrl && (
                    <>
                      {" "}
                      You can monitor the status of your submission{" "}
                      <a href={requestSuccess.issueUrl} target="_blank" rel="noreferrer">
                        here
                      </a>.
                    </>
                  )}
                </p>
              )}
            </>
          )}
          {configLoaded && !requestOnlyMode && (
            <Suspense fallback={null}>
              <LocalTimelineForm idleIcon={<PixelArrow />} />
            </Suspense>
          )}
        </div>

        <div className="hero-right">
          <div className="hero-image-stack">
            <Polaroid width={540} rotate={-1.2}>
              <img
                src={twitterScreenshot}
                alt="Archived Twitter homepage from 2007"
                className="hero-photo-img"
              />
            </Polaroid>
            <div className="hero-caption">
              <MarkerText tone="pink">2007 Vibes</MarkerText>
            </div>
          </div>
        </div>
      </section>

      <section className="recent-section" aria-label="Recent timelines">
        <div className="recent-head">
          <div className="recent-title-group">
            <h2 className="recent-title">Recent Timelines</h2>
            <div className="export-feature">
              <span className="export-feature-disk">
                <PixelIcon name="disk" size={42} accent="var(--marker-blue)" />
              </span>
              <div className="export-feature-label">
                Export timelines as html and markdown
              </div>
            </div>
          </div>
          <span className="recent-meta">{totalSaved} saved</span>
        </div>

        {recentError && <p className="error-note">{recentError}</p>}

        <div className="recent-grid">
          {displayCards.map((job) => (
            <ReportCard
              key={job.id}
              job={job}
              admin={isAdmin}
              onDelete={handleDelete}
            />
          ))}
        </div>

        {totalSaved > 0 && (
          <div className="recent-more">
            <StampButton as="a" href="/timeline" tone="paper" size="sm">View more</StampButton>
          </div>
        )}
      </section>
    </main>
  );
}
