import { useState, useMemo } from "react";
import { Link } from "wouter";
import { applyOverrides, type RiskRow } from "@/utils/riskOverrides";
import { useTacticScores } from "@/context/TacticScoresContext";
import { useLikelihood }  from "@/context/LikelihoodContext";
import { useAppData, baseFullRiskCalc } from "@/context/AppDataContext";
import { CalendarRange } from "lucide-react";
import { useImpactOverrides } from "@/context/ImpactOverridesContext";
import { useHVAScores }       from "@/context/HVAScoresContext";
import { useDateWindow, DATE_RANGE_LABELS } from "@/context/DateWindowContext";

const rawRiskCalc: RiskRow[] = baseFullRiskCalc as RiskRow[];

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

  const { dateRange, tidsInWindow, setDateRange, setCustomFrom, setCustomTo } = useDateWindow();

  const { overrides: tacticOverrides }     = useTacticScores();
  const { overrides: likelihoodOverrides } = useLikelihood();
  const { overrides: impactOverrides }     = useImpactOverrides();
  const { hvaScoreMap }                    = useHVAScores();
  const { activeNewRiskRows, liveActorData } = useAppData();

  const allRawRows = useMemo(
    () => [...rawRiskCalc, ...(activeNewRiskRows as RiskRow[])],
    [activeNewRiskRows]
  );

  const riskCalc = useMemo(
    () => applyOverrides(allRawRows, tacticOverrides, likelihoodOverrides, impactOverrides, hvaScoreMap),
    [allRawRows, tacticOverrides, likelihoodOverrides, impactOverrides, hvaScoreMap]
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
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Risk Calculation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Risk = Impact × Likelihood
          {tidsInWindow
            ? ` · showing ${windowFiltered.length} of ${riskCalc.length} techniques observed in window`
            : ` · ${riskCalc.length} techniques`}
        </p>
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
