# Retrosite Handoff

Updated: 2026-04-29

This is the working handoff for moving between Codex, Claude Code, and future GitHub work.

## Current State

Retrosite is a local MVP for creating Wayback Machine visual timeline reports. It has:

- A React/Vite frontend.
- An Express API.
- A filesystem-backed report/job store.
- A Playwright/Chrome screenshot worker.
- A hand-curated static `krynsky.com` seed report.
- Generated report draft, edit, export, publish, and share flows.

The project is not initialized as a git repository yet. The existing `.gitignore` already excludes `node_modules/`, `dist/`, `server/generated/`, logs, and local smoke-test screenshots.

## Important URLs

When running locally:

- Home/create report: `http://127.0.0.1:4317/`
- About/process page: `http://127.0.0.1:4317/about`
- Static seed report: `http://127.0.0.1:4317/reports/krynsky-com`
- Generated edit page: `http://127.0.0.1:4317/reports/generated/:id`
- Generated share page: `http://127.0.0.1:4317/reports/generated/:id/share`

Vite dev mode also serves the client on `http://127.0.0.1:5173/`.

## Commands

Install dependencies:

```powershell
npm install
```

Run API and Vite together:

```powershell
npm run dev
```

Run a production-style local server:

```powershell
npm run build
npm run start
```

Run the worker separately:

```powershell
npm run worker
```

Verify before handing back work:

```powershell
npm test
npm run check
npm run build
```

## Key Files

- `src/App.tsx` - routes, UI, generated report editor/share/static report views.
- `src/styles.css` - all current visual styling.
- `src/data/krynskyTimeline.ts` - static seed report entries and hand-authored tech stack values.
- `server/index.mjs` - Express API, job persistence, Wayback discovery, screenshot pipeline, exports.
- `server/worker.mjs` - external worker entrypoint.
- `server/*.test.mjs` - API and pipeline shape tests.
- `docs/MVP_RUNBOOK.md` - runbook, hosting shape, env vars.
- `docs/BACKLOG.md` - remaining product and engineering work.
- `krynsky-wayback/krynsky-wayback-timeline.md` - original static Markdown report.

## Preserved Decisions

- The static `krynsky.com` report is the polished seed example and should remain hand-authored.
- Generated jobs must not overwrite `src/data/krynskyTimeline.ts` or the static `/reports/krynsky-com` route.
- Email notification UI was removed from the MVP and moved to the backlog.
- The generated share page should visually match the static report style, with the generated report action buttons kept.
- The MVP does not require an LLM. Future LLM support can improve captions, era labels, and tech-stack annotation, but core discovery/rendering should work without it.
- Generated report data is local filesystem state under `server/generated/` and is ignored by git.

## What Works

- Create report jobs from a public root domain.
- Query Wayback CDX for `http`, `https`, root, and `www` homepage variants.
- Render candidate captures through Chrome.
- Detect weak screenshots with heuristics and try same-year replacement captures.
- Persist queued/running/complete/incomplete/canceled job state.
- Restore generated jobs after server restart.
- Cancel and retry jobs.
- Edit generated report title/summary and entry title/notes/tech stack.
- Include or exclude generated entries.
- Publish/unpublish generated drafts.
- Export generated reports as Markdown and HTML.
- Copy and view generated share pages.
- Run API and worker in split mode for hosting.

## Known Limitations

- Generated reports do not infer tech stacks yet. They currently start with `Needs render review` until edited manually.
- Static `krynsky.com` tech stack values are hand-authored in `src/data/krynskyTimeline.ts`.
- Generated titles and notes are mostly generic candidate copy.
- Thin or weak generated reports can still happen when Wayback replay quality is poor.
- There is no account system, auth, billing, or private edit permission layer.
- Filesystem storage is fine for local MVP work but needs durable storage for hosting.
- Email notification delivery is not implemented.
- Generated report pages are functional, but they still need broader browser/mobile QA.

## Current Local Test Jobs

These are local artifacts only and should not be committed:

- `57eccc14-ce98-4b40-a5e7-935a7de6b6c3` - `lifestreamblog.com`, complete, 498 captures found, 20 selected, 2007-2026.
- `15180cf0-5d4b-4673-845a-c60d6710580d` - `lifestreamblog.com`, incomplete/needs review, only 1 selected usable capture.

The second job is useful for testing incomplete/needs-review UI.

## Recommended Next Layer

1. Implement deterministic tech-stack inference for generated reports.
2. Improve generated era labels and notes.
3. Add stronger review tools for weak captures and replacement choices.
4. Add browser tests around create/edit/share/export flows.
5. Initialize the GitHub repo and add a basic CI workflow.
6. Decide on hosted persistence: durable volume first, database/object storage later.

See `docs/BACKLOG.md` for the broader list.

## GitHub Prep Notes

Before the first commit:

- Keep `server/generated/`, `dist/`, `node_modules/`, `*.log`, and `retrosite-*.png` out of git.
- Commit source, docs, package files, `krynsky-wayback/`, and the hand-authored static data.
- Consider adding a sample `.env.example` once hosting variables settle.
- Consider adding GitHub Actions for `npm test`, `npm run check`, and `npm run build`.
