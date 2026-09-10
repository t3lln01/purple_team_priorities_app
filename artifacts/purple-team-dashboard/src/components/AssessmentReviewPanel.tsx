import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, ClipboardCheck, RefreshCw, X } from "lucide-react";
import type { AutoAssessment, AssessmentStatus, ScoringContext } from "@/utils/quarterlyAutoScoring";
import { sourceQuarterForAssessment } from "@/utils/quarterlyAutoScoring";

type Props = {
  quarter: string;
  assessments: AutoAssessment[];
  onClose: () => void;
  onDecide: (names: string[], status: Exclude<AssessmentStatus, "pending">) => void;
  scoringContext: ScoringContext;
  onScoringContextChange: (context: ScoringContext) => void;
  onRegenerate: (context: ScoringContext) => void;
};

function delta(next: number, previous?: number) {
  if (previous === undefined) return "—";
  const value = next - previous;
  return value > 0 ? `+${value}` : String(value);
}

function parseContext(value: string) {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

export default function AssessmentReviewPanel({
  quarter,
  assessments,
  onClose,
  onDecide,
  scoringContext,
  onScoringContextChange,
  onRegenerate,
}: Props) {
  const pending = useMemo(() => assessments.filter(item => item.status === "pending"), [assessments]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pending.map(item => item.actorName)));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [industryDraft, setIndustryDraft] = useState(scoringContext.industries.join(", "));
  const [technologyDraft, setTechnologyDraft] = useState(scoringContext.technologies.join(", "));
  const [countryDraft, setCountryDraft] = useState(scoringContext.countries.join(", "));

  function applyContext() {
    const next = {
      industries: parseContext(industryDraft),
      technologies: parseContext(technologyDraft),
      countries: parseContext(countryDraft),
    };
    onScoringContextChange(next);
    onRegenerate(next);
  }

  function toggleSelected(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleExpanded(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const selectedPending = pending.filter(item => selected.has(item.actorName)).map(item => item.actorName);

  return (
    <div className="rounded-xl border border-primary/30 bg-card overflow-hidden">
      <div className="flex items-start justify-between gap-4 p-5 border-b border-border bg-primary/5">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            Quarterly score review · {quarter}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Deterministic suggestions from {sourceQuarterForAssessment(quarter)} TIDs and procedure text. Approvals are stored separately and never replace manual overrides.
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4 border-b border-border bg-cyan-400/[0.03]">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="min-w-[180px] flex-1">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Target industries</label>
            <input
              value={industryDraft}
              onChange={event => setIndustryDraft(event.target.value)}
              placeholder="Healthcare, manufacturing"
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Technologies</label>
            <input
              value={technologyDraft}
              onChange={event => setTechnologyDraft(event.target.value)}
              placeholder="Cisco ASA, VMware, Azure"
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Target countries</label>
            <input
              value={countryDraft}
              onChange={event => setCountryDraft(event.target.value)}
              placeholder="Poland, Germany"
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={applyContext}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-xs text-cyan-300 hover:bg-cyan-400/20"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Apply context
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Matching actor profiles, in-quarter procedures, technique names, and report names boost suggestions; they do not hide non-matching actors.
        </p>
      </div>

      <div className="flex items-center gap-3 px-5 py-3 border-b border-border text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={pending.length > 0 && selectedPending.length === pending.length}
            onChange={event => setSelected(event.target.checked ? new Set(pending.map(item => item.actorName)) : new Set())}
          />
          Select all pending
        </label>
        <span className="text-muted-foreground">{pending.length} pending · {assessments.length} with quarterly evidence</span>
        <div className="ml-auto flex gap-2">
          <button
            disabled={!selectedPending.length}
            onClick={() => onDecide(selectedPending, "rejected")}
            className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/40 disabled:opacity-40"
          >
            Reject selected
          </button>
          <button
            disabled={!selectedPending.length}
            onClick={() => onDecide(selectedPending, "approved")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" /> Approve selected
          </button>
        </div>
      </div>

      <div className="max-h-[560px] overflow-y-auto divide-y divide-border/60">
        {assessments.map(item => {
          const isExpanded = expanded.has(item.actorName);
          const statusColor = item.status === "approved"
            ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
            : item.status === "rejected"
              ? "text-red-400 bg-red-400/10 border-red-400/20"
              : "text-amber-400 bg-amber-400/10 border-amber-400/20";
          return (
            <div key={item.actorName} className="px-5 py-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  disabled={item.status !== "pending"}
                  checked={selected.has(item.actorName)}
                  onChange={() => toggleSelected(item.actorName)}
                />
                <button onClick={() => toggleExpanded(item.actorName)} className="text-muted-foreground">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <span className="font-mono font-semibold text-sm text-foreground min-w-[180px]">{item.actorName}</span>
                <div className="flex gap-4 text-xs">
                  <span className="text-amber-400">Intent <strong>{item.intentFinalScore}</strong> <span className="text-muted-foreground">Δ {delta(item.intentFinalScore, item.previousIntentScore)}</span></span>
                  <span className="text-primary">Capability <strong>{item.capabilityFinalScore}</strong> <span className="text-muted-foreground">Δ {delta(item.capabilityFinalScore, item.previousCapabilityScore)}</span></span>
                </div>
                <span className="text-xs text-muted-foreground">{item.procedureCount} procedures</span>
                <span className={`ml-auto px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase ${statusColor}`}>{item.status}</span>
                <span className="px-2 py-0.5 rounded-full border border-border text-[10px] text-muted-foreground uppercase">{item.confidence} confidence</span>
              </div>

              {isExpanded && (
                <div className="ml-16 mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="text-xs space-y-1.5">
                    <p><span className="text-amber-400">Intent:</span> {item.intentRationale} ({item.intentBaseScore} + {item.willingnessModifier} + {item.contextIntentModifier ?? 0} context)</p>
                    <p><span className="text-primary">Capability:</span> {item.capabilityRationale} ({item.capabilityBaseScore} + {item.noveltyModifier} + {item.contextCapabilityModifier ?? 0} context)</p>
                    <p><span className="text-cyan-400">Novelty:</span> {item.noveltyRationale}</p>
                    {!!item.contextMatches && (
                      <div className="pt-1">
                        <p className="text-cyan-400">Context matches:</p>
                        <p className="text-muted-foreground">
                          {[
                            item.contextMatches.industries.length ? `industries: ${item.contextMatches.industries.join(", ")}` : "",
                            item.contextMatches.technologies.length ? `technologies: ${item.contextMatches.technologies.join(", ")}` : "",
                            item.contextMatches.countries.length ? `countries: ${item.contextMatches.countries.join(", ")}` : "",
                          ].filter(Boolean).join(" · ") || "None"}
                        </p>
                        {!!item.contextMatches.sources.length && <p className="text-muted-foreground">Sources: {item.contextMatches.sources.join(" + ")}</p>}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {item.evidence.length ? item.evidence.map((evidence, index) => (
                      <div key={`${evidence.mitreId}-${index}`} className="rounded-lg bg-muted/20 border border-border/50 p-2">
                        <div className="flex gap-2 text-[10px] text-muted-foreground">
                          <span className="font-mono text-primary">{evidence.mitreId}</span>
                          <span>{evidence.date ? new Date(evidence.date).toLocaleDateString("en-GB") : "No date"}</span>
                          <span>{evidence.signals.join(" · ")}</span>
                        </div>
                        <p className="text-[11px] text-foreground/80 mt-1 leading-relaxed">{evidence.excerpt}</p>
                      </div>
                    )) : <p className="text-xs text-muted-foreground">No keyword evidence excerpt was captured.</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!assessments.length && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No dated procedures matched actors in {quarter}.
          </div>
        )}
      </div>
    </div>
  );
}