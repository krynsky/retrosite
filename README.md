# Retrosite

Retrosite turns public Wayback Machine captures into visual website timeline reports.

[View the demo site](https://retrosite.krynsky.com/)

[![Retrosite demo site screenshot](demosite/og-image.png)](https://retrosite.krynsky.com/)

## What Retrosite Does

Retrosite is a local web app for creating timeline reports from archived website captures. You enter a domain or domain/path, Retrosite queries the Wayback Machine, renders selected captures in Chrome, and builds an editable visual timeline.

The hosted demo shows examples of finished timelines and accepts requests for future reports. To create your own reports, run the app locally.

## Features

- Generate reports from a public domain or domain/path.
- Query Wayback Machine captures across common URL variants.
- Render candidate captures with Chrome through Playwright.
- Score screenshot quality and try nearby same-year replacements for weak captures.
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

Use it to see what finished Retrosite timelines look like. The demo site is intentionally limited: it can show published examples and collect requests, but report generation and editing happen in the local app.

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
3. Wait for Wayback discovery and screenshot rendering to finish.
4. Review the generated timeline.
5. Use the local edit controls to adjust entries, notes, labels, screenshots, and thumbnail selection.
6. Export the final report as Markdown or HTML.

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
  BACKLOG.md               Remaining work
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

See `docs/BACKLOG.md` for the current backlog.
