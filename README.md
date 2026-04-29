# Retrosite

Retrosite turns public Wayback Machine captures into historical visual timeline reports.

The project began as a hand-curated `krynsky.com` archive report and is now a local MVP for creating similar editable reports for other domains.

## Status

Current status: local MVP, not production hardened.

Retrosite can discover captures, render screenshots, create generated timeline drafts, let a user edit/publish/share them, and export Markdown or HTML. It is still missing production concerns like auth, durable hosted storage, email notifications, billing, and automated tech-stack inference.

## Features

- Create report jobs from a public domain.
- Query Wayback Machine homepage captures across common URL variants.
- Render candidate captures with Chrome through Playwright.
- Mark weak screenshots and try nearby same-year replacements.
- Persist generated jobs and reports locally.
- Edit generated report metadata and timeline entries.
- Publish/unpublish a generated draft.
- Export Markdown and HTML.
- Open a share page for generated reports.
- View the hand-curated `krynsky.com` seed report.
- Run the API and worker in one process locally or split them for hosting.

## Routes

- `/` - create a report and view the featured seed report.
- `/about` - process overview.
- `/reports/krynsky-com` - static hand-curated seed report.
- `/reports/generated/:id` - generated report job, editor, and draft view.
- `/reports/generated/:id/share` - generated share/view page.

## Local Setup

Install dependencies:

```powershell
npm install
```

Run the local dev stack:

```powershell
npm run dev
```

Run a production-style local build:

```powershell
npm run build
npm run start
```

The built server defaults to:

```text
http://127.0.0.1:4317/
```

## Verification

```powershell
npm test
npm run check
npm run build
```

## Project Structure

```text
src/
  App.tsx                  React UI, routes, report views
  styles.css               Site styling
  data/krynskyTimeline.ts  Static seed report data
server/
  index.mjs                API, pipeline, exports, persistence
  worker.mjs               External worker entrypoint
  *.test.mjs               Node test suite
docs/
  MVP_RUNBOOK.md           Operations and hosting notes
  BACKLOG.md               Remaining work
krynsky-wayback/
  krynsky-wayback-timeline.md
  screenshots/             Original hand-curated report assets
```

## Generated Data

Generated jobs and screenshots are written under:

```text
server/generated/
```

That folder is ignored by git. For hosted use, move it to a durable volume or replace it with database/object storage.

## Known Gaps

- Generated tech stack values are placeholders until edited manually.
- Generated entry labels and notes need better deterministic annotation.
- No auth or private edit permissions exist yet.
- No email notifications yet.
- No hosted storage, queue service, or multi-user account model yet.

See `docs/BACKLOG.md` for the current backlog.
