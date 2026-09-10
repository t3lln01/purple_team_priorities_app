import type { LiveActorData } from "@/context/AppDataContext";

export type AssessmentStatus = "pending" | "approved" | "rejected";

export type AssessmentEvidence = {
  mitreId: string;
  date: number | null;
  excerpt: string;
  signals: string[];
};

export type AutoAssessment = {
  actorName: string;
  quarter: string;
  generatedAt: string;
  status: AssessmentStatus;
  intentBaseScore: number;
  willingnessModifier: number;
  capabilityBaseScore: number;
  noveltyModifier: number;
  intentFinalScore: number;
  capabilityFinalScore: number;
  confidence: "low" | "medium" | "high";
  procedureCount: number;
  evidence: AssessmentEvidence[];
  intentRationale: string;
  willingnessRationale: string;
  capabilityRationale: string;
  noveltyRationale: string;
  reviewedAt?: string;
  previousIntentScore?: number;
  previousCapabilityScore?: number;
};

type ActorForScoring = {
  name: string;
  aliases: string;
  malware: string;
  actorType: string;
  motivation: string;
  effectiveIntentScore?: number;
  effectiveCapabilityScore?: number;
};

const INTENT_SIGNALS = [
  { re: /\b(wip(?:e|er|ing)|destroy|destruct|sabotag|encrypt(?:ed|ion)?|ransom|disrupt|denial.of.service)\b/i, score: 5, label: "destructive or disruptive action" },
  { re: /\b(exfiltrat|steal|theft|collect(?:ed|ion)?|credential|financial|payment|bank)\b/i, score: 4, label: "theft or collection objective" },
  { re: /\b(government|energy|financial|healthcare|telecom|defen[cs]e|technology|sector)\b/i, score: 3, label: "sector-focused activity" },
  { re: /\b(region|country|state|ministry|embassy|military)\b/i, score: 2, label: "regional or state-focused activity" },
] as const;

const CAPABILITY_SIGNALS = [
  { re: /\b(zero.?day|0day|custom malware|custom tool|kernel|rootkit|bootkit|firmware|supply.chain|hypervisor)\b/i, score: 5, label: "advanced or custom capability" },
  { re: /\b(credential dump|lateral movement|persistence|defen[cs]e evasion|command and control|c2|exploit|web shell|process injection)\b/i, score: 4, label: "multi-stage operational capability" },
  { re: /\b(powershell|script|macro|phishing|scheduled task|remote service|living off the land|lolbin)\b/i, score: 3, label: "established operational tooling" },
  { re: /\b(scan|discover|enumerat|download|execute|command)\b/i, score: 2, label: "basic executable capability" },
] as const;

const NOVELTY_HIGH = /\b(zero.?day|0day|custom malware|custom tool|novel|previously unknown|bespoke)\b/i;
const NOVELTY_COMMON = /\b(mimikatz|cobalt strike|powershell|rclone|psexec|publicly available|open.source|commodity)\b/i;

export function quarterBounds(label: string): { start: number; end: number } | null {
  const match = label.match(/^Q([1-4])\s+(\d{4})$/);
  if (!match) return null;
  const q = Number(match[1]);
  const year = Number(match[2]);
  // Fiscal quarters are labelled by the year in which they end:
  // Q1 = Dec–Feb, Q2 = Mar–May, Q3 = Jun–Aug, Q4 = Sep–Nov.
  const starts = [[year - 1, 11], [year, 2], [year, 5], [year, 8]] as const;
  const [startYear, startMonth] = starts[q - 1];
  const endYear = q === 1 ? year : startYear;
  const endMonth = q === 1 ? 2 : startMonth + 3;
  return {
    start: Date.UTC(startYear, startMonth, 1),
    end: Date.UTC(endYear, endMonth, 1) - 1,
  };
}

function actorMatches(actor: ActorForScoring, procedureActor: string): boolean {
  const needle = procedureActor.trim().toUpperCase();
  if (!needle) return false;
  if (actor.name.toUpperCase() === needle) return true;
  return actor.aliases.split(",").some(alias => alias.trim().toUpperCase() === needle);
}

function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 220 ? `${clean.slice(0, 217)}…` : clean;
}

function rationale(kind: "intent" | "willingness" | "capability" | "novelty", score: number): string {
  const labels = {
    intent: ["Target of opportunity", "Regional association", "Sector association", "Ideology association", "Target-specific objective"],
    willingness: ["No procedure evidence supports a reducing modifier"],
    capability: ["No confirmed capability", "Possible capability", "Limited capability", "Credible capability", "Significant capability"],
    novelty: ["Custom or novel toolset", "Limited-availability toolset", "Generally available toolset"],
  };
  if (kind === "willingness") return labels.willingness[0];
  if (kind === "intent") return labels.intent[Math.max(0, Math.min(4, score - 1))];
  if (kind === "capability") return labels.capability[Math.max(0, Math.min(4, score - 1))];
  return score === 0 ? labels.novelty[0] : score === -1 ? labels.novelty[1] : labels.novelty[2];
}

export function generateQuarterlyAssessments(
  quarter: string,
  actors: ActorForScoring[],
  liveData: LiveActorData | null,
): AutoAssessment[] {
  const bounds = quarterBounds(quarter);
  if (!bounds || !liveData) return [];

  const assessments: AutoAssessment[] = [];
  for (const actor of actors) {
    const procedures = liveData.procedures.filter(p =>
      actorMatches(actor, p.actor) &&
      p.date !== null &&
      p.date >= bounds.start &&
      p.date <= bounds.end
    );
    if (!procedures.length) continue;

    let intent = 1;
    let capability = 1;
    let novelty = -2;
    const evidence: AssessmentEvidence[] = [];

    for (const procedure of procedures) {
      // Suggestions intentionally use only the dated TID and procedure text
      // from the selected quarter; actor metadata and out-of-quarter activity
      // must not influence the recommendation.
      const text = `${procedure.mitreId} ${procedure.procedure}`;
      const signals: string[] = [];
      for (const signal of INTENT_SIGNALS) {
        if (signal.re.test(text)) {
          intent = Math.max(intent, signal.score);
          signals.push(signal.label);
        }
      }
      for (const signal of CAPABILITY_SIGNALS) {
        if (signal.re.test(text)) {
          capability = Math.max(capability, signal.score);
          signals.push(signal.label);
        }
      }
      if (NOVELTY_HIGH.test(text)) {
        novelty = 0;
        signals.push("novel or custom tooling");
      } else if (!NOVELTY_COMMON.test(text) && novelty < -1) {
        novelty = -1;
      } else if (NOVELTY_COMMON.test(text)) {
        signals.push("generally available tooling");
      }
      if (signals.length && evidence.length < 5) {
        evidence.push({ mitreId: procedure.mitreId, date: procedure.date, excerpt: excerpt(procedure.procedure), signals });
      }
    }

    const distinctSignals = new Set(evidence.flatMap(item => item.signals)).size;
    const confidence = procedures.length >= 5 && distinctSignals >= 3
      ? "high"
      : procedures.length >= 2 && distinctSignals >= 1 ? "medium" : "low";
    const willingness = 0;

    assessments.push({
      actorName: actor.name,
      quarter,
      generatedAt: new Date().toISOString(),
      status: "pending" as const,
      intentBaseScore: intent,
      willingnessModifier: willingness,
      capabilityBaseScore: capability,
      noveltyModifier: novelty,
      intentFinalScore: Math.max(1, Math.min(5, intent + willingness)),
      capabilityFinalScore: Math.max(1, Math.min(5, capability + novelty)),
      confidence,
      procedureCount: procedures.length,
      evidence,
      intentRationale: rationale("intent", intent),
      willingnessRationale: rationale("willingness", willingness),
      capabilityRationale: rationale("capability", capability),
      noveltyRationale: rationale("novelty", novelty),
      previousIntentScore: actor.effectiveIntentScore,
      previousCapabilityScore: actor.effectiveCapabilityScore,
    });
  }
  return assessments;
}