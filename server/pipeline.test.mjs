import assert from "node:assert/strict";
import { test } from "node:test";
import {
  candidateRenderBudget,
  normalizeReportTarget,
  normalizeReportReadiness,
  pickCandidateEras,
  reportCompletionPatch,
  selectEntriesForCandidateRender,
  selectSameYearAlternatives,
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
