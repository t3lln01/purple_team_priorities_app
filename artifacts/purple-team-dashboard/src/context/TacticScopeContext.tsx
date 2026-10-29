import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import data from "@/data.json";
import { useAppData, baseFullRiskCalc } from "./AppDataContext";
import { normalizeTactic, tacticNames, techniqueIsEnabled } from "@/utils/tacticScope";

// Deliberately NOT scoped to a MITRE version or overwritten by import handlers.
export const TACTIC_SCOPE_KEY = "pt_disabled_tactics";

function readDisabled(): string[] {
  const stored: unknown = JSON.parse(localStorage.getItem(TACTIC_SCOPE_KEY) ?? "[]");
  if (!Array.isArray(stored) || stored.some(value => typeof value !== "string")) {
    throw new Error("Invalid saved tactic selections");
  }
  return [...new Set(stored.map(normalizeTactic))];
}

type Scope = {
  disabledTactics: string[];
  storageError: string;
  setTacticEnabled: (name: string, enabled: boolean) => void;
  isTacticEnabled: (name: string) => boolean;
  isTechniqueEnabled: (tid: string, tactics?: string | string[]) => boolean;
};
const ScopeContext = createContext<Scope>(null!);

export function TacticScopeProvider({ children }: { children: ReactNode }) {
  const { activeNewImpactRows, activeNewRiskRows, liveActorData } = useAppData();
  const [initial] = useState(() => {
    try { return { disabled: readDisabled(), error: "" }; }
    catch { return { disabled: [], error: "Saved tactic selections could not be read. Check your browser storage before changing them." }; }
  });
  const [disabledTactics, setDisabled] = useState(initial.disabled);
  const [storageError, setStorageError] = useState(initial.error);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== TACTIC_SCOPE_KEY) return;
      try { setDisabled(readDisabled()); setStorageError(""); }
      catch { setStorageError("Unable to read tactic selections from another tab."); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const mappings = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (tid: string, names: string | string[]) => {
      if (!tid) return;
      const key = tid.trim().toUpperCase();
      const existing = map.get(key) ?? new Set<string>();
      for (const name of tacticNames(names)) existing.add(name);
      map.set(key, existing);
    };
    for (const [tid, names] of Object.entries(data.techTacticMap)) add(tid, names);
    for (const row of [...baseFullRiskCalc, ...activeNewRiskRows] as Array<{ TID: string; Tactic: string }>) add(row.TID, row.Tactic ?? "");
    for (const row of [...data.impactTable, ...activeNewImpactRows]) add(row.id, row.tactics ?? "");
    // STIX imports may update tactic mappings for existing, not just new, IDs.
    const imported: Record<string, { tactics?: string }> = (() => {
      try { return JSON.parse(localStorage.getItem("pt_stix_techniques") ?? "{}"); }
      catch { return {}; }
    })();
    for (const [tid, row] of Object.entries(imported)) add(tid, row.tactics ?? "");
    for (const procedure of liveActorData?.procedures ?? []) add(procedure.mitreId, procedure.tacticName ?? "");
    return map;
  }, [activeNewImpactRows, activeNewRiskRows, liveActorData]);
  const disabled = useMemo(() => new Set(disabledTactics), [disabledTactics]);
  const isTacticEnabled = useCallback((name: string) => !disabled.has(normalizeTactic(name)), [disabled]);
  const isTechniqueEnabled = useCallback((tid: string, tactics: string | string[] = []) =>
    techniqueIsEnabled(tid, tactics, mappings, disabled), [mappings, disabled]);
  const setTacticEnabled = useCallback((name: string, enabled: boolean) => {
    try {
      // Read the latest value so two browser tabs cannot overwrite each other.
      const next = new Set(readDisabled());
      if (enabled) next.delete(normalizeTactic(name));
      else next.add(normalizeTactic(name));
      const values = [...next];
      localStorage.setItem(TACTIC_SCOPE_KEY, JSON.stringify(values));
      setDisabled(values);
      setStorageError("");
    } catch {
      setStorageError("Could not save tactic selections. No change was applied; enable browser storage and try again.");
    }
  }, []);
  return <ScopeContext.Provider value={{ disabledTactics, storageError, setTacticEnabled, isTacticEnabled, isTechniqueEnabled }}>
    {children}
  </ScopeContext.Provider>;
}

export const useTacticScope = () => useContext(ScopeContext);
