export const CONF_SCORES: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
export const INT_SCORES: Record<string, number>  = { Low: 1, Medium: 2.25, High: 3.5 };
export const AVAIL_SCORES: Record<string, number> = { Low: 1, Medium: 2.5, High: 4 };

// ── Likelihood scoring tables (matches Excel cols S-AC of RISK CALCULATION) ───

export const LAST_OCC_OPTIONS: { label: string; score: number }[] = [
  { label: "< 3 months",                  score: 1.7 },
  { label: "between 3 months and 1 year", score: 1.3 },
  { label: "between 1 and 2 yrs",         score: 1.1 },
  { label: "> 2 years",                   score: 0.8 },
];

export const CONFIDENCE_LIK_OPTIONS: { label: string; score: number }[] = [
  { label: "high confidence",   score: 1.25 },
  { label: "medium confidence", score: 1.0  },
  { label: "low confidence",    score: 0.75 },
];

/** Convert a stored date value (Excel serial or Unix ms) to a Last Occurrence category label. */
export function lastOccToCategory(dateVal: number | null | undefined): string {
  if (!dateVal) return "> 2 years";
  // Excel serial date (small integer < 100 000) vs Unix ms (large integer > 1e9)
  const ms = dateVal > 1e8 ? dateVal : Math.round((dateVal - 25569) * 86400 * 1000);
  const months = (Date.now() - ms) / (1000 * 60 * 60 * 24 * 30.44);
  if (months < 3)  return "< 3 months";
  if (months < 12) return "between 3 months and 1 year";
  if (months < 24) return "between 1 and 2 yrs";
  return "> 2 years";
}

/** Normalise a stored date value to a displayable string (handles Excel serial or Unix ms). */
export function dateValToStr(n: number | null | undefined): string {
  if (!n) return "—";
  const ms = n > 1e8 ? n : Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function calcLikelihoodScore(
  tidPriority: number,
  lastOccScore: number,
  confScore: number,
  hvaLikelihood: number,
): number {
  return tidPriority * lastOccScore * confScore * hvaLikelihood;
}

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
