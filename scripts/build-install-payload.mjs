import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROOT_EXCLUDES = new Set([
  ".git",
  ".vercel",
  ".vite",
  ".codex-logs",
  ".claude",
  "cache",
  "dist",
  "logs",
  "node_modules",
  "server/generated"
]);

function pathKey(filePath) {
  return filePath.split(path.sep).join("/");
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function copyFiltered(source, destination, shouldCopy) {
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(destination, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    const relativePath = path.relative(source, sourcePath);
    if (!shouldCopy(sourcePath, relativePath, entry)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyFiltered(sourcePath, destinationPath, shouldCopy);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath);
    }
  }
}

async function copyRepoSource(sourceRoot, payloadRoot) {
  await mkdir(payloadRoot, { recursive: true });
  const entries = await readdir(sourceRoot, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(payloadRoot, entry.name);
    const key = pathKey(entry.name);

    if (ROOT_EXCLUDES.has(key) || entry.name === "demosite") {
      continue;
    }

    if (entry.isDirectory()) {
      await copyFiltered(sourcePath, destinationPath, (candidatePath) => {
        const relative = pathKey(path.relative(sourceRoot, candidatePath));
        return !ROOT_EXCLUDES.has(relative);
      });
    } else if (entry.isFile()) {
      await cp(sourcePath, destinationPath);
    }
  }
}

async function copySelectedDemosite(sourceRoot, payloadRoot, profile) {
  const demositeSource = path.join(sourceRoot, "demosite");
  const demositeDestination = path.join(payloadRoot, "demosite");
  const timelineIndexPath = path.join(demositeSource, "timelines", "index.json");
  const timelineIndex = await readJson(timelineIndexPath);
  const selectedTimelineKeys = new Set(profile.selectedTimelineKeys ?? []);
  const selectedTimelines = (timelineIndex.timelines ?? []).filter((timeline) =>
    selectedTimelineKeys.has(timeline.storageKey)
  );

  if (selectedTimelines.length !== selectedTimelineKeys.size) {
    const found = new Set(selectedTimelines.map((timeline) => timeline.storageKey));
    const missing = [...selectedTimelineKeys].filter((key) => !found.has(key));
    throw new Error(`Profile references missing timeline keys: ${missing.join(", ")}`);
  }

  await mkdir(demositeDestination, { recursive: true });
  for (const fileName of profile.demositeStaticFiles ?? []) {
    const sourcePath = path.join(demositeSource, fileName);
    if (await exists(sourcePath)) {
      await mkdir(path.dirname(path.join(demositeDestination, fileName)), { recursive: true });
      await cp(sourcePath, path.join(demositeDestination, fileName));
    }
  }

  for (const timeline of selectedTimelines) {
    const sourcePath = path.join(demositeSource, "timelines", ...timeline.storageKey.split("/"));
    const destinationPath = path.join(demositeDestination, "timelines", ...timeline.storageKey.split("/"));
    await copyFiltered(sourcePath, destinationPath, (candidatePath, _relative, entry) => {
      if (!entry.isFile()) return true;
      return !(profile.excludeTimelineExportZips && candidatePath.endsWith(".zip"));
    });
  }

  await writeJson(path.join(demositeDestination, "timelines", "index.json"), {
    ...timelineIndex,
    updatedAt: new Date().toISOString(),
    timelines: selectedTimelines
  });
}

async function writePayloadManifest(payloadRoot, profile) {
  const files = [];

  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  await walk(payloadRoot);
  let totalBytes = 0;
  const hash = createHash("sha256");
  for (const filePath of files.sort()) {
    const data = await readFile(filePath);
    totalBytes += data.length;
    hash.update(pathKey(path.relative(payloadRoot, filePath)));
    hash.update(data);
  }

  await writeJson(path.join(payloadRoot, "install-payload.json"), {
    profile: profile.name,
    selectedTimelineKeys: profile.selectedTimelineKeys,
    fileCount: files.length,
    totalBytes,
    sha256: hash.digest("hex"),
    createdAt: new Date().toISOString()
  });
}

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

async function createZipArchive(payloadRoot, zipPath) {
  await rm(zipPath, { force: true });
  await mkdir(path.dirname(zipPath), { recursive: true });

  if (process.platform === "win32") {
    await run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -Path '${payloadRoot.replaceAll("'", "''")}\\*' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`
    ]);
  } else {
    await run("zip", ["-qr", zipPath, "."], { cwd: payloadRoot });
  }
}

export async function buildInstallPayload({
  sourceRoot = repoRoot,
  outputRoot = path.join(repoRoot, "dist", "install"),
  profilePath = path.join(repoRoot, "deploy-profiles", "install-lite.json"),
  zip = false
} = {}) {
  const resolvedSourceRoot = path.resolve(sourceRoot);
  const resolvedOutputRoot = path.resolve(outputRoot);
  const profile = await readJson(path.resolve(profilePath));
  const payloadRoot = path.join(resolvedOutputRoot, profile.outputName);
  const zipPath = path.join(resolvedOutputRoot, profile.releaseAssetName ?? `${profile.outputName}.zip`);

  await rm(payloadRoot, { recursive: true, force: true });
  await mkdir(payloadRoot, { recursive: true });
  await copyRepoSource(resolvedSourceRoot, payloadRoot);
  await copySelectedDemosite(resolvedSourceRoot, payloadRoot, profile);
  await writePayloadManifest(payloadRoot, profile);

  if (zip) {
    await createZipArchive(payloadRoot, zipPath);
  }

  return {
    payloadRoot,
    zipPath: zip ? zipPath : null,
    profile
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      options.sourceRoot = argv[++index];
    } else if (arg === "--out") {
      options.outputRoot = argv[++index];
    } else if (arg === "--profile") {
      options.profilePath = argv[++index];
    } else if (arg === "--zip") {
      options.zip = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildInstallPayload(parseArgs(process.argv.slice(2)));
  console.log(`Built install payload: ${result.payloadRoot}`);
  if (result.zipPath) {
    console.log(`Built install archive: ${result.zipPath}`);
  }
}
