# Retrosite Backlog

Feature ideas based on Wayback Machine and Internet Archive tools, APIs, and services.

## Completed In 0.2.0

- Archive preflight quality report.
- Smarter timeline candidate picker.
- Archived path discovery.
- Combined `Inspect Archive` request for archive quality and path discovery.
- Source controls for Best page per year, Homepage only, Specific path, and Whole domain.
- Depth controls for Adaptive, Quick, Standard, and Deep.
- Incomplete-report explanation and retry actions.
- Safer Wayback CDX JSON handling for empty or malformed responses.
- Transient Wayback replay retry handling.
- Home page workflow reorganization around inspect, configure, and create.
- Full-width How to Use documentation for the new local workflow.

## Completed After 0.2.0

- Configurable homepage re-runs for existing reports.
- Save Page Now integration for report generation.

## Remaining Recommended Priority

1. Wayback Changes integration
2. Request triage improvements for the demo site
3. Large-site pagination and resume support
4. Archive density visualization
5. Browser/bookmarklet companion

## Completed: Preflight Archive Quality Report

Before running screenshots, show whether a domain is likely to produce a good timeline.

Status:
- Completed in `0.2.0`.
- Implemented through the archive preflight summary and the combined `Inspect Archive` workflow.

Details:
- First capture date.
- Latest capture date.
- Number of capture years covered.
- Number of unique page versions by digest.
- Likely weak years.
- Estimated run size: small, medium, or large.
- Warnings for thin archives, parked pages, duplicate captures, or Wayback instability.

Why it matters:
- Helps avoid wasted runs where captures technically exist but produce weak screenshots.
- Would have made the `1800musicnow.com` result easier to understand before spending render time.
- Gives users a clear expectation before starting a report.

Likely Wayback surfaces:
- Availability API.
- CDX API.
- CDX filters and digest counts.

## Completed: Smarter Timeline Candidate Picker

Improve capture selection using richer CDX query options.

Status:
- Completed in `0.2.0`.
- Added digest collapsing, year balancing, source modes, broader match strategies, bounded fallback windows, and transient replay retry handling.

Details:
- Use `collapse=digest` to avoid repeated identical pages.
- Use `collapse=timestamp:4` for year-level sampling.
- Use `filter=statuscode:200`.
- Use `filter=mimetype:text/html`.
- Try `matchType=prefix`, `host`, or `domain` when exact homepage captures are poor.
- Prefer captures with unique digests and better visible content signals.
- Avoid repeated parked-domain, placeholder, or nearly blank captures when possible.

Why it matters:
- Reduces weak screenshots.
- Produces more visually meaningful timelines.
- Makes the report generator less dependent on a single exact homepage URL.

Likely Wayback surfaces:
- CDX API.
- CDX filtering, collapsing, and match modes.

## Completed: Archived Path Discovery

Add a discovery step that finds archived subpages, not only homepage captures.

Status:
- Completed in `0.2.0`.
- Implemented as part of the combined `Inspect Archive` request, with path suggestions that can update the target and source mode before generation.

Details:
- Find archived paths for the submitted domain.
- Surface likely useful paths such as `/`, `/index.html`, `/home.html`, `/about`, `/main.asp`, and old application entry points.
- Let the user choose between:
  - homepage only
  - best archived page per year
  - a specific archived path
  - broader whole-domain discovery
- Use this as a retry path when homepage captures are too weak.

Why it matters:
- Older sites often have weak homepages but meaningful subpages.
- Gives incomplete reports a concrete next action.
- Could turn failed or weak reports into useful timelines without manual Wayback digging.

Likely Wayback surfaces:
- CDX API with prefix/domain matching.
- Wayback calendar URLs for reviewed paths.

## Completed: Incomplete-Report Explanation And Retry Actions

Improve the local report page when a run finishes but does not produce enough curated entries.

Status:
- Completed in `0.2.0`.
- Incomplete and thin reports now render actionable recovery guidance instead of failing into an empty or confusing report page.

Details:
- Explain the failure in human terms:
  - Wayback has captures, but most are parked-domain pages.
  - Most captures are redirects.
  - Only duplicate digests were found.
  - Homepage captures are weak, but archived subpaths may work.
  - Wayback queries timed out or were partially unstable.
- Offer one-click next actions:
  - retry
  - retry with broader domain matching
  - try `www`
  - try non-`www`
  - explore archived paths
  - manually include weak screenshots

Why it matters:
- Makes incomplete reports actionable instead of confusing.
- Reduces the gap between "the app found something" and "the user understands what happened."
- Supports local/admin workflows without affecting the public demo site.

Likely Wayback surfaces:
- Existing report diagnostics.
- CDX response metadata.
- Screenshot quality diagnostics.

## Completed: Configurable Homepage Re-Runs

Allow the homepage form to create a new report version even when the target already has a completed or incomplete report.

Status:
- Completed after `0.2.0`.
- Re-submitting a previously generated target from the homepage now creates the next version with the selected depth and source controls.
- Active jobs for the same target are still blocked so duplicate runs do not compete with each other.

Details:
- Enter a domain or path that already has a report.
- Choose a different depth, such as Quick, Standard, or Deep.
- Choose a source, such as Homepage only, Specific path, Best page per year, or Whole domain.
- Submit from the homepage to create a new version instead of redirecting to the existing report.

Why it matters:
- Makes re-runs discoverable from the same place users create reports.
- Allows deeper or narrower follow-up runs without needing a separate report-page control.
- Keeps version history intact for comparing attempts.

## 1. Wayback Changes Integration

Add comparison tools between archived versions.

Details:
- Add a "Compare eras" button on timeline entries.
- Compare previous vs current entry.
- Show content or visual drift between two captures.
- Classify changes as major redesign, minor visual update, or content-only change.
- Link to the Wayback Changes view where appropriate.

Why it matters:
- Makes Retrosite more analytical, not only visual.
- Helps users understand why a specific timeline entry matters.
- Could improve curation by finding years with meaningful change.

Likely Wayback surfaces:
- Wayback Changes.
- Existing screenshots.
- Capture timestamps and replay URLs.

## Completed: Save Page Now Integration

Let Retrosite archive the current live page before or during a report run.

Status:
- Completed after `0.2.0`.
- Report generation now asks Wayback to save the submitted live URL while discovery runs.
- When Wayback returns a usable timestamp, Retrosite stores the result on the job, merges it into discovery, and prioritizes it for candidate rendering.
- If Wayback throttles, times out, or accepts the save without an immediate timestamp, the report continues with existing captures.

Details:
- Save current page during report generation.
- Add today as a current timeline candidate when Wayback returns the capture.
- Store the Save Page Now result on the report job.
- Keep the operation best-effort so Save Page Now outages do not block reports.

Why it matters:
- Produces a better past-to-present timeline.
- Helps preserve the current state of a site before it changes.
- Useful for reports about active websites where the latest Wayback capture may be stale.

Likely Wayback surfaces:
- Save Page Now.
- Wayback save endpoint.

## 2. Request Triage Improvements For The Demo Site

Attach archive-health details to GitHub timeline request issues.

Details:
- When someone submits a timeline request, add a quick Wayback preflight summary to the created issue.
- Include:
  - capture count
  - year range
  - unique digest count
  - top warnings
  - likely runtime
  - exact Wayback calendar link
  - suggested run mode
- Keep this public-demo-only request flow separate from local app publishing.

Why it matters:
- Makes the GitHub request queue easier to prioritize.
- Helps decide whether to run, skip, or manually inspect a request.
- Keeps weak requests from consuming unnecessary local processing time.

Likely Wayback surfaces:
- Availability API.
- CDX API.
- Wayback calendar URLs.
- GitHub issue body/comments.

## 3. Large-Site Pagination And Resume Support

Improve reliability for large archives.

Details:
- Use CDX pagination or resume keys for large result sets.
- Avoid treating large result sets as failures too early.
- Continue partial discovery when a broad query times out.
- Save progress so a discovery run can resume instead of restarting.
- Keep small archives fast while making large archives more robust.

Why it matters:
- Large sites are currently more likely to hit timeouts or need aggressive fallback behavior.
- Better pagination would improve reliability without bloating normal small-site runs.

Likely Wayback surfaces:
- CDX API pagination.
- CDX resume keys.

## 4. Archive Density Visualization

Add a compact visualization of archive coverage.

Details:
- Show years on an axis.
- Show capture density by year.
- Show unique digest count by year.
- Mark selected screenshot entries.
- Mark weak, failed, and missing years.
- Include this before a run, inside a report, or both.

Why it matters:
- Explains why certain years were selected.
- Helps users understand archive quality at a glance.
- Makes Retrosite feel more transparent and analytical.

Likely Wayback surfaces:
- CDX year summaries.
- Existing report discovery metadata.
- Screenshot quality classifications.

## 5. Browser Or Bookmarklet Companion

Create a lightweight way to send the current page to Retrosite.

Details:
- Add a bookmarklet or simple browser helper.
- Send the current URL to the local Retrosite app.
- Optional actions:
  - run timeline
  - preflight archive quality
  - Save Page Now
  - open Wayback calendar

Why it matters:
- Makes local Retrosite easier to use while browsing.
- Avoids copy/paste friction.
- Aligns with Wayback's own browser extension and mobile app ecosystem.

Likely Wayback surfaces:
- Wayback browser tools as inspiration.
- Local Retrosite API.
- Save Page Now.

## Source Surfaces Reviewed

- Wayback Machine homepage: https://web.archive.org/
- Internet Archive developer portal: https://archive.org/developers/
- Internet Archive tools and APIs: https://archive.org/developers/index-apis.html
- Availability API tutorial: https://archive.org/developers/tutorial-get-snapshot-wayback.html
- Snapshot comparison tutorial: https://archive.org/developers/tutorial-compare-snapshot-wayback.html
- Wayback APIs help: https://archive.org/help/wayback_api.php
- CDX Server API: https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server
