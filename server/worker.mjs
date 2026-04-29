import { runWorker } from "./index.mjs";

const once = process.env.RETROSITE_WORKER_ONCE === "1";

try {
  await runWorker({ once });
} catch (error) {
  console.error("Retrosite worker failed:", error);
  process.exitCode = 1;
}
