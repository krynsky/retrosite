import type { ReportJob } from "../types";

function computeStats(job: ReportJob) {
  const discovery = job.discovery;
  const report = job.report;
  const entries = report?.entries ?? [];
  const curated = report?.curatedEntries ?? [];

  const discoveryStats = discovery ? {
    variants: discovery.queriedVariants.length,
    captures: discovery.captureCount,
    years: discovery.yearSummary.length,
    candidates: discovery.candidates.length,
    range: report?.stats.range ?? ""
  } : null;

  const usable = entries.filter((e) => e.screenshotQuality?.classification === "usable");
  const weak = entries.filter((e) => e.screenshotQuality?.classification === "weak");
  const failed = entries.filter((e) => e.screenshotStatus === "failed");
  const replaced = entries.filter((e) => e.replacementOf);

  const renderStats = entries.length > 0 ? {
    attempted: entries.length,
    successful: usable.length,
    weak: weak.length,
    failed: failed.length,
    replacements: replaced.length
  } : null;

  const curatedYears = new Set(curated.map((e) => e.date.slice(0, 4)));
  const allYears = new Set(entries.map((e) => e.date.slice(0, 4)));
  const weakOnlyYears = [...curatedYears].filter((year) => {
    const yearEntries = curated.filter((e) => e.date.slice(0, 4) === year);
    return yearEntries.every((e) => e.screenshotQuality?.classification === "weak");
  });

  const curationStats = curated.length > 0 ? {
    beforeDedup: entries.filter((e) => e.screenshotQuality?.classification === "usable" || e.screenshotQuality?.classification === "weak").length,
    afterCuration: curated.length,
    yearsRepresented: curatedYears.size,
    totalYears: allYears.size,
    weakOnlyYears: weakOnlyYears.length
  } : null;

  return { discoveryStats, renderStats, curationStats };
}

export function RunSummary({ job }: { job: ReportJob; isAdmin?: boolean }) {
  const { discoveryStats, renderStats, curationStats } = computeStats(job);

  if (!discoveryStats && !renderStats && !curationStats) return null;

  return (
    <section className="run-summary" aria-label="How this timeline was created">
      <h3 className="run-summary-heading">How this timeline was created</h3>

      <div className="run-summary-content">
        {discoveryStats && (
          <div className="run-summary-group">
            <h4>Discovery</h4>
            <dl>
              <dt>URL variants queried</dt>
              <dd>{discoveryStats.variants}</dd>
              <dt>Captures found</dt>
              <dd>{discoveryStats.captures.toLocaleString()}</dd>
              <dt>Years spanned</dt>
              <dd>{discoveryStats.years}</dd>
              <dt>Candidates selected</dt>
              <dd>{discoveryStats.candidates}</dd>
            </dl>
          </div>
        )}

        {renderStats && (
          <div className="run-summary-group">
            <h4>Rendering</h4>
            <dl>
              <dt>Screenshots attempted</dt>
              <dd>{renderStats.attempted}</dd>
              <dt>Usable</dt>
              <dd>{renderStats.successful}</dd>
              <dt>Weak</dt>
              <dd>{renderStats.weak}</dd>
              <dt>Failed</dt>
              <dd>{renderStats.failed}</dd>
              {renderStats.replacements > 0 && (
                <>
                  <dt>Replacements used</dt>
                  <dd>{renderStats.replacements}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        {curationStats && (
          <div className="run-summary-group">
            <h4>Curation</h4>
            <dl>
              <dt>Eligible entries</dt>
              <dd>{curationStats.beforeDedup}</dd>
              <dt>Final timeline entries</dt>
              <dd>{curationStats.afterCuration}</dd>
              <dt>Years represented</dt>
              <dd>{curationStats.yearsRepresented} of {curationStats.totalYears}</dd>
              {curationStats.weakOnlyYears > 0 && (
                <>
                  <dt>Years with weak-only captures</dt>
                  <dd>{curationStats.weakOnlyYears}</dd>
                </>
              )}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
