# Retrosite

Retrosite turns public Wayback Machine captures into editable visual website timeline reports.

Current release: `0.2.0`

[View the demo site](https://retrosite.krynsky.com/)

[![Retrosite demo site screenshot](demosite/og-image.png)](https://retrosite.krynsky.com/)

## What Retrosite Does

Retrosite is a local web app for creating timeline reports from archived website captures. You enter a domain or domain/path, inspect the available Wayback history, choose how deep the run should go, and generate an editable visual timeline from rendered archive captures.

The hosted demo shows examples of finished timelines and accepts requests for future reports. Report generation, review, editing, versioning, and exports happen in the local app.

## New in 0.2.0

- Added `Inspect Archive`, a single request that summarizes Wayback history and discovers useful archived paths before report generation.
- Added archive quality details for capture range, yearly coverage, unique digests, weak years, estimated run size, render cap, and Wayback availability warnings.
- Added archived path suggestions so large sites can be narrowed to representative sections before rendering.
- Added source controls for Best page per year, Homepage only, Specific path, and Whole domain.
- Added depth controls for Adaptive, Quick, Standard, and Deep report generation.
- Added smarter candidate picking with CDX status/mimetype filters, digest collapsing, balanced yearly sampling, broader URL matching, and bounded fallback windows.
- Added safer Wayback JSON handling so empty or malformed CDX responses do not crash the archive check flow.
- Added transient replay retry handling and clearer incomplete-report recovery controls.
- Updated the home page so creation follows the real process: enter target, inspect archive, choose settings, create timeline.
- Updated the How to Use page as a full-width single-page instruction guide for the new local workflow.

## Features

- Generate reports from a public domain or domain/path.
- Inspect Wayback history before rendering screenshots.
- Discover archived paths for sites whose important content is not on the homepage.
- Choose archive source scope before generation:
  - Best page per year: sample the strongest archived page for each year.
  - Homepage only: focus the timeline on the root page.
  - Specific path: generate from a chosen archived path.
  - Whole domain: allow broader domain-wide discovery.
- Choose generation depth before rendering:
  - Adaptive: balances speed and coverage based on archive size.
  - Quick: smaller render budget for faster first passes.
  - Standard: broader coverage for normal reports.
  - Deep: larger render budget for richer archives.
- Query Wayback Machine captures across common URL variants and fallback windows.
- Render candidate captures with Chrome through Playwright.
- Score screenshot quality and try nearby same-year replacements for weak captures.
- Show incomplete or thin reports with recovery guidance instead of a blank timeline.
- Review and curate which captures appear in the final timeline.
- Edit timeline labels, notes, and tech-stack fields.
- Select a custom thumbnail for a timeline.
- Browse timelines in full timeline mode or image-only mode.
- Open screenshots in a full-size modal.
- Keep version history for generated timelines.
- Delete reports or older versions locally.
- Export finished reports as Markdown or HTML packages with screenshot assets.
- Infer tech stack details such as WordPress and FrontPage versions, readable WordPress theme/plugin names, and legacy ASP-link signals.

## Demo Site

The demo site is available at:

```text
https://retrosite.krynsky.com/
```

Use it to see finished Retrosite timelines. The demo site is intentionally limited: it can show published examples and collect requests, but it does not run the local screenshot pipeline.

## Local Setup

Install dependencies:

```powershell
npm install
```

Run the local dev stack:

```powershell
npm run dev
```

Open the local app:

```text
http://127.0.0.1:5173/
```

The API runs at:

```text
http://127.0.0.1:4317/
```

## Creating a Timeline Locally

1. Start the app with `npm run dev`.
2. Enter a domain or domain/path, such as `example.com` or `example.com/blog`.
3. Select `Inspect Archive` to review Wayback coverage and discover archived paths in one request.
4. If a suggested path is a better target, select it from the archive results.
5. Choose a depth: Adaptive, Quick, Standard, or Deep.
6. Choose a source: Best page per year, Homepage only, Specific path, or Whole domain.
7. Select `Create Timeline` and wait for Wayback discovery and screenshot rendering to finish.
8. Review the generated timeline and use the local controls to adjust entries, notes, labels, screenshots, and thumbnail selection.
9. Export the final report as Markdown or HTML.

Generated jobs and screenshots are stored locally under:

```text
server/generated/
```

That folder is ignored by git.

## Useful Commands

Run tests:

```powershell
npm test
```

Run TypeScript checks:

```powershell
npm run check
```

Build the app:

```powershell
npm run build
```

Run a production-style local server:

```powershell
npm run build
npm run start
```

## Pinokio

Retrosite includes a Pinokio launcher in `pinokio/`. Open that folder in Pinokio, then run `Install` and `Start`. The launcher clones the app, installs dependencies, installs Playwright Chromium, starts the local dev stack, and keeps generated reports under `pinokio/app/server/generated/`.

## Routes

- `/` - local report creation form.
- `/about` - overview of how the hosted demo works.
- `/how-to-use` - local usage guide.
- `/timeline` - timeline list.
- `/timeline/:target` - timeline view.
- `/timeline/:target/v/:version` - local generated timeline version view.

## API Highlights

- `POST /api/wayback/inspect` - archive summary and archived path discovery in one request.
- `POST /api/wayback/preflight` - archive summary only.
- `POST /api/wayback/paths` - archived path discovery only.
- `POST /api/reports` - create a local report job with selected depth and source settings.
- `GET /api/reports` - list locally generated reports.
- `GET /api/reports/:target` - fetch the latest local report for a target.

## Project Structure

```text
src/
  App.tsx                  React routes and informational pages
  components/              Timeline, report, nav, modal, and admin UI
  helpers.ts               Shared UI/report helpers
  reportCards.ts           Report summary conversion
  styles.css               Site styling
server/
  index.mjs                API, pipeline, exports, persistence, curation
  techstack.mjs            Deterministic tech-stack inference
  worker.mjs               External worker entrypoint
  *.test.mjs               Node test suite
docs/
  MVP_RUNBOOK.md           Operations and hosting notes
  PACKAGING.md             Local, Pinokio, and Vercel packaging notes
demosite/
  og-image.png             Demo-site screenshot used by link previews
  screenshots/             Original hand-curated report assets
```

## Notes

- Retrosite depends on local browser automation, so generation is meant to run on your machine.
- The hosted demo does not run the screenshot pipeline directly.
- Generated entry titles can still benefit from manual curation.
- There is no hosted multi-user account model.
- Email notifications and durable hosted queues are not productionized yet.

See `backlog.md` for the current backlog.
