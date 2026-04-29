import { CSSProperties, ReactNode, useState, useEffect } from "react";
import { ArrowUpRight, ZoomIn, Maximize2 } from "lucide-react";
import type { DraftReportEntry } from "../types";
import type { TimelineEntry } from "../data/krynskyTimeline";

type NormalizedEntry = {
  date: string;
  title: string;
  notes: string;
  techStack: string;
  source: string;
  imageUrl: string | null;
  focusScale?: number;
  focusOrigin?: string;
  focusHeight?: string;
  quality?: DraftReportEntry["screenshotQuality"];
  replacementOf?: string | null;
  replacementAttempts?: DraftReportEntry["replacementAttempts"];
};

function normalizeSeedEntry(entry: TimelineEntry): NormalizedEntry {
  return {
    date: entry.date,
    title: entry.title,
    notes: entry.notes,
    techStack: entry.techStack,
    source: entry.source,
    imageUrl: entry.image,
    focusScale: entry.focusScale,
    focusOrigin: entry.focusOrigin,
    focusHeight: entry.focusHeight
  };
}

function summarizeTechStack(techStack: string): string {
  const core = techStack.split(" · ")[0];
  const parts = core.split(",").map((s) => s.trim());
  const cms = parts.find((p) => /^(WordPress|Squarespace|Wix|Webflow|FrontPage|Classic ASP|Static HTML)/i.test(p));
  const theme = parts.find((p) => /^theme:/i.test(p));
  if (cms && theme) return `${cms}, ${theme}`;
  if (cms) return cms;
  if (parts.length <= 2) return core;
  return parts.slice(0, 2).join(", ");
}

function normalizeGeneratedEntry(entry: DraftReportEntry): NormalizedEntry {
  return {
    date: entry.date,
    title: entry.title,
    notes: entry.notes,
    techStack: entry.techStack,
    source: entry.source,
    imageUrl: entry.screenshotUrl,
    quality: entry.screenshotQuality,
    replacementOf: entry.replacementOf,
    replacementAttempts: entry.replacementAttempts
  };
}

export function TimelineView({
  domain,
  range,
  createdAt,
  actions,
  seedEntries,
  generatedEntries
}: {
  domain: string;
  range: string;
  createdAt?: string;
  actions?: ReactNode;
  seedEntries?: TimelineEntry[];
  generatedEntries?: DraftReportEntry[];
}) {
  const entries: NormalizedEntry[] = seedEntries
    ? seedEntries.map(normalizeSeedEntry)
    : (generatedEntries ?? []).map(normalizeGeneratedEntry);

  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [imageMode, setImageMode] = useState<"focus" | "full">("focus");
  const activeEntry = entries[Math.min(activeEntryIndex, Math.max(entries.length - 1, 0))] ?? null;
  const isGenerated = !seedEntries;

  useEffect(() => {
    setActiveEntryIndex(0);
    setImageMode("focus");
  }, [seedEntries, generatedEntries]);

  if (entries.length === 0) {
    return <p className="warning-note">No entries available for this report.</p>;
  }

  return (
    <>
      <div className="section-heading">
        {(createdAt || actions) && (
          <div className="timeline-header-row">
            {createdAt && (
              <span className="timeline-created">
                Timeline created on {new Date(createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </span>
            )}
            {actions && <div className="timeline-actions">{actions}</div>}
          </div>
        )}
        <h1>{domain}</h1>
        <span className="timeline-range">{range}</span>
      </div>

      <div className="timeline-layout">
        <nav className="timeline-nav" aria-label="Timeline entries">
          {entries.map((entry, index) => (
            <button
              key={`${entry.date}-${entry.source}`}
              type="button"
              className={index === activeEntryIndex ? "active" : ""}
              aria-label={`${entry.date.slice(0, 4)} ${entry.title}: ${entry.techStack}`}
              onClick={() => setActiveEntryIndex(index)}
            >
              <span>{entry.date.slice(0, 4)}</span>
              {summarizeTechStack(entry.techStack)}
            </button>
          ))}
        </nav>

        {activeEntry && (
          <div className="timeline-main">
            <article className="timeline-detail">
              <div className="detail-copy">
                <span>Captured on {activeEntry.date}</span>
                <dl>
                  <div>
                    <dt>Tech stack</dt>
                    <dd>{activeEntry.techStack}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      <a href={activeEntry.source} target="_blank" rel="noreferrer">
                        Wayback capture <ArrowUpRight size={15} />
                      </a>
                    </dd>
                  </div>
                </dl>
              </div>
              {activeEntry.imageUrl && (
                <div className="image-mode-toggle" aria-label="Screenshot view mode">
                  <button
                    type="button"
                    className={imageMode === "focus" ? "active" : ""}
                    onClick={() => setImageMode("focus")}
                  >
                    <ZoomIn size={16} />
                    Focus
                  </button>
                  <button
                    type="button"
                    className={imageMode === "full" ? "active" : ""}
                    onClick={() => setImageMode("full")}
                  >
                    <Maximize2 size={16} />
                    Full
                  </button>
                </div>
              )}
              {activeEntry.imageUrl && (
                <div
                  className={`screenshot-frame ${imageMode}`}
                  style={
                    {
                      "--focus-scale": activeEntry.focusScale ?? 1,
                      "--focus-origin": activeEntry.focusOrigin ?? "center top",
                      "--focus-height": activeEntry.focusHeight ?? "42rem"
                    } as CSSProperties
                  }
                >
                  <img src={activeEntry.imageUrl} alt={`${activeEntry.date} ${activeEntry.title}`} />
                </div>
              )}
            </article>
          </div>
        )}
      </div>
    </>
  );
}
