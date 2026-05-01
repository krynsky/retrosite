import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..");
const generatedRoot = process.env.RETROSITE_GENERATED_ROOT
  ? path.resolve(process.env.RETROSITE_GENERATED_ROOT)
  : path.join(repoRoot, "server", "generated");
const reportsRoot = path.join(generatedRoot, "reports");
const publicTimelinesRoot = path.join(repoRoot, "krynsky-wayback", "timelines");

function usage() {
  console.error("Usage: npm run publish:timeline -- <job-id-or-target|krynsky-com-seed> [public-slug]");
  process.exit(1);
}

function sanitizeFilename(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "screenshot";
}

function publicTimelineJob(job, entries) {
  return {
    id: job.id,
    target: job.target,
    host: job.host,
    version: job.version ?? 1,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    screenshotLimit: job.screenshotLimit,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    events: [],
    discovery: null,
    report: {
      ...job.report,
      entries,
      curatedEntries: entries,
      generatedReportUrl: `/timeline/${encodeURIComponent(job.host)}`,
      generatedShareUrl: `/timeline/${encodeURIComponent(job.host)}/share`
    },
    error: job.error ?? null,
    notifyEmail: null,
    notificationStatus: "not_requested"
  };
}

async function readJob(jobDir) {
  const file = path.join(jobDir, "job.json");
  return JSON.parse(await readFile(file, "utf8"));
}

async function findJob(selector) {
  const dirs = await readdir(reportsRoot, { withFileTypes: true }).catch(() => []);
  const jobs = [];
  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue;
    try {
      jobs.push(await readJob(path.join(reportsRoot, dirent.name)));
    } catch {
      // Skip malformed local artifacts.
    }
  }

  const matches = jobs
    .filter((job) => job.id === selector || job.host === selector || job.target === selector)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return matches[0] ?? null;
}

async function readKrynskySeedTimeline() {
  const sourceFile = path.join(repoRoot, "src", "data", "krynskyTimeline.ts");
  const source = await readFile(sourceFile, "utf8");
  const executableSource = source
    .replace(/export type TimelineEntry = \{[\s\S]*?\};\s*/, "")
    .replace(/export const krynskyTimeline: TimelineEntry\[] =/, "const krynskyTimeline =");

  const context = {};
  return vm.runInNewContext(`${executableSource}\nkrynskyTimeline;`, context, {
    filename: sourceFile
  });
}

async function buildKrynskySeedJob() {
  const seedEntries = await readKrynskySeedTimeline();
  const first = seedEntries[0];
  const last = seedEntries[seedEntries.length - 1];
  const firstYear = first.date.slice(0, 4);
  const lastYear = last.date.slice(0, 4);
  const now = new Date().toISOString();
  const entries = seedEntries.map((entry) => ({
    timestamp: entry.source.match(/\/web\/(\d+)/)?.[1] ?? entry.date.replaceAll("-", ""),
    date: entry.date,
    title: entry.title,
    notes: entry.notes,
    techStack: entry.techStack,
    source: entry.source,
    original: entry.source,
    screenshotStatus: "ok",
    screenshotUrl: entry.image,
    screenshotError: null,
    screenshotQuality: null,
    replacementOf: null,
    replacementAttempts: [],
    focusScale: entry.focusScale,
    focusOrigin: entry.focusOrigin,
    focusHeight: entry.focusHeight
  }));

  return {
    id: "krynsky-com-seed",
    target: "https://krynsky.com",
    host: "krynsky.com",
    version: 1,
    status: "complete",
    stage: "complete",
    progress: 100,
    message: "",
    screenshotLimit: entries.length,
    createdAt: first.date,
    updatedAt: now,
    events: [],
    discovery: null,
    report: {
      title: "krynsky.com visual timeline",
      summary: "Hand-curated visual timeline from Wayback Machine captures.",
      publicationStatus: "published",
      publishedAt: now,
      stats: {
        captureCount: entries.length,
        candidateCount: entries.length,
        yearCount: entries.length,
        range: `${firstYear}-${lastYear}`,
        renderedCount: entries.length,
        usableRenderCount: entries.length,
        selectedCount: entries.length
      },
      entries,
      curatedEntries: entries,
      generatedReportUrl: "/timeline/krynsky.com",
      generatedShareUrl: "/timeline/krynsky.com/share"
    },
    error: null,
    notifyEmail: null,
    notificationStatus: "not_requested"
  };
}

function localScreenshotPath(job, screenshotUrl) {
  if (!screenshotUrl) return null;
  const prefix = `/generated/reports/${job.id}/`;
  if (!screenshotUrl.startsWith(prefix)) return null;
  return path.join(generatedRoot, "reports", job.id, screenshotUrl.slice(prefix.length));
}

async function main() {
  const selector = process.argv[2];
  if (!selector) usage();

  const job = selector === "krynsky-com-seed" || selector === "seed:krynsky.com"
    ? await buildKrynskySeedJob()
    : await findJob(selector);
  if (!job?.report) {
    throw new Error(`Could not find a generated report for "${selector}".`);
  }

  const slug = process.argv[3] || encodeURIComponent(job.host);
  const outDir = path.join(publicTimelinesRoot, slug);
  const screenshotsDir = path.join(outDir, "screenshots");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(screenshotsDir, { recursive: true });

  const sourceEntries = job.report.curatedEntries?.length ? job.report.curatedEntries : job.report.entries ?? [];
  const entries = [];
  for (const [index, entry] of sourceEntries.entries()) {
    let screenshotUrl = entry.screenshotUrl;
    const sourcePath = localScreenshotPath(job, screenshotUrl);
    if (sourcePath) {
      const ext = path.extname(sourcePath) || ".png";
      const filename = `${String(index + 1).padStart(2, "0")}-${sanitizeFilename(entry.date)}-${sanitizeFilename(entry.title)}${ext}`;
      await copyFile(sourcePath, path.join(screenshotsDir, filename));
      screenshotUrl = `/timelines/${slug}/screenshots/${filename}`;
    }

    entries.push({
      ...entry,
      screenshotUrl
    });
  }

  const publishedJob = publicTimelineJob(job, entries);
  await writeFile(path.join(outDir, "timeline.json"), JSON.stringify(publishedJob, null, 2), "utf8");
  console.log(`Published ${job.host} to /timelines/${slug}/timeline.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
