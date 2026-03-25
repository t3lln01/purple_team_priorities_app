import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

export type HVAScore = {
  tid: string;
  avgRisk: number;
  avgLikelihood: number;
};

const LS_KEY = "pt_hva_scores";

function load(): HVAScore[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
}
function persist(v: HVAScore[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch {}
}

type Ctx = {
  hvaScores: HVAScore[];
  /** Keyed by TID — ready-made lookup for RiskCalculation and LikelihoodTable */
  hvaScoreMap: Record<string, { avgRisk: number; avgLikelihood: number }>;
  setHVAScores: (scores: HVAScore[]) => void;
};

const HVAScoresCtx = createContext<Ctx>(null!);

export function HVAScoresProvider({ children }: { children: ReactNode }) {
  const [hvaScores, setHVAScoresState] = useState<HVAScore[]>(load);

  const setHVAScores = useCallback((scores: HVAScore[]) => {
    setHVAScoresState(scores);
    persist(scores);
  }, []);

  const hvaScoreMap = useMemo(
    () => Object.fromEntries(hvaScores.map(s => [s.tid, { avgRisk: s.avgRisk, avgLikelihood: s.avgLikelihood }])),
    [hvaScores]
  );

  return (
    <HVAScoresCtx.Provider value={{ hvaScores, hvaScoreMap, setHVAScores }}>
      {children}
    </HVAScoresCtx.Provider>
  );
}

export function useHVAScores() {
  return useContext(HVAScoresCtx);
}
