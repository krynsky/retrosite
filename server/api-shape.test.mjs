import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
    generatedReportUrl: `/reports/generated/${createdJob.id}`,
    generatedShareUrl: `/reports/generated/${createdJob.id}/share`,
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
