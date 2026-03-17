import data from "@/data.json";

const _rawData = (data as any);
void _rawData;

const riskMatrix = [
  { likelihood: "5 = Very High (≥95%)", scores: [5, 10, 15, 20, 25] },
  { likelihood: "4 = High (~75%)", scores: [4, 8, 12, 16, 20] },
  { likelihood: "3 = Medium (~50%)", scores: [3, 6, 9, 12, 15] },
  { likelihood: "2 = Low (~25%)", scores: [2, 4, 6, 8, 10] },
  { likelihood: "1 = Very Low (≤5%)", scores: [1, 2, 3, 4, 5] },
];

const impactLevels = ["Very low (1)", "Low (2)", "Medium (3)", "High (4)", "Very high (5)"];

function cellColor(score: number) {
  if (score >= 20) return "bg-red-500/20 text-red-300 border border-red-500/40";
  if (score >= 12) return "bg-orange-500/20 text-orange-300 border border-orange-500/40";
  if (score >= 6) return "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40";
  if (score >= 3) return "bg-blue-500/20 text-blue-300 border border-blue-500/40";
  return "bg-green-500/20 text-green-300 border border-green-500/40";
}

const riskFormula = "Risk = [(Confidentiality + Integrity + Availability) × TID Extent] × (TID Priority × Last Occurrence × Confidence)";

const scoreTable = [
  { rate: "Low", conf: 1, integrity: 1, avail: 1, extent: 1 },
  { rate: "Medium", conf: 2, integrity: 2.25, avail: 2.5, extent: 2 },
  { rate: "High", conf: 3, integrity: 3.5, avail: 3.5, extent: 3 },
];

const factorDescriptions = [
  {
    area: "Confidentiality",
    question: "How much data could be disclosed and how sensitive is it?",
    levels: [
      { level: "Low", score: 1, desc: "Minimal data exposure, non-sensitive information" },
      { level: "Medium", score: 2, desc: "Moderate sensitive data at risk" },
      { level: "High", score: 3, desc: "Significant sensitive or classified data exposure" },
    ]
  },
  {
    area: "Integrity",
    question: "How much data or systems could be corrupted?",
    levels: [
      { level: "Low", score: 1, desc: "Minor data modification, easily detected" },
      { level: "Medium", score: 2.25, desc: "Moderate corruption of important data" },
      { level: "High", score: 3.5, desc: "Severe system or data corruption" },
    ]
  },
  {
    area: "Availability",
    question: "How much of the service could be disrupted?",
    levels: [
      { level: "Low", score: 1, desc: "Brief or minor service disruption" },
      { level: "Medium", score: 2.5, desc: "Significant service degradation" },
      { level: "High", score: 3.5, desc: "Complete service outage" },
    ]
  },
];

const occurrenceScores = [
  { label: "< 3 months", score: 1.7, desc: "Very recent activity — highest weight" },
  { label: "3 months – 1 year", score: 1.3, desc: "Recent activity" },
  { label: "1 – 3 years", score: 1.0, desc: "Moderate recency" },
  { label: "> 3 years", score: 0.7, desc: "Older activity — lower weight" },
];

const confidenceScores = [
  { label: "High confidence", score: 1.25 },
  { label: "Medium confidence", score: 1.0 },
  { label: "Low confidence", score: 0.75 },
];

export default function RiskRate() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Risk Rate & Scoring Methodology</h1>
        <p className="text-muted-foreground text-sm mt-1">Risk calculation formula, weight factors, and rating definitions</p>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5">
        <h2 className="font-semibold text-foreground mb-3">Risk Formula</h2>
        <div className="bg-muted/30 rounded-lg p-4 font-mono text-sm text-primary border border-border">
          {riskFormula}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Impact Component: </span>
            (Confidentiality + Integrity + Availability) × TID Extent Score
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Likelihood Component: </span>
            TID Priority × Last Occurrence × Confidence
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Risk Matrix</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Impact vs Likelihood scoring grid</p>
          </div>
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Likelihood ↓ / Impact →</th>
                    {impactLevels.map(l => (
                      <th key={l} className="text-center py-2 px-2 text-muted-foreground font-medium whitespace-nowrap">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riskMatrix.map(row => (
                    <tr key={row.likelihood}>
                      <td className="py-1.5 pr-3 text-muted-foreground font-medium whitespace-nowrap">{row.likelihood}</td>
                      {row.scores.map((score, i) => (
                        <td key={i} className="py-1.5 px-2 text-center">
                          <span className={`inline-block w-10 py-1 rounded text-center font-bold text-xs ${cellColor(score)}`}>
                            {score}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-1 text-xs">
              {[
                { label: "Critical (20-25)", cls: "bg-red-500/20 border border-red-500/40 text-red-300" },
                { label: "High (12-19)", cls: "bg-orange-500/20 border border-orange-500/40 text-orange-300" },
                { label: "Medium (6-11)", cls: "bg-yellow-500/20 border border-yellow-500/40 text-yellow-300" },
                { label: "Low (3-5)", cls: "bg-blue-500/20 border border-blue-500/40 text-blue-300" },
                { label: "Very Low (1-2)", cls: "bg-green-500/20 border border-green-500/40 text-green-300" },
              ].map(item => (
                <div key={item.label} className={`p-1.5 rounded text-center ${item.cls}`}>{item.label}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Weight Scores by Rating</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Rate</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Conf.</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Integrity</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Avail.</th>
                    <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium">Extent</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreTable.map(row => (
                    <tr key={row.rate} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{row.rate}</td>
                      <td className="px-4 py-2.5 text-blue-400 font-mono">{row.conf}</td>
                      <td className="px-4 py-2.5 text-green-400 font-mono">{row.integrity}</td>
                      <td className="px-4 py-2.5 text-yellow-400 font-mono">{row.avail}</td>
                      <td className="px-4 py-2.5 text-primary font-mono">{row.extent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Last Occurrence Weights</h2>
            </div>
            <div className="divide-y divide-border">
              {occurrenceScores.map(o => (
                <div key={o.label} className="flex items-center gap-3 px-4 py-3">
                  <span className="font-mono text-primary text-sm font-bold w-10">{o.score}</span>
                  <div>
                    <div className="text-sm font-medium text-foreground">{o.label}</div>
                    <div className="text-xs text-muted-foreground">{o.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Confidence Weights</h2>
            </div>
            <div className="divide-y divide-border">
              {confidenceScores.map(c => (
                <div key={c.label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-foreground">{c.label}</span>
                  <span className="font-mono text-primary font-bold">{c.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Impact Factor Definitions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">CIA scoring criteria for each weight level</p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {factorDescriptions.map(factor => (
            <div key={factor.area} className="p-4">
              <h3 className="font-semibold text-foreground mb-1">{factor.area}</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{factor.question}</p>
              <div className="space-y-2">
                {factor.levels.map(level => (
                  <div key={level.level} className="flex gap-2">
                    <div className="flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                        level.level === "High" ? "bg-red-500/10 text-red-400 border border-red-500/30" :
                        level.level === "Medium" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30" :
                        "bg-green-500/10 text-green-400 border border-green-500/30"
                      }`}>{level.level} ({level.score})</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{level.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
