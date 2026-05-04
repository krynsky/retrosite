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
const publicTimelinesRoot = path.join(repoRoot, "demosite", "timelines");
const vitePublicRoot = path.join(repoRoot, "demosite");

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

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function exportSafeSegment(value, fallback = "retrosite") {
  return String(value ?? fallback)
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function timelineRoutePath(target) {
  return `/timeline/${String(target)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function timelineAssetPath(target) {
  return String(target)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function reportExportBaseName(job) {
  const range = exportSafeSegment(job.report?.stats?.range ?? "timeline", "timeline");
  return `${exportSafeSegment(job.host, "retrosite")}-${range}`;
}

function entryKey(entry) {
  return `${entry.timestamp ?? ""}|${entry.date}|${entry.source}`;
}

function publicTimelineJob(job, entries, exportUrls = {}) {
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
      exports: exportUrls,
      generatedReportUrl: timelineRoutePath(job.host),
      generatedShareUrl: `${timelineRoutePath(job.host)}/share`
    },
    error: job.error ?? null,
    notifyEmail: null,
    notificationStatus: "not_requested"
  };
}

function publicTimelineSummary(job, slug) {
  const renderedEntry = job.report?.curatedEntries?.find((entry) => entry.screenshotUrl)
    ?? job.report?.entries?.find((entry) => entry.screenshotUrl);

  return {
    id: job.id,
    storageKey: job.storageKey ?? job.storageSlug ?? slug ?? null,
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
    generatedReportUrl: timelineRoutePath(job.host),
    generatedShareUrl: `${timelineRoutePath(job.host)}/share`,
    stats: job.report?.stats ?? null,
    error: job.error ?? null,
    thumbnailUrl: renderedEntry?.screenshotUrl ?? null,
    notifyEmail: null,
    notificationStatus: "not_requested",
    activeJobCount: 0,
    maxActiveJobs: 3,
    queuePosition: null,
    isActiveJob: false
  };
}

async function writePublishedTimelineIndex() {
  const timelines = [];

  async function collectTimelineFiles(baseDir) {
    const found = [];
    const entries = await readdir(baseDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(baseDir, entry.name);
      if (entry.isFile() && entry.name === "timeline.json") {
        found.push(fullPath);
      } else if (entry.isDirectory() && entry.name !== "screenshots") {
        found.push(...await collectTimelineFiles(fullPath));
      }
    }
    return found;
  }

  for (const timelineFile of await collectTimelineFiles(publicTimelinesRoot)) {
    try {
      const slug = path.dirname(path.relative(publicTimelinesRoot, timelineFile)).split(path.sep).join("/");
      const job = JSON.parse(await readFile(timelineFile, "utf8"));
      if (job?.report?.curatedEntries?.length || job?.report?.entries?.length) {
        timelines.push(publicTimelineSummary(job, slug));
      }
    } catch {
      // Ignore incomplete or malformed published timeline folders.
    }
  }

  timelines.sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
    || String(a.host ?? "").localeCompare(String(b.host ?? ""))
  );

  await writeFile(
    path.join(publicTimelinesRoot, "index.json"),
    JSON.stringify({ updatedAt: new Date().toISOString(), timelines }, null, 2),
    "utf8"
  );
}

function buildRunSummary(job, entries, curatedEntries = entries) {
  const curated = curatedEntries.length ? curatedEntries : entries;
  const discovery = job.discovery
    ? {
        variants: job.discovery.queriedVariants?.length ?? 0,
        captures: job.discovery.captureCount ?? job.report?.stats?.captureCount ?? entries.length,
        years: job.discovery.yearSummary?.length ?? job.report?.stats?.yearCount ?? entries.length,
        candidates: job.discovery.candidates?.length ?? job.report?.stats?.candidateCount ?? entries.length
      }
    : null;

  const usable = entries.filter((entry) => entry.screenshotQuality?.classification === "usable");
  const weak = entries.filter((entry) => entry.screenshotQuality?.classification === "weak");
  const failed = entries.filter((entry) => entry.screenshotStatus === "failed");
  const replaced = entries.filter((entry) => entry.replacementOf);
  const anyQuality = entries.some((entry) => entry.screenshotQuality);
  const renderedUsable = anyQuality ? usable.length : entries.filter((entry) => entry.screenshotUrl).length;

  const curatedYears = new Set(curated.map((entry) => entry.date.slice(0, 4)));
  const allYears = new Set(entries.map((entry) => entry.date.slice(0, 4)));
  const weakOnlyYears = [...curatedYears].filter((year) => {
    const yearEntries = curated.filter((entry) => entry.date.slice(0, 4) === year);
    return yearEntries.length > 0 && yearEntries.every((entry) => entry.screenshotQuality?.classification === "weak");
  });

  return {
    discovery: discovery ?? {
      variants: 0,
      captures: job.report?.stats?.captureCount ?? entries.length,
      years: job.report?.stats?.yearCount ?? allYears.size,
      candidates: job.report?.stats?.candidateCount ?? entries.length
    },
    rendering: {
      attempted: entries.length,
      usable: renderedUsable,
      weak: weak.length,
      failed: failed.length,
      replacements: replaced.length
    },
    curation: {
      eligible: anyQuality
        ? entries.filter((entry) => entry.screenshotQuality?.classification === "usable" || entry.screenshotQuality?.classification === "weak").length
        : entries.length,
      finalEntries: curated.length,
      yearsRepresented: curatedYears.size,
      totalYears: allYears.size,
      weakOnlyYears: weakOnlyYears.length
    }
  };
}

async function readJob(jobDir) {
  const file = path.join(jobDir, "job.json");
  const job = JSON.parse(await readFile(file, "utf8"));
  const folderName = path.basename(jobDir);
  if (job?.id && !job.storageKey && !job.storageSlug && folderName !== job.id) {
    job.storageKey = folderName;
  }
  return job;
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
  const storageKey = job.storageKey ?? job.storageSlug ?? job.id;
  const prefix = `/generated/reports/${storageKey}/`;
  if (screenshotUrl.startsWith(prefix)) {
    return path.join(generatedRoot, "reports", storageKey, screenshotUrl.slice(prefix.length));
  }
  const legacyPrefix = `/generated/reports/${job.id}/`;
  if (legacyPrefix !== prefix && screenshotUrl.startsWith(legacyPrefix)) {
    return path.join(generatedRoot, "reports", job.id, screenshotUrl.slice(legacyPrefix.length));
  }
  if (screenshotUrl.startsWith("/")) {
    return path.join(vitePublicRoot, screenshotUrl.slice(1));
  }
  return null;
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

async function collectExportScreenshotAssets(job, entries) {
  const files = [];
  const screenshotPathsByEntry = new Map();
  const usedNames = new Set();

  for (const [index, entry] of entries.entries()) {
    const localPath = localScreenshotPath(job, entry.screenshotUrl);
    if (!localPath) continue;

    try {
      const data = await readFile(localPath);
      const zipPath = `screenshots/${screenshotExportName(entry, index, usedNames)}`;
      files.push({ path: zipPath, data });
      screenshotPathsByEntry.set(entryKey(entry), zipPath);
    } catch {
      // Keep the export usable even if a screenshot file is missing.
    }
  }

  return { files, screenshotPathsByEntry };
}

function buildReportMarkdown(job, screenshotPathsByEntry = new Map()) {
  const report = job.report;
  const entries = report?.curatedEntries ?? [];
  if (!report || entries.length === 0) return "";

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

  const summary = report.runSummary;
  if (summary) {
    lines.push("## How this timeline was created", "");
    lines.push(
      `- URL variants queried: ${summary.discovery?.variants ?? 0}`,
      `- Captures found: ${summary.discovery?.captures ?? 0}`,
      `- Years spanned: ${summary.discovery?.years ?? 0}`,
      `- Candidates selected: ${summary.discovery?.candidates ?? 0}`,
      `- Screenshots attempted: ${summary.rendering?.attempted ?? 0}`,
      `- Usable screenshots: ${summary.rendering?.usable ?? 0}`,
      `- Weak screenshots: ${summary.rendering?.weak ?? 0}`,
      `- Failed screenshots: ${summary.rendering?.failed ?? 0}`,
      `- Replacements used: ${summary.rendering?.replacements ?? 0}`,
      `- Eligible entries: ${summary.curation?.eligible ?? 0}`,
      `- Final timeline entries: ${summary.curation?.finalEntries ?? entries.length}`,
      `- Years represented: ${summary.curation?.yearsRepresented ?? 0} of ${summary.curation?.totalYears ?? 0}`,
      `- Years with weak-only captures: ${summary.curation?.weakOnlyYears ?? 0}`,
      ""
    );
  }

  lines.push("## Timeline", "");
  for (const entry of entries) {
    const screenshotPath = screenshotPathsByEntry.get(entryKey(entry));
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
  }

  return `${lines.join("\n")}\n`;
}

function buildReportHtml(job, screenshotPathsByEntry = new Map()) {
  const report = job.report;
  const entries = report?.curatedEntries ?? [];
  if (!report || entries.length === 0) return "";

  const summary = report.runSummary;
  const timeline = entries.map((entry) => {
    const screenshotPath = screenshotPathsByEntry.get(entryKey(entry));
    return `
      <article class="entry">
        <div class="entry-copy">
          <p class="date">${htmlEscape(entry.date)}</p>
          <h2>${htmlEscape(entry.title)}</h2>
          <p>${htmlEscape(entry.notes)}</p>
          <dl>
            <dt>Tech stack</dt><dd>${htmlEscape(entry.techStack)}</dd>
            <dt>Source</dt><dd><a href="${htmlEscape(entry.source)}">Wayback capture</a></dd>
          </dl>
        </div>
        ${screenshotPath ? `<img src="${htmlEscape(screenshotPath)}" alt="${htmlEscape(`${entry.date} ${entry.title}`)}">` : `<div class="missing">No exported screenshot file was available.</div>`}
      </article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(report.title)}</title>
  <style>
    body { margin: 0; background: #f7f0e2; color: #19140f; font-family: Georgia, "Times New Roman", serif; }
    main { padding: 48px; }
    h1 { margin: 0 0 16px; font-size: clamp(42px, 7vw, 92px); line-height: .92; }
    .summary, .entry { border: 1px solid #19140f; margin: 28px 0; background: #fff9ee; }
    .summary h2 { margin: 0; padding: 18px; border-bottom: 1px solid #19140f; font-size: 22px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); }
    .summary-group { padding: 18px; border-right: 1px solid #19140f; }
    .summary-group:last-child { border-right: 0; }
    .summary-group h3 { margin: 0 0 16px; font-size: 18px; }
    dl { display: grid; grid-template-columns: 1fr auto; gap: 8px 18px; margin: 0; font: 700 14px ui-monospace, monospace; }
    dt { color: #635b4c; } dd { margin: 0; }
    .entry { display: grid; grid-template-columns: minmax(260px, .42fr) minmax(0, 1fr); }
    .entry-copy { padding: 28px; }
    .entry h2 { font-size: clamp(34px, 5vw, 64px); line-height: .95; margin: 8px 0 18px; }
    .date { color: #1e5fd8; font: 900 16px ui-monospace, monospace; }
    .entry img { display: block; width: 100%; background: #061d33; }
    .missing { min-height: 320px; display: grid; place-items: center; background: #061d33; color: white; }
    @media (max-width: 900px) { main { padding: 20px; } .summary-grid, .entry { grid-template-columns: 1fr; } .summary-group { border-right: 0; border-bottom: 1px solid #19140f; } }
  </style>
</head>
<body>
  <main>
    <h1>${htmlEscape(report.title)}</h1>
    <p>${htmlEscape(report.summary)}</p>
    ${summary ? `<section class="summary">
      <h2>How this timeline was created</h2>
      <div class="summary-grid">
        <div class="summary-group"><h3>Discovery</h3><dl>
          <dt>URL variants queried</dt><dd>${summary.discovery?.variants ?? 0}</dd>
          <dt>Captures found</dt><dd>${summary.discovery?.captures ?? 0}</dd>
          <dt>Years spanned</dt><dd>${summary.discovery?.years ?? 0}</dd>
          <dt>Candidates selected</dt><dd>${summary.discovery?.candidates ?? 0}</dd>
        </dl></div>
        <div class="summary-group"><h3>Rendering</h3><dl>
          <dt>Screenshots attempted</dt><dd>${summary.rendering?.attempted ?? 0}</dd>
          <dt>Usable</dt><dd>${summary.rendering?.usable ?? 0}</dd>
          <dt>Weak</dt><dd>${summary.rendering?.weak ?? 0}</dd>
          <dt>Failed</dt><dd>${summary.rendering?.failed ?? 0}</dd>
          <dt>Replacements used</dt><dd>${summary.rendering?.replacements ?? 0}</dd>
        </dl></div>
        <div class="summary-group"><h3>Curation</h3><dl>
          <dt>Eligible entries</dt><dd>${summary.curation?.eligible ?? 0}</dd>
          <dt>Final timeline entries</dt><dd>${summary.curation?.finalEntries ?? entries.length}</dd>
          <dt>Years represented</dt><dd>${summary.curation?.yearsRepresented ?? 0} of ${summary.curation?.totalYears ?? 0}</dd>
          <dt>Years with weak-only captures</dt><dd>${summary.curation?.weakOnlyYears ?? 0}</dd>
        </dl></div>
      </div>
    </section>` : ""}
    ${timeline}
  </main>
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

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function buildZipArchive(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime();

  for (const file of files) {
    const nameBuffer = Buffer.from(file.path.replace(/\\/g, "/"), "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const checksum = crc32(data);
    const localHeaderOffset = offset;
    const localHeader = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate),
      u32(checksum), u32(data.length), u32(data.length), u16(nameBuffer.length), u16(0), nameBuffer
    ]);
    localParts.push(localHeader, data);
    offset += localHeader.length + data.length;
    centralParts.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate),
      u32(checksum), u32(data.length), u32(data.length), u16(nameBuffer.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(localHeaderOffset), nameBuffer
    ]));
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralDirectory.length), u32(offset), u16(0)
  ]);
  return Buffer.concat([...localParts, centralDirectory, endRecord]);
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

  const slug = process.argv[3] || timelineAssetPath(job.host);
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

  const originalEntries = job.report.entries?.length ? job.report.entries : entries;
  job.report = {
    ...job.report,
    runSummary: job.report.runSummary ?? buildRunSummary(job, originalEntries, entries),
    curatedEntries: entries,
    entries
  };

  const baseName = reportExportBaseName(job);
  const markdownFilename = `${baseName}-markdown-export.zip`;
  const htmlFilename = `${baseName}-html-export.zip`;
  const exportUrls = {
    markdownUrl: `/timelines/${slug}/${markdownFilename}`,
    htmlUrl: `/timelines/${slug}/${htmlFilename}`
  };

  const { files: markdownScreenshots, screenshotPathsByEntry: markdownScreenshotPaths } = await collectExportScreenshotAssets(job, entries);
  const markdownZip = buildZipArchive([
    { path: `${baseName}.md`, data: Buffer.from(buildReportMarkdown(job, markdownScreenshotPaths), "utf8") },
    ...markdownScreenshots
  ]);

  const { files: htmlScreenshots, screenshotPathsByEntry: htmlScreenshotPaths } = await collectExportScreenshotAssets(job, entries);
  const htmlZip = buildZipArchive([
    { path: `${baseName}.html`, data: Buffer.from(buildReportHtml(job, htmlScreenshotPaths), "utf8") },
    ...htmlScreenshots
  ]);

  await writeFile(path.join(outDir, markdownFilename), markdownZip);
  await writeFile(path.join(outDir, htmlFilename), htmlZip);

  const publishedJob = publicTimelineJob(job, entries, exportUrls);
  await writeFile(path.join(outDir, "timeline.json"), JSON.stringify(publishedJob, null, 2), "utf8");
  await writePublishedTimelineIndex();
  console.log(`Published ${job.host} to /timelines/${slug}/timeline.json`);
  console.log(`Published exports to /timelines/${slug}/${markdownFilename} and /timelines/${slug}/${htmlFilename}`);
  console.log("Updated /timelines/index.json");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
