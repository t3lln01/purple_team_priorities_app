import { useState, useMemo } from "react";
import { Link } from "wouter";
import data from "@/data.json";
import { useSortTable } from "@/hooks/useSortTable";
import SortableTh from "@/components/SortableTh";
import { Pencil, Check, X, RotateCcw, Trash2, Plus, Undo2, ChevronDown, ChevronUp } from "lucide-react";

type Actor = {
  name: string;
  intent: number;
  capability: number;
  ttpRisk: number;
  priority: number;
  riskPct: number;
  isCustom?: boolean;
};

type ActorRanking = { name: string; riskSum: number };
type Procedure = { actor: string; [key: string]: any };

const baseActors: Actor[] = (data as any).actors;
const actorRanking: ActorRanking[] = (data as any).actorRanking;
const allProcedures: Procedure[] = (data as any).allProcedures;

const procedureActors: string[] = Array.from(
  new Set(allProcedures.map(r => r.actor).filter(Boolean))
).sort();

// ttpRisk lookup by normalised actor name (for new custom actors)
const ttpRiskLookup: Record<string, number> = Object.fromEntries(
  actorRanking.map(a => [a.name.toUpperCase().trim(), a.riskSum])
);

// ──────────────────────────── persistence ────────────────────────────────────
const LS_OV  = "pt_actor_overrides";
const LS_CUS = "pt_actor_custom";

type Override = { intent?: number; capability?: number; deleted?: true };
type Overrides = Record<string, Override>;
type CustomActor = { name: string; intent: number; capability: number };

function loadOverrides(): Overrides {
  try { return JSON.parse(localStorage.getItem(LS_OV) ?? "{}"); } catch { return {}; }
}
function saveOverrides(ov: Overrides) {
  try { localStorage.setItem(LS_OV, JSON.stringify(ov)); } catch {}
}
function loadCustom(): CustomActor[] {
  try { return JSON.parse(localStorage.getItem(LS_CUS) ?? "[]"); } catch { return []; }
}
function saveCustom(c: CustomActor[]) {
  try { localStorage.setItem(LS_CUS, JSON.stringify(c)); } catch {}
}

// ──────────────────────────── helpers ────────────────────────────────────────
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

function ScoreSelect({ value, onChange, color = "text-chart-2" }: {
  value: number; onChange: (v: number) => void; color?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className={`bg-input border border-ring rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring w-16 ${color}`}
    >
      {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

function DotBar({ count, color }: { count: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 7 }).map((_, j) => (
          <div key={j} className={`w-2.5 h-2.5 rounded-sm ${j < count ? color : "bg-muted"}`} />
        ))}
      </div>
      <span className={`text-xs font-semibold ${color.replace("bg-", "text-")}`}>{count}</span>
    </div>
  );
}

const RISK_LEVELS = ["All", "Critical", "High", "Medium", "Low"] as const;
type RiskLevel = typeof RISK_LEVELS[number];

// ──────────────────────────── component ──────────────────────────────────────
export default function ActorPrioritisation() {
  const [search, setSearch]           = useState("");
  const [riskFilter, setRiskFilter]   = useState<RiskLevel>("All");
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());
  const [chipSearch, setChipSearch]   = useState("");

  const [overrides, setOverrides]     = useState<Overrides>(loadOverrides);
  const [customActors, setCustomActors] = useState<CustomActor[]>(loadCustom);

  const [editName, setEditName]       = useState<string | null>(null);
  const [editForm, setEditForm]       = useState<{ intent: number; capability: number }>({ intent: 4, capability: 4 });

  const [addingNew, setAddingNew]     = useState(false);
  const [newForm, setNewForm]         = useState<{ name: string; intent: number; capability: number }>({ name: "", intent: 4, capability: 4 });
  const [newNameError, setNewNameError] = useState("");

  const [showRemoved, setShowRemoved] = useState(false);

  const maxRisk = Math.max(...actorRanking.map(a => a.riskSum));

  // Build the live actor list with overrides applied and deleted actors removed
  const actors: Actor[] = useMemo(() => {
    const merged: Actor[] = [
      // Base actors (with overrides, skip deleted)
      ...baseActors
        .filter(a => !overrides[a.name]?.deleted)
        .map(a => {
          const ov = overrides[a.name] ?? {};
          const intent = ov.intent ?? a.intent;
          const capability = ov.capability ?? a.capability;
          return { ...a, intent, capability, priority: 0, riskPct: 0 };
        }),
      // Custom actors
      ...customActors.map(c => ({
        name: c.name,
        intent: c.intent,
        capability: c.capability,
        ttpRisk: ttpRiskLookup[c.name.toUpperCase().trim()] ?? 0,
        priority: 0,
        riskPct: 0,
        isCustom: true,
      })),
    ].map(a => ({ ...a, priority: a.intent * a.capability * a.ttpRisk }));

    const maxP = Math.max(...merged.map(a => a.priority), 1);
    return merged.map(a => ({ ...a, riskPct: a.priority / maxP }));
  }, [overrides, customActors]);

  // Deleted base actors list (for restore panel)
  const deletedActors = useMemo(() =>
    baseActors.filter(a => overrides[a.name]?.deleted),
    [overrides]
  );

  // ── edit helpers ────────────────────────────────────────────────────────────
  function startEdit(actor: Actor) {
    setEditName(actor.name);
    setEditForm({ intent: actor.intent, capability: actor.capability });
  }
  function commitEdit() {
    if (!editName) return;
    const isCustom = customActors.some(c => c.name === editName);
    if (isCustom) {
      const next = customActors.map(c =>
        c.name === editName ? { ...c, ...editForm } : c
      );
      setCustomActors(next);
      saveCustom(next);
    } else {
      const next: Overrides = { ...overrides, [editName]: { ...overrides[editName], ...editForm } };
      setOverrides(next);
      saveOverrides(next);
    }
    setEditName(null);
  }
  function cancelEdit() { setEditName(null); }

  function resetOverride(name: string) {
    const next = { ...overrides };
    if (next[name]) {
      const { intent: _i, capability: _c, ...rest } = next[name];
      if (Object.keys(rest).length) next[name] = rest;
      else delete next[name];
    }
    setOverrides(next);
    saveOverrides(next);
  }

  // ── delete / restore helpers ────────────────────────────────────────────────
  function deleteActor(actor: Actor) {
    if (actor.isCustom) {
      const next = customActors.filter(c => c.name !== actor.name);
      setCustomActors(next);
      saveCustom(next);
    } else {
      const next: Overrides = { ...overrides, [actor.name]: { ...overrides[actor.name], deleted: true } };
      setOverrides(next);
      saveOverrides(next);
    }
  }
  function restoreActor(name: string) {
    const next = { ...overrides };
    if (next[name]) {
      const { deleted: _d, ...rest } = next[name];
      if (Object.keys(rest).length) next[name] = rest;
      else delete next[name];
    }
    setOverrides(next);
    saveOverrides(next);
  }

  // ── add new actor ────────────────────────────────────────────────────────────
  function commitAdd() {
    const name = newForm.name.trim().toUpperCase();
    if (!name) { setNewNameError("Name is required"); return; }
    const allNames = actors.map(a => a.name.toUpperCase());
    if (allNames.includes(name)) { setNewNameError("Actor already exists"); return; }
    const next = [...customActors, { name, intent: newForm.intent, capability: newForm.capability }];
    setCustomActors(next);
    saveCustom(next);
    setAddingNew(false);
    setNewForm({ name: "", intent: 4, capability: 4 });
    setNewNameError("");
  }
  function cancelAdd() {
    setAddingNew(false);
    setNewForm({ name: "", intent: 4, capability: 4 });
    setNewNameError("");
  }

  // ── reset all ───────────────────────────────────────────────────────────────
  function resetAll() {
    setOverrides({});
    saveOverrides({});
    setCustomActors([]);
    saveCustom([]);
  }

  // ── filters ─────────────────────────────────────────────────────────────────
  function hasIntentCapOverride(name: string) {
    const ov = overrides[name];
    return !!(ov && (ov.intent !== undefined || ov.capability !== undefined));
  }

  function toggleActor(name: string) {
    setSelectedActors(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }
  function clearActors() { setSelectedActors(new Set()); }

  const filtered = useMemo(() => actors.filter(actor => {
    const matchSearch = !search || actor.name.toLowerCase().includes(search.toLowerCase());
    const matchRisk   = riskFilter === "All" || riskLabel(actor.riskPct) === riskFilter;
    const matchChips  = selectedActors.size === 0 ||
      [...selectedActors].some(s => s.toLowerCase() === actor.name.toLowerCase());
    return matchSearch && matchRisk && matchChips;
  }), [actors, search, riskFilter, selectedActors]);

  const filteredRanking = useMemo(() => {
    if (selectedActors.size > 0)
      return actorRanking.filter(a => [...selectedActors].some(s => s.toLowerCase() === a.name.toLowerCase()));
    return actorRanking.filter(a => filtered.some(f => f.name.toLowerCase() === a.name.toLowerCase()));
  }, [filtered, selectedActors]);

  const { sortKey: sk1, sortDir: sd1, toggle: tog1, sorted: sortedActors } = useSortTable(filtered);
  const { sortKey: sk2, sortDir: sd2, toggle: tog2, sorted: sortedAll }    = useSortTable(actors);

  const visibleChips = chipSearch
    ? procedureActors.filter(a => a.toLowerCase().includes(chipSearch.toLowerCase()))
    : procedureActors;

  const overrideCount = Object.values(overrides).filter(ov => ov.intent !== undefined || ov.capability !== undefined).length;
  const modifiedCount = overrideCount + customActors.length;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Final Actor Prioritisation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Threat actor ranking based on intent, capability, and TTP risk scores
        </p>
      </div>

      {/* KPI cards */}
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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="search" placeholder="Search actors..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-xs bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex gap-1.5">
          {RISK_LEVELS.map(level => (
            <button
              key={level} onClick={() => setRiskFilter(level)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                riskFilter === level
                  ? level === "All" ? "bg-primary text-primary-foreground border-primary"
                  : level === "Critical" ? "bg-red-500/20 text-red-400 border-red-500/50"
                  : level === "High"     ? "bg-orange-500/20 text-orange-400 border-orange-500/50"
                  : level === "Medium"   ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                  : "bg-green-500/20 text-green-400 border-green-500/50"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >{level}</button>
          ))}
        </div>
        {(search || riskFilter !== "All") && (
          <button onClick={() => { setSearch(""); setRiskFilter("All"); }}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors">Clear</button>
        )}
        <span className="text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Rankings + sidebar */}
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
                  <SortableTh col="name"       sortKey={sk1} sortDir={sd1} toggle={tog1}>Actor</SortableTh>
                  <SortableTh col="intent"     sortKey={sk1} sortDir={sd1} toggle={tog1}>Intent</SortableTh>
                  <SortableTh col="capability" sortKey={sk1} sortDir={sd1} toggle={tog1}>Cap.</SortableTh>
                  <SortableTh col="riskPct"    sortKey={sk1} sortDir={sd1} toggle={tog1}>Risk %</SortableTh>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Level</th>
                </tr>
              </thead>
              <tbody>
                {sortedActors.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No actors match the current filter.</td></tr>
                ) : sortedActors.map((actor, i) => (
                  <tr key={actor.name} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/all-procedures?actor=${encodeURIComponent(actor.name)}`}>
                          <span className={`font-medium hover:text-primary hover:underline cursor-pointer transition-colors ${actor.isCustom ? "text-chart-2" : hasIntentCapOverride(actor.name) ? "text-primary" : "text-foreground"}`}>
                            {actor.name}
                          </span>
                        </Link>
                        {actor.isCustom && <span className="text-[10px] px-1 py-0.5 rounded bg-chart-2/15 text-chart-2 border border-chart-2/30 font-medium">custom</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex gap-0.5">{Array.from({ length: 7 }).map((_, j) => (
                        <div key={j} className={`w-2 h-2 rounded-sm ${j < actor.intent ? "bg-primary" : "bg-muted"}`} />
                      ))}</div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex gap-0.5">{Array.from({ length: 7 }).map((_, j) => (
                        <div key={j} className={`w-2 h-2 rounded-sm ${j < actor.capability ? "bg-chart-2" : "bg-muted"}`} />
                      ))}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{(actor.riskPct * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColor(actor.riskPct)}`}>{riskLabel(actor.riskPct)}</span>
                    </td>
                  </tr>
                ))}
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
                      <span className="text-xs text-foreground hover:text-primary hover:underline cursor-pointer transition-colors">{a.name}</span>
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
                    {selectedActors.size > 0 && <span className="ml-2 text-primary font-medium">({selectedActors.size} selected)</span>}
                  </p>
                </div>
                {selectedActors.size > 0 && (
                  <button onClick={clearActors} className="text-xs text-muted-foreground hover:text-foreground underline transition-colors flex-shrink-0">Clear</button>
                )}
              </div>
              <input type="search" placeholder="Search actors…" value={chipSearch} onChange={e => setChipSearch(e.target.value)}
                className="mt-2 w-full bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="p-3 max-h-52 overflow-y-auto">
              <div className="flex flex-wrap gap-1.5">
                {visibleChips.map(actor => {
                  const active = selectedActors.has(actor);
                  return (
                    <button key={actor} onClick={() => toggleActor(actor)}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        active ? "bg-primary text-primary-foreground border-primary" : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                      }`}>{actor}</button>
                  );
                })}
                {visibleChips.length === 0 && <span className="text-xs text-muted-foreground">No actors match.</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── All Actors — Full Detail (editable) ─────────────────────────────── */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">All Actors — Full Detail</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Edit <span className="font-medium text-foreground">Intent</span> &amp; <span className="font-medium text-foreground">Capability</span> (1–7).
              Derived columns update automatically via{" "}
              <span className="font-mono text-[11px] text-primary">Priority = Intent × Capability × TTP Risk</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { setAddingNew(true); setEditName(null); }}
              disabled={addingNew}
              className="flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/40 bg-primary/10 hover:bg-primary/20 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Add Actor
            </button>
            {modifiedCount > 0 && (
              <button
                onClick={resetAll}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 hover:bg-accent transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Reset all
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">#</th>
                <SortableTh col="name"       sortKey={sk2} sortDir={sd2} toggle={tog2}>Actor</SortableTh>
                <SortableTh col="intent"     sortKey={sk2} sortDir={sd2} toggle={tog2}>Intent Score</SortableTh>
                <SortableTh col="capability" sortKey={sk2} sortDir={sd2} toggle={tog2}>Capability Score</SortableTh>
                <SortableTh col="ttpRisk"    sortKey={sk2} sortDir={sd2} toggle={tog2}>TTP Risk Score</SortableTh>
                <SortableTh col="priority"   sortKey={sk2} sortDir={sd2} toggle={tog2}>Priority Value</SortableTh>
                <SortableTh col="riskPct"    sortKey={sk2} sortDir={sd2} toggle={tog2}>Risk %</SortableTh>
                <th className="w-24 px-3 py-2.5 text-xs text-muted-foreground font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAll.map((actor, i) => {
                const isEditing = editName === actor.name;
                const hasOv = hasIntentCapOverride(actor.name);
                return (
                  <tr key={actor.name}
                    className={`border-b border-border/50 transition-colors ${
                      isEditing ? "bg-primary/5"
                      : actor.isCustom ? "bg-chart-2/5 hover:bg-chart-2/10"
                      : hasOv ? "bg-yellow-500/5 hover:bg-yellow-500/10"
                      : "hover:bg-accent/30"
                    }`}
                  >
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{i + 1}</td>

                    <td className="px-4 py-2.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/all-procedures?actor=${encodeURIComponent(actor.name)}`}>
                          <span className={`font-semibold hover:text-primary hover:underline cursor-pointer transition-colors ${actor.isCustom ? "text-chart-2" : hasOv ? "text-yellow-300" : "text-foreground"}`}>
                            {actor.name}
                          </span>
                        </Link>
                        {actor.isCustom && <span className="text-[10px] px-1.5 py-0.5 rounded bg-chart-2/15 text-chart-2 border border-chart-2/30 font-medium">custom</span>}
                        {hasOv && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 font-medium">edited</span>}
                      </div>
                    </td>

                    <td className="px-4 py-2.5">
                      {isEditing
                        ? <ScoreSelect value={editForm.intent} onChange={v => setEditForm(f => ({ ...f, intent: v }))} color="text-chart-2" />
                        : <DotBar count={actor.intent} color="bg-chart-2" />
                      }
                    </td>

                    <td className="px-4 py-2.5">
                      {isEditing
                        ? <ScoreSelect value={editForm.capability} onChange={v => setEditForm(f => ({ ...f, capability: v }))} color="text-chart-3" />
                        : <DotBar count={actor.capability} color="bg-chart-3" />
                      }
                    </td>

                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                      {actor.ttpRisk > 0
                        ? actor.ttpRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : <span className="text-muted-foreground/40 italic">—</span>
                      }
                    </td>

                    <td className="px-4 py-2.5 font-mono text-xs text-foreground font-semibold">
                      {actor.priority > 0
                        ? actor.priority.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : <span className="text-muted-foreground/40 italic">—</span>
                      }
                    </td>

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

                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={commitEdit} className="p-1 rounded text-green-400 hover:bg-green-400/10 transition-colors" title="Save"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={cancelEdit} className="p-1 rounded text-muted-foreground hover:bg-accent transition-colors" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(actor)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Edit intent & capability"><Pencil className="w-3.5 h-3.5" /></button>
                            {hasOv && (
                              <button onClick={() => resetOverride(actor.name)} className="p-1 rounded text-yellow-400 hover:bg-yellow-400/10 transition-colors" title="Revert to original"><Undo2 className="w-3.5 h-3.5" /></button>
                            )}
                            <button onClick={() => deleteActor(actor)} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors" title={actor.isCustom ? "Remove actor" : "Hide actor"}><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* ── Add new actor inline form ──────────────────────────────── */}
              {addingNew && (
                <tr className="border-b border-border/50 bg-primary/5">
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">+</td>

                  <td className="px-4 py-3" colSpan={1}>
                    <div className="space-y-1">
                      <input
                        autoFocus
                        type="text"
                        placeholder="ACTOR NAME"
                        value={newForm.name}
                        onChange={e => { setNewForm(f => ({ ...f, name: e.target.value.toUpperCase() })); setNewNameError(""); }}
                        onKeyDown={e => { if (e.key === "Enter") commitAdd(); if (e.key === "Escape") cancelAdd(); }}
                        className={`bg-input border rounded px-2.5 py-1.5 text-xs font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-40 uppercase ${newNameError ? "border-red-500" : "border-ring"}`}
                      />
                      {newNameError && <p className="text-[10px] text-red-400">{newNameError}</p>}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <ScoreSelect value={newForm.intent} onChange={v => setNewForm(f => ({ ...f, intent: v }))} color="text-chart-2" />
                  </td>
                  <td className="px-4 py-3">
                    <ScoreSelect value={newForm.capability} onChange={v => setNewForm(f => ({ ...f, capability: v }))} color="text-chart-3" />
                  </td>

                  <td className="px-4 py-3 text-xs text-muted-foreground/40 italic" colSpan={3}>
                    TTP Risk, Priority &amp; Risk % calculated automatically
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={commitAdd} className="p-1 rounded text-green-400 hover:bg-green-400/10 transition-colors" title="Add actor"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={cancelAdd} className="p-1 rounded text-muted-foreground hover:bg-accent transition-colors" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── footer ──────────────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-border bg-muted/10 flex items-center justify-between gap-4 flex-wrap text-xs text-muted-foreground">
          <div className="flex items-center gap-3 flex-wrap">
            <span><span className="font-medium text-foreground">{actors.length}</span> actors</span>
            {customActors.length > 0 && <span className="text-chart-2">{customActors.length} custom</span>}
            {overrideCount > 0 && <span className="text-yellow-400">{overrideCount} override{overrideCount !== 1 ? "s" : ""}</span>}
            {deletedActors.length > 0 && (
              <button
                onClick={() => setShowRemoved(v => !v)}
                className="flex items-center gap-1 text-red-400/70 hover:text-red-400 transition-colors"
              >
                {showRemoved ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {deletedActors.length} hidden
              </button>
            )}
          </div>
          <span className="text-muted-foreground/50 hidden lg:block">
            Priority = Intent × Capability × TTP Risk · Risk % = Priority / max(Priority)
          </span>
        </div>

        {/* ── removed actors restore panel ────────────────────────────────── */}
        {showRemoved && deletedActors.length > 0 && (
          <div className="border-t border-border bg-red-950/20">
            <div className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-medium text-red-400">Hidden actors</span>
              <button
                onClick={() => {
                  const next = { ...overrides };
                  deletedActors.forEach(a => { const { deleted: _d, ...rest } = next[a.name] ?? {}; if (Object.keys(rest).length) next[a.name] = rest; else delete next[a.name]; });
                  setOverrides(next); saveOverrides(next);
                }}
                className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
              >Restore all</button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {deletedActors.map(a => (
                  <tr key={a.name} className="border-t border-border/30 hover:bg-red-400/5 transition-colors">
                    <td className="px-4 py-2 text-xs text-muted-foreground/60 font-semibold w-8">—</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground line-through">{a.name}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground/50">Intent {a.intent} · Cap. {a.capability}</td>
                    <td className="px-4 py-2 text-right pr-4">
                      <button
                        onClick={() => restoreActor(a.name)}
                        className="flex items-center gap-1 text-xs text-chart-2 hover:text-chart-2/80 transition-colors ml-auto"
                      >
                        <Undo2 className="w-3 h-3" /> Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
