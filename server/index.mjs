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
const staticTimelinesRoot = process.env.RETROSITE_STATIC_TIMELINES_ROOT ?? path.join(__dirname, "..", "demosite", "timelines");
const clientDistRoot = path.join(__dirname, "..", "dist");
const clientIndexFile = path.join(clientDistRoot, "index.html");
const defaultScreenshotLimit = Number(process.env.RETROSITE_SCREENSHOT_LIMIT ?? 35);
const maxScreenshotLimit = Number(process.env.RETROSITE_MAX_SCREENSHOT_LIMIT ?? 50);
const quickScreenshotLimit = Number(process.env.RETROSITE_QUICK_SCREENSHOT_LIMIT ?? 10);
const adaptiveMediumScreenshotLimit = Number(process.env.RETROSITE_ADAPTIVE_MEDIUM_SCREENSHOT_LIMIT ?? 24);
const adaptiveLargeScreenshotLimit = Number(process.env.RETROSITE_ADAPTIVE_LARGE_SCREENSHOT_LIMIT ?? 14);
const adaptiveHugeScreenshotLimit = Number(process.env.RETROSITE_ADAPTIVE_HUGE_SCREENSHOT_LIMIT ?? 8);
const candidateRenderMultiplier = Number(process.env.RETROSITE_CANDIDATE_RENDER_MULTIPLIER ?? 2);
const candidateRenderCap = Number(process.env.RETROSITE_CANDIDATE_RENDER_LIMIT ?? 60);
const perYearCandidateLimit = Number(process.env.RETROSITE_PER_YEAR_CANDIDATE_LIMIT ?? 4);
const replacementLimit = Number(process.env.RETROSITE_REPLACEMENT_LIMIT ?? 3);
const cdxTimeoutMs = Number(process.env.RETROSITE_CDX_TIMEOUT_MS ?? 25000);
const cdxRetryCount = Number(process.env.RETROSITE_CDX_RETRIES ?? 1);
const cdxConcurrency = Number(process.env.RETROSITE_CDX_CONCURRENCY ?? 3);
const cdxRetryDelayMs = Number(process.env.RETROSITE_CDX_RETRY_DELAY_MS ?? 1200);
const cdxFallbackStartYear = Number(process.env.RETROSITE_CDX_FALLBACK_START_YEAR ?? 1996);
const cdxFallbackWindowYears = Number(process.env.RETROSITE_CDX_FALLBACK_WINDOW_YEARS ?? 5);
const cdxFallbackLimit = Number(process.env.RETROSITE_CDX_FALLBACK_LIMIT ?? 1000);
const cdxFallbackRetryCount = Number(process.env.RETROSITE_CDX_FALLBACK_RETRIES ?? 0);
const cdxFallbackMaxQueries = Number(process.env.RETROSITE_CDX_FALLBACK_MAX_QUERIES ?? 4);
const archivedPathDiscoveryLimit = Number(process.env.RETROSITE_ARCHIVED_PATH_DISCOVERY_LIMIT ?? 3000);
const renderNavigationRetryCount = Number(process.env.RETROSITE_RENDER_NAV_RETRIES ?? 2);
const renderNavigationRetryDelayMs = Number(process.env.RETROSITE_RENDER_NAV_RETRY_DELAY_MS ?? 1800);
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

export function normalizeArchiveMode(value) {
  const mode = String(value ?? "best-year").toLowerCase();
  return ["best-year", "homepage", "specific-path", "broad"].includes(mode) ? mode : "best-year";
}

function broadWaybackQueryStrategies(target) {
  const prefixVariant = target.path === "/" ? `${target.domain}/` : `${target.domain}${target.path}/`;
  return [
    {
      variant: prefixVariant,
      matchType: "prefix",
      collapseByYear: true,
      broad: true,
      limit: cdxFallbackLimit
    },
    {
      variant: target.domain,
      matchType: "host",
      collapseByYear: true,
      broad: true,
      limit: cdxFallbackLimit
    },
    {
      variant: target.domain,
      matchType: "domain",
      collapseByYear: true,
      broad: true,
      limit: cdxFallbackLimit
    }
  ];
}

export function waybackQueryStrategiesForTarget(reportTarget, { includeBroad = false, archiveMode = "best-year" } = {}) {
  const target = typeof reportTarget === "string" ? normalizeReportTarget(reportTarget) : reportTarget;
  const exactStrategies = waybackQueryVariantsForTarget(target).map((variant) => ({
    variant,
    matchType: "exact",
    collapseByYear: false,
    broad: false
  }));
  const normalizedArchiveMode = normalizeArchiveMode(archiveMode);

  if (normalizedArchiveMode === "broad") {
    return broadWaybackQueryStrategies(target);
  }

  if (normalizedArchiveMode === "homepage" || normalizedArchiveMode === "specific-path" || !includeBroad) {
    return exactStrategies;
  }

  return [...exactStrategies, ...broadWaybackQueryStrategies(target)];
}

export function archivedPathDiscoveryStrategyForTarget(reportTarget) {
  const target = typeof reportTarget === "string" ? normalizeReportTarget(reportTarget) : reportTarget;
  return {
    variant: target.domain,
    matchType: "domain",
    collapseByUrlKey: true,
    broad: true,
    limit: Number.isFinite(archivedPathDiscoveryLimit) ? Math.max(1, Math.round(archivedPathDiscoveryLimit)) : 3000
  };
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

function includeStaticTimelineSummaries() {
  return process.env.RETROSITE_INCLUDE_STATIC_TIMELINES === "1";
}

function githubTimelineRequestSearchUrl(repo) {
  const normalizedRepo = String(repo ?? "")
    .trim()
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");

  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(normalizedRepo)) {
    return null;
  }

  const query = `repo:${normalizedRepo} is:issue label:timeline-request`;
  return `https://github.com/search?q=${encodeURIComponent(query)}&type=issues`;
}

function publicConfig() {
  const mode = retrositeMode();
  return {
    mode,
    canGenerateReports: mode === "local",
    canEditReports: mode === "local",
    canSubmitRequests: mode === "request-only",
    requestSink: process.env.RETROSITE_REQUEST_SINK ?? "local",
    requestStatusUrl: githubTimelineRequestSearchUrl(process.env.RETROSITE_REQUEST_REPO)
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

function storageBaseForTarget(target) {
  return String(target ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[^a-z0-9.]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "report";
}

function createReportStorageKey(target, id) {
  return `${storageBaseForTarget(target)}--${String(id).slice(0, 8)}`;
}

function timelineRoutePath(target) {
  return `/timeline/${String(target)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function reportStorageKey(job) {
  return job?.storageKey ?? job?.storageSlug ?? job?.id ?? String(job);
}

export function normalizeDepthMode(value) {
  const mode = String(value ?? "adaptive").toLowerCase();
  return ["adaptive", "quick", "standard", "deep"].includes(mode) ? mode : "adaptive";
}

export function depthScreenshotLimit(depthMode) {
  switch (normalizeDepthMode(depthMode)) {
    case "quick":
      return normalizeScreenshotLimit(quickScreenshotLimit);
    case "deep":
      return normalizeScreenshotLimit(maxScreenshotLimit);
    case "standard":
    case "adaptive":
    default:
      return normalizeScreenshotLimit(defaultScreenshotLimit);
  }
}

function archiveSizeForCaptureCount(captureCount) {
  if (captureCount >= 10000) return "huge";
  if (captureCount >= 1500) return "large";
  if (captureCount >= 250) return "medium";
  return "small";
}

function adaptiveLimitForArchiveSize(archiveSize) {
  switch (archiveSize) {
    case "huge":
      return normalizeScreenshotLimit(adaptiveHugeScreenshotLimit);
    case "large":
      return normalizeScreenshotLimit(adaptiveLargeScreenshotLimit);
    case "medium":
      return normalizeScreenshotLimit(adaptiveMediumScreenshotLimit);
    case "small":
    default:
      return normalizeScreenshotLimit(defaultScreenshotLimit);
  }
}

export function adaptiveArchiveProfile({ depthMode = "adaptive", discovery }) {
  const normalizedDepthMode = normalizeDepthMode(depthMode);
  const captureCount = Number(discovery?.captureCount ?? 0);
  const failedQueryCount = Array.isArray(discovery?.variantStatus)
    ? discovery.variantStatus.filter((status) => status.status === "failed").length
    : 0;
  const archiveSize = archiveSizeForCaptureCount(captureCount);

  if (normalizedDepthMode !== "adaptive") {
    const screenshotLimit = depthScreenshotLimit(normalizedDepthMode);
    return {
      depthMode: normalizedDepthMode,
      archiveSize,
      captureCount,
      failedQueryCount,
      screenshotLimit,
      reason:
        normalizedDepthMode === "quick"
          ? "Quick depth selected. Retrosite will render fewer captures for a faster, more reliable run."
          : normalizedDepthMode === "deep"
          ? "Deep depth selected. Retrosite will render more captures and may take longer."
          : "Standard depth selected. Retrosite will use the normal render budget."
    };
  }

  let screenshotLimit = adaptiveLimitForArchiveSize(archiveSize);
  let reason =
    archiveSize === "huge"
      ? "Huge archive detected. Retrosite reduced depth aggressively to keep the job reliable."
      : archiveSize === "large"
      ? "Large archive detected. Retrosite reduced depth to keep the job reliable."
      : archiveSize === "medium"
      ? "Medium archive detected. Retrosite used a balanced depth for this run."
      : "Small archive detected. Retrosite kept standard depth for this run.";

  if (failedQueryCount > 0 && captureCount > 0) {
    screenshotLimit = Math.min(screenshotLimit, normalizeScreenshotLimit(18));
    reason = "Wayback was partially unstable. Retrosite used a safer depth for this run.";
  }

  return {
    depthMode: "adaptive",
    archiveSize,
    captureCount,
    failedQueryCount,
    screenshotLimit,
    reason
  };
}

export function buildArchivePreflight(discovery, { depthMode = "adaptive" } = {}) {
  const captures = Array.isArray(discovery?.captures)
    ? discovery.captures
        .filter((capture) => capture?.timestamp)
        .slice()
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    : [];
  const yearSummary = Array.isArray(discovery?.yearSummary)
    ? discovery.yearSummary
        .filter((summary) => summary?.year)
        .slice()
        .sort((a, b) => String(a.year).localeCompare(String(b.year)))
    : [];
  const captureCount = Number(discovery?.captureCount ?? captures.length);
  const uniqueDigests = new Set(captures.map((capture) => capture.digest).filter(Boolean));
  const firstTimestamp = captures[0]?.timestamp ?? yearSummary[0]?.firstTimestamp ?? null;
  const latestTimestamp = captures.at(-1)?.timestamp ?? yearSummary.at(-1)?.lastTimestamp ?? null;
  const firstYear = firstTimestamp ? Number(firstTimestamp.slice(0, 4)) : null;
  const latestYear = latestTimestamp ? Number(latestTimestamp.slice(0, 4)) : null;
  const yearsWithCaptures = new Map(yearSummary.map((summary) => [String(summary.year), Number(summary.count ?? 0)]));
  const weakYears = [];

  if (Number.isFinite(firstYear) && Number.isFinite(latestYear)) {
    for (let year = firstYear; year <= latestYear; year += 1) {
      const key = String(year);
      const count = yearsWithCaptures.get(key) ?? 0;
      if (count === 0) {
        weakYears.push({ year: key, count, reason: "No homepage capture found for this year." });
      } else if (count === 1) {
        weakYears.push({ year: key, count, reason: "Only one unique homepage capture found for this year." });
      }
    }
  }

  const archiveProfile = adaptiveArchiveProfile({ depthMode, discovery: { ...discovery, captureCount } });
  const failedQueryCount = Array.isArray(discovery?.variantStatus)
    ? discovery.variantStatus.filter((status) => status.status === "failed").length
    : 0;
  const fallbackQueryCount = Array.isArray(discovery?.variantStatus)
    ? discovery.variantStatus.filter((status) => status.fallback).length
    : 0;
  const warnings = [];
  const captureYearCount = yearSummary.length;
  const yearSpan =
    Number.isFinite(firstYear) && Number.isFinite(latestYear)
      ? Math.max(0, latestYear - firstYear + 1)
      : captureYearCount;

  if (captureCount === 0) {
    warnings.push("No usable homepage captures were found before rendering.");
  } else if (captureYearCount < 3) {
    warnings.push("Thin archive: fewer than three capture years were found.");
  }

  if (weakYears.length > 0) {
    warnings.push(`${weakYears.length} weak ${weakYears.length === 1 ? "year" : "years"} may produce a sparse timeline.`);
  }

  if (uniqueDigests.size > 0 && captureCount >= 5 && uniqueDigests.size / captureCount <= 0.5) {
    warnings.push("Duplicate-heavy archive: repeated digests suggest parked, placeholder, or unchanged pages may dominate.");
  }

  if (failedQueryCount > 0 || fallbackQueryCount > 0 || discovery?.warning) {
    warnings.push("Wayback query instability was detected; the run may need retries or narrower targeting.");
  }

  if (yearSpan > captureYearCount && captureYearCount > 0) {
    warnings.push("Archive coverage has gaps between the first and latest capture years.");
  }

  return {
    host: discovery?.host ?? "",
    firstCaptureDate: firstTimestamp ? timestampDate(firstTimestamp) : null,
    latestCaptureDate: latestTimestamp ? timestampDate(latestTimestamp) : null,
    captureCount,
    captureYearCount,
    yearSpan,
    uniqueDigestCount: uniqueDigests.size,
    candidateCount: Array.isArray(discovery?.candidates) ? discovery.candidates.length : 0,
    estimatedRunSize: archiveProfile.archiveSize,
    recommendedDepthMode: archiveProfile.depthMode,
    recommendedScreenshotLimit: archiveProfile.screenshotLimit,
    weakYears,
    warnings,
    archiveProfile
  };
}

export function buildArchiveInspection(reportTarget, discovery, pathCaptures, { depthMode = "adaptive" } = {}) {
  const target = typeof reportTarget === "string" ? normalizeReportTarget(reportTarget) : reportTarget;
  return {
    preflight: buildArchivePreflight(discovery, { depthMode }),
    pathDiscovery: buildArchivedPathSuggestions(target, pathCaptures)
  };
}

function normalizeOriginalCapturePath(original) {
  try {
    const withScheme = /^https?:\/\//i.test(original) ? original : `https://${original}`;
    const url = new URL(withScheme);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let pathname = url.pathname || "/";
    try {
      pathname = decodeURI(pathname);
    } catch {
      // Keep URL-normalized escapes for malformed historical paths.
    }
    pathname = pathname.replace(/\/{2,}/g, "/");
    if (pathname.length > 1) {
      pathname = pathname.replace(/\/+$/g, "");
    }
    return { hostname, pathname };
  } catch {
    return null;
  }
}

function isLikelyUsefulArchivedPath(pathname) {
  if (!pathname || !pathname.startsWith("/") || pathname.length > 180) {
    return false;
  }
  if (pathname.includes("\\")) {
    return false;
  }
  if (/\.(?:css|js|mjs|map|json|xml|txt|png|jpe?g|gif|webp|svg|ico|bmp|avif|woff2?|ttf|eot|mp[34]|mov|avi|zip|gz|rar|7z|pdf|docx?|xlsx?|pptx?)$/i.test(pathname)) {
    return false;
  }
  if (pathname.split("/").filter(Boolean).length > 4) {
    return false;
  }
  return true;
}

function archivedPathPriority(pathname) {
  const lowerPath = pathname.toLowerCase();
  const priorities = new Map([
    ["/", 100],
    ["/index.html", 90],
    ["/index.htm", 89],
    ["/home.html", 84],
    ["/home.htm", 83],
    ["/home", 82],
    ["/main.asp", 66],
    ["/default.asp", 65],
    ["/index.asp", 64],
    ["/about", 70],
    ["/about.html", 69],
    ["/about.htm", 68]
  ]);
  if (priorities.has(lowerPath)) {
    return priorities.get(lowerPath);
  }
  if (/\/(?:main|home|index|default)\.(?:asp|aspx|php|html?)$/i.test(pathname)) {
    return 58;
  }
  if (/\/(?:about|news|blog|welcome|portal|start)(?:\/|$|\.)/i.test(pathname)) {
    return 46;
  }
  return 30;
}

export function buildArchivedPathSuggestions(reportTarget, captures, { limit = 12 } = {}) {
  const target = typeof reportTarget === "string" ? normalizeReportTarget(reportTarget) : reportTarget;
  const buckets = new Map();

  for (const capture of Array.isArray(captures) ? captures : []) {
    if (!capture?.timestamp || !capture?.original) {
      continue;
    }
    const normalized = normalizeOriginalCapturePath(capture.original);
    if (!normalized || normalized.hostname !== target.domain || !isLikelyUsefulArchivedPath(normalized.pathname)) {
      continue;
    }

    const bucket = buckets.get(normalized.pathname) ?? {
      path: normalized.pathname,
      target: normalized.pathname === "/" ? target.domain : `${target.domain}${normalized.pathname}`,
      captureCount: 0,
      years: new Set(),
      digests: new Set(),
      firstTimestamp: capture.timestamp,
      lastTimestamp: capture.timestamp,
      sampleOriginal: capture.original
    };
    bucket.captureCount += 1;
    bucket.years.add(capture.timestamp.slice(0, 4));
    if (capture.digest) {
      bucket.digests.add(capture.digest);
    }
    if (capture.timestamp < bucket.firstTimestamp) {
      bucket.firstTimestamp = capture.timestamp;
      bucket.sampleOriginal = capture.original;
    }
    if (capture.timestamp > bucket.lastTimestamp) {
      bucket.lastTimestamp = capture.timestamp;
    }
    buckets.set(normalized.pathname, bucket);
  }

  const pathLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : 12;
  const paths = [...buckets.values()]
    .map((bucket) => {
      const yearCount = bucket.years.size;
      const uniqueDigestCount = bucket.digests.size;
      const score =
        archivedPathPriority(bucket.path) +
        Math.min(bucket.captureCount, 3) +
        Math.min(yearCount, 3) +
        Math.min(uniqueDigestCount, 2);
      return {
        path: bucket.path,
        target: bucket.target,
        captureCount: bucket.captureCount,
        yearCount,
        uniqueDigestCount,
        firstCaptureDate: timestampDate(bucket.firstTimestamp),
        latestCaptureDate: timestampDate(bucket.lastTimestamp),
        sampleOriginal: bucket.sampleOriginal,
        calendarUrl: `https://web.archive.org/web/*/${bucket.target === target.domain ? `${target.domain}/` : bucket.target}`,
        score,
        reason:
          bucket.path === "/"
            ? "Homepage captures."
            : archivedPathPriority(bucket.path) >= 58
            ? "Likely historical entry point."
            : "Archived content path."
      };
    })
    .sort((a, b) => b.score - a.score || b.captureCount - a.captureCount || a.path.localeCompare(b.path))
    .slice(0, pathLimit);

  return {
    host: target.domain,
    target: target.target,
    paths
  };
}

function createQueuedReportJob({
  host,
  screenshotLimit,
  depthMode = "adaptive",
  archiveMode = "best-year",
  notifyEmail,
  version = 1,
  message = "Report job created."
}) {
  const now = new Date().toISOString();
  const id = randomUUID();
  const normalizedDepthMode = normalizeDepthMode(depthMode);
  return {
    id,
    storageKey: createReportStorageKey(host, id),
    target: host,
    host,
    version,
    depthMode: normalizedDepthMode,
    archiveMode: normalizeArchiveMode(archiveMode),
    screenshotLimit,
    archiveProfile: null,
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

export function waybackReplayUrlVariants(timestamp, original) {
  return [
    `https://web.archive.org/web/${timestamp}if_/${original}`,
    `https://web.archive.org/web/${timestamp}id_/${original}`,
    `https://web.archive.org/web/${timestamp}/${original}`
  ];
}

export function shouldUseCdpScreenshotFallback(error) {
  return /page\.screenshot:[\s\S]*Timeout[\s\S]*waiting for fonts to load/i.test(errorMessage(error));
}

export function shouldRetryReplayNavigation(error) {
  return /page\.goto:[\s\S]*(net::ERR_CONNECTION_REFUSED|net::ERR_HTTP2_SERVER_REFUSED_STREAM|Timeout \d+ms exceeded)/i.test(
    errorMessage(error)
  );
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

function reportOutputDir(job) {
  return path.join(generatedRoot, "reports", reportStorageKey(job));
}

function reportJobFile(job) {
  return path.join(reportOutputDir(job), "job.json");
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

  if (process.env.RETROSITE_USE_BUNDLED_CHROMIUM === "1") {
    return chromium.executablePath();
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

export function cdxFallbackWindows({
  fromYear = cdxFallbackStartYear,
  toYear = new Date().getUTCFullYear(),
  windowYears = cdxFallbackWindowYears
} = {}) {
  const startYear = Number.isFinite(Number(fromYear)) ? Number(fromYear) : 1996;
  const endYear = Number.isFinite(Number(toYear)) ? Number(toYear) : new Date().getUTCFullYear();
  const span = Math.max(1, Number.isFinite(Number(windowYears)) ? Number(windowYears) : 5);
  const windows = [];

  for (let from = startYear; from <= endYear; from += span) {
    const to = Math.min(from + span - 1, endYear);
    windows.push({
      from: String(from),
      to: String(to)
    });
  }

  return windows;
}

export function cdxFallbackQueryWindows({
  fromYear = cdxFallbackStartYear,
  toYear = new Date().getUTCFullYear(),
  windowYears = cdxFallbackWindowYears,
  limit = cdxFallbackLimit,
  maxQueries = cdxFallbackMaxQueries
} = {}) {
  const queries = [
    { limit },
    ...cdxFallbackWindows({ fromYear, toYear, windowYears }).map((window) => ({
      ...window,
      limit
    }))
  ];
  const max = Math.max(1, Number.isFinite(Number(maxQueries)) ? Number(maxQueries) : queries.length);
  return queries.slice(0, max);
}

export function cdxQueryParams(urlPattern, window = null, options = {}) {
  const matchType = options.matchType ?? "exact";
  const params = new URLSearchParams({
    url: urlPattern,
    matchType,
    output: "json",
    fl: "timestamp,original,statuscode,mimetype,digest"
  });
  params.append("filter", "statuscode:200");
  params.append("filter", "mimetype:text/html");
  params.append("collapse", "digest");
  if (options.collapseByYear) {
    params.append("collapse", "timestamp:4");
  }
  if (options.collapseByUrlKey) {
    params.append("collapse", "urlkey");
  }
  if (window?.from) {
    params.set("from", window.from);
  }
  if (window?.to) {
    params.set("to", window.to);
  }
  if (window?.limit) {
    params.set("limit", String(window.limit));
  }
  return params;
}

function normalizeCdxStrategy(strategyOrVariant) {
  return typeof strategyOrVariant === "string"
    ? {
        variant: strategyOrVariant,
        matchType: "exact",
        collapseByYear: false,
        broad: false
      }
    : {
        matchType: "exact",
        collapseByYear: false,
        broad: false,
        ...strategyOrVariant
      };
}

function cdxWindowForStrategy(strategy, window = null) {
  if (window) {
    return {
      ...window,
      limit: window.limit ?? strategy.limit
    };
  }
  return strategy.limit ? { limit: strategy.limit } : null;
}

export function parseCdxCaptures(body, source = "Wayback CDX") {
  const text = String(body ?? "").trim();
  if (!text) {
    throw new Error(`${source} returned an empty response.`);
  }

  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    throw new Error(`${source} returned malformed JSON.`);
  }

  if (!Array.isArray(rows)) {
    throw new Error(`${source} returned an unexpected response.`);
  }

  if (rows.length < 2) {
    return [];
  }

  const [header, ...captures] = rows;
  if (!Array.isArray(header)) {
    throw new Error(`${source} returned an unexpected response.`);
  }

  return captures
    .filter((row) => Array.isArray(row))
    .map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]])));
}

async function queryCdxOnce(strategyOrVariant, window = null) {
  const strategy = normalizeCdxStrategy(strategyOrVariant);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cdxTimeoutMs);
  const params = cdxQueryParams(strategy.variant, cdxWindowForStrategy(strategy, window), strategy);
  const range = window ? ` (${window.from ?? "start"}-${window.to ?? "latest"})` : "";
  try {
    const response = await fetch(`https://web.archive.org/cdx/?${params.toString()}`, {
      headers: { "user-agent": "Retrosite discovery prototype" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Wayback CDX returned ${response.status}`);
    }

    return parseCdxCaptures(await response.text(), `Wayback CDX for ${strategy.variant}${range}`);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Wayback CDX timed out for ${strategy.variant}${range}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function queryCdxFallbackWindows(strategyOrVariant, broadError) {
  const strategy = normalizeCdxStrategy(strategyOrVariant);
  const windows = cdxFallbackQueryWindows();
  const windowResults = await mapWithConcurrency(windows, cdxConcurrency, async (window) => {
    let lastError = null;
    for (let attempt = 1; attempt <= cdxFallbackRetryCount + 1; attempt += 1) {
      try {
        const captures = await queryCdxOnce(strategy, window);
        return {
          status: "ok",
          window,
          captureCount: captures.length,
          captures,
          error: null
        };
      } catch (error) {
        lastError = error;
        if (attempt <= cdxFallbackRetryCount) {
          await delay(cdxRetryDelayMs * attempt);
        }
      }
    }

    return {
      status: "failed",
      window,
      captureCount: 0,
      captures: [],
      error: errorMessage(lastError)
    };
  });

  const successes = windowResults.filter((result) => result.status === "ok");
  if (successes.length === 0) {
    return null;
  }

  const failures = windowResults.filter((result) => result.status === "failed");
  const captureMap = new Map();
  for (const capture of successes.flatMap((result) => result.captures)) {
    captureMap.set(`${capture.timestamp}:${capture.original}`, capture);
  }
  const captures = [...captureMap.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    variant: strategy.variant,
    matchType: strategy.matchType,
    broad: strategy.broad,
    collapseByYear: strategy.collapseByYear,
    status: "ok",
    attempts: cdxRetryCount + 1 + windows.length,
    captureCount: captures.length,
    captures,
    error:
      failures.length > 0
        ? `Broad query failed (${errorMessage(broadError)}). ${failures.length} fallback CDX queries also failed.`
        : `Broad query failed (${errorMessage(broadError)}). Retrosite recovered with bounded CDX fallback queries.`,
    fallback: true
  };
}

async function queryCdx(strategyOrVariant) {
  const strategy = normalizeCdxStrategy(strategyOrVariant);
  let lastError = null;
  for (let attempt = 1; attempt <= cdxRetryCount + 1; attempt += 1) {
    try {
      const captures = await queryCdxOnce(strategy);
      return {
        variant: strategy.variant,
        matchType: strategy.matchType,
        broad: strategy.broad,
        collapseByYear: strategy.collapseByYear,
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

  const fallbackResult = await queryCdxFallbackWindows(strategy, lastError);
  if (fallbackResult) {
    return fallbackResult;
  }

  return {
    variant: strategy.variant,
    matchType: strategy.matchType,
    broad: strategy.broad,
    collapseByYear: strategy.collapseByYear,
    status: "failed",
    attempts: cdxRetryCount + 1,
    captureCount: 0,
    captures: [],
    error: errorMessage(lastError)
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
  const digestByYear = new Map();
  for (const capture of captures) {
    const year = capture.timestamp.slice(0, 4);
    if (capture.digest) {
      const yearDigestKey = `${year}:${capture.digest}`;
      if (digestByYear.has(yearDigestKey)) {
        continue;
      }
      digestByYear.set(yearDigestKey, true);
    }
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
  return discoverCapturesWithMode(target);
}

async function discoverCapturesWithMode(target, { archiveMode = "best-year" } = {}) {
  const reportTarget = normalizeReportTarget(target);
  const host = reportTarget.target;
  const variants = waybackQueryVariantsForTarget(reportTarget);
  const normalizedArchiveMode = normalizeArchiveMode(archiveMode);
  const exactStrategies = waybackQueryStrategiesForTarget(reportTarget, { archiveMode: normalizedArchiveMode });

  let variantResults = await mapWithConcurrency(exactStrategies, cdxConcurrency, queryCdx);
  let successes = variantResults.filter((result) => result.status === "ok");

  const exactCaptureMap = new Map();
  for (const capture of successes.flatMap((result) => result.captures)) {
    exactCaptureMap.set(`${capture.timestamp}:${capture.original}`, capture);
  }
  const exactCaptures = [...exactCaptureMap.values()];
  const exactYearSummary = summarizeCaptures(exactCaptures);

  if (normalizedArchiveMode === "best-year" && (successes.length === 0 || shouldBroadenDiscovery(exactCaptures, exactYearSummary))) {
    const broadStrategies = waybackQueryStrategiesForTarget(reportTarget, {
      archiveMode: normalizedArchiveMode,
      includeBroad: true
    }).filter((strategy) => strategy.broad);
    const broadResults = await mapWithConcurrency(broadStrategies, cdxConcurrency, queryCdx);
    variantResults = [...variantResults, ...broadResults];
    successes = variantResults.filter((result) => result.status === "ok");
  }

  const failures = variantResults.filter((result) => result.status === "failed");
  const fallbackRecoveries = successes.filter((result) => result.fallback);

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
      failures.length > 0 || fallbackRecoveries.length > 0
        ? [
            failures.length > 0
              ? `${failures.length} Wayback variant ${failures.length === 1 ? "query" : "queries"} failed`
              : null,
            fallbackRecoveries.length > 0
              ? `${fallbackRecoveries.length} Wayback variant ${fallbackRecoveries.length === 1 ? "query was" : "queries were"} recovered with year-window fallback`
              : null
          ].filter(Boolean).join("; ") + ", but Retrosite continued with the captures it could retrieve."
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

function shouldBroadenDiscovery(captures, yearSummary) {
  if (captures.length === 0) {
    return true;
  }
  if (yearSummary.length < 5) {
    return true;
  }
  return captures.length < 12;
}

function reusableDiscoveryCaptureCount(discovery) {
  const captureCount = Number(discovery?.captureCount);
  if (Number.isFinite(captureCount) && captureCount > 0) {
    return captureCount;
  }
  return Array.isArray(discovery?.captures) ? discovery.captures.length : 0;
}

function normalizeReusableDiscovery(discovery, sourceJob, discoveryError) {
  const cachedDiscovery = JSON.parse(JSON.stringify(discovery));
  const captures = Array.isArray(cachedDiscovery.captures)
    ? cachedDiscovery.captures
        .filter((capture) => capture?.timestamp && capture?.original)
        .map((capture) => ({
          ...capture,
          date: capture.date ?? timestampDate(capture.timestamp),
          replayUrl: waybackReplayUrl(capture.timestamp, capture.original)
        }))
    : [];
  const candidates = Array.isArray(cachedDiscovery.candidates) && cachedDiscovery.candidates.length > 0
    ? cachedDiscovery.candidates
    : pickCandidateEras(captures);

  const reuseWarning = [
    `Reused cached Wayback discovery from report job ${sourceJob.id}`,
    sourceJob.updatedAt ? `updated ${sourceJob.updatedAt}` : null,
    `because live discovery failed: ${errorMessage(discoveryError)}`
  ].filter(Boolean).join(" ");

  return {
    ...cachedDiscovery,
    cachedFromJobId: sourceJob.id,
    cachedFromVersion: sourceJob.version ?? null,
    captureCount: reusableDiscoveryCaptureCount(cachedDiscovery),
    yearSummary: Array.isArray(cachedDiscovery.yearSummary) && cachedDiscovery.yearSummary.length > 0
      ? cachedDiscovery.yearSummary
      : summarizeCaptures(captures),
    candidates: candidates.map((candidate) => ({
      ...candidate,
      date: candidate.date ?? timestampDate(candidate.timestamp),
      replayUrl: candidate.replayUrl ?? waybackReplayUrl(candidate.timestamp, candidate.original)
    })),
    captures,
    warning: [cachedDiscovery.warning, reuseWarning].filter(Boolean).join(" ")
  };
}

function jobTargetKey(job) {
  try {
    return normalizeReportTarget(job?.target ?? job?.host ?? "").target;
  } catch {
    return null;
  }
}

export function findReusableDiscoveryForJob(job, jobs = reportJobs.values(), discoveryError = null) {
  const targetKey = jobTargetKey(job);
  if (!targetKey) {
    return null;
  }

  const reusableJobs = [...jobs]
    .filter((candidateJob) =>
      candidateJob?.id !== job?.id &&
      jobTargetKey(candidateJob) === targetKey &&
      reusableDiscoveryCaptureCount(candidateJob.discovery) > 0
    )
    .sort((a, b) => {
      const timeDiff = Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "");
      if (Number.isFinite(timeDiff) && timeDiff !== 0) {
        return timeDiff;
      }
      return (b.version ?? 0) - (a.version ?? 0);
    });

  const sourceJob = reusableJobs[0];
  if (!sourceJob) {
    return null;
  }

  return normalizeReusableDiscovery(sourceJob.discovery, sourceJob, discoveryError);
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
      notes: "",
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
    notes: visibleEntryNotes(entry.notes)
  };
}

function visualEraKey(entry) {
  const core = entry.techStack.split(" · ")[0];
  const parts = core.split(",").map((s) => s.trim());
  const cms = parts.find((p) => /^(WordPress|Squarespace|Wix|Webflow|FrontPage|Classic ASP|Static HTML)/i.test(p)) ?? "";
  const theme = parts.find((p) => /^theme:/i.test(p) || /\btheme$/i.test(p)) ?? "";
  if (!theme) return null;
  return `${cms.replace(/\s+\d.*$/, "")}|${theme}`.toLowerCase();
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
  job.report.generatedReportUrl = timelineRoutePath(job.host);
  job.report.generatedShareUrl = `${timelineRoutePath(job.host)}/share`;
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
    notes: "",
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
  const discoveredYearCount = Number(job.report?.stats?.yearCount);
  const possibleCount = Math.min(
    normalizeScreenshotLimit(job.screenshotLimit),
    job.report?.stats?.candidateCount ?? job.report?.entries?.length ?? 0,
    Number.isFinite(discoveredYearCount) && discoveredYearCount > 0 ? discoveredYearCount : Infinity
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
  if ((job.status !== "complete" && job.status !== "incomplete") || !job.report) {
    return false;
  }

  const patch = reportCompletionPatch(job);
  if (patch.status === job.status && patch.stage === job.stage) {
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
  const screenshotUrl = `/generated/reports/${reportStorageKey(job)}/screenshots/${filename}`;

  try {
    const renderResult = await renderEntryScreenshotFile({ page, entry, filePath });
    const { diagnostics, screenshot, visuals, source } = renderResult;

    const techStackResult = await inferTechStack(page).catch(() => null);

    entry.screenshotStatus = "rendered";
    entry.source = source;
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

function replaySourcesForEntry(entry) {
  const sources = [entry.source, ...waybackReplayUrlVariants(entry.timestamp, entry.original)];
  return [...new Set(sources.filter(Boolean))];
}

async function capturePageScreenshot(page, filePath) {
  try {
    await page.screenshot({ path: filePath, fullPage: true, timeout: 15000 });
    return "playwright";
  } catch (error) {
    if (!shouldUseCdpScreenshotFallback(error)) {
      throw error;
    }
    const session = await page.context().newCDPSession(page);
    try {
      const result = await session.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        fromSurface: true
      });
      await writeFile(filePath, Buffer.from(result.data, "base64"));
      return "cdp";
    } finally {
      await session.detach().catch(() => undefined);
    }
  }
}

async function gotoReplaySource(page, source) {
  const maxAttempts = Math.max(
    1,
    (Number.isFinite(renderNavigationRetryCount) ? Math.max(Math.round(renderNavigationRetryCount), 0) : 2) + 1
  );
  const retryDelayMs = Number.isFinite(renderNavigationRetryDelayMs)
    ? Math.max(Math.round(renderNavigationRetryDelayMs), 250)
    : 1800;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(source, {
        waitUntil: "domcontentloaded",
        timeout: 25000
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetryReplayNavigation(error)) {
        throw error;
      }
      await delay(retryDelayMs * attempt);
    }
  }

  throw lastError;
}

async function renderEntryScreenshotFile({ page, entry, filePath }) {
  const errors = [];
  for (const source of replaySourcesForEntry(entry)) {
    try {
      await gotoReplaySource(page, source);
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
      const diagnostics = await collectRenderDiagnostics(page);
      const screenshotMethod = await capturePageScreenshot(page, filePath);
      const screenshot = await analyzeScreenshot(filePath);
      const visuals = await scoreScreenshotVisuals(filePath);
      return {
        source,
        diagnostics: {
          ...diagnostics,
          screenshotMethod
        },
        screenshot,
        visuals
      };
    } catch (error) {
      errors.push(`${source}: ${errorMessage(error)}`);
    }
  }

  throw new Error(errors.join("; "));
}

async function renderReportScreenshots(job) {
  const executablePath = chromeExecutablePath();
  const screenshotDir = path.join(reportOutputDir(job), "screenshots");
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
  if (job.report) {
    job.report.generatedReportUrl = timelineRoutePath(job.host);
    job.report.generatedShareUrl = `${timelineRoutePath(job.host)}/share`;
  }
  return {
    id: job.id,
    storageKey: job.storageKey ?? null,
    target: job.target,
    host: job.host,
    version: job.version ?? 1,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    depthMode: normalizeDepthMode(job.depthMode),
    archiveMode: normalizeArchiveMode(job.archiveMode),
    screenshotLimit: normalizeScreenshotLimit(job.screenshotLimit),
    archiveProfile: job.archiveProfile ?? null,
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

function reportThumbnailEntry(job) {
  const report = job.report;
  const entries = [...(report?.curatedEntries ?? []), ...(report?.entries ?? [])];
  const thumbnailKey = report?.thumbnailEntryKey ?? "";
  return entries.find((entry) => thumbnailKey && entryKey(entry) === thumbnailKey && entry.screenshotUrl)
    ?? entries.find((entry) => entry.screenshotUrl)
    ?? null;
}

function publicJobSummary(job) {
  normalizeReportReadiness(job);
  const renderedEntry = reportThumbnailEntry(job);

  return {
    id: job.id,
    storageKey: job.storageKey ?? null,
    target: job.target,
    host: job.host,
    version: job.version ?? 1,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    depthMode: normalizeDepthMode(job.depthMode),
    archiveMode: normalizeArchiveMode(job.archiveMode),
    screenshotLimit: normalizeScreenshotLimit(job.screenshotLimit),
    archiveProfile: job.archiveProfile ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    generatedReportUrl: timelineRoutePath(job.host),
    generatedShareUrl: `${timelineRoutePath(job.host)}/share`,
    stats: job.report?.stats ?? null,
    error: job.error,
    thumbnailUrl: renderedEntry?.screenshotUrl ?? job.report?.thumbnailUrl ?? null,
    notifyEmail: job.notifyEmail ?? null,
    notificationStatus: job.notificationStatus ?? (job.notifyEmail ? "captured" : "not_requested"),
    ...queueMetadata(job)
  };
}

function normalizeStaticTimelineSummary(timeline) {
  if (!timeline?.host) {
    return null;
  }

  const host = String(timeline.host);
  return {
    id: String(timeline.id ?? timeline.storageKey ?? host),
    storageKey: timeline.storageKey ?? host,
    target: timeline.target ?? host,
    host,
    version: Number(timeline.version ?? 1),
    status: timeline.status === "incomplete" ? "incomplete" : "complete",
    stage: timeline.stage ?? "complete",
    progress: Number(timeline.progress ?? 100),
    message: timeline.message ?? "Bundled starter timeline.",
    depthMode: normalizeDepthMode(timeline.depthMode),
    archiveMode: normalizeArchiveMode(timeline.archiveMode),
    screenshotLimit: normalizeScreenshotLimit(timeline.screenshotLimit),
    archiveProfile: timeline.archiveProfile ?? null,
    createdAt: timeline.createdAt ?? timeline.updatedAt ?? new Date(0).toISOString(),
    updatedAt: timeline.updatedAt ?? timeline.createdAt ?? new Date(0).toISOString(),
    generatedReportUrl: timelineRoutePath(host),
    generatedShareUrl: `${timelineRoutePath(host)}/share`,
    stats: timeline.stats ?? null,
    error: timeline.error ?? null,
    thumbnailUrl: timeline.thumbnailUrl ?? null,
    notifyEmail: null,
    notificationStatus: "not_requested",
    ...queueSummary(),
    queuePosition: null,
    isActiveJob: false
  };
}

async function loadStaticTimelineSummaries() {
  if (!includeStaticTimelineSummaries()) {
    return [];
  }

  try {
    const index = JSON.parse(await readFile(path.join(staticTimelinesRoot, "index.json"), "utf8"));
    return (Array.isArray(index.timelines) ? index.timelines : [])
      .map(normalizeStaticTimelineSummary)
      .filter(Boolean);
  } catch {
    return [];
  }
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

function cleanOptionalEditableText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function visibleEntryNotes(notes) {
  const cleaned = String(notes ?? "").trim();
  if (!cleaned) return "";

  const generatedNotePatterns = [
    /^Rendered candidate selected for the generated draft report\.$/i,
    /^Rendered, but flagged for review:/i,
    /^Replacement capture selected after the first \d{4} render looked weak\.$/i,
    /^Default alternate note\.$/i
  ];

  return generatedNotePatterns.some((pattern) => pattern.test(cleaned)) ? "" : cleaned;
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
    const notes = visibleEntryNotes(entry.notes);
    lines.push(
      `### ${entry.date}: ${entry.techStack}`,
      "",
      screenshotPath ? `![${entry.date} ${entry.title}](${screenshotPath})` : "_No exported screenshot file was available for this entry._",
      "",
      `- Tech stack / title: ${entry.techStack}`,
      `- Source: [Wayback capture](${entry.source})`,
      ""
    );
    if (notes) {
      lines.push(notes, "");
    }
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
    notes: visibleEntryNotes(entry.notes),
    techStack: entry.techStack,
    source: entry.source,
    imageUrl: screenshotPathsByEntry.get(entryKey(entry)) ?? null
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
    .timeline-entry-notes { grid-column: 1 / -1; margin: .25rem 0 0; color: var(--muted); line-height: 1.5; }
    a { color: var(--ink); font-weight: 950; }
    .screenshot-frame { position: relative; display: block; width: 100%; height: clamp(26rem, 64vh, 42rem); border: 0; border-top: 1px solid var(--ink); padding: 0; background: #061d33; overflow: hidden; cursor: zoom-in; text-align: left; }
    .screenshot-frame img { display: block; width: 100%; height: auto; background: #061d33; }
    .screenshot-frame::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 5rem; pointer-events: none; background: linear-gradient(180deg, transparent, #061d33); opacity: .72; }
    .screenshot-frame-hint { position: absolute; right: .85rem; bottom: .85rem; z-index: 1; display: inline-flex; align-items: center; gap: .35rem; border: 1px solid var(--ink); padding: .45rem .6rem; background: var(--signal); color: var(--ink); font-size: .85rem; font-weight: 950; }
    .screenshot-modal { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: clamp(1rem, 3vw, 2rem); background: #05080dcc; }
    .screenshot-modal[hidden] { display: none; }
    .screenshot-modal-panel { width: min(96vw, 110rem); max-height: 92vh; border: 1px solid var(--ink); background: var(--paper); box-shadow: .45rem .45rem 0 var(--red); overflow: hidden; }
    .screenshot-modal-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .85rem 1rem; border-bottom: 1px solid var(--ink); background: #fff9ee; }
    .screenshot-modal-header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--navy); }
    .screenshot-modal-close { border: 1px solid var(--ink); padding: .45rem .7rem; background: var(--navy); color: #f7f0e2; font-weight: 950; }
    .screenshot-modal-scroll { max-height: calc(92vh - 3.5rem); overflow: auto; background: #061d33; }
    .screenshot-modal-scroll img { display: block; width: 100%; height: auto; margin: 0 auto; }
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
      var state = { activeIndex: 0, displayMode: "timeline" };
      var nav = document.querySelector(".timeline-nav");
      var detail = document.querySelector(".timeline-detail");
      var modal = null;

      function summarizeTechStack(techStack) {
        var core = String(techStack || "").split(String.fromCharCode(183))[0].trim();
        var parts = core.split(",").map(function (part) { return part.trim(); }).filter(Boolean);
        var cms = parts.find(function (part) { return /^(WordPress|Squarespace|Wix|Webflow|FrontPage|Classic ASP|Static HTML)/i.test(part); });
        var theme = parts.find(function (part) { return /^theme:/i.test(part) || /\btheme$/i.test(part); });
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
          button.setAttribute("aria-label", entry.date.slice(0, 4) + " " + entry.techStack);
          button.addEventListener("click", function () {
            state.activeIndex = index;
            closeModal();
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
        appendTextElement(tech, "dt", "Tech stack / title");
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
        if (entry.notes) {
          appendTextElement(copy, "p", entry.notes, "timeline-entry-notes");
        }
        detail.appendChild(copy);

        if (entry.imageUrl) {
          var frame = document.createElement("button");
          frame.type = "button";
          frame.className = "screenshot-frame";
          frame.setAttribute("aria-label", "View full screenshot for " + entry.date);
          var image = document.createElement("img");
          image.src = entry.imageUrl;
          image.alt = entry.date + " " + entry.techStack;
          var hint = document.createElement("span");
          hint.className = "screenshot-frame-hint";
          hint.textContent = "View full";
          frame.appendChild(image);
          frame.appendChild(hint);
          frame.addEventListener("click", function () {
            openModal(entry);
          });
          detail.appendChild(frame);
        } else {
          appendTextElement(detail, "div", "No exported screenshot file was available for this entry.", "empty-image");
        }
      }

      function closeModal() {
        if (modal) {
          modal.remove();
          modal = null;
          document.body.style.overflow = "";
        }
      }

      function openModal(entry) {
        closeModal();
        modal = document.createElement("div");
        modal.className = "screenshot-modal";
        modal.addEventListener("click", closeModal);

        var panel = document.createElement("div");
        panel.className = "screenshot-modal-panel";
        panel.addEventListener("click", function (event) {
          event.stopPropagation();
        });

        var header = document.createElement("div");
        header.className = "screenshot-modal-header";
        appendTextElement(header, "strong", entry.date + " " + entry.techStack);
        var close = document.createElement("button");
        close.type = "button";
        close.className = "screenshot-modal-close";
        close.textContent = "Close";
        close.addEventListener("click", closeModal);
        header.appendChild(close);

        var scroll = document.createElement("div");
        scroll.className = "screenshot-modal-scroll";
        var image = document.createElement("img");
        image.src = entry.imageUrl;
        image.alt = entry.date + " " + entry.techStack;
        scroll.appendChild(image);

        panel.appendChild(header);
        panel.appendChild(scroll);
        modal.appendChild(panel);
        document.body.appendChild(modal);
        document.body.style.overflow = "hidden";
      }

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeModal();
      });

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
  const outputDir = reportOutputDir(job);
  const outputFile = reportJobFile(job);
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

          if (!job.storageKey && !job.storageSlug && entry.name !== job.id) {
            job.storageKey = entry.name;
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

    let discovery;
    try {
      discovery = await discoverCapturesWithMode(job.target, { archiveMode: job.archiveMode });
    } catch (error) {
      const reusableDiscovery = findReusableDiscoveryForJob(job, reportJobs.values(), error);
      if (!reusableDiscovery) {
        throw error;
      }
      discovery = reusableDiscovery;
    }
    if (canceledReportJob(job)) {
      return;
    }
    if (discovery.captureCount === 0) {
      throw new Error("No captures were found for this report target.");
    }

    const archiveProfile = adaptiveArchiveProfile({ depthMode: job.depthMode, discovery });
    job.screenshotLimit = archiveProfile.screenshotLimit;

    updateJob(job, {
      host: discovery.host,
      discovery,
      archiveProfile,
      stage: "selecting",
      progress: 60,
      message: discovery.warning
        ? `Found ${discovery.captureCount} captures across ${discovery.yearSummary.length} years. ${archiveProfile.reason} ${discovery.warning}`
        : `Found ${discovery.captureCount} captures across ${discovery.yearSummary.length} years. ${archiveProfile.reason}`
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

  const generatedSummaries = [...latestByDomain.values()].map(publicJobSummary);
  const generatedHosts = new Set(generatedSummaries.map((job) => job.host));
  const staticSummaries = (await loadStaticTimelineSummaries())
    .filter((job) => !generatedHosts.has(job.host));

  let jobs = [...generatedSummaries, ...staticSummaries]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  if (search) {
    jobs = jobs.filter((job) => job.host.toLowerCase().includes(search));
  }

  const total = jobs.length;
  const paged = jobs.slice(offset, offset + limit);

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

    const requestedDepthMode = normalizeDepthMode(request.body?.depthMode);
    const requestedArchiveMode = normalizeArchiveMode(request.body?.archiveMode);
    const requestedScreenshotLimit =
      request.body?.screenshotLimit == null
        ? depthScreenshotLimit(requestedDepthMode)
        : normalizeScreenshotLimit(request.body?.screenshotLimit);
    const notifyEmail = normalizeNotifyEmail(request.body?.notifyEmail);
    const job = createQueuedReportJob({
      host,
      screenshotLimit: requestedScreenshotLimit,
      depthMode: requestedDepthMode,
      archiveMode: requestedArchiveMode,
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

app.get("/api/reports/:id", async (request, response) => {
  const key = request.params.id;
  const normalizedKey = key === "krynsky-com" ? "krynsky.com" : key;

  await refreshPersistedJobsForExternalRunner();
  const version = request.query.version ? Number(request.query.version) : undefined;

  const job = findJobByIdOrDomain(normalizedKey, version);
  if (!job) {
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
    depthMode: normalizeDepthMode(job.depthMode),
    screenshotLimit: normalizeScreenshotLimit(job.screenshotLimit),
    archiveProfile: job.archiveProfile ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    entryCount: job.report?.curatedEntries?.length ?? 0
  }));

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
    screenshotLimit: depthScreenshotLimit("adaptive"),
    depthMode: "adaptive",
    archiveMode: normalizeArchiveMode(latestJob.archiveMode),
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

  const outputDir = reportOutputDir(job);
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
    depthMode: normalizeDepthMode(sourceJob.depthMode),
    archiveMode: normalizeArchiveMode(sourceJob.archiveMode),
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
  const hasNotesEdit = Object.prototype.hasOwnProperty.call(body, "notes");
  const hasTechStackEdit = Object.prototype.hasOwnProperty.call(body, "techStack");
  const setThumbnail = body.thumbnail === true;
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

  if (!hasIncludedChange && !hasNotesEdit && !hasTechStackEdit && !setThumbnail) {
    response.status(400).json({ error: "Nothing to update for this report entry." });
    return;
  }

  if (hasNotesEdit) {
    renderedEntry.notes = cleanOptionalEditableText(body.notes, 500);
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
          replacement.title = existingYearEntry.title;
          if (!hasNotesEdit) {
            replacement.notes = visibleEntryNotes(existingYearEntry.notes);
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
    if (hasNotesEdit) {
      curatedEntry.notes = renderedEntry.notes;
    }
    if (hasTechStackEdit) {
      curatedEntry.techStack = renderedEntry.techStack;
    }
  }

  job.report.curatedEntries = curatedEntries.sort((a, b) => a.date.localeCompare(b.date));
  job.report.stats.selectedCount = job.report.curatedEntries.length;
  if (setThumbnail) {
    job.report.thumbnailEntryKey = targetKey;
    job.report.thumbnailUrl = null;
  }
  updateJob(job, {
    message: setThumbnail
      ? `Selected ${renderedEntry.date} as the ${job.host} timeline thumbnail.`
      : hasIncludedChange
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

app.get("/api/wayback/preflight", async (request, response) => {
  try {
    const target = String(request.query.url ?? "").trim();
    if (!target) {
      response.status(400).json({ error: "Missing url query parameter." });
      return;
    }

    const depthMode = normalizeDepthMode(request.query.depthMode);
    const archiveMode = normalizeArchiveMode(request.query.archiveMode);
    const reportTarget = normalizeReportTarget(target);
    let discovery;
    try {
      discovery = await discoverCapturesWithMode(reportTarget.target, { archiveMode });
    } catch (error) {
      const reusableDiscovery = findReusableDiscoveryForJob(
        { id: `preflight:${reportTarget.target}`, target: reportTarget.target, host: reportTarget.target },
        reportJobs.values(),
        error
      );
      if (!reusableDiscovery) {
        throw error;
      }
      discovery = reusableDiscovery;
    }
    response.json(buildArchivePreflight(discovery, { depthMode }));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected preflight error." });
  }
});

app.get("/api/wayback/inspect", async (request, response) => {
  try {
    const target = String(request.query.url ?? "").trim();
    if (!target) {
      response.status(400).json({ error: "Missing url query parameter." });
      return;
    }

    const depthMode = normalizeDepthMode(request.query.depthMode);
    const archiveMode = normalizeArchiveMode(request.query.archiveMode);
    const reportTarget = normalizeReportTarget(target);
    const discoveryPromise = discoverCapturesWithMode(reportTarget.target, { archiveMode }).catch((error) => {
      const reusableDiscovery = findReusableDiscoveryForJob(
        { id: `inspect:${reportTarget.target}`, target: reportTarget.target, host: reportTarget.target },
        reportJobs.values(),
        error
      );
      if (!reusableDiscovery) {
        throw error;
      }
      return reusableDiscovery;
    });
    const pathPromise = queryCdx(archivedPathDiscoveryStrategyForTarget(reportTarget));

    const [discovery, pathResult] = await Promise.all([discoveryPromise, pathPromise]);
    const payload = buildArchiveInspection(
      reportTarget,
      discovery,
      pathResult.status === "ok" ? pathResult.captures : [],
      { depthMode }
    );

    if (pathResult.status !== "ok") {
      payload.pathDiscoveryError = pathResult.error ?? "Unable to discover archived paths.";
    }

    response.json(payload);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected archive inspection error." });
  }
});

app.get("/api/wayback/paths", async (request, response) => {
  try {
    const target = String(request.query.url ?? "").trim();
    if (!target) {
      response.status(400).json({ error: "Missing url query parameter." });
      return;
    }

    const reportTarget = normalizeReportTarget(target);
    const pathStrategy = archivedPathDiscoveryStrategyForTarget(reportTarget);
    const result = await queryCdx(pathStrategy);
    if (result.status !== "ok") {
      response.status(500).json({ error: result.error ?? "Unable to discover archived paths." });
      return;
    }

    response.json(buildArchivedPathSuggestions(reportTarget, result.captures));
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected path discovery error." });
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
