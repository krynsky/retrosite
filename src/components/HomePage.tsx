import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { krynskyTimeline } from "../data/krynskyTimeline";
import type { ReportJobSummary, TimelineRequest } from "../types";
import { useAppConfig } from "../useAppConfig";
import { SiteNav } from "./SiteNav";
import { ReportCard } from "./ReportCard";
import { Polaroid } from "./primitives/Polaroid";
import twitterScreenshot from "../../design_handoff/twitter.png";
import { MarkerText } from "./primitives/MarkerText";
import { DomainField } from "./primitives/DomainField";
import { StampButton } from "./primitives/StampButton";
import { PixelIcon } from "./primitives/PixelIcon";

const HOME_CARD_LIMIT = 3;

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
  const [requestSuccess, setRequestSuccess] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const { config, loaded: configLoaded } = useAppConfig();
  const [recentJobs, setRecentJobs] = useState<ReportJobSummary[]>([]);
  const [recentError, setRecentError] = useState("");

  const recentJobsRunning = recentJobs.some(
    (job) => job.status === "queued" || job.status === "running"
  );
  const requestOnlyMode = config.mode === "request-only";
  const isAdmin = config.canEditReports;

  useEffect(() => {
    if (!configLoaded || requestOnlyMode) {
      return;
    }

    let cancelled = false;

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
    setRequestSuccess("");

    try {
      if (requestOnlyMode) {
        const response = await fetch("/api/requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: domain.trim(),
            email: email.trim() || undefined,
            notes: notes.trim()
          })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to submit timeline request.");
        }

        const requestRecord = payload.request as TimelineRequest;
        setRequestSuccess(`Request saved for ${requestRecord.target}.`);
        setDomain("");
        setEmail("");
        setNotes("");
        return;
      }

      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: domain.trim() })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create timeline job.");
      }

      const host = payload.host ?? domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      window.location.assign(`/timeline/${encodeURIComponent(host)}`);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Unable to create timeline job.");
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

  const hasGeneratedKrynsky = recentJobs.some((job) => job.host === "krynsky.com");
  const allCards = hasGeneratedKrynsky ? recentJobs : [seedReportCard(), ...recentJobs];
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

          <div className="export-feature">
            <span className="export-feature-disk">
              <PixelIcon name="disk" size={56} accent="var(--marker-blue)" />
            </span>
            <div className="export-feature-label">
              Export timelines as<br />
              html and markdown
            </div>
          </div>

          <form className="domain-block" onSubmit={handleSubmit}>
            <DomainField
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="example.com/path"
              required
              aria-label="Domain or path"
            />
            {requestOnlyMode && (
              <div className="request-fields">
                <DomainField
                  label="EMAIL OPTIONAL"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email address"
                />
                <label className="request-note-field">
                  <span className="domain-field-legend">NOTES OPTIONAL</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Anything specific to look for?"
                    aria-label="Timeline request notes"
                    rows={3}
                  />
                </label>
              </div>
            )}
            <StampButton
              type="submit"
              tone="primary"
              size="lg"
              disabled={submitLoading}
              icon={submitLoading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <PixelArrow />}
            >
              {requestOnlyMode ? "Request Timeline" : "Create Timeline"}
            </StampButton>
          </form>
          {submitError && <p className="error-note">{submitError}</p>}
          {requestSuccess && <p className="success-note">{requestSuccess}</p>}
        </div>

        <div className="hero-right">
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
      </section>

      <section className="recent-section" aria-label="Recent timelines">
        <div className="recent-head">
          <h2 className="recent-title">Recent Timelines</h2>
          <span className="recent-meta">{totalSaved} saved</span>
        </div>

        {recentError && <p className="error-note">{recentError}</p>}

        <div className="recent-grid">
          {displayCards.map((job) => (
            <ReportCard
              key={job.id}
              job={job}
              admin={isAdmin}
              onDelete={job.id === "krynsky-com-seed" ? undefined : handleDelete}
            />
          ))}
        </div>

        {totalSaved > HOME_CARD_LIMIT && (
          <div className="recent-more">
            <StampButton as="a" href="/timeline" tone="paper" size="sm">View more</StampButton>
          </div>
        )}
      </section>
    </main>
  );
}
