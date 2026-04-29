# Retrosite Codex Handoff

This file is kept for continuity with the original one-time `krynsky.com` archive report. The current source of truth for ongoing agent work is:

- `HANDOFF.md`
- `README.md`
- `docs/MVP_RUNBOOK.md`
- `docs/BACKLOG.md`

## Project Context

Retrosite started as a one-time Wayback Machine visual timeline for `krynsky.com`. It is now a local MVP web app and report pipeline that can create editable visual timeline drafts for other public domains.

The original hand-curated report remains available here:

- `krynsky-wayback/krynsky-wayback-timeline.md`
- `krynsky-wayback/screenshots/`

The static seed report in the app is intentionally separate from generated test jobs:

- Route: `/reports/krynsky-com`
- Data: `src/data/krynskyTimeline.ts`

Do not overwrite or mutate the static `krynsky.com` seed report when testing generated reports for the same domain.

## Current Agent Guidance

For Claude Code, Codex, or another coding agent:

1. Read `HANDOFF.md` first.
2. Use `docs/MVP_RUNBOOK.md` for local commands, hosting shape, and environment variables.
3. Use `docs/BACKLOG.md` for the remaining MVP and post-MVP work.
4. Treat `server/generated/` and `retrosite-*.png` files as local runtime artifacts unless the user explicitly asks to preserve one.
