import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type ImpactOverride = {
  confidentiality?: string;
  integrity?: string;
  availability?: string;
  initialTTPExtent?: number;
  adScore?: number;
  containerScore?: number;
  cloudScore?: number;
  supportRemoteScore?: number;
  systemReqScore?: number;
  capecSeverityScore?: number;
  permRequiredScore?: number;
  effectivePermsScore?: number;
};

const LS_KEY = "pt_impact_overrides";

function load(): Record<string, ImpactOverride> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); } catch { return {}; }
}
function persist(v: Record<string, ImpactOverride>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch {}
}

type Ctx = {
  overrides: Record<string, ImpactOverride>;
  setOverride: (id: string, patch: Partial<ImpactOverride>) => void;
  resetOverride: (id: string) => void;
  resetAll: () => void;
};

const ImpactOverridesCtx = createContext<Ctx>(null!);

export function ImpactOverridesProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, ImpactOverride>>(load);

  const setOverride = useCallback((id: string, patch: Partial<ImpactOverride>) => {
    setOverrides(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      persist(next);
      return next;
    });
  }, []);

  const resetOverride = useCallback((id: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[id];
      persist(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOverrides({});
    persist({});
  }, []);

  return (
    <ImpactOverridesCtx.Provider value={{ overrides, setOverride, resetOverride, resetAll }}>
      {children}
    </ImpactOverridesCtx.Provider>
  );
}

export function useImpactOverrides() {
  return useContext(ImpactOverridesCtx);
}
