export type ActorProcedure = {
  actor: string;
  mitreId: string;
  procedure: string;
  risk?: number;
};

export const actorKey = (name: string) => name.trim().toUpperCase();

/** All-time observed techniques, not procedure frequency or quarter evidence. */
export function actorTidRisks(
  procedures: ActorProcedure[],
  riskScores: Record<string, number>,
) {
  const byActor = new Map<string, Map<string, number | null>>();
  for (const procedure of procedures) {
    const tid = procedure.mitreId?.trim().toUpperCase();
    const text = procedure.procedure?.trim();
    const name = actorKey(procedure.actor ?? "");
    if (!name || !/^T\d{4}(?:\.\d{3})?$/.test(tid) || !text || /^\[.+\]\s*-\s*$/.test(text)) continue;
    const tids = byActor.get(name) ?? new Map<string, number | null>();
    const risk = riskScores[tid] ?? procedure.risk;
    const validRisk = typeof risk === "number" && Number.isFinite(risk) && risk >= 0 ? risk : null;
    // The analytical TID score wins. For legacy procedure-only scores, use the
    // highest recorded value deterministically, never count duplicate TIDs.
    const previous = tids.get(tid);
    tids.set(tid, validRisk === null ? previous ?? null : Math.max(previous ?? 0, validRisk));
    byActor.set(name, tids);
  }
  return byActor;
}

export function calculateActorPriority(
  intent: number,
  capability: number,
  tids: Map<string, number | null> = new Map(),
) {
  const tidCount = tids.size;
  const missingRiskCount = [...tids.values()].filter(risk => risk === null).length;
  const riskSum = [...tids.values()].reduce<number>((sum, risk) => sum + (risk ?? 0), 0);
  const averageRisk = missingRiskCount ? null : tidCount ? riskSum / tidCount : 0;
  return {
    tidCount,
    missingRiskCount,
    riskSum,
    averageRisk,
    priority: averageRisk === null ? null : intent * capability * averageRisk,
  };
}