import { useState, useMemo } from "react";
import { Link } from "wouter";
import data from "@/data.json";

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

const actors: Actor[] = (data as any).actors;
const actorRanking: ActorRanking[] = (data as any).actorRanking;
const allProcedures: Procedure[] = (data as any).allProcedures;

const procedureActors: string[] = Array.from(
  new Set(allProcedures.map(r => r.actor).filter(Boolean))
).sort();

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

const RISK_LEVELS = ["All", "Critical", "High", "Medium", "Low"] as const;
type RiskLevel = typeof RISK_LEVELS[number];

export default function ActorPrioritisation() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskLevel>("All");
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());
  const [chipSearch, setChipSearch] = useState("");

  const maxRisk = Math.max(...actorRanking.map(a => a.riskSum));

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
  }), [search, riskFilter, selectedActors]);

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

  const topActors = filtered.slice(0, 10);

  const visibleChips = chipSearch
    ? procedureActors.filter(a => a.toLowerCase().includes(chipSearch.toLowerCase()))
    : procedureActors;

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
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Actor</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Intent</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Cap.</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Risk %</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Level</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No actors match the current filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((actor, i) => (
                    <tr key={actor.name} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <Link href={`/all-procedures?actor=${encodeURIComponent(actor.name)}`}>
                          <span className="font-medium text-foreground hover:text-primary hover:underline cursor-pointer transition-colors" title="View procedures for this actor">
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

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Top 10 Actors — Full Detail</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Actor</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Intent Score</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Capability Score</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">TTP Risk Score</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Priority Value</th>
                <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Risk %</th>
              </tr>
            </thead>
            <tbody>
              {topActors.map(actor => (
                <tr key={actor.name} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/all-procedures?actor=${encodeURIComponent(actor.name)}`}>
                      <span className="font-semibold text-foreground hover:text-primary hover:underline cursor-pointer transition-colors" title="View procedures for this actor">
                        {actor.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-chart-2">{actor.intent}</td>
                  <td className="px-4 py-3 text-chart-3">{actor.capability}</td>
                  <td className="px-4 py-3 text-muted-foreground">{actor.ttpRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3 font-mono text-foreground">{actor.priority.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${actor.riskPct * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{(actor.riskPct * 100).toFixed(1)}%</span>
                    </div>
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
