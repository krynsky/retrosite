import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function absoluteReportUrl(job, appOrigin) {
  const canonicalReportPath = `/timeline/${encodeURIComponent(job.host)}`;
  const reportPath = job.report?.generatedReportUrl?.startsWith("/timeline/")
    ? job.report.generatedReportUrl
    : canonicalReportPath;
  return new URL(reportPath, appOrigin).toString();
}

export function buildNotificationRecord(job, appOrigin) {
  if (!job.notifyEmail) {
    return null;
  }

  const reportUrl = absoluteReportUrl(job, appOrigin);
  const failed = job.status === "failed";
  const type = failed ? "report_failed" : "report_complete";
  const subject = failed
    ? `Retrosite report failed for ${job.host}`
    : `Retrosite report ready for ${job.host}`;
  const text = failed
    ? `Your Retrosite report for ${job.host} could not be completed.\n\nStatus page: ${reportUrl}\n\nError: ${job.error ?? "Unknown error"}`
    : `Your Retrosite report for ${job.host} is ready.\n\nOpen it here: ${reportUrl}`;

  return {
    id: job.id,
    type,
    recipient: job.notifyEmail,
    host: job.host,
    subject,
    text,
    reportUrl,
    createdAt: new Date().toISOString()
  };
}

export async function writeNotificationOutbox(job, { appOrigin, outboxRoot }) {
  const record = buildNotificationRecord(job, appOrigin);
  if (!record) {
    return null;
  }

  await mkdir(outboxRoot, { recursive: true });
  const outputFile = path.join(outboxRoot, `${job.id}.json`);
  await writeFile(outputFile, JSON.stringify(record, null, 2), "utf8");
  return { ...record, outputFile };
}
