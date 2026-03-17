import { useState, useRef, useEffect } from "react";
import { Upload, Link2, RefreshCw, CheckCircle2, XCircle, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const MITRE_DEFAULT_URL =
  "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/refs/heads/master/enterprise-attack/enterprise-attack.json";

const LS_KEYS = {
  mitre: "ds_mitre_stats",
  reports: "ds_reports_stats",
  actorMap: "ds_actormap_stats",
};

type Status = "idle" | "loading" | "done" | "error";

type MitreStats = {
  total: number;
  tactics: string[];
  sample: { id: string; name: string; tactics: string[] }[];
  loadedAt: string;
};

type ReportsStats = {
  total: number;
  dateRange: { from: string; to: string };
  types: { name: string; count: number }[];
  sample: { id: number; name: string; url: string; date: string; type: string; actors: string[] }[];
  loadedAt: string;
};

type ActorMapStats = {
  total: number;
  actor: string;
  tactics: { name: string; count: number }[];
  totalReports: number;
  totalObservables: number;
  sample: { tacticName: string; techniqueId: string; techniqueName: string; reports: string[]; observables: string[] }[];
  loadedAt: string;
};

function parseMitre(json: any): MitreStats {
  const objects = json.objects ?? [];
  const techniques = objects
    .filter((o: any) => o.type === "attack-pattern" && !o.revoked && !o.x_mitre_deprecated)
    .map((o: any) => ({
      id: (o.external_references ?? []).find((r: any) => r.source_name === "mitre-attack")?.external_id ?? "",
      name: o.name ?? "",
      tactics: (o.kill_chain_phases ?? []).map((p: any) =>
        p.phase_name.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      ),
    }))
    .filter((t: any) => t.id);

  const allTactics = Array.from(new Set(techniques.flatMap((t: any) => t.tactics))).sort() as string[];

  return {
    total: techniques.length,
    tactics: allTactics,
    sample: techniques.slice(0, 50),
    loadedAt: new Date().toISOString(),
  };
}

function parseReports(json: any): ReportsStats {
  const resources = json?.api_object?.resources ?? json?.resources ?? (Array.isArray(json) ? json : []);
  const mapped = resources.map((r: any) => ({
    id: r.id,
    name: r.name ?? "",
    url: r.url ?? "",
    date: r.created_date ? new Date(r.created_date * 1000).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" }) : "—",
    dateTs: r.created_date ?? 0,
    type: r.type?.name ?? r.type ?? "Unknown",
    actors: (r.actors ?? []).map((a: any) => a.name ?? a.value ?? a),
  }));

  const sorted = [...mapped].sort((a: any, b: any) => b.dateTs - a.dateTs);
  const oldest = sorted[sorted.length - 1];
  const newest = sorted[0];

  const typeCounts: Record<string, number> = {};
  for (const r of mapped) typeCounts[r.type] = (typeCounts[r.type] ?? 0) + 1;
  const types = Object.entries(typeCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: mapped.length,
    dateRange: { from: oldest?.date ?? "—", to: newest?.date ?? "—" },
    types,
    sample: sorted.slice(0, 50),
    loadedAt: new Date().toISOString(),
  };
}

function parseActorMap(json: any): ActorMapStats {
  const entries: any[] = Array.isArray(json) ? json : [];

  const tacticCounts: Record<string, number> = {};
  let totalReports = 0;
  let totalObservables = 0;

  for (const e of entries) {
    const t = e.tactic_name ?? "";
    tacticCounts[t] = (tacticCounts[t] ?? 0) + 1;
    totalReports += (e.reports ?? []).length;
    totalObservables += (e.observables ?? []).length;
  }

  const tactics = Object.entries(tacticCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const sample = entries.slice(0, 50).map(e => ({
    tacticName: e.tactic_name ?? "",
    techniqueId: (e.technique_id ?? "").toUpperCase(),
    techniqueName: e.technique_name ?? "",
    reports: e.reports ?? [],
    observables: e.observables ?? [],
  }));

  return {
    total: entries.length,
    actor: "Scattered Spider",
    tactics,
    totalReports,
    totalObservables,
    sample,
    loadedAt: new Date().toISOString(),
  };
}

function loadFromLS<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToLS(key: string, val: any) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "idle") return <span className="text-xs text-muted-foreground">Not loaded</span>;
  if (status === "loading") return <span className="flex items-center gap-1 text-xs text-yellow-400"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>;
  if (status === "done") return <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-3 h-3" /> Loaded</span>;
  return <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-3 h-3" /> Error</span>;
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/30 border border-border rounded-lg px-3 py-2 flex flex-col gap-0.5 min-w-[80px]">
      <span className="text-lg font-bold text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pb-1 border-b border-border mb-2">
      {children}
    </div>
  );
}

export default function DataSources() {
  const [mitreUrl, setMitreUrl] = useState(MITRE_DEFAULT_URL);
  const [mitreStatus, setMitreStatus] = useState<Status>("idle");
  const [mitreStats, setMitreStats] = useState<MitreStats | null>(() => loadFromLS(LS_KEYS.mitre));
  const [mitreError, setMitreError] = useState("");
  const [mitrePreview, setMitrePreview] = useState(false);

  const [reportsStatus, setReportsStatus] = useState<Status>("idle");
  const [reportsStats, setReportsStats] = useState<ReportsStats | null>(() => loadFromLS(LS_KEYS.reports));
  const [reportsError, setReportsError] = useState("");
  const [reportsPreview, setReportsPreview] = useState(false);

  const [actorStatus, setActorStatus] = useState<Status>("idle");
  const [actorStats, setActorStats] = useState<ActorMapStats | null>(() => loadFromLS(LS_KEYS.actorMap));
  const [actorError, setActorError] = useState("");
  const [actorPreview, setActorPreview] = useState(false);

  const mitreFileRef = useRef<HTMLInputElement>(null);
  const reportsFileRef = useRef<HTMLInputElement>(null);
  const actorFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mitreStats) setMitreStatus("done");
  }, []);
  useEffect(() => {
    if (reportsStats) setReportsStatus("done");
  }, []);
  useEffect(() => {
    if (actorStats) setActorStatus("done");
  }, []);

  async function fetchMitreUrl() {
    setMitreStatus("loading");
    setMitreError("");
    try {
      const res = await fetch(mitreUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const stats = parseMitre(json);
      setMitreStats(stats);
      saveToLS(LS_KEYS.mitre, stats);
      setMitreStatus("done");
    } catch (e: any) {
      setMitreError(e.message ?? "Failed to fetch");
      setMitreStatus("error");
    }
  }

  function readFile(file: File, onJson: (json: any) => void, onError: (msg: string) => void) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        onJson(json);
      } catch {
        onError("Invalid JSON file");
      }
    };
    reader.onerror = () => onError("Failed to read file");
    reader.readAsText(file);
  }

  function onMitreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMitreStatus("loading");
    setMitreError("");
    readFile(
      file,
      (json) => {
        const stats = parseMitre(json);
        setMitreStats(stats);
        saveToLS(LS_KEYS.mitre, stats);
        setMitreStatus("done");
      },
      (msg) => { setMitreError(msg); setMitreStatus("error"); }
    );
  }

  function onReportsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReportsStatus("loading");
    setReportsError("");
    readFile(
      file,
      (json) => {
        const stats = parseReports(json);
        setReportsStats(stats);
        saveToLS(LS_KEYS.reports, stats);
        setReportsStatus("done");
      },
      (msg) => { setReportsError(msg); setReportsStatus("error"); }
    );
  }

  function onActorFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActorStatus("loading");
    setActorError("");
    readFile(
      file,
      (json) => {
        const stats = parseActorMap(json);
        setActorStats(stats);
        saveToLS(LS_KEYS.actorMap, stats);
        setActorStatus("done");
      },
      (msg) => { setActorError(msg); setActorStatus("error"); }
    );
  }

  function clearMitre() {
    setMitreStats(null); setMitreStatus("idle"); setMitreError("");
    localStorage.removeItem(LS_KEYS.mitre);
  }
  function clearReports() {
    setReportsStats(null); setReportsStatus("idle"); setReportsError("");
    localStorage.removeItem(LS_KEYS.reports);
  }
  function clearActor() {
    setActorStats(null); setActorStatus("idle"); setActorError("");
    localStorage.removeItem(LS_KEYS.actorMap);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Sources</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Load external intelligence data via URL or JSON file upload. Parsed results persist across sessions.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* ── MITRE ATT&CK ── */}
        <div className="bg-card border border-card-border rounded-xl flex flex-col">
          <div className="p-5 border-b border-border">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">MITRE ATT&amp;CK</span>
                  <StatusBadge status={mitreStatus} />
                </div>
                <p className="text-xs text-muted-foreground">Enterprise ATT&amp;CK STIX bundle — technique names, IDs, tactics</p>
              </div>
              {mitreStats && (
                <button onClick={clearMitre} title="Clear" className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="p-5 space-y-3 flex-1">
            <SectionHeader>Load via URL</SectionHeader>
            <div className="flex gap-2">
              <input
                type="url"
                value={mitreUrl}
                onChange={e => setMitreUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 min-w-0 bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={fetchMitreUrl}
                disabled={mitreStatus === "loading" || !mitreUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {mitreStatus === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                Fetch
              </button>
            </div>

            <SectionHeader>Load via File</SectionHeader>
            <button
              onClick={() => mitreFileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload enterprise-attack.json
            </button>
            <input ref={mitreFileRef} type="file" accept=".json" className="hidden" onChange={onMitreFile} />

            {mitreError && <p className="text-xs text-red-400">{mitreError}</p>}

            {mitreStats && (
              <div className="space-y-3 pt-1">
                <SectionHeader>Summary</SectionHeader>
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Techniques" value={mitreStats.total.toLocaleString()} />
                  <StatPill label="Tactics" value={mitreStats.tactics.length} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {mitreStats.tactics.map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary">{t}</span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Loaded {new Date(mitreStats.loadedAt).toLocaleString()}</p>

                <button
                  onClick={() => setMitrePreview(v => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {mitrePreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {mitrePreview ? "Hide" : "Show"} preview ({mitreStats.sample.length} entries)
                </button>

                {mitrePreview && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">ID</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Name</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Tactics</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mitreStats.sample.map((t, i) => (
                          <tr key={i} className="border-b border-border/40 hover:bg-accent/20">
                            <td className="px-3 py-1.5 font-mono text-primary whitespace-nowrap">{t.id}</td>
                            <td className="px-3 py-1.5 text-foreground max-w-[180px]"><div className="truncate" title={t.name}>{t.name}</div></td>
                            <td className="px-3 py-1.5 text-muted-foreground max-w-[160px]"><div className="truncate" title={t.tactics.join(", ")}>{t.tactics.join(", ")}</div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── REPORTS ── */}
        <div className="bg-card border border-card-border rounded-xl flex flex-col">
          <div className="p-5 border-b border-border">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-chart-2">Reports</span>
                  <StatusBadge status={reportsStatus} />
                </div>
                <p className="text-xs text-muted-foreground">Intelligence reports — dates, URLs, types, linked actors</p>
              </div>
              {reportsStats && (
                <button onClick={clearReports} title="Clear" className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="p-5 space-y-3 flex-1">
            <SectionHeader>Expected Format</SectionHeader>
            <div className="bg-muted/20 border border-border rounded-lg px-3 py-2 text-[10px] font-mono text-muted-foreground leading-relaxed">
              {`{ "api_object": { "resources": [...] } }`}<br />
              {`// each resource: id, name, slug, url,`}<br />
              {`//   created_date (unix), type.name, actors[]`}
            </div>

            <SectionHeader>Load via File</SectionHeader>
            <button
              onClick={() => reportsFileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-chart-2/50 hover:text-foreground transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload reports.json
            </button>
            <input ref={reportsFileRef} type="file" accept=".json" className="hidden" onChange={onReportsFile} />

            {reportsError && <p className="text-xs text-red-400">{reportsError}</p>}

            {reportsStats && (
              <div className="space-y-3 pt-1">
                <SectionHeader>Summary</SectionHeader>
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Reports" value={reportsStats.total.toLocaleString()} />
                  <StatPill label="Types" value={reportsStats.types.length} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Date range: <span className="text-foreground">{reportsStats.dateRange.from}</span> → <span className="text-foreground">{reportsStats.dateRange.to}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {reportsStats.types.slice(0, 6).map(t => (
                    <div key={t.name} className="flex items-center gap-2">
                      <div className="flex-1 text-[10px] text-muted-foreground truncate">{t.name}</div>
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-chart-2 rounded-full" style={{ width: `${(t.count / reportsStats.total) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-foreground w-6 text-right">{t.count}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Loaded {new Date(reportsStats.loadedAt).toLocaleString()}</p>

                <button
                  onClick={() => setReportsPreview(v => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {reportsPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {reportsPreview ? "Hide" : "Show"} preview ({reportsStats.sample.length} entries)
                </button>

                {reportsPreview && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">Date</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Report Name</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportsStats.sample.map((r, i) => (
                          <tr key={i} className="border-b border-border/40 hover:bg-accent/20">
                            <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{r.date}</td>
                            <td className="px-3 py-1.5 max-w-[200px]">
                              {r.url ? (
                                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block" title={r.name}>{r.name}</a>
                              ) : (
                                <span className="text-foreground truncate block" title={r.name}>{r.name}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{r.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── ACTOR MAPPING ── */}
        <div className="bg-card border border-card-border rounded-xl flex flex-col">
          <div className="p-5 border-b border-border">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-chart-4">Actor Mapping</span>
                  <StatusBadge status={actorStatus} />
                </div>
                <p className="text-xs text-muted-foreground">Actor TTP map — techniques per tactic, report refs, observables</p>
              </div>
              {actorStats && (
                <button onClick={clearActor} title="Clear" className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="p-5 space-y-3 flex-1">
            <SectionHeader>Expected Format</SectionHeader>
            <div className="bg-muted/20 border border-border rounded-lg px-3 py-2 text-[10px] font-mono text-muted-foreground leading-relaxed">
              {`[ { tactic_id, tactic_name,`}<br />
              {`    technique_id, technique_name,`}<br />
              {`    reports[], observables[] }, ... ]`}
            </div>

            <SectionHeader>Load via File</SectionHeader>
            <button
              onClick={() => actorFileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-chart-4/50 hover:text-foreground transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload ACTOR_MAPPING.json
            </button>
            <input ref={actorFileRef} type="file" accept=".json" className="hidden" onChange={onActorFile} />

            {actorError && <p className="text-xs text-red-400">{actorError}</p>}

            {actorStats && (
              <div className="space-y-3 pt-1">
                <SectionHeader>Summary</SectionHeader>
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Techniques" value={actorStats.total} />
                  <StatPill label="Tactics" value={actorStats.tactics.length} />
                  <StatPill label="Report Refs" value={actorStats.totalReports} />
                  <StatPill label="Observables" value={actorStats.totalObservables} />
                </div>
                <div className="flex flex-col gap-1">
                  {actorStats.tactics.map(t => (
                    <div key={t.name} className="flex items-center gap-2">
                      <div className="flex-1 text-[10px] text-muted-foreground truncate">{t.name}</div>
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-chart-4 rounded-full" style={{ width: `${(t.count / actorStats.total) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-foreground w-4 text-right">{t.count}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Loaded {new Date(actorStats.loadedAt).toLocaleString()}</p>

                <button
                  onClick={() => setActorPreview(v => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {actorPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {actorPreview ? "Hide" : "Show"} preview ({actorStats.sample.length} entries)
                </button>

                {actorPreview && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Tactic</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">ID</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Technique</th>
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium text-center">Reports</th>
                        </tr>
                      </thead>
                      <tbody>
                        {actorStats.sample.map((e, i) => (
                          <tr key={i} className="border-b border-border/40 hover:bg-accent/20">
                            <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{e.tacticName}</td>
                            <td className="px-3 py-1.5 font-mono text-chart-4 whitespace-nowrap">{e.techniqueId}</td>
                            <td className="px-3 py-1.5 text-foreground max-w-[160px]"><div className="truncate" title={e.techniqueName}>{e.techniqueName}</div></td>
                            <td className="px-3 py-1.5 text-center text-muted-foreground">{e.reports.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Usage note ── */}
      <div className="bg-muted/20 border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground text-sm mb-2">How to use</p>
        <p><span className="text-primary font-medium">MITRE ATT&amp;CK</span> — Paste the GitHub raw URL (default provided) or upload a local copy of the enterprise-attack STIX JSON. The parser extracts all non-deprecated attack-patterns.</p>
        <p><span className="text-chart-2 font-medium">Reports</span> — Upload a CrowdStrike Falcon Intelligence reports export (<code className="bg-muted px-1 rounded">api_object.resources</code> format). Used for cross-referencing report dates and external references.</p>
        <p><span className="text-chart-4 font-medium">Actor Mapping</span> — Upload an actor TTP mapping file (e.g. SCATTERED_SPIDER.json). Each entry maps a tactic + technique to a list of report slugs and observables.</p>
        <p className="pt-1 border-t border-border">Loaded data is cached in your browser and survives page refreshes. Click the <span className="text-red-400">trash icon</span> on any panel to clear it.</p>
      </div>
    </div>
  );
}
