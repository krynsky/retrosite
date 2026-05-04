import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildInstallPayload } from "./build-install-payload.mjs";

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

async function writeText(filePath, value = "") {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

test("buildInstallPayload creates a lite app payload with only selected demo timelines", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "retrosite-payload-test-"));
  const sourceRoot = path.join(tempRoot, "source");
  const outputRoot = path.join(tempRoot, "out");
  const profilePath = path.join(tempRoot, "profile.json");

  await writeJson(path.join(sourceRoot, "package.json"), {
    scripts: { dev: "vite" },
    dependencies: { react: "0.0.0" }
  });
  await writeText(path.join(sourceRoot, "src", "App.tsx"), "export function App() {}");
  await writeText(path.join(sourceRoot, "server", "index.mjs"), "export {};");
  await writeText(path.join(sourceRoot, "demosite", "twitter.png"), "twitter");
  await writeText(path.join(sourceRoot, "demosite", "og-image.png"), "og");
  await writeText(path.join(sourceRoot, "demosite", "screenshots", "legacy.png"), "legacy");
  await writeText(path.join(sourceRoot, ".git", "objects", "ignored"), "git");
  await writeText(path.join(sourceRoot, "node_modules", "ignored"), "dependency");
  await writeText(path.join(sourceRoot, "server", "generated", "ignored.json"), "{}");

  const timelines = [
    { storageKey: "alpha.com", target: "alpha.com", thumbnailUrl: "/timelines/alpha.com/screenshots/one.png" },
    { storageKey: "beta.com", target: "beta.com", thumbnailUrl: "/timelines/beta.com/screenshots/one.png" },
    {
      storageKey: "nested/site",
      target: "nested/site",
      thumbnailUrl: "/timelines/nested/site/screenshots/one.png"
    }
  ];
  await writeJson(path.join(sourceRoot, "demosite", "timelines", "index.json"), {
    updatedAt: "2026-01-01T00:00:00.000Z",
    timelines
  });

  for (const timeline of timelines) {
    const timelineRoot = path.join(sourceRoot, "demosite", "timelines", ...timeline.storageKey.split("/"));
    await writeJson(path.join(timelineRoot, "timeline.json"), { request: { storageKey: timeline.storageKey } });
    await writeText(path.join(timelineRoot, "screenshots", "one.png"), "image");
    await writeText(path.join(timelineRoot, `${timeline.storageKey.replaceAll("/", "-")}-html-export.zip`), "zip");
  }

  await writeJson(profilePath, {
    name: "test-lite",
    outputName: "retrosite-test-lite",
    selectedTimelineKeys: ["alpha.com", "nested/site"],
    demositeStaticFiles: ["twitter.png"],
    excludeTimelineExportZips: true
  });

  const result = await buildInstallPayload({ sourceRoot, outputRoot, profilePath });
  const payloadRoot = result.payloadRoot;

  const filteredIndex = JSON.parse(
    await readFile(path.join(payloadRoot, "demosite", "timelines", "index.json"), "utf8")
  );
  assert.deepEqual(
    filteredIndex.timelines.map((timeline) => timeline.storageKey),
    ["alpha.com", "nested/site"]
  );

  assert.equal(await exists(path.join(payloadRoot, "src", "App.tsx")), true);
  assert.equal(await exists(path.join(payloadRoot, "demosite", "twitter.png")), true);
  assert.equal(await exists(path.join(payloadRoot, "demosite", "og-image.png")), false);
  assert.equal(await exists(path.join(payloadRoot, "demosite", "screenshots", "legacy.png")), false);
  assert.equal(await exists(path.join(payloadRoot, "demosite", "timelines", "alpha.com", "timeline.json")), true);
  assert.equal(await exists(path.join(payloadRoot, "demosite", "timelines", "beta.com")), false);
  assert.equal(await exists(path.join(payloadRoot, "demosite", "timelines", "nested", "site", "timeline.json")), true);
  assert.equal(
    await exists(path.join(payloadRoot, "demosite", "timelines", "alpha.com", "alpha.com-html-export.zip")),
    false
  );
  assert.equal(await exists(path.join(payloadRoot, ".git")), false);
  assert.equal(await exists(path.join(payloadRoot, "node_modules")), false);
  assert.equal(await exists(path.join(payloadRoot, "server", "generated")), false);
});
