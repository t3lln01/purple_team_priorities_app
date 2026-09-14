import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Crosshair, Search, ShieldCheck } from "lucide-react";
import threatModelData from "@/threatModelData.json";
import { useSortTable } from "@/hooks/useSortTable";
import SortableTh from "@/components/SortableTh";
import {
  CURRENT_THREAT_MODEL_QUARTER,
  useThreatModelQuarter,
} from "@/context/ThreatModelQuarterContext";

const TM_API = "/api/cs/threat-model-state";

type StaticActor = {
  name: string;
  malware: string;
  intentFinalScore: number | null;
  capabilityFinalScore: number | null;
  inMonitoringList: boolean;
};

type AutoAssessment = {
  status?: string;
  intentFinalScore?: number | null;
  capabilityFinalScore?: number | null;
};

type ThreatModelState = {
  customActors: Array<{
    name: string;
    malware?: string;
    intentFinalScore?: number | null;
    capabilityFinalScore?: number | null;
    inMonitoringList?: boolean;
  }>;
  actorOverrides: Record<string, {
    intentFinalScore?: number | null;
    capabilityFinalScore?: number | null;
    csData?: {
      malware?: string;
      intentFinalScore?: number | null;
      capabilityFinalScore?: number | null;
    };
    inMonitoringList?: boolean;
  }>;
  ppTapList: string[];
  sirtList: string[];
  autoAssessments: Record<string, AutoAssessment>;
  monitoringState: Record<string, boolean>;
};

type RankedActor = {
  name: string;
  intent: number;
  capability: number;
  priority: number;
  priorityPct: number;
  level: "Critical" | "High" | "Medium" | "Low";
  inPpTap: boolean;
  inSirt: boolean;
};

const staticActors = (threatModelData as { threatModelActors: StaticActor[] }).threatModelActors;

function matchesThreatModelList(actorName: string, malware: string, list: string[]) {
  const actor = actorName.toUpperCase().trim();
  const actorMalware = malware.toUpperCase();
  return list.some(item => {
    const match = item.trim().toUpperCase();
    return Boolean(match && (match === actor || actorMalware.includes(match)));
  });
}

function levelFor(priorityPct: number): RankedActor["level"] {
  if (priorityPct >= 0.8) return "Critical";
  if (priorityPct >= 0.55) return "High";
  if (priorityPct >= 0.3) return "Medium";
  return "Low";
}

function levelClass(level: RankedActor["level"]) {
  if (level === "Critical") return "border-red-400/30 bg-red-400/10 text-red-400";
  if (level === "High") return "border-orange-400/30 bg-orange-400/10 text-orange-400";
  if (level === "Medium") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-400";
  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-400";
}

function ScoreDots({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {Array.from({ length: 7 }).map((_, index) => (
          <span
            key={index}
            className={`h-2 w-2 rounded-full ${index < score ? color : "bg-muted"}`}
          />
        ))}
      </div>
      <span className="w-4 text-right text-xs font-semibold text-foreground">{score}</span>
    </div>
  );
}

export default function ActorPrioritisation() {
  const { selectedQuarter } = useThreatModelQuarter();
  const [state, setState] = useState<ThreatModelState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<"All" | RankedActor["level"]>("All");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(`${TM_API}?quarter=${encodeURIComponent(selectedQuarter)}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Unable to load Threat Model state");
        }
        if (!cancelled) {
          setState({
            customActors: data.customActors ?? [],
            actorOverrides: data.actorOverrides ?? {},
            ppTapList: data.ppTapList ?? [],
            sirtList: data.sirtList ?? [],
            autoAssessments: data.autoAssessments ?? {},
            monitoringState: data.monitoringState ?? {},
          });
        }
      })
      .catch(fetchError => {
        if (!cancelled) {
          setState(null);
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load Threat Model state");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedQuarter]);

  const rankedActors = useMemo(() => {
    if (!state) return [];

    const rows = staticActors.flatMap(actor => {
      const override = state.actorOverrides[actor.name] ?? {};
      const monitored = state.monitoringState[actor.name]
        ?? override.inMonitoringList
        ?? actor.inMonitoringList;
      if (!monitored) return [];
      const csData = override.csData ?? {};
      const approvedAssessment = state.autoAssessments[actor.name]?.status === "approved"
        ? state.autoAssessments[actor.name]
        : null;
      const baseIntent = override.intentFinalScore
        ?? csData.intentFinalScore
        ?? approvedAssessment?.intentFinalScore
        ?? actor.intentFinalScore
        ?? 0;
      const capability = override.capabilityFinalScore
        ?? csData.capabilityFinalScore
        ?? approvedAssessment?.capabilityFinalScore
        ?? actor.capabilityFinalScore
        ?? 0;
      const malware = csData.malware ?? actor.malware ?? "";
      const inPpTap = matchesThreatModelList(actor.name, malware, state.ppTapList);
      const inSirt = matchesThreatModelList(actor.name, malware, state.sirtList);
      const intent = Math.min(7, baseIntent + (inPpTap ? 1 : 0) + (inSirt ? 2 : 0));
      return [{ name: actor.name, intent, capability, inPpTap, inSirt }];
    });

    for (const actor of state.customActors) {
      const monitored = state.monitoringState[actor.name] ?? actor.inMonitoringList ?? false;
      if (!monitored) continue;
      const inPpTap = matchesThreatModelList(actor.name, actor.malware ?? "", state.ppTapList);
      const inSirt = matchesThreatModelList(actor.name, actor.malware ?? "", state.sirtList);
      rows.push({
        name: actor.name,
        intent: Math.min(7, (actor.intentFinalScore ?? 0) + (inPpTap ? 1 : 0) + (inSirt ? 2 : 0)),
        capability: actor.capabilityFinalScore ?? 0,
        inPpTap,
        inSirt,
      });
    }

    return rows
      .map(actor => {
        const priority = actor.intent * actor.capability;
        const priorityPct = priority / 49;
        return {
          ...actor,
          priority,
          priorityPct,
          level: levelFor(priorityPct),
        };
      })
      .sort((a, b) => b.priority - a.priority || b.intent - a.intent || a.name.localeCompare(b.name));
  }, [state]);

  const filteredActors = useMemo(
    () => rankedActors.filter(actor => {
      const matchesSearch = actor.name.toLowerCase().includes(search.trim().toLowerCase());
      const matchesLevel = levelFilter === "All" || actor.level === levelFilter;
      return matchesSearch && matchesLevel;
    }),
    [rankedActors, search, levelFilter],
  );

  const { sortKey, sortDir, toggle, sorted } = useSortTable(
    filteredActors,
    "priority",
    "desc",
  );

  const criticalCount = rankedActors.filter(actor => actor.level === "Critical").length;
  const highCount = rankedActors.filter(actor => actor.level === "High").length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Actor Priority Rankings</h1>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {selectedQuarter}
              {selectedQuarter === CURRENT_THREAT_MODEL_QUARTER ? " · current" : ""}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Only monitored actors are ranked, using the effective Intent and Capability scores saved in the selected Threat Model quarter.
          </p>
        </div>
        <Link href="/threat-model">
          <span className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-accent">
            <Crosshair className="h-4 w-4" />
            Change Threat Model quarter
          </span>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-3xl font-bold text-primary">{rankedActors.length}</div>
          <div className="mt-1 text-sm text-muted-foreground">Monitored actors in ranking</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-3xl font-bold text-red-400">{criticalCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">Critical priority</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-3xl font-bold text-orange-400">{highCount}</div>
          <div className="mt-1 text-sm text-muted-foreground">High priority</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search actors..."
              className="w-full rounded-lg border border-border bg-input py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {(["All", "Critical", "High", "Medium", "Low"] as const).map(level => (
            <button
              key={level}
              type="button"
              onClick={() => setLevelFilter(level)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                levelFilter === level
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {level}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{filteredActors.length} actors</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading {selectedQuarter} Threat Model…</div>
        ) : error ? (
          <div className="p-12 text-center">
            <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-red-400" />
            <div className="text-sm font-medium text-foreground">Ranking unavailable</div>
            <div className="mt-1 text-xs text-muted-foreground">{error}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="w-16 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rank</th>
                  <SortableTh col="name" sortKey={sortKey} sortDir={sortDir} toggle={toggle}>Actor</SortableTh>
                  <SortableTh col="intent" sortKey={sortKey} sortDir={sortDir} toggle={toggle}>Intent</SortableTh>
                  <SortableTh col="capability" sortKey={sortKey} sortDir={sortDir} toggle={toggle}>Capability</SortableTh>
                  <SortableTh col="priority" sortKey={sortKey} sortDir={sortDir} toggle={toggle}>Priority</SortableTh>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Threat Model lists</th>
                  <SortableTh col="level" sortKey={sortKey} sortDir={sortDir} toggle={toggle}>Level</SortableTh>
                </tr>
              </thead>
              <tbody>
                {sorted.map((actor, index) => (
                  <tr key={actor.name} className="border-b border-border/50 transition-colors last:border-0 hover:bg-accent/30">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{index + 1}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{actor.name}</td>
                    <td className="px-4 py-3"><ScoreDots score={actor.intent} color="bg-primary" /></td>
                    <td className="px-4 py-3"><ScoreDots score={actor.capability} color="bg-cyan-400" /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-7 font-mono text-xs font-semibold text-foreground">{actor.priority}</span>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${actor.priorityPct * 100}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {actor.inPpTap && <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">PP-TAP +1</span>}
                        {actor.inSirt && <span className="rounded border border-red-400/30 bg-red-400/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">SIRT +2</span>}
                        {!actor.inPpTap && !actor.inSirt && <span className="text-xs text-muted-foreground/50">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-1 text-xs font-medium ${levelClass(actor.level)}`}>
                        {actor.level}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sorted.length && (
              <div className="p-10 text-center text-sm text-muted-foreground">No actors match the current filters.</div>
            )}
          </div>
        )}
      </div>

      <div className="text-right text-xs text-muted-foreground">
        Priority = Threat Model Intent × Threat Model Capability · Maximum score 49
      </div>
    </div>
  );
}