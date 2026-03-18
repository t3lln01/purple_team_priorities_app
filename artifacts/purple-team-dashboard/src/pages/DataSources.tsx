import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Upload, Link2, CheckCircle2, XCircle, Loader2, Trash2,
  ChevronDown, ChevronUp, Plus, Layers, Eye,
} from "lucide-react";
import {
  useViews, generateView, StoredActorFile, ReportsLookup,
  loadActorFiles, saveActorFiles, loadReportsLookup, saveReportsLookup,
  SavedView,
} from "@/context/ViewContext";

const MITRE_DEFAULT_URL =
  "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json";

const MITRE_DOWNLOAD_URL =
  "https://github.com/mitre-attack/attack-stix-data/raw/master/enterprise-attack/enterprise-attack.json";

function toBlobToRaw(url: string): string {
  // Convert github.com/.../blob/... → raw.githubusercontent.com/...
  const blobMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/
  );
  if (blobMatch) {
    return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
  }
  // Strip refs/heads/ from raw URLs if present
  return url.replace(
    /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/refs\/heads\//,
    "raw.githubusercontent.com/$1/$2/"
  );
}

const LS_MITRE = "ds_mitre_stats";

type Status = "idle" | "loading" | "done" | "error";

type MitreStats = { total: number; tactics: string[]; sample: { id: string; name: string; tactics: string[] }[]; loadedAt: string };
type ReportsStats = { total: number; dateRange: { from: string; to: string }; types: { name: string; count: number }[]; sample: { id: number; name: string; url: string; date: string; type: string }[]; loadedAt: string };

function ls<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}
function lsSet(key: string, v: any) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

function parseMitre(json: any): MitreStats {
  const techs = (json.objects ?? [])
    .filter((o: any) => o.type === "attack-pattern" && !o.revoked && !o.x_mitre_deprecated)
    .map((o: any) => ({
      id: (o.external_references ?? []).find((r: any) => r.source_name === "mitre-attack")?.external_id ?? "",
      name: o.name ?? "",
      platforms: (o.x_mitre_platforms ?? []).join(", "),
      tactics: (o.kill_chain_phases ?? []).map((p: any) =>
        p.phase_name.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      ),
      description: (o.description ?? "").replace(/\[.*?\]\(https?:\/\/[^)]+\)/g, match =>
        match.replace(/\[([^\]]+)\].*/, "$1")
      ).slice(0, 800),
    })).filter((t: any) => t.id);

  // Store full technique metadata in localStorage for Impact Table / other pages to use
  const stixMap: Record<string, { name: string; platforms: string; tactics: string; description: string }> = {};
  for (const t of techs) {
    stixMap[t.id] = {
      name: t.name,
      platforms: t.platforms,
      tactics: t.tactics.join(", "),
      description: t.description,
    };
  }
  try { localStorage.setItem("pt_stix_techniques", JSON.stringify(stixMap)); } catch {}

  const tactics = Array.from(new Set(techs.flatMap((t: any) => t.tactics))).sort() as string[];
  return { total: techs.length, tactics, sample: techs.slice(0, 50), loadedAt: new Date().toISOString() };
}

// Parse DD/MM/YYYY → ms timestamp (matches Python's CSV_DATE_FMT = '%d/%m/%Y')
function parseDDMMYYYY(s: string): number {
  if (!s) return 0;
  const parts = s.split("/");
  if (parts.length !== 3) return 0;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return 0;
  return new Date(y, m - 1, d).getTime();
}

// Minimal RFC-4180-compatible CSV line splitter (handles quoted fields)
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) { result.push(cur); cur = ""; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) return [];
  // Strip BOM if present
  const headerLine = nonEmpty[0].replace(/^\uFEFF/, "");
  const headers = splitCsvLine(headerLine).map(h => h.trim());
  return nonEmpty.slice(1).map(line => {
    const vals = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

// Parse a CrowdStrike reports CSV (columns: id, name, url, date DD/MM/YYYY)
function parseReportsCsv(text: string): { stats: ReportsStats; lookup: ReportsLookup } {
  const rows = parseCsvRows(text);
  const lookup: ReportsLookup = {};
  const mapped = rows.map(row => {
    const id   = (row["id"]   ?? row["Report id"]   ?? "").trim().toUpperCase();
    const name = (row["name"] ?? row["Report name"] ?? "").trim();
    const url  = (row["url"]  ?? row["Report url"]  ?? "").trim();
    const dateStr = (row["date"] ?? "").trim(); // DD/MM/YYYY
    const dateMs  = parseDDMMYYYY(dateStr);
    if (id) lookup[id] = { reportId: id, name, url, last_updated: dateMs };
    return { id, name, url, date: dateStr, dateTs: dateMs, type: "Report" };
  }).filter(r => r.id);

  const sorted = [...mapped].sort((a, b) => b.dateTs - a.dateTs);
  const stats: ReportsStats = {
    total: mapped.length,
    dateRange: { from: sorted.at(-1)?.date ?? "—", to: sorted[0]?.date ?? "—" },
    types: [{ name: "Report", count: mapped.length }],
    sample: sorted.slice(0, 50).map(r => ({ id: 0, name: r.name, url: r.url, date: r.date, type: r.type })),
    loadedAt: new Date().toISOString(),
  };
  return { stats, lookup };
}

// Fallback: parse from JSON (api_object.resources format)
function toMs(val: any): number {
  if (!val) return 0;
  if (typeof val === "number") return val < 10_000_000_000 ? val * 1000 : val;
  if (typeof val === "string") { const d = Date.parse(val); return isNaN(d) ? 0 : d; }
  return 0;
}

function fmtDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

function parseReportsJson(json: any): { stats: ReportsStats; lookup: ReportsLookup } {
  const resources = json?.api_object?.resources ?? json?.resources ?? (Array.isArray(json) ? json : []);
  const lookup: ReportsLookup = {};
  const mapped = resources.map((r: any) => {
    const id = (r.slug ?? r.id ?? "").toString().toUpperCase();
    const dateMs = toMs(r.last_modified_date) || toMs(r.created_date);
    if (id) lookup[id] = { reportId: id, name: r.name ?? "", url: r.url ?? "", last_updated: dateMs };
    return { id, name: r.name ?? "", url: r.url ?? "", date: fmtDate(dateMs), dateTs: dateMs, type: r.type?.name ?? "Unknown" };
  });
  const sorted = [...mapped].sort((a: any, b: any) => b.dateTs - a.dateTs);
  const typeCounts: Record<string, number> = {};
  for (const r of mapped) typeCounts[r.type] = (typeCounts[r.type] ?? 0) + 1;
  const types = Object.entries(typeCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const stats: ReportsStats = {
    total: mapped.length,
    dateRange: { from: sorted.at(-1)?.date ?? "—", to: sorted[0]?.date ?? "—" },
    types, sample: sorted.slice(0, 50),
    loadedAt: new Date().toISOString(),
  };
  return { stats, lookup };
}

function inferActorName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function parseActorFile(json: any, filename: string): StoredActorFile {
  const entries: StoredActorFile["entries"] = Array.isArray(json)
    ? json.map((e: any) => ({
        tactic_name: e.tactic_name ?? "",
        technique_id: e.technique_id ?? "",
        technique_name: e.technique_name ?? "",
        reports: e.reports ?? [],
        observables: e.observables ?? [],
      }))
    : [];
  return { filename, actor: inferActorName(filename), entries };
}

function readJson(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => { try { resolve(JSON.parse(e.target?.result as string)); } catch { reject(new Error("Invalid JSON")); } };
    reader.onerror = () => reject(new Error("Read error"));
    reader.readAsText(file);
  });
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string ?? "");
    reader.onerror = () => reject(new Error("Read error"));
    reader.readAsText(file);
  });
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "idle") return <span className="text-xs text-muted-foreground">Not loaded</span>;
  if (status === "loading") return <span className="flex items-center gap-1 text-xs text-yellow-400"><Loader2 className="w-3 h-3 animate-spin" />Loading…</span>;
  if (status === "done") return <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-3 h-3" />Loaded</span>;
  return <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="w-3 h-3" />Error</span>;
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/30 border border-border rounded-lg px-3 py-2 flex flex-col gap-0.5 min-w-[80px]">
      <span className="text-lg font-bold text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

function SH({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pb-1 border-b border-border mb-2">{children}</div>;
}

export default function DataSources() {
  const { saveView, savedViews } = useViews();
  const [, navigate] = useLocation();

  // ── MITRE ATT&CK ────────────────────────────────────────────────
  const [mitreUrl, setMitreUrl] = useState(MITRE_DEFAULT_URL);
  const [mitreStatus, setMitreStatus] = useState<Status>(() => ls(LS_MITRE) ? "done" : "idle");
  const [mitreStats, setMitreStats] = useState<MitreStats | null>(() => ls(LS_MITRE));
  const [mitreError, setMitreError] = useState("");
  const [mitrePreview, setMitrePreview] = useState(false);
  const mitreFileRef = useRef<HTMLInputElement>(null);

  // ── Reports ──────────────────────────────────────────────────────
  const [reportsStatus, setReportsStatus] = useState<Status>(() => ls<ReportsStats>("ds_reports_stats") ? "done" : "idle");
  const [reportsStats, setReportsStats] = useState<ReportsStats | null>(() => ls("ds_reports_stats"));
  const [reportsError, setReportsError] = useState("");
  const [reportsPreview, setReportsPreview] = useState(false);
  const reportsFileRef = useRef<HTMLInputElement>(null);

  // ── Actor files ──────────────────────────────────────────────────
  const [actorFiles, setActorFiles] = useState<StoredActorFile[]>(loadActorFiles);
  const [actorError, setActorError] = useState("");
  const actorFileRef = useRef<HTMLInputElement>(null);

  // ── Generate modal ───────────────────────────────────────────────
  const [showGenerate, setShowGenerate] = useState(false);
  const [viewName, setViewName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genPreview, setGenPreview] = useState<{ procedures: number; actors: number; actorNames: string[] } | null>(null);

  const reportsLookup = loadReportsLookup();

  // ── MITRE handlers ────────────────────────────────────────────────
  async function fetchMitreUrl() {
    setMitreStatus("loading"); setMitreError("");
    const rawUrl = toBlobToRaw(mitreUrl.trim());
    if (rawUrl !== mitreUrl.trim()) setMitreUrl(rawUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

    try {
      const res = await fetch(rawUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
      const json = await res.json();
      const stats = parseMitre(json);
      setMitreStats(stats); lsSet(LS_MITRE, stats); setMitreStatus("done");
    } catch (e: any) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        setMitreError("Request timed out (file may be too large). Download the file and upload it instead.");
      } else if (e.name === "TypeError" || e.message?.includes("fetch")) {
        setMitreError("Network / CORS error. Download the file using the link below and upload it instead.");
      } else {
        setMitreError(e.message ?? "Unknown error");
      }
      setMitreStatus("error");
    }
  }

  async function onMitreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setMitreStatus("loading"); setMitreError("");
    try {
      const json = await readJson(file);
      const stats = parseMitre(json);
      setMitreStats(stats); lsSet(LS_MITRE, stats); setMitreStatus("done");
    } catch (err: any) { setMitreError(err.message); setMitreStatus("error"); }
    e.target.value = "";
  }

  function clearMitre() { setMitreStats(null); setMitreStatus("idle"); localStorage.removeItem(LS_MITRE); }

  // ── Reports handlers ──────────────────────────────────────────────
  async function onReportsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setReportsStatus("loading"); setReportsError("");
    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      let result: { stats: ReportsStats; lookup: ReportsLookup };
      if (isCsv) {
        const text = await readText(file);
        result = parseReportsCsv(text);
      } else {
        const json = await readJson(file);
        result = parseReportsJson(json);
      }
      setReportsStats(result.stats); lsSet("ds_reports_stats", result.stats);
      saveReportsLookup(result.lookup); setReportsStatus("done");
    } catch (err: any) { setReportsError(err.message); setReportsStatus("error"); }
    e.target.value = "";
  }

  function clearReports() {
    setReportsStats(null); setReportsStatus("idle");
    localStorage.removeItem("ds_reports_stats"); localStorage.removeItem("ds_reports_lookup");
  }

  // ── Actor file handlers ────────────────────────────────────────────
  async function onActorFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); if (!files.length) return;
    setActorError("");
    const newFiles: StoredActorFile[] = [];
    for (const file of files) {
      try {
        const json = await readJson(file);
        newFiles.push(parseActorFile(json, file.name));
      } catch { setActorError(`Failed to parse ${file.name}`); }
    }
    const merged = [...actorFiles];
    for (const nf of newFiles) {
      const existing = merged.findIndex(f => f.filename === nf.filename);
      if (existing >= 0) merged[existing] = nf; else merged.push(nf);
    }
    setActorFiles(merged); saveActorFiles(merged);
    e.target.value = "";
  }

  function removeActorFile(filename: string) {
    const next = actorFiles.filter(f => f.filename !== filename);
    setActorFiles(next); saveActorFiles(next);
  }

  function updateActorName(filename: string, name: string) {
    const next = actorFiles.map(f => f.filename === filename ? { ...f, actor: name } : f);
    setActorFiles(next); saveActorFiles(next);
  }

  // ── Generation ────────────────────────────────────────────────────
  function openGenerate() {
    if (actorFiles.length === 0) return;
    const { procedures, actorRanking } = generateView(actorFiles, reportsLookup);
    setGenPreview({
      procedures: procedures.length,
      actors: actorRanking.length,
      actorNames: actorRanking.map(a => a.actor),
    });
    setViewName(`View ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`);
    setShowGenerate(true);
  }

  function saveNewView() {
    if (!viewName.trim() || !genPreview) return;
    setGenerating(true);
    setTimeout(() => {
      const { procedures, actorRanking } = generateView(actorFiles, reportsLookup);
      const view: SavedView = {
        id: `view_${Date.now()}`,
        name: viewName.trim(),
        createdAt: new Date().toISOString(),
        procedures,
        actorRanking,
        meta: {
          actorFiles: actorFiles.map(f => f.actor),
          hasReports: Object.keys(reportsLookup).length > 0,
          totalProcedures: procedures.length,
          totalActors: actorRanking.length,
        },
      };
      saveView(view);
      setGenerating(false);
      setShowGenerate(false);
      navigate(`/view/${view.id}`);
    }, 0);
  }

  const canGenerate = actorFiles.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Sources</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Load external intelligence data via URL or JSON file upload. Parsed results persist across sessions.
        </p>
      </div>

      {/* Saved views quick-access */}
      {savedViews.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{savedViews.length} saved view{savedViews.length !== 1 ? "s" : ""}</p>
            <p className="text-xs text-muted-foreground">{savedViews.map(v => v.name).join(" · ")}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {savedViews.slice(-3).map(v => (
              <a key={v.id} href={`/view/${v.id}`} onClick={e => { e.preventDefault(); navigate(`/view/${v.id}`); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors">
                <Eye className="w-3 h-3" />{v.name}
              </a>
            ))}
          </div>
        </div>
      )}

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
              {mitreStats && <button onClick={clearMitre} title="Clear" className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>}
            </div>
          </div>
          <div className="p-5 space-y-3 flex-1">
            <SH>Load via URL</SH>
            <div className="flex gap-2">
              <input type="url" value={mitreUrl} onChange={e => setMitreUrl(e.target.value)} placeholder="https://..."
                className="flex-1 min-w-0 bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              <button onClick={fetchMitreUrl} disabled={mitreStatus === "loading" || !mitreUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
                {mitreStatus === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}Fetch
              </button>
            </div>
            {mitreStatus === "loading" && (
              <p className="text-[10px] text-yellow-400">
                Downloading ~75 MB — this may take a minute on slower connections…
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Blob URLs are automatically converted to raw. If the fetch fails,{" "}
              <a href={MITRE_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer"
                className="text-primary underline">download the file</a>{" "}
              then upload it below.
            </p>
            <SH>Load via File</SH>
            <button onClick={() => mitreFileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors">
              <Upload className="w-3.5 h-3.5" />Upload enterprise-attack.json
            </button>
            <input ref={mitreFileRef} type="file" accept=".json" className="hidden" onChange={onMitreFile} />
            {mitreError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 space-y-1">
                <p className="text-xs text-red-400 font-medium">Fetch failed</p>
                <p className="text-[10px] text-red-400/80">{mitreError}</p>
                <a href={MITRE_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-primary underline">
                  <Upload className="w-3 h-3" />Download enterprise-attack.json and upload it above
                </a>
              </div>
            )}
            {mitreStats && (
              <div className="space-y-3 pt-1">
                <SH>Summary</SH>
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Techniques" value={mitreStats.total.toLocaleString()} />
                  <StatPill label="Tactics" value={mitreStats.tactics.length} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {mitreStats.tactics.map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary">{t}</span>)}
                </div>
                <p className="text-[10px] text-muted-foreground">Loaded {new Date(mitreStats.loadedAt).toLocaleString()}</p>
                <button onClick={() => setMitrePreview(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {mitrePreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {mitrePreview ? "Hide" : "Show"} preview ({mitreStats.sample.length} entries)
                </button>
                {mitrePreview && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/30 border-b border-border">
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">ID</th>
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Name</th>
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Tactics</th>
                      </tr></thead>
                      <tbody>{mitreStats.sample.map((t, i) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="px-3 py-1.5 font-mono text-primary whitespace-nowrap">{t.id}</td>
                          <td className="px-3 py-1.5 text-foreground max-w-[180px]"><div className="truncate" title={t.name}>{t.name}</div></td>
                          <td className="px-3 py-1.5 text-muted-foreground max-w-[160px]"><div className="truncate">{t.tactics.join(", ")}</div></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Reports ── */}
        <div className="bg-card border border-card-border rounded-xl flex flex-col">
          <div className="p-5 border-b border-border">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-chart-2">Reports</span>
                  <StatusBadge status={reportsStatus} />
                </div>
                <p className="text-xs text-muted-foreground">Intelligence reports — CSV preferred (id, name, url, date)</p>
              </div>
              {reportsStats && <button onClick={clearReports} title="Clear" className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>}
            </div>
          </div>
          <div className="p-5 space-y-3 flex-1">
            <SH>Expected Format (CSV — preferred)</SH>
            <div className="bg-muted/20 border border-border rounded-lg px-3 py-2 text-[10px] font-mono text-muted-foreground leading-relaxed">
              id, name, url, date<br />
              CSA-240217, "Report Title", https://..., 17/02/2024<br />
              <span className="opacity-60">// date column = DD/MM/YYYY</span>
            </div>
            <SH>Load via File</SH>
            <button onClick={() => reportsFileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-chart-2/50 hover:text-foreground transition-colors">
              <Upload className="w-3.5 h-3.5" />Upload reports.csv or reports.json
            </button>
            <input ref={reportsFileRef} type="file" accept=".csv,.json" className="hidden" onChange={onReportsFile} />
            {reportsError && <p className="text-xs text-red-400">{reportsError}</p>}
            {reportsStats && (
              <div className="space-y-3 pt-1">
                <SH>Summary</SH>
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Reports" value={reportsStats.total.toLocaleString()} />
                  <StatPill label="Types" value={reportsStats.types.length} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Range: <span className="text-foreground">{reportsStats.dateRange.from}</span> → <span className="text-foreground">{reportsStats.dateRange.to}</span>
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
                <button onClick={() => setReportsPreview(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {reportsPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {reportsPreview ? "Hide" : "Show"} preview
                </button>
                {reportsPreview && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-muted/30 border-b border-border">
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">Date</th>
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Name</th>
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">Type</th>
                      </tr></thead>
                      <tbody>{reportsStats.sample.map((r, i) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{r.date}</td>
                          <td className="px-3 py-1.5 max-w-[200px]">
                            {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block" title={r.name}>{r.name}</a>
                              : <span className="text-foreground truncate block" title={r.name}>{r.name}</span>}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{r.type}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Actor Mapping (multi-file) ── */}
        <div className="bg-card border border-card-border rounded-xl flex flex-col">
          <div className="p-5 border-b border-border">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-chart-4">Actor Mapping</span>
                  {actorFiles.length > 0
                    ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-3 h-3" />{actorFiles.length} file{actorFiles.length !== 1 ? "s" : ""}</span>
                    : <span className="text-xs text-muted-foreground">No files</span>}
                </div>
                <p className="text-xs text-muted-foreground">Actor TTP maps — one file per actor, multiple actors supported</p>
              </div>
            </div>
          </div>
          <div className="p-5 space-y-3 flex-1">
            <SH>Expected Format per File</SH>
            <div className="bg-muted/20 border border-border rounded-lg px-3 py-2 text-[10px] font-mono text-muted-foreground leading-relaxed">
              {`[ { tactic_id, tactic_name,`}<br />
              {`    technique_id, technique_name,`}<br />
              {`    reports[], observables[] }, ... ]`}
            </div>

            <SH>Loaded Actor Files</SH>
            {actorFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No actor files loaded yet.</p>
            ) : (
              <div className="space-y-2">
                {actorFiles.map(file => (
                  <div key={file.filename} className="flex items-center gap-2 bg-muted/20 border border-border rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <input
                        value={file.actor}
                        onChange={e => updateActorName(file.filename, e.target.value)}
                        className="bg-transparent text-xs font-semibold text-chart-4 w-full focus:outline-none focus:underline"
                        title="Click to rename actor"
                      />
                      <p className="text-[10px] text-muted-foreground truncate" title={file.filename}>
                        {file.filename} · {file.entries.length} entries
                      </p>
                    </div>
                    <button onClick={() => removeActorFile(file.filename)} className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => actorFileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-chart-4/50 hover:text-foreground transition-colors">
              <Plus className="w-3.5 h-3.5" />Add actor file(s)
            </button>
            <input ref={actorFileRef} type="file" accept=".json" multiple className="hidden" onChange={onActorFiles} />
            {actorError && <p className="text-xs text-red-400">{actorError}</p>}

            {actorFiles.length > 0 && (
              <div className="pt-1 space-y-2">
                <SH>Aggregate Stats</SH>
                <div className="flex flex-wrap gap-2">
                  <StatPill label="Actors" value={actorFiles.length} />
                  <StatPill label="Entries" value={actorFiles.reduce((s, f) => s + f.entries.length, 0)} />
                  <StatPill label="Tactics" value={new Set(actorFiles.flatMap(f => f.entries.map(e => e.tactic_name))).size} />
                  <StatPill label="Techniques" value={new Set(actorFiles.flatMap(f => f.entries.map(e => e.technique_id))).size} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Generate New View ── */}
      <div className={`border rounded-xl p-5 transition-colors ${canGenerate ? "bg-card border-primary/30" : "bg-card border-border opacity-60"}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Generate New View</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {canGenerate
                  ? `Combine ${actorFiles.length} actor file${actorFiles.length !== 1 ? "s" : ""}${reportsStats ? " + reports" : ""} into a Purple Team Prioritisation view`
                  : "Load at least one actor mapping file to enable view generation"}
              </p>
            </div>
          </div>
          <button
            onClick={openGenerate}
            disabled={!canGenerate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex-shrink-0"
          >
            <Layers className="w-4 h-4" />Generate &amp; Save View
          </button>
        </div>
      </div>

      {/* How to use */}
      <div className="bg-muted/20 border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground text-sm mb-2">How to use</p>
        <p><span className="text-primary font-medium">MITRE ATT&amp;CK</span> — Optional. Fetch from GitHub or upload a local STIX bundle. Enriches technique descriptions.</p>
        <p><span className="text-chart-2 font-medium">Reports</span> — Optional but recommended. Upload a CrowdStrike reports export to resolve report slugs into dates and URLs in the generated view.</p>
        <p><span className="text-chart-4 font-medium">Actor Mapping</span> — Required for generation. Upload one JSON file per actor (e.g. SCATTERED_SPIDER.json). You can rename actors by clicking their name. Upload multiple files in one go.</p>
        <p className="pt-1 border-t border-border">Click <strong className="text-foreground">Generate &amp; Save View</strong> to build a Purple Team Prioritisation Layer from your uploaded data. Views are saved to your browser and never overwrite the default dashboard data.</p>
      </div>

      {/* ── Save modal ── */}
      {showGenerate && genPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Save New View</h2>
              <p className="text-xs text-muted-foreground mt-1">This view will be saved to your browser and accessible from the sidebar.</p>
            </div>

            <div className="bg-muted/20 border border-border rounded-xl p-4 grid grid-cols-3 gap-3">
              {[
                { label: "Actors", value: genPreview.actors },
                { label: "Procedures", value: genPreview.procedures.toLocaleString() },
                { label: "Sources", value: `${actorFiles.length} file${actorFiles.length !== 1 ? "s" : ""}` },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-xl font-bold text-foreground">{s.value}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {genPreview.actorNames.map(a => (
                <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-chart-4/10 border border-chart-4/30 text-chart-4">{a}</span>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">View Name</label>
              <input
                autoFocus
                value={viewName}
                onChange={e => setViewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveNewView(); if (e.key === "Escape") setShowGenerate(false); }}
                placeholder="e.g. Scattered Spider — Q1 2025"
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowGenerate(false)}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveNewView}
                disabled={!viewName.trim() || generating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                {generating ? "Generating…" : "Save & Open View"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
