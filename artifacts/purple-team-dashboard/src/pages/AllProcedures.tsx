import { useState, useMemo, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import data from "@/data.json";

type Procedure = {
  actor: string;
  mitreId: string;
  externalRef: string;
  procedure: string;
  date: number | null;
  risk: number;
};

const allProcedures: Procedure[] = (data as any).allProcedures;
const techTacticMap: Record<string, string[]> = (data as any).techTacticMap ?? {};

const procedureActors: string[] = Array.from(
  new Set(allProcedures.map(r => r.actor).filter(Boolean))
).sort();

const allMitreIds: string[] = Array.from(
  new Set(allProcedures.map(r => r.mitreId).filter(Boolean))
).sort();

const allTactics: string[] = Array.from(
  new Set(
    allMitreIds.flatMap(id => techTacticMap[id] ?? [])
  )
).sort();

function matchActor(name: string): string {
  if (!name) return "";
  const lower = name.toLowerCase();
  return procedureActors.find(a => a.toLowerCase() === lower) ?? "";
}

function mitreIdsForTactic(tactic: string): Set<string> {
  if (!tactic) return new Set(allMitreIds);
  return new Set(
    allMitreIds.filter(id => (techTacticMap[id] ?? []).includes(tactic))
  );
}

const PAGE_SIZE = 30;

function formatDate(ms: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

function parseExternalRef(ref: string): { label: string; url: string | null } {
  if (!ref) return { label: "—", url: null };
  const urlMatch = ref.match(/https?:\/\/\S+/);
  const url = urlMatch ? urlMatch[0] : null;
  const label = url ? ref.replace(url, "").replace(/\s*-\s*$/, "").trim() : ref.trim();
  return { label, url };
}

function riskColor(r: number) {
  if (r >= 1500) return "text-red-400 bg-red-400/10 border border-red-400/30";
  if (r >= 1000) return "text-orange-400 bg-orange-400/10 border border-orange-400/30";
  if (r >= 500) return "text-yellow-400 bg-yellow-400/10 border border-yellow-400/30";
  return "text-green-400 bg-green-400/10 border border-green-400/30";
}

function ActorMultiSelect({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chipSearch, setChipSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  function toggle(actor: string) {
    const next = new Set(selected);
    next.has(actor) ? next.delete(actor) : next.add(actor);
    onChange(next);
  }

  const visible = chipSearch
    ? procedureActors.filter(a => a.toLowerCase().includes(chipSearch.toLowerCase()))
    : procedureActors;

  const label =
    selected.size === 0 ? "All actors" :
    selected.size === 1 ? [...selected][0] :
    `${selected.size} actors`;

  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      <label className="text-xs text-muted-foreground font-medium">Actor / Group</label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center justify-between gap-2 bg-input border rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${open ? "border-ring" : "border-border"} ${selected.size > 0 ? "text-primary" : "text-foreground"}`}
      >
        <span className="truncate">{label}</span>
        <span className="text-muted-foreground flex-shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {[...selected].map(a => (
            <span key={a} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary">
              {a}
              <button onClick={() => toggle(a)} className="hover:text-red-400 transition-colors leading-none" title="Remove">×</button>
            </span>
          ))}
          <button onClick={() => onChange(new Set())} className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors">Clear</button>
        </div>
      )}

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <input type="search" autoFocus placeholder="Search actors…" value={chipSearch} onChange={e => setChipSearch(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="max-h-56 overflow-y-auto p-2 flex flex-col gap-0.5">
            {visible.length === 0 ? (
              <span className="text-xs text-muted-foreground px-2 py-1">No actors found.</span>
            ) : visible.map(actor => {
              const active = selected.has(actor);
              return (
                <button key={actor} onClick={() => toggle(actor)}
                  className={`flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-accent"}`}>
                  <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[9px] transition-colors ${active ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                    {active ? "✓" : ""}
                  </span>
                  <span className="truncate">{actor}</span>
                </button>
              );
            })}
          </div>
          {selected.size > 0 && (
            <div className="border-t border-border p-2">
              <button onClick={() => onChange(new Set())} className="w-full text-xs text-muted-foreground hover:text-foreground text-center underline transition-colors">
                Clear all ({selected.size})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MitreMultiSelect({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tacticFilter, setTacticFilter] = useState("");
  const [idSearch, setIdSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  const tacticIds = useMemo(() => mitreIdsForTactic(tacticFilter), [tacticFilter]);

  const visible = useMemo(() => {
    let ids = [...tacticIds];
    if (idSearch) ids = ids.filter(id => id.toLowerCase().includes(idSearch.toLowerCase()));
    return ids;
  }, [tacticIds, idSearch]);

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  }

  function selectAllVisible() {
    const next = new Set(selected);
    visible.forEach(id => next.add(id));
    onChange(next);
  }

  function clearVisible() {
    const next = new Set(selected);
    visible.forEach(id => next.delete(id));
    onChange(next);
  }

  const label =
    selected.size === 0 ? "All IDs" :
    selected.size === 1 ? [...selected][0] :
    `${selected.size} techniques`;

  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      <label className="text-xs text-muted-foreground font-medium">MITRE ID / Tactic</label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center justify-between gap-2 bg-input border rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${open ? "border-ring" : "border-border"} ${selected.size > 0 ? "text-primary" : "text-foreground"}`}
      >
        <span className="truncate">{label}</span>
        <span className="text-muted-foreground flex-shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {[...selected].slice(0, 8).map(id => (
            <span key={id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary font-mono">
              {id}
              <button onClick={() => toggle(id)} className="hover:text-red-400 transition-colors leading-none" title="Remove">×</button>
            </span>
          ))}
          {selected.size > 8 && (
            <span className="text-[10px] text-muted-foreground">+{selected.size - 8} more</span>
          )}
          <button onClick={() => onChange(new Set())} className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors">Clear</button>
        </div>
      )}

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-72 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border space-y-2">
            <select
              value={tacticFilter}
              onChange={e => setTacticFilter(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All tactics ({allMitreIds.length} IDs)</option>
              {allTactics.map(t => (
                <option key={t} value={t}>{t} ({[...mitreIdsForTactic(t)].length} IDs)</option>
              ))}
            </select>
            <input
              type="search"
              autoFocus
              placeholder="Search technique ID…"
              value={idSearch}
              onChange={e => setIdSearch(e.target.value)}
              className="w-full bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button onClick={selectAllVisible} className="flex-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5 hover:bg-accent transition-colors">
                Select all ({visible.length})
              </button>
              <button onClick={clearVisible} className="flex-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5 hover:bg-accent transition-colors">
                Clear visible
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto p-2 flex flex-col gap-0.5">
            {visible.length === 0 ? (
              <span className="text-xs text-muted-foreground px-2 py-1">No techniques found.</span>
            ) : visible.map(id => {
              const active = selected.has(id);
              const tactics = techTacticMap[id] ?? [];
              return (
                <button key={id} onClick={() => toggle(id)}
                  className={`flex items-start gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-accent"}`}>
                  <span className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[9px] transition-colors ${active ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                    {active ? "✓" : ""}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="font-mono font-semibold">{id}</span>
                    {tactics.length > 0 && (
                      <span className="text-[10px] text-muted-foreground truncate">{tactics.join(", ")}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div className="border-t border-border p-2">
              <button onClick={() => onChange(new Set())} className="w-full text-xs text-muted-foreground hover:text-foreground text-center underline transition-colors">
                Clear all ({selected.size})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AllProcedures() {
  const search = useSearch();

  const [selectedActors, setSelectedActors] = useState<Set<string>>(() => {
    const params = new URLSearchParams(search);
    const actor = matchActor(params.get("actor") ?? "");
    return actor ? new Set([actor]) : new Set();
  });

  const [selectedMitreIds, setSelectedMitreIds] = useState<Set<string>>(() => {
    const params = new URLSearchParams(search);
    const mitre = params.get("mitre") ?? "";
    return mitre && allMitreIds.includes(mitre) ? new Set([mitre]) : new Set();
  });

  const [procedureSearch, setProcedureSearch] = useState("");
  const [minRisk, setMinRisk] = useState("");
  const [maxRisk, setMaxRisk] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const actor = matchActor(params.get("actor") ?? "");
    setSelectedActors(actor ? new Set([actor]) : new Set());
    const mitre = params.get("mitre") ?? "";
    setSelectedMitreIds(mitre && allMitreIds.includes(mitre) ? new Set([mitre]) : new Set());
    setPage(1);
  }, [search]);

  const filtered = useMemo(() => {
    const lo = minRisk !== "" ? Number(minRisk) : -Infinity;
    const hi = maxRisk !== "" ? Number(maxRisk) : Infinity;
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    const toMs = dateTo ? new Date(dateTo).getTime() + 86400000 - 1 : Infinity;
    return allProcedures.filter(row => {
      if (selectedActors.size > 0 && !selectedActors.has(row.actor)) return false;
      if (selectedMitreIds.size > 0 && !selectedMitreIds.has(row.mitreId)) return false;
      if (procedureSearch && !row.procedure.toLowerCase().includes(procedureSearch.toLowerCase())) return false;
      if (row.risk < lo || row.risk > hi) return false;
      if (row.date !== null && (row.date < fromMs || row.date > toMs)) return false;
      return true;
    });
  }, [selectedActors, selectedMitreIds, procedureSearch, minRisk, maxRisk, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleFilterChange(fn: () => void) { fn(); setPage(1); }

  function clearAll() {
    setSelectedActors(new Set());
    setSelectedMitreIds(new Set());
    setProcedureSearch("");
    setMinRisk("");
    setMaxRisk("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const hasFilters = selectedActors.size > 0 || selectedMitreIds.size > 0 || procedureSearch || minRisk || maxRisk || dateFrom || dateTo;

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
            <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground underline transition-colors">Clear all</button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-start">
          <ActorMultiSelect selected={selectedActors} onChange={next => { setSelectedActors(next); setPage(1); }} />

          <MitreMultiSelect selected={selectedMitreIds} onChange={next => { setSelectedMitreIds(next); setPage(1); }} />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Procedure Search</label>
            <input type="search" placeholder="Search text…" value={procedureSearch}
              onChange={e => handleFilterChange(() => setProcedureSearch(e.target.value))}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Risk Min</label>
            <input type="number" placeholder="e.g. 500" value={minRisk}
              onChange={e => handleFilterChange(() => setMinRisk(e.target.value))}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Risk Max</label>
            <input type="number" placeholder="e.g. 1800" value={maxRisk}
              onChange={e => handleFilterChange(() => setMaxRisk(e.target.value))}
              className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Date From</label>
              <input type="date" value={dateFrom} onChange={e => handleFilterChange(() => setDateFrom(e.target.value))}
                className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:dark]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Date To</label>
              <input type="date" value={dateTo} onChange={e => handleFilterChange(() => setDateTo(e.target.value))}
                className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:dark]" />
            </div>
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
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">External Reference</th>
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
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 w-fit">
                          {row.mitreId}
                        </span>
                        {(techTacticMap[row.mitreId] ?? []).length > 0 && (
                          <span className="text-[10px] text-muted-foreground leading-tight">
                            {(techTacticMap[row.mitreId] ?? []).join(", ")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[420px]">
                      <p className="line-clamp-2" title={row.procedure}>{row.procedure}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(row.date)}
                    </td>
                    <td className="px-4 py-2.5 text-xs max-w-[260px]">
                      {(() => {
                        const { label, url } = parseExternalRef(row.externalRef);
                        return (
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground line-clamp-2" title={label}>{label || "—"}</p>
                            {url && (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block max-w-full text-[10px]" title={url}>
                                ↗ {url.replace(/^https?:\/\//, "").substring(0, 45)}{url.length > 53 ? "…" : ""}
                              </a>
                            )}
                          </div>
                        );
                      })()}
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
            <span className="text-xs text-muted-foreground">Page {safePage} of {totalPages}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(1)} disabled={safePage === 1}
                className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">«</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                className="px-2.5 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">‹ Prev</button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(safePage - 3, totalPages - 6));
                return start + i;
              }).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${n === safePage ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"}`}>
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                className="px-2.5 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next ›</button>
              <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
                className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
