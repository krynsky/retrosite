# MVP Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Retrosite's user flow to submit-domain / progress / read-only-report, hide editing behind `?admin=1`, add tech stack inference, and split App.tsx into focused components.

**Architecture:** Split the monolithic `src/App.tsx` into route-level components under `src/components/`. Extract shared types into `src/types.ts` and shared helpers into `src/helpers.ts`. Add `server/techstack.mjs` for in-browser tech stack detection during the Playwright render stage. Add `DELETE /api/reports/:id` and duplicate-domain detection to the API. The seed krynsky.com report gets a stable ID (`krynsky-com-seed`) and renders through the same `TimelineView` as generated reports.

**Tech Stack:** React 19, TypeScript, Vite, Express 5, Playwright, Node built-in test runner

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `src/types.ts` | Shared TypeScript types: `TimelineEntry`, `DraftReportEntry`, `DraftReport`, `ReportJob`, `ReportJobSummary`, `QueueSummary`, etc. |
| `src/helpers.ts` | Shared utility functions: `formatJobTime`, `reportEntryKey`, `reportStageLabel`, `reportStageState`, `canCancelJob`, `canRetryJob`, `entryQualityLabel`, `entryQualityTone`, `entryQualityDetails`, `copyTextToClipboard`, `absoluteAppUrl`, `downloadText`, `reportStageSteps` constant |
| `src/components/SiteNav.tsx` | Navigation bar |
| `src/components/HomePage.tsx` | Submit form (no depth), report card grid (8 recent), "view more" link, duplicate-domain redirect |
| `src/components/ReportsPage.tsx` | Paginated report list with search and status filter |
| `src/components/ReportPage.tsx` | Unified progress + read-only timeline for `/reports/generated/:id` |
| `src/components/AdminControls.tsx` | Edit forms, delete, publish/unpublish, cancel/retry — conditional on `?admin=1` |
| `src/components/JobProgress.tsx` | Stage pipeline progress visualization |
| `src/components/TimelineView.tsx` | Read-only timeline layout (left nav + screenshot detail) |
| `src/components/ReportCard.tsx` | Card with thumbnail, domain, date range, status |
| `server/techstack.mjs` | Tech stack inference: `inferTechStack(page)` and exported detection helpers |
| `server/techstack.test.mjs` | Fixture-based unit tests for detection helpers |

### Modified files

| File | Changes |
|---|---|
| `src/App.tsx` | Gutted — becomes thin router that imports components |
| `server/index.mjs` | Add `DELETE /api/reports/:id`, modify `POST /api/reports` for duplicate check, add pagination params to `GET /api/reports`, call `inferTechStack()` in render stage |

---

## Task Ordering

Tasks are ordered so each produces working, testable code and commits independently:

1. Extract types → 2. Extract helpers → 3. Extract SiteNav → 4. Extract ReportCard → 5. Extract JobProgress → 6. Extract TimelineView → 7. Extract HomePage → 8. Extract ReportPage → 9. Extract AdminControls → 10. Extract ReportsPage → 11. Slim App.tsx router → 12. Tech stack inference module + tests → 13. Integrate tech stack into render stage → 14. DELETE endpoint → 15. Duplicate domain check + pagination → 16. Seed report stable ID → 17. Final verification

---

### Task 1: Extract shared types

**Files:**
- Create: `src/types.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/types.ts` with all shared types**

```typescript
export type YearSummary = {
  year: string;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
  sampleOriginal: string;
  sampleDigest: string;
};

export type Candidate = {
  timestamp: string;
  date: string;
  original: string;
  replayUrl: string;
  reason: string;
};

export type DiscoveryResult = {
  host: string;
  queriedVariants: string[];
  variantStatus?: Array<{
    variant: string;
    status: string;
    attempts: number;
    captureCount: number;
    error: string | null;
  }>;
  warning?: string | null;
  captureCount: number;
  yearSummary: YearSummary[];
  candidates: Candidate[];
};

export type DraftReportEntry = {
  timestamp: string;
  date: string;
  title: string;
  notes: string;
  techStack: string;
  source: string;
  original: string;
  screenshotStatus: string;
  screenshotUrl: string | null;
  screenshotError: string | null;
  screenshotQuality: {
    bytes: number;
    width: number;
    height: number;
    classification: string;
    reasons?: string[];
  } | null;
  replacementOf: string | null;
  replacementAttempts: Array<{
    timestamp: string;
    date: string;
    original: string;
  }>;
};

export type DraftReport = {
  title: string;
  summary: string;
  publicationStatus?: "draft" | "published";
  publishedAt?: string | null;
  stats: {
    captureCount: number;
    candidateCount: number;
    yearCount: number;
    range: string;
    renderedCount?: number;
    selectedCount?: number;
  };
  entries: DraftReportEntry[];
  curatedEntries?: DraftReportEntry[];
  generatedReportUrl?: string;
  generatedShareUrl?: string;
};

export type ReportJob = {
  id: string;
  target: string;
  host: string;
  status: "queued" | "running" | "complete" | "incomplete" | "failed" | "canceled";
  stage: string;
  progress: number;
  message: string;
  screenshotLimit: number;
  createdAt: string;
  updatedAt: string;
  events: Array<{
    at: string;
    stage: string;
    message: string;
  }>;
  discovery: DiscoveryResult | null;
  report: DraftReport | null;
  error: string | null;
  notifyEmail: string | null;
  notificationStatus: "not_requested" | "captured" | "queued" | "failed";
  activeJobCount?: number;
  maxActiveJobs?: number;
  queuePosition?: number | null;
  isActiveJob?: boolean;
};

export type ReportJobSummary = {
  id: string;
  target: string;
  host: string;
  status: "queued" | "running" | "complete" | "incomplete" | "failed" | "canceled";
  stage: string;
  progress: number;
  message: string;
  screenshotLimit: number;
  createdAt: string;
  updatedAt: string;
  generatedReportUrl: string | null;
  generatedShareUrl: string | null;
  stats: DraftReport["stats"] | null;
  error: string | null;
  thumbnailUrl: string | null;
  notifyEmail: string | null;
  notificationStatus: "not_requested" | "captured" | "queued" | "failed";
  activeJobCount?: number;
  maxActiveJobs?: number;
  queuePosition?: number | null;
  isActiveJob?: boolean;
};

export type QueueSummary = {
  activeJobCount: number;
  maxActiveJobs: number;
};
```

- [ ] **Step 2: Update `src/App.tsx` to import from `src/types.ts`**

Remove the type definitions from `App.tsx` (lines 15–147) and replace with:

```typescript
import type {
  YearSummary,
  Candidate,
  DiscoveryResult,
  DraftReportEntry,
  DraftReport,
  ReportJob,
  ReportJobSummary,
  QueueSummary
} from "./types";
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/App.tsx
git commit -m "refactor: extract shared types to src/types.ts"
```

---

### Task 2: Extract shared helpers

**Files:**
- Create: `src/helpers.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/helpers.ts`**

Move the following from `App.tsx` into `src/helpers.ts`:
- `reportStageSteps` constant (lines 180–226)
- `buildDiscoveryMarkdown` function (line 228)
- `downloadText` function (line 244)
- `summarizeJob` function (line 259)
- `formatJobTime` function (line 288)
- `reportEntryKey` function (line 297)
- `reportStageLabel` function (line 301)
- `reportStageState` function (line 305)
- `stageEventsForJob` function (line 321)
- `canCancelJob` function (line 328)
- `canRetryJob` function (line 332)
- `reportFailureHint` function (line 336)
- `queueProgressText` function (line 352)
- `queueSummaryFromJob` function (line 360)
- `entryQualityLabel` function (line 367)
- `entryQualityTone` function (line 383)
- `entryQualityDetails` function (line 393)
- `generatedSharePath` function (line 410)
- `absoluteAppUrl` function (line 418)
- `copyTextToClipboard` function (line 422)

Each function needs the appropriate type imports from `./types`. Export all functions and the `reportStageSteps` constant.

```typescript
import type { ReportJob, ReportJobSummary, DraftReportEntry, DraftReport, DiscoveryResult, QueueSummary } from "./types";

export const reportStageSteps = [
  { id: "queued", title: "Queue", detail: "The job is saved and waiting for the runner." },
  { id: "discovering", title: "Discover", detail: "Retrosite queries Wayback Machine variants for homepage captures." },
  { id: "selecting", title: "Index", detail: "Capture years and candidate eras are grouped." },
  { id: "rendering", title: "Render", detail: "Candidate captures are opened and screenshotted in Chrome." },
  { id: "repairing", title: "Repair", detail: "Weak captures are replaced with nearby same-year captures when possible." },
  { id: "curating", title: "Curate", detail: "Usable screenshots are selected for the draft timeline." },
  { id: "complete", title: "Ready", detail: "The draft is ready to edit, publish, and share." },
  { id: "incomplete", title: "Needs review", detail: "The run finished, but too few usable screenshots were rendered." },
  { id: "canceled", title: "Canceled", detail: "The job was stopped before it finished." }
];

// Copy each function exactly as-is from App.tsx, adding `export` keyword.
// All functions listed above go here.
```

- [ ] **Step 2: Update `src/App.tsx` imports**

Remove the moved functions/constants from `App.tsx` and add:

```typescript
import {
  reportStageSteps,
  buildDiscoveryMarkdown,
  downloadText,
  summarizeJob,
  formatJobTime,
  reportEntryKey,
  reportStageLabel,
  reportStageState,
  stageEventsForJob,
  canCancelJob,
  canRetryJob,
  reportFailureHint,
  queueProgressText,
  queueSummaryFromJob,
  entryQualityLabel,
  entryQualityTone,
  entryQualityDetails,
  generatedSharePath,
  absoluteAppUrl,
  copyTextToClipboard
} from "./helpers";
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/helpers.ts src/App.tsx
git commit -m "refactor: extract shared helpers to src/helpers.ts"
```

---

### Task 3: Extract SiteNav component

**Files:**
- Create: `src/components/SiteNav.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/SiteNav.tsx`**

```typescript
export function SiteNav() {
  return (
    <header className="site-nav">
      <a href="/" className="site-mark">
        Retrosite
      </a>
      <nav aria-label="Primary navigation">
        <a href="/about">About</a>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Update `src/App.tsx`**

Remove the `SiteNav` function and add:

```typescript
import { SiteNav } from "./components/SiteNav";
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/SiteNav.tsx src/App.tsx
git commit -m "refactor: extract SiteNav component"
```

---

### Task 4: Extract ReportCard component

**Files:**
- Create: `src/components/ReportCard.tsx`

- [ ] **Step 1: Create `src/components/ReportCard.tsx`**

This is a new component that renders a card for any report (generated or seed). Used on the home page and reports list.

```typescript
import { ArrowUpRight, FileText, Loader2 } from "lucide-react";
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ReportCard.tsx
git commit -m "feat: add ReportCard component"
```

---

### Task 5: Extract JobProgress component

**Files:**
- Create: `src/components/JobProgress.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/JobProgress.tsx`**

Move the `GeneratedJobProgress` function from `App.tsx` (lines 506–596) into this file. Import types from `../types` and helpers from `../helpers`. Import `Sparkles` and `Loader2` from `lucide-react`.

```typescript
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
```

- [ ] **Step 2: Update `src/App.tsx`**

Remove the `GeneratedJobProgress` function. Add import:

```typescript
import { JobProgress } from "./components/JobProgress";
```

Replace all references to `<GeneratedJobProgress` with `<JobProgress`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/JobProgress.tsx src/App.tsx
git commit -m "refactor: extract JobProgress component"
```

---

### Task 6: Extract TimelineView component

**Files:**
- Create: `src/components/TimelineView.tsx`

- [ ] **Step 1: Create `src/components/TimelineView.tsx`**

This is the read-only timeline layout shared by the seed report and generated reports. It renders a left nav with year/tech-stack buttons and a main area with screenshot + metadata details.

The component accepts a generic `entries` array with a common shape. The seed report (`TimelineEntry`) has `image` while generated reports (`DraftReportEntry`) have `screenshotUrl`. The component normalizes this.

```typescript
import { CSSProperties, useState, useEffect } from "react";
import { ArrowUpRight, ZoomIn, Maximize2 } from "lucide-react";
import type { DraftReportEntry } from "../types";
import type { TimelineEntry } from "../data/krynskyTimeline";
import { entryQualityLabel, entryQualityTone, entryQualityDetails } from "../helpers";

type NormalizedEntry = {
  date: string;
  title: string;
  notes: string;
  techStack: string;
  source: string;
  imageUrl: string | null;
  focusScale?: number;
  focusOrigin?: string;
  focusHeight?: string;
  quality?: DraftReportEntry["screenshotQuality"];
  replacementOf?: string | null;
  replacementAttempts?: DraftReportEntry["replacementAttempts"];
};

function normalizeSeedEntry(entry: TimelineEntry): NormalizedEntry {
  return {
    date: entry.date,
    title: entry.title,
    notes: entry.notes,
    techStack: entry.techStack,
    source: entry.source,
    imageUrl: entry.image,
    focusScale: entry.focusScale,
    focusOrigin: entry.focusOrigin,
    focusHeight: entry.focusHeight
  };
}

function normalizeGeneratedEntry(entry: DraftReportEntry): NormalizedEntry {
  return {
    date: entry.date,
    title: entry.title,
    notes: entry.notes,
    techStack: entry.techStack,
    source: entry.source,
    imageUrl: entry.screenshotUrl,
    quality: entry.screenshotQuality,
    replacementOf: entry.replacementOf,
    replacementAttempts: entry.replacementAttempts
  };
}

export function TimelineView({
  title,
  seedEntries,
  generatedEntries
}: {
  title: string;
  seedEntries?: TimelineEntry[];
  generatedEntries?: DraftReportEntry[];
}) {
  const entries: NormalizedEntry[] = seedEntries
    ? seedEntries.map(normalizeSeedEntry)
    : (generatedEntries ?? []).map(normalizeGeneratedEntry);

  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [imageMode, setImageMode] = useState<"focus" | "full">("focus");
  const activeEntry = entries[Math.min(activeEntryIndex, Math.max(entries.length - 1, 0))] ?? null;
  const isGenerated = !seedEntries;

  useEffect(() => {
    setActiveEntryIndex(0);
    setImageMode("focus");
  }, [seedEntries, generatedEntries]);

  if (entries.length === 0) {
    return <p className="warning-note">No entries available for this report.</p>;
  }

  return (
    <>
      <div className="section-heading">
        <h1>{title}</h1>
      </div>

      <div className="timeline-layout">
        <nav className="timeline-nav" aria-label="Timeline entries">
          {entries.map((entry, index) => (
            <button
              key={`${entry.date}-${entry.source}`}
              type="button"
              className={index === activeEntryIndex ? "active" : ""}
              aria-label={`${entry.date.slice(0, 4)} ${entry.title}: ${entry.techStack}`}
              onClick={() => setActiveEntryIndex(index)}
            >
              <span>{entry.date.slice(0, 4)}</span>
              {entry.techStack}
            </button>
          ))}
        </nav>

        {activeEntry && (
          <div className="timeline-main">
            <article className="timeline-detail">
              <div className="detail-copy">
                <span>{activeEntry.date}</span>
                <h3>{activeEntry.title}</h3>
                <p>{activeEntry.notes}</p>
                <dl>
                  <div>
                    <dt>Tech stack</dt>
                    <dd>{activeEntry.techStack}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      <a href={activeEntry.source} target="_blank" rel="noreferrer">
                        Wayback capture <ArrowUpRight size={15} />
                      </a>
                    </dd>
                  </div>
                </dl>
                {isGenerated && activeEntry.quality && (
                  <div className={`entry-quality ${entryQualityTone({ screenshotStatus: "rendered", screenshotQuality: activeEntry.quality, replacementOf: activeEntry.replacementOf ?? null, replacementAttempts: activeEntry.replacementAttempts ?? [] } as DraftReportEntry)}`}>
                    <strong>{entryQualityLabel({ screenshotStatus: "rendered", screenshotQuality: activeEntry.quality, replacementOf: activeEntry.replacementOf ?? null, replacementAttempts: activeEntry.replacementAttempts ?? [] } as DraftReportEntry)}</strong>
                  </div>
                )}
              </div>
              {activeEntry.imageUrl && (
                <div
                  className={`screenshot-frame ${imageMode}`}
                  style={
                    {
                      "--focus-scale": activeEntry.focusScale ?? 1,
                      "--focus-origin": activeEntry.focusOrigin ?? "center top",
                      "--focus-height": activeEntry.focusHeight ?? "42rem"
                    } as CSSProperties
                  }
                >
                  <div className="image-mode-toggle" aria-label="Screenshot view mode">
                    <button
                      type="button"
                      className={imageMode === "focus" ? "active" : ""}
                      onClick={() => setImageMode("focus")}
                    >
                      <ZoomIn size={16} />
                      Focus
                    </button>
                    <button
                      type="button"
                      className={imageMode === "full" ? "active" : ""}
                      onClick={() => setImageMode("full")}
                    >
                      <Maximize2 size={16} />
                      Full
                    </button>
                  </div>
                  <img src={activeEntry.imageUrl} alt={`${activeEntry.date} ${activeEntry.title}`} />
                </div>
              )}
            </article>
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/TimelineView.tsx
git commit -m "feat: add TimelineView component for shared timeline rendering"
```

---

### Task 7: Extract HomePage component

**Files:**
- Create: `src/components/HomePage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/HomePage.tsx`**

This component renders:
- The submit form (domain input + create button, no depth dropdown)
- The krynsky.com seed report as a blended `ReportCard`
- Grid of 8 most recent report cards
- "View more" link to `/reports`
- Handles duplicate-domain redirect: if `POST /api/reports` returns `{ existingReportId }`, navigate there

```typescript
import { FormEvent, useEffect, useState } from "react";
import { FileText, Loader2, Search } from "lucide-react";
import type { ReportJobSummary, QueueSummary } from "../types";
import { formatJobTime, reportStageLabel } from "../helpers";
import { SiteNav } from "./SiteNav";
import { ReportCard } from "./ReportCard";
import { krynskyTimeline } from "../data/krynskyTimeline";

const SEED_REPORT_ID = "krynsky-com-seed";

function seedReportCard(): ReportJobSummary {
  const first = krynskyTimeline[0].date.slice(0, 4);
  const last = krynskyTimeline[krynskyTimeline.length - 1].date.slice(0, 4);
  return {
    id: SEED_REPORT_ID,
    target: "krynsky.com",
    host: "krynsky.com",
    status: "complete",
    stage: "complete",
    progress: 100,
    message: "Hand-curated seed report",
    screenshotLimit: krynskyTimeline.length,
    createdAt: "1997-01-08T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    generatedReportUrl: `/reports/generated/${SEED_REPORT_ID}`,
    generatedShareUrl: `/reports/generated/${SEED_REPORT_ID}`,
    stats: {
      captureCount: krynskyTimeline.length,
      candidateCount: krynskyTimeline.length,
      yearCount: new Set(krynskyTimeline.map((e) => e.date.slice(0, 4))).size,
      range: `${first}-${last}`,
      renderedCount: krynskyTimeline.length,
      selectedCount: krynskyTimeline.length
    },
    error: null,
    thumbnailUrl: krynskyTimeline[0].image,
    notifyEmail: null,
    notificationStatus: "not_requested"
  };
}

export function HomePage() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentJobs, setRecentJobs] = useState<ReportJobSummary[]>([]);
  const [recentError, setRecentError] = useState("");
  const [serviceQueue, setServiceQueue] = useState<QueueSummary | null>(null);
  const admin = new URLSearchParams(window.location.search).get("admin") === "1";
  const recentJobsRunning = recentJobs.some((j) => j.status === "queued" || j.status === "running");

  useEffect(() => {
    let cancelled = false;
    async function loadRecentJobs() {
      try {
        const response = await fetch("/api/reports?limit=8");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load recent reports.");
        if (!cancelled) {
          setRecentJobs(payload.jobs ?? []);
          if (payload.queue) setServiceQueue(payload.queue);
          setRecentError("");
        }
      } catch (caught) {
        if (!cancelled) setRecentError(caught instanceof Error ? caught.message : "Unable to load recent reports.");
      }
    }
    void loadRecentJobs();
    const interval = window.setInterval(loadRecentJobs, recentJobsRunning ? 1200 : 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [recentJobsRunning]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: domain })
      });
      const payload = await response.json();
      if (payload.existingReportId) {
        window.location.assign(`/reports/generated/${payload.existingReportId}`);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "Unable to create report job.");
      window.location.assign(`/reports/generated/${payload.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create report job.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Unable to delete report.");
      }
      setRecentJobs((jobs) => jobs.filter((j) => j.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete report.");
    }
  }

  const allCards = [seedReportCard(), ...recentJobs.filter((j) => j.id !== SEED_REPORT_ID)];

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
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
              </label>
              <button type="submit" disabled={loading}>
                {loading ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
                Create Report
              </button>
            </form>
            <div className="builder-note-row">
              <p className="builder-note">Use a public root domain. Local, private, and duplicate running jobs are blocked.</p>
              {serviceQueue && (
                <p className="builder-service-status">
                  {serviceQueue.activeJobCount}/{serviceQueue.maxActiveJobs} jobs active
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {error && <p className="error-note">{error}</p>}
      {recentError && <p className="error-note">{recentError}</p>}

      {allCards.length > 0 && (
        <section className="recent-reports-section" aria-label="Reports">
          <div className="section-heading">
            <span className="eyebrow"><FileText size={16} /> Reports</span>
            <h2>Generated timeline reports</h2>
          </div>
          <div className="report-card-grid">
            {allCards.map((job) => (
              <ReportCard key={job.id} job={job} admin={admin} onDelete={handleDelete} />
            ))}
          </div>
          <a href="/reports" className="primary-link view-more-link">View more reports</a>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/HomePage.tsx
git commit -m "feat: add HomePage component with submit form and report cards"
```

---

### Task 8: Extract ReportPage component

**Files:**
- Create: `src/components/ReportPage.tsx`

- [ ] **Step 1: Create `src/components/ReportPage.tsx`**

This is the unified progress + read-only timeline page. It:
- Fetches the job by ID
- Polls while running
- Shows `JobProgress` while in progress
- Shows `TimelineView` once complete
- Shows export buttons and copy share link
- If the ID is `krynsky-com-seed`, renders the seed data through `TimelineView`

```typescript
import { useEffect, useMemo, useState } from "react";
import { Clipboard, FileText, Loader2 } from "lucide-react";
import type { ReportJob } from "../types";
import { absoluteAppUrl, copyTextToClipboard } from "../helpers";
import { SiteNav } from "./SiteNav";
import { JobProgress } from "./JobProgress";
import { TimelineView } from "./TimelineView";
import { krynskyTimeline } from "../data/krynskyTimeline";

const SEED_REPORT_ID = "krynsky-com-seed";

export function ReportPage({ id }: { id: string }) {
  const [job, setJob] = useState<ReportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [shareCopyMessage, setShareCopyMessage] = useState("");
  const isSeed = id === SEED_REPORT_ID;
  const jobRunning = job?.status === "queued" || job?.status === "running";
  const jobDone = job?.status === "complete" || job?.status === "incomplete";
  const entries = job?.report?.curatedEntries ?? [];
  const admin = new URLSearchParams(window.location.search).get("admin") === "1";

  const reportStats = useMemo(() => {
    if (!job?.report) return undefined;
    return [
      `${job.report.stats.captureCount} captures found`,
      `${job.screenshotLimit} max screenshots`,
      `${job.report.stats.renderedCount ?? 0} screenshots rendered`,
      `${job.report.stats.selectedCount ?? entries.length} selected`,
      job.report.stats.range
    ];
  }, [job, entries.length]);

  const seedTitle = useMemo(() => {
    if (!isSeed) return "";
    const first = krynskyTimeline[0].date.slice(0, 4);
    const last = krynskyTimeline[krynskyTimeline.length - 1].date.slice(0, 4);
    return `krynsky.com: ${first} - ${last}`;
  }, [isSeed]);

  useEffect(() => {
    if (isSeed) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadJob() {
      if (!jobRunning) setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/reports/${id}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load report.");
        if (!cancelled) setJob(payload);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadJob();
    const interval = jobRunning ? window.setInterval(loadJob, 1200) : null;
    return () => { cancelled = true; if (interval) window.clearInterval(interval); };
  }, [id, isSeed, jobRunning]);

  async function cancelJob() {
    if (!job) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/reports/${job.id}/cancel`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to cancel job.");
      setJob(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to cancel job.");
    } finally {
      setSaving(false);
    }
  }

  async function retryJob() {
    if (!job) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/reports/${job.id}/retry`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to retry job.");
      window.location.assign(`/reports/generated/${payload.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to retry job.");
    } finally {
      setSaving(false);
    }
  }

  async function copyShareLink() {
    setShareCopyMessage("");
    try {
      await copyTextToClipboard(absoluteAppUrl(`/reports/generated/${id}`));
      setShareCopyMessage("Share link copied.");
    } catch {
      setError("Unable to copy share link.");
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

  return (
    <main>
      <SiteNav />
      <section className="timeline-section report-page generated-report-page">
        {loading && (
          <div className="generated-loading">
            <Loader2 className="spin" size={22} />
            Loading report
          </div>
        )}
        {error && <p className="error-note">{error}</p>}

        {job && !jobDone && (
          <JobProgress
            job={job}
            canceling={saving}
            onCancel={() => void cancelJob()}
            retrying={saving}
            onRetry={() => void retryJob()}
            stats={reportStats}
          />
        )}

        {(jobDone || (job?.report && entries.length > 0)) && (
          <>
            <div className="report-actions">
              <a className="primary-link compact" href={`/api/reports/${id}/export.md`}>
                <FileText size={16} /> Export Markdown
              </a>
              <a className="ghost-link compact" href={`/api/reports/${id}/export.html`}>
                <FileText size={16} /> Export HTML
              </a>
              <button type="button" className="ghost-link compact" onClick={() => void copyShareLink()}>
                <Clipboard size={16} /> Copy share link
              </button>
            </div>
            {shareCopyMessage && <p className="success-note">{shareCopyMessage}</p>}

            <TimelineView
              title={job?.report?.title ?? job?.host ?? ""}
              generatedEntries={entries}
            />
          </>
        )}

        {admin && job && (
          <AdminControlsLazy job={job} onJobChange={setJob} />
        )}
      </section>
    </main>
  );
}

function AdminControlsLazy({ job, onJobChange }: { job: ReportJob; onJobChange: (job: ReportJob) => void }) {
  // Placeholder — will be replaced with real AdminControls import in Task 9
  return null;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ReportPage.tsx
git commit -m "feat: add ReportPage component with unified progress + timeline view"
```

---

### Task 9: Extract AdminControls component

**Files:**
- Create: `src/components/AdminControls.tsx`
- Modify: `src/components/ReportPage.tsx`

- [ ] **Step 1: Create `src/components/AdminControls.tsx`**

Move all editing logic from the old `GeneratedReportPage` into this component: edit report title/summary, edit entry title/notes/tech stack, include/exclude entries, publish/unpublish, cancel/retry, and add delete functionality.

```typescript
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ReportJob, DraftReportEntry } from "../types";
import { reportEntryKey, canCancelJob, canRetryJob, formatJobTime } from "../helpers";

export function AdminControls({
  job,
  onJobChange
}: {
  job: ReportJob;
  onJobChange: (job: ReportJob) => void;
}) {
  const [curationSavingKey, setCurationSavingKey] = useState("");
  const [curationError, setCurationError] = useState("");
  const [editingEntryKey, setEditingEntryKey] = useState("");
  const [entryDraft, setEntryDraft] = useState({ title: "", notes: "", techStack: "" });
  const [editingReport, setEditingReport] = useState(false);
  const [reportDraft, setReportDraft] = useState({ title: "", summary: "" });
  const [reportSaving, setReportSaving] = useState(false);
  const [reportError, setReportError] = useState("");
  const selectedEntries = job.report?.curatedEntries ?? [];
  const selectedEntryKeys = useMemo(() => new Set(selectedEntries.map(reportEntryKey)), [selectedEntries]);
  const curatedEntriesByKey = useMemo(
    () => new Map(selectedEntries.map((entry) => [reportEntryKey(entry), entry])),
    [selectedEntries]
  );
  const entries = useMemo(() => {
    const renderedEntries = job.report?.entries?.filter((e) => e.screenshotStatus === "rendered") ?? [];
    return renderedEntries
      .map((e) => curatedEntriesByKey.get(reportEntryKey(e)) ?? e)
      .sort((a, b) => {
        const aIn = selectedEntryKeys.has(reportEntryKey(a));
        const bIn = selectedEntryKeys.has(reportEntryKey(b));
        if (aIn !== bIn) return aIn ? -1 : 1;
        return a.date.localeCompare(b.date);
      });
  }, [curatedEntriesByKey, job.report?.entries, selectedEntryKeys]);

  async function updateEntryCuration(
    entry: DraftReportEntry,
    included?: boolean,
    edits?: Pick<DraftReportEntry, "title" | "notes" | "techStack">
  ) {
    const key = reportEntryKey(entry);
    setCurationSavingKey(key);
    setCurationError("");
    try {
      const response = await fetch(`/api/reports/${job.id}/entries`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timestamp: entry.timestamp,
          original: entry.original,
          ...(typeof included === "boolean" ? { included } : {}),
          ...(edits ? { title: edits.title, notes: edits.notes, techStack: edits.techStack } : {})
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to update curation.");
      onJobChange(payload);
      if (editingEntryKey === key) setEditingEntryKey("");
    } catch (caught) {
      setCurationError(caught instanceof Error ? caught.message : "Unable to update curation.");
    } finally {
      setCurationSavingKey("");
    }
  }

  function startEntryEdit(entry: DraftReportEntry) {
    setEditingEntryKey(reportEntryKey(entry));
    setEntryDraft({ title: entry.title, notes: entry.notes, techStack: entry.techStack });
    setCurationError("");
  }

  async function updateReportDetails(patch: {
    title?: string;
    summary?: string;
    publicationStatus?: "draft" | "published";
  }) {
    setReportSaving(true);
    setReportError("");
    try {
      const response = await fetch(`/api/reports/${job.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to update report.");
      onJobChange(payload);
      setEditingReport(false);
    } catch (caught) {
      setReportError(caught instanceof Error ? caught.message : "Unable to update report.");
    } finally {
      setReportSaving(false);
    }
  }

  async function deleteReport() {
    setReportSaving(true);
    setReportError("");
    try {
      const response = await fetch(`/api/reports/${job.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Unable to delete report.");
      }
      window.location.assign("/");
    } catch (caught) {
      setReportError(caught instanceof Error ? caught.message : "Unable to delete report.");
    } finally {
      setReportSaving(false);
    }
  }

  if (!job.report) return null;

  return (
    <section className="admin-controls" aria-label="Admin controls">
      <div className="section-heading">
        <span className="eyebrow"><Sparkles size={16} /> Admin</span>
        <h2>Report Administration</h2>
      </div>

      {reportError && <p className="error-note">{reportError}</p>}
      {curationError && <p className="error-note">{curationError}</p>}

      <div className="admin-report-actions">
        {editingReport ? (
          <div className="report-edit-form">
            <label>
              Report title
              <input
                value={reportDraft.title}
                onChange={(e) => setReportDraft((d) => ({ ...d, title: e.target.value }))}
                maxLength={140}
              />
            </label>
            <label>
              Summary
              <textarea
                value={reportDraft.summary}
                onChange={(e) => setReportDraft((d) => ({ ...d, summary: e.target.value }))}
                rows={4}
                maxLength={500}
              />
            </label>
            <button type="button" className="primary-link compact" disabled={reportSaving} onClick={() => void updateReportDetails(reportDraft)}>
              Save report
            </button>
            <button type="button" className="ghost-link compact" disabled={reportSaving} onClick={() => setEditingReport(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="ghost-link compact" onClick={() => {
            setEditingReport(true);
            setReportDraft({ title: job.report!.title, summary: job.report!.summary });
          }}>
            Edit report title/summary
          </button>
        )}

        <button
          type="button"
          className="primary-link compact"
          disabled={reportSaving || selectedEntries.length === 0}
          onClick={() => void updateReportDetails({
            publicationStatus: job.report!.publicationStatus === "published" ? "draft" : "published"
          })}
        >
          {job.report.publicationStatus === "published" ? "Return to draft" : "Publish draft"}
        </button>

        <button type="button" className="ghost-link compact danger" disabled={reportSaving} onClick={() => void deleteReport()}>
          Delete report
        </button>
      </div>

      <div className="admin-entry-list">
        {entries.map((entry) => {
          const key = reportEntryKey(entry);
          const included = selectedEntryKeys.has(key);
          const saving = curationSavingKey === key;
          const editing = editingEntryKey === key;
          return (
            <article key={key} className={`admin-entry ${included ? "included" : "excluded"}`}>
              <span>{entry.date}</span>
              <em>{included ? "Included" : "Excluded"}</em>
              {editing ? (
                <div className="entry-edit-form">
                  <label>Title <input value={entryDraft.title} onChange={(e) => setEntryDraft((d) => ({ ...d, title: e.target.value }))} maxLength={140} /></label>
                  <label>Tech stack <input value={entryDraft.techStack} onChange={(e) => setEntryDraft((d) => ({ ...d, techStack: e.target.value }))} maxLength={220} /></label>
                  <label>Notes <textarea value={entryDraft.notes} onChange={(e) => setEntryDraft((d) => ({ ...d, notes: e.target.value }))} rows={4} maxLength={500} /></label>
                  <button type="button" className="primary-link compact" disabled={saving} onClick={() => void updateEntryCuration(entry, undefined, entryDraft)}>Save</button>
                  <button type="button" className="ghost-link compact" disabled={saving} onClick={() => setEditingEntryKey("")}>Cancel</button>
                </div>
              ) : (
                <>
                  <h3>{entry.title}</h3>
                  <p>{entry.techStack}</p>
                  <button type="button" className="ghost-link compact" disabled={saving} onClick={() => startEntryEdit(entry)}>Edit</button>
                  <button type="button" className="ghost-link compact" disabled={saving} onClick={() => void updateEntryCuration(entry, !included)}>
                    {included ? "Exclude" : "Include"}
                  </button>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update `src/components/ReportPage.tsx`**

Replace the `AdminControlsLazy` placeholder with a real import:

```typescript
import { AdminControls } from "./AdminControls";
```

Replace the `AdminControlsLazy` usage:

```typescript
{admin && job && job.report && (
  <AdminControls job={job} onJobChange={setJob} />
)}
```

Remove the `AdminControlsLazy` function.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminControls.tsx src/components/ReportPage.tsx
git commit -m "feat: add AdminControls component behind ?admin=1"
```

---

### Task 10: Extract ReportsPage component

**Files:**
- Create: `src/components/ReportsPage.tsx`

- [ ] **Step 1: Create `src/components/ReportsPage.tsx`**

Paginated list of all reports with search by domain and status filter.

```typescript
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { ReportJobSummary } from "../types";
import { SiteNav } from "./SiteNav";
import { ReportCard } from "./ReportCard";

const PAGE_SIZE = 12;
const STATUS_OPTIONS = ["all", "complete", "running", "queued", "failed", "incomplete", "canceled"] as const;

export function ReportsPage() {
  const [jobs, setJobs] = useState<ReportJobSummary[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const admin = new URLSearchParams(window.location.search).get("admin") === "1";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/reports?limit=50`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load reports.");
        if (!cancelled) setJobs(payload.jobs ?? []);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load reports.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const filtered = jobs.filter((j) => {
    if (search && !j.host.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && j.status !== statusFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageJobs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function handleDelete(id: string) {
    try {
      const response = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Unable to delete report.");
      }
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete report.");
    }
  }

  return (
    <main>
      <SiteNav />
      <section className="reports-list-page">
        <div className="section-heading">
          <h1>All Reports</h1>
        </div>

        <div className="reports-filters">
          <label className="reports-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search by domain..."
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
            ))}
          </select>
        </div>

        {error && <p className="error-note">{error}</p>}
        {loading && <p>Loading reports...</p>}

        <div className="report-card-grid">
          {pageJobs.map((job) => (
            <ReportCard key={job.id} job={job} admin={admin} onDelete={handleDelete} />
          ))}
        </div>

        {!loading && filtered.length === 0 && <p>No reports found.</p>}

        {totalPages > 1 && (
          <div className="reports-pagination">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page + 1} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ReportsPage.tsx
git commit -m "feat: add ReportsPage with search, filter, and pagination"
```

---

### Task 11: Slim down App.tsx to thin router

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Rewrite `src/App.tsx` as a thin router**

Replace the entire contents of `App.tsx` with:

```typescript
import { HomePage } from "./components/HomePage";
import { ReportPage } from "./components/ReportPage";
import { ReportsPage } from "./components/ReportsPage";

const processSteps = [
  {
    number: "01",
    title: "Discover",
    summary: "Query exact homepage captures across http, https, root, and www variants.",
    detail: "Retrosite starts by asking the Wayback Machine CDX index for exact homepage captures. It checks the common URL variants because older sites often moved between www, non-www, http, and https over time."
  },
  {
    number: "02",
    title: "Render",
    summary: "Capture full-page Wayback replays and mark broken, stripped, or partially styled versions.",
    detail: "Candidate captures need to be opened and rendered because archive data alone cannot tell whether a page visually survived. Broken stylesheets, missing images, partial hydration, and stripped fallback pages are marked for replacement."
  },
  {
    number: "03",
    title: "Curate",
    summary: "Group visually distinct eras, keep the best replay, and record omitted gaps.",
    detail: "The report should show meaningful visual eras, not every timestamp. Nearby captures are compared so the clearest representative screenshot is kept, while replay gaps and unreliable eras are documented honestly."
  },
  {
    number: "04",
    title: "Publish",
    summary: "Export a shareable timeline with screenshots, source links, tech stack notes, and caveats.",
    detail: "The final output combines screenshots, Wayback links, inferred technology notes, and render caveats into a visual timeline that can be read as a history of the site's design."
  }
];

function AboutPage() {
  const { SiteNav } = require("./components/SiteNav");
  // Keep AboutPage inline since it's static content with no state
  return null; // Will be implemented properly below
}

export function App() {
  const pathname = window.location.pathname;

  const generatedReportMatch = pathname.match(/^\/reports\/generated\/([^/]+)$/);
  const generatedReportId = generatedReportMatch?.[1] ?? "";

  // Also support the old /share suffix — redirect to the base report URL
  const shareMatch = pathname.match(/^\/reports\/generated\/([^/]+)\/share$/);
  const shareReportId = shareMatch?.[1] ?? "";

  if (pathname === "/about") {
    return <AboutPageFull />;
  }

  if (pathname === "/reports") {
    return <ReportsPage />;
  }

  // Support old /reports/krynsky-com route — redirect to seed ID
  if (pathname === "/reports/krynsky-com") {
    window.location.assign("/reports/generated/krynsky-com-seed");
    return null;
  }

  if (shareReportId) {
    return <ReportPage id={shareReportId} />;
  }

  if (generatedReportId) {
    return <ReportPage id={generatedReportId} />;
  }

  return <HomePage />;
}

function AboutPageFull() {
  // Import SiteNav at the top of the file instead
  const { Archive } = require("lucide-react");
  return null; // placeholder
}
```

Actually, let me write this properly without lazy requires:

```typescript
import { Archive } from "lucide-react";
import { HomePage } from "./components/HomePage";
import { ReportPage } from "./components/ReportPage";
import { ReportsPage } from "./components/ReportsPage";
import { SiteNav } from "./components/SiteNav";

const processSteps = [
  {
    number: "01",
    title: "Discover",
    summary: "Query exact homepage captures across http, https, root, and www variants.",
    detail: "Retrosite starts by asking the Wayback Machine CDX index for exact homepage captures. It checks the common URL variants because older sites often moved between www, non-www, http, and https over time."
  },
  {
    number: "02",
    title: "Render",
    summary: "Capture full-page Wayback replays and mark broken, stripped, or partially styled versions.",
    detail: "Candidate captures need to be opened and rendered because archive data alone cannot tell whether a page visually survived. Broken stylesheets, missing images, partial hydration, and stripped fallback pages are marked for replacement."
  },
  {
    number: "03",
    title: "Curate",
    summary: "Group visually distinct eras, keep the best replay, and record omitted gaps.",
    detail: "The report should show meaningful visual eras, not every timestamp. Nearby captures are compared so the clearest representative screenshot is kept, while replay gaps and unreliable eras are documented honestly."
  },
  {
    number: "04",
    title: "Publish",
    summary: "Export a shareable timeline with screenshots, source links, tech stack notes, and caveats.",
    detail: "The final output combines screenshots, Wayback links, inferred technology notes, and render caveats into a visual timeline that can be read as a history of the site's design."
  }
];

function AboutPage() {
  return (
    <main>
      <SiteNav />
      <section className="about-hero">
        <span className="eyebrow">
          <Archive size={16} />
          About the process
        </span>
        <h1>How Retrosite creates a visual archive report</h1>
        <p>
          Retrosite turns historical Wayback Machine captures into a curated report that shows how a website changed
          over time, with screenshots, source links, technology notes, and replay caveats.
        </p>
      </section>

      <section className="about-process" aria-label="Report creation process">
        {processSteps.map((step) => (
          <article key={step.number}>
            <span>{step.number}</span>
            <h2>{step.title}</h2>
            <p>{step.summary}</p>
            <p>{step.detail}</p>
          </article>
        ))}
      </section>

      <section className="about-notes">
        <div>
          <h2>What the report includes</h2>
          <p>
            A finished report includes selected screenshots, capture dates, Wayback source links, inferred stack details,
            notes about visual changes, and transparent explanations for eras that could not be rendered reliably.
          </p>
        </div>
        <div>
          <h2>Why curation matters</h2>
          <p>
            Archive indexes contain many duplicates and many technically successful captures that do not visually replay.
            The useful artifact is a human-readable timeline of design eras, not a raw dump of every capture.
          </p>
        </div>
        <div>
          <h2>No LLM required</h2>
          <p>
            The MVP runs from deterministic archive discovery, screenshot rendering, visual-quality checks, and editable
            draft fields. An LLM could improve captions later, but the report pipeline does not depend on one.
          </p>
        </div>
      </section>
    </main>
  );
}

export function App() {
  const pathname = window.location.pathname;

  if (pathname === "/about") {
    return <AboutPage />;
  }

  if (pathname === "/reports") {
    return <ReportsPage />;
  }

  if (pathname === "/reports/krynsky-com") {
    window.location.assign("/reports/generated/krynsky-com-seed");
    return null;
  }

  const shareMatch = pathname.match(/^\/reports\/generated\/([^/]+)\/share$/);
  if (shareMatch) {
    return <ReportPage id={shareMatch[1]} />;
  }

  const reportMatch = pathname.match(/^\/reports\/generated\/([^/]+)$/);
  if (reportMatch) {
    return <ReportPage id={reportMatch[1]} />;
  }

  return <HomePage />;
}
```

- [ ] **Step 2: Remove unused imports from App.tsx**

The new `App.tsx` should only import: `Archive` from lucide-react, the four components, and `SiteNav`. Remove all type imports, helper imports, `krynskyTimeline`, `CSSProperties`, `FormEvent`, `useEffect`, `useMemo`, `useState`, and all other lucide icons that moved to components.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run existing tests**

Run: `npm test`
Expected: All tests pass (server-side tests should be unaffected)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: slim App.tsx to thin router with component imports"
```

---

### Task 12: Tech stack inference module + tests

**Files:**
- Create: `server/techstack.mjs`
- Create: `server/techstack.test.mjs`

- [ ] **Step 1: Write failing tests for detection helpers**

Create `server/techstack.test.mjs`:

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectTechStack } from "./techstack.mjs";

describe("detectTechStack", () => {
  it("detects WordPress from meta generator", () => {
    const html = `<html><head><meta name="generator" content="WordPress 4.9.8"></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("WordPress 4.9"));
    assert.strictEqual(result.techStackConfidence, "strong");
  });

  it("detects WordPress theme from wp-content path", () => {
    const html = `<html><head><link rel="stylesheet" href="/wp-content/themes/flavor/style.css"></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("WordPress"));
    assert.ok(result.techStack.includes("flavor theme"));
  });

  it("detects WordPress plugin from wp-content path", () => {
    const html = `<html><head><script src="/wp-content/plugins/jetpack/js/main.js"></script></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("WordPress"));
    assert.ok(result.techStack.includes("jetpack"));
  });

  it("detects jQuery from script src", () => {
    const html = `<html><head><script src="/js/jquery-1.12.4.min.js"></script></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("jQuery"));
  });

  it("detects Bootstrap from stylesheet", () => {
    const html = `<html><head><link rel="stylesheet" href="/css/bootstrap.min.css"></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Bootstrap"));
  });

  it("detects FrontPage from meta generator", () => {
    const html = `<html><head><meta name="generator" content="Microsoft FrontPage 4.0"></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("FrontPage 4.0"));
    assert.strictEqual(result.techStackConfidence, "strong");
  });

  it("detects Classic ASP from .asp links", () => {
    const html = `<html><body><a href="/page.asp">Link</a><a href="/other.asp?id=1">Other</a></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Classic ASP"));
  });

  it("detects Squarespace", () => {
    const html = `<html><head><script src="https://static.squarespace.com/js/main.js"></script></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Squarespace"));
  });

  it("detects Wix", () => {
    const html = `<html><head><script src="https://static.wixstatic.com/js/app.js"></script></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Wix"));
  });

  it("detects Webflow", () => {
    const html = `<html><head><script src="https://assets.website-files.com/js/webflow.js"></script></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Webflow"));
  });

  it("falls back to Static HTML when no signals found", () => {
    const html = `<html><head><title>My Page</title></head><body><p>Hello world</p></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Static HTML"));
    assert.strictEqual(result.techStackConfidence, "inferred");
  });

  it("combines multiple detections", () => {
    const html = `<html><head>
      <meta name="generator" content="WordPress 5.0">
      <script src="/js/jquery-3.3.1.min.js"></script>
      <link rel="stylesheet" href="/css/bootstrap.css">
    </head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("WordPress 5.0"));
    assert.ok(result.techStack.includes("jQuery"));
    assert.ok(result.techStack.includes("Bootstrap"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/techstack.test.mjs`
Expected: All tests FAIL (module not found)

- [ ] **Step 3: Implement `server/techstack.mjs`**

```javascript
/**
 * @param {string} html - Raw HTML string to analyze
 * @returns {{ techStack: string, techStackConfidence: "strong" | "weak" | "inferred" }}
 */
export function detectTechStack(html) {
  const detections = [];
  let confidence = "inferred";
  const lower = html.toLowerCase();

  // WordPress — meta generator
  const wpGeneratorMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress\s*([\d.]*)/i);
  if (wpGeneratorMatch) {
    detections.push(`WordPress ${wpGeneratorMatch[1] || ""}`.trim());
    confidence = "strong";
  } else if (/\/wp-content\/|\/wp-includes\//i.test(html)) {
    detections.push("WordPress");
    confidence = "strong";
  }

  // WordPress theme
  const themeMatch = html.match(/\/wp-content\/themes\/([\w-]+)\//i);
  if (themeMatch) {
    detections.push(`${themeMatch[1]} theme`);
  }

  // WordPress plugins
  const pluginMatches = new Set();
  const pluginRegex = /\/wp-content\/plugins\/([\w-]+)\//gi;
  let pluginHit;
  while ((pluginHit = pluginRegex.exec(html)) !== null) {
    pluginMatches.add(pluginHit[1]);
  }
  for (const plugin of pluginMatches) {
    detections.push(plugin);
  }

  // FrontPage — meta generator
  const fpMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']Microsoft FrontPage\s*([\d.]*)/i);
  if (fpMatch) {
    detections.push(`Microsoft FrontPage ${fpMatch[1] || ""}`.trim());
    confidence = "strong";
  } else if (/_vti_bin/i.test(html)) {
    detections.push("Microsoft FrontPage");
    confidence = "weak";
  }

  // jQuery
  const jqueryMatch = html.match(/jquery[.-]?([\d.]+)?\.(?:min\.)?js/i);
  if (jqueryMatch) {
    detections.push(jqueryMatch[1] ? `jQuery ${jqueryMatch[1]}` : "jQuery");
    if (confidence === "inferred") confidence = "weak";
  }

  // Bootstrap
  if (/bootstrap[.-]?[\d.]*\.(?:min\.)?(?:css|js)/i.test(html)) {
    const bsMatch = html.match(/bootstrap[.-]?([\d.]+)\.(?:min\.)?(?:css|js)/i);
    detections.push(bsMatch?.[1] ? `Bootstrap ${bsMatch[1]}` : "Bootstrap");
    if (confidence === "inferred") confidence = "weak";
  }

  // Classic ASP
  const aspLinks = html.match(/href=["'][^"']*\.asp(?:\?[^"']*)?["']/gi);
  if (aspLinks && aspLinks.length >= 2) {
    detections.push("Classic ASP");
    if (confidence === "inferred") confidence = "weak";
  }

  // Squarespace
  if (/static\.squarespace\.com/i.test(html) || /squarespace/i.test(lower.match(/<meta[^>]*>/g)?.join("") ?? "")) {
    detections.push("Squarespace");
    confidence = "strong";
  }

  // Wix
  if (/static\.wixstatic\.com|wix\.com/i.test(html)) {
    detections.push("Wix");
    confidence = "strong";
  }

  // Webflow
  if (/assets\.website-files\.com|webflow/i.test(html)) {
    detections.push("Webflow");
    confidence = "strong";
  }

  // Fallback
  if (detections.length === 0) {
    detections.push("Static HTML");
    confidence = "inferred";
  }

  return {
    techStack: detections.join(" · "),
    techStackConfidence: confidence
  };
}

/**
 * Run tech stack inference inside a Playwright page context.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<{ techStack: string, techStackConfidence: "strong" | "weak" | "inferred" }>}
 */
export async function inferTechStack(page) {
  const html = await page.content();
  return detectTechStack(html);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/techstack.test.mjs`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/techstack.mjs server/techstack.test.mjs
git commit -m "feat: add tech stack inference module with detection tests"
```

---

### Task 13: Integrate tech stack inference into render stage

**Files:**
- Modify: `server/index.mjs`

- [ ] **Step 1: Add import at the top of `server/index.mjs`**

After the existing imports (around line 10), add:

```javascript
import { inferTechStack } from "./techstack.mjs";
```

- [ ] **Step 2: Call `inferTechStack` in `renderEntryScreenshot`**

In the `renderEntryScreenshot` function (around line 694), after the screenshot is captured and before `page.close()`, add the tech stack call. Modify the try block:

Find this code (around lines 694-701):
```javascript
    const diagnostics = await collectRenderDiagnostics(page);
    await page.screenshot({ path: filePath, fullPage: true, timeout: 15000 });
    const screenshot = await analyzeScreenshot(filePath);

    entry.screenshotStatus = "rendered";
    entry.screenshotUrl = screenshotUrl;
    entry.screenshotError = null;
    entry.screenshotQuality = classifyRender({ screenshot, diagnostics });
    entry.renderAttempt = attemptLabel;
```

Replace with:
```javascript
    const diagnostics = await collectRenderDiagnostics(page);
    await page.screenshot({ path: filePath, fullPage: true, timeout: 15000 });
    const screenshot = await analyzeScreenshot(filePath);

    const techStackResult = await inferTechStack(page).catch(() => null);

    entry.screenshotStatus = "rendered";
    entry.screenshotUrl = screenshotUrl;
    entry.screenshotError = null;
    entry.screenshotQuality = classifyRender({ screenshot, diagnostics });
    entry.renderAttempt = attemptLabel;
    if (techStackResult) {
      entry.techStack = techStackResult.techStack;
      entry.techStackConfidence = techStackResult.techStackConfidence;
    }
```

- [ ] **Step 3: Run existing tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add server/index.mjs
git commit -m "feat: integrate tech stack inference into render stage"
```

---

### Task 14: Add DELETE /api/reports/:id endpoint

**Files:**
- Modify: `server/index.mjs`

- [ ] **Step 1: Add the DELETE endpoint**

Add this endpoint after the existing `app.get("/api/reports/:id", ...)` block (around line 1423):

```javascript
app.delete("/api/reports/:id", async (request, response) => {
  const jobId = request.params.id;

  if (jobId === "krynsky-com-seed") {
    response.status(403).json({ error: "Cannot delete the seed report." });
    return;
  }

  const job = reportJobs.get(jobId);
  if (!job) {
    response.status(404).json({ error: "Report job not found." });
    return;
  }

  if (job.status === "running" || job.status === "queued") {
    response.status(409).json({ error: "Cannot delete an active job. Cancel it first." });
    return;
  }

  reportJobs.delete(jobId);

  const outputDir = reportOutputDir(jobId);
  try {
    await rm(outputDir, { recursive: true, force: true });
  } catch {
    // Directory may not exist; that's fine
  }

  response.json({ ok: true });
});
```

- [ ] **Step 2: Add `rm` import if not already present**

Check the top of `server/index.mjs` — the existing imports use `import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"`. Add `rm` to this import:

```javascript
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add server/index.mjs
git commit -m "feat: add DELETE /api/reports/:id endpoint"
```

---

### Task 15: Duplicate domain check + pagination on GET /api/reports

**Files:**
- Modify: `server/index.mjs`

- [ ] **Step 1: Modify `POST /api/reports` for duplicate domain check**

In the `app.post("/api/reports", ...)` handler, after the existing `duplicateActiveJob` check (around line 1375), add a check for completed reports:

```javascript
    const existingCompleteJob = [...reportJobs.values()].find(
      (job) => job.host === host && (job.status === "complete" || job.status === "incomplete")
    );
    if (existingCompleteJob) {
      response.status(200).json({ existingReportId: existingCompleteJob.id });
      return;
    }
```

Insert this after the `duplicateActiveJob` block (after line 1382).

- [ ] **Step 2: Make `screenshotLimit` default to server config**

In the same handler, the line `const requestedScreenshotLimit = normalizeScreenshotLimit(request.body?.screenshotLimit);` already defaults via `normalizeScreenshotLimit`. No change needed — removing the depth dropdown on the frontend means it simply won't send the field, and the server default applies.

- [ ] **Step 3: Add pagination params to `GET /api/reports`**

Modify the `app.get("/api/reports", ...)` handler to support `offset` and `search` query params:

Replace the handler (around lines 1353-1363) with:

```javascript
app.get("/api/reports", async (request, response) => {
  await refreshPersistedJobsForExternalRunner();
  const requestedLimit = Number(request.query.limit ?? 12);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 12;
  const offset = Math.max(0, Number(request.query.offset ?? 0)) || 0;
  const search = String(request.query.search ?? "").trim().toLowerCase();

  let jobs = [...reportJobs.values()]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  if (search) {
    jobs = jobs.filter((job) => job.host.toLowerCase().includes(search));
  }

  const total = jobs.length;
  const paged = jobs.slice(offset, offset + limit).map(publicJobSummary);

  response.json({ jobs: paged, total, queue: queueSummary() });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server/index.mjs
git commit -m "feat: add duplicate domain check and pagination to reports API"
```

---

### Task 16: Seed report stable ID

**Files:**
- Modify: `server/index.mjs`

- [ ] **Step 1: Handle seed report ID in `GET /api/reports/:id`**

Modify the `app.get("/api/reports/:id", ...)` handler to return seed report data when the ID is `krynsky-com-seed`. Add this at the top of the handler, before the `reportJobs.get()` call:

```javascript
  if (request.params.id === "krynsky-com-seed") {
    response.json({
      id: "krynsky-com-seed",
      target: "krynsky.com",
      host: "krynsky.com",
      status: "complete",
      stage: "complete",
      progress: 100,
      message: "Hand-curated seed report",
      screenshotLimit: 14,
      createdAt: "1997-01-08T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      events: [],
      discovery: null,
      report: null,
      error: null,
      notifyEmail: null,
      notificationStatus: "not_requested"
    });
    return;
  }
```

The seed report's actual entries are rendered client-side from `krynskyTimeline.ts`, so the API just returns the job shell. The `ReportPage` component detects `krynsky-com-seed` and uses the seed data directly.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add server/index.mjs
git commit -m "feat: add krynsky-com-seed stable ID to reports API"
```

---

### Task 17: Final verification

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

Test the following flows:
1. Home page loads with submit form and report cards (seed krynsky.com card visible)
2. Submit a domain — navigates to `/reports/generated/:id` and shows progress
3. Wait for completion — transitions to read-only timeline view
4. Export Markdown and Export HTML buttons work
5. Copy share link button works
6. Visit `/reports/generated/krynsky-com-seed` — shows seed report timeline
7. Visit `/reports` — shows paginated list with search and filter
8. Add `?admin=1` to report page — admin controls appear (edit, delete, publish)
9. Add `?admin=1` to home page — delete buttons appear on cards
10. Submit a domain that already has a report — redirects to existing report
11. Visit old `/reports/krynsky-com` — redirects to `/reports/generated/krynsky-com-seed`

- [ ] **Step 5: Commit any fixes found during smoke test**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
