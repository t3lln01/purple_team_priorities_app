import { useState, useCallback } from "react";

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

function persist(data: Record<string, ImpactOverride>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
}

export function useImpactOverrides() {
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

  return { overrides, setOverride, resetOverride, resetAll };
}
