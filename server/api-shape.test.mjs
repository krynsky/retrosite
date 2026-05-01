import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const testPort = 4399;

async function waitForHealth(baseUrl) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < 8000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw lastError ?? new Error("Timed out waiting for test server.");
}

async function waitForFile(filePath) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < 3000) {
    try {
      await stat(filePath);
      return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  throw lastError ?? new Error(`Timed out waiting for ${filePath}`);
}

async function startTestServerContext(t, port, extraEnv = {}) {
  const generatedRoot = await mkdtemp(path.join(tmpdir(), "retrosite-test-generated-"));
  const server = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      RETROSITE_GENERATED_ROOT: generatedRoot,
      ...extraEnv
    },
    stdio: "ignore"
  });

  t.after(async () => {
    if (!server.killed) {
      server.kill();
    }
    await new Promise((resolve) => {
      if (server.exitCode !== null) {
        resolve();
        return;
      }
      server.once("exit", resolve);
      setTimeout(resolve, 1500);
    });

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await rm(generatedRoot, { recursive: true, force: true });
        return;
      } catch (error) {
        if (attempt === 5) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);
  return { baseUrl, generatedRoot };
}

async function startTestServer(t, port, extraEnv = {}) {
  const context = await startTestServerContext(t, port, extraEnv);
  return context.baseUrl;
}

test("report list exposes queue capacity metadata", async (t) => {
  const baseUrl = await startTestServer(t, testPort, { RETROSITE_MAX_ACTIVE_JOBS: "3" });

  const response = await fetch(`${baseUrl}/api/reports?limit=1`);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.deepEqual(payload.queue, {
    activeJobCount: 0,
    maxActiveJobs: 3
  });
  assert.ok(Array.isArray(payload.jobs));
});

test("report creation rejects invalid notification email", async (t) => {
  const baseUrl = await startTestServer(t, testPort + 1);

  const response = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "example.com",
      notifyEmail: "not-an-email"
    })
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, "Enter a valid email address for notifications.");
});

test("request-only mode exposes public config and accepts timeline requests", async (t) => {
  const { baseUrl, generatedRoot } = await startTestServerContext(t, testPort + 10, {
    RETROSITE_MODE: "request-only"
  });

  const configResponse = await fetch(`${baseUrl}/api/config`);
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.deepEqual(config, {
    mode: "request-only",
    canGenerateReports: false,
    canEditReports: false,
    canSubmitRequests: true,
    requestSink: "local"
  });

  const requestResponse = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "http://friendfeed.com/krynsky",
      email: "reader@example.net",
      notes: "Please include the profile path."
    })
  });
  assert.equal(requestResponse.status, 202);
  const payload = await requestResponse.json();
  assert.equal(payload.request.target, "friendfeed.com/krynsky");
  assert.equal(payload.request.domain, "friendfeed.com");
  assert.equal(payload.request.path, "/krynsky");
  assert.equal(payload.request.email, "reader@example.net");
  assert.equal(payload.request.notes, "Please include the profile path.");

  const requestFile = path.join(generatedRoot, "requests", `${payload.request.createdAt.replace(/[:.]/g, "-")}-${payload.request.id}.json`);
  await waitForFile(requestFile);
  const savedRequest = JSON.parse(await readFile(requestFile, "utf8"));
  assert.equal(savedRequest.id, payload.request.id);

  const createResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "example.net",
      screenshotLimit: 1
    })
  });
  assert.equal(createResponse.status, 403);

  const editResponse = await fetch(`${baseUrl}/api/reports/does-not-matter`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      title: "Should not edit"
    })
  });
  assert.equal(editResponse.status, 403);
});

test("queued report jobs can be canceled", async (t) => {
  const baseUrl = await startTestServer(t, testPort + 2, { RETROSITE_DISABLE_RUNNER: "1" });

  const createResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "example.net",
      screenshotLimit: 1
    })
  });
  assert.equal(createResponse.status, 202);

  const createdJob = await createResponse.json();
  const cancelResponse = await fetch(`${baseUrl}/api/reports/${createdJob.id}/cancel`, {
    method: "POST"
  });
  assert.equal(cancelResponse.status, 200);

  const canceledJob = await cancelResponse.json();
  assert.equal(canceledJob.status, "canceled");
  assert.equal(canceledJob.stage, "canceled");
  assert.match(canceledJob.message, /canceled/i);
});

test("canceled report jobs can be retried as fresh queued jobs", async (t) => {
  const baseUrl = await startTestServer(t, testPort + 3, { RETROSITE_DISABLE_RUNNER: "1" });

  const createResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "example.net",
      screenshotLimit: 1,
      notifyEmail: "reader@example.net"
    })
  });
  assert.equal(createResponse.status, 202);

  const createdJob = await createResponse.json();
  const cancelResponse = await fetch(`${baseUrl}/api/reports/${createdJob.id}/cancel`, {
    method: "POST"
  });
  assert.equal(cancelResponse.status, 200);

  const retryResponse = await fetch(`${baseUrl}/api/reports/${createdJob.id}/retry`, {
    method: "POST"
  });
  assert.equal(retryResponse.status, 202);

  const retriedJob = await retryResponse.json();
  assert.notEqual(retriedJob.id, createdJob.id);
  assert.equal(retriedJob.host, "example.net");
  assert.equal(retriedJob.screenshotLimit, 1);
  assert.equal(retriedJob.notifyEmail, "reader@example.net");
  assert.equal(retriedJob.status, "queued");
});

test("external runner mode leaves new jobs queued for a worker", async (t) => {
  const baseUrl = await startTestServer(t, testPort + 4, { RETROSITE_RUNNER_MODE: "external" });

  const createResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "example.net",
      screenshotLimit: 1
    })
  });
  assert.equal(createResponse.status, 202);
  const createdJob = await createResponse.json();
  assert.equal(createdJob.status, "queued");

  await new Promise((resolve) => setTimeout(resolve, 600));

  const jobResponse = await fetch(`${baseUrl}/api/reports/${createdJob.id}`);
  assert.equal(jobResponse.status, 200);
  const job = await jobResponse.json();
  assert.equal(job.status, "queued");
  assert.equal(job.stage, "queued");
});

test("report creation accepts a path within a domain as its own target", async (t) => {
  const baseUrl = await startTestServer(t, testPort + 7, { RETROSITE_RUNNER_MODE: "external" });

  const createResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "http://friendfeed.com/krynsky",
      screenshotLimit: 1
    })
  });
  assert.equal(createResponse.status, 202);

  const createdJob = await createResponse.json();
  assert.equal(createdJob.host, "friendfeed.com/krynsky");
  assert.equal(createdJob.target, "friendfeed.com/krynsky");
  assert.equal(createdJob.version, 1);

  const reportResponse = await fetch(`${baseUrl}/api/reports/${encodeURIComponent(createdJob.host)}`);
  assert.equal(reportResponse.status, 200);
  const reportJob = await reportResponse.json();
  assert.equal(reportJob.id, createdJob.id);
});

test("worker entrypoint can run once without starting the API server", async (t) => {
  const generatedRoot = await mkdtemp(path.join(tmpdir(), "retrosite-worker-generated-"));
  t.after(async () => {
    await rm(generatedRoot, { recursive: true, force: true });
  });

  const worker = spawn(process.execPath, ["server/worker.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RETROSITE_GENERATED_ROOT: generatedRoot,
      RETROSITE_WORKER_ONCE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  worker.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const exitCode = await Promise.race([
    new Promise((resolve) => worker.once("exit", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for worker.")), 5000))
  ]);

  assert.equal(exitCode, 0, stderr);
});

test("report creation is rate limited per client", async (t) => {
  const baseUrl = await startTestServer(t, testPort + 5, {
    RETROSITE_DISABLE_RUNNER: "1",
    RETROSITE_CREATE_RATE_LIMIT: "1",
    RETROSITE_CREATE_RATE_WINDOW_MS: "60000"
  });

  const firstResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "example.net",
      screenshotLimit: 1
    })
  });
  assert.equal(firstResponse.status, 202);

  const secondResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "example.org",
      screenshotLimit: 1
    })
  });
  assert.equal(secondResponse.status, 429);

  const payload = await secondResponse.json();
  assert.match(payload.error, /too many report jobs/i);
});

test("external runner mode refreshes worker-updated jobs from disk", async (t) => {
  const { baseUrl, generatedRoot } = await startTestServerContext(t, testPort + 6, {
    RETROSITE_RUNNER_MODE: "external"
  });

  const createResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "example.net",
      screenshotLimit: 1
    })
  });
  assert.equal(createResponse.status, 202);
  const createdJob = await createResponse.json();

  const jobFile = path.join(generatedRoot, "reports", createdJob.id, "job.json");
  await waitForFile(jobFile);
  const persistedJob = JSON.parse(await readFile(jobFile, "utf8"));
  persistedJob.status = "complete";
  persistedJob.stage = "complete";
  persistedJob.progress = 100;
  persistedJob.message = "Worker finished the generated report.";
  persistedJob.report = {
    title: "example.net visual timeline draft",
    summary: "Worker-generated draft.",
    publicationStatus: "draft",
    publishedAt: null,
    generatedReportUrl: `/timeline/${encodeURIComponent(createdJob.host)}`,
    generatedShareUrl: `/timeline/${encodeURIComponent(createdJob.host)}/share`,
    stats: {
      captureCount: 1,
      candidateCount: 1,
      yearCount: 1,
      range: "2001-2001",
      renderedCount: 1,
      selectedCount: 1
    },
    entries: [],
    curatedEntries: []
  };
  await writeFile(jobFile, JSON.stringify(persistedJob, null, 2), "utf8");

  const jobResponse = await fetch(`${baseUrl}/api/reports/${createdJob.id}`);
  assert.equal(jobResponse.status, 200);
  const refreshedJob = await jobResponse.json();
  assert.equal(refreshedJob.status, "complete");
  assert.equal(refreshedJob.message, "Worker finished the generated report.");
});

test("markdown and html exports are zip packages with local screenshot assets", async (t) => {
  const { baseUrl, generatedRoot } = await startTestServerContext(t, testPort + 8, {
    RETROSITE_RUNNER_MODE: "external"
  });

  const createResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "example.net",
      screenshotLimit: 1
    })
  });
  assert.equal(createResponse.status, 202);
  const createdJob = await createResponse.json();

  const jobDir = path.join(generatedRoot, "reports", createdJob.id);
  const screenshotDir = path.join(jobDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });
  await writeFile(path.join(screenshotDir, "example.png"), "fake screenshot image");

  const jobFile = path.join(jobDir, "job.json");
  await waitForFile(jobFile);
  const persistedJob = JSON.parse(await readFile(jobFile, "utf8"));
  Object.assign(persistedJob, {
    status: "complete",
    stage: "complete",
    progress: 100,
    message: "Worker finished the generated report.",
    updatedAt: "2026-04-30T00:00:00.000Z"
  });
  persistedJob.report = {
    title: "example.net visual timeline draft",
    summary: "Worker-generated draft.",
    publicationStatus: "draft",
    publishedAt: null,
    stats: {
      captureCount: 1,
      candidateCount: 1,
      yearCount: 1,
      range: "2001-2001",
      renderedCount: 1,
      selectedCount: 1
    },
    entries: [],
    curatedEntries: [
      {
        timestamp: "20010101000000",
        date: "2001-01-01",
        title: "Candidate homepage",
        notes: "Rendered candidate selected for the generated draft report.",
        techStack: "Static HTML",
        source: "https://web.archive.org/web/20010101000000/http://example.net/",
        original: "http://example.net/",
        screenshotStatus: "rendered",
        screenshotUrl: `/generated/reports/${createdJob.id}/screenshots/example.png`,
        screenshotError: null,
        screenshotQuality: {
          bytes: 100,
          width: 100,
          height: 100,
          classification: "usable",
          reasons: []
        },
        replacementOf: null,
        replacementAttempts: []
      }
    ]
  };
  await writeFile(jobFile, JSON.stringify(persistedJob, null, 2), "utf8");

  const markdownResponse = await fetch(`${baseUrl}/api/reports/${createdJob.id}/export.md`);
  assert.equal(markdownResponse.status, 200);
  assert.match(markdownResponse.headers.get("content-type") ?? "", /application\/zip/);
  assert.match(markdownResponse.headers.get("content-disposition") ?? "", /markdown-export\.zip/);
  const markdownZip = Buffer.from(await markdownResponse.arrayBuffer());
  assert.equal(markdownZip.subarray(0, 2).toString("utf8"), "PK");
  const markdownZipText = markdownZip.toString("utf8");
  assert.match(markdownZipText, /example\.net\.md/);
  assert.match(markdownZipText, /screenshots\/01-2001-01-01-candidate-homepage\.png/);
  assert.match(markdownZipText, /!\[2001-01-01 Candidate homepage\]\(screenshots\/01-2001-01-01-candidate-homepage\.png\)/);

  const htmlResponse = await fetch(`${baseUrl}/api/reports/${createdJob.id}/export.html`);
  assert.equal(htmlResponse.status, 200);
  assert.match(htmlResponse.headers.get("content-type") ?? "", /application\/zip/);
  assert.match(htmlResponse.headers.get("content-disposition") ?? "", /html-export\.zip/);
  const htmlZip = Buffer.from(await htmlResponse.arrayBuffer());
  assert.equal(htmlZip.subarray(0, 2).toString("utf8"), "PK");
  const htmlZipText = htmlZip.toString("utf8");
  assert.match(htmlZipText, /example\.net\.html/);
  assert.match(htmlZipText, /id="report-data"/);
  assert.match(htmlZipText, /"imageUrl":"screenshots\/01-2001-01-01-candidate-homepage\.png"/);
  assert.match(htmlZipText, /data-display-mode="image-only"/);
  assert.doesNotMatch(htmlZipText, /data-image-mode|Focus|Full/);
  assert.doesNotMatch(htmlZipText, /Export Markdown|Export HTML|Copy share link|ABOUT/);
});

test("entry curation can replace the selected screenshot for the same year", async (t) => {
  const { baseUrl, generatedRoot } = await startTestServerContext(t, testPort + 9, {
    RETROSITE_RUNNER_MODE: "external"
  });

  const createResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: "example.net",
      screenshotLimit: 2
    })
  });
  assert.equal(createResponse.status, 202);
  const createdJob = await createResponse.json();

  const firstEntry = {
    timestamp: "20010101000000",
    date: "2001-01-01",
    title: "Custom 2001 title",
    notes: "Keep this curated note.",
    techStack: "Static HTML",
    source: "https://web.archive.org/web/20010101000000/http://example.net/",
    original: "http://example.net/",
    screenshotStatus: "rendered",
    screenshotUrl: `/generated/reports/${createdJob.id}/screenshots/first.png`,
    screenshotError: null,
    screenshotQuality: {
      bytes: 100,
      width: 100,
      height: 100,
      qualityScore: 50,
      classification: "usable",
      reasons: []
    },
    replacementOf: null,
    replacementAttempts: []
  };
  const betterEntry = {
    ...firstEntry,
    timestamp: "20010601000000",
    date: "2001-06-01",
    title: "Default alternate title",
    notes: "Default alternate note.",
    techStack: "Needs render review",
    source: "https://web.archive.org/web/20010601000000/http://example.net/",
    original: "http://example.net/",
    screenshotUrl: `/generated/reports/${createdJob.id}/screenshots/better.png`,
    screenshotQuality: {
      bytes: 200,
      width: 120,
      height: 120,
      qualityScore: 80,
      classification: "usable",
      reasons: []
    }
  };

  const jobFile = path.join(generatedRoot, "reports", createdJob.id, "job.json");
  await waitForFile(jobFile);
  const persistedJob = JSON.parse(await readFile(jobFile, "utf8"));
  Object.assign(persistedJob, {
    status: "complete",
    stage: "complete",
    progress: 100,
    message: "Worker finished the generated report.",
    updatedAt: "2026-04-30T00:00:00.000Z"
  });
  persistedJob.report = {
    title: "example.net visual timeline draft",
    summary: "Worker-generated draft.",
    publicationStatus: "draft",
    publishedAt: null,
    stats: {
      captureCount: 2,
      candidateCount: 2,
      yearCount: 1,
      range: "2001-2001",
      renderedCount: 2,
      usableRenderCount: 2,
      selectedCount: 1
    },
    entries: [firstEntry, betterEntry],
    curatedEntries: [firstEntry]
  };
  await writeFile(jobFile, JSON.stringify(persistedJob, null, 2), "utf8");

  const refreshResponse = await fetch(`${baseUrl}/api/reports/${createdJob.id}`);
  assert.equal(refreshResponse.status, 200);

  const patchResponse = await fetch(`${baseUrl}/api/reports/${createdJob.id}/entries`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      timestamp: betterEntry.timestamp,
      original: betterEntry.original,
      included: true,
      replaceSelectedYear: true
    })
  });
  assert.equal(patchResponse.status, 200);
  const updatedJob = await patchResponse.json();

  assert.equal(updatedJob.report.curatedEntries.length, 1);
  assert.equal(updatedJob.report.curatedEntries[0].timestamp, betterEntry.timestamp);
  assert.equal(updatedJob.report.curatedEntries[0].title, "Custom 2001 title");
  assert.equal(updatedJob.report.curatedEntries[0].notes, "Keep this curated note.");
  assert.equal(updatedJob.report.curatedEntries[0].techStack, "Static HTML");
  assert.equal(updatedJob.report.stats.selectedCount, 1);
  assert.match(updatedJob.message, /Selected 2001-06-01 screenshot/);
});
