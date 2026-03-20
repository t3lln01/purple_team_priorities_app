import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useViews, SavedView, ViewProcedure, ViewActorRank } from "@/context/ViewContext";
import { Trash2, ChevronLeft } from "lucide-react";
import { useSortTable } from "@/hooks/useSortTable";
import SortableTh from "@/components/SortableTh";

const PAGE_SIZE = 30;

function riskColor(r: number) {
  if (r >= 1500) return "text-red-400 bg-red-400/10 border border-red-400/30";
  if (r >= 1000) return "text-orange-400 bg-orange-400/10 border border-orange-400/30";
  if (r >= 500) return "text-yellow-400 bg-yellow-400/10 border border-yellow-400/30";
  return "text-green-400 bg-green-400/10 border border-green-400/30";
}

function formatDate(ms: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

function BarRow({ label, value, max, color = "bg-primary" }: { label: string; value: number; max: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground w-36 truncate flex-shrink-0" title={label}>{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-14 text-right flex-shrink-0">
        {value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}

export default function ViewDetail() {
  const [, params] = useRoute("/view/:id");
  const { savedViews, deleteView, renameView } = useViews();

  const view = savedViews.find(v => v.id === params?.id) ?? null;

  const [actorFilter, setActorFilter] = useState("");
  const [tacticFilter, setTacticFilter] = useState("");
  const [mitreSearch, setMitreSearch] = useState("");
  const [procSearch, setProcSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(view?.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [arSortKey, setArSortKey] = useState<string | null>("score");
  const [arSortDir, setArSortDir] = useState<"asc" | "desc">("desc");
  const [pSortKey, setPSortKey] = useState<string | null>(null);
  const [pSortDir, setPSortDir] = useState<"asc" | "desc">("asc");

  function toggleArSort(key: string) {
    if (arSortKey === key) { setArSortDir(d => d === "asc" ? "desc" : "asc"); }
    else { setArSortKey(key); setArSortDir("asc"); }
  }
  function togglePSort(key: string) {
    if (pSortKey === key) { setPSortDir(d => d === "asc" ? "desc" : "asc"); }
    else { setPSortKey(key); setPSortDir("asc"); }
  }

  if (!view) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-muted-foreground">View not found or has been deleted.</p>
        <Link href="/data-sources">
          <button className="flex items-center gap-1.5 text-sm text-primary hover:underline">
            <ChevronLeft className="w-4 h-4" /> Back to Data Sources
          </button>
        </Link>
      </div>
    );
  }

  const { procedures, actorRanking } = view;
  const maxScore = actorRanking[0]?.score ?? 1;

  const uniqueActors = Array.from(new Set(procedures.map(p => p.actor))).sort();
  const uniqueTactics = Array.from(new Set(procedures.map(p => p.tacticName))).sort();

  const filtered = useMemo(() => procedures.filter(p => {
    if (actorFilter && p.actor !== actorFilter) return false;
    if (tacticFilter && p.tacticName !== tacticFilter) return false;
    if (mitreSearch && !p.mitreId.toLowerCase().includes(mitreSearch.toLowerCase())) return false;
    if (procSearch && !p.procedure.toLowerCase().includes(procSearch.toLowerCase()) &&
        !p.techniqueName.toLowerCase().includes(procSearch.toLowerCase())) return false;
    return true;
  }), [procedures, actorFilter, tacticFilter, mitreSearch, procSearch]);

  const sortedActorRanking = useMemo(() => {
    if (!arSortKey) return actorRanking;
    return [...actorRanking].sort((a, b) => {
      const av = (a as Record<string, unknown>)[arSortKey];
      const bv = (b as Record<string, unknown>)[arSortKey];
      let cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true });
      return arSortDir === "asc" ? cmp : -cmp;
    });
  }, [actorRanking, arSortKey, arSortDir]);

  const sortedFiltered = useMemo(() => {
    if (!pSortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = (a as Record<string, unknown>)[pSortKey];
      const bv = (b as Record<string, unknown>)[pSortKey];
      let cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true });
      return pSortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, pSortKey, pSortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sortedFiltered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const filteredRanking: ViewActorRank[] = actorFilter
    ? actorRanking.filter(a => a.actor === actorFilter)
    : actorRanking;

  const hasFilters = actorFilter || tacticFilter || mitreSearch || procSearch;

  function clearFilters() {
    setActorFilter(""); setTacticFilter(""); setMitreSearch(""); setProcSearch(""); setPage(1);
  }

  function saveName() {
    if (nameInput.trim()) renameView(view.id, nameInput.trim());
    setEditingName(false);
  }

  // Unique report refs across all procedures
  const totalReportRefs = new Set(procedures.flatMap(p => p.reportRefs)).size;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/data-sources">
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </Link>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  className="bg-input border border-ring rounded-lg px-2.5 py-1 text-xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button onClick={saveName} className="text-xs text-primary hover:underline">Save</button>
                <button onClick={() => setEditingName(false)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
              </div>
            ) : (
              <h1
                className="text-2xl font-bold text-foreground hover:text-primary cursor-pointer transition-colors"
                onClick={() => { setNameInput(view.name); setEditingName(true); }}
                title="Click to rename"
              >
                {view.name}
              </h1>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Generated view · {new Date(view.createdAt).toLocaleString()} · {view.meta.actorFiles.join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Delete this view?</span>
              <Link href="/data-sources">
                <button
                  onClick={() => deleteView(view.id)}
                  className="text-xs px-2.5 py-1 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  Yes, delete
                </button>
              </Link>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-border text-muted-foreground rounded-lg hover:text-red-400 hover:border-red-400/40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete view
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Actors", value: view.meta.totalActors, color: "text-primary" },
          { label: "Procedures", value: view.meta.totalProcedures.toLocaleString(), color: "text-chart-2" },
          { label: "Unique Techniques", value: new Set(procedures.map(p => p.mitreId)).size, color: "text-chart-3" },
          { label: "Report Refs", value: totalReportRefs, color: "text-chart-4" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-card-border rounded-xl p-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Actor ranking + chart */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Actor Ranking</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Sorted by total TTP risk score</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">#</th>
                  <SortableTh col="actor" sortKey={arSortKey} sortDir={arSortDir} toggle={toggleArSort}>Actor</SortableTh>
                  <SortableTh col="score" sortKey={arSortKey} sortDir={arSortDir} toggle={toggleArSort}>Score</SortableTh>
                  <SortableTh col="techniqueCount" sortKey={arSortKey} sortDir={arSortDir} toggle={toggleArSort}>Techs</SortableTh>
                  <SortableTh col="tacticCount" sortKey={arSortKey} sortDir={arSortDir} toggle={toggleArSort}>Tactics</SortableTh>
                  <SortableTh col="reportCount" sortKey={arSortKey} sortDir={arSortDir} toggle={toggleArSort}>Reports</SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedActorRanking.map((a, i) => (
                  <tr
                    key={a.actor}
                    className={`border-b border-border/50 hover:bg-accent/30 transition-colors cursor-pointer ${actorFilter === a.actor ? "bg-primary/10" : ""}`}
                    onClick={() => { setActorFilter(actorFilter === a.actor ? "" : a.actor); setPage(1); }}
                  >
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-foreground">{a.actor}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-primary">{a.score.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.techniqueCount}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.tacticCount}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.reportCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">TTP Risk by Actor</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Score = report refs × 100 + observables × 50</p>
          </div>
          <div className="p-4 space-y-3">
            {(filteredRanking.length > 0 ? filteredRanking : actorRanking).map(a => (
              <BarRow key={a.actor} label={a.actor} value={a.score} max={maxScore} />
            ))}
          </div>

          {/* Tactic breakdown */}
          <div className="border-t border-border p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tactic Coverage</h3>
            <div className="space-y-2">
              {(() => {
                const tacticCounts: Record<string, number> = {};
                const filtered2 = actorFilter ? procedures.filter(p => p.actor === actorFilter) : procedures;
                for (const p of filtered2) {
                  const key = p.tacticName;
                  tacticCounts[key] = (tacticCounts[key] ?? 0) + 1;
                }
                const maxCount = Math.max(...Object.values(tacticCounts), 1);
                return Object.entries(tacticCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tactic, count]) => (
                    <BarRow key={tactic} label={tactic} value={count} max={maxCount} color="bg-chart-4" />
                  ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Procedures table */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-foreground">Procedures</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Showing <span className="text-foreground font-semibold">{filtered.length.toLocaleString()}</span> of {procedures.length.toLocaleString()} procedures
              </p>
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground underline transition-colors">
                Clear filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select
              value={actorFilter}
              onChange={e => { setActorFilter(e.target.value); setPage(1); }}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All actors</option>
              {uniqueActors.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              value={tacticFilter}
              onChange={e => { setTacticFilter(e.target.value); setPage(1); }}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All tactics</option>
              {uniqueTactics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="search"
              placeholder="MITRE ID…"
              value={mitreSearch}
              onChange={e => { setMitreSearch(e.target.value); setPage(1); }}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="search"
              placeholder="Search procedures…"
              value={procSearch}
              onChange={e => { setProcSearch(e.target.value); setPage(1); }}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <SortableTh col="actor" sortKey={pSortKey} sortDir={pSortDir} toggle={togglePSort}>Actor</SortableTh>
                <SortableTh col="mitreId" sortKey={pSortKey} sortDir={pSortDir} toggle={togglePSort}>MITRE ID</SortableTh>
                <SortableTh col="techniqueName" sortKey={pSortKey} sortDir={pSortDir} toggle={togglePSort}>Technique</SortableTh>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Observable / Procedure</th>
                <SortableTh col="date" sortKey={pSortKey} sortDir={pSortDir} toggle={togglePSort}>Date</SortableTh>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Report Ref</th>
                <SortableTh col="risk" sortKey={pSortKey} sortDir={pSortDir} toggle={togglePSort}>Risk</SortableTh>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No procedures match the current filters.
                  </td>
                </tr>
              ) : pageRows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground whitespace-nowrap">{row.actor}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 w-fit">{row.mitreId}</span>
                      <span className="text-[10px] text-muted-foreground">{row.tacticName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground">
                    {row.techniqueName}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    <p>{row.procedure}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(row.date)}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {(() => {
                      const urlMatch = row.externalRef.match(/https?:\/\/\S+/);
                      const url = urlMatch?.[0] ?? null;
                      const label = url ? row.externalRef.replace(url, "").replace(/\s*-\s*$/, "").trim() : row.externalRef;
                      return (
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">{label || "—"}</p>
                          {url && (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[10px] block" title={url}>
                              ↗ {url}
                            </a>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColor(row.risk)}`}>
                      {row.risk.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
            <span className="text-xs text-muted-foreground">Page {safePage} of {totalPages}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(1)} disabled={safePage === 1} className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="px-2.5 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed">‹ Prev</button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
                return start + i;
              }).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${n === safePage ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"}`}>
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="px-2.5 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed">Next ›</button>
              <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
