import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
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
const requestQueueRoot = process.env.RETROSITE_REQUEST_QUEUE_ROOT ?? path.join(generatedRoot, "requests");
const notificationOutboxRoot = process.env.RETROSITE_NOTIFICATION_OUTBOX ?? path.join(generatedRoot, "notifications");
const clientDistRoot = path.join(__dirname, "..", "dist");
const clientIndexFile = path.join(clientDistRoot, "index.html");
const defaultScreenshotLimit = Number(process.env.RETROSITE_SCREENSHOT_LIMIT ?? 35);
const maxScreenshotLimit = Number(process.env.RETROSITE_MAX_SCREENSHOT_LIMIT ?? 50);
const candidateRenderMultiplier = Number(process.env.RETROSITE_CANDIDATE_RENDER_MULTIPLIER ?? 2);
const candidateRenderCap = Number(process.env.RETROSITE_CANDIDATE_RENDER_LIMIT ?? 60);
const perYearCandidateLimit = Number(process.env.RETROSITE_PER_YEAR_CANDIDATE_LIMIT ?? 4);
const replacementLimit = Number(process.env.RETROSITE_REPLACEMENT_LIMIT ?? 3);
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

export function normalizeReportTarget(input) {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withScheme);
  const domain = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!isPublicDomain(domain)) {
    throw new Error("Enter a public domain or path, such as example.com/about.");
  }

  let pathname = url.pathname || "/";
  try {
    pathname = decodeURI(pathname);
  } catch {
    // Keep the browser-normalized pathname if it contains malformed escapes.
  }

  pathname = pathname.replace(/\/{2,}/g, "/");
  if (pathname.length > 1) {
    pathname = pathname.replace(/\/+$/g, "");
  }

  if (!isValidReportPath(pathname)) {
    throw new Error("Enter a public domain or path, such as example.com/about.");
  }

  const target = pathname === "/" ? domain : `${domain}${pathname}`;
  return {
    domain,
    path: pathname,
    target
  };
}

function normalizeHomepage(input) {
  return normalizeReportTarget(input).domain;
}

function isValidReportPath(pathname) {
  if (!pathname.startsWith("/") || pathname.length > 2048) {
    return false;
  }

  if (/[\u0000-\u001f\u007f]/.test(pathname)) {
    return false;
  }

  return !pathname.split("/").some((segment) => segment === "." || segment === "..");
}

export function waybackQueryVariantsForTarget(reportTarget) {
  const target = typeof reportTarget === "string" ? normalizeReportTarget(reportTarget) : reportTarget;
  const paths = target.path === "/" ? ["/"] : [target.path, `${target.path}/`];
  const variants = [];

  for (const pathVariant of paths) {
    variants.push(
      `http://${target.domain}${pathVariant}`,
      `https://${target.domain}${pathVariant}`,
      `http://www.${target.domain}${pathVariant}`,
      `https://www.${target.domain}${pathVariant}`,
      `${target.domain}${pathVariant}`,
      `www.${target.domain}${pathVariant}`
    );
  }

  return [...new Set(variants)];
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

function normalizeTimelineRequestBody(body) {
  const target = String(body?.url ?? "").trim();
  if (!target) {
    throw new Error("Missing url in request body.");
  }

  const reportTarget = normalizeReportTarget(target);
  return {
    id: randomUUID(),
    url: target,
    target: reportTarget.target,
    domain: reportTarget.domain,
    path: reportTarget.path,
    status: "new",
    createdAt: new Date().toISOString()
  };
}

async function writeTimelineRequest(requestRecord) {
  await mkdir(requestQueueRoot, { recursive: true });
  const filename = `${requestRecord.createdAt.replace(/[:.]/g, "-")}-${requestRecord.id}.json`;
  const outputFile = path.join(requestQueueRoot, filename);
  await writeFile(outputFile, JSON.stringify(requestRecord, null, 2), "utf8");
  return outputFile;
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

function retrositeMode() {
  const mode = String(process.env.RETROSITE_MODE ?? "local").trim().toLowerCase();
  return mode === "request-only" ? "request-only" : "local";
}

function publicConfig() {
  const mode = retrositeMode();
  return {
    mode,
    canGenerateReports: mode === "local",
    canEditReports: mode === "local",
    canSubmitRequests: mode === "request-only",
    requestSink: process.env.RETROSITE_REQUEST_SINK ?? "local"
  };
}

function rejectReportMutationInReadOnlyMode(response) {
  if (retrositeMode() === "local") {
    return false;
  }

  response.status(403).json({
    error: "Report editing and generation are disabled in request-only mode."
  });
  return true;
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

function createQueuedReportJob({ host, screenshotLimit, notifyEmail, version = 1, message = "Report job created." }) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    target: host,
    host,
    version,
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

function positiveInteger(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(1, Math.round(numericValue)) : fallback;
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

async function scoreScreenshotVisuals(filePath) {
  try {
    const image = sharp(filePath);
    const stats = await image.stats();
    const { data, info } = await image.resize(200, null, { fit: "inside" }).greyscale().raw().toBuffer({ resolveWithObject: true });

    const totalPixels = info.width * info.height;

    const meanR = stats.channels[0]?.mean ?? 255;
    const meanG = stats.channels[1]?.mean ?? 255;
    const meanB = stats.channels[2]?.mean ?? 255;
    const stdR = stats.channels[0]?.stdev ?? 0;
    const stdG = stats.channels[1]?.stdev ?? 0;
    const stdB = stats.channels[2]?.stdev ?? 0;
    const colorStdDev = (stdR + stdG + stdB) / 3;

    let brightPixels = 0;
    let darkPixels = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 240) brightPixels++;
      if (data[i] < 16) darkPixels++;
    }
    const whiteRatio = brightPixels / totalPixels;
    const darkRatio = darkPixels / totalPixels;

    const hist = new Uint32Array(256);
    for (let i = 0; i < data.length; i++) {
      hist[data[i]]++;
    }
    let entropy = 0;
    for (const count of hist) {
      if (count === 0) continue;
      const p = count / totalPixels;
      entropy -= p * Math.log2(p);
    }

    return { colorStdDev, whiteRatio, darkRatio, entropy, score: computeVisualScore(colorStdDev, whiteRatio, darkRatio, entropy) };
  } catch {
    return { colorStdDev: 0, whiteRatio: 1, darkRatio: 0, entropy: 0, score: 0 };
  }
}

function computeVisualScore(colorStdDev, whiteRatio, darkRatio, entropy) {
  const colorScore = Math.min(colorStdDev / 60, 1) * 30;
  const blankRatio = Math.max(whiteRatio - 0.35, darkRatio - 0.8, 0);
  const whiteScore = Math.max(1 - blankRatio, 0) * 30;
  const entropyScore = Math.min(entropy / 7, 1) * 40;
  return Math.round(colorScore + whiteScore + entropyScore);
}

function classifyRender({ screenshot, diagnostics, visualScore }) {
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
  if (
    diagnostics.brokenImageCount >= 6 &&
    diagnostics.loadedImageRatio < 0.5 &&
    diagnostics.visibleContentCoverage < 0.35
  ) {
    reasons.push("many broken images");
  }
  if (diagnostics.visibleContentCoverage < 0.08 && diagnostics.bodyTextLength < 500) {
    reasons.push("low visible content coverage");
  }
  if (diagnostics.visibleContentCoverage < 0.16 && diagnostics.backgroundImageCount === 0 && diagnostics.imageCount < 2) {
    reasons.push("mostly empty viewport");
  }
  if (diagnostics.stylesheetCount === 0 && diagnostics.bodyTextLength > 600 && diagnostics.imageCount < 2) {
    reasons.push("unstyled text-heavy page");
  }
  if (diagnostics.bodyHeight < 220) {
    reasons.push("short rendered document");
  }
  if (visualScore != null && visualScore < 30) {
    reasons.push("low visual quality score");
  }

  let qualityScore = visualScore ?? 0;
  qualityScore += Math.min(diagnostics.visibleContentCoverage * 45, 18);
  qualityScore += Math.min(diagnostics.loadedImageRatio * 8, 8);
  qualityScore += Math.min(diagnostics.linkCount / 15, 1) * 4;
  qualityScore -= reasons.length * 8;
  if (diagnostics.hasWaybackErrorText || diagnostics.hasTextOnlySignal) qualityScore -= 30;
  if (diagnostics.brokenImageCount >= 2) qualityScore -= Math.min(diagnostics.brokenImageCount * 3, 18);
  qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

  return {
    ...screenshot,
    diagnostics,
    visualScore: visualScore ?? null,
    qualityScore,
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
    const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
    const backgroundImageCount = elements.filter((element) => {
      const backgroundImage = window.getComputedStyle(element).backgroundImage;
      return Boolean(backgroundImage && backgroundImage !== "none");
    }).length;
    const visibleElements = elements.filter((element) => {
      const style = window.getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) {
        return false;
      }
      if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) {
        return false;
      }
      const tagName = element.tagName.toLowerCase();
      if (tagName === "html" || tagName === "body") {
        return false;
      }
      const hasMedia = tagName === "img" || tagName === "svg" || tagName === "canvas" || style.backgroundImage !== "none";
      const hasText = Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0
      );
      return hasMedia || hasText;
    });
    let visibleContentArea = 0;
    for (const element of visibleElements) {
      const rect = element.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      visibleContentArea += width * height;
    }
    const images = Array.from(document.querySelectorAll("img"));
    const brokenImageCount = images.filter((img) => !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0).length;
    const loadedImageCount = images.length - brokenImageCount;
    const loadedImageRatio = images.length === 0 ? 1 : loadedImageCount / images.length;
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
      imageCount: images.length,
      loadedImageCount,
      brokenImageCount,
      loadedImageRatio,
      stylesheetCount: document.querySelectorAll("link[rel~='stylesheet'], style").length,
      scriptCount: document.querySelectorAll("script").length,
      backgroundImageCount,
      visibleElementCount: visibleElements.length,
      visibleContentCoverage: Math.min(1, visibleContentArea / viewportArea),
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

function candidateFromCapture(capture, reason, rank) {
  return {
    timestamp: capture.timestamp,
    date: timestampDate(capture.timestamp),
    original: capture.original,
    replayUrl: waybackReplayUrl(capture.timestamp, capture.original),
    reason,
    rank
  };
}

function addCandidateCapture(target, capture, reason) {
  const key = `${capture.timestamp}:${capture.original}`;
  if (!target.has(key)) {
    target.set(key, { capture, reason });
  }
}

function selectYearCandidateCaptures(yearCaptures) {
  const sorted = yearCaptures.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const limit = positiveInteger(perYearCandidateLimit, 6);
  const selected = new Map();

  if (sorted.length === 0) {
    return [];
  }

  addCandidateCapture(selected, sorted[0], "Earliest homepage capture for this year");
  addCandidateCapture(selected, sorted.at(-1), "Latest homepage capture for this year");

  const middleIndex = Math.floor(sorted.length / 2);
  addCandidateCapture(selected, sorted[middleIndex], "Middle homepage capture for this year");

  for (const capture of spreadSample(sorted, limit)) {
    addCandidateCapture(selected, capture, "Spread-sampled homepage capture for this year");
  }

  let previousDigest = sorted[0]?.digest;
  for (const capture of sorted) {
    if (selected.size >= limit) {
      break;
    }
    if (capture.digest && previousDigest && capture.digest !== previousDigest) {
      addCandidateCapture(selected, capture, "Digest-change homepage capture for this year");
    }
    previousDigest = capture.digest;
  }

  return [...selected.values()]
    .map(({ capture, reason }) => ({ capture, reason }))
    .sort((a, b) => a.capture.timestamp.localeCompare(b.capture.timestamp))
    .slice(0, limit);
}

export function pickCandidateEras(captures) {
  const byYear = new Map();
  for (const capture of captures) {
    const year = capture.timestamp.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(capture);
  }

  const candidates = [];
  for (const [, yearCaptures] of [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const yearCandidates = selectYearCandidateCaptures(yearCaptures);
    for (const [rank, { capture, reason }] of yearCandidates.entries()) {
      candidates.push(candidateFromCapture(capture, reason, rank));
    }
  }
  return candidates;
}

async function discoverCaptures(target) {
  const reportTarget = normalizeReportTarget(target);
  const host = reportTarget.target;
  const variants = waybackQueryVariantsForTarget(reportTarget);

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
      replacementAttempts: [],
      candidateRank: candidate.rank ?? 0
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

function visualEraKey(entry) {
  const core = entry.techStack.split(" · ")[0];
  const parts = core.split(",").map((s) => s.trim());
  const cms = parts.find((p) => /^(WordPress|Squarespace|Wix|Webflow|FrontPage|Classic ASP|Static HTML)/i.test(p)) ?? "";
  const theme = parts.find((p) => /^theme:/i.test(p)) ?? "";
  if (!theme) return null;
  return `${cms}|${theme}`.toLowerCase();
}

function deduplicateByEra(entries) {
  if (entries.length === 0) return entries;
  const result = [entries[0]];
  for (let i = 1; i < entries.length; i++) {
    const key = visualEraKey(entries[i]);
    const prevKey = visualEraKey(entries[i - 1]);
    if (key === null || prevKey === null || key !== prevKey) {
      result.push(entries[i]);
    }
  }
  return result;
}

function entryQualityScore(entry) {
  if (entry.screenshotStatus !== "rendered" || !entry.screenshotQuality) {
    return Number.NEGATIVE_INFINITY;
  }

  const quality = entry.screenshotQuality;
  const diagnostics = quality.diagnostics ?? {};
  const reasons = quality.reasons ?? [];
  let score = quality.qualityScore ?? quality.visualScore ?? 0;

  if (quality.classification === "usable") {
    score += 12;
  } else {
    score -= 12;
  }
  score -= reasons.length * 6;
  if (reasons.some((reason) => /Wayback error|text-only|unstyled|small screenshot dimensions|short rendered/i.test(reason))) {
    score -= 35;
  }
  if (reasons.some((reason) => /many broken images|mostly empty|low visible content/i.test(reason))) {
    score -= 20;
  }
  if (diagnostics.visibleContentCoverage != null) {
    score += Math.min(diagnostics.visibleContentCoverage * 30, 14);
  }
  if (diagnostics.loadedImageRatio != null && diagnostics.imageCount > 0) {
    score += Math.min(diagnostics.loadedImageRatio * 10, 10);
  }
  if (entry.replacementOf) {
    score += 3;
  }

  return Math.round(score);
}

function selectableEntry(entry) {
  const quality = entry.screenshotQuality;
  if (entry.screenshotStatus !== "rendered" || !quality) {
    return false;
  }

  const reasons = quality.reasons ?? [];
  const fatalReason = reasons.some((reason) =>
    /Wayback error|text-only|unstyled|small screenshot dimensions|short rendered|mostly empty viewport/i.test(reason)
  );
  if (fatalReason) {
    return false;
  }

  if (quality.classification === "usable") {
    return true;
  }

  return entryQualityScore(entry) >= 45;
}

function bestEntryPerYear(entries) {
  const byYear = new Map();
  for (const entry of entries) {
    const year = entry.date.slice(0, 4);
    const existing = byYear.get(year);
    if (!existing) {
      byYear.set(year, entry);
      continue;
    }
    const entryUsable = entry.screenshotQuality?.classification === "usable";
    const existingUsable = existing.screenshotQuality?.classification === "usable";
    const entryScore = entryQualityScore(entry);
    const existingScore = entryQualityScore(existing);
    if (entryUsable && !existingUsable) {
      byYear.set(year, entry);
    } else if (entryUsable === existingUsable && entryScore > existingScore) {
      byYear.set(year, entry);
    }
  }
  return [...byYear.values()];
}

function curateDraftReport(job) {
  const renderedEntries = job.report.entries.filter((entry) => entry.screenshotStatus === "rendered");
  const selectableEntries = renderedEntries.filter(selectableEntry);
  const selectedEntries = bestEntryPerYear(selectableEntries);

  const sorted = selectedEntries.slice().sort((a, b) => a.date.localeCompare(b.date));
  const deduplicated = deduplicateByEra(sorted);

  job.report.curatedEntries = deduplicated.map(curatedEntryCopy);
  job.report.generatedReportUrl = `/timeline/${encodeURIComponent(job.host)}`;
  job.report.generatedShareUrl = `/timeline/${encodeURIComponent(job.host)}/share`;
  job.report.publicationStatus = job.report.publicationStatus ?? "draft";
  job.report.publishedAt = job.report.publishedAt ?? null;
  job.report.stats.renderedCount = renderedEntries.length;
  job.report.stats.usableRenderCount = selectableEntries.length;
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
    replacementAttempts: [],
    candidateRank: 0
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

export function candidateRenderBudget(job) {
  const finalLimit = normalizeScreenshotLimit(job.screenshotLimit);
  const multiplier = Math.max(1, Number.isFinite(candidateRenderMultiplier) ? candidateRenderMultiplier : 3);
  const cap = positiveInteger(candidateRenderCap, 90);
  const requested = Math.max(finalLimit, Math.ceil(finalLimit * multiplier));
  const entryCount = job.report?.entries?.length ?? requested;
  return Math.min(requested, cap, entryCount);
}

export function selectEntriesForCandidateRender(entries, limit) {
  const byYear = new Map();
  for (const entry of entries) {
    const year = entry.date.slice(0, 4);
    if (!byYear.has(year)) {
      byYear.set(year, []);
    }
    byYear.get(year).push(entry);
  }

  const yearBuckets = [...byYear.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, yearEntries]) =>
      yearEntries.slice().sort((a, b) => {
        const rankDelta = (a.candidateRank ?? 0) - (b.candidateRank ?? 0);
        return rankDelta === 0 ? a.timestamp.localeCompare(b.timestamp) : rankDelta;
      })
    );

  const selected = [];
  let depth = 0;
  while (selected.length < limit) {
    let added = false;
    for (const bucket of yearBuckets) {
      const entry = bucket[depth];
      if (!entry) {
        continue;
      }
      selected.push(entry);
      added = true;
      if (selected.length >= limit) {
        break;
      }
    }
    if (!added) {
      break;
    }
    depth += 1;
  }

  return selected;
}

function shouldRepairRenderedEntry(entry) {
  if (entry.screenshotStatus === "failed") {
    return true;
  }
  if (entry.screenshotStatus !== "rendered" || !entry.screenshotQuality) {
    return false;
  }
  return entry.screenshotQuality.classification === "weak" || entryQualityScore(entry) < 48;
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
    const visuals = await scoreScreenshotVisuals(filePath);

    const techStackResult = await inferTechStack(page).catch(() => null);

    entry.screenshotStatus = "rendered";
    entry.screenshotUrl = screenshotUrl;
    entry.screenshotError = null;
    entry.screenshotQuality = classifyRender({ screenshot, diagnostics, visualScore: visuals.score });
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

    const renderBudget = candidateRenderBudget(job);
    const entriesToRender = selectEntriesForCandidateRender(job.report.entries, renderBudget);
    const renderedKeys = new Set(entriesToRender.map(entryKey));
    for (const [index, entry] of entriesToRender.entries()) {
      if (canceledReportJob(job)) {
        return;
      }

      updateJob(job, {
        stage: "rendering",
        progress: Math.round(62 + (index / Math.max(entriesToRender.length, 1)) * 24),
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

      if (shouldRepairRenderedEntry(entry)) {
        const existingKeys = new Set(job.report.entries.map(entryKey));
        const alternatives = sameYearAlternatives(job, entry).filter((capture) => !existingKeys.has(`${capture.timestamp}:${capture.original}`));
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
            progress: Math.round(86 + (index / Math.max(entriesToRender.length, 1)) * 6),
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
            existingKeys.add(entryKey(replacement));
          }
          if (!shouldRepairRenderedEntry(replacement)) {
            break;
          }
        }
      }
    }

    for (const entry of job.report.entries) {
      if (entry.screenshotStatus === "pending" && !renderedKeys.has(entryKey(entry))) {
        entry.screenshotStatus = "queued";
      }
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
    version: job.version ?? 1,
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
    version: job.version ?? 1,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    screenshotLimit: normalizeScreenshotLimit(job.screenshotLimit),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    generatedReportUrl: `/timeline/${encodeURIComponent(job.host)}`,
    generatedShareUrl: `/timeline/${encodeURIComponent(job.host)}/share`,
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

function inlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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

function reportExportBaseName(job) {
  return job.host
    .replace(/[^a-z0-9.-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "retrosite-report";
}

function exportSafeSegment(value, fallback) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || fallback;
}

function generatedAssetFilePath(publicPath) {
  if (!publicPath) {
    return null;
  }

  const url = new URL(publicPath, "http://retrosite.local");
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (!pathname.startsWith("/generated/")) {
    return null;
  }

  const segments = pathname
    .slice("/generated/".length)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  return path.join(generatedRoot, ...segments);
}

function screenshotExportName(entry, index, usedNames) {
  const sourcePath = entry.screenshotUrl ? new URL(entry.screenshotUrl, "http://retrosite.local").pathname : "";
  const extension = path.extname(sourcePath).toLowerCase() || ".png";
  const safeExtension = /^\.[a-z0-9]{1,8}$/i.test(extension) ? extension : ".png";
  const baseName = `${String(index + 1).padStart(2, "0")}-${entry.date}-${exportSafeSegment(entry.title, "screenshot")}`;
  let name = `${baseName}${safeExtension}`;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${baseName}-${suffix}${safeExtension}`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
}

async function collectExportScreenshotAssets(entries) {
  const files = [];
  const screenshotPathsByEntry = new Map();
  const usedNames = new Set();

  for (const [index, entry] of entries.entries()) {
    const localPath = generatedAssetFilePath(entry.screenshotUrl);
    if (!localPath) {
      continue;
    }

    try {
      const data = await readFile(localPath);
      const zipPath = `screenshots/${screenshotExportName(entry, index, usedNames)}`;
      files.push({ path: zipPath, data });
      screenshotPathsByEntry.set(entryKey(entry), zipPath);
    } catch {
      // Keep the export usable even if a previously-rendered screenshot file was moved or deleted.
    }
  }

  return { files, screenshotPathsByEntry };
}

function reportCaveats(entry) {
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
  return caveats;
}

function buildReportMarkdown(job, screenshotPathsByEntry = new Map()) {
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

  lines.push("## Timeline", "");
  for (const entry of entries) {
    const screenshotPath = screenshotPathsByEntry.get(entryKey(entry));
    const caveats = reportCaveats(entry);
    lines.push(
      `### ${entry.date}: ${entry.title}`,
      "",
      screenshotPath ? `![${entry.date} ${entry.title}](${screenshotPath})` : "_No exported screenshot file was available for this entry._",
      "",
      `- Tech stack: ${entry.techStack}`,
      `- Source: [Wayback capture](${entry.source})`,
      "",
      entry.notes,
      ""
    );
    if (caveats.length > 0) {
      lines.push("Review notes:", "", ...caveats.map((caveat) => `- ${caveat}`), "");
    }
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

function buildReportHtml(job, screenshotPathsByEntry = new Map()) {
  const report = job.report;
  const entries = report?.curatedEntries ?? [];
  if (!report || entries.length === 0) {
    return "";
  }

  const range = String(report.stats.range ?? "").replace("-", " - ");
  const createdAt = job.createdAt
    ? new Date(job.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";
  const timelineEntries = entries.map((entry) => ({
    date: entry.date,
    title: entry.title,
    notes: entry.notes,
    techStack: entry.techStack,
    source: entry.source,
    imageUrl: screenshotPathsByEntry.get(entryKey(entry)) ?? null,
    focusScale: entry.focusScale ?? 1,
    focusOrigin: entry.focusOrigin ?? "center top",
    focusHeight: entry.focusHeight ?? "42rem"
  }));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(job.host)}: ${htmlEscape(range)}</title>
  <style>
    :root { color-scheme: light; --ink: #19140f; --muted: #5f6f85; --paper: #f7f0e2; --panel: #d8e6f5; --line: #1d314a24; --red: #d7372f; --blue: #1e5fd8; --signal: #9bff34; --navy: #1b2c42; }
    * { box-sizing: border-box; }
    body { margin: 0; background: linear-gradient(90deg, #19140f0d 1px, transparent 1px) 0 0 / 28px 28px, radial-gradient(circle at 18% 18%, #d8ff7a55, transparent 24rem), radial-gradient(circle at 78% 20%, #d7e2f044, transparent 30rem), var(--paper); color: var(--ink); font-family: Aptos, Segoe UI, sans-serif; }
    .site-nav { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; min-height: 3.75rem; padding: 0 clamp(1.25rem, 5vw, 5rem); border-bottom: 1px solid var(--line); background: #f7f0e2e8; backdrop-filter: blur(8px); }
    .brand { color: var(--ink); font-weight: 950; text-decoration: none; text-transform: uppercase; }
    main { padding: clamp(1.5rem, 4vw, 4.25rem) clamp(1.25rem, 5vw, 5rem); }
    .section-heading { margin: 0 0 1.5rem; }
    .timeline-header-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .8rem; }
    .timeline-created { color: var(--muted); font-size: .95rem; font-weight: 700; }
    h1 { max-width: 100%; margin: 0; font-family: Georgia, Times New Roman, serif; font-size: clamp(3rem, 6vw, 5.4rem); line-height: .95; letter-spacing: 0; }
    .timeline-range { display: block; margin-top: .45rem; color: var(--muted); font-family: Georgia, Times New Roman, serif; font-size: clamp(1.6rem, 3vw, 2rem); font-weight: 800; }
    .timeline-display-mode { display: flex; align-items: center; gap: 0; margin-top: 1rem; }
    button { font: inherit; cursor: pointer; }
    .timeline-display-mode button { display: inline-flex; align-items: center; justify-content: center; gap: .35rem; min-height: 2.35rem; border: 1px solid var(--ink); padding: .55rem .85rem; background: var(--navy); color: #f7f0e2; font-weight: 950; }
    .timeline-display-mode button.active { background: var(--signal); color: var(--ink); }
    .timeline-layout { display: grid; grid-template-columns: minmax(220px, 330px) minmax(0, 1fr); gap: 2rem; align-items: start; }
    .timeline-nav { display: grid; gap: .5rem; }
    .timeline-nav.image-only { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .45rem; }
    .timeline-nav button { display: grid; grid-template-columns: 4.5rem 1fr; align-items: center; min-height: 3.25rem; width: 100%; border: 1px solid var(--line); padding: .75rem; background: #fff9ee80; color: var(--navy); text-align: left; font-weight: 900; }
    .timeline-nav button.active { background: var(--navy); color: #f7f0e2; }
    .timeline-nav button span { color: var(--red); font-weight: 950; }
    .timeline-nav button.active span { color: #ff6b5f; }
    .timeline-nav.image-only button { position: relative; display: block; min-height: 0; aspect-ratio: 1 / .84; padding: 0; overflow: hidden; background: var(--navy); }
    .timeline-nav.image-only button span { position: absolute; left: .35rem; top: .35rem; z-index: 1; padding: .2rem .35rem; background: #fff9ee; color: var(--red); font-size: .75rem; }
    .timeline-nav.image-only img { width: 100%; height: 100%; object-fit: cover; object-position: top center; opacity: .82; }
    .timeline-nav.image-only em { display: grid; min-height: 6rem; place-items: center; color: #f7f0e2; font-size: .75rem; }
    .timeline-main { min-width: 0; }
    .timeline-detail { position: relative; border: 1px solid var(--ink); background: #fff9ee; overflow: hidden; }
    .detail-copy { display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 1.5rem; align-items: start; padding: clamp(1.25rem, 3vw, 2rem); background: var(--panel); }
    .detail-copy > span, dt { color: var(--red); font-size: .78rem; font-weight: 950; text-transform: uppercase; }
    dl { display: grid; grid-template-columns: minmax(22rem, 2.2fr) minmax(10rem, .8fr); gap: 1.5rem; margin: 0; }
    dd { margin: .35rem 0 0; color: #00254b; font-weight: 600; line-height: 1.4; }
    a { color: var(--ink); font-weight: 950; }
    .screenshot-frame { display: grid; place-items: start center; min-height: var(--focus-height, 42rem); background: #061d33; overflow: hidden; }
    .screenshot-frame img { display: block; max-width: none; width: 100%; background: #061d33; transform-origin: var(--focus-origin, center top); }
    .screenshot-frame.focus img { width: calc(100% * var(--focus-scale, 1)); }
    .screenshot-frame.full { min-height: auto; }
    .screenshot-frame.full img { width: 100%; }
    .empty-image { min-height: 30rem; display: grid; place-items: center; color: #f7f0e2; font-weight: 900; }
    @media (max-width: 1100px) { .timeline-layout { grid-template-columns: 1fr; } .timeline-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { h1 { font-size: clamp(2.4rem, 16vw, 4rem); } .timeline-header-row, .detail-copy, dl { display: block; } .timeline-nav, .timeline-nav.image-only { grid-template-columns: 1fr; } .detail-copy > span { display: block; margin-bottom: 1rem; } }
    @media print { .site-nav, .timeline-display-mode { display: none; } body { background: white; } main { padding: 1rem; } .timeline-layout { grid-template-columns: 1fr; } .timeline-nav { display: none; } }
  </style>
</head>
<body>
  <nav class="site-nav" aria-label="Site">
    <a class="brand" href="#">RETROSITE</a>
  </nav>
  <main>
    <section class="section-heading">
      <div class="timeline-header-row">
        <span class="timeline-created">${createdAt ? `Timeline created on ${htmlEscape(createdAt)}` : ""}</span>
      </div>
      <h1>${htmlEscape(job.host)}</h1>
      <span class="timeline-range">${htmlEscape(range)}</span>
      <div class="timeline-display-mode" aria-label="Report display mode">
        <button type="button" class="active" data-display-mode="timeline">Timeline</button>
        <button type="button" data-display-mode="image-only">Image Only</button>
      </div>
    </section>
    <section class="timeline-layout" aria-label="${htmlEscape(job.host)} timeline">
      <nav class="timeline-nav" aria-label="Timeline entries"></nav>
      <div class="timeline-main">
        <article class="timeline-detail" aria-live="polite"></article>
      </div>
    </section>
  </main>
  <script type="application/json" id="report-data">${inlineJson(timelineEntries)}</script>
  <script>
    (function () {
      var entries = JSON.parse(document.getElementById("report-data").textContent || "[]");
      var state = { activeIndex: 0, displayMode: "timeline", imageMode: "focus" };
      var nav = document.querySelector(".timeline-nav");
      var detail = document.querySelector(".timeline-detail");

      function summarizeTechStack(techStack) {
        var core = String(techStack || "").split(String.fromCharCode(183))[0].trim();
        var parts = core.split(",").map(function (part) { return part.trim(); }).filter(Boolean);
        var cms = parts.find(function (part) { return /^(WordPress|Squarespace|Wix|Webflow|FrontPage|Classic ASP|Static HTML)/i.test(part); });
        var theme = parts.find(function (part) { return /^theme:/i.test(part); });
        if (cms && theme) return cms + ", " + theme;
        if (cms) return cms;
        if (parts.length <= 2) return core || "Unknown";
        return parts.slice(0, 2).join(", ");
      }

      function clear(element) {
        while (element.firstChild) element.removeChild(element.firstChild);
      }

      function appendTextElement(parent, tagName, text, className) {
        var element = document.createElement(tagName);
        if (className) element.className = className;
        element.textContent = text;
        parent.appendChild(element);
        return element;
      }

      function renderNav() {
        nav.className = "timeline-nav" + (state.displayMode === "image-only" ? " image-only" : "");
        clear(nav);
        entries.forEach(function (entry, index) {
          var button = document.createElement("button");
          button.type = "button";
          button.className = index === state.activeIndex ? "active" : "";
          button.setAttribute("aria-label", entry.date.slice(0, 4) + " " + entry.title + ": " + entry.techStack);
          button.addEventListener("click", function () {
            state.activeIndex = index;
            state.imageMode = "focus";
            render();
          });
          appendTextElement(button, "span", entry.date.slice(0, 4));
          if (state.displayMode === "image-only") {
            if (entry.imageUrl) {
              var img = document.createElement("img");
              img.src = entry.imageUrl;
              img.alt = "";
              img.loading = "lazy";
              button.appendChild(img);
            } else {
              appendTextElement(button, "em", "No image");
            }
          } else {
            button.appendChild(document.createTextNode(summarizeTechStack(entry.techStack)));
          }
          nav.appendChild(button);
        });
      }

      function renderDetail() {
        clear(detail);
        var entry = entries[state.activeIndex];
        if (!entry) return;

        var copy = document.createElement("div");
        copy.className = "detail-copy";
        var dl = document.createElement("dl");
        var tech = document.createElement("div");
        appendTextElement(tech, "dt", "Tech stack");
        appendTextElement(tech, "dd", entry.techStack || "Needs render review");
        var source = document.createElement("div");
        appendTextElement(source, "dt", "Source");
        var dd = document.createElement("dd");
        var link = document.createElement("a");
        link.href = entry.source;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Wayback capture";
        dd.appendChild(link);
        source.appendChild(dd);
        dl.appendChild(tech);
        dl.appendChild(source);
        copy.appendChild(dl);
        appendTextElement(copy, "span", "Captured on " + entry.date);
        detail.appendChild(copy);

        if (entry.imageUrl) {
          var frame = document.createElement("div");
          frame.className = "screenshot-frame " + state.imageMode;
          frame.style.setProperty("--focus-scale", entry.focusScale || 1);
          frame.style.setProperty("--focus-origin", entry.focusOrigin || "center top");
          frame.style.setProperty("--focus-height", entry.focusHeight || "42rem");
          var image = document.createElement("img");
          image.src = entry.imageUrl;
          image.alt = entry.date + " " + entry.title;
          frame.appendChild(image);
          detail.appendChild(frame);
        } else {
          appendTextElement(detail, "div", "No exported screenshot file was available for this entry.", "empty-image");
        }
      }

      function renderModeButtons() {
        document.querySelectorAll("[data-display-mode]").forEach(function (button) {
          button.classList.toggle("active", button.dataset.displayMode === state.displayMode);
          button.onclick = function () {
            state.displayMode = button.dataset.displayMode;
            render();
          };
        });
      }

      function render() {
        renderModeButtons();
        renderNav();
        renderDetail();
      }

      render();
    })();
  </script>
</body>
</html>`;
}

const crc32Table = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function buildZipArchive(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime();

  for (const file of files) {
    const name = file.path.replace(/\\/g, "/");
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const checksum = crc32(data);
    const localHeaderOffset = offset;
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      nameBuffer
    ]);

    localParts.push(localHeader, data);
    offset += localHeader.length + data.length;

    centralParts.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(checksum),
        u32(data.length),
        u32(data.length),
        u16(nameBuffer.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(localHeaderOffset),
        nameBuffer
      ])
    );
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0)
  ]);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

async function buildReportExportArchive(job, documentKind) {
  const report = job.report;
  const entries = report?.curatedEntries ?? [];
  const baseName = reportExportBaseName(job);
  const { files: screenshotFiles, screenshotPathsByEntry } = await collectExportScreenshotAssets(entries);
  const documentName = documentKind === "markdown" ? `${baseName}.md` : `${baseName}.html`;
  const document = documentKind === "markdown"
    ? buildReportMarkdown(job, screenshotPathsByEntry)
    : buildReportHtml(job, screenshotPathsByEntry);
  const files = [
    { path: documentName, data: Buffer.from(document, "utf8") },
    ...screenshotFiles
  ];

  return {
    filename: `${baseName}-${documentKind}-export.zip`,
    buffer: buildZipArchive(files)
  };
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
      message: "Querying Wayback Machine captures for this target."
    });

    const discovery = await discoverCaptures(job.target);
    if (canceledReportJob(job)) {
      return;
    }
    if (discovery.captureCount === 0) {
      throw new Error("No captures were found for this report target.");
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
    const renderBudget = candidateRenderBudget({ ...job, report });
    updateJob(job, {
      report,
      stage: "rendering",
      progress: 62,
      message: `Rendering ${renderBudget} balanced candidate screenshots across capture years.`
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
  response.json({
    ok: true,
    runnerMode: inlineRunnerEnabled() ? "inline" : "external",
    mode: retrositeMode()
  });
});

app.get("/api/config", (_request, response) => {
  response.json(publicConfig());
});

app.post("/api/requests", async (request, response) => {
  try {
    const timelineRequest = normalizeTimelineRequestBody(request.body);
    await writeTimelineRequest(timelineRequest);
    response.status(202).json({ request: timelineRequest });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to submit timeline request."
    });
  }
});

app.get("/api/reports", async (request, response) => {
  await refreshPersistedJobsForExternalRunner();
  const requestedLimit = Number(request.query.limit ?? 12);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 12;
  const offset = Math.max(0, Number(request.query.offset ?? 0)) || 0;
  const search = String(request.query.search ?? "").trim().toLowerCase();

  const latestByDomain = new Map();
  for (const job of reportJobs.values()) {
    const existing = latestByDomain.get(job.host);
    if (!existing || (job.version ?? 1) > (existing.version ?? 1)) {
      latestByDomain.set(job.host, job);
    }
  }

  let jobs = [...latestByDomain.values()]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  if (search) {
    jobs = jobs.filter((job) => job.host.toLowerCase().includes(search));
  }

  const total = jobs.length;
  const paged = jobs.slice(offset, offset + limit).map(publicJobSummary);

  response.json({ jobs: paged, total, queue: queueSummary() });
});

app.post("/api/reports", (request, response) => {
  try {
    if (rejectReportMutationInReadOnlyMode(response)) return;

    const target = String(request.body?.url ?? "").trim();
    if (!target) {
      response.status(400).json({ error: "Missing url in request body." });
      return;
    }

    const host = normalizeReportTarget(target).target;
    const activeJobs = activeReportJobs();
    const duplicateActiveJob = activeJobs.find((job) => job.host === host);
    if (duplicateActiveJob) {
      response.status(409).json({
        error: `A report for ${host} is already ${duplicateActiveJob.status}. Open the existing job instead of starting another.`,
        job: publicJobSummary(duplicateActiveJob)
      });
      return;
    }

    const existingCompleteJob = [...reportJobs.values()].find(
      (job) => job.host === host && (job.status === "complete" || job.status === "incomplete")
    );
    if (existingCompleteJob) {
      response.status(200).json({ existingReportId: existingCompleteJob.id, host: existingCompleteJob.host });
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
      notifyEmail,
      version: nextVersionForDomain(host)
    });

    reportJobs.set(job.id, job);
    queuePersistJob(job);
    response.status(202).json(publicJob(job));
    enqueueReportJob(job);
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to create report job." });
  }
});

function findAllVersionsForDomain(domain) {
  return [...reportJobs.values()]
    .filter((job) => job.host === domain)
    .sort((a, b) => (b.version ?? 1) - (a.version ?? 1));
}

function findJobByIdOrDomain(key, version) {
  const byId = reportJobs.get(key);
  if (byId) return byId;
  const domainJobs = findAllVersionsForDomain(key);
  if (domainJobs.length === 0) return null;
  if (version != null) {
    return domainJobs.find((j) => (j.version ?? 1) === version) ?? null;
  }
  return domainJobs[0];
}

function nextVersionForDomain(domain) {
  const versions = findAllVersionsForDomain(domain);
  if (versions.length === 0) return 1;
  return (versions[0].version ?? 1) + 1;
}

function seedReportJob() {
  return {
    id: "krynsky-com-seed",
    target: "krynsky.com",
    host: "krynsky.com",
    version: 0,
    status: "complete",
    stage: "complete",
    progress: 100,
    message: "Hand-curated seed report",
    screenshotLimit: 14,
    createdAt: "1997-01-08T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    events: [],
    discovery: null,
    report: null,
    error: null,
    notifyEmail: null,
    notificationStatus: "not_requested"
  };
}

app.get("/api/reports/:id", async (request, response) => {
  const key = request.params.id;
  const normalizedKey = key === "krynsky-com" ? "krynsky.com" : key;

  await refreshPersistedJobsForExternalRunner();
  const version = request.query.version ? Number(request.query.version) : undefined;

  if (normalizedKey === "krynsky.com" && version === 0) {
    response.json(seedReportJob());
    return;
  }
  const job = findJobByIdOrDomain(normalizedKey, version);
  if (!job) {
    if (normalizedKey === "krynsky.com" && version == null) {
      response.json(seedReportJob());
      return;
    }
    response.status(404).json({ error: "Report job not found." });
    return;
  }

  response.json(publicJob(job));
});

app.get("/api/reports/:id/versions", async (request, response) => {
  const key = request.params.id;
  const normalizedKey = key === "krynsky-com" ? "krynsky.com" : key;
  await refreshPersistedJobsForExternalRunner();
  const versions = findAllVersionsForDomain(normalizedKey);

  const versionEntries = versions.map((job) => ({
    version: job.version ?? 1,
    id: job.id,
    status: job.status,
    screenshotLimit: normalizeScreenshotLimit(job.screenshotLimit),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    entryCount: job.report?.curatedEntries?.length ?? 0
  }));

  if (normalizedKey === "krynsky.com") {
    versionEntries.push({
      version: 0,
      id: "krynsky-com-seed",
      status: "complete",
      screenshotLimit: 14,
      createdAt: "1997-01-08T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      entryCount: 14
    });
  }

  if (versionEntries.length === 0) {
    response.status(404).json({ error: "No reports found for this domain." });
    return;
  }

  versionEntries.sort((a, b) => b.version - a.version);
  response.json({ domain: key, versions: versionEntries });
});

app.post("/api/reports/:id/rerun", (request, response) => {
  if (rejectReportMutationInReadOnlyMode(response)) return;

  const key = request.params.id;
  const latestJob = findJobByIdOrDomain(key);
  if (!latestJob) {
    response.status(404).json({ error: "Report job not found." });
    return;
  }

  const activeJobs = activeReportJobs();
  if (activeJobs.length >= maxActiveJobCount()) {
    response.status(429).json({
      error: `Retrosite is already running ${activeJobs.length} report jobs. Try again after one finishes.`
    });
    return;
  }

  const duplicateActiveJob = activeJobs.find((j) => j.host === latestJob.host);
  if (duplicateActiveJob) {
    response.status(409).json({
      error: `A report for ${latestJob.host} is already ${duplicateActiveJob.status}.`
    });
    return;
  }

  const retryAfterMs = checkCreateRateLimit(request);
  if (retryAfterMs !== null) {
    sendCreateRateLimitResponse(response, retryAfterMs);
    return;
  }

  const newVersion = nextVersionForDomain(latestJob.host);
  const job = createQueuedReportJob({
    host: latestJob.host,
    screenshotLimit: defaultScreenshotLimit,
    notifyEmail: null,
    version: newVersion,
    message: `Re-run (version ${newVersion}) created from version ${latestJob.version ?? 1}.`
  });

  reportJobs.set(job.id, job);
  queuePersistJob(job);
  response.status(202).json(publicJob(job));
  enqueueReportJob(job);
});

app.delete("/api/reports/:id", async (request, response) => {
  if (rejectReportMutationInReadOnlyMode(response)) return;

  const key = request.params.id;

  if (key === "krynsky-com-seed") {
    response.status(403).json({ error: "Cannot delete the seed report." });
    return;
  }

  const job = findJobByIdOrDomain(key);
  if (!job) {
    response.status(404).json({ error: "Report job not found." });
    return;
  }

  if (job.status === "running" || job.status === "queued") {
    response.status(409).json({ error: "Cannot delete an active job. Cancel it first." });
    return;
  }

  reportJobs.delete(job.id);

  const outputDir = reportOutputDir(job.id);
  try {
    await rm(outputDir, { recursive: true, force: true });
  } catch {
    // Directory may not exist
  }

  response.json({ ok: true });
});

app.post("/api/reports/:id/cancel", (request, response) => {
  if (rejectReportMutationInReadOnlyMode(response)) return;

  const job = findJobByIdOrDomain(request.params.id);
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
  if (rejectReportMutationInReadOnlyMode(response)) return;

  const sourceJob = findJobByIdOrDomain(request.params.id);
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
    version: nextVersionForDomain(sourceJob.host),
    message: `Retry created from ${sourceJob.status} report job ${sourceJob.id}.`
  });

  reportJobs.set(job.id, job);
  queuePersistJob(job);
  response.status(202).json(publicJob(job));
  enqueueReportJob(job);
});

app.patch("/api/reports/:id", (request, response) => {
  if (rejectReportMutationInReadOnlyMode(response)) return;

  const job = findJobByIdOrDomain(request.params.id);
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
  if (rejectReportMutationInReadOnlyMode(response)) return;

  const job = findJobByIdOrDomain(request.params.id);
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
  const replaceSelectedYear = body.replaceSelectedYear === true;
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
      if (replaceSelectedYear) {
        const targetYear = renderedEntry.date.slice(0, 4);
        const existingYearEntry = curatedEntries.find((entry) => entry.date.slice(0, 4) === targetYear);
        const replacement = curatedEntryCopy(renderedEntry);
        if (existingYearEntry) {
          if (!hasTitleEdit) {
            replacement.title = existingYearEntry.title;
          }
          if (!hasNotesEdit) {
            replacement.notes = existingYearEntry.notes;
          }
          if (!hasTechStackEdit) {
            replacement.techStack = existingYearEntry.techStack;
          }
        }
        curatedEntries = curatedEntries.filter((entry) => entry.date.slice(0, 4) !== targetYear);
        curatedEntries.push(replacement);
      } else if (!curatedEntries.some((entry) => entryKey(entry) === targetKey)) {
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
        ? replaceSelectedYear
          ? `Selected ${renderedEntry.date} screenshot for the ${renderedEntry.date.slice(0, 4)} timeline record.`
          : `Included ${renderedEntry.date} in the generated report.`
        : `Excluded ${renderedEntry.date} from the generated report.`
      : `Updated ${renderedEntry.date} report details.`
  });

  response.json(publicJob(job));
});

app.get("/api/reports/:id/export.md", async (request, response) => {
  await refreshPersistedJobsForExternalRunner();
  const job = findJobByIdOrDomain(request.params.id);
  if (!job) {
    response.status(404).send("Report job not found.");
    return;
  }

  if (job.status !== "complete" || !job.report?.curatedEntries?.length) {
    response.status(409).send("Report is not ready to export.");
    return;
  }

  const { filename, buffer } = await buildReportExportArchive(job, "markdown");
  response.setHeader("content-type", "application/zip");
  response.setHeader("content-disposition", `attachment; filename="${filename}"`);
  response.send(buffer);
});

app.get("/api/reports/:id/export.html", async (request, response) => {
  await refreshPersistedJobsForExternalRunner();
  const job = findJobByIdOrDomain(request.params.id);
  if (!job) {
    response.status(404).send("Report job not found.");
    return;
  }

  if (job.status !== "complete" || !job.report?.curatedEntries?.length) {
    response.status(409).send("Report is not ready to export.");
    return;
  }

  const { filename, buffer } = await buildReportExportArchive(job, "html");
  response.setHeader("content-type", "application/zip");
  response.setHeader("content-disposition", `attachment; filename="${filename}"`);
  response.send(buffer);
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
