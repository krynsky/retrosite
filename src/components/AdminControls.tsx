import { useMemo, useState } from "react";
import { ArrowUpRight, Maximize2 } from "lucide-react";
import type { ReportJob, DraftReportEntry } from "../types";
import { reportEntryKey, entryQualityLabel, entryQualityTone, entryQualityDetails, visibleEntryNotes } from "../helpers";
import { ScreenshotModal } from "./ScreenshotModal";

function entryYear(entry: DraftReportEntry) {
  return entry.date.slice(0, 4);
}

function entryChoiceScore(entry: DraftReportEntry) {
  const quality = entry.screenshotQuality;
  if (!quality) return Number.NEGATIVE_INFINITY;
  return quality.qualityScore ?? quality.visualScore ?? 0;
}

function sortEntryChoices(a: DraftReportEntry, b: DraftReportEntry) {
  const scoreDifference = entryChoiceScore(b) - entryChoiceScore(a);
  if (scoreDifference !== 0) {
    return scoreDifference;
  }
  return a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp);
}

export function AdminControls({
  job,
  onJobChange
}: {
  job: ReportJob;
  onJobChange: (job: ReportJob) => void;
}) {
  const [curationSavingKey, setCurationSavingKey] = useState("");
  const [curationError, setCurationError] = useState("");
  const [editingEntryKey, setEditingEntryKey] = useState("");
  const [entryDraft, setEntryDraft] = useState({ notes: "", techStack: "" });
  const [fullImage, setFullImage] = useState<{ url: string; alt: string; title: string } | null>(null);

  const selectedEntries = job.report?.curatedEntries ?? [];
  const selectedEntriesByYear = useMemo(
    () => new Map(selectedEntries.map((entry) => [entryYear(entry), entry])),
    [selectedEntries]
  );
  const entryGroups = useMemo(() => {
    const groups = new Map<string, DraftReportEntry[]>();
    const renderedEntries = job.report?.entries?.filter((entry) => entry.screenshotStatus === "rendered") ?? [];
    for (const entry of renderedEntries) {
      const year = entryYear(entry);
      groups.set(year, [...(groups.get(year) ?? []), entry]);
    }

    for (const entry of selectedEntries) {
      const year = entryYear(entry);
      const existingEntries = groups.get(year) ?? [];
      if (!existingEntries.some((candidate) => reportEntryKey(candidate) === reportEntryKey(entry))) {
        groups.set(year, [...existingEntries, entry]);
      }
    }

    return [...groups.entries()]
      .map(([year, options]) => {
        const uniqueOptions = [...new Map(options.map((entry) => [reportEntryKey(entry), entry])).values()];
        const selectedEntry = selectedEntriesByYear.get(year) ?? null;
        return {
          year,
          selectedEntry,
          options: uniqueOptions.sort((a, b) => {
            const aSelected = selectedEntry ? reportEntryKey(a) === reportEntryKey(selectedEntry) : false;
            const bSelected = selectedEntry ? reportEntryKey(b) === reportEntryKey(selectedEntry) : false;
            if (aSelected !== bSelected) {
              return aSelected ? -1 : 1;
            }
            return sortEntryChoices(a, b);
          })
        };
      })
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [job.report?.entries, selectedEntries, selectedEntriesByYear]);

  async function updateEntryCuration(
    entry: DraftReportEntry,
    included?: boolean,
    edits?: Pick<DraftReportEntry, "notes" | "techStack">,
    options?: { replaceSelectedYear?: boolean }
  ) {
    const key = reportEntryKey(entry);
    setCurationSavingKey(key);
    setCurationError("");
    try {
      const response = await fetch(`/api/reports/${job.id}/entries`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timestamp: entry.timestamp,
          original: entry.original,
          ...(typeof included === "boolean" ? { included } : {}),
          ...(edits ? { notes: edits.notes, techStack: edits.techStack } : {}),
          ...(options?.replaceSelectedYear ? { replaceSelectedYear: true } : {})
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update report curation.");
      }
      onJobChange(payload);
      if (editingEntryKey === key) {
        setEditingEntryKey("");
      }
    } catch (caught) {
      setCurationError(caught instanceof Error ? caught.message : "Unable to update report curation.");
    } finally {
      setCurationSavingKey("");
    }
  }

  function startEntryEdit(entry: DraftReportEntry) {
    setEditingEntryKey(reportEntryKey(entry));
    setEntryDraft({ notes: visibleEntryNotes(entry.notes), techStack: entry.techStack });
    setCurationError("");
  }

  function cancelEntryEdit() {
    setEditingEntryKey("");
    setEntryDraft({ notes: "", techStack: "" });
  }

  async function saveEntryEdit(entry: DraftReportEntry) {
    await updateEntryCuration(entry, undefined, entryDraft);
  }

  async function setEntryThumbnail(entry: DraftReportEntry) {
    const key = reportEntryKey(entry);
    setCurationSavingKey(key);
    setCurationError("");
    try {
      const response = await fetch(`/api/reports/${job.id}/entries`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timestamp: entry.timestamp,
          original: entry.original,
          thumbnail: true
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update timeline thumbnail.");
      }
      onJobChange(payload);
    } catch (caught) {
      setCurationError(caught instanceof Error ? caught.message : "Unable to update timeline thumbnail.");
    } finally {
      setCurationSavingKey("");
    }
  }

  if (!job.report) {
    return null;
  }

  return (
    <section className="admin-controls" aria-label="Admin controls">
      {curationError && <p className="error-note">{curationError}</p>}

      <div className="generated-entry-list">
        {entryGroups.length === 0 && (
          <p className="warning-note">No rendered screenshots are available for curation yet.</p>
        )}
        {entryGroups.map(({ year, selectedEntry, options }) => {
          const entry = selectedEntry ?? options[0];
          const key = reportEntryKey(entry);
          const included = Boolean(selectedEntry);
          const saving = curationSavingKey === key;
          const editing = editingEntryKey === key;
          const qualityDetails = entryQualityDetails(entry);
          const isThumbnail = Boolean(job.report?.thumbnailEntryKey && job.report.thumbnailEntryKey === key);
          return (
            <article
              key={year}
              className={`generated-entry ${included ? "included" : "excluded"}`}
            >
              <div>
                <span>{year}</span>
                <em>{included ? "Included" : "Excluded"}</em>
                {editing ? (
                  <div className="entry-edit-form">
                    <label>
                      Tech stack / title
                      <input
                        value={entryDraft.techStack}
                        onChange={(event) =>
                          setEntryDraft((draft) => ({ ...draft, techStack: event.target.value }))
                        }
                        maxLength={220}
                      />
                    </label>
                    <label>
                      Notes
                      <textarea
                        value={entryDraft.notes}
                        onChange={(event) => setEntryDraft((draft) => ({ ...draft, notes: event.target.value }))}
                        rows={4}
                        maxLength={500}
                      />
                    </label>
                  </div>
                ) : (
                  <>
                    <dl className="generated-entry-meta">
                      <div>
                        <dt>Tech stack / title</dt>
                        <dd>{entry.techStack}</dd>
                      </div>
                    </dl>
                    {visibleEntryNotes(entry.notes) && <p>{visibleEntryNotes(entry.notes)}</p>}
                  </>
                )}
                <div className="entry-screenshot-choices">
                  <strong>
                    {options.length} rendered screenshot{options.length === 1 ? "" : "s"} for {year}
                  </strong>
                  <div className="screenshot-choice-grid">
                    {options.map((option) => {
                      const optionKey = reportEntryKey(option);
                      const optionSelected = selectedEntry ? optionKey === reportEntryKey(selectedEntry) : false;
                      const optionSaving = curationSavingKey === optionKey;
                      return (
                        <button
                          key={optionKey}
                          type="button"
                          className={`screenshot-choice ${optionSelected ? "active" : ""}`}
                          disabled={optionSaving || optionSelected}
                          onClick={() =>
                            void updateEntryCuration(option, true, undefined, { replaceSelectedYear: true })
                          }
                        >
                          {option.screenshotUrl && (
                            <img src={option.screenshotUrl} alt={`${option.date} rendered capture option`} />
                          )}
                          <span>{option.date}</span>
                          <em>{entryQualityLabel(option)}</em>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={`entry-quality ${entryQualityTone(entry)}`}>
                  <strong>{entryQualityLabel(entry)}</strong>
                  {qualityDetails.length > 0 ? (
                    <ul>
                      {qualityDetails.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : (
                    <span>No render caveats recorded.</span>
                  )}
                </div>
                <div className="generated-entry-actions">
                  <a href={entry.source} target="_blank" rel="noreferrer">
                    Wayback capture <ArrowUpRight size={15} />
                  </a>
                  {editing ? (
                    <>
                      <button
                        type="button"
                        className="primary-link compact"
                        disabled={saving}
                        onClick={() => void saveEntryEdit(entry)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="ghost-link compact"
                        disabled={saving}
                        onClick={cancelEntryEdit}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ghost-link compact"
                        disabled={saving}
                        onClick={() => startEntryEdit(entry)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost-link compact"
                        disabled={saving}
                        onClick={() => void updateEntryCuration(entry, !included)}
                      >
                        {included ? "Exclude" : "Include"}
                      </button>
                      {included && entry.screenshotUrl && (
                        <button
                          type="button"
                          className="ghost-link compact"
                          disabled={saving || isThumbnail}
                          onClick={() => void setEntryThumbnail(entry)}
                        >
                          {isThumbnail ? "Thumbnail" : "Use as thumbnail"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {entry.screenshotUrl && (
                <div className="generated-entry-preview">
                  <button
                    type="button"
                    className="screenshot-frame screenshot-preview"
                    aria-label={`View full screenshot for ${entry.date}`}
                    onClick={() =>
                      setFullImage({
                        url: entry.screenshotUrl!,
                        alt: `${entry.date} rendered capture`,
                        title: `${entry.date} ${entry.techStack}`
                      })
                    }
                  >
                    <img src={entry.screenshotUrl} alt={`${entry.date} rendered capture`} />
                    <span className="screenshot-frame-hint">
                      <Maximize2 size={16} />
                      View full
                    </span>
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {fullImage && (
        <ScreenshotModal
          imageUrl={fullImage.url}
          alt={fullImage.alt}
          title={fullImage.title}
          onClose={() => setFullImage(null)}
        />
      )}
    </section>
  );
}
