import { ReactNode, useState, useEffect } from "react";
import { ArrowUpRight, Images, List, Maximize2 } from "lucide-react";
import type { DraftReportEntry } from "../types";
import type { TimelineEntry } from "../data/krynskyTimeline";
import { visibleEntryNotes } from "../helpers";
import { ScreenshotModal } from "./ScreenshotModal";

type NormalizedEntry = {
  date: string;
  title: string;
  notes: string;
  techStack: string;
  source: string;
  imageUrl: string | null;
  quality?: DraftReportEntry["screenshotQuality"];
  replacementOf?: string | null;
  replacementAttempts?: DraftReportEntry["replacementAttempts"];
};

function normalizeSeedEntry(entry: TimelineEntry): NormalizedEntry {
  return {
    date: entry.date,
    title: entry.title,
    notes: "",
    techStack: entry.techStack,
    source: entry.source,
    imageUrl: entry.image
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
    notes: visibleEntryNotes(entry.notes),
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
  const [displayMode, setDisplayMode] = useState<"timeline" | "image-only">("timeline");
  const [fullImage, setFullImage] = useState<{ url: string; alt: string; title: string } | null>(null);
  const activeEntry = entries[Math.min(activeEntryIndex, Math.max(entries.length - 1, 0))] ?? null;

  useEffect(() => {
    setActiveEntryIndex(0);
    setDisplayMode("timeline");
    setFullImage(null);
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
        <div className="timeline-display-mode" aria-label="Report display mode">
          <button
            type="button"
            className={displayMode === "timeline" ? "active" : ""}
            onClick={() => setDisplayMode("timeline")}
          >
            <List size={16} />
            Timeline
          </button>
          <button
            type="button"
            className={displayMode === "image-only" ? "active" : ""}
            onClick={() => setDisplayMode("image-only")}
          >
            <Images size={16} />
            Image Only
          </button>
        </div>
      </div>

      <div className="timeline-layout">
        <nav
          className={`timeline-nav${displayMode === "image-only" ? " image-only" : ""}`}
          aria-label="Timeline entries"
        >
          {entries.map((entry, index) => (
            <button
              key={`${entry.date}-${entry.source}`}
              type="button"
              className={index === activeEntryIndex ? "active" : ""}
              aria-label={`${entry.date.slice(0, 4)} ${entry.techStack}`}
              onClick={() => setActiveEntryIndex(index)}
            >
              {displayMode === "image-only" ? (
                <>
                  <span>{entry.date.slice(0, 4)}</span>
                  {entry.imageUrl ? (
                    <img src={entry.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <em>No image</em>
                  )}
                </>
              ) : (
                <>
                  <span>{entry.date.slice(0, 4)}</span>
                  {summarizeTechStack(entry.techStack)}
                </>
              )}
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
                    <dt>Tech stack / title</dt>
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
                {activeEntry.notes && <p className="timeline-entry-notes">{activeEntry.notes}</p>}
              </div>
              {activeEntry.imageUrl && (
                <button
                  type="button"
                  className="screenshot-frame screenshot-preview"
                  aria-label={`View full screenshot for ${activeEntry.date}`}
                  onClick={() =>
                    setFullImage({
                      url: activeEntry.imageUrl!,
                      alt: `${activeEntry.date} ${activeEntry.techStack}`,
                      title: `${activeEntry.date} ${activeEntry.techStack}`
                    })
                  }
                >
                  <img src={activeEntry.imageUrl} alt={`${activeEntry.date} ${activeEntry.techStack}`} />
                  <span className="screenshot-frame-hint">
                    <Maximize2 size={16} />
                    View full
                  </span>
                </button>
              )}
            </article>
          </div>
        )}
      </div>
      {fullImage && (
        <ScreenshotModal
          imageUrl={fullImage.url}
          alt={fullImage.alt}
          title={fullImage.title}
          onClose={() => setFullImage(null)}
        />
      )}
    </>
  );
}
