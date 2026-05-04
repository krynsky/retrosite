import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adaptiveArchiveProfile,
  candidateRenderBudget,
  cdxQueryParams,
  cdxFallbackWindows,
  cdxFallbackQueryWindows,
  depthScreenshotLimit,
  findReusableDiscoveryForJob,
  normalizeDepthMode,
  normalizeReportTarget,
  normalizeReportReadiness,
  pickCandidateEras,
  reportCompletionPatch,
  selectEntriesForCandidateRender,
  selectSameYearAlternatives,
  shouldRetryReplayNavigation,
  shouldUseCdpScreenshotFallback,
  waybackReplayUrlVariants,
  waybackQueryVariantsForTarget
} from "./index.mjs";

function capture(timestamp) {
  return {
    timestamp,
    date: `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`,
    original: `https://example.com/${timestamp}`,
    replayUrl: `https://web.archive.org/web/${timestamp}if_/https://example.com/`
  };
}

test("report targets preserve a path inside a public domain", () => {
  assert.deepEqual(normalizeReportTarget("http://friendfeed.com/krynsky"), {
    domain: "friendfeed.com",
    path: "/krynsky",
    target: "friendfeed.com/krynsky"
  });

  assert.deepEqual(normalizeReportTarget("https://www.friendfeed.com/krynsky/"), {
    domain: "friendfeed.com",
    path: "/krynsky",
    target: "friendfeed.com/krynsky"
  });
});

test("path report targets query exact path variants with and without trailing slash", () => {
  const variants = waybackQueryVariantsForTarget("http://friendfeed.com/krynsky");

  assert.deepEqual(variants, [
    "http://friendfeed.com/krynsky",
    "https://friendfeed.com/krynsky",
    "http://www.friendfeed.com/krynsky",
    "https://www.friendfeed.com/krynsky",
    "friendfeed.com/krynsky",
    "www.friendfeed.com/krynsky",
    "http://friendfeed.com/krynsky/",
    "https://friendfeed.com/krynsky/",
    "http://www.friendfeed.com/krynsky/",
    "https://www.friendfeed.com/krynsky/",
    "friendfeed.com/krynsky/",
    "www.friendfeed.com/krynsky/"
  ]);
});

test("same-year replacement candidates are sampled across the year", () => {
  const captures = [
    capture("20200101000000"),
    capture("20200201000000"),
    capture("20200301000000"),
    capture("20200401000000"),
    capture("20200501000000"),
    capture("20200601000000"),
    capture("20200701000000"),
    capture("20200801000000"),
    capture("20200901000000"),
    capture("20201001000000"),
    capture("20201101000000"),
    capture("20201201000000")
  ];

  const alternatives = selectSameYearAlternatives(captures, capture("20200101000000"), 4);

  assert.equal(alternatives.length, 4);
  assert.deepEqual(
    alternatives.map((alternative) => alternative.timestamp),
    ["20200201000000", "20200501000000", "20200801000000", "20201201000000"]
  );
});

test("candidate era selection samples more than the last capture per year", () => {
  const captures = [
    capture("20200101000000"),
    capture("20200201000000"),
    capture("20200301000000"),
    capture("20210101000000"),
    capture("20210601000000"),
    capture("20211201000000")
  ];

  const candidates = pickCandidateEras(captures);

  assert.ok(candidates.length > 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.timestamp),
    [
      "20200101000000",
      "20200201000000",
      "20200301000000",
      "20210101000000",
      "20210601000000",
      "20211201000000"
    ]
  );
});

test("candidate render selection balances years before deeper same-year samples", () => {
  const entries = [
    { ...capture("20200101000000"), candidateRank: 0 },
    { ...capture("20200201000000"), candidateRank: 1 },
    { ...capture("20200301000000"), candidateRank: 2 },
    { ...capture("20210101000000"), candidateRank: 0 },
    { ...capture("20210201000000"), candidateRank: 1 },
    { ...capture("20220101000000"), candidateRank: 0 }
  ];

  const selected = selectEntriesForCandidateRender(entries, 4);

  assert.deepEqual(
    selected.map((entry) => entry.timestamp),
    ["20200101000000", "20210101000000", "20220101000000", "20200201000000"]
  );
});

test("candidate render budget renders beyond the final screenshot limit", () => {
  const job = {
    screenshotLimit: 4,
    report: {
      entries: Array.from({ length: 20 }, (_, index) => capture(`2020${String(index + 1).padStart(2, "0")}01000000`))
    }
  };

  assert.equal(candidateRenderBudget(job), 8);
});

test("depth modes map to predictable screenshot limits", () => {
  assert.equal(normalizeDepthMode("quick"), "quick");
  assert.equal(normalizeDepthMode("standard"), "standard");
  assert.equal(normalizeDepthMode("deep"), "deep");
  assert.equal(normalizeDepthMode("unexpected"), "adaptive");
  assert.equal(depthScreenshotLimit("quick"), 10);
  assert.equal(depthScreenshotLimit("standard"), 35);
  assert.equal(depthScreenshotLimit("deep"), 50);
});

test("adaptive archive profile lowers render depth for large archives", () => {
  assert.deepEqual(
    adaptiveArchiveProfile({
      depthMode: "adaptive",
      discovery: { captureCount: 2200, variantStatus: [] }
    }),
    {
      depthMode: "adaptive",
      archiveSize: "large",
      captureCount: 2200,
      failedQueryCount: 0,
      screenshotLimit: 14,
      reason: "Large archive detected. Retrosite reduced depth to keep the job reliable."
    }
  );

  assert.deepEqual(
    adaptiveArchiveProfile({
      depthMode: "adaptive",
      discovery: {
        captureCount: 420,
        variantStatus: [{ status: "failed" }, { status: "ok" }]
      }
    }),
    {
      depthMode: "adaptive",
      archiveSize: "medium",
      captureCount: 420,
      failedQueryCount: 1,
      screenshotLimit: 18,
      reason: "Wayback was partially unstable. Retrosite used a safer depth for this run."
    }
  );
});

test("cdx fallback windows split broad archive queries into year ranges", () => {
  assert.deepEqual(cdxFallbackWindows({ fromYear: 1996, toYear: 2007, windowYears: 5 }), [
    { from: "1996", to: "2000" },
    { from: "2001", to: "2005" },
    { from: "2006", to: "2007" }
  ]);
});

test("cdx fallback query params are bounded by year and row limit", () => {
  const params = cdxQueryParams("amazon.com/", {
    from: "1996",
    to: "2000",
    limit: 1000
  });

  assert.equal(params.get("url"), "amazon.com/");
  assert.equal(params.get("matchType"), "exact");
  assert.equal(params.get("from"), "1996");
  assert.equal(params.get("to"), "2000");
  assert.equal(params.get("limit"), "1000");
  assert.equal(params.get("collapse"), "digest");
});

test("cdx fallback query params can bound broad archive queries", () => {
  const params = cdxQueryParams("amazon.com/", {
    limit: 1000
  });

  assert.equal(params.get("url"), "amazon.com/");
  assert.equal(params.get("limit"), "1000");
  assert.equal(params.has("from"), false);
  assert.equal(params.has("to"), false);
});

test("cdx fallback queries try bounded broad query before limited year windows", () => {
  assert.deepEqual(cdxFallbackQueryWindows({ fromYear: 1996, toYear: 2010, windowYears: 5, limit: 1000, maxQueries: 3 }), [
    { limit: 1000 },
    { from: "1996", to: "2000", limit: 1000 },
    { from: "2001", to: "2005", limit: 1000 }
  ]);
});

test("failed discovery can reuse the latest same-target discovery with captures", () => {
  const sourceDiscovery = {
    host: "amazon.com",
    queriedVariants: ["www.amazon.com/"],
    variantStatus: [{ variant: "www.amazon.com/", status: "ok", captureCount: 2 }],
    warning: "Prior run had partial Wayback failures.",
    captureCount: 2,
    yearSummary: [{ year: "2004", count: 2 }],
    candidates: [
      {
        timestamp: "20040106095736",
        date: "2004-01-06",
        original: "http://www.amazon.com",
        replayUrl: "https://web.archive.org/web/20040106095736if_/http://www.amazon.com",
        reason: "Earliest homepage capture for this year",
        rank: 0
      }
    ],
    captures: [
      capture("20040106095736"),
      capture("20040517060658")
    ]
  };

  const reused = findReusableDiscoveryForJob(
    { id: "new-job", target: "amazon.com" },
    [
      {
        id: "other-target",
        host: "example.com",
        updatedAt: "2026-05-04T01:00:00.000Z",
        discovery: { ...sourceDiscovery, host: "example.com" }
      },
      {
        id: "empty",
        host: "amazon.com",
        updatedAt: "2026-05-04T03:00:00.000Z",
        discovery: { ...sourceDiscovery, captureCount: 0, captures: [] }
      },
      {
        id: "cached",
        host: "amazon.com",
        version: 2,
        updatedAt: "2026-05-04T02:00:00.000Z",
        discovery: sourceDiscovery
      }
    ],
    new Error("Wayback CDX returned 503")
  );

  assert.equal(reused.captureCount, 2);
  assert.notEqual(reused, sourceDiscovery);
  assert.equal(reused.cachedFromJobId, "cached");
  assert.match(reused.warning, /Reused cached Wayback discovery from report job cached/);
  assert.match(reused.warning, /Wayback CDX returned 503/);
  assert.equal(sourceDiscovery.cachedFromJobId, undefined);
});

test("wayback replay variants include alternate modes for stubborn captures", () => {
  assert.deepEqual(waybackReplayUrlVariants("20031005172643", "http://www.amazon.com"), [
    "https://web.archive.org/web/20031005172643if_/http://www.amazon.com",
    "https://web.archive.org/web/20031005172643id_/http://www.amazon.com",
    "https://web.archive.org/web/20031005172643/http://www.amazon.com"
  ]);
});

test("font screenshot timeouts use the CDP screenshot fallback", () => {
  assert.equal(
    shouldUseCdpScreenshotFallback(
      new Error("page.screenshot: Timeout 15000ms exceeded.\n  - waiting for fonts to load...")
    ),
    true
  );
  assert.equal(shouldUseCdpScreenshotFallback(new Error("page.goto: net::ERR_HTTP2_SERVER_REFUSED_STREAM")), false);
});

test("transient Wayback replay navigation errors are retried", () => {
  assert.equal(
    shouldRetryReplayNavigation(new Error("page.goto: net::ERR_CONNECTION_REFUSED at https://web.archive.org/web/...")),
    true
  );
  assert.equal(
    shouldRetryReplayNavigation(new Error("page.goto: net::ERR_HTTP2_SERVER_REFUSED_STREAM at https://web.archive.org/web/...")),
    true
  );
  assert.equal(
    shouldRetryReplayNavigation(new Error("page.goto: Timeout 25000ms exceeded.\n  - navigating to \"https://web.archive.org/web/...\"")),
    true
  );
  assert.equal(shouldRetryReplayNavigation(new Error("page.goto: net::ERR_NAME_NOT_RESOLVED")), false);
});

test("thin generated drafts are marked incomplete instead of complete", () => {
  const job = {
    screenshotLimit: 24,
    report: {
      stats: {
        candidateCount: 20,
        renderedCount: 2,
        selectedCount: 1
      },
      curatedEntries: [{ screenshotQuality: { classification: "usable" } }]
    }
  };

  assert.deepEqual(reportCompletionPatch(job), {
    status: "incomplete",
    stage: "incomplete",
    progress: 100,
    message:
      "Draft needs more usable screenshots before it is ready. Retrosite selected 1 of 20 candidate eras."
  });
});

test("adequate generated drafts are marked complete", () => {
  const job = {
    screenshotLimit: 12,
    report: {
      stats: {
        candidateCount: 10,
        renderedCount: 8,
        selectedCount: 6
      },
      curatedEntries: Array.from({ length: 6 }, () => ({ screenshotQuality: { classification: "usable" } }))
    }
  };

  assert.deepEqual(reportCompletionPatch(job), {
    status: "complete",
    stage: "complete",
    progress: 100,
    message: "Draft report is ready for curation."
  });
});

test("generated drafts are complete when every discovered year has a selected screenshot", () => {
  const job = {
    screenshotLimit: 10,
    report: {
      stats: {
        candidateCount: 12,
        yearCount: 3,
        renderedCount: 13,
        selectedCount: 3
      },
      curatedEntries: Array.from({ length: 3 }, () => ({ screenshotQuality: { classification: "usable" } }))
    }
  };

  assert.deepEqual(reportCompletionPatch(job), {
    status: "complete",
    stage: "complete",
    progress: 100,
    message: "Draft report is ready for curation."
  });
});

test("legacy thin complete jobs are normalized to incomplete when read", () => {
  const job = {
    status: "complete",
    stage: "complete",
    progress: 100,
    message: "Draft report is ready for curation.",
    updatedAt: "2026-04-28T16:25:06.062Z",
    events: [],
    screenshotLimit: 24,
    report: {
      stats: {
        candidateCount: 20,
        renderedCount: 2,
        selectedCount: 1
      },
      curatedEntries: [{ screenshotQuality: { classification: "usable" } }]
    }
  };

  assert.equal(normalizeReportReadiness(job), true);
  assert.equal(job.status, "incomplete");
  assert.equal(job.stage, "incomplete");
  assert.match(job.message, /more usable screenshots/);
  assert.equal(job.events.length, 1);
});

test("terminal incomplete jobs are normalized to complete when readiness rules change", () => {
  const job = {
    status: "incomplete",
    stage: "incomplete",
    progress: 100,
    message: "Draft needs more usable screenshots before it is ready.",
    updatedAt: "2026-05-04T05:26:11.000Z",
    events: [],
    screenshotLimit: 10,
    report: {
      stats: {
        candidateCount: 12,
        yearCount: 3,
        renderedCount: 13,
        selectedCount: 3
      },
      curatedEntries: Array.from({ length: 3 }, () => ({ screenshotQuality: { classification: "usable" } }))
    }
  };

  assert.equal(normalizeReportReadiness(job), true);
  assert.equal(job.status, "complete");
  assert.equal(job.stage, "complete");
  assert.equal(job.message, "Draft report is ready for curation.");
  assert.equal(job.events.length, 1);
});
