import { useState, useMemo } from "react";
import { Link } from "wouter";
import data from "@/data.json";
import { useSortTable } from "@/hooks/useSortTable";
import SortableTh from "@/components/SortableTh";
import { Pencil, Check, X, RotateCcw } from "lucide-react";

type Actor = {
  name: string;
  intent: number;
  capability: number;
  ttpRisk: number;
  priority: number;
  riskPct: number;
};

type ActorRanking = {
  name: string;
  riskSum: number;
};

type Procedure = { actor: string; [key: string]: any };

const baseActors: Actor[] = (data as any).actors;
const actorRanking: ActorRanking[] = (data as any).actorRanking;
const allProcedures: Procedure[] = (data as any).allProcedures;

const procedureActors: string[] = Array.from(
  new Set(allProcedures.map(r => r.actor).filter(Boolean))
).sort();

const LS_KEY = "pt_actor_overrides";

type Overrides = Record<string, { intent?: number; capability?: number }>;

function loadOverrides(): Overrides {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); }
  catch { return {}; }
}
function saveOverrides(ov: Overrides) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(ov)); } catch {}
}

function riskColor(pct: number) {
  if (pct >= 0.8) return "text-red-400 bg-red-400/10 border border-red-400/30";
  if (pct >= 0.5) return "text-orange-400 bg-orange-400/10 border border-orange-400/30";
  if (pct >= 0.3) return "text-yellow-400 bg-yellow-400/10 border border-yellow-400/30";
  return "text-green-400 bg-green-400/10 border border-green-400/30";
}

function riskLabel(pct: number) {
  if (pct >= 0.8) return "Critical";
  if (pct >= 0.5) return "High";
  if (pct >= 0.3) return "Medium";
  return "Low";
}

function BarChart({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-16 text-right">
        {value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}

function ScoreSelect({
  value,
  onChange,
  color = "text-chart-2",
}: {
  value: number;
  onChange: (v: number) => void;
  color?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className={`bg-input border border-ring rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring w-16 ${color}`}
    >
      {[1, 2, 3, 4, 5, 6, 7].map(n => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  );
}

const RISK_LEVELS = ["All", "Critical", "High", "Medium", "Low"] as const;
type RiskLevel = typeof RISK_LEVELS[number];

export default function ActorPrioritisation() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskLevel>("All");
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());
  const [chipSearch, setChipSearch] = useState("");

  const [overrides, setOverrides] = useState<Overrides>(loadOverrides);
  const [editName, setEditName] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ intent: number; capability: number }>({ intent: 1, capability: 1 });

  const maxRisk = Math.max(...actorRanking.map(a => a.riskSum));

  const actors: Actor[] = useMemo(() => {
    const merged = baseActors.map(a => {
      const ov = overrides[a.name] ?? {};
      const intent = ov.intent ?? a.intent;
      const capability = ov.capability ?? a.capability;
      const priority = intent * capability * a.ttpRisk;
      return { ...a, intent, capability, priority };
    });
    const maxP = Math.max(...merged.map(a => a.priority), 1);
    return merged.map(a => ({ ...a, riskPct: a.priority / maxP }));
  }, [overrides]);

  function startEdit(actor: Actor) {
    setEditName(actor.name);
    setEditForm({ intent: actor.intent, capability: actor.capability });
  }

  function commitEdit() {
    if (!editName) return;
    const next: Overrides = { ...overrides, [editName]: editForm };
    setOverrides(next);
    saveOverrides(next);
    setEditName(null);
  }

  function cancelEdit() { setEditName(null); }

  function resetActor(name: string) {
    const next = { ...overrides };
    delete next[name];
    setOverrides(next);
    saveOverrides(next);
  }

  function hasOverride(name: string) {
    return !!overrides[name];
  }

  function toggleActor(name: string) {
    setSelectedActors(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function clearActors() {
    setSelectedActors(new Set());
  }

  const filtered = useMemo(() => actors.filter(actor => {
    const matchSearch = !search || actor.name.toLowerCase().includes(search.toLowerCase());
    const matchRisk = riskFilter === "All" || riskLabel(actor.riskPct) === riskFilter;
    const matchChips = selectedActors.size === 0 ||
      [...selectedActors].some(s => s.toLowerCase() === actor.name.toLowerCase());
    return matchSearch && matchRisk && matchChips;
  }), [actors, search, riskFilter, selectedActors]);

  const filteredRanking = useMemo(() => {
    if (selectedActors.size > 0) {
      return actorRanking.filter(a =>
        [...selectedActors].some(s => s.toLowerCase() === a.name.toLowerCase())
      );
    }
    return actorRanking.filter(a =>
      filtered.some(f => f.name.toLowerCase() === a.name.toLowerCase())
    );
  }, [filtered, selectedActors]);

  const { sortKey: sk1, sortDir: sd1, toggle: tog1, sorted: sortedActors } = useSortTable(filtered);
  const { sortKey: sk2, sortDir: sd2, toggle: tog2, sorted: sortedAll } = useSortTable(actors);

  const visibleChips = chipSearch
    ? procedureActors.filter(a => a.toLowerCase().includes(chipSearch.toLowerCase()))
    : procedureActors;

  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Final Actor Prioritisation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Threat actor ranking based on intent, capability, and TTP risk scores
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-primary">
            {filtered.length}<span className="text-base text-muted-foreground font-normal"> / {actors.length}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">Tracked Actors</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-red-400">{filtered.filter(a => a.riskPct >= 0.5).length}</div>
          <div className="text-sm text-muted-foreground mt-1">High/Critical Priority</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-chart-2">{procedureActors.length}</div>
          <div className="text-sm text-muted-foreground mt-1">Actors in Procedures</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Search actors..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-xs bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex gap-1.5">
          {RISK_LEVELS.map(level => (
            <button
              key={level}
              onClick={() => setRiskFilter(level)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                riskFilter === level
                  ? level === "All"
                    ? "bg-primary text-primary-foreground border-primary"
                    : level === "Critical"
                    ? "bg-red-500/20 text-red-400 border-red-500/50"
                    : level === "High"
                    ? "bg-orange-500/20 text-orange-400 border-orange-500/50"
                    : level === "Medium"
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                    : "bg-green-500/20 text-green-400 border-green-500/50"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        {(search || riskFilter !== "All") && (
          <button
            onClick={() => { setSearch(""); setRiskFilter("All"); }}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Actor Priority Rankings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Sorted by combined priority score</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">#</th>
                  <SortableTh col="name" sortKey={sk1} sortDir={sd1} toggle={tog1}>Actor</SortableTh>
                  <SortableTh col="intent" sortKey={sk1} sortDir={sd1} toggle={tog1}>Intent</SortableTh>
                  <SortableTh col="capability" sortKey={sk1} sortDir={sd1} toggle={tog1}>Cap.</SortableTh>
                  <SortableTh col="riskPct" sortKey={sk1} sortDir={sd1} toggle={tog1}>Risk %</SortableTh>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Level</th>
                </tr>
              </thead>
              <tbody>
                {sortedActors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No actors match the current filter.
                    </td>
                  </tr>
                ) : (
                  sortedActors.map((actor, i) => (
                    <tr key={actor.name} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <Link href={`/all-procedures?actor=${encodeURIComponent(actor.name)}`}>
                          <span className={`font-medium hover:text-primary hover:underline cursor-pointer transition-colors ${hasOverride(actor.name) ? "text-primary" : "text-foreground"}`} title="View procedures for this actor">
                            {actor.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 7 }).map((_, j) => (
                            <div key={j} className={`w-2 h-2 rounded-sm ${j < actor.intent ? "bg-primary" : "bg-muted"}`} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 7 }).map((_, j) => (
                            <div key={j} className={`w-2 h-2 rounded-sm ${j < actor.capability ? "bg-chart-2" : "bg-muted"}`} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{(actor.riskPct * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColor(actor.riskPct)}`}>
                          {riskLabel(actor.riskPct)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-foreground">TTP Risk by Actor</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Sum of evaluated TTP risks</p>
            </div>
            <div className="p-4 space-y-3">
              {(filteredRanking.length > 0 ? filteredRanking : actorRanking).slice(0, 15).map(a => (
                <div key={a.name}>
                  <div className="flex justify-between mb-1">
                    <Link href={`/all-procedures?actor=${encodeURIComponent(a.name)}`}>
                      <span className="text-xs text-foreground hover:text-primary hover:underline cursor-pointer transition-colors" title="View procedures">
                        {a.name}
                      </span>
                    </Link>
                  </div>
                  <BarChart value={a.riskSum} max={maxRisk} />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-foreground">Active Monitoring</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select actors to filter the ranking and TTP chart
                    {selectedActors.size > 0 && (
                      <span className="ml-2 text-primary font-medium">({selectedActors.size} selected)</span>
                    )}
                  </p>
                </div>
                {selectedActors.size > 0 && (
                  <button
                    onClick={clearActors}
                    className="text-xs text-muted-foreground hover:text-foreground underline transition-colors flex-shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="search"
                placeholder="Search actors…"
                value={chipSearch}
                onChange={e => setChipSearch(e.target.value)}
                className="mt-2 w-full bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="p-3 max-h-52 overflow-y-auto">
              <div className="flex flex-wrap gap-1.5">
                {visibleChips.map(actor => {
                  const active = selectedActors.has(actor);
                  return (
                    <button
                      key={actor}
                      onClick={() => toggleActor(actor)}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                      }`}
                    >
                      {actor}
                    </button>
                  );
                })}
                {visibleChips.length === 0 && (
                  <span className="text-xs text-muted-foreground">No actors match.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Editable Full Detail Table ───────────────────────────────────────── */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">All Actors — Full Detail</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click <Pencil className="inline w-3 h-3 mx-0.5" /> to edit Intent (1–7) or Capability (1–7) per actor.
              Derived columns recalculate automatically using{" "}
              <span className="font-mono text-[11px] text-primary">Priority = Intent × Capability × TTP Risk</span>
            </p>
          </div>
          {overrideCount > 0 && (
            <button
              onClick={() => { setOverrides({}); saveOverrides({}); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 hover:bg-accent transition-colors flex-shrink-0"
            >
              <RotateCcw className="w-3 h-3" /> Reset all ({overrideCount})
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">#</th>
                <SortableTh col="name" sortKey={sk2} sortDir={sd2} toggle={tog2}>Actor</SortableTh>
                <SortableTh col="intent" sortKey={sk2} sortDir={sd2} toggle={tog2}>Intent Score</SortableTh>
                <SortableTh col="capability" sortKey={sk2} sortDir={sd2} toggle={tog2}>Capability Score</SortableTh>
                <SortableTh col="ttpRisk" sortKey={sk2} sortDir={sd2} toggle={tog2}>TTP Risk Score</SortableTh>
                <SortableTh col="priority" sortKey={sk2} sortDir={sd2} toggle={tog2}>Priority Value</SortableTh>
                <SortableTh col="riskPct" sortKey={sk2} sortDir={sd2} toggle={tog2}>Risk %</SortableTh>
                <th className="w-20 px-3 py-2.5 text-xs text-muted-foreground font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAll.map((actor, i) => {
                const isEditing = editName === actor.name;
                const edited = hasOverride(actor.name);
                return (
                  <tr
                    key={actor.name}
                    className={`border-b border-border/50 transition-colors ${isEditing ? "bg-primary/5" : edited ? "bg-yellow-500/5 hover:bg-yellow-500/10" : "hover:bg-accent/30"}`}
                  >
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{i + 1}</td>

                    {/* Actor name */}
                    <td className="px-4 py-2.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/all-procedures?actor=${encodeURIComponent(actor.name)}`}>
                          <span className={`font-semibold hover:text-primary hover:underline cursor-pointer transition-colors ${edited ? "text-primary" : "text-foreground"}`}>
                            {actor.name}
                          </span>
                        </Link>
                        {edited && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 font-medium">
                            edited
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Intent Score */}
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <ScoreSelect
                          value={editForm.intent}
                          onChange={v => setEditForm(f => ({ ...f, intent: v }))}
                          color="text-chart-2"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 7 }).map((_, j) => (
                              <div key={j} className={`w-2.5 h-2.5 rounded-sm ${j < actor.intent ? "bg-chart-2" : "bg-muted"}`} />
                            ))}
                          </div>
                          <span className="text-xs font-semibold text-chart-2">{actor.intent}</span>
                        </div>
                      )}
                    </td>

                    {/* Capability Score */}
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <ScoreSelect
                          value={editForm.capability}
                          onChange={v => setEditForm(f => ({ ...f, capability: v }))}
                          color="text-chart-3"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 7 }).map((_, j) => (
                              <div key={j} className={`w-2.5 h-2.5 rounded-sm ${j < actor.capability ? "bg-chart-3" : "bg-muted"}`} />
                            ))}
                          </div>
                          <span className="text-xs font-semibold text-chart-3">{actor.capability}</span>
                        </div>
                      )}
                    </td>

                    {/* TTP Risk Score — read-only */}
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                      {actor.ttpRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>

                    {/* Priority Value — derived */}
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground font-semibold">
                      {actor.priority.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>

                    {/* Risk % — derived */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden flex-shrink-0">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${actor.riskPct * 100}%` }} />
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${riskColor(actor.riskPct)}`}>
                          {(actor.riskPct * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={commitEdit}
                              className="p-1 rounded text-green-400 hover:bg-green-400/10 transition-colors"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 rounded text-muted-foreground hover:bg-accent transition-colors"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(actor)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                              title="Edit intent & capability"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {edited && (
                              <button
                                onClick={() => resetActor(actor.name)}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                title="Reset to original"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border bg-muted/10 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{actors.length}</span> actors total
          {overrideCount > 0 && (
            <span className="ml-3 text-yellow-400">
              {overrideCount} override{overrideCount !== 1 ? "s" : ""} applied
            </span>
          )}
          <span className="ml-3 text-muted-foreground/60">
            TTP Risk Score is read-only (derived from procedure data) · Priority = Intent × Capability × TTP Risk · Risk % = Priority / max(Priority)
          </span>
        </div>
      </div>
    </div>
  );
}
