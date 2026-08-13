import { useState, useEffect, useRef } from "react";
import {
  Copy, Check, ChevronDown, ChevronRight, ExternalLink,
  Terminal, BookOpen, Zap, Filter, FileJson, FileText,
} from "lucide-react";

const API_BASE = "/api";

// ── Static endpoint catalogue (mirrors export.ts) ──────────────────────────────

const SECTIONS = [
  {
    id: "actor-prioritisation",
    path: "/api/export/actor-prioritisation",
    method: "GET",
    title: "Actor Prioritisation",
    description: "Actor priority rankings with intent, capability, TTP risk score and risk percentile. Rows are sorted by priority score descending.",
    rowCount: "~34 actors",
    params: [
      { name: "format", type: "json | csv", default: "json", description: "Response format." },
    ],
    example: "/api/export/actor-prioritisation",
    sampleKeys: ["name", "intent", "capability", "ttpRisk", "priority", "riskPct"],
  },
  {
    id: "threat-model",
    path: "/api/export/threat-model",
    method: "GET",
    title: "Threat Model",
    description: "Full threat model for a quarter: all actors (static + custom) with effective intent/capability scores after applying rubric overrides, PP-TAP (+1) and SIRT (+2) bonuses.",
    rowCount: "~89 actors",
    params: [
      { name: "quarter", type: "string", default: "current quarter", description: "Quarter label, e.g. Q3 2026." },
      { name: "format",  type: "json | csv", default: "json", description: "Response format. CSV flattens the actors array." },
    ],
    example: "/api/export/threat-model?quarter=Q3+2026",
    sampleKeys: ["name", "origins", "actorType", "effectiveIntentScore", "effectiveCapabilityScore", "inPpTap", "inSirt", "monitored"],
  },
  {
    id: "threat-model-versions",
    path: "/api/export/threat-model/versions",
    method: "GET",
    title: "Threat Model — Versions",
    description: "Lists all saved quarterly threat model snapshots with metadata (saved timestamp, source quarter for auto-seeded entries, actor and override counts).",
    rowCount: "one row per saved quarter",
    params: [],
    example: "/api/export/threat-model/versions",
    sampleKeys: ["quarter", "savedAt", "seededFrom", "customActors", "actorOverrides", "ppTapCount", "sirtCount"],
  },
  {
    id: "risk-calculation",
    path: "/api/export/risk-calculation",
    method: "GET",
    title: "Risk Calculation",
    description: "Full risk calculation table: TID, technique name, tactic, CIA scores, impact score/rate, likelihood score/rate, risk rate and composite risk score.",
    rowCount: "200 rows",
    params: [
      { name: "tactic", type: "string", description: "Filter by tactic name (case-insensitive, partial match). E.g. initial+access" },
      { name: "tid",    type: "string", description: "Filter by one or more TIDs (comma-separated). E.g. T1566,T1190" },
      { name: "format", type: "json | csv", default: "json", description: "Response format." },
    ],
    example: "/api/export/risk-calculation?tactic=lateral+movement",
    sampleKeys: ["tid", "technique", "tactic", "ciaScore", "impactScore", "impactRate", "likelihoodScore", "likelihoodRate", "riskRate", "riskScore"],
  },
  {
    id: "impact-table",
    path: "/api/export/impact-table",
    method: "GET",
    title: "Impact Table",
    description: "Technique-level CIA ratings (Confidentiality, Integrity, Availability), TTP extent scoring, HVA flags and computed impact score.",
    rowCount: "656 rows",
    params: [
      { name: "tactic", type: "string", description: "Filter by tactic name (partial match)." },
      { name: "tid",    type: "string", description: "Filter by TID(s), comma-separated." },
      { name: "format", type: "json | csv", default: "json", description: "Response format." },
    ],
    example: "/api/export/impact-table?tid=T1059",
    sampleKeys: ["id", "name", "platforms", "tactics", "confidentiality", "integrity", "availability", "finalTTPExtent"],
  },
  {
    id: "likelihood-table",
    path: "/api/export/likelihood-table",
    method: "GET",
    title: "Likelihood Table",
    description: "Likelihood view derived from the risk calculation dataset: TID, technique, tactic, last occurrence, confidence, and likelihood score/rate.",
    rowCount: "200 rows",
    params: [
      { name: "tactic", type: "string", description: "Filter by tactic name (partial match)." },
      { name: "tid",    type: "string", description: "Filter by TID(s), comma-separated." },
      { name: "format", type: "json | csv", default: "json", description: "Response format." },
    ],
    example: "/api/export/likelihood-table?tactic=execution",
    sampleKeys: ["tid", "technique", "tactic", "lastOccurrence", "confidence", "likelihoodScore", "likelihoodRate"],
  },
  {
    id: "high-value-assets",
    path: "/api/export/high-value-assets",
    method: "GET",
    title: "High Value Assets",
    description: "High-value asset rows (target × TID) with risk, likelihood, impact and composite risk score, plus per-TID aggregate statistics.",
    rowCount: "62 HVA rows + 6 aggregate rows",
    params: [
      { name: "target", type: "string", description: "Filter by target name (partial match)." },
      { name: "tid",    type: "string", description: "Filter by TID(s), comma-separated." },
      { name: "format", type: "json | csv", default: "json", description: "CSV exports the assets array only." },
    ],
    example: "/api/export/high-value-assets",
    sampleKeys: ["target", "tid", "tidName", "risk", "likelihood", "impact", "riskScore"],
    note: "Response shape: { data: { assets: [...], aggregates: [...] } }",
  },
  {
    id: "tid-priority",
    path: "/api/export/tid-priority",
    method: "GET",
    title: "TID Priority",
    description: "Technique occurrence priority list: TID, procedure occurrence count, last observation date, and risk label.",
    rowCount: "150 rows",
    params: [
      { name: "minCount", type: "integer", description: "Minimum occurrence count inclusive. E.g. 5" },
      { name: "tid",      type: "string",  description: "Filter by TID(s), comma-separated." },
      { name: "format",   type: "json | csv", default: "json", description: "Response format." },
    ],
    example: "/api/export/tid-priority?minCount=5",
    sampleKeys: ["tid", "count", "lastObs", "risk"],
  },
  {
    id: "tactics-scores",
    path: "/api/export/tactics-scores",
    method: "GET",
    title: "Tactic Scores",
    description: "Tactic-level CIA impact ratings and TTP extent scores across all 14 MITRE ATT&CK tactics.",
    rowCount: "14 rows",
    params: [
      { name: "tactic", type: "string", description: "Filter by tactic name (partial match)." },
      { name: "format", type: "json | csv", default: "json", description: "Response format." },
    ],
    example: "/api/export/tactics-scores",
    sampleKeys: ["tactic", "conf", "integrity", "avail", "extent"],
  },
  {
    id: "all-procedures",
    path: "/api/export/all-procedures",
    method: "GET",
    title: "All Procedures",
    description: "All ATT&CK procedures observed, enriched with resolved technique name and tactic(s). Supports multiple filters and a row limit.",
    rowCount: "3608 rows (unfiltered)",
    params: [
      { name: "actor",    type: "string",  description: "Filter by actor name (partial, case-insensitive). E.g. fancy+bear" },
      { name: "tid",      type: "string",  description: "Filter by TID(s), comma-separated." },
      { name: "tactic",   type: "string",  description: "Filter by tactic name (partial match, resolved via TID map)." },
      { name: "dateFrom", type: "ISO date | unix ms", description: "Include procedures on or after this date." },
      { name: "dateTo",   type: "ISO date | unix ms", description: "Include procedures on or before this date." },
      { name: "limit",    type: "integer", default: "5000", description: "Maximum rows to return (hard cap 10,000)." },
      { name: "format",   type: "json | csv", default: "json", description: "Response format." },
    ],
    example: "/api/export/all-procedures?actor=cozy+bear&limit=50",
    sampleKeys: ["actor", "mitreId", "technique", "tactics", "date", "riskScore"],
  },
  {
    id: "scoring-framework",
    path: "/api/export/scoring-framework",
    method: "GET",
    title: "Scoring Framework",
    description: "Threat model scoring rubric: intent, willingness, capability and novelty option definitions with their numeric values used to compute actor scores.",
    rowCount: "5 rows",
    params: [
      { name: "format", type: "json | csv", default: "json", description: "Response format." },
    ],
    example: "/api/export/scoring-framework",
    sampleKeys: ["category", "intent", "intentScore", "willingness", "willingnessScore", "capability", "capabilityScore"],
  },
  {
    id: "risk-rate",
    path: "/api/export/risk-rate",
    method: "GET",
    title: "Risk Rate Matrix",
    description: "Static risk reference tables: 5×5 impact/likelihood risk matrix, impact level bands, likelihood level bands, and risk score classification table.",
    rowCount: "25 matrix cells",
    params: [],
    example: "/api/export/risk-rate",
    sampleKeys: ["riskMatrix", "impactLevels", "likelihoodLevels", "riskScoreTable"],
    note: "Response shape: { data: { riskMatrix, impactLevels, likelihoodLevels, riskScoreTable } }",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function useCopy(text: string, ms = 1500) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), ms);
  }
  return { copied, copy };
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      {method}
    </span>
  );
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <button
      onClick={copy}
      title="Copy"
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Try-it panel ───────────────────────────────────────────────────────────────

function TryItPanel({ section }: { section: typeof SECTIONS[0] }) {
  const [open, setOpen]     = useState(false);
  const [url, setUrl]       = useState(section.example);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const fullUrl = `${window.location.origin}${url}`;

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res  = await fetch(url);
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        setResult(JSON.stringify(json, null, 2));
      } catch {
        setResult(text);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border/50 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors text-xs text-muted-foreground hover:text-foreground"
      >
        <Terminal className="w-3.5 h-3.5" />
        <span className="font-medium">Try it</span>
        {open ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
      </button>

      {open && (
        <div className="p-4 space-y-3 bg-muted/10">
          {/* URL input */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5 font-medium">Request URL</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-input border border-border rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground select-none shrink-0">{window.location.origin}</span>
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-foreground focus:outline-none min-w-0"
                  spellCheck={false}
                />
              </div>
              <button
                onClick={run}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                Send
              </button>
            </div>
          </div>

          {/* Result */}
          {error && (
            <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              Error: {error}
            </div>
          )}
          {result !== null && (
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground font-medium">Response</span>
                <CopyButton text={result} />
              </div>
              <pre className="text-[11px] text-foreground bg-background/60 border border-border/50 rounded-lg p-3 overflow-auto max-h-72 leading-relaxed">
                {result.length > 6000 ? result.slice(0, 6000) + "\n\n… (truncated)" : result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Endpoint card ──────────────────────────────────────────────────────────────

function EndpointCard({ section }: { section: typeof SECTIONS[0] }) {
  const fullExample = `${typeof window !== "undefined" ? window.location.origin : ""}${section.example}`;
  const { copied, copy } = useCopy(fullExample);

  return (
    <div id={section.id} className="rounded-xl border border-border bg-card overflow-hidden scroll-mt-6">
      {/* Title bar */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/10">
        <MethodBadge method={section.method} />
        <code className="text-sm font-mono text-foreground font-semibold flex-1 min-w-0 truncate">
          {section.path}
        </code>
        <span className="text-[11px] text-muted-foreground shrink-0">{section.rowCount}</span>
      </div>

      <div className="p-5 space-y-4">
        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">{section.description}</p>
        {section.note && (
          <p className="text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/15 rounded-lg px-3 py-2">
            ⚠ {section.note}
          </p>
        )}

        {/* Response fields */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <FileJson className="w-3 h-3" /> Response fields (key subset)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {section.sampleKeys.map(k => (
              <code key={k} className="px-2 py-0.5 text-[11px] rounded bg-primary/10 text-primary border border-primary/20 font-mono">
                {k}
              </code>
            ))}
          </div>
        </div>

        {/* Params */}
        {section.params.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <Filter className="w-3 h-3" /> Query parameters
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-32">Name</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-36">Type</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-24">Default</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {section.params.map((p, i) => (
                    <tr key={p.name} className={i < section.params.length - 1 ? "border-b border-border/50" : ""}>
                      <td className="px-3 py-2">
                        <code className="text-primary font-mono">{p.name}</code>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground font-mono">{p.type}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.default ?? <span className="opacity-40">—</span>}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Example URL */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <ExternalLink className="w-3 h-3" /> Example
          </div>
          <div className="flex items-center gap-2 bg-background/60 border border-border rounded-lg px-3 py-2">
            <code className="flex-1 text-[12px] font-mono text-foreground/80 truncate min-w-0">
              <span className="text-muted-foreground">{typeof window !== "undefined" ? window.location.origin : ""}</span>{section.example}
            </code>
            <button
              onClick={copy}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Try-it */}
        <TryItPanel section={section} />
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ApiDocs() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const baseUrl = typeof window !== "undefined" ? `${window.location.origin}/api/export` : "/api/export";

  // Highlight active section in sidebar while scrolling
  useEffect(() => {
    observerRef.current?.disconnect();
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries.find(e => e.isIntersecting);
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    observerRef.current = obs;
    return () => obs.disconnect();
  }, []);

  const { copied, copy } = useCopy(baseUrl);

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left nav ─────────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border bg-card/30 overflow-y-auto">
        <div className="px-4 pt-6 pb-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Endpoints</p>
        </div>
        <nav className="flex-1 px-2 pb-6 space-y-0.5">
          {SECTIONS.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={e => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" }); setActiveId(s.id); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                activeId === s.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 shrink-0" />
              {s.title}
            </a>
          ))}
        </nav>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

          {/* Page header */}
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
                <BookOpen className="w-6 h-6 text-primary" />
                Export API
              </h1>
              <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
                Every section of the Purple Team dashboard is queryable as JSON or CSV.
                All endpoints are read-only and require no authentication.
              </p>
            </div>

            {/* Base URL */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Base URL</p>
              <div className="flex items-center gap-3 bg-background/60 border border-border rounded-lg px-4 py-2.5">
                <code className="flex-1 text-sm font-mono text-foreground">{baseUrl}</code>
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Common conventions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  icon: FileJson,
                  color: "text-primary",
                  bg: "bg-primary/10 border-primary/20",
                  title: "JSON (default)",
                  body: "All endpoints return { ok, meta, data }. Add ?format=json or omit the param.",
                },
                {
                  icon: FileText,
                  color: "text-cyan-400",
                  bg: "bg-cyan-400/10 border-cyan-400/20",
                  title: "CSV export",
                  body: "Append ?format=csv to any endpoint for a file download with Content-Disposition headers.",
                },
                {
                  icon: Filter,
                  color: "text-amber-400",
                  bg: "bg-amber-400/10 border-amber-400/20",
                  title: "Filtering",
                  body: "Endpoints that accept tactic=, tid=, actor= etc. use case-insensitive partial matching unless noted.",
                },
              ].map(({ icon: Icon, color, bg, title, body }) => (
                <div key={title} className={`rounded-xl border p-4 space-y-1.5 ${bg}`}>
                  <div className={`flex items-center gap-1.5 font-semibold text-sm ${color}`}>
                    <Icon className="w-4 h-4" /> {title}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
                </div>
              ))}
            </div>

            {/* Response envelope */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">JSON response envelope</p>
              <pre className="text-[12px] font-mono leading-relaxed text-foreground/80 bg-background/50 rounded-lg p-3 border border-border/50 overflow-x-auto">{`{
  "ok": true,
  "meta": {
    "endpoint":        "/export/risk-calculation",
    "count":           200,
    "generatedAt":     "2026-08-13T12:00:00.000Z",
    "filters":         { "tactic": "initial access" },
    "availableFilters": ["tactic", "tid", "format"]
  },
  "data": [ ... ]
}`}</pre>
            </div>
          </div>

          {/* Endpoint cards */}
          <div className="space-y-6">
            {SECTIONS.map(section => (
              <EndpointCard key={section.id} section={section} />
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-center pb-4">
            {SECTIONS.length} endpoints · data refreshed per request · no rate limiting
          </p>
        </div>
      </div>
    </div>
  );
}
