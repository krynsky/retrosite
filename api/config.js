export default function handler(_request, response) {
  const mode = process.env.RETROSITE_MODE === "local" ? "local" : "request-only";
  response.status(200).json({
    mode,
    canGenerateReports: mode === "local",
    canEditReports: mode === "local",
    canSubmitRequests: mode === "request-only",
    requestSink: process.env.RETROSITE_REQUEST_SINK ?? "github"
  });
}
