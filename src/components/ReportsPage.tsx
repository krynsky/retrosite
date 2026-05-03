import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { ReportJobSummary } from "../types";
import { useAppConfig } from "../useAppConfig";
import { seedReportCard } from "../reportCards";
import { SiteNav } from "./SiteNav";
import { ReportCard } from "./ReportCard";

const PAGE_SIZE = 12;
const STATUS_OPTIONS = ["all", "complete", "running", "queued", "failed", "incomplete", "canceled"] as const;

export function ReportsPage() {
  const [jobs, setJobs] = useState<ReportJobSummary[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { config, loaded: configLoaded } = useAppConfig();
  const admin = config.canEditReports;
  const requestOnlyMode = config.mode === "request-only";

  useEffect(() => {
    if (!configLoaded) {
      return;
    }

    if (requestOnlyMode) {
      setJobs([seedReportCard()]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/reports?limit=50");
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load reports.");
        if (!cancelled) setJobs(payload.jobs ?? []);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load reports.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [configLoaded, requestOnlyMode]);

  const filtered = jobs.filter((j) => {
    if (search && !j.host.toLowerCase().includes(search.toLowerCase())) return false;
    if (!requestOnlyMode && statusFilter !== "all" && j.status !== statusFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageJobs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function handleDelete(id: string) {
    try {
      const response = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Unable to delete report.");
      }
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete report.");
    }
  }

  return (
    <main className="page paper-bg">
      <SiteNav />
      <section className="reports-list-page">
        <div className="recent-head">
          <h1 className="recent-title">All Timelines</h1>
          <span className="recent-meta">{filtered.length} saved</span>
        </div>

        <div className="reports-filters">
          <label className="reports-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search by domain..."
            />
          </label>
          {!requestOnlyMode && (
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
              ))}
            </select>
          )}
        </div>

        {error && <p className="error-note">{error}</p>}
        {loading && <p>Loading reports...</p>}

        <div className="recent-grid recent-grid--all">
          {pageJobs.map((job) => (
            <ReportCard key={job.id} job={job} admin={admin} onDelete={handleDelete} />
          ))}
        </div>

        {!loading && filtered.length === 0 && <p>No timelines found.</p>}

        {totalPages > 1 && (
          <div className="reports-pagination">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page + 1} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </section>
    </main>
  );
}
