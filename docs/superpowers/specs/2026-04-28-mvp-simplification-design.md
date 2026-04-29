# MVP Simplification Design

Date: 2026-04-28

## Summary

Scale down Retrosite's MVP to a simple flow: submit a domain, watch progress, view a read-only timeline report. Hide all report editing behind a `?admin=1` query parameter. Add tech stack inference during the render stage. Split the monolithic `App.tsx` into focused components.

## Page Structure & Routing

### Home page (`/`)

- Submit form at top: domain input + create button. No depth dropdown — use the server default (`RETROSITE_SCREENSHOT_LIMIT`, currently 5).
- If the submitted domain already has a completed generated report, navigate to the existing report instead of creating a duplicate.
- Below the form: grid of the 8 most recent report cards. Each card shows the oldest available screenshot as a thumbnail, domain name, date range, and job status.
- The static krynsky.com seed report appears as a card with a fixed ID (`krynsky-com-seed`), blended in with generated reports.
- "View more" link at the bottom navigates to `/reports`.

### Reports list page (`/reports`)

- Paginated list of all reports (generated + seed).
- Search by domain name.
- Filter by status (complete, running, failed, etc.).

### Report page (`/reports/generated/:id`)

- Single URL serves both progress and final report.
- While job is running: displays the existing stage pipeline progress visualization (reused `GeneratedJobProgress` component).
- Once complete: transitions to a read-only timeline view matching the krynsky.com layout (left nav with year/tech-stack buttons, main area with screenshot + metadata).
- Always visible: Export Markdown button, Export HTML button, Copy share link button.
- No editing controls unless `?admin=1` is present in the URL.

### Static seed report

- Assigned a stable ID: `krynsky-com-seed`.
- Accessible at `/reports/generated/krynsky-com-seed` (unified with other reports).
- `TimelineView` renders seed data from `krynskyTimeline.ts` when the ID is `krynsky-com-seed`, and generated report entries for all other IDs. Same component, different data source.
- Submitting `krynsky.com` in the form creates a new generated report for comparison — the duplicate check only matches against generated reports, not the seed.

### About page (`/about`)

- Unchanged.

## Admin Mode

### Activation

Query parameter `?admin=1` on any page that supports it. No authentication, no session — purely a frontend UI toggle. The API endpoints remain available without restriction (auth is a later backlog item).

### Admin controls on report page (`/reports/generated/:id?admin=1`)

- Edit report title and summary.
- Edit individual entry title, notes, and tech stack.
- Include/exclude entries from the curated timeline.
- Publish/unpublish the report.
- Cancel or retry running jobs.
- Delete the report (calls `DELETE /api/reports/:id`).

### Admin controls on home page (`/?admin=1`)

- Delete button on each report card.

### No visible admin indicator

No nav badge, no toggle in the UI. Hidden power-user feature via URL.

## Tech Stack Inference

### When it runs

During the render stage, while Playwright has the page open. Runs after the screenshot is captured, before the page is closed. This avoids a second pass and reuses the existing browser context.

### Module

New file: `server/techstack.mjs`. Exports:
- `inferTechStack(page)` — runs `page.evaluate()` in the Playwright context. Returns `{ techStack: string, techStackConfidence: "strong" | "weak" | "inferred" }`.
- Detection helper functions exported separately for unit testing without a browser.

### Detection targets

| Technology | Signals |
|---|---|
| WordPress | `meta[name="generator"]` content, `/wp-content/`, `/wp-includes/`, REST API `<link>` tags |
| WordPress themes/plugins | Theme and plugin names parsed from `/wp-content/themes/` and `/wp-content/plugins/` paths |
| jQuery | `window.jQuery` presence, script src containing `jquery` |
| Bootstrap | Stylesheet/script src containing `bootstrap`, Bootstrap CSS classes in DOM |
| FrontPage | `meta[name="generator"]` containing "FrontPage", `_vti_bin` paths |
| Classic ASP | `.asp` page extensions in links/forms |
| Squarespace | `static.squarespace.com` resources, `squarespace` in meta/scripts |
| Wix | `static.wixstatic.com`, `wix.com` script sources |
| Webflow | `assets.website-files.com`, `webflow` in classes/scripts |
| Static HTML | Fallback when no framework signals found (few scripts, no CMS markers) |

### Output format

```json
{
  "techStack": "WordPress 4.9 · flavor theme · jQuery 1.12",
  "techStackConfidence": "strong"
}
```

Multiple detections joined with ` · `. Replaces the current `"Needs render review"` placeholder on generated entries.

### Testing

`server/techstack.test.mjs` — fixture HTML snippets for each detection target. Tests run against the exported parsing/matching functions (no browser required).

## Component Split

### Frontend (`src/`)

| File | Responsibility |
|---|---|
| `App.tsx` | Router, top-level state, admin flag detection from query params |
| `components/SiteNav.tsx` | Navigation bar |
| `components/HomePage.tsx` | Submit form, report card grid (8 most recent), "view more" link |
| `components/ReportsPage.tsx` | Paginated report list, search by domain, status filter |
| `components/ReportPage.tsx` | Unified progress + read-only timeline for `/reports/generated/:id` |
| `components/AdminControls.tsx` | Edit forms, delete, publish/unpublish — rendered when `?admin=1` |
| `components/JobProgress.tsx` | Stage pipeline progress visualization (extracted from `GeneratedJobProgress`) |
| `components/TimelineView.tsx` | Read-only timeline layout (left nav + screenshot detail) — shared by seed and generated reports |
| `components/ReportCard.tsx` | Card with thumbnail, domain, date range, status |
| `data/krynskyTimeline.ts` | Seed report data (unchanged) |

### Server (`server/`)

| File | Change |
|---|---|
| `index.mjs` | Add `DELETE /api/reports/:id` endpoint. Add duplicate domain check on `POST /api/reports`. Integrate `inferTechStack()` call in the render stage. |
| `techstack.mjs` | New — tech stack inference logic and Playwright evaluation |
| `techstack.test.mjs` | New — fixture-based detection tests |

## API Changes

### New endpoint: `DELETE /api/reports/:id`

Deletes a generated report and its associated screenshots from disk. Returns `{ ok: true }` on success, 404 if not found. Does not allow deleting the seed report (`krynsky-com-seed`).

### Modified endpoint: `POST /api/reports`

Before creating a new job, check if a completed, running, or queued generated report already exists for the normalized domain. If found, return `{ existingReportId: "<id>" }` with status 200 instead of creating a duplicate. The frontend navigates to the existing report.

The depth/screenshotLimit parameter becomes optional, defaulting to the server's `RETROSITE_SCREENSHOT_LIMIT` value.

### Existing endpoints

All edit/patch/publish endpoints remain functional. No server-side admin gating — the frontend hides these controls unless `?admin=1`.
