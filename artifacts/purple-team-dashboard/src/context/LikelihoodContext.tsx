import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { useAppData } from "@/context/AppDataContext";

export type LikelihoodOverride = {
  lastOccurrence?: string;
  confidence?: string;
};

const LS_BASE = "pt_likelihood_overrides";

function fromStorage(key: string): Record<string, LikelihoodOverride> {
  try { return JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { return {}; }
}
function toStorage(key: string, v: Record<string, LikelihoodOverride>) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}
function migrate() {
  const baseKey = `${LS_BASE}:base`;
  if (!localStorage.getItem(baseKey) && localStorage.getItem(LS_BASE)) {
    localStorage.setItem(baseKey, localStorage.getItem(LS_BASE)!);
  }
}

type Ctx = {
  overrides: Record<string, LikelihoodOverride>;
  setOverride: (tid: string, patch: Partial<LikelihoodOverride>) => void;
  resetOverride: (tid: string) => void;
  resetAll: () => void;
};

const LikelihoodCtx = createContext<Ctx>(null!);

export function LikelihoodProvider({ children }: { children: ReactNode }) {
  const { activeMitreVersionId } = useAppData();
  const versionKey = activeMitreVersionId ?? "base";
  const lsKey = `${LS_BASE}:${versionKey}`;
  const lsKeyRef = useRef(lsKey);

  const [overrides, setOverrides] = useState<Record<string, LikelihoodOverride>>(() => {
    migrate();
    return fromStorage(`${LS_BASE}:base`);
  });

  useEffect(() => {
    migrate();
    lsKeyRef.current = lsKey;
    setOverrides(fromStorage(lsKey));
  }, [lsKey]);

  const setOverride = useCallback((tid: string, patch: Partial<LikelihoodOverride>) => {
    setOverrides(prev => {
      const next = { ...prev, [tid]: { ...prev[tid], ...patch } };
      toStorage(lsKeyRef.current, next);
      return next;
    });
  }, []);

  const resetOverride = useCallback((tid: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[tid];
      toStorage(lsKeyRef.current, next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOverrides({});
    toStorage(lsKeyRef.current, {});
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
