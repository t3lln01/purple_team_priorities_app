import { useState } from "react";
import data from "@/data.json";

type HVRow = {
  target: string;
  tid: string;
  tidName: string;
  risk: string;
  likelihood: string;
  impact: string;
  riskScore: number;
  likelihoodScore: number;
};

type HVScore = {
  tid: string;
  avgRisk: number;
  avgLikelihood: number;
};

const highvalue: HVRow[] = (data as any).highvalue;
const hvscores: HVScore[] = (data as any).hvscores;

function riskStyle(risk: string) {
  if (!risk) return "text-muted-foreground";
  const r = String(risk).toLowerCase();
  if (r === "high") return "text-red-400 bg-red-400/10 border border-red-400/30";
  if (r === "medium") return "text-yellow-400 bg-yellow-400/10 border border-yellow-400/30";
  if (r === "low") return "text-green-400 bg-green-400/10 border border-green-400/30";
  if (r === "unknown") return "text-muted-foreground bg-muted/30 border border-border";
  return "text-muted-foreground bg-muted/30 border border-border";
}

export default function HighValueAssets() {
  const [search, setSearch] = useState("");
  const [targetFilter, setTargetFilter] = useState("All");

  const targets = ["All", ...Array.from(new Set(highvalue.map(r => r.target))).sort()];
  const filtered = highvalue.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.target?.toLowerCase().includes(q) || r.tid?.toLowerCase().includes(q) || r.tidName?.toLowerCase().includes(q);
    const matchTarget = targetFilter === "All" || r.target === targetFilter;
    return matchSearch && matchTarget;
  });

  const highRiskCount = highvalue.filter(r => r.risk === "High").length;
  const uniqueTargets = new Set(highvalue.map(r => r.target)).size;
  const uniqueTids = new Set(highvalue.map(r => r.tid)).size;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">High Value Asset Risk</h1>
        <p className="text-muted-foreground text-sm mt-1">TTP risks mapped to critical business assets</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-primary">{highvalue.length}</div>
          <div className="text-sm text-muted-foreground mt-1">Total Risk Entries</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-chart-2">{uniqueTargets}</div>
          <div className="text-sm text-muted-foreground mt-1">Unique Targets</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-chart-3">{uniqueTids}</div>
          <div className="text-sm text-muted-foreground mt-1">Unique TTPs</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-red-400">{highRiskCount}</div>
          <div className="text-sm text-muted-foreground mt-1">High Risk Entries</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Average Scores by TID</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Aggregated risk and likelihood across assets</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">TID</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Avg Risk</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Risk Bar</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Avg Likelihood</th>
                </tr>
              </thead>
              <tbody>
                {hvscores.map(row => (
                  <tr key={row.tid} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">{row.tid}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{row.avgRisk.toFixed(2)}</td>
                    <td className="px-4 py-3 w-32">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (row.avgRisk / 5) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.avgLikelihood.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Risk by Target</h2>
            <p className="text-xs text-muted-foreground mt-0.5">High risk entries per target asset</p>
          </div>
          <div className="p-4 space-y-3">
            {Array.from(new Set(highvalue.map(r => r.target))).map(target => {
              const entries = highvalue.filter(r => r.target === target);
              const highCount = entries.filter(r => r.risk === "High").length;
              return (
                <div key={target}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground font-medium truncate max-w-48">{target}</span>
                    <span className="text-muted-foreground flex-shrink-0 ml-2">{highCount}/{entries.length} High</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${entries.length > 0 ? (highCount / entries.length) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <h2 className="font-semibold text-foreground flex-shrink-0">Asset Risk Matrix</h2>
          <input
            type="search"
            placeholder="Search targets, TIDs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={targetFilter}
            onChange={e => setTargetFilter(e.target.value)}
            className="bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {targets.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length} results</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Target Asset</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">TID</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Technique</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Risk</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Likelihood</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Risk Score</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Impact</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground max-w-xs">
                    <div className="truncate">{row.target}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">{row.tid}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs">
                    <div className="truncate">{row.tidName}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskStyle(row.risk)}`}>{row.risk || "—"}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskStyle(row.likelihood)}`}>{row.likelihood || "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono font-semibold text-foreground">{row.riskScore}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs">
                    <div className="truncate">{row.impact || "—"}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
