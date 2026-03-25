import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { useAppData } from "@/context/AppDataContext";

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

const LS_BASE = "pt_impact_overrides";

function fromStorage(key: string): Record<string, ImpactOverride> {
  try { return JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { return {}; }
}
function toStorage(key: string, v: Record<string, ImpactOverride>) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}
function migrate() {
  const baseKey = `${LS_BASE}:base`;
  if (!localStorage.getItem(baseKey) && localStorage.getItem(LS_BASE)) {
    localStorage.setItem(baseKey, localStorage.getItem(LS_BASE)!);
  }
}

type Ctx = {
  overrides: Record<string, ImpactOverride>;
  setOverride: (id: string, patch: Partial<ImpactOverride>) => void;
  resetOverride: (id: string) => void;
  resetAll: () => void;
};

const ImpactOverridesCtx = createContext<Ctx>(null!);

export function ImpactOverridesProvider({ children }: { children: ReactNode }) {
  const { activeMitreVersionId } = useAppData();
  const versionKey = activeMitreVersionId ?? "base";
  const lsKey = `${LS_BASE}:${versionKey}`;
  const lsKeyRef = useRef(lsKey);

  const [overrides, setOverrides] = useState<Record<string, ImpactOverride>>(() => {
    migrate();
    return fromStorage(`${LS_BASE}:base`);
  });

  useEffect(() => {
    migrate();
    lsKeyRef.current = lsKey;
    setOverrides(fromStorage(lsKey));
  }, [lsKey]);

  const setOverride = useCallback((id: string, patch: Partial<ImpactOverride>) => {
    setOverrides(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      toStorage(lsKeyRef.current, next);
      return next;
    });
  }, []);

  const resetOverride = useCallback((id: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[id];
      toStorage(lsKeyRef.current, next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOverrides({});
    toStorage(lsKeyRef.current, {});
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
