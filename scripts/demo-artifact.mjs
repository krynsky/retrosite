import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = path.join(repoRoot, "demosite");
const outputRoot = path.join(repoRoot, "dist", "demo");
const assetName = "retrosite-demo-content.zip";
const releaseTag = process.env.RETROSITE_DEMO_CONTENT_TAG || "demo-content-latest";
const gitHubRepo = process.env.RETROSITE_GITHUB_REPO || "krynsky/retrosite";
const defaultArtifactUrl =
  process.env.RETROSITE_DEMO_CONTENT_URL
  || `https://github.com/${gitHubRepo}/releases/download/${releaseTag}/${assetName}`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

function runQuiet(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore", ...options });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

function quotedPowerShellPath(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function createZipArchive(sourceRoot, zipPath) {
  await rm(zipPath, { force: true });
  await mkdir(path.dirname(zipPath), { recursive: true });

  if (process.platform === "win32") {
    await run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -Path ${quotedPowerShellPath(path.join(sourceRoot, "*"))} -DestinationPath ${quotedPowerShellPath(zipPath)} -Force`
    ]);
  } else {
    await run("zip", ["-qr", zipPath, "."], { cwd: sourceRoot });
  }
}

async function extractZipArchive(zipPath, destination) {
  await mkdir(destination, { recursive: true });
  try {
    await run("tar", ["-xf", zipPath, "-C", destination]);
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }
    await run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath ${quotedPowerShellPath(zipPath)} -DestinationPath ${quotedPowerShellPath(destination)} -Force`
    ]);
  }
}

async function downloadFile(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download demo content from ${url}. Status: ${response.status}`);
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await pipeline(response.body, createWriteStream(destination));
}

async function readTimelineIndex() {
  return JSON.parse(await readFile(path.join(demoRoot, "timelines", "index.json"), "utf8"));
}

async function assertFullDemoContentForUpload() {
  if (process.env.RETROSITE_ALLOW_STARTER_DEMO_UPLOAD === "1") {
    return;
  }

  const index = await readTimelineIndex();
  const timelineCount = Array.isArray(index.timelines) ? index.timelines.length : 0;
  if (timelineCount <= 3) {
    throw new Error(
      `Refusing to upload demo content with only ${timelineCount} timelines. Run npm run demo:restore before demo:upload.`
    );
  }
}

export async function packageDemoArtifact() {
  const zipPath = path.join(outputRoot, assetName);
  await stat(path.join(demoRoot, "timelines", "index.json"));
  await createZipArchive(demoRoot, zipPath);
  console.log(`Built demo content archive: ${zipPath}`);
  return zipPath;
}

export async function uploadDemoArtifact() {
  await assertFullDemoContentForUpload();
  const zipPath = await packageDemoArtifact();
  const releaseExists = await runQuiet("gh", ["release", "view", releaseTag, "--repo", gitHubRepo]);
  if (releaseExists) {
    await run("gh", ["release", "upload", releaseTag, zipPath, "--repo", gitHubRepo, "--clobber"]);
  } else {
    await run("gh", [
      "release",
      "create",
      releaseTag,
      zipPath,
      "--repo",
      gitHubRepo,
      "--title",
      "Retrosite demo content",
      "--notes",
      "Published Retrosite demo timelines and static demo assets."
    ]);
  }
  console.log(`Uploaded ${assetName} to ${gitHubRepo} release ${releaseTag}.`);
  return zipPath;
}

export async function restoreDemoArtifact({ artifactUrl = defaultArtifactUrl } = {}) {
  const tempZipPath = path.join(outputRoot, assetName);
  await rm(tempZipPath, { force: true });
  console.log(`Downloading Retrosite demo content from ${artifactUrl}`);
  await downloadFile(artifactUrl, tempZipPath);
  await rm(path.join(demoRoot, "timelines"), { recursive: true, force: true });
  await rm(path.join(demoRoot, "screenshots"), { recursive: true, force: true });
  await rm(path.join(demoRoot, "krynsky-wayback-timeline.md"), { force: true });
  await extractZipArchive(tempZipPath, demoRoot);
  await stat(path.join(demoRoot, "timelines", "index.json"));
  console.log(`Restored demo content into ${demoRoot}`);
}

function usage() {
  console.error("Usage: node scripts/demo-artifact.mjs <package|upload|restore>");
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === "package") {
    await packageDemoArtifact();
  } else if (command === "upload") {
    await uploadDemoArtifact();
  } else if (command === "restore") {
    await restoreDemoArtifact();
  } else {
    usage();
  }
}
