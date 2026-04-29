import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { writeNotificationOutbox } from "./notifications.mjs";
import { inferTechStack } from "./techstack.mjs";

const app = express();
const port = Number(process.env.PORT ?? 4317);
const reportJobs = new Map();
const persistQueues = new Map();
const runningJobIds = new Set();
let reportRunQueue = Promise.resolve();
const currentFile = fileURLToPath(import.meta.url);
const __dirname = path.dirname(currentFile);
const generatedRoot = process.env.RETROSITE_GENERATED_ROOT ?? path.join(__dirname, "generated");
const notificationOutboxRoot = process.env.RETROSITE_NOTIFICATION_OUTBOX ?? path.join(generatedRoot, "notifications");
const clientDistRoot = path.join(__dirname, "..", "dist");
const clientIndexFile = path.join(clientDistRoot, "index.html");
const defaultScreenshotLimit = Number(process.env.RETROSITE_SCREENSHOT_LIMIT ?? 5);
const maxScreenshotLimit = Number(process.env.RETROSITE_MAX_SCREENSHOT_LIMIT ?? 24);
const replacementLimit = Number(process.env.RETROSITE_REPLACEMENT_LIMIT ?? 8);
const cdxTimeoutMs = Number(process.env.RETROSITE_CDX_TIMEOUT_MS ?? 45000);
const cdxRetryCount = Number(process.env.RETROSITE_CDX_RETRIES ?? 2);
const cdxConcurrency = Number(process.env.RETROSITE_CDX_CONCURRENCY ?? 3);
const cdxRetryDelayMs = Number(process.env.RETROSITE_CDX_RETRY_DELAY_MS ?? 1200);
const maxActiveJobs = Number(process.env.RETROSITE_MAX_ACTIVE_JOBS ?? 3);
const createRateLimit = Number(process.env.RETROSITE_CREATE_RATE_LIMIT ?? 12);
const createRateWindowMs = Number(process.env.RETROSITE_CREATE_RATE_WINDOW_MS ?? 15 * 60 * 1000);
const createRateBuckets = new Map();

app.use(express.json());
app.use("/generated", express.static(generatedRoot));
app.use(express.static(clientDistRoot));

function normalizeHomepage(input) {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withScheme);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!isPublicDomain(host)) {
    throw new Error("Enter a public domain, such as example.com.");
  }
  return host;
}

function isPublicDomain(host) {
  if (!host || !host.includes(".") || host.length > 253) {
    return false;
  }

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }

  if (isIP(host)) {
    return false;
  }

  const labels = host.split(".");
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function normalizeNotifyEmail(input) {
  const value = String(input ?? "").trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("Enter a valid email address for notifications.");
  }

  return value;
}

function activeReportJobs() {
  return [...reportJobs.values()].filter((job) => job.status === "queued" || job.status === "running");
}

function terminalReportStatus(job) {
  return job.status === "complete" || job.status === "incomplete" || job.status === "failed" || job.status === "canceled";
}

function canceledReportJob(job) {
  return job.status === "canceled";
}

function maxActiveJobCount() {
  return Number.isFinite(maxActiveJobs) ? Math.max(maxActiveJobs, 1) : 3;
}

function createRateLimitCount() {
  return Number.isFinite(createRateLimit) ? Math.max(Math.floor(createRateLimit), 0) : 12;
}

function createRateLimitWindowMs() {
  return Number.isFinite(createRateWindowMs) ? Math.max(Math.floor(createRateWindowMs), 1000) : 15 * 60 * 1000;
}

function clientRateKey(request) {
  return request.ip ?? request.socket?.remoteAddress ?? "unknown";
}

function checkCreateRateLimit(request) {
  const maxCreates = createRateLimitCount();
  if (maxCreates === 0) {
    return null;
  }

  const now = Date.now();
  const windowMs = createRateLimitWindowMs();
  const key = clientRateKey(request);
  const bucket = createRateBuckets.get(key);
  const activeBucket = !bucket || bucket.resetAt <= now ? { count: 0, resetAt: now + windowMs } : bucket;

  if (activeBucket.count >= maxCreates) {
    createRateBuckets.set(key, activeBucket);
    return activeBucket.resetAt - now;
  }

  activeBucket.count += 1;
  createRateBuckets.set(key, activeBucket);

  for (const [bucketKey, value] of createRateBuckets) {
    if (value.resetAt <= now) {
      createRateBuckets.delete(bucketKey);
    }
  }

  return null;
}

function sendCreateRateLimitResponse(response, retryAfterMs) {
  response.setHeader("retry-after", String(Math.ceil(retryAfterMs / 1000)));
  response.status(429).json({
    error: "Too many report jobs created from this browser. Try again shortly.",
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
  });
}

export function inlineRunnerEnabled() {
  return process.env.RETROSITE_DISABLE_RUNNER !== "1" && process.env.RETROSITE_RUNNER_MODE !== "external";
}

function queuedReportJobs() {
  return activeReportJobs().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

function queueSummary() {
  return {
    activeJobCount: activeReportJobs().length,
    maxActiveJobs: maxActiveJobCount()
  };
}

function queueMetadata(job) {
  const jobs = queuedReportJobs();
  const activeIndex = jobs.findIndex((queuedJob) => queuedJob.id === job.id);

  return {
    ...queueSummary(),
    queuePosition: activeIndex >= 0 ? activeIndex + 1 : null,
    isActiveJob: activeIndex >= 0
  };
}

function createQueuedReportJob({ host, screenshotLimit, notifyEmail, message = "Report job created." }) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    target: host,
    host,
    screenshotLimit,
    status: "queued",
    stage: "queued",
    progress: 0,
    message,
    createdAt: now,
    updatedAt: now,
    events: [
      {
        at: now,
        stage: "queued",
        message
      }
    ],
    discovery: null,
    report: null,
    error: null,
    notifyEmail,
    notificationStatus: notifyEmail ? "captured" : "not_requested"
  };
}

function waybackReplayUrl(timestamp, original) {
  return `https://web.archive.org/web/${timestamp}if_/${original}`;
}

function timestampDate(timestamp) {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(limit, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await task(items[currentIndex], currentIndex);
      }
    })
  );

  return results;
}

function reportOutputDir(jobId) {
  return path.join(generatedRoot, "reports", jobId);
}

function reportJobFile(jobId) {
  return path.join(reportOutputDir(jobId), "job.json");
}

function normalizeScreenshotLimit(value) {
  const numericValue = Number(value);
  const fallback = Number.isFinite(defaultScreenshotLimit) ? defaultScreenshotLimit : 5;
  const requested = Number.isFinite(numericValue) ? Math.round(numericValue) : fallback;
  return Math.min(Math.max(requested, 1), Math.max(maxScreenshotLimit, 1));
}

function chromeExecutablePath() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  if (process.platform === "win32") {
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }

  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }

  return "/usr/bin/google-chrome";
}

function screenshotFilename(entry, index) {
  const date = entry.date.replaceAll("-", "");
  return `${String(index + 1).padStart(2, "0")}-${date}-${entry.original
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)}.png`;
}

async function analyzeScreenshot(filePath) {
  const [fileStats, buffer] = await Promise.all([stat(filePath), readFile(filePath)]);
  const isPng = buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG";
  const width = isPng ? buffer.readUInt32BE(16) : 0;
  const height = isPng ? buffer.readUInt32BE(20) : 0;
  return {
    bytes: fileStats.size,
    width,
    height
  };
}

function classifyRender({ screenshot, diagnostics }) {
  const reasons = [];
  if (screenshot.bytes < 50000) {
    reasons.push("small screenshot file");
  }
  if (screenshot.width < 800 || screenshot.height < 600) {
    reasons.push("small screenshot dimensions");
  }
  if (diagnostics.bodyTextLength < 80) {
    reasons.push("very little page text");
  }
  if (diagnostics.imageCount === 0 && diagnostics.backgroundImageCount === 0 && diagnostics.linkCount < 4) {
    reasons.push("few visual/content elements");
  }
  if (diagnostics.hasWaybackErrorText) {
    reasons.push("Wayback error text detected");
  }
  if (diagnostics.hasTextOnlySignal) {
    reasons.push("possible text-only fallback");
  }
  if (diagnostics.bodyHeight < 220) {
    reasons.push("short rendered document");
  }

  return {
    ...screenshot,
    diagnostics,
    classification: reasons.length > 0 ? "weak" : "usable",
    reasons
  };
}

async function collectRenderDiagnostics(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    const body = document.body;
    const documentElement = document.documentElement;
    const elements = Array.from(document.querySelectorAll("*"));
    const backgroundImageCount = elements.filter((element) => {
      const backgroundImage = window.getComputedStyle(element).backgroundImage;
      return Boolean(backgroundImage && backgroundImage !== "none");
    }).length;
    const hasWaybackErrorText = /wayback machine doesn't have|not archived|cannot be displayed|hmm\.|page cannot be found/i.test(
      text
    );
    const hasTextOnlySignal =
      document.querySelectorAll("link[rel~='stylesheet'], style").length === 0 &&
      document.querySelectorAll("img").length === 0 &&
      text.length > 300;

    return {
      title: document.title,
      finalUrl: window.location.href,
      bodyTextLength: text.trim().length,
      linkCount: document.querySelectorAll("a").length,
      imageCount: document.querySelectorAll("img").length,
      stylesheetCount: document.querySelectorAll("link[rel~='stylesheet'], style").length,
      scriptCount: document.querySelectorAll("script").length,
      backgroundImageCount,
      bodyHeight: Math.max(body?.scrollHeight ?? 0, documentElement?.scrollHeight ?? 0),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      hasWaybackErrorText,
      hasTextOnlySignal
    };
  });
}

async function queryCdxOnce(urlPattern) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cdxTimeoutMs);
  const params = new URLSearchParams({
    url: urlPattern,
    matchType: "exact",
    output: "json",
    fl: "timestamp,original,statuscode,mimetype,digest",
    filter: "statuscode:200",
    collapse: "digest"
  });
  try {
    const response = await fetch(`https://web.archive.org/cdx?${params.toString()}`, {
      headers: { "user-agent": "Retrosite discovery prototype" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Wayback CDX returned ${response.status}`);
    }

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length < 2) {
      return [];
    }

    const [header, ...captures] = rows;
    return captures.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Wayback CDX timed out for ${urlPattern}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function queryCdx(urlPattern) {
  let lastError = null;
  for (let attempt = 1; attempt <= cdxRetryCount + 1; attempt += 1) {
    try {
      const captures = await queryCdxOnce(urlPattern);
      return {
        variant: urlPattern,
        status: "ok",
        attempts: attempt,
        captureCount: captures.length,
        captures,
        error: null
      };
    } catch (error) {
      lastError = error;
      if (attempt <= cdxRetryCount) {
        await delay(cdxRetryDelayMs * attempt);
      }
    }
  }

  return {
    variant: urlPattern,
    status: "failed",
    attempts: cdxRetryCount + 1,
    captureCount: 0,
    captures: [],
    error: lastError instanceof Error ? lastError.message : `Unable to query ${urlPattern}`
  };
}

function summarizeCaptures(captures) {
  const byYear = new Map();
  for (const capture of captures) {
    const year = capture.timestamp.slice(0, 4);
    const existing = byYear.get(year);
    if (!existing) {
      byYear.set(year, {
        year,
        count: 0,
        firstTimestamp: capture.timestamp,
        lastTimestamp: capture.timestamp,
        sampleOriginal: capture.original,
        sampleDigest: capture.digest
      });
    }
    const bucket = byYear.get(year);
    bucket.count += 1;
    bucket.lastTimestamp = capture.timestamp;
  }

  return [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year));
}

function pickCandidateEras(captures) {
  const candidates = [];
  let previousYear = "";
  for (const capture of captures) {
    const year = capture.timestamp.slice(0, 4);
    if (year !== previousYear) {
      candidates.push({
        timestamp: capture.timestamp,
        date: timestampDate(capture.timestamp),
        original: capture.original,
        replayUrl: waybackReplayUrl(capture.timestamp, capture.original),
        reason: "First unique homepage capture found for this year"
      });
      previousYear = year;
    }
  }
  return candidates;
}

async function discoverCaptures(target) {
  const host = normalizeHomepage(target);
  const variants = [
    `http://${host}/`,
    `https://${host}/`,
    `http://www.${host}/`,
    `https://www.${host}/`,
    `${host}/`,
    `www.${host}/`
  ];

  const variantResults = await mapWithConcurrency(variants, cdxConcurrency, queryCdx);
  const successes = variantResults.filter((result) => result.status === "ok");
  const failures = variantResults.filter((result) => result.status === "failed");

  if (successes.length === 0) {
    const failureSummary = failures
      .slice(0, 3)
      .map((failure) => `${failure.variant}: ${failure.error}`)
      .join("; ");
    throw new Error(failureSummary || "Unable to query Wayback CDX.");
  }

  const captureMap = new Map();
  for (const capture of successes.flatMap((result) => result.captures)) {
    captureMap.set(`${capture.timestamp}:${capture.original}`, capture);
  }

  const captures = [...captureMap.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return {
    host,
    queriedVariants: variants,
    variantStatus: variantResults.map(({ captures: _captures, ...result }) => result),
    warning:
      failures.length > 0
        ? `${failures.length} Wayback variant ${failures.length === 1 ? "query" : "queries"} failed, but Retrosite continued with the captures it could retrieve.`
        : null,
    captureCount: captures.length,
    yearSummary: summarizeCaptures(captures),
    candidates: pickCandidateEras(captures),
    captures: captures.map((capture) => ({
      ...capture,
      date: timestampDate(capture.timestamp),
      replayUrl: waybackReplayUrl(capture.timestamp, capture.original)
    }))
  };
}

function createDraftReport(discovery) {
  const firstYear = discovery.yearSummary[0]?.year ?? "";
  const lastYear = discovery.yearSummary.at(-1)?.year ?? "";
  const range = firstYear && lastYear ? `${firstYear}-${lastYear}` : "Unknown";

  return {
    title: `${discovery.host} visual timeline draft`,
    summary:
      "This draft is generated from Wayback Machine capture discovery. Screenshot rendering, visual era grouping, and tech-stack annotation are the next pipeline steps.",
    stats: {
      captureCount: discovery.captureCount,
      candidateCount: discovery.candidates.length,
      yearCount: discovery.yearSummary.length,
      range
    },
    entries: discovery.candidates.map((candidate) => ({
      timestamp: candidate.timestamp,
      date: candidate.date,
      title: "Candidate homepage capture",
      notes: candidate.reason,
      techStack: "Needs render review",
      source: candidate.replayUrl,
      original: candidate.original,
      screenshotStatus: "pending",
      screenshotUrl: null,
      screenshotError: null,
      screenshotQuality: null,
      replacementOf: null,
      replacementAttempts: []
    }))
  };
}

function entryKey(entry) {
  return `${entry.timestamp}:${entry.original}`;
}

function curatedEntryCopy(entry) {
  return {
    ...entry,
    title: `${entry.date.slice(0, 4)} candidate homepage`,
    notes:
      entry.screenshotQuality?.classification === "weak"
        ? `Rendered, but flagged for review: ${entry.screenshotQuality.reasons.join(", ")}.`
        : entry.replacementOf
          ? `Replacement capture selected after the first ${entry.date.slice(0, 4)} render looked weak.`
          : "Rendered candidate selected for the generated draft report."
  };
}

function curateDraftReport(job) {
  const renderedEntries = job.report.entries.filter((entry) => entry.screenshotStatus === "rendered");
  const usableEntries = renderedEntries.filter((entry) => entry.screenshotQuality?.classification === "usable");
  const selectedEntries = usableEntries.length > 0 ? usableEntries : renderedEntries;

  job.report.curatedEntries = selectedEntries.map(curatedEntryCopy);
  job.report.generatedReportUrl = `/reports/generated/${job.id}`;
  job.report.generatedShareUrl = `/reports/generated/${job.id}/share`;
  job.report.publicationStatus = job.report.publicationStatus ?? "draft";
  job.report.publishedAt = job.report.publishedAt ?? null;
  job.report.stats.renderedCount = renderedEntries.length;
  job.report.stats.selectedCount = job.report.curatedEntries.length;
}

function captureToReportEntry(capture, reason, replacementOf = null) {
  return {
    timestamp: capture.timestamp,
    date: capture.date,
    title: "Candidate homepage capture",
    notes: reason,
    techStack: "Needs render review",
    source: capture.replayUrl,
    original: capture.original,
    screenshotStatus: "pending",
    screenshotUrl: null,
    screenshotError: null,
    screenshotQuality: null,
    replacementOf,
    replacementAttempts: []
  };
}

function spreadSample(items, limit) {
  if (items.length <= limit) {
    return items;
  }

  if (limit <= 1) {
    return items.slice(0, 1);
  }

  const selected = [];
  const selectedIndexes = new Set();
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = index === limit - 1 ? items.length - 1 : Math.floor((index * (items.length - 1)) / (limit - 1));
    if (!selectedIndexes.has(sourceIndex)) {
      selectedIndexes.add(sourceIndex);
      selected.push(items[sourceIndex]);
    }
  }

  return selected;
}

export function selectSameYearAlternatives(captures, entry, limit = replacementLimit) {
  const year = entry.date.slice(0, 4);
  return spreadSample(
    captures
    .filter((capture) => capture.date.slice(0, 4) === year && capture.timestamp !== entry.timestamp)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    limit
  );
}

function sameYearAlternatives(job, entry) {
  return selectSameYearAlternatives(job.discovery.captures, entry, replacementLimit);
}

function minimumUsableScreenshotCount(job) {
  const possibleCount = Math.min(
    normalizeScreenshotLimit(job.screenshotLimit),
    job.report?.stats?.candidateCount ?? job.report?.entries?.length ?? 0
  );

  if (possibleCount <= 2) {
    return possibleCount;
  }

  return Math.min(6, Math.max(3, Math.ceil(possibleCount * 0.4)));
}

export function reportCompletionPatch(job) {
  const selectedCount = job.report?.stats?.selectedCount ?? job.report?.curatedEntries?.length ?? 0;
  const candidateCount = job.report?.stats?.candidateCount ?? job.report?.entries?.length ?? selectedCount;
  const minimumUsableCount = minimumUsableScreenshotCount(job);

  if (selectedCount < minimumUsableCount) {
    return {
      status: "incomplete",
      stage: "incomplete",
      progress: 100,
      message: `Draft needs more usable screenshots before it is ready. Retrosite selected ${selectedCount} of ${candidateCount} candidate eras.`
    };
  }

  return {
    status: "complete",
    stage: "complete",
    progress: 100,
    message: "Draft report is ready for curation."
  };
}

export function normalizeReportReadiness(job) {
  if (job.status !== "complete" || !job.report) {
    return false;
  }

  const patch = reportCompletionPatch(job);
  if (patch.status === "complete") {
    return false;
  }

  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  job.events = job.events ?? [];
  job.events.push({
    at: job.updatedAt,
    stage: job.stage,
    message: job.message
  });
  return true;
}

async function renderEntryScreenshot({ context, job, entry, screenshotDir, index, attemptLabel }) {
  const page = await context.newPage();
  const filename = screenshotFilename(entry, index);
  const filePath = path.join(screenshotDir, filename);
  const screenshotUrl = `/generated/reports/${job.id}/screenshots/${filename}`;

  try {
    await page.goto(entry.source, {
      waitUntil: "domcontentloaded",
      timeout: 25000
    });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    const diagnostics = await collectRenderDiagnostics(page);
    await page.screenshot({ path: filePath, fullPage: true, timeout: 15000 });
    const screenshot = await analyzeScreenshot(filePath);

    const techStackResult = await inferTechStack(page).catch(() => null);

    entry.screenshotStatus = "rendered";
    entry.screenshotUrl = screenshotUrl;
    entry.screenshotError = null;
    entry.screenshotQuality = classifyRender({ screenshot, diagnostics });
    entry.renderAttempt = attemptLabel;
    if (techStackResult) {
      entry.techStack = techStackResult.techStack;
      entry.techStackConfidence = techStackResult.techStackConfidence;
    }
  } catch (error) {
    entry.screenshotStatus = "failed";
    entry.screenshotError = error instanceof Error ? error.message : "Unable to render screenshot.";
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function renderReportScreenshots(job) {
  const executablePath = chromeExecutablePath();
  const screenshotDir = path.join(reportOutputDir(job.id), "screenshots");
  await mkdir(screenshotDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--disable-gpu", "--no-sandbox"]
  });

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 1100 }
    });

    const jobScreenshotLimit = normalizeScreenshotLimit(job.screenshotLimit);
    const entriesToRender = job.report.entries.slice(0, jobScreenshotLimit);
    for (const [index, entry] of entriesToRender.entries()) {
      if (canceledReportJob(job)) {
        return;
      }

      updateJob(job, {
        stage: "rendering",
        progress: Math.round(62 + (index / entriesToRender.length) * 24),
        message: `Rendering screenshot ${index + 1} of ${entriesToRender.length}: ${entry.date}.`
      });

      await renderEntryScreenshot({
        context,
        job,
        entry,
        screenshotDir,
        index,
        attemptLabel: "initial"
      });

      if (canceledReportJob(job)) {
        return;
      }

      if (entry.screenshotStatus === "failed" || entry.screenshotQuality?.classification === "weak") {
        const alternatives = sameYearAlternatives(job, entry);
        for (const [replacementIndex, capture] of alternatives.entries()) {
          if (canceledReportJob(job)) {
            return;
          }

          const replacement = captureToReportEntry(
            capture,
            `Replacement candidate for weak ${entry.date.slice(0, 4)} render.`,
            entry.timestamp
          );
          entry.replacementAttempts.push({
            timestamp: replacement.timestamp,
            date: replacement.date,
            original: replacement.original
          });

          updateJob(job, {
            stage: "repairing",
            progress: Math.round(86 + (index / entriesToRender.length) * 6),
            message: `Trying replacement ${replacementIndex + 1} for ${entry.date.slice(0, 4)}.`
          });

          await renderEntryScreenshot({
            context,
            job,
            entry: replacement,
            screenshotDir,
            index: index * 10 + replacementIndex + 1,
            attemptLabel: "replacement"
          });

          if (canceledReportJob(job)) {
            return;
          }

          if (replacement.screenshotStatus === "rendered") {
            job.report.entries.push(replacement);
          }
          if (replacement.screenshotQuality?.classification === "usable") {
            break;
          }
        }
      }
    }

    for (const entry of job.report.entries.slice(jobScreenshotLimit)) {
      entry.screenshotStatus = "queued";
    }
  } finally {
    await browser.close();
  }
}

function updateJob(job, patch) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  if (patch.message) {
    job.events.push({
      at: job.updatedAt,
      stage: job.stage,
      message: patch.message
    });
  }
  if ((job.status === "complete" || job.status === "failed") && job.notifyEmail && job.notificationStatus !== "queued") {
    job.notificationStatus = "queued";
    job.events.push({
      at: job.updatedAt,
      stage: job.stage,
      message: `Notification queued for ${job.notifyEmail}.`
    });
    queueNotificationOutbox(job);
  }
  queuePersistJob(job);
}

function queueNotificationOutbox(job) {
  writeNotificationOutbox(job, {
    appOrigin: process.env.RETROSITE_APP_ORIGIN ?? `http://127.0.0.1:${port}`,
    outboxRoot: notificationOutboxRoot
  }).catch((error) => {
    job.notificationStatus = "failed";
    job.events.push({
      at: new Date().toISOString(),
      stage: job.stage,
      message: `Notification outbox write failed: ${error instanceof Error ? error.message : "Unknown error"}.`
    });
    queuePersistJob(job);
  });
}

function publicJob(job) {
  normalizeReportReadiness(job);
  return {
    id: job.id,
    target: job.target,
    host: job.host,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    screenshotLimit: normalizeScreenshotLimit(job.screenshotLimit),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    events: job.events,
    discovery: job.discovery,
    report: job.report,
    error: job.error,
    notifyEmail: job.notifyEmail ?? null,
    notificationStatus: job.notificationStatus ?? (job.notifyEmail ? "captured" : "not_requested"),
    ...queueMetadata(job)
  };
}

function publicJobSummary(job) {
  normalizeReportReadiness(job);
  const renderedEntry = job.report?.curatedEntries?.find((entry) => entry.screenshotUrl)
    ?? job.report?.entries?.find((entry) => entry.screenshotUrl);

  return {
    id: job.id,
    target: job.target,
    host: job.host,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    screenshotLimit: normalizeScreenshotLimit(job.screenshotLimit),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    generatedReportUrl: job.report?.generatedReportUrl ?? `/reports/generated/${job.id}`,
    generatedShareUrl: job.report?.generatedShareUrl ?? `${job.report?.generatedReportUrl ?? `/reports/generated/${job.id}`}/share`,
    stats: job.report?.stats ?? null,
    error: job.error,
    thumbnailUrl: renderedEntry?.screenshotUrl ?? null,
    notifyEmail: job.notifyEmail ?? null,
    notificationStatus: job.notificationStatus ?? (job.notifyEmail ? "captured" : "not_requested"),
    ...queueMetadata(job)
  };
}

function markdownEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanEditableText(value, fallback, maxLength) {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return fallback;
  }

  return cleaned.slice(0, maxLength);
}

function absoluteLocalUrl(request, pathname) {
  if (!pathname) {
    return "";
  }
  return `${request.protocol}://${request.get("host")}${pathname}`;
}

function buildReportMarkdown(job, request) {
  const report = job.report;
  const entries = report?.curatedEntries ?? [];
  if (!report || entries.length === 0) {
    return "";
  }

  const lines = [
    `# ${report.title}`,
    "",
    report.summary,
    "",
    `- Domain: ${job.host}`,
    `- Captures found: ${report.stats.captureCount}`,
    `- Candidate eras: ${report.stats.candidateCount}`,
    `- Screenshots rendered: ${report.stats.renderedCount ?? 0}`,
    `- Selected entries: ${report.stats.selectedCount ?? entries.length}`,
    `- Archive range: ${report.stats.range}`,
    `- Status: ${report.publicationStatus ?? "draft"}`,
    ...(report.publishedAt ? [`- Published: ${report.publishedAt}`] : []),
    `- Generated: ${job.updatedAt}`,
    ""
  ];

  if (job.discovery?.warning) {
    lines.push(`> ${job.discovery.warning}`, "");
  }

  lines.push("| Date | Title | Tech stack | Screenshot | Source | Notes |", "|---|---|---|---|---|---|");
  for (const entry of entries) {
    const screenshotUrl = absoluteLocalUrl(request, entry.screenshotUrl);
    const screenshotLink = screenshotUrl ? `[Screenshot](${screenshotUrl})` : "";
    const caveats = [];
    if (entry.screenshotQuality?.reasons?.length) {
      caveats.push(`Flagged: ${entry.screenshotQuality.reasons.join(", ")}.`);
    }
    if (entry.replacementOf) {
      caveats.push(`Replacement capture for ${entry.replacementOf}.`);
    }
    if (entry.replacementAttempts?.length) {
      caveats.push(
        `${entry.replacementAttempts.length} same-year replacement attempt${entry.replacementAttempts.length === 1 ? "" : "s"} checked.`
      );
    }
    if (entry.screenshotError) {
      caveats.push(`Render error: ${entry.screenshotError}`);
    }
    const qualityNote = caveats.length > 0 ? ` ${caveats.join(" ")}` : "";
    lines.push(
      `| ${markdownEscape(entry.date)} | ${markdownEscape(entry.title)} | ${markdownEscape(entry.techStack)} | ${screenshotLink} | [Wayback](${entry.source}) | ${markdownEscape(`${entry.notes}${qualityNote}`)} |`
    );
  }

  lines.push("", "## Wayback Query Status", "");
  for (const variant of job.discovery?.variantStatus ?? []) {
    lines.push(
      `- ${variant.variant}: ${variant.status}${
        variant.status === "ok" ? `, ${variant.captureCount} captures` : `, ${variant.error}`
      } after ${variant.attempts} ${variant.attempts === 1 ? "attempt" : "attempts"}`
    );
  }

  return `${lines.join("\n")}\n`;
}

function buildReportHtml(job, request) {
  const report = job.report;
  const entries = report?.curatedEntries ?? [];
  if (!report || entries.length === 0) {
    return "";
  }

  const stats = [
    ["Selected screenshots", entries.length],
    ["Archive range", report.stats.range],
    ["Captures found", report.stats.captureCount],
    ["Screenshots rendered", report.stats.renderedCount ?? 0]
  ];

  const entriesHtml = entries
    .map((entry) => {
      const screenshotUrl = absoluteLocalUrl(request, entry.screenshotUrl);
      const caveats = [];
      if (entry.screenshotQuality?.reasons?.length) {
        caveats.push(`Flagged: ${entry.screenshotQuality.reasons.join(", ")}.`);
      }
      if (entry.replacementOf) {
        caveats.push(`Replacement capture for ${entry.replacementOf}.`);
      }
      if (entry.replacementAttempts?.length) {
        caveats.push(
          `${entry.replacementAttempts.length} same-year replacement attempt${entry.replacementAttempts.length === 1 ? "" : "s"} checked.`
        );
      }
      if (entry.screenshotError) {
        caveats.push(`Render error: ${entry.screenshotError}`);
      }

      return `
        <article class="entry">
          <div class="entry-copy">
            <span class="date">${htmlEscape(entry.date)}</span>
            <h2>${htmlEscape(entry.title)}</h2>
            <dl>
              <div>
                <dt>Tech stack</dt>
                <dd>${htmlEscape(entry.techStack)}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd><a href="${htmlEscape(entry.source)}">Wayback capture</a></dd>
              </div>
            </dl>
            <p>${htmlEscape(entry.notes)}</p>
            ${
              caveats.length > 0
                ? `<div class="caveats"><strong>Review notes</strong><ul>${caveats.map((caveat) => `<li>${htmlEscape(caveat)}</li>`).join("")}</ul></div>`
                : `<div class="caveats usable"><strong>Review notes</strong><p>No render caveats recorded.</p></div>`
            }
          </div>
          ${screenshotUrl ? `<img src="${htmlEscape(screenshotUrl)}" alt="${htmlEscape(`${entry.date} ${entry.title}`)}">` : ""}
        </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(report.title)}</title>
  <style>
    :root { color-scheme: light; --ink: #19140f; --muted: #6e6459; --paper: #f7f0e2; --panel: #fff9ee; --line: #211a1226; --red: #c83b31; --blue: #315fcb; --signal: #b4ff2f; }
    * { box-sizing: border-box; }
    body { margin: 0; background: linear-gradient(90deg, #19140f0d 1px, transparent 1px) 0 0 / 28px 28px, var(--paper); color: var(--ink); font-family: Aptos, Segoe UI, sans-serif; }
    main { padding: clamp(2rem, 5vw, 5rem); }
    header { max-width: 1120px; margin-bottom: 3rem; }
    .eyebrow, dt, .date { color: var(--red); font-size: .78rem; font-weight: 900; text-transform: uppercase; }
    h1, h2 { font-family: Georgia, Times New Roman, serif; letter-spacing: 0; }
    h1 { margin: .6rem 0 1rem; font-size: clamp(3rem, 8vw, 7rem); line-height: .88; }
    header p { max-width: 820px; color: #33281d; font-size: 1.2rem; line-height: 1.5; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--ink); background: var(--ink); color: var(--paper); margin-top: 1.5rem; }
    .stats div { padding: 1rem; border-right: 1px solid #f7f0e23b; }
    .stats div:last-child { border-right: 0; }
    .stats strong { display: block; font-family: Georgia, Times New Roman, serif; font-size: clamp(1.8rem, 4vw, 3.4rem); line-height: 1; }
    .stats span { color: #efe1c5cc; font-weight: 800; }
    .entry { display: grid; grid-template-columns: minmax(280px, .36fr) minmax(0, 1fr); margin-bottom: 2rem; border: 1px solid var(--ink); background: var(--panel); box-shadow: 10px 10px 0 var(--ink); overflow: hidden; break-inside: avoid; }
    .entry-copy { padding: clamp(1.2rem, 3vw, 2rem); }
    h2 { margin: .55rem 0 1rem; font-size: clamp(2rem, 4vw, 4rem); line-height: .95; }
    dl { display: grid; gap: .75rem; margin: 0 0 1rem; }
    dd { margin: .2rem 0 0; font-weight: 800; line-height: 1.35; }
    p, li { color: var(--muted); line-height: 1.5; }
    a { color: var(--ink); font-weight: 900; }
    img { display: block; width: 100%; height: 34rem; object-fit: cover; object-position: top center; background: var(--ink); }
    .caveats { margin-top: 1rem; padding: .85rem; border: 1px solid #c83b3166; background: #c83b3112; }
    .caveats.usable { border-color: #7aa82566; background: #b4ff2f14; }
    .caveats strong { color: var(--red); font-size: .78rem; text-transform: uppercase; }
    .caveats.usable strong { color: var(--ink); }
    .caveats ul { margin: .45rem 0 0; padding-left: 1.2rem; }
    .meta { margin-top: 1rem; color: var(--muted); font-size: .9rem; font-weight: 800; }
    @media (max-width: 900px) { .stats, .entry { grid-template-columns: 1fr; } .stats div { border-right: 0; border-bottom: 1px solid #f7f0e23b; } img { height: 26rem; } }
    @media print { body { background: white; } main { padding: 1rem; } .entry { box-shadow: none; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="eyebrow">${htmlEscape(report.publicationStatus ?? "draft")} visual timeline</div>
      <h1>${htmlEscape(report.title)}</h1>
      <p>${htmlEscape(report.summary)}</p>
      <section class="stats" aria-label="Report metrics">
        ${stats.map(([label, value]) => `<div><strong>${htmlEscape(value)}</strong><span>${htmlEscape(label)}</span></div>`).join("")}
      </section>
      <div class="meta">Generated ${htmlEscape(job.updatedAt)} for ${htmlEscape(job.host)}${report.publishedAt ? ` - Published ${htmlEscape(report.publishedAt)}` : ""}</div>
    </header>
    ${entriesHtml}
  </main>
</body>
</html>`;
}

function queuePersistJob(job) {
  const snapshot = JSON.stringify(publicJob(job), null, 2);
  const outputDir = reportOutputDir(job.id);
  const outputFile = reportJobFile(job.id);
  const previous = persistQueues.get(job.id) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(outputDir, { recursive: true });
      await writeFile(outputFile, snapshot, "utf8");
    })
    .catch((error) => {
      console.error(`Unable to persist report job ${job.id}:`, error);
    })
    .finally(() => {
      if (persistQueues.get(job.id) === next) {
        persistQueues.delete(job.id);
      }
    });
  persistQueues.set(job.id, next);
}

function markJobForResume(job) {
  job.status = "queued";
  job.stage = "queued";
  job.progress = Math.min(job.progress ?? 0, 10);
  job.error = null;
  job.message = "Report job restored and queued to resume.";
  job.updatedAt = new Date().toISOString();
  job.events = [
    ...(job.events ?? []),
    {
      at: job.updatedAt,
      stage: job.stage,
      message: job.message
    }
  ];
}

function enqueueReportJob(job, { force = false } = {}) {
  if (runningJobIds.has(job.id) || terminalReportStatus(job) || (!force && !inlineRunnerEnabled())) {
    return;
  }

  runningJobIds.add(job.id);
  reportRunQueue = reportRunQueue
    .catch(() => undefined)
    .then(async () => {
      await runReportJob(job);
    })
    .finally(() => {
      runningJobIds.delete(job.id);
    });
}

async function restorePersistedJobs({ prepareResume = true } = {}) {
  const reportsRoot = path.join(generatedRoot, "reports");
  const resumableJobs = [];
  let reportDirs = [];
  try {
    reportDirs = await readdir(reportsRoot, { withFileTypes: true });
  } catch {
    return resumableJobs;
  }

  await Promise.all(
    reportDirs
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const job = JSON.parse(await readFile(path.join(reportsRoot, entry.name, "job.json"), "utf8"));
          if (!job?.id) {
            return;
          }

          if (runningJobIds.has(job.id)) {
            return;
          }

          if (prepareResume && (job.status === "queued" || job.status === "running")) {
            markJobForResume(job);
            resumableJobs.push(job);
          }

          reportJobs.set(job.id, job);
        } catch {
          // Ignore generated folders that do not contain a readable report job.
        }
      })
  );

  return resumableJobs;
}

async function refreshPersistedJobsForExternalRunner() {
  if (inlineRunnerEnabled()) {
    return;
  }

  await restorePersistedJobs({ prepareResume: false });
}

function enqueueActiveReportJobs({ force = false } = {}) {
  const activeJobs = activeReportJobs();
  for (const job of activeJobs) {
    queuePersistJob(job);
    enqueueReportJob(job, { force });
  }
  return activeJobs.length;
}

async function waitForReportQueues() {
  await reportRunQueue;
  await Promise.all([...persistQueues.values()]);
}

export async function runWorker({ once = false, pollMs = Number(process.env.RETROSITE_WORKER_POLL_MS ?? 5000) } = {}) {
  const intervalMs = Number.isFinite(pollMs) ? Math.max(pollMs, 1000) : 5000;
  let polling = false;

  async function pollForJobs() {
    if (polling) {
      return 0;
    }

    polling = true;
    try {
      await restorePersistedJobs();
      return enqueueActiveReportJobs({ force: true });
    } finally {
      polling = false;
    }
  }

  const activeCount = await pollForJobs();
  await waitForReportQueues();

  if (once) {
    return activeCount;
  }

  console.log(`Retrosite worker watching ${generatedRoot} every ${intervalMs}ms`);
  setInterval(() => {
    pollForJobs().catch((error) => {
      console.error("Retrosite worker poll failed:", error);
    });
  }, intervalMs);
  return activeCount;
}

async function runReportJob(job) {
  try {
    if (canceledReportJob(job)) {
      return;
    }
    updateJob(job, {
      status: "running",
      stage: "queued",
      progress: 5,
      message: "Report job queued."
    });

    await delay(250);
    if (canceledReportJob(job)) {
      return;
    }
    updateJob(job, {
      stage: "discovering",
      progress: 25,
      message: "Querying Wayback Machine homepage captures."
    });

    const discovery = await discoverCaptures(job.target);
    if (canceledReportJob(job)) {
      return;
    }
    if (discovery.captureCount === 0) {
      throw new Error("No homepage captures were found for this domain.");
    }

    updateJob(job, {
      host: discovery.host,
      discovery,
      stage: "selecting",
      progress: 60,
      message: discovery.warning
        ? `Found ${discovery.captureCount} captures across ${discovery.yearSummary.length} years. ${discovery.warning}`
        : `Found ${discovery.captureCount} captures across ${discovery.yearSummary.length} years.`
    });

    await delay(250);
    if (canceledReportJob(job)) {
      return;
    }
    updateJob(job, {
      stage: "drafting",
      progress: 82,
      message: "Selecting candidate timeline entries for the draft report."
    });

    const report = createDraftReport(discovery);
    if (canceledReportJob(job)) {
      return;
    }
    updateJob(job, {
      report,
      stage: "rendering",
      progress: 62,
      message: `Rendering the first ${Math.min(normalizeScreenshotLimit(job.screenshotLimit), report.entries.length)} candidate screenshots.`
    });

    await renderReportScreenshots(job);
    if (canceledReportJob(job)) {
      return;
    }

    updateJob(job, {
      stage: "curating",
      progress: 94,
      message: "Selecting usable rendered screenshots for the generated draft report."
    });
    curateDraftReport(job);
    if (canceledReportJob(job)) {
      return;
    }

    updateJob(job, reportCompletionPatch(job));
  } catch (error) {
    if (canceledReportJob(job)) {
      return;
    }
    updateJob(job, {
      status: "failed",
      stage: "failed",
      progress: 100,
      error: error instanceof Error ? error.message : "Unexpected report job error.",
      message: "Report job failed."
    });
  }
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, runnerMode: inlineRunnerEnabled() ? "inline" : "external" });
});

app.get("/api/reports", async (request, response) => {
  await refreshPersistedJobsForExternalRunner();
  const requestedLimit = Number(request.query.limit ?? 12);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 12;
  const jobs = [...reportJobs.values()]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit)
    .map(publicJobSummary);

  response.json({ jobs, queue: queueSummary() });
});

app.post("/api/reports", (request, response) => {
  try {
    const target = String(request.body?.url ?? "").trim();
    if (!target) {
      response.status(400).json({ error: "Missing url in request body." });
      return;
    }

    const host = normalizeHomepage(target);
    const activeJobs = activeReportJobs();
    const duplicateActiveJob = activeJobs.find((job) => job.host === host);
    if (duplicateActiveJob) {
      response.status(409).json({
        error: `A report for ${host} is already ${duplicateActiveJob.status}. Open the existing job instead of starting another.`,
        job: publicJobSummary(duplicateActiveJob)
      });
      return;
    }

    if (activeJobs.length >= maxActiveJobCount()) {
      response.status(429).json({
        error: `Retrosite is already running ${activeJobs.length} report jobs. Try again after one finishes.`
      });
      return;
    }

    const retryAfterMs = checkCreateRateLimit(request);
    if (retryAfterMs !== null) {
      sendCreateRateLimitResponse(response, retryAfterMs);
      return;
    }

    const requestedScreenshotLimit = normalizeScreenshotLimit(request.body?.screenshotLimit);
    const notifyEmail = normalizeNotifyEmail(request.body?.notifyEmail);
    const job = createQueuedReportJob({
      host,
      screenshotLimit: requestedScreenshotLimit,
      notifyEmail
    });

    reportJobs.set(job.id, job);
    queuePersistJob(job);
    response.status(202).json(publicJob(job));
    enqueueReportJob(job);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to create report job." });
  }
});

app.get("/api/reports/:id", async (request, response) => {
  await refreshPersistedJobsForExternalRunner();
  const job = reportJobs.get(request.params.id);
  if (!job) {
    response.status(404).json({ error: "Report job not found." });
    return;
  }

  response.json(publicJob(job));
});

app.post("/api/reports/:id/cancel", (request, response) => {
  const job = reportJobs.get(request.params.id);
  if (!job) {
    response.status(404).json({ error: "Report job not found." });
    return;
  }

  if (terminalReportStatus(job)) {
    response.status(409).json({ error: `Report job is already ${job.status}.` });
    return;
  }

  updateJob(job, {
    status: "canceled",
    stage: "canceled",
    progress: 100,
    message: "Report job canceled."
  });

  response.json(publicJob(job));
});

app.post("/api/reports/:id/retry", (request, response) => {
  const sourceJob = reportJobs.get(request.params.id);
  if (!sourceJob) {
    response.status(404).json({ error: "Report job not found." });
    return;
  }

  if (sourceJob.status !== "failed" && sourceJob.status !== "canceled" && sourceJob.status !== "incomplete") {
    response.status(409).json({ error: "Only failed, incomplete, or canceled report jobs can be retried." });
    return;
  }

  const activeJobs = activeReportJobs();
  const duplicateActiveJob = activeJobs.find((job) => job.host === sourceJob.host);
  if (duplicateActiveJob) {
    response.status(409).json({
      error: `A report for ${sourceJob.host} is already ${duplicateActiveJob.status}. Open the existing job instead of starting another.`,
      job: publicJobSummary(duplicateActiveJob)
    });
    return;
  }

  if (activeJobs.length >= maxActiveJobCount()) {
    response.status(429).json({
      error: `Retrosite is already running ${activeJobs.length} report jobs. Try again after one finishes.`
    });
    return;
  }

  const retryAfterMs = checkCreateRateLimit(request);
  if (retryAfterMs !== null) {
    sendCreateRateLimitResponse(response, retryAfterMs);
    return;
  }

  const job = createQueuedReportJob({
    host: sourceJob.host,
    screenshotLimit: normalizeScreenshotLimit(sourceJob.screenshotLimit),
    notifyEmail: sourceJob.notifyEmail ?? null,
    message: `Retry created from ${sourceJob.status} report job ${sourceJob.id}.`
  });

  reportJobs.set(job.id, job);
  queuePersistJob(job);
  response.status(202).json(publicJob(job));
  enqueueReportJob(job);
});

app.patch("/api/reports/:id", (request, response) => {
  const job = reportJobs.get(request.params.id);
  if (!job) {
    response.status(404).json({ error: "Report job not found." });
    return;
  }

  if ((job.status !== "complete" && job.status !== "incomplete") || !job.report) {
    response.status(409).json({ error: "Report is not ready for editing." });
    return;
  }

  const body = request.body ?? {};
  const hasTitleEdit = Object.prototype.hasOwnProperty.call(body, "title");
  const hasSummaryEdit = Object.prototype.hasOwnProperty.call(body, "summary");
  const publish = body.publicationStatus === "published" || body.publish === true;
  const unpublish = body.publicationStatus === "draft";

  if (!hasTitleEdit && !hasSummaryEdit && !publish && !unpublish) {
    response.status(400).json({ error: "Nothing to update for this report." });
    return;
  }

  if (hasTitleEdit) {
    job.report.title = cleanEditableText(body.title, job.report.title, 140);
  }
  if (hasSummaryEdit) {
    job.report.summary = cleanEditableText(body.summary, job.report.summary, 500);
  }

  if (publish) {
    if (job.status !== "complete") {
      response.status(409).json({ error: "Report needs more usable screenshots before publishing." });
      return;
    }
    if (!job.report.curatedEntries?.length) {
      response.status(409).json({ error: "Select at least one entry before publishing." });
      return;
    }
    job.report.publicationStatus = "published";
    job.report.publishedAt = new Date().toISOString();
  } else if (unpublish) {
    job.report.publicationStatus = "draft";
    job.report.publishedAt = null;
  } else {
    job.report.publicationStatus = job.report.publicationStatus ?? "draft";
    job.report.publishedAt = job.report.publishedAt ?? null;
  }

  updateJob(job, {
    message:
      job.report.publicationStatus === "published"
        ? `Published ${job.host} generated report.`
        : `Updated ${job.host} generated report draft.`
  });

  response.json(publicJob(job));
});

app.patch("/api/reports/:id/entries", (request, response) => {
  const job = reportJobs.get(request.params.id);
  if (!job) {
    response.status(404).json({ error: "Report job not found." });
    return;
  }

  if ((job.status !== "complete" && job.status !== "incomplete") || !job.report) {
    response.status(409).json({ error: "Report is not ready for curation." });
    return;
  }

  const body = request.body ?? {};
  const timestamp = String(body.timestamp ?? "");
  const original = String(body.original ?? "");
  const hasIncludedChange = typeof body.included === "boolean";
  const hasTitleEdit = Object.prototype.hasOwnProperty.call(body, "title");
  const hasNotesEdit = Object.prototype.hasOwnProperty.call(body, "notes");
  const hasTechStackEdit = Object.prototype.hasOwnProperty.call(body, "techStack");
  const included = body.included === true;
  const targetKey = `${timestamp}:${original}`;
  const renderedEntry = job.report.entries.find(
    (entry) => entryKey(entry) === targetKey && entry.screenshotStatus === "rendered"
  );

  if (!renderedEntry) {
    response.status(404).json({ error: "Rendered report entry not found." });
    return;
  }

  if (!hasIncludedChange && !hasTitleEdit && !hasNotesEdit && !hasTechStackEdit) {
    response.status(400).json({ error: "Nothing to update for this report entry." });
    return;
  }

  if (hasTitleEdit) {
    renderedEntry.title = cleanEditableText(body.title, renderedEntry.title, 140);
  }
  if (hasNotesEdit) {
    renderedEntry.notes = cleanEditableText(body.notes, renderedEntry.notes, 500);
  }
  if (hasTechStackEdit) {
    renderedEntry.techStack = cleanEditableText(body.techStack, renderedEntry.techStack, 220);
  }

  let curatedEntries = job.report.curatedEntries ?? [];
  if (hasIncludedChange) {
    if (included) {
      if (!curatedEntries.some((entry) => entryKey(entry) === targetKey)) {
        curatedEntries.push(curatedEntryCopy(renderedEntry));
      }
    } else {
      curatedEntries = curatedEntries.filter((entry) => entryKey(entry) !== targetKey);
    }
  }

  const curatedEntry = curatedEntries.find((entry) => entryKey(entry) === targetKey);
  if (curatedEntry) {
    if (hasTitleEdit) {
      curatedEntry.title = renderedEntry.title;
    }
    if (hasNotesEdit) {
      curatedEntry.notes = renderedEntry.notes;
    }
    if (hasTechStackEdit) {
      curatedEntry.techStack = renderedEntry.techStack;
    }
  }

  job.report.curatedEntries = curatedEntries.sort((a, b) => a.date.localeCompare(b.date));
  job.report.stats.selectedCount = job.report.curatedEntries.length;
  updateJob(job, {
    message: hasIncludedChange
      ? included
        ? `Included ${renderedEntry.date} in the generated report.`
        : `Excluded ${renderedEntry.date} from the generated report.`
      : `Updated ${renderedEntry.date} report details.`
  });

  response.json(publicJob(job));
});

app.get("/api/reports/:id/export.md", (request, response) => {
  const job = reportJobs.get(request.params.id);
  if (!job) {
    response.status(404).send("Report job not found.");
    return;
  }

  if (job.status !== "complete" || !job.report?.curatedEntries?.length) {
    response.status(409).send("Report is not ready to export.");
    return;
  }

  const filename = `${job.host.replace(/[^a-z0-9.-]+/gi, "-")}-visual-timeline.md`;
  response.setHeader("content-type", "text/markdown; charset=utf-8");
  response.setHeader("content-disposition", `attachment; filename="${filename}"`);
  response.send(buildReportMarkdown(job, request));
});

app.get("/api/reports/:id/export.html", (request, response) => {
  const job = reportJobs.get(request.params.id);
  if (!job) {
    response.status(404).send("Report job not found.");
    return;
  }

  if (job.status !== "complete" || !job.report?.curatedEntries?.length) {
    response.status(409).send("Report is not ready to export.");
    return;
  }

  const filename = `${job.host.replace(/[^a-z0-9.-]+/gi, "-")}-visual-timeline.html`;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.setHeader("content-disposition", `attachment; filename="${filename}"`);
  response.send(buildReportHtml(job, request));
});

app.get("/api/wayback/discover", async (request, response) => {
  try {
    const target = String(request.query.url ?? "").trim();
    if (!target) {
      response.status(400).json({ error: "Missing url query parameter." });
      return;
    }

    response.json(await discoverCaptures(target));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected discovery error." });
  }
});

app.get(/^(?!\/api\/|\/generated\/).*/, async (request, response) => {
  try {
    await stat(clientIndexFile);
    response.sendFile(clientIndexFile);
  } catch {
    response.redirect(process.env.RETROSITE_WEB_URL ?? "http://127.0.0.1:5173/");
  }
});

export async function startServer() {
  const restoredJobs = await restorePersistedJobs();
  if (inlineRunnerEnabled()) {
    for (const job of restoredJobs) {
      queuePersistJob(job);
      enqueueReportJob(job);
    }
  }

  return app.listen(port, "127.0.0.1", () => {
    const restoredCount = restoredJobs.length > 0 ? ` (${restoredJobs.length} restored job queued)` : "";
    const runnerMode = inlineRunnerEnabled() ? "inline runner" : "external runner";
    console.log(`Retrosite API listening on http://127.0.0.1:${port} with ${runnerMode}${restoredCount}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await startServer();
}
