# Retrosite Backlog

This backlog is organized for the next agents working across Codex, Claude Code, and GitHub.

## MVP Next

- Add deterministic tech-stack inference for generated reports.
  - Inspect Wayback replay HTML and source paths.
  - Detect WordPress versions from `meta generator`, script/style paths, REST links, and common asset folders.
  - Detect WordPress themes and likely plugins from `/wp-content/themes/` and `/wp-content/plugins/`.
  - Detect obvious static/front-end stacks such as FrontPage, Classic ASP, jQuery, Bootstrap, Squarespace, Wix, Webflow, and custom static HTML.
  - Store a confidence/caveat string instead of pretending weak signals are certain.
  - Add tests with fixture HTML/source snippets.
- Improve generated title and notes creation.
  - Replace generic `YYYY candidate homepage` labels with better era labels.
  - Use domain/page title/header signals when available.
  - Keep annotations editable.
- Improve weak-capture review.
  - Show why a capture was considered weak.
  - Surface attempted replacements.
  - Allow a user to include a weak capture intentionally.
- Add focused browser tests for:
  - Home create form.
  - Generated job progress.
  - Generated edit form.
  - Generated share page.
  - Markdown and HTML exports.
- Polish generated exports so they match the in-app report style more closely.

## Hosting And Operations

- Add a durable storage strategy.
  - Short term: mounted volume for `server/generated/`.
  - Later: database for job metadata plus object storage for screenshots/exports.
- Add a real queue if multiple workers are needed.
- Add cleanup/retention rules for generated screenshots.
- Add structured logs and error reporting.
- Add hosted Chrome/Chromium provisioning notes.
- Add health checks for API, worker, and screenshot runtime.
- Add GitHub Actions for `npm test`, `npm run check`, and `npm run build`.
- Add final Pinokio launcher scripts after the public GitHub repo URL is chosen.
- Verify Vercel request-only deployment with GitHub Issue creation.

## Product

- Add user accounts and private report ownership.
- Add permissions around edit/publish/share endpoints.
- Add billing or quota limits before public launch.
- Add a report library/history page.
- Add per-report settings for max screenshots, date range, homepage path, and URL variants.
- Add a public request review workflow for the owner to triage submitted domains.
- Add manual screenshot upload/replacement.
- Add report duplication/forking.

## Deferred Email Work

Email notifications are intentionally out of the MVP UI for now.

When revisiting:

- Add optional email capture on job creation.
- Send job-complete/job-needs-review notifications.
- Add unsubscribe/suppression handling.
- Keep notification state out of public generated reports.
- Consider transactional email provider setup and local dev mocks.

## Optional LLM Layer

Retrosite does not need an LLM for the MVP.

Useful later additions:

- Draft better era titles and descriptions.
- Explain visible design changes from screenshots.
- Summarize likely tech stack evidence.
- Generate report intros.
- Suggest omitted eras or suspicious gaps.

LLM output should remain editable and should include evidence/caveats.

## Quality And Security

- Add accessibility pass for all report and form controls.
- Add mobile layout QA.
- Add input validation and URL/domain hardening.
- Add SSRF-aware network restrictions before public hosting.
- Add rate limits suitable for production.
- Add auth before exposing edit endpoints publicly.
- Add a security review for generated HTML export.
