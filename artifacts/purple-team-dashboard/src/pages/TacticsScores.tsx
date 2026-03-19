import { Link } from "wouter";
import data from "@/data.json";
import { CONF_SCORES, INT_SCORES, AVAIL_SCORES } from "@/utils/impactFormulas";

type Tactic = {
  tactic: string;
  desc: string;
  conf: string;
  integrity: string;
  avail: string;
  extent: number;
};

const tactics: Tactic[] = (data as any).tactics;

/** Convert a rating label to its numeric CIA weight */
function confScore(v: string):  number { return CONF_SCORES[v]  ?? 0; }
function intScore(v: string):   number { return INT_SCORES[v]   ?? 0; }
function availScore(v: string): number { return AVAIL_SCORES[v] ?? 0; }
function ciaTotal(t: Tactic):   number { return confScore(t.conf) + intScore(t.integrity) + availScore(t.avail); }

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-10 text-right font-mono">{value.toFixed(2)}</span>
    </div>
  );
}

const TACTIC_COLORS: Record<string, string> = {
  "Initial Access":         "bg-red-500",
  "Execution":              "bg-orange-500",
  "Persistence":            "bg-yellow-500",
  "Privilege Escalation":   "bg-amber-500",
  "Defense Evasion":        "bg-green-500",
  "Credential Access":      "bg-teal-500",
  "Discovery":              "bg-cyan-500",
  "Lateral Movement":       "bg-blue-500",
  "Collection":             "bg-indigo-500",
  "Command and Control":    "bg-violet-500",
  "Exfiltration":           "bg-purple-500",
  "Impact":                 "bg-pink-500",
  "Reconnaissance":         "bg-rose-500",
  "Resource Development":   "bg-slate-500",
};

const RATING_BADGE: Record<string, string> = {
  High:   "text-red-400 bg-red-400/10 border border-red-400/30",
  Medium: "text-yellow-400 bg-yellow-400/10 border border-yellow-400/30",
  Low:    "text-green-400 bg-green-400/10 border border-green-400/30",
};

function RatingBadge({ label }: { label: string }) {
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${RATING_BADGE[label] ?? "text-muted-foreground"}`}>
      {label || "—"}
    </span>
  );
}

export default function TacticsScores() {
  const maxConf   = Math.max(...tactics.map(t => confScore(t.conf)));
  const maxInt    = Math.max(...tactics.map(t => intScore(t.integrity)));
  const maxAvail  = Math.max(...tactics.map(t => availScore(t.avail)));
  const maxExtent = Math.max(...tactics.map(t => Number(t.extent) || 0));
  const maxCIA    = Math.max(...tactics.map(t => ciaTotal(t)));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tactic Default Scores</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Baseline CIA and extent scores per MITRE ATT&CK tactic.
          CIA Total = C + I + A using the formula weights (Conf: L=1/M=2/H=3, Int: L=1/M=2.25/H=3.5, Avail: L=1/M=2.5/H=4).
        </p>
      </div>

      {/* ── Weight reference legend ── */}
      <div className="grid grid-cols-3 gap-4 text-xs">
        {[
          { label: "Confidentiality", scores: CONF_SCORES,  color: "text-blue-400" },
          { label: "Integrity",       scores: INT_SCORES,   color: "text-green-400" },
          { label: "Availability",    scores: AVAIL_SCORES, color: "text-yellow-400" },
        ].map(({ label, scores, color }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-3">
            <div className={`font-semibold mb-2 ${color}`}>{label}</div>
            {Object.entries(scores).map(([rating, val]) => (
              <div key={rating} className="flex justify-between py-0.5">
                <RatingBadge label={rating} />
                <span className="font-mono font-semibold text-foreground">{val}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Tactic cards ── */}
      <div className="grid grid-cols-2 gap-6">
        {tactics.map(tactic => {
          const color  = TACTIC_COLORS[tactic.tactic] || "bg-primary";
          const c      = confScore(tactic.conf);
          const i      = intScore(tactic.integrity);
          const a      = availScore(tactic.avail);
          const total  = c + i + a;

          return (
            <div key={tactic.tactic} className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className={`h-1 ${color}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <Link href={`/all-procedures?tactic=${encodeURIComponent(tactic.tactic)}`}>
                      <h3 className="font-semibold text-foreground hover:text-primary hover:underline cursor-pointer transition-colors">
                        {tactic.tactic}
                      </h3>
                    </Link>
                    {tactic.desc && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{tactic.desc}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-3 text-right">
                    <div className="text-xs text-muted-foreground">CIA Total</div>
                    <div className="text-xl font-bold text-foreground">{total.toFixed(2)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Confidentiality */}
                  <div>
                    <div className="flex justify-between text-xs mb-1 items-center">
                      <span className="text-muted-foreground">Confidentiality</span>
                      <div className="flex items-center gap-2">
                        <RatingBadge label={tactic.conf} />
                        <span className="text-blue-400 font-semibold font-mono">{c.toFixed(2)}</span>
                      </div>
                    </div>
                    <ScoreBar value={c} max={maxConf} color="bg-blue-500" />
                  </div>
                  {/* Integrity */}
                  <div>
                    <div className="flex justify-between text-xs mb-1 items-center">
                      <span className="text-muted-foreground">Integrity</span>
                      <div className="flex items-center gap-2">
                        <RatingBadge label={tactic.integrity} />
                        <span className="text-green-400 font-semibold font-mono">{i.toFixed(2)}</span>
                      </div>
                    </div>
                    <ScoreBar value={i} max={maxInt} color="bg-green-500" />
                  </div>
                  {/* Availability */}
                  <div>
                    <div className="flex justify-between text-xs mb-1 items-center">
                      <span className="text-muted-foreground">Availability</span>
                      <div className="flex items-center gap-2">
                        <RatingBadge label={tactic.avail} />
                        <span className="text-yellow-400 font-semibold font-mono">{a.toFixed(2)}</span>
                      </div>
                    </div>
                    <ScoreBar value={a} max={maxAvail} color="bg-yellow-500" />
                  </div>
                  {/* CIA Total bar */}
                  <div className="pt-1 border-t border-border/40">
                    <div className="flex justify-between text-xs mb-1 items-center">
                      <span className="text-muted-foreground font-medium">CIA Total (C+I+A)</span>
                      <span className="text-foreground font-bold font-mono">{total.toFixed(2)}</span>
                    </div>
                    <ScoreBar value={total} max={maxCIA} color="bg-primary" />
                  </div>
                  {/* TTP Extent */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">TTP Extent Score</span>
                      <span className="text-primary font-semibold font-mono">{Number(tactic.extent) || 0}</span>
                    </div>
                    <ScoreBar value={Number(tactic.extent) || 0} max={maxExtent} color="bg-violet-500" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Comparison table ── */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Tactic Comparison Table</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Sorted by CIA Total (descending)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Tactic</th>
                <th className="text-center px-4 py-2.5 text-xs text-muted-foreground font-medium">Rating</th>
                <th className="text-right px-4 py-2.5 text-xs text-blue-400 font-medium">Conf.</th>
                <th className="text-center px-4 py-2.5 text-xs text-muted-foreground font-medium">Rating</th>
                <th className="text-right px-4 py-2.5 text-xs text-green-400 font-medium">Int.</th>
                <th className="text-center px-4 py-2.5 text-xs text-muted-foreground font-medium">Rating</th>
                <th className="text-right px-4 py-2.5 text-xs text-yellow-400 font-medium">Avail.</th>
                <th className="text-right px-4 py-2.5 text-xs text-foreground font-medium">CIA Total</th>
                <th className="text-right px-4 py-2.5 text-xs text-violet-400 font-medium">TTP Extent</th>
              </tr>
            </thead>
            <tbody>
              {[...tactics].sort((a, b) => ciaTotal(b) - ciaTotal(a)).map(tactic => {
                const color = TACTIC_COLORS[tactic.tactic] || "bg-primary";
                const c = confScore(tactic.conf);
                const i = intScore(tactic.integrity);
                const a = availScore(tactic.avail);
                const total = c + i + a;
                return (
                  <tr key={tactic.tactic} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/all-procedures?tactic=${encodeURIComponent(tactic.tactic)}`}>
                        <div className="flex items-center gap-2 group cursor-pointer">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                          <span className="text-sm font-medium text-foreground group-hover:text-primary group-hover:underline transition-colors">
                            {tactic.tactic}
                          </span>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center"><RatingBadge label={tactic.conf} /></td>
                    <td className="px-4 py-3 text-right text-xs text-blue-400 font-semibold font-mono">{c.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center"><RatingBadge label={tactic.integrity} /></td>
                    <td className="px-4 py-3 text-right text-xs text-green-400 font-semibold font-mono">{i.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center"><RatingBadge label={tactic.avail} /></td>
                    <td className="px-4 py-3 text-right text-xs text-yellow-400 font-semibold font-mono">{a.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-foreground">{total.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-violet-400 font-semibold font-mono">
                      {Number(tactic.extent) || 0}
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
