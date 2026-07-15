import data from "@/data.json";
import {
  calcCIAScore, calcImpactScore, calcImpactRate, calcTTPExtent,
  calcLikelihoodScore, calcLikelihoodRate,
  LAST_OCC_OPTIONS, CONFIDENCE_LIK_OPTIONS,
} from "@/utils/impactFormulas";
import type { TacticOverrides } from "@/context/TacticScoresContext";

export type RiskRow = {
  TID: string;
  "Technique Name": string;
  Platforms: string;
  Tactic: string;
  Confidentiality: string;
  "Confidentiality Score": number;
  Integrity: string;
  "Integrity Score": number;
  Availability: string;
  "Availability Score": number;
  "CIA Score": number;
  "TTP Extent Score": number;
  "HIGH VALUE ASSSET RISK": number;
  "Impact Score": number;
  "Impact Rate": string;
  "TID  Priority": number;
  "Last Occurrence": string;
  "Last occurrence Score": number;
  Confidence: string;
  "Confidence Score": number;
  "Likelihood Score": number;
  "Likelihood Rate": string;
  "Risk Rate": number;
  "Risk Scores": number;
};

function loadImpactTable(): Record<string, any> {
  const rows = (data as any).impactTable ?? [];
  const map: Record<string, any> = {};
  for (const r of rows) map[r.id] = r;
  return map;
}

const _impactMap = loadImpactTable();

export function applyOverrides(
  rows: RiskRow[],
  tacticOvMap: TacticOverrides = {},
  likOvMap: Record<string, { lastOccurrence?: string; confidence?: string }> = {},
  impactOvs: Record<string, any> = {},
  hvaScores: Record<string, { avgRisk: number; avgLikelihood: number }> = {},
): RiskRow[] {
  return rows.map(row => {
    const impOv   = impactOvs[row.TID];
    const base    = _impactMap[row.TID];
    const hvaLive = hvaScores[row.TID];
    const likOv   = likOvMap[row.TID];

    const primaryTactic = (row.Tactic ?? "").split(",")[0].trim();
    const tacticOv      = tacticOvMap[primaryTactic] ?? {};
    const hasTacticOv   = Object.keys(tacticOv).length > 0;

    const conf  = impOv?.confidentiality ?? tacticOv.conf      ?? row.Confidentiality;
    const int_  = impOv?.integrity       ?? tacticOv.integrity  ?? row.Integrity;
    const avail = impOv?.availability    ?? tacticOv.avail      ?? row.Availability;

    const newCIA = (impOv || hasTacticOv) && base
      ? calcCIAScore(conf, int_, avail)
      : row["CIA Score"];

    const ttpRow = base ? {
      initialTTPExtent:    impOv?.initialTTPExtent    ?? base.initialTTPExtent,
      adScore:             impOv?.adScore             ?? base.adScore,
      containerScore:      impOv?.containerScore      ?? base.containerScore,
      cloudScore:          impOv?.cloudScore          ?? base.cloudScore,
      supportRemoteScore:  impOv?.supportRemoteScore  ?? base.supportRemoteScore,
      systemReqScore:      impOv?.systemReqScore      ?? base.systemReqScore,
      capecSeverityScore:  impOv?.capecSeverityScore  ?? base.capecSeverityScore,
      permRequiredScore:   impOv?.permRequiredScore   ?? base.permRequiredScore,
      effectivePermsScore: impOv?.effectivePermsScore ?? base.effectivePermsScore,
    } : null;
    const newExt = (impOv && ttpRow) ? calcTTPExtent(ttpRow) : row["TTP Extent Score"];

    const hvaRisk    = hvaLive?.avgRisk ?? 1;
    const newImpact  = calcImpactScore(newCIA, newExt, hvaRisk);
    const newImpRate = calcImpactRate(newImpact);

    const tidPriority      = row["TID  Priority"] ?? 1;
    const baseLastOccScore = row["Last occurrence Score"] ?? 1;
    const baseConfScore    = row["Confidence Score"] ?? 1;

    const lastOccLabel  = likOv?.lastOccurrence ?? row["Last Occurrence"];
    const lastOccScore  = LAST_OCC_OPTIONS.find(o => o.label === lastOccLabel)?.score ?? baseLastOccScore;

    const confLabel   = likOv?.confidence ?? row.Confidence;
    const confScore   = CONFIDENCE_LIK_OPTIONS.find(o => o.label === confLabel)?.score ?? baseConfScore;

    const baseNoHVA    = tidPriority * baseLastOccScore * baseConfScore;
    const baseHVAFact  = baseNoHVA > 0 ? (row["Likelihood Score"] ?? 1) / baseNoHVA : 1;
    const hvaLikFactor = hvaLive ? hvaLive.avgLikelihood : baseHVAFact;

    const newLikScore = calcLikelihoodScore(tidPriority, lastOccScore, confScore, hvaLikFactor);
    const newLikRate  = calcLikelihoodRate(newLikScore);

    return {
      ...row,
      Confidentiality:           conf,
      Integrity:                 int_,
      Availability:              avail,
      "CIA Score":               newCIA,
      "TTP Extent Score":        newExt,
      "HIGH VALUE ASSSET RISK":  hvaRisk,
      "Impact Score":            newImpact,
      "Impact Rate":             newImpRate,
      "Last Occurrence":         lastOccLabel,
      "Last occurrence Score":   lastOccScore,
      Confidence:                confLabel,
      "Confidence Score":        confScore,
      "Likelihood Score":        newLikScore,
      "Likelihood Rate":         newLikRate,
      "Risk Scores":             newImpact * newLikScore,
    } as RiskRow;
  });
}
