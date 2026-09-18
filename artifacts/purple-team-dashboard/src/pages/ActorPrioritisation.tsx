import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Crosshair, Search, ShieldCheck } from "lucide-react";
import threatModelData from "@/threatModelData.json";
import data from "@/data.json";
import { baseFullRiskCalc, useAppData } from "@/context/AppDataContext";
import { useTacticScores } from "@/context/TacticScoresContext";
import { useLikelihood } from "@/context/LikelihoodContext";
import { useImpactOverrides } from "@/context/ImpactOverridesContext";
import { useHVAScores } from "@/context/HVAScoresContext";
import { applyOverrides, type RiskRow } from "@/utils/riskOverrides";
import { actorKey, actorTidRisks, calculateActorPriority, type ActorProcedure } from "@/utils/actorPriority";
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
  priority: number | null;
  tidCount: number;
  missingRiskCount: number;
  riskSum: number;
  averageRisk: number | null;
  priorityPct: number;
  level: "Critical" | "High" | "Medium" | "Low" | "Unscored";
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
  if (level === "Unscored") return "border-border bg-muted text-muted-foreground";
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
  const [membership, setMembership] = useState<ThreatModelState | null>(null);
  const { liveActorData, activeNewRiskRows } = useAppData();
  const { overrides: tacticOverrides } = useTacticScores();
  const { overrides: likelihoodOverrides } = useLikelihood();
  const { overrides: impactOverrides } = useImpactOverrides();
  const { hvaScoreMap } = useHVAScores();
  const [customProcedures] = useState<ActorProcedure[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("pt_procedures_custom") ?? "[]");
      return Array.isArray(stored) ? stored : [];
    } catch { return []; }
  });
  const riskScores = useMemo(() => Object.fromEntries(
    applyOverrides(
      [...baseFullRiskCalc, ...activeNewRiskRows] as RiskRow[],
      tacticOverrides, likelihoodOverrides, impactOverrides, hvaScoreMap,
    ).map(row => [row.TID, row["Risk Scores"]]),
  ), [activeNewRiskRows, tacticOverrides, likelihoodOverrides, impactOverrides, hvaScoreMap]);
  const tidRisks = useMemo(() => actorTidRisks([
    ...(data.allProcedures as ActorProcedure[]),
    ...customProcedures,
    ...(liveActorData?.procedures ?? []),
  ], riskScores), [customProcedures, liveActorData, riskScores]);
  const priorityCeiling = useMemo(() => 49 * Math.max(
    0,
    ...Object.values(riskScores).filter(Number.isFinite),
    ...[...tidRisks.values()].flatMap(tids => [...tids.values()].map(risk => risk ?? 0)),
  ), [riskScores, tidRisks]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<"All" | RankedActor["level"]>("All");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setState(null);
    setMembership(null);

    async function loadState(quarter: string): Promise<ThreatModelState> {
        const response = await fetch(`${TM_API}?quarter=${encodeURIComponent(quarter)}`);
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Unable to load Threat Model state");
        }
        return {
            customActors: data.customActors ?? [],
            actorOverrides: data.actorOverrides ?? {},
            ppTapList: data.ppTapList ?? [],
            sirtList: data.sirtList ?? [],
            autoAssessments: data.autoAssessments ?? {},
            monitoringState: data.monitoringState ?? {},
        };
    }
    const currentState = loadState(CURRENT_THREAT_MODEL_QUARTER);
    Promise.all([
      currentState,
      selectedQuarter === CURRENT_THREAT_MODEL_QUARTER ? currentState : loadState(selectedQuarter),
    ]).then(([scores, monitored]) => {
        if (!cancelled) {
          setState(scores);
          setMembership(monitored);
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
    if (!state || !membership) return [];

    // Include historical custom names for membership, but never borrow their
    // historical scores: the selected quarter is strictly a membership filter.
    const candidates = new Map<string, StaticActor | ThreatModelState["customActors"][number]>();
    for (const actor of staticActors) candidates.set(actorKey(actor.name), actor);
    for (const actor of state.customActors) candidates.set(actorKey(actor.name), actor);
    for (const actor of membership.customActors) {
      if (!candidates.has(actorKey(actor.name))) candidates.set(actorKey(actor.name), { name: actor.name });
    }
    const rows = [...candidates.values()].flatMap(actor => {
      const override = state.actorOverrides[actor.name] ?? {};
      const membershipActor = membership.customActors.find(item => actorKey(item.name) === actorKey(actor.name))
        ?? staticActors.find(item => actorKey(item.name) === actorKey(actor.name));
      const monitored = membership.monitoringState[actor.name]
        ?? membership.actorOverrides[actor.name]?.inMonitoringList
        ?? membershipActor?.inMonitoringList
        ?? false;
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

    return rows
      .map(actor => {
        const calculation = calculateActorPriority(actor.intent, actor.capability, tidRisks.get(actorKey(actor.name)));
        const priorityPct = priorityCeiling > 0 ? (calculation.priority ?? 0) / priorityCeiling : 0;
        return {
          ...actor,
          ...calculation,
          priorityPct,
          level: calculation.priority === null ? "Unscored" as const : levelFor(priorityPct),
        };
      })
      .sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1) || b.intent - a.intent || a.name.localeCompare(b.name));
  }, [state, membership, tidRisks, priorityCeiling]);

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
             The selected quarter filters monitored actors only. Scores use {CURRENT_THREAT_MODEL_QUARTER} Threat Model intent and capability and all-time observed TID risk.
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
          {(["All", "Critical", "High", "Medium", "Low", "Unscored"] as const).map(level => (
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
                  <SortableTh col="tidCount" sortKey={sortKey} sortDir={sortDir} toggle={toggle}>Known TIDs</SortableTh>
                  <SortableTh col="averageRisk" sortKey={sortKey} sortDir={sortDir} toggle={toggle}>Average TID risk</SortableTh>
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
                    <td className="px-4 py-3 font-mono text-xs">{actor.tidCount}</td>
                    <td className="px-4 py-3 font-mono text-xs" title={actor.missingRiskCount ? `${actor.missingRiskCount} TIDs have no risk score` : `Risk sum ${actor.riskSum} ÷ ${actor.tidCount} distinct TIDs`}>
                      {actor.averageRisk === null ? "Missing risk" : actor.averageRisk.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="min-w-16 font-mono text-xs font-semibold text-foreground">{actor.priority === null ? "—" : actor.priority.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
        Priority = Intent × Capability × (sum of distinct observed TID risk scores ÷ known TID count).
        <br />
        All procedure dates are included; repeated TIDs count once. No known TIDs = 0; missing risk scores = Unscored.
        <br />
        Bars and levels use a reference ceiling of 49 × the highest available TID risk score ({priorityCeiling.toLocaleString(undefined, { maximumFractionDigits: 2 })}).
      </div>
    </div>
  );
}