import { useMemo, useState, type CSSProperties } from "react";
import { ArrowUpRight, Maximize2, Sparkles, ZoomIn } from "lucide-react";
import type { ReportJob, DraftReportEntry } from "../types";
import { reportEntryKey, entryQualityLabel, entryQualityTone, entryQualityDetails } from "../helpers";

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
  const [entryDraft, setEntryDraft] = useState({ title: "", notes: "", techStack: "" });
  const [editingReport, setEditingReport] = useState(false);
  const [reportDraft, setReportDraft] = useState({ title: "", summary: "" });
  const [reportSaving, setReportSaving] = useState(false);
  const [reportError, setReportError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [entryImageModes, setEntryImageModes] = useState<Record<string, "focus" | "full">>({});

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
    edits?: Pick<DraftReportEntry, "title" | "notes" | "techStack">,
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
          ...(edits ? { title: edits.title, notes: edits.notes, techStack: edits.techStack } : {}),
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
    setEntryDraft({ title: entry.title, notes: entry.notes, techStack: entry.techStack });
    setCurationError("");
  }

  function cancelEntryEdit() {
    setEditingEntryKey("");
    setEntryDraft({ title: "", notes: "", techStack: "" });
  }

  async function saveEntryEdit(entry: DraftReportEntry) {
    await updateEntryCuration(entry, undefined, entryDraft);
  }

  function entryImageMode(year: string) {
    return entryImageModes[year] ?? "focus";
  }

  function setEntryImageMode(year: string, mode: "focus" | "full") {
    setEntryImageModes((modes) => ({ ...modes, [year]: mode }));
  }

  function startReportEdit() {
    if (!job.report) return;
    setEditingReport(true);
    setReportDraft({ title: job.report.title, summary: job.report.summary });
    setReportError("");
  }

  function cancelReportEdit() {
    setEditingReport(false);
    setReportDraft({ title: "", summary: "" });
  }

  async function updateReportDetails(patch: {
    title?: string;
    summary?: string;
    publicationStatus?: "draft" | "published";
  }) {
    setReportSaving(true);
    setReportError("");
    try {
      const response = await fetch(`/api/reports/${job.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update report details.");
      }
      onJobChange(payload);
      setEditingReport(false);
    } catch (caught) {
      setReportError(caught instanceof Error ? caught.message : "Unable to update report details.");
    } finally {
      setReportSaving(false);
    }
  }

  async function saveReportEdit() {
    await updateReportDetails(reportDraft);
  }

  async function deleteReport() {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    setDeleting(true);
    setReportError("");
    try {
      const response = await fetch(`/api/reports/${job.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to delete report.");
      }
      window.location.assign("/");
    } catch (caught) {
      setReportError(caught instanceof Error ? caught.message : "Unable to delete report.");
      setDeleting(false);
    }
  }

  if (!job.report) {
    return null;
  }

  return (
    <section className="admin-controls" aria-label="Admin controls">
      <div className="section-heading generated-report-heading">
        <span className="eyebrow">
          <Sparkles size={16} />
          {job.status === "incomplete"
            ? "Needs review"
            : job.report.publicationStatus === "published"
              ? "Published report"
              : "Generated draft"}
        </span>
        {editingReport ? (
          <div className="report-edit-form">
            <label>
              Report title
              <input
                value={reportDraft.title}
                onChange={(event) => setReportDraft((draft) => ({ ...draft, title: event.target.value }))}
                maxLength={140}
              />
            </label>
            <label>
              Summary
              <textarea
                value={reportDraft.summary}
                onChange={(event) => setReportDraft((draft) => ({ ...draft, summary: event.target.value }))}
                rows={4}
                maxLength={500}
              />
            </label>
          </div>
        ) : (
          <>
            <h2>{job.report.title}</h2>
            <p>{job.report.summary}</p>
          </>
        )}
      </div>

      <div className="generated-actions">
        {editingReport ? (
          <>
            <button
              type="button"
              className="primary-link compact"
              disabled={reportSaving}
              onClick={() => void saveReportEdit()}
            >
              Save report
            </button>
            <button
              type="button"
              className="ghost-link compact"
              disabled={reportSaving}
              onClick={cancelReportEdit}
            >
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="ghost-link compact" disabled={reportSaving} onClick={startReportEdit}>
            Edit report
          </button>
        )}
        <button
          type="button"
          className="primary-link compact"
          disabled={reportSaving || selectedEntries.length === 0 || job.status === "incomplete"}
          onClick={() =>
            void updateReportDetails({
              publicationStatus: job.report!.publicationStatus === "published" ? "draft" : "published"
            })
          }
        >
          {job.report.publicationStatus === "published" ? "Return to draft" : "Publish draft"}
        </button>
        <button
          type="button"
          className="ghost-link compact"
          disabled={deleting || reportSaving}
          onClick={() => void deleteReport()}
        >
          Delete report
        </button>
      </div>

      {reportError && <p className="error-note">{reportError}</p>}
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
                      Title
                      <input
                        value={entryDraft.title}
                        onChange={(event) => setEntryDraft((draft) => ({ ...draft, title: event.target.value }))}
                        maxLength={140}
                      />
                    </label>
                    <label>
                      Tech stack
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
                    <h3>{entry.title}</h3>
                    <dl className="generated-entry-meta">
                      <div>
                        <dt>Tech stack</dt>
                        <dd>{entry.techStack}</dd>
                      </div>
                    </dl>
                    <p>{entry.notes}</p>
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
                    </>
                  )}
                </div>
              </div>
              {entry.screenshotUrl && (
                <div className="generated-entry-preview">
                  <div className="image-mode-toggle edit-image-mode-toggle" aria-label={`${year} screenshot view mode`}>
                    <button
                      type="button"
                      className={entryImageMode(year) === "focus" ? "active" : ""}
                      onClick={() => setEntryImageMode(year, "focus")}
                    >
                      <ZoomIn size={16} />
                      Focus
                    </button>
                    <button
                      type="button"
                      className={entryImageMode(year) === "full" ? "active" : ""}
                      onClick={() => setEntryImageMode(year, "full")}
                    >
                      <Maximize2 size={16} />
                      Full
                    </button>
                  </div>
                  <div
                    className={`screenshot-frame ${entryImageMode(year)}`}
                    style={
                      {
                        "--focus-scale": 1,
                        "--focus-origin": "center top",
                        "--focus-height": "32rem"
                      } as CSSProperties
                    }
                  >
                    <img src={entry.screenshotUrl} alt={`${entry.date} rendered capture`} />
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
