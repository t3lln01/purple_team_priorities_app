/**
 * Export API — makes every dashboard section queryable as JSON (or CSV).
 *
 * All endpoints live under /api/export/
 *
 * Common query params supported by most endpoints:
 *   format=json (default) | csv
 *
 * Response envelope (JSON):
 *   { ok: true, meta: { endpoint, count, generatedAt, filters, availableFilters }, data: [...] }
 */

import { Router, type Request, type Response } from "express";
import fs   from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Paths to static data files bundled with the frontend
const ROOT_API      = path.resolve(__dirname, "../..");          // artifacts/api-server
const DASHBOARD_SRC = path.resolve(ROOT_API, "../purple-team-dashboard/src");
const DATA_FILE     = path.join(DASHBOARD_SRC, "data.json");
const TM_FILE       = path.join(DASHBOARD_SRC, "threatModelData.json");
const TM_VERSIONS   = path.join(ROOT_API, "cs-threat-model-versions.json");

export const exportRouter = Router();

// ── Data loader helpers (lazy-cached) ─────────────────────────────────────────

let _data: any = null;
let _tm:   any = null;

async function getData(): Promise<any> {
  if (!_data) _data = JSON.parse(await fs.readFile(DATA_FILE, "utf-8"));
  return _data;
}

async function getTmData(): Promise<any> {
  if (!_tm) _tm = JSON.parse(await fs.readFile(TM_FILE, "utf-8"));
  return _tm;
}

async function getTmVersions(): Promise<Record<string, any>> {
  try { return JSON.parse(await fs.readFile(TM_VERSIONS, "utf-8")); }
  catch { return {}; }
}

/** Returns "Q3 2026" for the current fiscal quarter (Feb=Q1, May=Q2, Aug=Q3, Nov=Q4) */
function currentQuarter(): string {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  let q: number, qYear = year;
  if (month === 1)       { q = 4; qYear = year - 1; }
  else if (month <= 4)   { q = 1; }
  else if (month <= 7)   { q = 2; }
  else if (month <= 10)  { q = 3; }
  else                   { q = 4; }
  return `Q${q} ${qYear}`;
}

// ── Response helpers ───────────────────────────────────────────────────────────

function meta(req: Request, data: any[], extra: Record<string, any> = {}) {
  return {
    endpoint:         req.path,
    count:            data.length,
    generatedAt:      new Date().toISOString(),
    ...extra,
  };
}

/** Serialise an array of objects to RFC 4180 CSV */
function toCsv(rows: any[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc  = (v: any) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    keys.join(","),
    ...rows.map(r => keys.map(k => esc(r[k])).join(",")),
  ].join("\n");
}

function reply(req: Request, res: Response, data: any[], metaExtra: Record<string, any> = {}) {
  const format = (req.query.format as string ?? "json").toLowerCase();
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${req.path.replace(/\//g, "-").slice(1)}.csv"`);
    return res.send(toCsv(data));
  }
  res.json({ ok: true, meta: meta(req, data, metaExtra), data });
}

// ── Discovery endpoint ─────────────────────────────────────────────────────────

const ENDPOINTS = [
  {
    path:        "/api/export",
    description: "This discovery index — lists all export endpoints.",
    params:      [],
  },
  {
    path:        "/api/export/actor-prioritisation",
    description: "Actor priority rankings: name, intent, capability, TTP risk score, priority score, risk percentile.",
    params:      [{ name: "format", values: ["json","csv"], default: "json" }],
    rowCount:    "~34 actors",
  },
  {
    path:        "/api/export/threat-model",
    description: "Full threat model for a quarter: all actors (static + custom) with effective intent/capability scores, rubric rationale, PP-TAP/SIRT membership and overrides.",
    params:      [
      { name: "quarter",  description: "e.g. 'Q3 2026'. Defaults to current quarter." },
      { name: "format",   values: ["json","csv"], default: "json" },
    ],
    rowCount:    "~89 actors",
  },
  {
    path:        "/api/export/threat-model/versions",
    description: "List all saved threat model quarter snapshots with metadata.",
    params:      [],
  },
  {
    path:        "/api/export/risk-calculation",
    description: "Full risk calculation table: TID, technique, platforms, tactic, CIA scores, impact, likelihood, risk rate, risk score.",
    params:      [
      { name: "tactic", description: "Filter by tactic name (case-insensitive, partial match)." },
      { name: "tid",    description: "Filter by one or more TIDs (comma-separated)." },
      { name: "format", values: ["json","csv"], default: "json" },
    ],
    rowCount:    "200 rows",
  },
  {
    path:        "/api/export/impact-table",
    description: "Impact table: technique CIA ratings, extent scoring, HVA flags, and computed impact score.",
    params:      [
      { name: "tactic", description: "Filter by tactic (partial match)." },
      { name: "tid",    description: "Filter by TID(s), comma-separated." },
      { name: "format", values: ["json","csv"], default: "json" },
    ],
    rowCount:    "656 rows",
  },
  {
    path:        "/api/export/likelihood-table",
    description: "Likelihood table derived from risk calculation: TID, technique, tactic, occurrence, confidence, likelihood score and rate.",
    params:      [
      { name: "tactic", description: "Filter by tactic (partial match)." },
      { name: "tid",    description: "Filter by TID(s), comma-separated." },
      { name: "format", values: ["json","csv"], default: "json" },
    ],
    rowCount:    "200 rows",
  },
  {
    path:        "/api/export/high-value-assets",
    description: "High-value assets: target/TID risk/likelihood/impact rows plus per-TID aggregate scores.",
    params:      [
      { name: "target", description: "Filter by target name (partial match)." },
      { name: "tid",    description: "Filter by TID(s), comma-separated." },
      { name: "format", values: ["json","csv"], default: "json" },
    ],
    rowCount:    "~62 HVA rows + 6 aggregate rows",
  },
  {
    path:        "/api/export/tid-priority",
    description: "TID priority list: technique ID, occurrence count, last observation, risk label.",
    params:      [
      { name: "minCount", description: "Minimum occurrence count (integer)." },
      { name: "tid",      description: "Filter by TID(s), comma-separated." },
      { name: "format",   values: ["json","csv"], default: "json" },
    ],
    rowCount:    "150 rows",
  },
  {
    path:        "/api/export/tactics-scores",
    description: "Tactic-level CIA and extent scores.",
    params:      [
      { name: "tactic", description: "Filter by tactic name (partial match)." },
      { name: "format", values: ["json","csv"], default: "json" },
    ],
    rowCount:    "14 rows",
  },
  {
    path:        "/api/export/all-procedures",
    description: "All ATT&CK procedures observed: actor, MITRE TID, external reference, procedure text, date (unix ms), risk score.",
    params:      [
      { name: "actor",    description: "Filter by actor name (case-insensitive, partial match)." },
      { name: "tid",      description: "Filter by TID(s), comma-separated." },
      { name: "tactic",   description: "Filter by tactic name (resolved via TID→tactic map)." },
      { name: "dateFrom", description: "ISO date string or unix ms — include procedures on or after this date." },
      { name: "dateTo",   description: "ISO date string or unix ms — include procedures on or before this date." },
      { name: "limit",    description: "Maximum rows to return (integer, default 5000)." },
      { name: "format",   values: ["json","csv"], default: "json" },
    ],
    rowCount:    "3608 rows (unfiltered)",
  },
  {
    path:        "/api/export/scoring-framework",
    description: "Threat model scoring rubric: intent/willingness/capability/novelty option definitions and numeric values.",
    params:      [{ name: "format", values: ["json","csv"], default: "json" }],
    rowCount:    "5 rows",
  },
  {
    path:        "/api/export/risk-rate",
    description: "Risk rate matrix and scoring scale definitions (impact levels, risk score table, occurrence/confidence scales).",
    params:      [],
  },
];

exportRouter.get("/export", (_req, res) => {
  res.json({
    ok:          true,
    description: "Purple Team Dashboard — Export API. Every section of the dashboard is queryable as JSON or CSV.",
    generatedAt: new Date().toISOString(),
    endpoints:   ENDPOINTS,
  });
});

// ── /export/actor-prioritisation ──────────────────────────────────────────────

exportRouter.get("/export/actor-prioritisation", async (req, res) => {
  try {
    const d    = await getData();
    const rows = (d.actors as any[]).map(a => ({
      name:       a.name,
      intent:     a.intent,
      capability: a.capability,
      ttpRisk:    a.ttpRisk,
      priority:   a.priority,
      riskPct:    a.riskPct,
    }));
    reply(req, res, rows, { source: "data.json › actors" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/threat-model/versions ─────────────────────────────────────────────

exportRouter.get("/export/threat-model/versions", async (req, res) => {
  try {
    const store = await getTmVersions();
    const versions = Object.entries(store).map(([quarter, entry]: [string, any]) => ({
      quarter,
      savedAt:       entry.savedAt ?? null,
      seededFrom:    entry.seededFrom ?? null,
      customActors:  entry.customActors?.length  ?? 0,
      actorOverrides: Object.keys(entry.actorOverrides ?? {}).length,
      ppTapCount:    entry.ppTapList?.length  ?? 0,
      sirtCount:     entry.sirtList?.length   ?? 0,
    }));
    res.json({ ok: true, meta: { generatedAt: new Date().toISOString(), count: versions.length }, data: versions });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/threat-model ──────────────────────────────────────────────────────

exportRouter.get("/export/threat-model", async (req, res) => {
  try {
    const quarter = ((req.query.quarter as string) ?? "").trim() || currentQuarter();
    const [tmStatic, store] = await Promise.all([getTmData(), getTmVersions()]);

    const entry = store[quarter] ?? { customActors: [], actorOverrides: {}, ppTapList: [], sirtList: [] };
    const { customActors = [], actorOverrides = {}, ppTapList = [], sirtList = [] } = entry;

    const staticActors: any[] = tmStatic.threatModelActors;

    // Helper: does actor name / malware match a list entry?
    function matchesList(name: string, malware: string, list: string[]): boolean {
      if (!list.length) return false;
      const n = name.toUpperCase(); const m = (malware ?? "").toUpperCase();
      return list.some(t => { const T = t.trim().toUpperCase(); return T && (n === T || m.includes(T)); });
    }

    const mergedStatic = staticActors.map(a => {
      const ovr    = actorOverrides[a.name] ?? {};
      const csData = ovr.csData ?? {};
      const baseIntent = ovr.intentFinalScore ?? csData.intentFinalScore ?? a.intentFinalScore;
      const baseCap    = ovr.capabilityFinalScore ?? csData.capabilityFinalScore ?? a.capabilityFinalScore;
      const malware    = csData.malware ?? a.malware ?? "";
      const inPpTap    = matchesList(a.name, malware, ppTapList);
      const inSirt     = matchesList(a.name, malware, sirtList);
      return {
        name:                  a.name,
        origins:               csData.origins       ?? a.origins,
        aliases:               csData.aliases       ?? a.aliases,
        actorType:             csData.actorType     ?? a.actorType,
        lastSeen:              csData.lastSeen      ?? a.lastSeen,
        malware,
        countries:             csData.countries     ?? a.countries ?? [],
        industries:            csData.industries    ?? a.industries ?? [],
        motivation:            csData.motivation    ?? a.motivation ?? "",
        isCustom:              false,
        csEnriched:            ovr.csEnriched       ?? false,
        csLastRefreshed:       ovr.csLastRefreshed  ?? null,
        monitored:             ovr.inMonitoringList !== undefined ? ovr.inMonitoringList : a.inMonitoringList,
        intentBaseScore:       ovr.intentBaseScore  ?? a.intentScore ?? null,
        willingnessModifier:   ovr.willingnessModifier ?? a.willingnessScore ?? null,
        intentRationale:       ovr.intentRationale  ?? a.intent      ?? "",
        willingnessRationale:  ovr.willingnessRationale ?? a.willingness ?? "",
        capabilityBaseScore:   ovr.capabilityBaseScore ?? a.capabilitiesScore ?? null,
        noveltyModifier:       ovr.noveltyModifier  ?? a.noveltyScore ?? null,
        capabilityRationale:   ovr.capabilityRationale ?? a.capabilities ?? "",
        noveltyRationale:      ovr.noveltyRationale ?? a.novelty ?? "",
        intentFinalScore:      baseIntent           ?? null,
        capabilityFinalScore:  baseCap              ?? null,
        effectiveIntentScore:  Math.min(7, (baseIntent ?? 0) + (inPpTap ? 1 : 0) + (inSirt ? 2 : 0)),
        effectiveCapabilityScore: baseCap           ?? 0,
        inPpTap,
        inSirt,
        description:           csData.description   ?? "",
      };
    });

    const mergedCustom = (customActors as any[]).map(a => {
      const inPpTap = matchesList(a.name, a.malware ?? "", ppTapList);
      const inSirt  = matchesList(a.name, a.malware ?? "", sirtList);
      return {
        ...a,
        isCustom:                true,
        effectiveIntentScore:    Math.min(7, (a.intentFinalScore ?? 0) + (inPpTap ? 1 : 0) + (inSirt ? 2 : 0)),
        effectiveCapabilityScore: a.capabilityFinalScore ?? 0,
        inPpTap,
        inSirt,
      };
    });

    const allActors = [...mergedStatic, ...mergedCustom];

    const payload = {
      quarter,
      savedAt:    entry.savedAt   ?? null,
      seededFrom: entry.seededFrom ?? null,
      ppTapList,
      sirtList,
      actors:     allActors,
    };

    const format = (req.query.format as string ?? "json").toLowerCase();
    if (format === "csv") {
      // CSV: flatten actors array
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="threat-model-${quarter.replace(" ", "-")}.csv"`);
      return res.send(toCsv(allActors));
    }

    res.json({
      ok:   true,
      meta: {
        endpoint:    req.path,
        quarter,
        count:       allActors.length,
        generatedAt: new Date().toISOString(),
        filters:     { quarter },
        availableFilters: ["quarter", "format"],
      },
      data: payload,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/risk-calculation ──────────────────────────────────────────────────

exportRouter.get("/export/risk-calculation", async (req, res) => {
  try {
    const d    = await getData();
    let rows: any[] = d.riskCalc;

    const tacticQ = (req.query.tactic as string ?? "").trim().toLowerCase();
    const tidQ    = (req.query.tid    as string ?? "").trim();
    const tids    = tidQ ? tidQ.split(",").map(t => t.trim().toUpperCase()).filter(Boolean) : [];

    if (tacticQ) rows = rows.filter(r => (r["Tactic"] ?? "").toLowerCase().includes(tacticQ));
    if (tids.length) rows = rows.filter(r => tids.includes((r["TID"] ?? "").toUpperCase()));

    const clean = rows.map(r => ({
      tid:              r["TID"],
      technique:        r["Technique Name"],
      platforms:        r["Platforms"],
      tactic:           r["Tactic"],
      confidentiality:  r["Confidentiality"],
      confidentialityScore: r["Confidentiality Score"],
      integrity:        r["Integrity"],
      integrityScore:   r["Integrity Score"],
      availability:     r["Availability"],
      availabilityScore: r["Availability Score"],
      ciaScore:         r["CIA Score"],
      ttpExtentScore:   r["TTP Extent Score"],
      hvaRisk:          r["HIGH VALUE ASSSET RISK"],
      impactScore:      r["Impact Score"],
      impactRate:       r["Impact Rate"],
      tidPriority:      r["TID  Priority"],
      lastOccurrence:   r["Last Occurrence"],
      lastOccurrenceScore: r["Last occurrence Score"],
      confidence:       r["Confidence"],
      confidenceScore:  r["Confidence Score"],
      likelihoodScore:  r["Likelihood Score"],
      likelihoodRate:   r["Likelihood Rate"],
      riskRate:         r["Risk Rate"],
      riskScore:        r["Risk Scores"],
    }));

    reply(req, res, clean, {
      filters: { tactic: tacticQ || null, tid: tidQ || null },
      availableFilters: ["tactic", "tid", "format"],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/impact-table ──────────────────────────────────────────────────────

exportRouter.get("/export/impact-table", async (req, res) => {
  try {
    const d    = await getData();
    let rows: any[] = d.impactTable;

    const tacticQ = (req.query.tactic as string ?? "").trim().toLowerCase();
    const tidQ    = (req.query.tid    as string ?? "").trim();
    const tids    = tidQ ? tidQ.split(",").map(t => t.trim().toUpperCase()).filter(Boolean) : [];

    if (tacticQ) rows = rows.filter(r => (r.tactics ?? "").toLowerCase().includes(tacticQ));
    if (tids.length) rows = rows.filter(r => tids.includes((r.id ?? "").toUpperCase()));

    reply(req, res, rows, {
      filters: { tactic: tacticQ || null, tid: tidQ || null },
      availableFilters: ["tactic", "tid", "format"],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/likelihood-table ──────────────────────────────────────────────────

exportRouter.get("/export/likelihood-table", async (req, res) => {
  try {
    const d    = await getData();
    let rows: any[] = d.riskCalc;

    const tacticQ = (req.query.tactic as string ?? "").trim().toLowerCase();
    const tidQ    = (req.query.tid    as string ?? "").trim();
    const tids    = tidQ ? tidQ.split(",").map(t => t.trim().toUpperCase()).filter(Boolean) : [];

    if (tacticQ) rows = rows.filter(r => (r["Tactic"] ?? "").toLowerCase().includes(tacticQ));
    if (tids.length) rows = rows.filter(r => tids.includes((r["TID"] ?? "").toUpperCase()));

    const clean = rows.map(r => ({
      tid:              r["TID"],
      technique:        r["Technique Name"],
      tactic:           r["Tactic"],
      tidPriority:      r["TID  Priority"],
      lastOccurrence:   r["Last Occurrence"],
      lastOccurrenceScore: r["Last occurrence Score"],
      confidence:       r["Confidence"],
      confidenceScore:  r["Confidence Score"],
      likelihoodScore:  r["Likelihood Score"],
      likelihoodRate:   r["Likelihood Rate"],
    }));

    reply(req, res, clean, {
      filters: { tactic: tacticQ || null, tid: tidQ || null },
      availableFilters: ["tactic", "tid", "format"],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/high-value-assets ─────────────────────────────────────────────────

exportRouter.get("/export/high-value-assets", async (req, res) => {
  try {
    const d    = await getData();
    let hva: any[] = d.highvalue;

    const targetQ = (req.query.target as string ?? "").trim().toLowerCase();
    const tidQ    = (req.query.tid    as string ?? "").trim();
    const tids    = tidQ ? tidQ.split(",").map(t => t.trim().toUpperCase()).filter(Boolean) : [];

    if (targetQ) hva = hva.filter(r => (r.target ?? "").toLowerCase().includes(targetQ));
    if (tids.length) hva = hva.filter(r => tids.includes((r.tid ?? "").toUpperCase()));

    const format = (req.query.format as string ?? "json").toLowerCase();
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=\"high-value-assets.csv\"");
      return res.send(toCsv(hva));
    }

    res.json({
      ok:   true,
      meta: {
        endpoint:    req.path,
        generatedAt: new Date().toISOString(),
        hvaCount:    hva.length,
        aggregateCount: (d.hvscores as any[]).length,
        filters: { target: targetQ || null, tid: tidQ || null },
        availableFilters: ["target", "tid", "format"],
      },
      data: {
        assets:     hva,
        aggregates: d.hvscores,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/tid-priority ──────────────────────────────────────────────────────

exportRouter.get("/export/tid-priority", async (req, res) => {
  try {
    const d    = await getData();
    let rows: any[] = d.tidPriority;

    const minCount = parseInt(req.query.minCount as string ?? "0", 10);
    const tidQ     = (req.query.tid as string ?? "").trim();
    const tids     = tidQ ? tidQ.split(",").map(t => t.trim().toUpperCase()).filter(Boolean) : [];

    if (minCount > 0) rows = rows.filter(r => (r.count ?? 0) >= minCount);
    if (tids.length)  rows = rows.filter(r => tids.includes((r.tid ?? "").toUpperCase()));

    reply(req, res, rows, {
      filters: { minCount: minCount || null, tid: tidQ || null },
      availableFilters: ["minCount", "tid", "format"],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/tactics-scores ────────────────────────────────────────────────────

exportRouter.get("/export/tactics-scores", async (req, res) => {
  try {
    const d    = await getData();
    let rows: any[] = d.tactics;

    const tacticQ = (req.query.tactic as string ?? "").trim().toLowerCase();
    if (tacticQ) rows = rows.filter(r => (r.tactic ?? "").toLowerCase().includes(tacticQ));

    reply(req, res, rows, {
      filters: { tactic: tacticQ || null },
      availableFilters: ["tactic", "format"],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/all-procedures ────────────────────────────────────────────────────

exportRouter.get("/export/all-procedures", async (req, res) => {
  try {
    const d    = await getData();
    let rows: any[] = d.allProcedures;

    const actorQ  = (req.query.actor  as string ?? "").trim().toLowerCase();
    const tidQ    = (req.query.tid    as string ?? "").trim();
    const tids    = tidQ ? tidQ.split(",").map(t => t.trim().toUpperCase()).filter(Boolean) : [];
    const tacticQ = (req.query.tactic as string ?? "").trim().toLowerCase();
    const limitN  = Math.min(10000, parseInt(req.query.limit as string ?? "5000", 10)) || 5000;

    // Date range (accept ISO string or unix ms)
    const parseDate = (v: string | undefined): number | null => {
      if (!v) return null;
      const n = Number(v);
      if (!isNaN(n)) return n;
      const d = new Date(v).getTime();
      return isNaN(d) ? null : d;
    };
    const dateFrom = parseDate(req.query.dateFrom as string | undefined);
    const dateTo   = parseDate(req.query.dateTo   as string | undefined);

    // Build TID→tactics lookup from techTacticMap if tactic filter requested
    const techTacticMap: Record<string, string[]> = d.techTacticMap ?? {};

    if (actorQ)   rows = rows.filter(r => (r.actor ?? "").toLowerCase().includes(actorQ));
    if (tids.length) rows = rows.filter(r => tids.includes((r.mitreId ?? "").toUpperCase()));
    if (tacticQ)  rows = rows.filter(r => {
      const tactics: string[] = techTacticMap[r.mitreId] ?? [];
      return tactics.some(t => t.toLowerCase().includes(tacticQ));
    });
    if (dateFrom !== null) rows = rows.filter(r => (r.date ?? 0) >= dateFrom);
    if (dateTo   !== null) rows = rows.filter(r => (r.date ?? 0) <= dateTo);

    rows = rows.slice(0, limitN);

    // Enrich with human-readable date and tactic names
    const techNameMap: Record<string, string> = d.techNameMap ?? {};
    const clean = rows.map(r => ({
      actor:       r.actor,
      mitreId:     r.mitreId,
      technique:   techNameMap[r.mitreId] ?? null,
      tactics:     (techTacticMap[r.mitreId] ?? []).join("; "),
      externalRef: r.externalRef,
      procedure:   r.procedure,
      dateMs:      r.date,
      date:        r.date ? new Date(r.date).toISOString().slice(0, 10) : null,
      riskScore:   r.risk,
    }));

    reply(req, res, clean, {
      filters: {
        actor: actorQ || null, tid: tidQ || null,
        tactic: tacticQ || null,
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : null,
        dateTo:   dateTo   ? new Date(dateTo).toISOString()   : null,
        limit:    limitN,
      },
      availableFilters: ["actor", "tid", "tactic", "dateFrom", "dateTo", "limit", "format"],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/scoring-framework ─────────────────────────────────────────────────

exportRouter.get("/export/scoring-framework", async (req, res) => {
  try {
    const tm   = await getTmData();
    const rows = tm.scoringFramework as any[];
    reply(req, res, rows, { source: "threatModelData.json › scoringFramework" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── /export/risk-rate ─────────────────────────────────────────────────────────

exportRouter.get("/export/risk-rate", (_req, res) => {
  // Embedded risk matrix from RiskRate.tsx — static reference tables
  const riskMatrix = [
    { impactLevel: "Very High", likelihood: "Very High", riskRate: 25 },
    { impactLevel: "Very High", likelihood: "High",      riskRate: 20 },
    { impactLevel: "Very High", likelihood: "Medium",    riskRate: 15 },
    { impactLevel: "Very High", likelihood: "Low",       riskRate: 10 },
    { impactLevel: "Very High", likelihood: "Very Low",  riskRate:  5 },
    { impactLevel: "High",      likelihood: "Very High", riskRate: 20 },
    { impactLevel: "High",      likelihood: "High",      riskRate: 16 },
    { impactLevel: "High",      likelihood: "Medium",    riskRate: 12 },
    { impactLevel: "High",      likelihood: "Low",       riskRate:  8 },
    { impactLevel: "High",      likelihood: "Very Low",  riskRate:  4 },
    { impactLevel: "Medium",    likelihood: "Very High", riskRate: 15 },
    { impactLevel: "Medium",    likelihood: "High",      riskRate: 12 },
    { impactLevel: "Medium",    likelihood: "Medium",    riskRate:  9 },
    { impactLevel: "Medium",    likelihood: "Low",       riskRate:  6 },
    { impactLevel: "Medium",    likelihood: "Very Low",  riskRate:  3 },
    { impactLevel: "Low",       likelihood: "Very High", riskRate: 10 },
    { impactLevel: "Low",       likelihood: "High",      riskRate:  8 },
    { impactLevel: "Low",       likelihood: "Medium",    riskRate:  6 },
    { impactLevel: "Low",       likelihood: "Low",       riskRate:  4 },
    { impactLevel: "Low",       likelihood: "Very Low",  riskRate:  2 },
    { impactLevel: "Very Low",  likelihood: "Very High", riskRate:  5 },
    { impactLevel: "Very Low",  likelihood: "High",      riskRate:  4 },
    { impactLevel: "Very Low",  likelihood: "Medium",    riskRate:  3 },
    { impactLevel: "Very Low",  likelihood: "Low",       riskRate:  2 },
    { impactLevel: "Very Low",  likelihood: "Very Low",  riskRate:  1 },
  ];

  const impactLevels = [
    { level: "Very High", min: 18,   max: null,  color: "#ef4444" },
    { level: "High",      min: 10,   max: 17.99, color: "#f97316" },
    { level: "Medium",    min: 5,    max: 9.99,  color: "#eab308" },
    { level: "Low",       min: 2,    max: 4.99,  color: "#84cc16" },
    { level: "Very Low",  min: null, max: 1.99,  color: "#22c55e" },
  ];

  const likelihoodLevels = [
    { level: "Very High", min: 60,   max: null,  description: "Very likely to occur" },
    { level: "High",      min: 40,   max: 59.99, description: "Likely to occur" },
    { level: "Medium",    min: 20,   max: 39.99, description: "Possible" },
    { level: "Low",       min: 10,   max: 19.99, description: "Unlikely" },
    { level: "Very Low",  min: null, max: 9.99,  description: "Rare" },
  ];

  const riskScoreTable = [
    { riskRate: 25, label: "Critical", color: "#7f1d1d" },
    { riskRate: 20, label: "Critical", color: "#991b1b" },
    { riskRate: 16, label: "High",     color: "#c2410c" },
    { riskRate: 15, label: "High",     color: "#ea580c" },
    { riskRate: 12, label: "High",     color: "#f97316" },
    { riskRate: 10, label: "Medium",   color: "#ca8a04" },
    { riskRate:  9, label: "Medium",   color: "#eab308" },
    { riskRate:  8, label: "Medium",   color: "#a3e635" },
    { riskRate:  6, label: "Low",      color: "#65a30d" },
    { riskRate:  5, label: "Low",      color: "#16a34a" },
    { riskRate:  4, label: "Low",      color: "#15803d" },
    { riskRate:  3, label: "Low",      color: "#166534" },
    { riskRate:  2, label: "Very Low", color: "#14532d" },
    { riskRate:  1, label: "Very Low", color: "#052e16" },
  ];

  res.json({
    ok: true,
    meta: { endpoint: "/api/export/risk-rate", generatedAt: new Date().toISOString() },
    data: { riskMatrix, impactLevels, likelihoodLevels, riskScoreTable },
  });
});
