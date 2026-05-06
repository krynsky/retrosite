# Retrosite Backlog

Future feature ideas based on Wayback Machine and Internet Archive tools, APIs, and services.

## Recommended Priority

1. Preflight archive quality report
2. Smarter timeline candidate picker
3. Explore archived paths mode
4. Incomplete-report explanation and retry actions
5. Wayback Changes integration
6. Save Page Now integration
7. Request triage improvements for the demo site
8. Large-site pagination and resume support
9. Archive density visualization
10. Browser/bookmarklet companion

## 1. Preflight Archive Quality Report

Before running screenshots, show whether a domain is likely to produce a good timeline.

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

## 2. Smarter Timeline Candidate Picker

Improve capture selection using richer CDX query options.

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

## 3. Explore Archived Paths Mode

Add a discovery step that finds archived subpages, not only homepage captures.

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

## 4. Incomplete-Report Explanation And Retry Actions

Improve the local report page when a run finishes but does not produce enough curated entries.

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

## 5. Wayback Changes Integration

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

## 6. Save Page Now Integration

Let Retrosite archive the current live page before or during a report run.

Details:
- Add "Save current page before report."
- Add "Add today as final timeline entry."
- Add "Archive this URL now" from a local report page.
- Store the Save Page Now result as a final candidate capture when available.

Why it matters:
- Produces a better past-to-present timeline.
- Helps preserve the current state of a site before it changes.
- Useful for reports about active websites where the latest Wayback capture may be stale.

Likely Wayback surfaces:
- Save Page Now.
- Wayback save endpoint.

## 7. Request Triage Improvements For The Demo Site

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

## 8. Large-Site Pagination And Resume Support

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

## 9. Archive Density Visualization

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

## 10. Browser Or Bookmarklet Companion

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
