import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from "react";
import { useAppData } from "@/context/AppDataContext";

export type HVAScore = {
  tid: string;
  avgRisk: number;
  avgLikelihood: number;
};

const LS_BASE = "pt_hva_scores";

function fromStorage(key: string): HVAScore[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function toStorage(key: string, v: HVAScore[]) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}
function migrate() {
  const baseKey = `${LS_BASE}:base`;
  if (!localStorage.getItem(baseKey) && localStorage.getItem(LS_BASE)) {
    localStorage.setItem(baseKey, localStorage.getItem(LS_BASE)!);
  }
}

type Ctx = {
  hvaScores: HVAScore[];
  hvaScoreMap: Record<string, { avgRisk: number; avgLikelihood: number }>;
  setHVAScores: (scores: HVAScore[]) => void;
};

const HVAScoresCtx = createContext<Ctx>(null!);

export function HVAScoresProvider({ children }: { children: ReactNode }) {
  const { activeMitreVersionId } = useAppData();
  const versionKey = activeMitreVersionId ?? "base";
  const lsKey = `${LS_BASE}:${versionKey}`;
  const lsKeyRef = useRef(lsKey);

  const [hvaScores, setHVAScoresState] = useState<HVAScore[]>(() => {
    migrate();
    return fromStorage(`${LS_BASE}:base`);
  });

  useEffect(() => {
    migrate();
    lsKeyRef.current = lsKey;
    setHVAScoresState(fromStorage(lsKey));
  }, [lsKey]);

  const setHVAScores = useCallback((scores: HVAScore[]) => {
    setHVAScoresState(scores);
    toStorage(lsKeyRef.current, scores);
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
