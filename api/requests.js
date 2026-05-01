import { randomUUID } from "node:crypto";

function parseBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") {
    return JSON.parse(request.body);
  }
  return request.body;
}

function normalizeTarget(input) {
  const raw = String(input ?? "").trim();
  if (!raw) {
    throw new Error("Missing url in request body.");
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  const domain = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = (url.pathname || "/").replace(/\/{2,}/g, "/").replace(/\/+$/g, "") || "/";
  return {
    url: raw,
    domain,
    path,
    target: path === "/" ? domain : `${domain}${path}`
  };
}

async function createGithubIssue(requestRecord) {
  const repo = process.env.RETROSITE_REQUEST_REPO;
  const token = process.env.GITHUB_TOKEN || process.env.RETROSITE_GITHUB_TOKEN;
  if (!repo || !token) {
    throw new Error("Timeline request queue is not configured. Set RETROSITE_REQUEST_REPO and GITHUB_TOKEN.");
  }

  const body = [
    "New Retrosite timeline request.",
    "",
    `- Target: ${requestRecord.target}`,
    `- Submitted URL: ${requestRecord.url}`,
    `- Created: ${requestRecord.createdAt}`
  ].join("\n");

  const githubResponse = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "retrosite-request-queue"
    },
    body: JSON.stringify({
      title: `Timeline request: ${requestRecord.target}`,
      body,
      labels: ["timeline-request"]
    })
  });

  const payload = await githubResponse.json().catch(() => ({}));
  if (!githubResponse.ok) {
    throw new Error(payload.message ?? "Unable to create GitHub issue for timeline request.");
  }

  return payload.html_url;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const body = parseBody(request);
    const target = normalizeTarget(body.url);
    const requestRecord = {
      id: randomUUID(),
      ...target,
      status: "new",
      createdAt: new Date().toISOString()
    };

    const issueUrl = await createGithubIssue(requestRecord);
    response.status(202).json({ request: { ...requestRecord, issueUrl } });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to submit timeline request."
    });
  }
}
