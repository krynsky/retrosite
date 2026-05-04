# Retrosite MVP Runbook

Retrosite is a local-first web app plus API/worker pipeline for turning public Wayback Machine captures into editable visual timeline reports.

## Current MVP Shape

The current MVP has three main surfaces:

- A create-report home page at `/`.
- A hand-curated seed report at `/timeline/krynsky.com`.
- Generated and published timeline pages at `/timeline/:target`.
- A request-only hosted demo mode for collecting timeline requests without running report generation.

The seed `krynsky.com` report is static and intentionally protected from generated test jobs. Its tech stack values are hand-authored in `src/data/krynskyTimeline.ts`.

Generated reports are filesystem-backed local drafts. They can be edited, published, exported, and shared, but they are not protected by user accounts yet.

## What Works Now

- Create a report job from a public root domain.
- Choose screenshot depth from the home page.
- Query Wayback CDX across `http`, `https`, root, and `www` homepage variants.
- Group candidate captures by year/era sampling.
- Render candidate homepage captures with Playwright/Chrome.
- Flag weak screenshots and try same-year replacements.
- Save generated jobs and screenshots under `server/generated/reports/`.
- Restore persisted generated jobs after server restart.
- Mark thin generated results as incomplete/needs review instead of complete.
- Open a durable generated report page at `/reports/generated/:id`.
- View job progress and generated report content on one page.
- Edit report title, summary, selected entries, entry notes, and tech stack.
- Include/exclude entries.
- Publish/unpublish a generated report draft.
- Export Markdown and HTML.
- Open a generated share page at `/reports/generated/:id/share`.
- Copy the generated share link.
- Cancel queued/running jobs and retry failed/canceled jobs.
- Run API and worker separately for hosted deployments.
- Submit timeline requests in request-only mode.
- Publish a local generated timeline into static public assets under `demosite/timelines/`.

## What Is Intentionally Not Connected Yet

- Email notifications are in the backlog. The current MVP does not show email collection or delivery controls.
- User accounts, billing, and private edit permissions are not implemented.
- Generated report storage is filesystem-based, not a database or object store.
- Generated tech stack inference is not implemented. Generated entries currently start with `Needs render review` and can be edited manually.
- Generated titles and notes are still generic and need better deterministic annotation.
- Vercel-hosted report generation is intentionally not connected. Use Vercel for request intake and static published timelines, not screenshot rendering.

## Local Development

Run the combined local dev stack:

```powershell
npm run dev
```

This starts:

- API: `http://127.0.0.1:4317`
- Vite web: `http://127.0.0.1:5173`

Run the production-style built server:

```powershell
npm run build
npm run start
```

The built server defaults to:

```text
http://127.0.0.1:4317
```

Health check:

```text
GET /api/health
```

Expected shape:

```json
{"ok":true,"runnerMode":"inline","mode":"local"}
```

Request-only demo mode:

```powershell
$env:RETROSITE_MODE = "request-only"
npm run dev
```

In request-only mode the home form submits to `/api/requests`; `POST /api/reports` returns `403`.
Report edit, delete, cancel, retry, and rerun endpoints also return `403` in request-only mode. Edit/admin controls are shown automatically in local mode and hidden automatically in request-only mode.

## Split API And Worker Mode

For a hosted web service, run the web/API process without inline report execution:

```powershell
$env:RETROSITE_RUNNER_MODE = "external"
npm run start
```

Run the worker in a second process:

```powershell
npm run worker
```

In split mode, `POST /api/reports` persists a queued job and the worker picks it up from `server/generated/reports/`.

Worker one-shot smoke test:

```powershell
$env:RETROSITE_WORKER_ONCE = "1"
npm run worker
```

## Important Environment Variables

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | `4317` | API/static server port |
| `RETROSITE_RUNNER_MODE` | `inline` | Set to `external` so only workers execute jobs |
| `RETROSITE_MODE` | `local` | Set to `request-only` for public demo request intake |
| `RETROSITE_REQUEST_QUEUE_ROOT` | `server/generated/requests` | Local filesystem queue for request-only Express mode |
| `RETROSITE_REQUEST_SINK` | `local` | Public config hint; Vercel expects `github` |
| `RETROSITE_REQUEST_REPO` | unset | GitHub `owner/repo` used by Vercel `/api/requests` |
| `GITHUB_TOKEN` | unset | Token with GitHub issue write access for Vercel request intake |
| `RETROSITE_DISABLE_RUNNER` | unset | Set to `1` to disable inline execution entirely |
| `RETROSITE_GENERATED_ROOT` | `server/generated` | Persistent report/job/screenshot storage |
| `RETROSITE_NOTIFICATION_OUTBOX` | `server/generated/notifications` | Local notification artifact path; email UI is currently deferred |
| `RETROSITE_APP_ORIGIN` | `http://127.0.0.1:<PORT>` | Origin used in generated links from server-side metadata |
| `RETROSITE_WEB_URL` | `http://127.0.0.1:5173/` | Dev fallback when built client is missing |
| `RETROSITE_MAX_ACTIVE_JOBS` | `3` | Maximum queued/running jobs accepted at once |
| `RETROSITE_CREATE_RATE_LIMIT` | `12` | Report creation attempts per browser/IP window; `0` disables |
| `RETROSITE_CREATE_RATE_WINDOW_MS` | `900000` | Rate-limit window |
| `RETROSITE_SCREENSHOT_LIMIT` | `5` | Default max screenshots for new jobs |
| `RETROSITE_MAX_SCREENSHOT_LIMIT` | `24` | Hard max screenshot depth |
| `RETROSITE_REPLACEMENT_LIMIT` | `8` | Max same-year replacements to try for weak captures |
| `RETROSITE_CDX_TIMEOUT_MS` | `45000` | Wayback CDX request timeout |
| `RETROSITE_CDX_RETRIES` | `2` | CDX retry count |
| `RETROSITE_CDX_CONCURRENCY` | `3` | Concurrent CDX request count |
| `RETROSITE_CDX_RETRY_DELAY_MS` | `1200` | Delay between CDX retries |
| `RETROSITE_WORKER_POLL_MS` | `5000` | Worker polling interval in split mode |
| `RETROSITE_WORKER_ONCE` | unset | Set to `1` for one worker polling pass |

## API Routes

- `GET /api/health`
- `GET /api/config`
- `POST /api/requests`
- `GET /api/reports`
- `POST /api/reports`
- `GET /api/reports/:id`
- `POST /api/reports/:id/cancel`
- `POST /api/reports/:id/retry`
- `PATCH /api/reports/:id`
- `PATCH /api/reports/:id/entries`
- `GET /api/reports/:id/export.md`
- `GET /api/reports/:id/export.html`
- `GET /api/wayback/discover`

## Hosting Shape

Fully automated report generation hosting needs:

- Node.js runtime for the Express API.
- A worker process with the same code and shared `RETROSITE_GENERATED_ROOT`.
- Chrome or Chromium available to Playwright.
- Persistent disk or mounted volume for generated reports and screenshots.
- Reverse proxy or platform routing to the API/static server.

Good next infrastructure step:

- Move `server/generated` to a durable volume or object storage.
- Add a small database for job metadata if multiple API instances or multiple workers are needed.
- Add authentication before opening edit endpoints to the public internet.
- Add a real queue if report volume grows beyond a single worker.

Chosen public demo shape:

- Vercel serves the React app and static published timelines.
- Vercel `/api/config` returns request-only mode.
- Vercel `/api/requests` creates GitHub Issues for requested domains.
- The owner reviews requests, generates timelines locally, publishes static assets with `npm run publish:timeline`, and commits/uploads those assets.

Publish a timeline:

```powershell
npm run publish:timeline -- <job-id-or-target>
```

Output:

```text
demosite/timelines/<encoded-target>/timeline.json
demosite/timelines/<encoded-target>/screenshots/
```

## GitHub Notes

The project is ready to initialize as a GitHub repository after one more review pass.

Already ignored:

- `node_modules/`
- `dist/`
- `.vite/`
- `server/generated/`
- `*.log`
- `retrosite-*.png`
- `*.local`

Commit source, docs, package files, static data, and the original `demosite/` report assets.

Do not commit local generated jobs unless a specific generated fixture is intentionally promoted into test data.

## Verification

Before handing back code changes:

```powershell
npm test
npm run check
npm run build
```

For frontend layout changes, also inspect:

- `/`
- `/about`
- `/timeline/krynsky.com`
- `/timeline/:target`
- `/timeline/:target/v/:version`

## Known Good Smoke Targets

Local generated IDs may not exist on another clone because `server/generated/` is ignored. On this machine, these have been useful:

- `57eccc14-ce98-4b40-a5e7-935a7de6b6c3` - complete `lifestreamblog.com` draft with many entries.
- `15180cf0-5d4b-4673-845a-c60d6710580d` - incomplete/needs-review `lifestreamblog.com` draft.

Use them for local UI testing only.
