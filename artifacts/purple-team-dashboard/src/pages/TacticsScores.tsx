import data from "@/data.json";

type Tactic = {
  tactic: string;
  desc: string;
  conf: number;
  integrity: number;
  avail: number;
  extent: number;
};

const tactics: Tactic[] = (data as any).tactics;

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right font-mono">{value}</span>
    </div>
  );
}

const TACTIC_COLORS: Record<string, string> = {
  "Initial Access": "bg-red-500",
  "Execution": "bg-orange-500",
  "Persistence": "bg-yellow-500",
  "Privilege Escalation": "bg-amber-500",
  "Defense Evasion": "bg-green-500",
  "Credential Access": "bg-teal-500",
  "Discovery": "bg-cyan-500",
  "Lateral Movement": "bg-blue-500",
  "Collection": "bg-indigo-500",
  "Command and Control": "bg-violet-500",
  "Exfiltration": "bg-purple-500",
  "Impact": "bg-pink-500",
  "Reconnaissance": "bg-rose-500",
  "Resource Development": "bg-slate-500",
};

export default function TacticsScores() {
  const maxConf = Math.max(...tactics.map(t => Number(t.conf) || 0));
  const maxInt = Math.max(...tactics.map(t => Number(t.integrity) || 0));
  const maxAvail = Math.max(...tactics.map(t => Number(t.avail) || 0));
  const maxExtent = Math.max(...tactics.map(t => Number(t.extent) || 0));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tactic Default Scores</h1>
        <p className="text-muted-foreground text-sm mt-1">Baseline CIA and extent scores per MITRE ATT&CK tactic</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {tactics.map(tactic => {
          const color = TACTIC_COLORS[tactic.tactic] || "bg-primary";
          const ciaTotal = (Number(tactic.conf) || 0) + (Number(tactic.integrity) || 0) + (Number(tactic.avail) || 0);
          return (
            <div key={tactic.tactic} className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className={`h-1 ${color}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{tactic.tactic}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{tactic.desc || "—"}</p>
                  </div>
                  <div className="flex-shrink-0 ml-3 text-right">
                    <div className="text-xs text-muted-foreground">CIA Total</div>
                    <div className="text-xl font-bold text-foreground">{ciaTotal.toFixed(1)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Confidentiality</span>
                      <span className="text-foreground font-medium">{Number(tactic.conf) || 0}</span>
                    </div>
                    <ScoreBar value={Number(tactic.conf) || 0} max={maxConf} color="bg-blue-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Integrity</span>
                      <span className="text-foreground font-medium">{Number(tactic.integrity) || 0}</span>
                    </div>
                    <ScoreBar value={Number(tactic.integrity) || 0} max={maxInt} color="bg-green-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Availability</span>
                      <span className="text-foreground font-medium">{Number(tactic.avail) || 0}</span>
                    </div>
                    <ScoreBar value={Number(tactic.avail) || 0} max={maxAvail} color="bg-yellow-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">TTP Extent Score</span>
                      <span className="text-foreground font-medium">{Number(tactic.extent) || 0}</span>
                    </div>
                    <ScoreBar value={Number(tactic.extent) || 0} max={maxExtent} color="bg-primary" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Tactic Comparison Table</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Tactic</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Confidentiality</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Integrity</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Availability</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">CIA Total</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">TTP Extent</th>
              </tr>
            </thead>
            <tbody>
              {[...tactics].sort((a, b) => {
                const aTotal = (Number(a.conf) || 0) + (Number(a.integrity) || 0) + (Number(a.avail) || 0);
                const bTotal = (Number(b.conf) || 0) + (Number(b.integrity) || 0) + (Number(b.avail) || 0);
                return bTotal - aTotal;
              }).map(tactic => {
                const ciaTotal = (Number(tactic.conf) || 0) + (Number(tactic.integrity) || 0) + (Number(tactic.avail) || 0);
                const color = TACTIC_COLORS[tactic.tactic] || "bg-primary";
                return (
                  <tr key={tactic.tactic} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${color}`} />
                        <span className="text-sm font-medium text-foreground">{tactic.tactic}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-blue-400 font-semibold">{tactic.conf || 0}</td>
                    <td className="px-4 py-3 text-xs text-green-400 font-semibold">{tactic.integrity || 0}</td>
                    <td className="px-4 py-3 text-xs text-yellow-400 font-semibold">{tactic.avail || 0}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-foreground">{ciaTotal.toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-primary font-semibold">{tactic.extent || 0}</td>
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
