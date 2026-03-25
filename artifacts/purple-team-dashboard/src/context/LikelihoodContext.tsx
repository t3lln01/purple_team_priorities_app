import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type LikelihoodOverride = {
  lastOccurrence?: string;
  confidence?: string;
};

const LS_KEY = "pt_likelihood_overrides";

function load(): Record<string, LikelihoodOverride> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); } catch { return {}; }
}
function persist(v: Record<string, LikelihoodOverride>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch {}
}

type Ctx = {
  overrides: Record<string, LikelihoodOverride>;
  setOverride: (tid: string, patch: Partial<LikelihoodOverride>) => void;
  resetOverride: (tid: string) => void;
  resetAll: () => void;
};

const LikelihoodCtx = createContext<Ctx>(null!);

export function LikelihoodProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, LikelihoodOverride>>(load);

  const setOverride = useCallback((tid: string, patch: Partial<LikelihoodOverride>) => {
    setOverrides(prev => {
      const next = { ...prev, [tid]: { ...prev[tid], ...patch } };
      persist(next);
      return next;
    });
  }, []);

  const resetOverride = useCallback((tid: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[tid];
      persist(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOverrides({});
    persist({});
  }, []);

  return (
    <LikelihoodCtx.Provider value={{ overrides, setOverride, resetOverride, resetAll }}>
      {children}
    </LikelihoodCtx.Provider>
  );
}

export function useLikelihood() {
  return useContext(LikelihoodCtx);
}
