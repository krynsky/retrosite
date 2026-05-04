# Retrosite Backlog

This backlog tracks active follow-up work. It intentionally excludes finished seed-report behavior, already-shipped timeline publishing steps, and maintainer-only demo publishing details.

## Local App Next

- Improve generated entry titles and notes.
  - Replace remaining generic `YYYY candidate homepage` labels with better era labels.
  - Use page title, header, visible navigation, and dominant content signals when available.
  - Keep all generated annotations editable in admin mode.
- Improve tech-stack inference evidence and coverage.
  - Keep the current WordPress, FrontPage, Classic ASP, jQuery, Bootstrap, Squarespace, Wix, Webflow, and static HTML detection.
  - Store the evidence behind each detection, such as `meta generator`, source path, theme path, plugin path, or repeated `.asp` links.
  - Add a human-readable caveat when detection is inferred or weak.
  - Add fixture tests from real captures, especially old personal sites, hosted blogs, and sites with mixed legacy/new platform signals.
  - Consider grouping noisy plugin lists so timeline titles stay readable.
- Improve curation QA for generated reports.
  - Make weak-capture reasons and replacement attempts easier to scan across a whole report.
  - Add side-by-side review for alternate captures in the same year.
  - Allow manual screenshot upload or replacement when Wayback capture quality is poor.
  - Preserve the existing ability to include/exclude entries, swap same-year captures, edit text, and choose a non-first timeline thumbnail.
- Add per-report generation settings.
  - Max screenshots.
  - Date range.
  - Homepage path.
  - URL variants.
- Polish generated exports so Markdown and HTML packages keep matching the in-app report style.

## Test Coverage

- Add focused browser tests for:
  - Home request/create flow.
  - Generated job progress.
  - Generated edit form.
  - Timeline image modal.
  - Version list and delete controls.
  - Thumbnail selection.
  - Markdown and HTML export downloads.
- Keep API shape tests covering:
  - Request-only submissions.
  - Report version lookup.
  - Seed report absence.
  - Entry curation.
  - Thumbnail selection.
  - Export packaging.

## Hosting And Operations

- Add a durable storage strategy if hosted generation is enabled.
  - Short term: mounted volume for `server/generated/`.
  - Later: database for job metadata plus object storage for screenshots and exports.
- Add a real queue if multiple workers are needed.
- Add cleanup and retention rules for generated screenshots, exports, request files, and notification outbox files.
- Add structured logs and error reporting.
- Add hosted Chrome/Chromium provisioning notes for non-local deployments.
- Add health checks for API, worker, and screenshot runtime.
- Add GitHub Actions for `npm test`, `npm run check`, and `npm run build`.
- Add final Pinokio launcher scripts after the public GitHub repo URL is chosen.
- Keep request-only demo configuration smoke-tested after deploys.

## Future Hosted Product

- Add user accounts and private report ownership if Retrosite becomes a public hosted generator.
- Add authenticated permissions around edit, publish, share, and delete endpoints before exposing them publicly.
- Add billing, quotas, or rate limits before public hosted generation.
- Add a richer report library with sorting, filtering, and report metadata beyond the current timeline list.
- Add a public request review workflow for owner triage.
- Add report duplication and forking.

## Deferred Email Work

Email delivery is intentionally out of the MVP UI for now. The app can write local notification outbox records, but it does not send transactional email.

When revisiting:

- Add optional email capture on job creation only where appropriate.
- Send job-complete and job-needs-review notifications.
- Add unsubscribe and suppression handling.
- Keep notification state out of public generated reports.
- Add provider setup and local dev mocks.

## Optional LLM Layer

Retrosite does not need an LLM for the MVP.

Useful later additions:

- Draft better era titles and descriptions.
- Explain visible design changes from screenshots.
- Summarize likely tech-stack evidence.
- Generate report intros.
- Suggest omitted eras or suspicious gaps.

LLM output should remain editable and should include evidence and caveats.

## Quality And Security

- Add accessibility pass for all report and form controls.
- Add mobile layout QA.
- Add stronger input validation and URL/domain hardening.
- Add SSRF-aware network restrictions before public hosting.
- Add production-grade rate limits before public hosted generation.
- Add auth before exposing edit endpoints publicly.
- Add a security review for generated HTML export.
