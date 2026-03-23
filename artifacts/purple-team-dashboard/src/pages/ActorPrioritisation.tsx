import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "wouter";
import data from "@/data.json";
import { useSortTable } from "@/hooks/useSortTable";
import SortableTh from "@/components/SortableTh";
import { Pencil, Check, X, RotateCcw, Trash2, Plus, Undo2, ChevronDown, ChevronUp, CalendarRange, Shield, Activity, XCircle } from "lucide-react";
import { useAppData } from "@/context/AppDataContext";
import { toTitleCase } from "@/context/ViewContext";

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

// ──────────────────────────── date filter types ───────────────────────────────
type DateRange = "all" | "3m" | "6m" | "9m" | "1y" | "custom";
const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: "All time", "3m": "Last 3 months", "6m": "Last 6 months",
  "9m": "Last 9 months", "1y": "Last year", custom: "Custom",
};

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
  const {
    liveActorData,
    clearLiveActorData,
    mitreVersions,
    activeMitreVersionId,
    setActiveMitreVersionId,
  } = useAppData();

  const [search, setSearch]           = useState("");
  const [riskFilter, setRiskFilter]   = useState<RiskLevel>("All");
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());
  const [chipSearch, setChipSearch]   = useState("");

  const [overrides, setOverrides]     = useState<Overrides>(loadOverrides);
  const [customActors, setCustomActors] = useState<CustomActor[]>(loadCustom);

  // ── date filter state ──────────────────────────────────────────────────────
  const [dateRange, setDateRange]   = useState<DateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node))
        setShowDatePicker(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  // Resolve the active time window (inclusive ms bounds)
  const { fromMs, toMs } = useMemo(() => {
    const now = Date.now();
    const DAY = 86_400_000;
    if (dateRange === "3m") return { fromMs: now - 90  * DAY, toMs: now };
    if (dateRange === "6m") return { fromMs: now - 180 * DAY, toMs: now };
    if (dateRange === "9m") return { fromMs: now - 270 * DAY, toMs: now };
    if (dateRange === "1y") return { fromMs: now - 365 * DAY, toMs: now };
    if (dateRange === "custom") return {
      fromMs: customFrom ? new Date(customFrom).getTime()            : -Infinity,
      toMs:   customTo   ? new Date(customTo).getTime() + DAY - 1   :  Infinity,
    };
    return { fromMs: -Infinity, toMs: Infinity };
  }, [dateRange, customFrom, customTo]);

  // Source procedures: MERGE live CrowdStrike procedures with base data.json procedures.
  // The actor list (Active Monitoring) is always from data.json — never replaced by live data.
  // CrowdStrike procedures are ADDITIVE: they increase TTP Risk for existing actors.
  const sourceProcedures = useMemo(() => {
    if (liveActorData && liveActorData.procedures.length > 0) {
      return [...allProcedures, ...liveActorData.procedures];
    }
    return allProcedures;
  }, [liveActorData]);

  // Source procedure actors for chips — derived from the merged procedure set
  const sourceProcedureActors = useMemo(() =>
    Array.from(new Set(sourceProcedures.map(p => p.actor).filter(Boolean))).sort(),
    [sourceProcedures]
  );

  // TTP risk map — filtered by date, covers source procedures + custom procedures
  const ttpRiskMap = useMemo(() => {
    const map: Record<string, number> = {};
    const inWindow = (date: number | null) => {
      if (dateRange === "all") return true;
      if (date === null) return false;          // unknown date excluded when filtering
      return date >= fromMs && date <= toMs;
    };
    sourceProcedures.forEach((p: any) => {
      if (!p.actor || !inWindow(p.date ?? null)) return;
      const key = p.actor.toUpperCase().trim();
      map[key] = (map[key] ?? 0) + (p.risk ?? 0);
    });
    // Always include custom procedures
    try {
      const customProcs: Array<{ actor?: string; risk?: number; date?: number | null }> =
        JSON.parse(localStorage.getItem("pt_procedures_custom") ?? "[]");
      customProcs.forEach(p => {
        if (!p.actor || !inWindow(p.date ?? null)) return;
        const key = p.actor.toUpperCase().trim();
        map[key] = (map[key] ?? 0) + (p.risk ?? 0);
      });
    } catch {}
    return map;
  }, [dateRange, fromMs, toMs, sourceProcedures]);

  const [editName, setEditName]       = useState<string | null>(null);
  const [editForm, setEditForm]       = useState<{ intent: number; capability: number }>({ intent: 4, capability: 4 });

  const [addingNew, setAddingNew]     = useState(false);
  const [newForm, setNewForm]         = useState<{ name: string; intent: number; capability: number }>({ name: "", intent: 4, capability: 4 });
  const [newNameError, setNewNameError] = useState("");

  const [showRemoved, setShowRemoved] = useState(false);

  // Build the live actor list with overrides applied and deleted actors removed.
  // ttpRisk for ALL actors is derived from the date-filtered ttpRiskMap so every
  // calculation (Priority, Risk %) reacts instantly to the date window change.
  const actors: Actor[] = useMemo(() => {
    const merged: Actor[] = [
      // Base actors from data.json (Active Monitoring — intent/capability never overwritten by live sync)
      ...baseActors
        .filter(a => !overrides[a.name]?.deleted)
        .map(a => {
          const ov = overrides[a.name] ?? {};
          const intent = ov.intent ?? a.intent;
          const capability = ov.capability ?? a.capability;
          const ttpRisk = ttpRiskMap[a.name.toUpperCase().trim()] ?? 0;
          return { ...a, intent, capability, ttpRisk, priority: 0, riskPct: 0 };
        }),
      // Custom actors
      ...customActors.map(c => ({
        name: c.name,
        intent: c.intent,
        capability: c.capability,
        ttpRisk: ttpRiskMap[c.name.toUpperCase().trim()] ?? 0,
        priority: 0,
        riskPct: 0,
        isCustom: true,
      })),
    ].map(a => ({ ...a, priority: a.intent * a.capability * a.ttpRisk }));

    const maxP = Math.max(...merged.map(a => a.priority), 1);
    return merged.map(a => ({ ...a, riskPct: a.priority / maxP }));
  }, [overrides, customActors, ttpRiskMap]);

  // Deleted actors list (for restore panel) — always from data.json base list
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
    const name = toTitleCase(newForm.name.trim());
    if (!name) { setNewNameError("Name is required"); return; }
    const allNames = actors.map(a => a.name.toUpperCase());
    if (allNames.includes(name.toUpperCase())) { setNewNameError("Actor already exists"); return; }
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

  // Combined ranking built from the live actors array (includes custom actors and overrides)
  const combinedRanking = useMemo(() =>
    [...actors]
      .map(a => ({ name: a.name, riskSum: a.ttpRisk }))
      .sort((a, b) => b.riskSum - a.riskSum),
    [actors]
  );

  const maxRisk = Math.max(...combinedRanking.map(a => a.riskSum), 1);

  const filteredRanking = useMemo(() => {
    if (selectedActors.size > 0)
      return combinedRanking.filter(a => [...selectedActors].some(s => s.toLowerCase() === a.name.toLowerCase()));
    return combinedRanking.filter(a => filtered.some(f => f.name.toLowerCase() === a.name.toLowerCase()));
  }, [combinedRanking, filtered, selectedActors]);

  const { sortKey: sk1, sortDir: sd1, toggle: tog1, sorted: sortedActors } = useSortTable(filtered, "riskPct", "desc");
  const { sortKey: sk2, sortDir: sd2, toggle: tog2, sorted: sortedAll }    = useSortTable(actors);

  const visibleChips = chipSearch
    ? sourceProcedureActors.filter(a => a.toLowerCase().includes(chipSearch.toLowerCase()))
    : sourceProcedureActors;

  const overrideCount = Object.values(overrides).filter(ov => ov.intent !== undefined || ov.capability !== undefined).length;
  const modifiedCount = overrideCount + customActors.length;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* ── Page header + date filter ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Final Actor Prioritisation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Threat actor ranking based on intent, capability, and TTP risk scores
          </p>
        </div>

        {/* Date filter — top-right */}
        <div className="relative flex-shrink-0" ref={datePickerRef}>
          <button
            onClick={() => setShowDatePicker(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors shadow-sm ${
              dateRange !== "all"
                ? "bg-primary/15 text-primary border-primary/40 hover:bg-primary/25"
                : "bg-card border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            <span>{DATE_RANGE_LABELS[dateRange]}</span>
            {dateRange === "custom" && customFrom && customTo && (
              <span className="text-muted-foreground font-normal">
                ({new Date(customFrom).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – {new Date(customTo).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })})
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showDatePicker ? "rotate-180" : ""}`} />
          </button>

          {showDatePicker && (
            <div className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
              <div className="p-3 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Calculation date window</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Only procedures within this window contribute to TTP Risk, Priority, and Risk %</p>
              </div>
              <div className="p-2 space-y-0.5">
                {(["all", "3m", "6m", "9m", "1y", "custom"] as DateRange[]).map(opt => (
                  <button key={opt} onClick={() => { setDateRange(opt); if (opt !== "custom") setShowDatePicker(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors text-left ${
                      dateRange === opt ? "bg-primary/15 text-primary font-medium" : "text-foreground hover:bg-accent"
                    }`}>
                    <span>{DATE_RANGE_LABELS[opt]}</span>
                    {dateRange === opt && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </button>
                ))}
              </div>
              {dateRange === "custom" && (
                <div className="px-3 pb-3 pt-2 border-t border-border space-y-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground font-medium">From</label>
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                      className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:dark]" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground font-medium">To</label>
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                      className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:dark]" />
                  </div>
                  {(customFrom || customTo) && (
                    <button onClick={() => setShowDatePicker(false)}
                      className="w-full py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium">
                      Apply
                    </button>
                  )}
                </div>
              )}
              {dateRange !== "all" && (
                <div className="px-3 pb-3">
                  <button onClick={() => { setDateRange("all"); setCustomFrom(""); setCustomTo(""); setShowDatePicker(false); }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground underline transition-colors text-center">
                    Reset to all time
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Live data indicator ──────────────────────────────────────────── */}
      {liveActorData && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-chart-4/10 border border-chart-4/30 rounded-xl">
          <Activity className="w-4 h-4 text-chart-4 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-chart-4">Live Procedures Merged</span>
            <span className="text-xs text-muted-foreground ml-2">{liveActorData.label}</span>
            <span className="text-xs text-muted-foreground ml-2">·</span>
            <span className="text-xs text-muted-foreground ml-2">
              +{liveActorData.procedures.length.toLocaleString()} procedures added to TTP Risk calculations
            </span>
          </div>
          <button
            onClick={clearLiveActorData}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
            title="Clear live procedures and revert to base dataset"
          >
            <XCircle className="w-3.5 h-3.5" />Clear
          </button>
        </div>
      )}

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
          <div className="text-2xl font-bold text-chart-2">{sourceProcedureActors.length}</div>
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
                      <Link href={`/all-procedures?actor=${encodeURIComponent(actor.name)}`}>
                        <span className={`font-medium hover:text-primary hover:underline cursor-pointer transition-colors ${hasIntentCapOverride(actor.name) ? "text-primary" : "text-foreground"}`}>
                          {actor.name}
                        </span>
                      </Link>
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
              {(filteredRanking.length > 0 ? filteredRanking : combinedRanking).slice(0, 15).map(a => (
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
                          <span className={`font-semibold hover:text-primary hover:underline cursor-pointer transition-colors ${hasOv ? "text-yellow-300" : "text-foreground"}`}>
                            {actor.name}
                          </span>
                        </Link>
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
            {liveActorData && (
              <span className="flex items-center gap-1 text-chart-4">
                <Activity className="w-3 h-3" />live
              </span>
            )}
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
            {mitreVersions.length > 0 && (
              <div className="flex items-center gap-1.5 border-l border-border pl-3">
                <Shield className="w-3 h-3 text-muted-foreground/60" />
                <span className="text-muted-foreground/60">ATT&amp;CK:</span>
                <select
                  value={activeMitreVersionId ?? ""}
                  onChange={e => setActiveMitreVersionId(e.target.value || null)}
                  className="bg-input border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Base (data.json)</option>
                  {mitreVersions.map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
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
