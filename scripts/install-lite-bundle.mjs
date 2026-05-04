import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const defaultBundleUrl =
  "https://github.com/krynsky/retrosite/releases/download/install-lite-latest/retrosite-install-lite.zip";

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

async function downloadFile(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download install bundle from ${url}. Status: ${response.status}`);
  }

  await mkdir(dirname(destination), { recursive: true });
  await pipeline(response.body, createWriteStream(destination));
}

async function extractZip(zipPath, destination) {
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
      `Expand-Archive -LiteralPath '${zipPath.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`
    ]);
  }
}

function resolveTarget(targetArg) {
  const target = resolve(scriptRoot, targetArg || "app");
  if (!target.startsWith(`${scriptRoot}\\`) && !target.startsWith(`${scriptRoot}/`)) {
    throw new Error(`Install target must stay inside the launcher folder: ${target}`);
  }
  if (target === scriptRoot) {
    throw new Error("Install target cannot be the launcher folder.");
  }
  return target;
}

export async function installLiteBundle({
  target = "app",
  bundleUrl = process.env.RETROSITE_INSTALL_BUNDLE_URL || defaultBundleUrl
} = {}) {
  const targetPath = resolveTarget(target);
  const tempZipPath = resolve(scriptRoot, ".retrosite-install-lite.zip");

  console.log(`Downloading Retrosite install bundle from ${bundleUrl}`);
  console.log(`Installing into ${targetPath}`);
  await rm(targetPath, { recursive: true, force: true });
  await rm(tempZipPath, { force: true });
  await downloadFile(bundleUrl, tempZipPath);
  await extractZip(tempZipPath, targetPath);
  await rm(tempZipPath, { force: true });

  await stat(resolve(targetPath, "package.json"));
  console.log("Retrosite install bundle is ready.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await installLiteBundle({ target: process.argv[2] || "app" });
}
