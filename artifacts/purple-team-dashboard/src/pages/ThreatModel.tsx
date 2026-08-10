import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import threatModelData from "@/threatModelData.json";
import { useSortTable } from "@/hooks/useSortTable";
import SortableTh from "@/components/SortableTh";
import {
  ChevronDown, ChevronRight, Shield, Target, Zap, Globe, X,
  RefreshCw, Plus, Check, AlertCircle, Search, Eye, EyeOff,
  Loader2, Trash2, Edit2, BookOpen,
} from "lucide-react";

const CS_API = "/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type BaseActor = {
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

type CustomActor = {
  name: string;
  origins: string;
  aliases: string;
  actorType: string;
  lastSeen: string | null;
  malware: string;
  countries: string[];
  industries: string[];
  intentFinalScore: number | null;
  capabilityFinalScore: number | null;
  willingnessScore: number | null;
  motivation: string;
  adversaryType: string;
  communityIds: string;
  inMonitoringList: boolean;
  isCustom: boolean;
  csEnriched: boolean;
  csLastRefreshed: string | null;
  description: string;
};

type ActorOverride = {
  inMonitoringList?: boolean;
  csEnriched?: boolean;
  csLastRefreshed?: string | null;
  csData?: Partial<CustomActor>;
};

type MergedActor = BaseActor & {
  isCustom: boolean;
  csEnriched: boolean;
  csLastRefreshed: string | null;
  description: string;
  /** monitoring is the resolved value after override */
  monitored: boolean;
};

// ── Static data ────────────────────────────────────────────────────────────────

const staticActors = (threatModelData as any).threatModelActors as BaseActor[];
const scoringFramework = (threatModelData as any).scoringFramework as any[];

// ── Helpers ────────────────────────────────────────────────────────────────────

function actorTypeShort(type: string | undefined | null) {
  if (!type) return "Unknown";
  if (type.includes("Espionage")) return "Espionage";
  if (type.includes("Destructive")) return "Destructive";
  if (type.includes("Disruptive")) return "Disruptive";
  if (type.includes("Cyber-Crime") || type.includes("eCrime") || type.toLowerCase().includes("crime")) return "eCrime";
  return type || "Unknown";
}

function actorTypeColor(type: string) {
  const s = actorTypeShort(type);
  if (s === "Espionage")   return "text-blue-400 bg-blue-400/10 border border-blue-400/30";
  if (s === "Destructive") return "text-red-400 bg-red-400/10 border border-red-400/30";
  if (s === "Disruptive")  return "text-orange-400 bg-orange-400/10 border border-orange-400/30";
  if (s === "eCrime")      return "text-yellow-400 bg-yellow-400/10 border border-yellow-400/30";
  return "text-muted-foreground bg-muted/30 border border-border";
}

function originFlag(origin: string) {
  if (!origin) return "🌐";
  if (origin.includes("China") || origin.includes("East Asia")) return "🇨🇳";
  if (origin.includes("Russia") || origin.includes("Russian")) return "🇷🇺";
  if (origin.includes("Iran") || origin.includes("Middle East")) return "🇮🇷";
  if (origin.includes("North Korea")) return "🇰🇵";
  if (origin.includes("Pakistan")) return "🇵🇰";
  if (origin.includes("India")) return "🇮🇳";
  if (origin.includes("Israel")) return "🇮🇱";
  if (origin.includes("Brazil") || origin.includes("South America")) return "🇧🇷";
  if (origin.includes("Nigeria")) return "🇳🇬";
  if (origin.includes("Colombia")) return "🇨🇴";
  if (origin.includes("United States")) return "🇺🇸";
  if (origin.includes("United Kingdom")) return "🇬🇧";
  if (origin.includes("Vietnam")) return "🇻🇳";
  if (origin.includes("Turkey")) return "🇹🇷";
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

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// ── Per-actor row ──────────────────────────────────────────────────────────────

function ActorRow({
  actor,
  onRefresh,
  onToggleMonitor,
  onDelete,
  refreshing,
}: {
  actor: MergedActor;
  onRefresh: (name: string) => void;
  onToggleMonitor: (name: string) => void;
  onDelete?: (name: string) => void;
  refreshing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeShort = actorTypeShort(actor.actorType);
  const typeColor = actorTypeColor(actor.actorType);
  const flag = originFlag(actor.origins);
  const combined = (actor.intentFinalScore ?? 0) + (actor.capabilityFinalScore ?? 0);
  const riskPct = combined / 13;

  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-accent/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-3 py-3 w-8 cursor-pointer">
          <span className="text-muted-foreground">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        </td>
        <td className="px-3 py-3 cursor-pointer">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-foreground font-mono">{actor.name}</span>
            {actor.monitored && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/20 text-primary border border-primary/30">MONITORED</span>
            )}
            {actor.isCustom && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-400/30">CUSTOM</span>
            )}
            {actor.csEnriched && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-400/30">CS LIVE</span>
            )}
            {(actor as any).pptap > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-400/30">PP-TAP</span>
            )}
            {(actor as any).sirt > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-400/30">SIRT</span>
            )}
          </div>
          {actor.aliases && (
            <div className="text-[11px] text-muted-foreground mt-0.5 max-w-xs truncate">{actor.aliases}</div>
          )}
        </td>
        <td className="px-3 py-3 cursor-pointer">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{flag}</span>
            <span className="truncate max-w-[120px]">{actor.origins || "Unknown"}</span>
          </div>
        </td>
        <td className="px-3 py-3 cursor-pointer">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${typeColor}`}>
            {typeShort}
          </span>
        </td>
        <td className="px-3 py-3 text-xs text-muted-foreground font-mono cursor-pointer">
          {fmtDate(actor.lastSeen)}
          {actor.csEnriched && actor.csLastRefreshed && (
            <div className="text-[10px] text-cyan-400/70 mt-0.5">↺ {fmtDate(actor.csLastRefreshed)}</div>
          )}
        </td>
        <td className="px-3 py-3 min-w-[110px] cursor-pointer">
          {scoreBar(actor.intentFinalScore ?? 0, 7, "bg-amber-500")}
        </td>
        <td className="px-3 py-3 min-w-[110px] cursor-pointer">
          {scoreBar(actor.capabilityFinalScore ?? 0, 6, "bg-primary")}
        </td>
        <td className="px-3 py-3 min-w-[110px] cursor-pointer">
          {scoreBar(combined, 13, riskPct >= 0.7 ? "bg-red-400" : riskPct >= 0.5 ? "bg-orange-400" : "bg-yellow-400")}
        </td>
        {/* Actions — stop propagation so clicks don't toggle expand */}
        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button
              title={actor.monitored ? "Remove from monitoring" : "Add to monitoring"}
              onClick={() => onToggleMonitor(actor.name)}
              className={`p-1.5 rounded-lg transition-colors ${
                actor.monitored
                  ? "text-primary bg-primary/10 hover:bg-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {actor.monitored ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            <button
              title="Refresh from CrowdStrike"
              onClick={() => onRefresh(actor.name)}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-cyan-400 hover:bg-cyan-400/10 transition-colors disabled:opacity-40"
            >
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            {actor.isCustom && onDelete && (
              <button
                title="Remove actor"
                onClick={() => onDelete(actor.name)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
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
                  {[
                    { label: "Intent", value: actor.intentFinalScore, color: "text-amber-400 border-amber-400/30 bg-amber-400/5" },
                    { label: "Capability", value: actor.capabilityFinalScore, color: "text-primary border-primary/30 bg-primary/5" },
                    { label: "Willingness", value: actor.willingnessScore, color: "text-purple-400 border-purple-400/30 bg-purple-400/5" },
                  ].map(({ label, value, color }) => value !== null && (
                    <div key={label} className={`flex flex-col items-center px-3 py-2 rounded-lg border ${color} min-w-[60px]`}>
                      <span className="text-lg font-bold font-mono">{value}</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</span>
                    </div>
                  ))}
                </div>
                {actor.description && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Description</div>
                    <p className="text-xs text-foreground leading-relaxed">{actor.description}</p>
                  </div>
                )}
                {(actor as any).intent && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Intent Rationale</div>
                    <p className="text-xs text-foreground leading-relaxed">{(actor as any).intent}</p>
                  </div>
                )}
                {(actor as any).capabilities && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Capability Rationale</div>
                    <p className="text-xs text-foreground leading-relaxed">{(actor as any).capabilities}</p>
                  </div>
                )}
                {(actor as any).novelty && (
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Novelty</div>
                    <p className="text-xs text-foreground leading-relaxed">{(actor as any).novelty}</p>
                  </div>
                )}
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
                {actor.communityIds && actor.communityIds !== actor.aliases && (
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
                      {actor.malware
                        .replace(/Malware developed|Malware used/gi, "")
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 25)
                        .map((m, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] text-foreground font-mono border border-border/50">{m}</span>
                        ))}
                    </div>
                  </div>
                )}
                {actor.csLastRefreshed && (
                  <div className="text-[10px] text-cyan-400/70">
                    CS data refreshed: {new Date(actor.csLastRefreshed).toLocaleString("en-GB")}
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

// ── Add Actor Modal ────────────────────────────────────────────────────────────

type AddActorMode = "manual" | "cs";

const ACTOR_TYPES = [
  "Espionage — attacks impacting the Confidentiality of data or systems",
  "Destructive — attacks impacting the Integrity of data or systems",
  "Disruptive — attacks impacting the Availability of data or systems",
  "Cyber-Crime — attacks intended for near-term financial profit",
];

const blankForm = (): CustomActor => ({
  name: "",
  origins: "",
  aliases: "",
  actorType: ACTOR_TYPES[0],
  lastSeen: "",
  malware: "",
  countries: [],
  industries: [],
  intentFinalScore: null,
  capabilityFinalScore: null,
  willingnessScore: null,
  motivation: "",
  adversaryType: "",
  communityIds: "",
  inMonitoringList: false,
  isCustom: true,
  csEnriched: false,
  csLastRefreshed: null,
  description: "",
});

function AddActorModal({
  onClose,
  onSave,
  existingNames,
}: {
  onClose: () => void;
  onSave: (actor: CustomActor) => void;
  existingNames: Set<string>;
}) {
  const [mode, setMode] = useState<AddActorMode>("cs");
  const [form, setForm] = useState<CustomActor>(blankForm());
  const [csQuery, setCsQuery] = useState("");
  const [csResults, setCsResults] = useState<CustomActor[]>([]);
  const [csSearching, setCsSearching] = useState(false);
  const [csError, setCsError] = useState("");
  const [error, setError] = useState("");

  const overlayRef = useRef<HTMLDivElement>(null);

  async function searchCS() {
    if (!csQuery.trim()) return;
    setCsSearching(true);
    setCsError("");
    setCsResults([]);
    try {
      const res = await fetch(`${CS_API}/cs/actor?q=${encodeURIComponent(csQuery.trim())}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "CS search failed");
      setCsResults(data.actors ?? []);
      if ((data.actors ?? []).length === 0) setCsError("No actors found in CrowdStrike for that query.");
    } catch (e: any) {
      setCsError(e.message);
    } finally {
      setCsSearching(false);
    }
  }

  function selectCSResult(actor: CustomActor) {
    setForm({ ...actor, isCustom: true, inMonitoringList: form.inMonitoringList });
    setCsResults([]);
  }

  function setField<K extends keyof CustomActor>(k: K, v: CustomActor[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function save() {
    if (!form.name.trim()) { setError("Actor name is required."); return; }
    const upper = form.name.trim().toUpperCase();
    if (existingNames.has(upper)) { setError(`Actor "${upper}" already exists.`); return; }
    onSave({ ...form, name: upper });
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Add Threat Actor</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Search CrowdStrike or enter details manually</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 p-4 border-b border-border">
          {(["cs", "manual"] as AddActorMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {m === "cs" ? "🔍 Search CrowdStrike" : "✏️ Manual Entry"}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-5">
          {/* CS search mode */}
          {mode === "cs" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={csQuery}
                  onChange={e => setCsQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && searchCS()}
                  placeholder="e.g. SCATTERED SPIDER, VOODOO BEAR…"
                  className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={searchCS}
                  disabled={csSearching || !csQuery.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {csSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Search
                </button>
              </div>
              {csError && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {csError}
                </div>
              )}
              {csResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{csResults.length} result{csResults.length !== 1 ? "s" : ""} — click to pre-fill:</p>
                  {csResults.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => { selectCSResult(a); setMode("manual"); }}
                      className="w-full text-left p-3 rounded-xl border border-border hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-foreground">{a.name}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${actorTypeColor(a.actorType)}`}>
                          {actorTypeShort(a.actorType)}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-400/30">CS LIVE</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {originFlag(a.origins)} {a.origins || "Unknown"} · Last seen: {fmtDate(a.lastSeen)}
                      </div>
                      {a.aliases && <div className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{a.aliases}</div>}
                    </button>
                  ))}
                </div>
              )}
              {form.name && (
                <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2">
                  <Check className="w-4 h-4" /> Pre-filled from CS: <strong>{form.name}</strong> — review in Manual Entry tab
                </div>
              )}
            </div>
          )}

          {/* Manual form */}
          {mode === "manual" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Actor Name *</label>
                  <input
                    value={form.name}
                    onChange={e => setField("name", e.target.value)}
                    placeholder="e.g. SCATTERED SPIDER"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Origin / Region</label>
                  <input
                    value={form.origins}
                    onChange={e => setField("origins", e.target.value)}
                    placeholder="e.g. Russian Federation"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Last Seen</label>
                  <input
                    type="date"
                    value={form.lastSeen ?? ""}
                    onChange={e => setField("lastSeen", e.target.value || null)}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:dark]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Actor Type</label>
                  <select
                    value={form.actorType}
                    onChange={e => setField("actorType", e.target.value)}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {ACTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Intent Score (1–7)</label>
                  <input
                    type="number" min={1} max={7}
                    value={form.intentFinalScore ?? ""}
                    onChange={e => setField("intentFinalScore", e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Capability Score (1–6)</label>
                  <input
                    type="number" min={1} max={6}
                    value={form.capabilityFinalScore ?? ""}
                    onChange={e => setField("capabilityFinalScore", e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Aliases / AKA</label>
                  <input
                    value={form.aliases}
                    onChange={e => setField("aliases", e.target.value)}
                    placeholder="e.g. UNC3944, Muddled Libra, Oktapus"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Motivation</label>
                  <input
                    value={form.motivation}
                    onChange={e => setField("motivation", e.target.value)}
                    placeholder="e.g. Financial, Espionage, Hacktivist"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Malware / Tools</label>
                  <input
                    value={form.malware}
                    onChange={e => setField("malware", e.target.value)}
                    placeholder="e.g. CobaltStrike Mimikatz RCLone"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setField("description", e.target.value)}
                    rows={2}
                    placeholder="Brief description of the actor…"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.inMonitoringList}
                      onChange={e => setField("inMonitoringList", e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-foreground">Add to Monitoring List</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!form.name.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Add Actor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ThreatModel() {
  // Server-persisted state
  const [customActors, setCustomActors]     = useState<CustomActor[]>([]);
  const [actorOverrides, setActorOverrides] = useState<Record<string, ActorOverride>>({});
  const [serverLoading, setServerLoading]   = useState(true);

  // UI state
  const [search, setSearch]               = useState("");
  const [originFilter, setOriginFilter]   = useState("all");
  const [typeFilter, setTypeFilter]       = useState("all");
  const [monitoredOnly, setMonitoredOnly] = useState(false);
  const [showFramework, setShowFramework] = useState(false);
  const [showAdd, setShowAdd]             = useState(false);
  const [refreshingNames, setRefreshingNames] = useState<Set<string>>(new Set());
  const [refreshAllRunning, setRefreshAllRunning] = useState(false);
  const [refreshMsg, setRefreshMsg]       = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showMsg(text: string, type: "ok" | "err" = "ok") {
    if (msgTimer.current) clearTimeout(msgTimer.current);
    setRefreshMsg({ text, type });
    msgTimer.current = setTimeout(() => setRefreshMsg(null), 4000);
  }

  // ── Load state from server ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${CS_API}/cs/threat-model-state`);
        const data = await res.json();
        if (data.ok) {
          setCustomActors(data.customActors ?? []);
          setActorOverrides(data.actorOverrides ?? {});
        }
      } catch { /* ignore — offline */ }
      setServerLoading(false);
    })();
  }, []);

  // ── Persist state to server ────────────────────────────────────────────────
  const persistState = useCallback(async (
    next: { customActors?: CustomActor[]; actorOverrides?: Record<string, ActorOverride> }
  ) => {
    const ca  = next.customActors   ?? customActors;
    const ovr = next.actorOverrides ?? actorOverrides;
    try {
      await fetch(`${CS_API}/cs/threat-model-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customActors: ca, actorOverrides: ovr }),
      });
    } catch { /* offline — state stays in React */ }
  }, [customActors, actorOverrides]);

  // ── Merge static + custom actors ──────────────────────────────────────────
  const mergedActors = useMemo((): MergedActor[] => {
    const staticMerged: MergedActor[] = staticActors.map(a => {
      const ovr = actorOverrides[a.name] ?? {};
      const csData = ovr.csData ?? {};
      return {
        ...a,
        ...csData,
        isCustom: false,
        csEnriched: ovr.csEnriched ?? false,
        csLastRefreshed: ovr.csLastRefreshed ?? null,
        description: (csData as any).description ?? "",
        monitored: ovr.inMonitoringList !== undefined ? ovr.inMonitoringList : a.inMonitoringList,
      };
    });

    const customMerged: MergedActor[] = customActors.map(a => ({
      ...(a as any),
      intent: "",
      intentScore: null,
      willingness: "",
      pptap: 0,
      sirt: 0,
      capabilitiesScore: null,
      novelty: "",
      noveltyScore: null,
      isCustom: true,
      monitored: a.inMonitoringList,
    }));

    return [...staticMerged, ...customMerged];
  }, [staticActors, customActors, actorOverrides]);

  // ── CS refresh for a single actor ─────────────────────────────────────────
  async function refreshActor(name: string) {
    setRefreshingNames(s => new Set(s).add(name));
    try {
      const res = await fetch(`${CS_API}/cs/actor?q=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "CS lookup failed");
      const actors: CustomActor[] = data.actors ?? [];
      // Prefer exact name match, otherwise take first result
      const match = actors.find(a => a.name.toUpperCase() === name.toUpperCase()) ?? actors[0];
      if (!match) throw new Error("Actor not found in CrowdStrike");

      const newOverrides = {
        ...actorOverrides,
        [name]: {
          ...actorOverrides[name],
          csEnriched: true,
          csLastRefreshed: new Date().toISOString(),
          csData: {
            origins: match.origins,
            aliases: match.aliases,
            actorType: match.actorType || actorOverrides[name]?.csData?.actorType,
            lastSeen: match.lastSeen,
            malware: match.malware,
            countries: match.countries,
            industries: match.industries,
            motivation: match.motivation,
            adversaryType: match.adversaryType,
            communityIds: match.communityIds,
            description: match.description,
            capabilityFinalScore: match.capabilityFinalScore,
          },
        },
      };
      setActorOverrides(newOverrides);

      // For custom actors, update in-place
      setCustomActors(prev => {
        const idx = prev.findIndex(a => a.name.toUpperCase() === name.toUpperCase());
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          origins: match.origins || updated[idx].origins,
          aliases: match.aliases || updated[idx].aliases,
          actorType: match.actorType || updated[idx].actorType,
          lastSeen: match.lastSeen || updated[idx].lastSeen,
          malware: match.malware || updated[idx].malware,
          countries: match.countries.length ? match.countries : updated[idx].countries,
          industries: match.industries.length ? match.industries : updated[idx].industries,
          motivation: match.motivation || updated[idx].motivation,
          communityIds: match.communityIds || updated[idx].communityIds,
          description: match.description || updated[idx].description,
          csEnriched: true,
          csLastRefreshed: new Date().toISOString(),
          capabilityFinalScore: match.capabilityFinalScore ?? updated[idx].capabilityFinalScore,
        };
        persistState({ customActors: updated, actorOverrides: newOverrides });
        return updated;
      });

      await persistState({ actorOverrides: newOverrides });
      showMsg(`${name} refreshed from CrowdStrike`);
    } catch (e: any) {
      showMsg(`${name}: ${e.message}`, "err");
    } finally {
      setRefreshingNames(s => { const n = new Set(s); n.delete(name); return n; });
    }
  }

  // ── Bulk refresh all monitored actors ─────────────────────────────────────
  async function refreshAll() {
    setRefreshAllRunning(true);
    const targets = mergedActors.filter(a => a.monitored).map(a => a.name);
    setRefreshMsg({ text: `Refreshing ${targets.length} monitored actors from CS…`, type: "ok" });
    let ok = 0; let fail = 0;
    for (const name of targets) {
      try {
        await refreshActor(name);
        ok++;
      } catch { fail++; }
      await new Promise(r => setTimeout(r, 200)); // rate-limit
    }
    setRefreshAllRunning(false);
    showMsg(`Refresh complete — ${ok} updated${fail ? `, ${fail} failed` : ""}`, fail ? "err" : "ok");
  }

  // ── Toggle monitoring ─────────────────────────────────────────────────────
  async function toggleMonitor(name: string) {
    // Check if it's a custom or static actor
    const customIdx = customActors.findIndex(a => a.name.toUpperCase() === name.toUpperCase());
    if (customIdx !== -1) {
      const updated = [...customActors];
      updated[customIdx] = { ...updated[customIdx], inMonitoringList: !updated[customIdx].inMonitoringList };
      setCustomActors(updated);
      await persistState({ customActors: updated });
      return;
    }
    const curr = actorOverrides[name]?.inMonitoringList;
    const staticActor = staticActors.find(a => a.name === name);
    const baseline = curr !== undefined ? curr : (staticActor?.inMonitoringList ?? false);
    const newOverrides = {
      ...actorOverrides,
      [name]: { ...actorOverrides[name], inMonitoringList: !baseline },
    };
    setActorOverrides(newOverrides);
    await persistState({ actorOverrides: newOverrides });
  }

  // ── Delete custom actor ───────────────────────────────────────────────────
  async function deleteActor(name: string) {
    const updated = customActors.filter(a => a.name.toUpperCase() !== name.toUpperCase());
    setCustomActors(updated);
    await persistState({ customActors: updated });
    showMsg(`${name} removed`);
  }

  // ── Add actor ─────────────────────────────────────────────────────────────
  async function addActor(actor: CustomActor) {
    const updated = [...customActors, actor];
    setCustomActors(updated);
    await persistState({ customActors: updated });
    setShowAdd(false);
    showMsg(`${actor.name} added`);
  }

  // ── Filtered + sorted table ───────────────────────────────────────────────
  const { sortKey, sortDir, toggle, sorted } = useSortTable(
    useMemo(() => {
      const q = search.toLowerCase();
      return mergedActors.filter(a => {
        if (monitoredOnly && !a.monitored) return false;
        if (originFilter !== "all") {
          const norm = (() => {
            const o = a.origins || "Unknown";
            if (o.includes("China") || o.includes("East Asia")) return "China";
            if (o.includes("Russian Federation") || o.includes("Eastern Europe")) return "Russia";
            if (o.includes("Iran") || o.includes("Middle East")) return "Iran";
            if (o.includes("North Korea")) return "North Korea";
            if (!o || o === "Unknown") return "Unknown";
            return o.split(",")[0].trim();
          })();
          if (norm !== originFilter) return false;
        }
        if (typeFilter !== "all" && actorTypeShort(a.actorType) !== typeFilter) return false;
        if (q &&
          !a.name.toLowerCase().includes(q) &&
          !a.aliases.toLowerCase().includes(q) &&
          !(a.origins || "").toLowerCase().includes(q) &&
          !(a.malware || "").toLowerCase().includes(q) &&
          !(a.industries || []).join(" ").toLowerCase().includes(q)) return false;
        return true;
      });
    }, [mergedActors, search, originFilter, typeFilter, monitoredOnly])
  );

  const existingNames = useMemo(
    () => new Set(mergedActors.map(a => a.name.toUpperCase())),
    [mergedActors]
  );

  // Stats
  const monitored   = mergedActors.filter(a => a.monitored).length;
  const csEnriched  = mergedActors.filter(a => a.csEnriched).length;
  const highIntent  = mergedActors.filter(a => (a.intentFinalScore ?? 0) >= 5).length;
  const highCap     = mergedActors.filter(a => (a.capabilityFinalScore ?? 0) >= 5).length;

  const allOrigins = useMemo(() => {
    const set = new Set<string>();
    mergedActors.forEach(a => {
      const o = a.origins || "Unknown";
      if (o.includes("China") || o.includes("East Asia")) set.add("China");
      else if (o.includes("Russian Federation") || o.includes("Eastern Europe")) set.add("Russia");
      else if (o.includes("Iran") || o.includes("Middle East")) set.add("Iran");
      else if (o.includes("North Korea")) set.add("North Korea");
      else if (!o || o === "Unknown") set.add("Unknown");
      else set.add(o.split(",")[0].trim());
    });
    return Array.from(set).sort();
  }, [mergedActors]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Threat Model — Q3 2027</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mergedActors.length} actors assessed · {csEnriched} enriched from CrowdStrike · {customActors.length} custom
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFramework(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {showFramework ? "Hide" : "Show"} Scoring Framework
          </button>
          <button
            onClick={refreshAll}
            disabled={refreshAllRunning || monitored === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-xs text-cyan-400 hover:bg-cyan-400/20 transition-colors disabled:opacity-40"
          >
            {refreshAllRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh Monitored ({monitored}) from CS
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Actor
          </button>
        </div>
      </div>

      {/* Flash message */}
      {refreshMsg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border ${
          refreshMsg.type === "ok"
            ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
            : "bg-red-400/10 text-red-400 border-red-400/20"
        }`}>
          {refreshMsg.type === "ok" ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {refreshMsg.text}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Actors",        value: mergedActors.length, icon: Target,    color: "text-primary" },
          { label: "Monitored",           value: monitored,           icon: Shield,    color: "text-primary" },
          { label: "High Intent (≥5)",    value: highIntent,          icon: Zap,       color: "text-amber-400" },
          { label: "High Capability (≥5)", value: highCap,            icon: AlertCircle, color: "text-red-400" },
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

      {/* Scoring framework */}
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
          className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-w-[250px]"
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
          <input type="checkbox" checked={monitoredOnly} onChange={e => setMonitoredOnly(e.target.checked)} className="rounded" />
          <span className="text-sm text-foreground">Monitored only</span>
        </label>
        {serverLoading && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>}
        <span className="text-xs text-muted-foreground ml-auto">{sorted.length} actors</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-8 px-3 py-3" />
                <SortableTh col="name" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actor</SortableTh>
                <SortableTh col="origins" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Origin</SortableTh>
                <SortableTh col="actorType" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</SortableTh>
                <SortableTh col="lastSeen" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Seen</SortableTh>
                <SortableTh col="intentFinalScore" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[120px]">Intent</SortableTh>
                <SortableTh col="capabilityFinalScore" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[120px]">Capability</SortableTh>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[120px]">Combined</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((actor: MergedActor) => (
                <ActorRow
                  key={actor.name}
                  actor={actor}
                  onRefresh={refreshActor}
                  onToggleMonitor={toggleMonitor}
                  onDelete={actor.isCustom ? deleteActor : undefined}
                  refreshing={refreshingNames.has(actor.name)}
                />
              ))}
              {sorted.length === 0 && !serverLoading && (
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
        Source: APT Groups &amp; Operations — Threat Model Update Q3 2027 · CrowdStrike Falcon Intel API.
        Combined score = Intent + Capability (max 13). CS LIVE badge indicates actor data refreshed from CrowdStrike.
      </p>

      {showAdd && (
        <AddActorModal
          onClose={() => setShowAdd(false)}
          onSave={addActor}
          existingNames={existingNames}
        />
      )}
    </div>
  );
}
