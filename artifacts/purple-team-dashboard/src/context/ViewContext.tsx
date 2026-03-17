import { createContext, useContext, useState, ReactNode } from "react";

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

export type SavedView = {
  id: string;
  name: string;
  createdAt: string;
  procedures: ViewProcedure[];
  actorRanking: ViewActorRank[];
  meta: {
    actorFiles: string[];
    hasReports: boolean;
    totalProcedures: number;
    totalActors: number;
  };
};

type ViewCtx = {
  savedViews: SavedView[];
  saveView: (view: SavedView) => void;
  deleteView: (id: string) => void;
  renameView: (id: string, name: string) => void;
};

const ViewContext = createContext<ViewCtx | null>(null);

function loadViews(): SavedView[] {
  try { return JSON.parse(localStorage.getItem("pt_saved_views") ?? "[]"); }
  catch { return []; }
}

function persistViews(views: SavedView[]) {
  try { localStorage.setItem("pt_saved_views", JSON.stringify(views)); } catch {}
}

export function ViewProvider({ children }: { children: ReactNode }) {
  const [savedViews, setSavedViews] = useState<SavedView[]>(loadViews);

  function saveView(view: SavedView) {
    const next = [...savedViews.filter(v => v.id !== view.id), view];
    setSavedViews(next);
    persistViews(next);
  }

  function deleteView(id: string) {
    const next = savedViews.filter(v => v.id !== id);
    setSavedViews(next);
    persistViews(next);
  }

  function renameView(id: string, name: string) {
    const next = savedViews.map(v => v.id === id ? { ...v, name } : v);
    setSavedViews(next);
    persistViews(next);
  }

  return (
    <ViewContext.Provider value={{ savedViews, saveView, deleteView, renameView }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useViews() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useViews must be inside ViewProvider");
  return ctx;
}

// ── Generation logic ──────────────────────────────────────────────────────────

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
  reportId: string;   // slug uppercased (e.g. "CSA-240217")
  name: string;
  url: string;
  last_updated: number; // ms timestamp — normalised from last_modified_date
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

      // Match slugs → lookup (keys are uppercase, match Python: rep_id.strip().upper())
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

      // Python script: skip entry entirely if no matching report found
      if (!bestReport) continue;

      // Date from the best (newest) report
      const latestDate = bestDate > 0 ? bestDate : null;

      // External ref mirrors Python: f'{threat_actor.upper()} {best_report["name"]} - {best_report["url"]}'
      const externalRef = `${actorName.toUpperCase()} ${bestReport.name} - ${bestReport.url}`;

      const risk = Math.round(reports.length * 100 + observables.length * 50);

      // Python: one row per TTP entry; description = '[Actor] - {all observables joined by space}'
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

  // Build actor ranking
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
