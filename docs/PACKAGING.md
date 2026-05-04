# Retrosite Packaging Plan

Retrosite is intended to ship in three practical forms:

1. Local app from GitHub.
2. Pinokio wrapper for one-click local installs.
3. Vercel public demo that accepts timeline requests but does not run report generation.

## Local GitHub App

Local users run the full stack on their machine:

```powershell
npm install
npm run dev
```

Local mode is the default:

```text
RETROSITE_MODE=local
RETROSITE_RUNNER_MODE=inline
```

The local app can create reports, render screenshots, edit timelines, export Markdown/HTML, and publish static timeline JSON/assets.

## Pinokio App

The Pinokio launcher lives in `pinokio/` and is a thin wrapper around the normal local app. It:

- Clones the GitHub repo into `pinokio/app/`.
- Runs `npm install`.
- Installs Playwright Chromium for screenshot rendering.
- Starts `npm run dev`.
- Opens `http://127.0.0.1:5173/`.
- Keeps `pinokio/app/server/generated/` local and persistent.

The main repo remains runnable without Pinokio-specific assumptions. Pinokio start sets `RETROSITE_USE_BUNDLED_CHROMIUM=1` so the screenshot renderer uses the browser installed by the launcher.

## Vercel Demo

The Vercel version should not run report generation. Screenshot rendering requires long-running Node/Chrome work and persistent disk, which is a poor fit for Vercel serverless functions.

Use request-only mode:

```text
RETROSITE_MODE=request-only
RETROSITE_REQUEST_SINK=github
RETROSITE_REQUEST_REPO=owner/repo
GITHUB_TOKEN=<token with issue write access>
```

In this mode:

- `/api/config` tells the frontend to show request behavior.
- `/api/requests` creates a GitHub issue for review.
- `/api/reports` generation is disabled in the Express server.
- Report edit/admin controls are hidden, and mutation endpoints are disabled.
- Published timelines are static files under `krynsky-wayback/timelines/`.

## Publishing A Locally Generated Timeline

Generate and edit a report locally, then publish it to the static public folder:

```powershell
npm run publish:timeline -- <job-id-or-target>
```

Examples:

```powershell
npm run publish:timeline -- lifestreamblog.com
npm run publish:timeline -- friendfeed.com/krynsky
```

The script writes:

```text
krynsky-wayback/timelines/<encoded-target>/timeline.json
krynsky-wayback/timelines/<encoded-target>/screenshots/
```

Because Vite serves `krynsky-wayback/` as the public directory, the published timeline is available at:

```text
/timeline/<encoded-target>
```

The React report page first tries the live API. If the API report is unavailable, it falls back to:

```text
/timelines/<encoded-target>/timeline.json
```

## Git Ignore Policy

Do not commit local generated jobs:

```text
server/generated/
```

Do commit intentional static assets:

```text
design_handoff/twitter.png
krynsky-wayback/screenshots/
krynsky-wayback/timelines/
```

## Recommended Release Order

1. Commit the local app and docs.
2. Verify `npm test`, `npm run check`, and `npm run build`.
3. Create GitHub repo.
4. Configure Vercel with request-only env vars.
5. Publish selected timelines locally and commit the static `krynsky-wayback/timelines/` output.
6. Keep the Pinokio launcher verified after changes to install or start commands.
