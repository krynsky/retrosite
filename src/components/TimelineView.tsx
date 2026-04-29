import { CSSProperties, useState, useEffect } from "react";
import { ArrowUpRight, ZoomIn, Maximize2 } from "lucide-react";
import type { DraftReportEntry } from "../types";
import type { TimelineEntry } from "../data/krynskyTimeline";
import { entryQualityLabel, entryQualityTone } from "../helpers";

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
  title,
  seedEntries,
  generatedEntries
}: {
  title: string;
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
        <h1>{title}</h1>
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
              {entry.techStack}
            </button>
          ))}
        </nav>

        {activeEntry && (
          <div className="timeline-main">
            <article className="timeline-detail">
              <div className="detail-copy">
                <span>{activeEntry.date}</span>
                <h3>{activeEntry.title}</h3>
                <p>{activeEntry.notes}</p>
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
                {isGenerated && activeEntry.quality && (
                  <div className={`entry-quality ${entryQualityTone({
                    screenshotStatus: "rendered",
                    screenshotQuality: activeEntry.quality,
                    replacementOf: activeEntry.replacementOf ?? null,
                    replacementAttempts: activeEntry.replacementAttempts ?? []
                  } as DraftReportEntry)}`}>
                    <strong>{entryQualityLabel({
                      screenshotStatus: "rendered",
                      screenshotQuality: activeEntry.quality,
                      replacementOf: activeEntry.replacementOf ?? null,
                      replacementAttempts: activeEntry.replacementAttempts ?? []
                    } as DraftReportEntry)}</strong>
                  </div>
                )}
              </div>
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
