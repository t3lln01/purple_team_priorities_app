import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "wouter";
import data from "@/data.json";
import {
  calcCIAScore, calcImpactScore, calcImpactRate, calcTTPExtent,
  calcLikelihoodScore, calcLikelihoodRate,
  LAST_OCC_OPTIONS, CONFIDENCE_LIK_OPTIONS,
} from "@/utils/impactFormulas";
import { useTacticScores, type TacticOverrides } from "@/context/TacticScoresContext";
import { useLikelihood }  from "@/context/LikelihoodContext";
import { useAppData }    from "@/context/AppDataContext";
import { CalendarRange, ChevronDown } from "lucide-react";

// ── date range types (mirror Actor Prioritisation) ────────────────────────────
type DateRange = "all" | "3m" | "6m" | "9m" | "1y" | "custom";
const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: "All time", "3m": "Last 3 months", "6m": "Last 6 months",
  "9m": "Last 9 months", "1y": "Last year", custom: "Custom",
};

// ── base procedure dates keyed by TID ─────────────────────────────────────────
const allProceduresData: Array<{ mitreId: string; date: number | null }> =
  (data as any).allProcedures ?? [];

function loadImpactOverrides(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem("pt_impact_overrides") ?? "{}"); } catch { return {}; }
}
function loadImpactTable(): Record<string, any> {
  const rows = (data as any).impactTable ?? [];
  const map: Record<string, any> = {};
  for (const r of rows) map[r.id] = r;
  return map;
}
function loadHVAScores(): Record<string, { avgRisk: number; avgLikelihood: number }> {
  try {
    const arr: Array<{ tid: string; avgRisk: number; avgLikelihood: number }> =
      JSON.parse(localStorage.getItem("pt_hva_scores") ?? "[]");
    const map: Record<string, { avgRisk: number; avgLikelihood: number }> = {};
    for (const s of arr) map[s.tid] = { avgRisk: s.avgRisk, avgLikelihood: s.avgLikelihood };
    return map;
  } catch { return {}; }
}

type RiskRow = {
  TID: string;
  "Technique Name": string;
  Platforms: string;
  Tactic: string;
  Confidentiality: string;
  "Confidentiality Score": number;
  Integrity: string;
  "Integrity Score": number;
  Availability: string;
  "Availability Score": number;
  "CIA Score": number;
  "TTP Extent Score": number;
  "HIGH VALUE ASSSET RISK": number;
  "Impact Score": number;
  "Impact Rate": string;
  "TID  Priority": number;
  "Last Occurrence": string;
  "Last occurrence Score": number;
  Confidence: string;
  "Confidence Score": number;
  "Likelihood Score": number;
  "Likelihood Rate": string;
  "Risk Rate": number;
  "Risk Scores": number;
};

const rawRiskCalc: RiskRow[] = (data as any).riskCalc;

function applyOverrides(
  rows: RiskRow[],
  tacticOvMap: TacticOverrides = {},
  likOvMap: Record<string, { lastOccurrence?: string; confidence?: string }> = {},
): RiskRow[] {
  const impactOvs   = loadImpactOverrides();
  const impactMap   = loadImpactTable();
  const hvaScores   = loadHVAScores();

  return rows.map(row => {
    const impOv   = impactOvs[row.TID];
    const base    = impactMap[row.TID];
    const hvaLive = hvaScores[row.TID];
    const likOv   = likOvMap[row.TID];

    const primaryTactic = (row.Tactic ?? "").split(",")[0].trim();
    const tacticOv      = tacticOvMap[primaryTactic] ?? {};
    const hasTacticOv   = Object.keys(tacticOv).length > 0;

    // ── Impact ────────────────────────────────────────────────────────────────
    const conf  = impOv?.confidentiality ?? tacticOv.conf      ?? row.Confidentiality;
    const int_  = impOv?.integrity       ?? tacticOv.integrity  ?? row.Integrity;
    const avail = impOv?.availability    ?? tacticOv.avail      ?? row.Availability;

    const newCIA = (impOv || hasTacticOv) && base
      ? calcCIAScore(conf, int_, avail)
      : row["CIA Score"];

    const ttpRow = base ? {
      initialTTPExtent:    impOv?.initialTTPExtent    ?? base.initialTTPExtent,
      adScore:             impOv?.adScore             ?? base.adScore,
      containerScore:      impOv?.containerScore      ?? base.containerScore,
      cloudScore:          impOv?.cloudScore          ?? base.cloudScore,
      supportRemoteScore:  impOv?.supportRemoteScore  ?? base.supportRemoteScore,
      systemReqScore:      impOv?.systemReqScore      ?? base.systemReqScore,
      capecSeverityScore:  impOv?.capecSeverityScore  ?? base.capecSeverityScore,
      permRequiredScore:   impOv?.permRequiredScore   ?? base.permRequiredScore,
      effectivePermsScore: impOv?.effectivePermsScore ?? base.effectivePermsScore,
    } : null;
    const newExt = (impOv && ttpRow) ? calcTTPExtent(ttpRow) : row["TTP Extent Score"];

    const hvaRisk    = hvaLive ? hvaLive.avgRisk : (row["HIGH VALUE ASSSET RISK"] || 1);
    const newImpact  = calcImpactScore(newCIA, newExt, hvaRisk);
    const newImpRate = calcImpactRate(newImpact);

    // ── Likelihood ────────────────────────────────────────────────────────────
    const tidPriority     = row["TID  Priority"] ?? 1;
    const baseLastOccScore = row["Last occurrence Score"] ?? 1;
    const baseConfScore    = row["Confidence Score"] ?? 1;

    const lastOccLabel  = likOv?.lastOccurrence ?? row["Last Occurrence"];
    const lastOccScore  = LAST_OCC_OPTIONS.find(o => o.label === lastOccLabel)?.score ?? baseLastOccScore;

    const confLabel   = likOv?.confidence ?? row.Confidence;
    const confScore   = CONFIDENCE_LIK_OPTIONS.find(o => o.label === confLabel)?.score ?? baseConfScore;

    const baseNoHVA    = tidPriority * baseLastOccScore * baseConfScore;
    const baseHVAFact  = baseNoHVA > 0 ? (row["Likelihood Score"] ?? 1) / baseNoHVA : 1;
    const hvaLikFactor = hvaLive ? hvaLive.avgLikelihood : baseHVAFact;

    const newLikScore = calcLikelihoodScore(tidPriority, lastOccScore, confScore, hvaLikFactor);
    const newLikRate  = calcLikelihoodRate(newLikScore);

    return {
      ...row,
      Confidentiality:           conf,
      Integrity:                 int_,
      Availability:              avail,
      "CIA Score":               newCIA,
      "TTP Extent Score":        newExt,
      "HIGH VALUE ASSSET RISK":  hvaRisk,
      "Impact Score":            newImpact,
      "Impact Rate":             newImpRate,
      "Last Occurrence":         lastOccLabel,
      "Last occurrence Score":   lastOccScore,
      Confidence:                confLabel,
      "Confidence Score":        confScore,
      "Likelihood Score":        newLikScore,
      "Likelihood Rate":         newLikRate,
      "Risk Scores":             newImpact * newLikScore,
    };
  });
}

type SortKey = "TID" | "Technique Name" | "Tactic" | "CIA Score" | "Impact Rate" | "Likelihood Rate" | "Risk Scores";

const RATE_ORDER: Record<string, number> = { "very high": 4, "high": 3, "medium": 2, "low": 1 };
function rateRank(v: string): number {
  return RATE_ORDER[(v || "").toLowerCase().trim()] ?? 0;
}
function rateColor(rate: string) {
  if (!rate) return "text-muted-foreground";
  const r = String(rate).toLowerCase();
  if (r.includes("very high")) return "text-red-400";
  if (r.includes("high"))      return "text-orange-400";
  if (r.includes("medium"))    return "text-yellow-400";
  if (r.includes("low"))       return "text-green-400";
  return "text-muted-foreground";
}
function rateStyle(rate: string) {
  if (!rate) return "bg-muted/50 text-muted-foreground";
  const r = String(rate).toLowerCase();
  if (r.includes("very high")) return "bg-red-500/10 border border-red-500/30 text-red-400";
  if (r.includes("high"))      return "bg-orange-500/10 border border-orange-500/30 text-orange-400";
  if (r.includes("medium"))    return "bg-yellow-500/10 border border-yellow-500/30 text-yellow-400";
  if (r.includes("low"))       return "bg-green-500/10 border border-green-500/30 text-green-400";
  return "bg-muted/50 text-muted-foreground border border-border";
}

export default function RiskCalculation() {
  const [search, setSearch]             = useState("");
  const [tacticFilter, setTacticFilter] = useState("All");
  const [sortKey, setSortKey]           = useState<SortKey>("Risk Scores");
  const [sortDir, setSortDir]           = useState<"asc" | "desc">("desc");

  // ── date window state ──────────────────────────────────────────────────────
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

  const { fromMs, toMs } = useMemo(() => {
    const now = Date.now();
    const DAY = 86_400_000;
    if (dateRange === "3m") return { fromMs: now - 90  * DAY, toMs: now };
    if (dateRange === "6m") return { fromMs: now - 180 * DAY, toMs: now };
    if (dateRange === "9m") return { fromMs: now - 270 * DAY, toMs: now };
    if (dateRange === "1y") return { fromMs: now - 365 * DAY, toMs: now };
    if (dateRange === "custom") return {
      fromMs: customFrom ? new Date(customFrom).getTime()           : -Infinity,
      toMs:   customTo   ? new Date(customTo).getTime() + DAY - 1  :  Infinity,
    };
    return { fromMs: -Infinity, toMs: Infinity };
  }, [dateRange, customFrom, customTo]);

  const { overrides: tacticOverrides }     = useTacticScores();
  const { overrides: likelihoodOverrides } = useLikelihood();
  const { activeNewRiskRows, liveActorData } = useAppData();

  // TIDs that appear in at least one procedure within the active date window
  const tidsInWindow = useMemo(() => {
    if (dateRange === "all") return null; // null = no filter active
    const set = new Set<string>();
    const inWindow = (date: number | null) =>
      date !== null && date >= fromMs && date <= toMs;

    for (const p of allProceduresData) {
      if (p.mitreId && inWindow(p.date)) set.add(p.mitreId);
    }
    for (const p of liveActorData?.procedures ?? []) {
      if (p.mitreId && inWindow(p.date)) set.add(p.mitreId);
    }
    return set;
  }, [dateRange, fromMs, toMs, liveActorData]);

  const allRawRows = useMemo(
    () => [...rawRiskCalc, ...(activeNewRiskRows as RiskRow[])],
    [activeNewRiskRows]
  );

  const riskCalc = useMemo(
    () => applyOverrides(allRawRows, tacticOverrides, likelihoodOverrides),
    [allRawRows, tacticOverrides, likelihoodOverrides]
  );

  // Apply date window — only show TIDs observed within the window
  const windowFiltered = useMemo(
    () => tidsInWindow ? riskCalc.filter(r => tidsInWindow.has(r.TID)) : riskCalc,
    [riskCalc, tidsInWindow]
  );

  const tactics = useMemo(
    () => ["All", ...Array.from(new Set(windowFiltered.flatMap(r => r.Tactic?.split(", ") || []))).sort()],
    [windowFiltered]
  );

  const filtered = windowFiltered.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.TID?.toLowerCase().includes(q) ||
      r["Technique Name"]?.toLowerCase().includes(q) ||
      r.Tactic?.toLowerCase().includes(q);
    const matchTactic = tacticFilter === "All" || (r.Tactic || "").includes(tacticFilter);
    return matchSearch && matchTactic;
  });

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "TID":
        case "Technique Name":
        case "Tactic":
          return dir * (a[sortKey] ?? "").localeCompare(b[sortKey] ?? "");
        case "Impact Rate":
          return dir * (rateRank(a["Impact Rate"]) - rateRank(b["Impact Rate"]));
        case "Likelihood Rate":
          return dir * (rateRank(a["Likelihood Rate"]) - rateRank(b["Likelihood Rate"]));
        case "CIA Score":
        case "Risk Scores":
          return dir * (Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0));
        default: return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }
  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1 text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const avgRisk  = windowFiltered.reduce((s, r) => s + (r["Risk Scores"] || 0), 0) / (windowFiltered.length || 1);
  const maxRisk  = Math.max(...windowFiltered.map(r => r["Risk Scores"] || 0), 1);
  const vhImpact = windowFiltered.filter(r => r["Impact Rate"] === "Very High").length;

  return (
    <div className="p-6 space-y-6">
      {/* ── Header + date filter ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Risk Calculation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Risk = Impact × Likelihood
            {tidsInWindow
              ? ` · showing ${windowFiltered.length} of ${riskCalc.length} techniques observed in window`
              : ` · ${riskCalc.length} techniques`}
          </p>
        </div>

        {/* Date window picker */}
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
                <p className="text-[10px] text-muted-foreground mt-0.5">Only techniques observed within this window are shown</p>
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

      {tidsInWindow && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl text-xs text-primary/80">
          <CalendarRange className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Date window active: showing <strong>{windowFiltered.length}</strong> of {riskCalc.length} techniques
            that have at least one observed procedure within <strong>{DATE_RANGE_LABELS[dateRange].toLowerCase()}</strong>.
          </span>
          <button onClick={() => { setDateRange("all"); setCustomFrom(""); setCustomTo(""); }}
            className="ml-auto text-primary underline hover:no-underline whitespace-nowrap">Clear</button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-primary">{windowFiltered.length}</div>
          <div className="text-sm text-muted-foreground mt-1">Techniques Shown</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-red-400">{vhImpact}</div>
          <div className="text-sm text-muted-foreground mt-1">Very High Impact</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-chart-2">{avgRisk.toFixed(0)}</div>
          <div className="text-sm text-muted-foreground mt-1">Avg Risk Score</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-chart-4">{maxRisk.toFixed(0)}</div>
          <div className="text-sm text-muted-foreground mt-1">Max Risk Score</div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <input
            type="search"
            placeholder="Search techniques, TIDs, tactics..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={tacticFilter}
            onChange={e => setTacticFilter(e.target.value)}
            className="bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {tactics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length} results</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {(
                  [
                    { col: "TID",            label: "TID" },
                    { col: "Technique Name", label: "Technique Name" },
                    { col: "Tactic",         label: "Tactic" },
                    { col: "CIA Score",      label: "CIA Score" },
                    { col: "Impact Rate",    label: "Impact Rate" },
                    { col: "Likelihood Rate",label: "Likelihood" },
                  ] as { col: SortKey; label: string }[]
                ).map(({ col, label }) => (
                  <th key={col} className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">
                    <button onClick={() => handleSort(col)} className="flex items-center hover:text-foreground transition-colors">
                      {label}<SortIcon col={col} />
                    </button>
                  </th>
                ))}
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">Last Seen</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">
                  <button onClick={() => handleSort("Risk Scores")} className="flex items-center hover:text-foreground transition-colors">
                    Risk Score<SortIcon col="Risk Scores" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 100).map((row, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/all-procedures?mitre=${encodeURIComponent(row.TID)}`}>
                      <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded hover:bg-primary/20 transition-colors cursor-pointer">
                        {row.TID}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground max-w-xs">
                    <Link href={`/all-procedures?mitre=${encodeURIComponent(row.TID)}`}>
                      <div className="truncate hover:text-primary hover:underline cursor-pointer transition-colors">
                        {row["Technique Name"]}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs">
                    <div className="truncate">{row.Tactic}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-center font-mono">
                    <span className={`font-semibold ${rateColor(row["Impact Rate"])}`}>{(row["CIA Score"] || 0).toFixed(1)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rateStyle(row["Impact Rate"])}`}>
                      {row["Impact Rate"] || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rateStyle(row["Likelihood Rate"])}`}>
                      {row["Likelihood Rate"] || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{row["Last Occurrence"] || "—"}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min(100, ((row["Risk Scores"] || 0) / maxRisk) * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono font-semibold text-foreground">{(row["Risk Scores"] || 0).toFixed(0)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > 100 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t border-border">
              Showing 100 of {sorted.length} results. Use search to filter further.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
