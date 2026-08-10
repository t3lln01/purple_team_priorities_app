import { useState, useMemo } from "react";
import threatModelData from "@/threatModelData.json";
import { useSortTable } from "@/hooks/useSortTable";
import SortableTh from "@/components/SortableTh";
import { ChevronDown, ChevronRight, Shield, Target, Zap, Globe, X } from "lucide-react";

type ThreatActor = {
  name: string;
  origins: string;
  aliases: string;
  actorType: string;
  lastSeen: string | null;
  malware: string;
  countries: string[];
  industries: string[];
  intent: string;
  intentScore: number | null;
  willingness: string;
  pptap: number;
  sirt: number;
  willingnessScore: number | null;
  capabilities: string;
  capabilitiesScore: number | null;
  novelty: string;
  noveltyScore: number | null;
  intentFinalScore: number | null;
  capabilityFinalScore: number | null;
  motivation: string;
  adversaryType: string;
  communityIds: string;
  inMonitoringList: boolean;
};

const allActors = (threatModelData as any).threatModelActors as ThreatActor[];
const scoringFramework = (threatModelData as any).scoringFramework as any[];

// Derive unique filter options
const allOrigins = Array.from(
  new Set(
    allActors.map(a => {
      const o = a.origins || "Unknown";
      // Normalise to primary region
      if (o.includes("China") || o.includes("East Asia")) return "China";
      if (o.includes("Russian Federation") || o.includes("Eastern Europe")) return "Russia";
      if (o.includes("Iran") || o.includes("Middle East")) return "Iran";
      if (o.includes("North Korea")) return "North Korea";
      if (o.includes("Pakistan")) return "Pakistan";
      if (o.includes("India")) return "India";
      if (o.includes("Israel")) return "Israel";
      if (o.includes("Brazil") || o.includes("South America")) return "Brazil";
      if (o.includes("Nigeria")) return "Nigeria";
      if (o.includes("Colombia")) return "Colombia";
      if (o === "Unknown" || !o) return "Unknown";
      return o.split(",")[0].trim();
    })
  )
).sort();

const allTypes = Array.from(
  new Set(allActors.map(a => a.actorType || "Unknown"))
).sort();

// Helpers
function actorTypeShort(type: string) {
  if (type.includes("Espionage")) return "Espionage";
  if (type.includes("Destructive")) return "Destructive";
  if (type.includes("Disruptive")) return "Disruptive";
  if (type.includes("Cyber-Crime") || type.includes("eCrime")) return "eCrime";
  return type;
}

function actorTypeColor(type: string) {
  const s = actorTypeShort(type);
  if (s === "Espionage") return "text-blue-400 bg-blue-400/10 border border-blue-400/30";
  if (s === "Destructive") return "text-red-400 bg-red-400/10 border border-red-400/30";
  if (s === "Disruptive") return "text-orange-400 bg-orange-400/10 border border-orange-400/30";
  if (s === "eCrime") return "text-yellow-400 bg-yellow-400/10 border border-yellow-400/30";
  return "text-muted-foreground bg-muted/30 border border-border";
}

function originFlag(origin: string) {
  if (!origin) return "";
  if (origin.includes("China")) return "🇨🇳";
  if (origin.includes("Russia") || origin.includes("Russian")) return "🇷🇺";
  if (origin.includes("Iran")) return "🇮🇷";
  if (origin.includes("North Korea")) return "🇰🇵";
  if (origin.includes("Pakistan")) return "🇵🇰";
  if (origin.includes("India")) return "🇮🇳";
  if (origin.includes("Israel")) return "🇮🇱";
  if (origin.includes("Brazil")) return "🇧🇷";
  if (origin.includes("Nigeria")) return "🇳🇬";
  if (origin.includes("Colombia")) return "🇨🇴";
  return "🌐";
}

function scoreBar(value: number, max: number = 6, color = "bg-primary") {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold w-4 text-right">{value}</span>
    </div>
  );
}

function ScoreChip({ label, value, color }: { label: string; value: number | null; color: string }) {
  if (value === null) return null;
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg border ${color} min-w-[64px]`}>
      <span className="text-lg font-bold font-mono">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</span>
    </div>
  );
}

function ActorRow({ actor }: { actor: ThreatActor }) {
  const [expanded, setExpanded] = useState(false);
  const typeShort = actorTypeShort(actor.actorType);
  const typeColor = actorTypeColor(actor.actorType);
  const flag = originFlag(actor.origins);
  const risk = ((actor.intentFinalScore ?? 0) + (actor.capabilityFinalScore ?? 0)) / 12;

  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-accent/20 cursor-pointer transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-4 py-3 w-8">
          <div className="text-muted-foreground">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground font-mono">{actor.name}</span>
            {actor.inMonitoringList && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/20 text-primary border border-primary/30">MONITORED</span>
            )}
            {actor.pptap > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-400/30">PP-TAP</span>
            )}
            {actor.sirt > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-400/30">SIRT</span>
            )}
          </div>
          {actor.aliases && (
            <div className="text-[11px] text-muted-foreground mt-0.5 max-w-xs truncate">{actor.aliases}</div>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <span>{flag}</span>
            <span className="text-muted-foreground text-xs">{actor.origins || "Unknown"}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${typeColor}`}>
            {typeShort}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
          {actor.lastSeen ? new Date(actor.lastSeen).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}
        </td>
        <td className="px-4 py-3 min-w-[120px]">
          {scoreBar(actor.intentFinalScore ?? 0, 7, "bg-amber-500")}
        </td>
        <td className="px-4 py-3 min-w-[120px]">
          {scoreBar(actor.capabilityFinalScore ?? 0, 6, "bg-primary")}
        </td>
        <td className="px-4 py-3 min-w-[120px]">
          {scoreBar((actor.intentFinalScore ?? 0) + (actor.capabilityFinalScore ?? 0), 13, risk >= 0.7 ? "bg-red-400" : risk >= 0.5 ? "bg-orange-400" : "bg-yellow-400")}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px]">
          <div className="truncate">
            {actor.industries.length > 0 ? actor.industries.slice(0, 3).join(", ") + (actor.industries.length > 3 ? ` +${actor.industries.length - 3}` : "") : "—"}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={9} className="bg-card/50 px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {/* Scores */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score Breakdown</h4>
                <div className="flex gap-2 flex-wrap">
                  <ScoreChip label="Intent" value={actor.intentFinalScore} color="text-amber-400 border-amber-400/30 bg-amber-400/5" />
                  <ScoreChip label="Capability" value={actor.capabilityFinalScore} color="text-primary border-primary/30 bg-primary/5" />
                  <ScoreChip label="Willingness" value={actor.willingnessScore} color="text-purple-400 border-purple-400/30 bg-purple-400/5" />
                  <ScoreChip label="PP-TAP" value={actor.pptap} color="text-amber-500 border-amber-500/30 bg-amber-500/5" />
                  <ScoreChip label="SIRT" value={actor.sirt} color="text-red-400 border-red-400/30 bg-red-400/5" />
                </div>
                <div className="space-y-2 mt-2">
                  {actor.intent && (
                    <div>
                      <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Intent Rationale</div>
                      <p className="text-xs text-foreground leading-relaxed">{actor.intent}</p>
                    </div>
                  )}
                  {actor.willingness && (
                    <div>
                      <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Willingness Rationale</div>
                      <p className="text-xs text-foreground leading-relaxed">{actor.willingness}</p>
                    </div>
                  )}
                  {actor.capabilities && (
                    <div>
                      <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Capability Rationale</div>
                      <p className="text-xs text-foreground leading-relaxed">{actor.capabilities}</p>
                    </div>
                  )}
                  {actor.novelty && (
                    <div>
                      <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Novelty</div>
                      <p className="text-xs text-foreground leading-relaxed">{actor.novelty}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Profile */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actor Profile</h4>
                {actor.aliases && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Also Known As</div>
                    <p className="text-xs text-foreground leading-relaxed">{actor.aliases}</p>
                  </div>
                )}
                {actor.communityIds && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Community Identifiers</div>
                    <p className="text-xs text-foreground leading-relaxed">{actor.communityIds}</p>
                  </div>
                )}
                {actor.motivation && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Motivation</div>
                    <p className="text-xs text-foreground">{actor.motivation}</p>
                  </div>
                )}
                {actor.malware && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Malware / Tools</div>
                    <div className="flex flex-wrap gap-1">
                      {actor.malware.replace(/Malware developed|Malware used/gi, "").trim().split(/\s+/).filter(Boolean).slice(0, 20).map((m, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] text-foreground font-mono border border-border/50">{m}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Geography & Industries */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Targeting</h4>
                {actor.countries.length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1 flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Countries ({actor.countries.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {actor.countries.map((c, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-muted/30 rounded text-[10px] text-foreground border border-border/40">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {actor.industries.length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Industries ({actor.industries.length})</div>
                    <div className="flex flex-wrap gap-1">
                      {actor.industries.map((ind, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-primary/5 rounded text-[10px] text-primary border border-primary/20">{ind}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ThreatModel() {
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [monitoredOnly, setMonitoredOnly] = useState(false);
  const [showFramework, setShowFramework] = useState(false);

  const { sortKey, sortDir, toggle, sorted } = useSortTable(
    useMemo(() => {
      const q = search.toLowerCase();
      return allActors.filter(a => {
        if (monitoredOnly && !a.inMonitoringList) return false;
        if (originFilter !== "all") {
          const norm = (() => {
            const o = a.origins || "Unknown";
            if (o.includes("China") || o.includes("East Asia")) return "China";
            if (o.includes("Russian Federation") || o.includes("Eastern Europe")) return "Russia";
            if (o.includes("Iran") || o.includes("Middle East")) return "Iran";
            if (o.includes("North Korea")) return "North Korea";
            if (o.includes("Pakistan")) return "Pakistan";
            if (o.includes("India")) return "India";
            if (o.includes("Israel")) return "Israel";
            if (o.includes("Brazil") || o.includes("South America")) return "Brazil";
            if (o.includes("Nigeria")) return "Nigeria";
            if (o.includes("Colombia")) return "Colombia";
            if (o === "Unknown" || !o) return "Unknown";
            return o.split(",")[0].trim();
          })();
          if (norm !== originFilter) return false;
        }
        if (typeFilter !== "all" && actorTypeShort(a.actorType) !== typeFilter) return false;
        if (q && !a.name.toLowerCase().includes(q) && !a.aliases.toLowerCase().includes(q) &&
            !a.origins.toLowerCase().includes(q) && !a.malware.toLowerCase().includes(q) &&
            !a.industries.join(" ").toLowerCase().includes(q)) return false;
        return true;
      });
    }, [search, originFilter, typeFilter, monitoredOnly])
  );

  // Stats
  const monitored = allActors.filter(a => a.inMonitoringList).length;
  const highIntent = allActors.filter(a => (a.intentFinalScore ?? 0) >= 5).length;
  const highCap = allActors.filter(a => (a.capabilityFinalScore ?? 0) >= 5).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Threat Model — Q3 2027</h1>
          <p className="text-muted-foreground text-sm mt-1">
            APT Groups &amp; Operations adversary threat model. {allActors.length} actors assessed across intent, capability, willingness &amp; novelty.
          </p>
        </div>
        <button
          onClick={() => setShowFramework(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Shield className="w-3.5 h-3.5" />
          {showFramework ? "Hide" : "Show"} Scoring Framework
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Actors", value: allActors.length, icon: Target, color: "text-primary" },
          { label: "Monitored", value: monitored, icon: Shield, color: "text-primary" },
          { label: "High Intent (≥5)", value: highIntent, icon: Zap, color: "text-amber-400" },
          { label: "High Capability (≥5)", value: highCap, icon: Target, color: "text-red-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <Icon className={`w-5 h-5 ${color}`} />
            <div>
              <div className="text-2xl font-bold text-foreground">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Scoring framework accordion */}
      {showFramework && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Scoring Framework Reference</h3>
            <button onClick={() => setShowFramework(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scoringFramework.filter(r => r.category).map((row, i) => (
              <div key={i} className="p-3 bg-muted/20 rounded-lg border border-border/50 space-y-2">
                <div className="text-xs font-semibold text-foreground">{row.category}</div>
                {row.intent && <div className="text-[11px] text-muted-foreground"><span className="text-amber-400 font-medium">Intent:</span> {row.intent} <span className="font-mono text-amber-400">[{row.intentScore}]</span></div>}
                {row.willingness && <div className="text-[11px] text-muted-foreground"><span className="text-purple-400 font-medium">Willingness:</span> {row.willingness} <span className="font-mono text-purple-400">[{row.willingnessScore}]</span></div>}
                {row.capability && <div className="text-[11px] text-muted-foreground"><span className="text-primary font-medium">Capability:</span> {row.capability} <span className="font-mono text-primary">[{row.capabilityScore}]</span></div>}
                {row.novelty && <div className="text-[11px] text-muted-foreground"><span className="text-green-400 font-medium">Novelty:</span> {row.novelty} <span className="font-mono text-green-400">[{row.noveltyScore}]</span></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search actors, aliases, malware, industry…"
          className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-w-[260px]"
        />
        <select
          value={originFilter}
          onChange={e => setOriginFilter(e.target.value)}
          className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Origins</option>
          {allOrigins.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Types</option>
          {["Espionage", "eCrime", "Destructive", "Disruptive"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={monitoredOnly}
            onChange={e => setMonitoredOnly(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-foreground">Monitored only</span>
        </label>
        <span className="text-xs text-muted-foreground ml-auto">{sorted.length} actors</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-8 px-4 py-3" />
                <SortableTh col="name" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actor</SortableTh>
                <SortableTh col="origins" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Origin</SortableTh>
                <SortableTh col="actorType" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</SortableTh>
                <SortableTh col="lastSeen" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Seen</SortableTh>
                <SortableTh col="intentFinalScore" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[130px]">Intent</SortableTh>
                <SortableTh col="capabilityFinalScore" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[130px]">Capability</SortableTh>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[130px]">Combined</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Industries</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((actor: ThreatActor) => (
                <ActorRow key={actor.name} actor={actor} />
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No actors match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Source: APT Groups &amp; Operations — Threat Model Update Q3 2027. Intent and Capability scores derived from the internal scoring framework above.
        Combined score = Intent Final Score + Capability Final Score (max 13).
      </p>
    </div>
  );
}
