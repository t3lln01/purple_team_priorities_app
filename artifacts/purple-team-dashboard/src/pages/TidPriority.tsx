import { useState } from "react";
import { Link } from "wouter";
import data from "@/data.json";

type TIDRow = {
  tid: string;
  count: number;
  lastObs: number;
  risk: number;
};

const tidPriority: TIDRow[] = (data as any).tidPriority;

function excelDateToStr(n: number) {
  if (!n || typeof n !== "number") return "—";
  const date = new Date(Math.round((n - 25569) * 86400 * 1000));
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function riskBand(risk: number) {
  if (risk >= 1000) return { label: "Critical", cls: "bg-red-500/10 border border-red-500/30 text-red-400" };
  if (risk >= 600) return { label: "High", cls: "bg-orange-500/10 border border-orange-500/30 text-orange-400" };
  if (risk >= 300) return { label: "Medium", cls: "bg-yellow-500/10 border border-yellow-500/30 text-yellow-400" };
  return { label: "Low", cls: "bg-green-500/10 border border-green-500/30 text-green-400" };
}

export default function TidPriority() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"risk" | "count">("risk");

  const filtered = tidPriority
    .filter(r => !search || r.tid.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === "risk" ? b.risk - a.risk : b.count - a.count);

  const maxRisk = Math.max(...tidPriority.map(r => r.risk));
  const critical = tidPriority.filter(r => r.risk >= 1000).length;
  const high = tidPriority.filter(r => r.risk >= 600 && r.risk < 1000).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">TID Priority</h1>
        <p className="text-muted-foreground text-sm mt-1">Top {tidPriority.length} technique IDs ranked by risk score and procedure coverage</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-primary">{tidPriority.length}</div>
          <div className="text-sm text-muted-foreground mt-1">Techniques Ranked</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-red-400">{critical}</div>
          <div className="text-sm text-muted-foreground mt-1">Critical (&gt;1000)</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-orange-400">{high}</div>
          <div className="text-sm text-muted-foreground mt-1">High (600–1000)</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-2xl font-bold text-chart-2">{Math.max(...tidPriority.map(r => r.count))}</div>
          <div className="text-sm text-muted-foreground mt-1">Max Procedures</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Top 15 by Risk Score</h2>
          </div>
          <div className="p-4 space-y-3">
            {[...tidPriority].sort((a, b) => b.risk - a.risk).slice(0, 15).map(row => (
              <div key={row.tid}>
                <div className="flex justify-between text-xs mb-1">
                  <Link href={`/all-procedures?mitre=${encodeURIComponent(row.tid)}`}>
                    <span className="font-mono text-primary hover:underline cursor-pointer" title="View procedures">{row.tid}</span>
                  </Link>
                  <span className="text-muted-foreground">{row.risk.toFixed(0)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${(row.risk / maxRisk) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Top 15 by Procedure Count</h2>
          </div>
          <div className="p-4 space-y-3">
            {[...tidPriority].sort((a, b) => b.count - a.count).slice(0, 15).map(row => {
              const maxCount = Math.max(...tidPriority.map(r => r.count));
              return (
                <div key={row.tid}>
                  <div className="flex justify-between text-xs mb-1">
                    <Link href={`/all-procedures?mitre=${encodeURIComponent(row.tid)}`}>
                      <span className="font-mono text-primary hover:underline cursor-pointer" title="View procedures">{row.tid}</span>
                    </Link>
                    <span className="text-muted-foreground">{row.count} procedures</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-chart-2 rounded-full" style={{ width: `${(row.count / maxCount) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <h2 className="font-semibold flex-shrink-0">Full TID Priority Table</h2>
          <input
            type="search"
            placeholder="Search TIDs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy("risk")}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${sortBy === "risk" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
            >
              By Risk
            </button>
            <button
              onClick={() => setSortBy("count")}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${sortBy === "count" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
            >
              By Count
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">#</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">TID</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Procedure Count</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Last Observed</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Risk Score</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Risk Band</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Risk Bar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const band = riskBand(row.risk);
                return (
                  <tr key={row.tid} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/all-procedures?mitre=${encodeURIComponent(row.tid)}`}>
                        <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded hover:bg-primary/20 transition-colors cursor-pointer" title="View procedures for this technique">
                          {row.tid}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground font-semibold">{row.count}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{excelDateToStr(row.lastObs)}</td>
                    <td className="px-4 py-2.5 text-xs font-mono font-bold text-foreground">{row.risk.toFixed(1)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${band.cls}`}>{band.label}</span>
                    </td>
                    <td className="px-4 py-2.5 w-32">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(row.risk / maxRisk) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
