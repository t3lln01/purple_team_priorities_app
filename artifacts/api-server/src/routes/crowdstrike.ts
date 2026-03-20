import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "../..");
const SYNC_FILE  = path.join(ROOT, "cs-sync-state.json");
const CREDS_FILE = path.join(ROOT, "cs-credentials.json");

const CS_BASE = "https://api.us-2.crowdstrike.com";

export const csRouter = Router();

// ── Types ──────────────────────────────────────────────────────────────────────

export type SyncStatus = "never" | "running" | "done" | "error";

export interface SyncState {
  status: SyncStatus;
  lastSync: string | null;
  syncStarted: string | null;
  error: string | null;
  meta: { reportCount: number; actorCount: number };
  reports: any[];
  actors: Array<{ filename: string; actor: string; entries: any[] }>;
}

interface StoredCreds {
  clientId: string;
  clientSecret: string;
}

// ── Credentials (env vars + file-based fallback) ───────────────────────────────

// In-memory cache of file-based credentials — populated at startup and on update
let cachedStoredCreds: StoredCreds | null = null;

/** Load credentials from disk and populate the in-memory cache. Call once at startup. */
export async function initStoredCreds(): Promise<void> {
  try {
    const raw = await fs.readFile(CREDS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.clientId && parsed.clientSecret) {
      cachedStoredCreds = { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
    }
  } catch {
    cachedStoredCreds = null;
  }
}

function hasCredentials(): boolean {
  return !!(process.env.CS_CLIENT_ID && process.env.CS_CLIENT_SECRET) || cachedStoredCreds !== null;
}

/** Returns the active credentials and their source (env takes precedence over stored). */
function getActiveCredentials(): { clientId: string; clientSecret: string; source: "env" | "stored" } | null {
  if (process.env.CS_CLIENT_ID && process.env.CS_CLIENT_SECRET) {
    return { clientId: process.env.CS_CLIENT_ID, clientSecret: process.env.CS_CLIENT_SECRET, source: "env" };
  }
  if (cachedStoredCreds) {
    return { ...cachedStoredCreds, source: "stored" };
  }
  return null;
}

async function getToken(): Promise<string> {
  const creds = getActiveCredentials();
  if (!creds) throw new Error("CrowdStrike credentials are not configured. Enter them in Data Sources → CrowdStrike Intel API.");

  const res = await fetch(`${CS_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `client_id=${encodeURIComponent(creds.clientId)}&client_secret=${encodeURIComponent(creds.clientSecret)}`,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth token request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  return data.access_token as string;
}

// ── Sync state ─────────────────────────────────────────────────────────────────

const defaultState = (): SyncState => ({
  status: "never",
  lastSync: null,
  syncStarted: null,
  error: null,
  meta: { reportCount: 0, actorCount: 0 },
  reports: [],
  actors: [],
});

async function loadState(): Promise<SyncState> {
  try {
    const raw = await fs.readFile(SYNC_FILE, "utf-8");
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

async function saveState(state: SyncState): Promise<void> {
  await fs.writeFile(SYNC_FILE, JSON.stringify(state, null, 2));
}

// ── Reports ────────────────────────────────────────────────────────────────────

async function fetchReportIds(token: string, since?: number): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  const limit = 5000;

  while (true) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sort: "created_date|desc" });
    if (since) {
      // Apply a 48-hour lookback buffer so reports published just before the
      // previous sync window boundary are never silently missed.
      const cutoffSec = Math.floor((since - 48 * 60 * 60 * 1000) / 1000);
      params.set("filter", `created_date:>=${cutoffSec}`);
    }

    const res = await fetch(`${CS_BASE}/intel/queries/reports/v1?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Reports query failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const data = await res.json() as any;
    const page: string[] = data.resources ?? [];
    ids.push(...page);

    const total: number = data.meta?.pagination?.total ?? 0;
    offset += page.length;
    if (offset >= total || page.length === 0) break;
  }
  return ids;
}

async function fetchReportDetails(token: string, ids: string[]): Promise<any[]> {
  const details: any[] = [];
  // Batch in groups of 100 (API limit)
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const qs = chunk.map(id => `ids=${encodeURIComponent(id)}`).join("&");
    const res = await fetch(`${CS_BASE}/intel/entities/reports/v1?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json() as any;
      details.push(...(data.resources ?? []));
    }
  }
  return details;
}

async function syncReports(token: string, since?: number): Promise<any[]> {
  console.log("[CS] Fetching report IDs…");
  const ids = await fetchReportIds(token, since);
  console.log(`[CS] Found ${ids.length} report IDs. Fetching details…`);
  const details = await fetchReportDetails(token, ids);
  console.log(`[CS] Reports fetched: ${details.length}`);
  return details;
}

// ── Actors + MITRE ─────────────────────────────────────────────────────────────

async function fetchAllActorIds(token: string): Promise<string[]> {
  const ids: string[] = [];
  let offset: string | undefined;

  while (true) {
    const params: Record<string, string> = { limit: "1000" };
    if (offset) params.offset = offset;

    const res = await fetch(`${CS_BASE}/intel/queries/actors/v1?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Actors query failed (${res.status})`);
    const data = await res.json() as any;
    const page: string[] = data.resources ?? [];
    ids.push(...page);

    const nextOffset = data.meta?.pagination?.offset;
    if (!nextOffset || page.length === 0) break;
    offset = String(nextOffset);
  }
  return ids;
}

async function fetchActorDetails(token: string, ids: string[]): Promise<any[]> {
  const actors: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const qs = chunk.map(id => `ids=${encodeURIComponent(id)}`).join("&");
    const res = await fetch(`${CS_BASE}/intel/entities/actors/v1?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json() as any;
      actors.push(...(data.resources ?? []));
    }
  }
  return actors;
}

/** Normalise whatever the MITRE reports endpoint returns into an entries array */
function normalizeMitreEntries(raw: any): any[] {
  // Handle various possible response shapes
  if (Array.isArray(raw)) return raw;
  if (raw?.resources && Array.isArray(raw.resources)) return raw.resources;
  if (raw?.tactics && Array.isArray(raw.tactics)) {
    // MITRE navigator style: flatten tactics → techniques
    const entries: any[] = [];
    for (const tactic of raw.tactics) {
      for (const tech of tactic.techniques ?? []) {
        entries.push({
          tactic_name: tactic.name ?? tactic.tactic_name ?? "",
          technique_id: tech.technique_id ?? tech.id ?? "",
          technique_name: tech.technique_name ?? tech.name ?? "",
          reports: tech.reports ?? [],
          observables: tech.observables ?? [],
        });
      }
    }
    return entries;
  }
  // Unknown format — store as-is wrapped in array for forward-compat
  if (typeof raw === "object" && raw !== null) return [raw];
  return [];
}

async function syncActorsMitre(token: string): Promise<SyncState["actors"]> {
  console.log("[CS] Fetching actor IDs…");
  const ids = await fetchAllActorIds(token);
  console.log(`[CS] ${ids.length} actors found. Fetching details…`);
  const actors = await fetchActorDetails(token, ids);
  console.log(`[CS] ${actors.length} actor details fetched. Fetching MITRE reports…`);

  const result: SyncState["actors"] = [];
  for (const actor of actors) {
    try {
      const res = await fetch(
        `${CS_BASE}/intel/entities/mitre-reports/v1?actor_id=${encodeURIComponent(actor.id)}&format=JSON`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const raw = await res.json() as any;
        const entries = normalizeMitreEntries(raw);
        if (entries.length > 0) {
          const name: string = actor.name ?? actor.slug ?? String(actor.id);
          result.push({ filename: `${name}.json`, actor: name, entries });
        }
      }
    } catch (e) {
      console.warn(`[CS] MITRE fetch failed for actor ${actor.id}:`, e);
    }
    // Be polite to the API
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`[CS] ${result.length} actors have MITRE data`);
  return result;
}

// ── Core sync logic (exported for cron use) ────────────────────────────────────

let syncRunning = false;

export async function runSync(options: { since?: number } = {}): Promise<void> {
  if (syncRunning) {
    console.log("[CS] Sync already running — skipping");
    return;
  }
  if (!hasCredentials()) {
    console.log("[CS] No credentials configured — skipping sync");
    return;
  }

  syncRunning = true;
  const state = await loadState();
  state.status = "running";
  state.syncStarted = new Date().toISOString();
  state.error = null;
  await saveState(state);

  try {
    const token = await getToken();

    const [reports, actors] = await Promise.allSettled([
      syncReports(token, options.since),
      syncActorsMitre(token),
    ]);

    const newReports   = reports.status === "fulfilled" ? reports.value : [];
    const finalActors  = actors.status  === "fulfilled" ? actors.value  : state.actors;

    if (reports.status === "rejected") console.error("[CS] Reports sync failed:", reports.reason);
    if (actors.status  === "rejected") console.error("[CS] Actors sync failed:",  actors.reason);

    // Merge incoming reports with previously accumulated ones — deduplicate by
    // slug (preferred) or id so re-fetched reports from the 48-hour buffer
    // window don't create duplicates, and older reports are never lost.
    const existingById = new Map<string, any>(
      state.reports.map((r: any) => [String(r.slug ?? r.id ?? ""), r])
    );
    for (const r of newReports) {
      const key = String(r.slug ?? r.id ?? "");
      if (key) existingById.set(key, r); // newer fetch wins
    }
    const mergedReports = Array.from(existingById.values());
    const newCount = newReports.filter((r: any) => {
      const key = String(r.slug ?? r.id ?? "");
      return key && !state.reports.some((s: any) => String(s.slug ?? s.id ?? "") === key);
    }).length;

    await saveState({
      status: "done",
      lastSync: new Date().toISOString(),
      syncStarted: state.syncStarted,
      error: null,
      meta: { reportCount: mergedReports.length, actorCount: finalActors.length },
      reports: mergedReports,
      actors: finalActors,
    });
    console.log(`[CS] Sync complete — ${newCount} new reports (${mergedReports.length} total), ${finalActors.length} actors`);
  } catch (err: any) {
    console.error("[CS] Sync failed:", err.message);
    await saveState({ ...state, status: "error", error: err.message });
  } finally {
    syncRunning = false;
  }
}

export async function maybeAutoSync(): Promise<void> {
  if (!hasCredentials()) return;
  // syncRunning is the in-memory truth for this process
  if (syncRunning) return;

  const state = await loadState();

  // If the file claims "running" but this process is not syncing, the previous
  // server was killed mid-sync — clean up the stale state so the UI reflects reality
  if (state.status === "running") {
    console.log("[CS] Stale 'running' state from previous server — resetting");
    await saveState({ ...state, status: "error", error: "Sync interrupted by server restart" });
    state.status = "error";
  }

  const lastSync    = state.lastSync ? new Date(state.lastSync).getTime() : 0;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - lastSync >= sevenDaysMs) {
    console.log("[CS] Weekly auto-sync triggered");
    runSync({ since: lastSync || undefined }).catch(console.error);
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/** GET /api/cs/credentials — credential source info (never returns actual secrets) */
csRouter.get("/cs/credentials", (_req, res) => {
  const creds = getActiveCredentials();
  const source = creds?.source ?? "none";
  let clientIdHint: string | null = null;
  if (creds) {
    const id = creds.clientId;
    clientIdHint = id.length > 6 ? `${id.slice(0, 3)}…${id.slice(-3)}` : "•••";
  }
  res.json({ configured: hasCredentials(), source, clientIdHint });
});

/** POST /api/cs/credentials — save credentials to disk */
csRouter.post("/cs/credentials", async (req, res) => {
  const { clientId, clientSecret } = req.body ?? {};
  if (!clientId?.trim() || !clientSecret?.trim()) {
    res.status(400).json({ ok: false, error: "clientId and clientSecret are required" });
    return;
  }
  const creds: StoredCreds = { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  try {
    await fs.writeFile(CREDS_FILE, JSON.stringify(creds, null, 2));
    cachedStoredCreds = creds;
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** DELETE /api/cs/credentials — remove stored credentials */
csRouter.delete("/cs/credentials", async (_req, res) => {
  try {
    await fs.unlink(CREDS_FILE);
  } catch { /* already gone */ }
  cachedStoredCreds = null;
  res.json({ ok: true });
});

/** GET /api/cs/status — connection status + last sync info */
csRouter.get("/cs/status", async (_req, res) => {
  const state = await loadState();
  const lastMs = state.lastSync ? new Date(state.lastSync).getTime() : 0;
  const nextMs = lastMs ? lastMs + 7 * 24 * 60 * 60 * 1000 : null;
  res.json({
    hasCredentials: hasCredentials(),
    status:         state.status,
    lastSync:       state.lastSync,
    nextSync:       nextMs ? new Date(nextMs).toISOString() : null,
    syncStarted:    state.syncStarted,
    error:          state.error,
    meta:           state.meta,
  });
});

/** POST /api/cs/connect — test OAuth credentials */
csRouter.post("/cs/connect", async (_req, res) => {
  try {
    await getToken();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

/** POST /api/cs/sync — start a full sync (async) */
csRouter.post("/cs/sync", async (req, res) => {
  if (syncRunning) {
    res.status(409).json({ error: "Sync already running" });
    return;
  }
  // Optional: only fetch from the last sync onwards (weekly delta)
  const state  = await loadState();
  const lastMs = req.body?.full ? undefined : (state.lastSync ? new Date(state.lastSync).getTime() : undefined);
  const since  = lastMs && Date.now() - lastMs < 30 * 24 * 60 * 60 * 1000 ? lastMs : undefined;

  runSync({ since }).catch(console.error);
  res.json({ ok: true, message: "Sync started" });
});

/** GET /api/cs/sync-result — get the stored sync result for the frontend to consume */
csRouter.get("/cs/sync-result", async (_req, res) => {
  const state = await loadState();
  res.json(state);
});
