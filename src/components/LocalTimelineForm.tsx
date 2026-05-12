import { FormEvent, ReactNode, useState } from "react";
import { Loader2, SearchCheck } from "lucide-react";
import type {
  ArchivedPathDiscovery,
  ArchivedPathSuggestion,
  ArchiveInspection,
  ArchiveMode,
  ArchivePreflight,
  DepthMode
} from "../types";
import { timelinePath } from "../helpers";
import { DomainField } from "./primitives/DomainField";
import { StampButton } from "./primitives/StampButton";

type LocalTimelineFormProps = {
  idleIcon: ReactNode;
};

async function readApiJson(response: Response, fallbackMessage: string) {
  const text = await response.text();
  const statusSuffix = response.ok ? "" : ` (HTTP ${response.status})`;

  if (!text.trim()) {
    throw new Error(`${fallbackMessage}${statusSuffix}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${fallbackMessage}${statusSuffix}`);
  }
}

function apiErrorMessage(payload: unknown, fallbackMessage: string) {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallbackMessage;
}

export default function LocalTimelineForm({ idleIcon }: LocalTimelineFormProps) {
  const [domain, setDomain] = useState(() => new URLSearchParams(window.location.search).get("target") ?? "");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [depthMode, setDepthMode] = useState<DepthMode>("adaptive");
  const [archiveMode, setArchiveMode] = useState<ArchiveMode>("best-year");
  const [preflight, setPreflight] = useState<ArchivePreflight | null>(null);
  const [preflightTarget, setPreflightTarget] = useState("");
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState("");
  const [pathDiscovery, setPathDiscovery] = useState<ArchivedPathDiscovery | null>(null);

  function handleDomainChange(value: string) {
    setDomain(value);
    setInspectError("");
    if (value.trim() !== preflightTarget) {
      setPreflight(null);
    }
    setPathDiscovery(null);
  }

  function handleDepthModeChange(value: DepthMode) {
    setDepthMode(value);
    setPreflight(null);
    setInspectError("");
  }

  function handleArchiveModeChange(value: ArchiveMode) {
    setArchiveMode(value);
    setPreflight(null);
    setInspectError("");
  }

  async function handleInspectArchive() {
    const target = domain.trim();
    if (!target) return;

    setInspectLoading(true);
    setInspectError("");
    setSubmitError("");

    try {
      const params = new URLSearchParams({ url: target, depthMode, archiveMode });
      const response = await fetch(`/api/wayback/inspect?${params.toString()}`);
      const payload = await readApiJson(response, "Unable to inspect archive.");
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "Unable to inspect archive."));
      }
      const inspection = payload as ArchiveInspection;
      setPreflight(inspection.preflight);
      setPathDiscovery(inspection.pathDiscovery);
      setPreflightTarget(target);
      setInspectError(inspection.pathDiscoveryError ?? "");
    } catch (caught) {
      setPreflight(null);
      setPathDiscovery(null);
      setInspectError(caught instanceof Error ? caught.message : "Unable to inspect archive.");
    } finally {
      setInspectLoading(false);
    }
  }

  function handleSelectPath(path: ArchivedPathSuggestion) {
    setDomain(path.target);
    setArchiveMode(path.path === "/" ? "homepage" : "specific-path");
    setPreflight(null);
    setInspectError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!domain.trim()) return;

    setSubmitLoading(true);
    setSubmitError("");

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: domain.trim(), depthMode, archiveMode })
      });
      const payload = await readApiJson(response, "Unable to create timeline job.");
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload, "Unable to create timeline job."));
      }

      const createdReport = payload as { host?: string };
      const host = createdReport.host ?? domain.trim().replace(/^https?:\/\//, "");
      window.location.assign(timelinePath(host));
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Unable to create timeline job.");
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <>
      <form className="domain-block" onSubmit={handleSubmit}>
        <div className="timeline-process-row timeline-process-row--target">
          <span className="timeline-process-step">1</span>
          <DomainField
            value={domain}
            onChange={(event) => handleDomainChange(event.target.value)}
            placeholder="example.com/path"
            required
            aria-label="Domain or path"
          />
        </div>
        <div className="timeline-process-row timeline-process-row--actions">
          <span className="timeline-process-step">2</span>
          <div className="domain-actions domain-actions--review">
            <StampButton
              type="button"
              tone="paper"
              size="sm"
              disabled={inspectLoading || submitLoading || !domain.trim()}
              onClick={handleInspectArchive}
              icon={
                inspectLoading ? (
                  <Loader2 className="spin" size={16} aria-hidden="true" />
                ) : (
                  <SearchCheck size={16} aria-hidden="true" />
                )
              }
            >
              Inspect Archive
            </StampButton>
          </div>
        </div>
        <div className="timeline-process-row timeline-process-row--settings">
          <span className="timeline-process-step">3</span>
          <label className="depth-field">
            <span className="depth-field-label">DEPTH</span>
            <select
              value={depthMode}
              onChange={(event) => handleDepthModeChange(event.target.value as DepthMode)}
              aria-label="Timeline depth"
            >
              <option value="adaptive">Adaptive</option>
              <option value="quick">Quick</option>
              <option value="standard">Standard</option>
              <option value="deep">Deep</option>
            </select>
          </label>
          <label className="depth-field archive-source-field">
            <span className="depth-field-label">SOURCE</span>
            <select
              value={archiveMode}
              onChange={(event) => handleArchiveModeChange(event.target.value as ArchiveMode)}
              aria-label="Archive source"
            >
              <option value="best-year">Best page per year</option>
              <option value="homepage">Homepage only</option>
              <option value="specific-path">Specific path</option>
              <option value="broad">Whole domain</option>
            </select>
          </label>
        </div>
        <div className="timeline-process-final">
          <StampButton
            type="submit"
            tone="primary"
            size="md"
            className="create-timeline-btn"
            disabled={submitLoading || inspectLoading}
            icon={submitLoading ? <Loader2 className="spin" size={17} aria-hidden="true" /> : idleIcon}
          >
            Create Timeline
          </StampButton>
        </div>
      </form>
      {inspectError && <p className="error-note">{inspectError}</p>}
      {pathDiscovery && (
        <section className="path-discovery-panel" aria-label={`Archived paths for ${pathDiscovery.host}`}>
          <div className="preflight-panel-header">
            <div>
              <span className="preflight-label">ARCHIVED PATHS</span>
              <h2>{pathDiscovery.host}</h2>
            </div>
            <strong>{pathDiscovery.paths.length}</strong>
          </div>
          {pathDiscovery.paths.length > 0 ? (
            <div className="archived-path-list">
              {pathDiscovery.paths.slice(0, 8).map((path) => (
                <button
                  type="button"
                  className="archived-path-item"
                  key={path.target}
                  onClick={() => handleSelectPath(path)}
                >
                  <span className="archived-path-name">{path.path}</span>
                  <span>{path.captureCount.toLocaleString()} captures</span>
                  <span>{path.yearCount} years</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="preflight-ok">No useful archived subpaths were found.</p>
          )}
        </section>
      )}
      {preflight && (
        <section className="preflight-panel" aria-label={`Archive quality for ${preflight.host}`}>
          <div className="preflight-panel-header">
            <div>
              <span className="preflight-label">ARCHIVE CHECK</span>
              <h2>{preflight.host}</h2>
            </div>
            <strong>{preflight.estimatedRunSize}</strong>
          </div>
          <dl className="preflight-stats">
            <div>
              <dt>Range</dt>
              <dd>
                {preflight.firstCaptureDate && preflight.latestCaptureDate
                  ? `${preflight.firstCaptureDate.slice(0, 4)}-${preflight.latestCaptureDate.slice(0, 4)}`
                  : "Unknown"}
              </dd>
            </div>
            <div>
              <dt>Captures</dt>
              <dd>{preflight.captureCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Years</dt>
              <dd>
                {preflight.captureYearCount}
                {preflight.yearSpan > preflight.captureYearCount ? `/${preflight.yearSpan}` : ""}
              </dd>
            </div>
            <div>
              <dt>Digests</dt>
              <dd>{preflight.uniqueDigestCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Render cap</dt>
              <dd>{preflight.recommendedScreenshotLimit}</dd>
            </div>
          </dl>
          {preflight.weakYears.length > 0 && (
            <p className="preflight-weak-years">
              Weak years: {preflight.weakYears.slice(0, 8).map((year) => year.year).join(", ")}
              {preflight.weakYears.length > 8 ? `, +${preflight.weakYears.length - 8}` : ""}
            </p>
          )}
          {preflight.warnings.length > 0 ? (
            <ul className="preflight-warnings">
              {preflight.warnings.slice(0, 3).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="preflight-ok">Coverage looks suitable for a timeline run.</p>
          )}
        </section>
      )}
      {submitError && <p className="error-note">{submitError}</p>}
    </>
  );
}
