import assert from "node:assert/strict";
import { test } from "node:test";

import { buildNotificationRecord } from "./notifications.mjs";

test("builds a completion notification record with the report link", () => {
  const record = buildNotificationRecord(
    {
      id: "job-123",
      host: "example.com",
      status: "complete",
      notifyEmail: "reader@example.com",
      report: {
        generatedReportUrl: "/timeline/example.com"
      }
    },
    "http://127.0.0.1:4317"
  );

  assert.equal(record.recipient, "reader@example.com");
  assert.equal(record.type, "report_complete");
  assert.match(record.subject, /example\.com/);
  assert.match(record.text, /http:\/\/127\.0\.0\.1:4317\/timeline\/example\.com/);
});
