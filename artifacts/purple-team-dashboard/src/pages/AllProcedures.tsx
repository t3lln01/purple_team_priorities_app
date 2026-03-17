import { useState, useMemo, useEffect } from "react";
import { useSearch } from "wouter";
import data from "@/data.json";

type Procedure = {
  actor: string;
  mitreId: string;
  procedure: string;
  date: number | null;
  source: string;
  risk: number;
};

const allProcedures: Procedure[] = (data as any).allProcedures;

const uniqueActors = ["", ...Array.from(new Set(allProcedures.map(r => r.actor).filter(Boolean))).sort()];
const uniqueMitreIds = ["", ...Array.from(new Set(allProcedures.map(r => r.mitreId).filter(Boolean))).sort()];

const PAGE_SIZE = 30;

function formatDate(ms: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

function riskColor(r: number) {
  if (r >= 1500) return "text-red-400 bg-red-400/10 border border-red-400/30";
  if (r >= 1000) return "text-orange-400 bg-orange-400/10 border border-orange-400/30";
  if (r >= 500) return "text-yellow-400 bg-yellow-400/10 border border-yellow-400/30";
  return "text-green-400 bg-green-400/10 border border-green-400/30";
}

export default function AllProcedures() {
  const search = useSearch();
  const [actorFilter, setActorFilter] = useState("");
  const [mitreFilter, setMitreFilter] = useState(() => {
    const params = new URLSearchParams(search);
    return params.get("mitre") ?? "";
  });
  const [procedureSearch, setProcedureSearch] = useState("");
  const [minRisk, setMinRisk] = useState("");
  const [maxRisk, setMaxRisk] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const mitre = params.get("mitre") ?? "";
    setMitreFilter(mitre);
    setPage(1);
  }, [search]);

  const filtered = useMemo(() => {
    const lo = minRisk !== "" ? Number(minRisk) : -Infinity;
    const hi = maxRisk !== "" ? Number(maxRisk) : Infinity;
    return allProcedures.filter(row => {
      if (actorFilter && row.actor !== actorFilter) return false;
      if (mitreFilter && row.mitreId !== mitreFilter) return false;
      if (procedureSearch && !row.procedure.toLowerCase().includes(procedureSearch.toLowerCase())) return false;
      if (row.risk < lo || row.risk > hi) return false;
      return true;
    });
  }, [actorFilter, mitreFilter, procedureSearch, minRisk, maxRisk]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleFilterChange(fn: () => void) {
    fn();
    setPage(1);
  }

  function clearAll() {
    setActorFilter("");
    setMitreFilter("");
    setProcedureSearch("");
    setMinRisk("");
    setMaxRisk("");
    setPage(1);
  }

  const hasFilters = actorFilter || mitreFilter || procedureSearch || minRisk || maxRisk;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">All Procedures</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Full procedure list from MITRE ATT&amp;CK — {allProcedures.length.toLocaleString()} entries
        </p>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filters</span>
          {hasFilters && (
            <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground underline transition-colors">
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Actor / Group</label>
            <select
              value={actorFilter}
              onChange={e => handleFilterChange(() => setActorFilter(e.target.value))}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {uniqueActors.map(a => (
                <option key={a} value={a}>{a || "All actors"}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">MITRE ID</label>
            <select
              value={mitreFilter}
              onChange={e => handleFilterChange(() => setMitreFilter(e.target.value))}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {uniqueMitreIds.map(id => (
                <option key={id} value={id}>{id || "All IDs"}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 lg:col-span-1">
            <label className="text-xs text-muted-foreground font-medium">Procedure Search</label>
            <input
              type="search"
              placeholder="Search text…"
              value={procedureSearch}
              onChange={e => handleFilterChange(() => setProcedureSearch(e.target.value))}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Risk Min</label>
            <input
              type="number"
              placeholder="e.g. 500"
              value={minRisk}
              onChange={e => handleFilterChange(() => setMinRisk(e.target.value))}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Risk Max</label>
            <input
              type="number"
              placeholder="e.g. 1800"
              value={maxRisk}
              onChange={e => handleFilterChange(() => setMaxRisk(e.target.value))}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            Showing <span className="text-foreground font-semibold">{filtered.length.toLocaleString()}</span> of {allProcedures.length.toLocaleString()} procedures
          </span>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">Actor / Group</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">MITRE ID</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Procedure</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">Date</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">Source</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">Risk Score</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No procedures match the current filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-2.5 text-xs font-medium text-foreground whitespace-nowrap max-w-[160px] truncate" title={row.actor}>
                      {row.actor}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                        {row.mitreId}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[420px]">
                      <p className="line-clamp-2" title={row.procedure}>{row.procedure}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(row.date)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {row.source}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColor(row.risk)}`}>
                        {row.risk.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <span className="text-xs text-muted-foreground">
              Page {safePage} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(1)}
                disabled={safePage === 1}
                className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                «
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-2.5 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ‹ Prev
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
                return start + i;
              }).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    n === safePage
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-2.5 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next ›
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={safePage === totalPages}
                className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
