import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ReportJob, DraftReportEntry } from "../types";
import { reportEntryKey, entryQualityLabel, entryQualityTone, entryQualityDetails } from "../helpers";
import { ArrowUpRight } from "lucide-react";

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

  const selectedEntries = job.report?.curatedEntries ?? [];
  const selectedEntryKeys = useMemo(() => new Set(selectedEntries.map(reportEntryKey)), [selectedEntries]);
  const curatedEntriesByKey = useMemo(
    () => new Map(selectedEntries.map((entry) => [reportEntryKey(entry), entry])),
    [selectedEntries]
  );
  const entries = useMemo(() => {
    const renderedEntries = job.report?.entries?.filter((entry) => entry.screenshotStatus === "rendered") ?? [];
    return renderedEntries
      .map((entry) => curatedEntriesByKey.get(reportEntryKey(entry)) ?? entry)
      .sort((a, b) => {
        const aIncluded = selectedEntryKeys.has(reportEntryKey(a));
        const bIncluded = selectedEntryKeys.has(reportEntryKey(b));
        if (aIncluded !== bIncluded) {
          return aIncluded ? -1 : 1;
        }
        return a.date.localeCompare(b.date);
      });
  }, [curatedEntriesByKey, job.report?.entries, selectedEntryKeys]);

  async function updateEntryCuration(
    entry: DraftReportEntry,
    included?: boolean,
    edits?: Pick<DraftReportEntry, "title" | "notes" | "techStack">
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
          ...(edits ? { title: edits.title, notes: edits.notes, techStack: edits.techStack } : {})
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
        {entries.map((entry) => {
          const key = reportEntryKey(entry);
          const included = selectedEntryKeys.has(key);
          const saving = curationSavingKey === key;
          const editing = editingEntryKey === key;
          const qualityDetails = entryQualityDetails(entry);
          return (
            <article
              key={`${entry.date}-${entry.original}`}
              className={`generated-entry ${included ? "included" : "excluded"}`}
            >
              <div>
                <span>{entry.date}</span>
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
              {entry.screenshotUrl && <img src={entry.screenshotUrl} alt={`${entry.date} rendered capture`} />}
            </article>
          );
        })}
      </div>
    </section>
  );
}
