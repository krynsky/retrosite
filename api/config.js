function githubTimelineRequestSearchUrl(repo) {
  const normalizedRepo = String(repo ?? "")
    .trim()
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");

  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(normalizedRepo)) {
    return null;
  }

  const query = `repo:${normalizedRepo} is:issue label:timeline-request`;
  return `https://github.com/search?q=${encodeURIComponent(query)}&type=issues`;
}

module.exports = function handler(_request, response) {
  const mode = process.env.RETROSITE_MODE === "local" ? "local" : "request-only";
  response.status(200).json({
    mode,
    canGenerateReports: mode === "local",
    canEditReports: mode === "local",
    canSubmitRequests: mode === "request-only",
    requestSink: process.env.RETROSITE_REQUEST_SINK ?? "github",
    requestStatusUrl: githubTimelineRequestSearchUrl(process.env.RETROSITE_REQUEST_REPO)
  });
}
