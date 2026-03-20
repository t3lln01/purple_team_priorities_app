// ── Pure generation utilities — no saved-view state ───────────────────────────

export type ViewProcedure = {
  actor: string;
  mitreId: string;
  tacticName: string;
  techniqueName: string;
  procedure: string;
  date: number | null;
  externalRef: string;
  risk: number;
  reportRefs: string[];
};

export type ViewActorRank = {
  actor: string;
  score: number;
  techniqueCount: number;
  tacticCount: number;
  reportCount: number;
};

export type StoredActorFile = {
  filename: string;
  actor: string;
  entries: Array<{
    tactic_name: string;
    technique_id: string;
    technique_name: string;
    reports: string[];
    observables: string[];
  }>;
};

// last_updated can be unix seconds, unix ms, or ISO string — normalise to ms
function toMs(val: any): number {
  if (!val) return 0;
  if (typeof val === "number") return val < 10_000_000_000 ? val * 1000 : val;
  if (typeof val === "string") { const d = Date.parse(val); return isNaN(d) ? 0 : d; }
  return 0;
}

export type ReportsLookup = Record<string, {
  reportId: string;
  name: string;
  url: string;
  last_updated: number;
}>;

export function generateView(
  actorFiles: StoredActorFile[],
  reportsLookup: ReportsLookup,
): { procedures: ViewProcedure[]; actorRanking: ViewActorRank[] } {
  const procedures: ViewProcedure[] = [];

  for (const file of actorFiles) {
    const actorName = file.actor;

    for (const entry of file.entries) {
      const mitreId = entry.technique_id.toUpperCase().replace(/^T(?=\d)/, "T");
      const reports = entry.reports ?? [];
      const observables = entry.observables ?? [];

      let bestReport: ReportsLookup[string] | null = null;
      let bestDate = 0;

      for (const slug of reports) {
        const key = slug.trim().toUpperCase();
        const rep = reportsLookup[key];
        if (!rep) continue;
        if (rep.last_updated > bestDate) {
          bestDate = rep.last_updated;
          bestReport = rep;
        }
      }

      if (!bestReport) continue;

      const latestDate = bestDate > 0 ? bestDate : null;
      const externalRef = `${actorName.toUpperCase()} ${bestReport.name} - ${bestReport.url}`;
      const risk = Math.round(reports.length * 100 + observables.length * 50);
      const observablesText = observables.join(" ").trim();
      const procedure = observablesText
        ? `[${actorName}] - ${observablesText}`
        : `[${actorName}] -`;

      procedures.push({
        actor: actorName,
        mitreId,
        tacticName: entry.tactic_name,
        techniqueName: entry.technique_name,
        procedure,
        date: latestDate,
        externalRef,
        risk,
        reportRefs: reports,
      });
    }
  }

  const byActor: Record<string, ViewProcedure[]> = {};
  for (const p of procedures) {
    (byActor[p.actor] ??= []).push(p);
  }

  const actorRanking: ViewActorRank[] = Object.entries(byActor).map(([actor, procs]) => {
    const uniqueTechniques = new Set(procs.map(p => p.mitreId));
    const uniqueTactics = new Set(procs.map(p => p.tacticName));
    const uniqueReports = new Set(procs.flatMap(p => p.reportRefs));
    const score = procs.reduce((s, p) => s + p.risk, 0);
    return {
      actor,
      score,
      techniqueCount: uniqueTechniques.size,
      tacticCount: uniqueTactics.size,
      reportCount: uniqueReports.size,
    };
  }).sort((a, b) => b.score - a.score);

  return { procedures, actorRanking };
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_ACTOR_FILES = "ds_actormap_files";
const LS_REPORTS_LOOKUP = "ds_reports_lookup";

export function loadActorFiles(): StoredActorFile[] {
  try { return JSON.parse(localStorage.getItem(LS_ACTOR_FILES) ?? "[]"); } catch { return []; }
}
export function saveActorFiles(files: StoredActorFile[]) {
  try { localStorage.setItem(LS_ACTOR_FILES, JSON.stringify(files)); } catch {}
}
export function loadReportsLookup(): ReportsLookup {
  try { return JSON.parse(localStorage.getItem(LS_REPORTS_LOOKUP) ?? "{}"); } catch { return {}; }
}
export function saveReportsLookup(lookup: ReportsLookup) {
  try { localStorage.setItem(LS_REPORTS_LOOKUP, JSON.stringify(lookup)); } catch {}
}
