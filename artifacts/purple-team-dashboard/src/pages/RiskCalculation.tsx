import { useState } from "react";
import data from "@/data.json";

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

const riskCalc: RiskRow[] = (data as any).riskCalc;

function rateColor(rate: string) {
  if (!rate) return "text-muted-foreground";
  const r = String(rate).toLowerCase();
  if (r.includes("very high")) return "text-red-400";
  if (r.includes("high")) return "text-orange-400";
  if (r.includes("medium")) return "text-yellow-400";
  if (r.includes("low")) return "text-green-400";
  return "text-muted-foreground";
}

function rateStyle(rate: string) {
  if (!rate) return "bg-muted/50 text-muted-foreground";
  const r = String(rate).toLowerCase();
  if (r.includes("very high")) return "bg-red-500/10 border border-red-500/30 text-red-400";
  if (r.includes("high")) return "bg-orange-500/10 border border-orange-500/30 text-orange-400";
  if (r.includes("medium")) return "bg-yellow-500/10 border border-yellow-500/30 text-yellow-400";
  if (r.includes("low")) return "bg-green-500/10 border border-green-500/30 text-green-400";
  return "bg-muted/50 text-muted-foreground border border-border";
}

export default function RiskCalculation() {
  const [search, setSearch] = useState("");
  const [tacticFilter, setTacticFilter] = useState("All");

  const tactics = ["All", ...Array.from(new Set(riskCalc.flatMap(r => r.Tactic?.split(", ") || []))).sort()];

  const filtered = riskCalc.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.TID?.toLowerCase().includes(q) || r["Technique Name"]?.toLowerCase().includes(q) || r.Tactic?.toLowerCase().includes(q);
    const matchTactic = tacticFilter === "All" || (r.Tactic || "").includes(tacticFilter);
    return matchSearch && matchTactic;
  });

  const avgRisk = riskCalc.reduce((s, r) => s + (r["Risk Scores"] || 0), 0) / riskCalc.length;
  const maxRisk = Math.max(...riskCalc.map(r => r["Risk Scores"] || 0));
  const vhImpact = riskCalc.filter(r => r["Impact Rate"] === "Very High").length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Risk Calculation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Risk formula: [(CIA Score × TTP Extent) × (Priority × Last Occurrence × Confidence)] — {riskCalc.length} techniques
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-primary">{riskCalc.length}</div>
          <div className="text-sm text-muted-foreground mt-1">Techniques Evaluated</div>
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
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">TID</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Technique Name</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Tactic</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">CIA Score</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">Impact Rate</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">Likelihood</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">Last Seen</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium whitespace-nowrap">Risk Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((row, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">{row.TID}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground max-w-xs">
                    <div className="truncate">{row["Technique Name"]}</div>
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
          {filtered.length > 100 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t border-border">
              Showing 100 of {filtered.length} results. Use search to filter further.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
