export const CONF_SCORES: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
export const INT_SCORES: Record<string, number>  = { Low: 1, Medium: 2.25, High: 3.5 };
export const AVAIL_SCORES: Record<string, number> = { Low: 1, Medium: 2.5, High: 4 };

export const IMPACT_RATE_THRESHOLDS = [
  { max: 10, label: "Very Low" },
  { max: 12, label: "Low" },
  { max: 14, label: "Medium" },
  { max: 16, label: "High" },
  { max: Infinity, label: "Very High" },
];

export const LIKELIHOOD_RATE_THRESHOLDS = [
  { max: 1.5, label: "Very Low" },
  { max: 3.5, label: "Low" },
  { max: 5.5, label: "Medium" },
  { max: 7.5, label: "High" },
  { max: Infinity, label: "Very High" },
];

export function calcCIAScore(conf: string, int: string, avail: string): number {
  return (CONF_SCORES[conf] ?? 0) + (INT_SCORES[int] ?? 0) + (AVAIL_SCORES[avail] ?? 0);
}

export function calcImpactScore(ciaScore: number, ttpExtent: number, hvaRisk: number | ""): number {
  const hva = hvaRisk === "" || hvaRisk == null ? 1 : Number(hvaRisk);
  return ciaScore * ttpExtent * hva;
}

export function calcImpactRate(impactScore: number): string {
  for (const t of IMPACT_RATE_THRESHOLDS) {
    if (impactScore <= t.max) return t.label;
  }
  return "Very High";
}

export function calcLikelihoodRate(likScore: number): string {
  for (const t of LIKELIHOOD_RATE_THRESHOLDS) {
    if (likScore <= t.max) return t.label;
  }
  return "Very High";
}

export function calcTTPExtent(row: {
  initialTTPExtent: number;
  adScore: number;
  containerScore: number;
  cloudScore: number;
  supportRemoteScore: number;
  systemReqScore: number;
  capecSeverityScore: number;
  permRequiredScore: number;
  effectivePermsScore: number;
}): number {
  return (
    row.initialTTPExtent +
    row.adScore +
    row.containerScore +
    row.cloudScore +
    row.supportRemoteScore +
    row.systemReqScore +
    row.capecSeverityScore +
    row.permRequiredScore +
    row.effectivePermsScore
  );
}
