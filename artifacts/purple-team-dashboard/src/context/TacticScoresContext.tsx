import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from "react";
import data from "@/data.json";

// ── types ─────────────────────────────────────────────────────────────────────
export type Tactic = {
  tactic: string;
  desc: string;
  conf: string;
  integrity: string;
  avail: string;
  extent: number;
};

export type TacticField = "conf" | "integrity" | "avail" | "extent";
export type TacticOverride = { conf?: string; integrity?: string; avail?: string; extent?: number };
export type TacticOverrides = Record<string, TacticOverride>;

// ── base data (immutable) ─────────────────────────────────────────────────────
export const baseTactics: Tactic[] = (data as any).tactics;

// ── persistence ───────────────────────────────────────────────────────────────
const LS_KEY = "pt_tactic_overrides";
function load(): TacticOverrides {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); } catch { return {}; }
}
function save(o: TacticOverrides) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch {}
}

// ── context type ──────────────────────────────────────────────────────────────
type Ctx = {
  liveTactics: Tactic[];
  overrides: TacticOverrides;
  setOverride: (name: string, field: TacticField, value: string | number) => void;
  resetOverride: (name: string) => void;
  resetAll: () => void;
  getEffective: (name: string) => Tactic | undefined;
};

const TacticScoresCtx = createContext<Ctx>(null!);

// ── provider ──────────────────────────────────────────────────────────────────
export function TacticScoresProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<TacticOverrides>(load);

  const liveTactics = useMemo(() =>
    baseTactics.map(t => {
      const ov = overrides[t.tactic] ?? {};
      return {
        ...t,
        conf:      ov.conf      !== undefined ? ov.conf      : t.conf,
        integrity: ov.integrity !== undefined ? ov.integrity : t.integrity,
        avail:     ov.avail     !== undefined ? ov.avail     : t.avail,
        extent:    ov.extent    !== undefined ? ov.extent    : t.extent,
      };
    }),
    [overrides]
  );

  const getEffective = useCallback((name: string) =>
    liveTactics.find(t => t.tactic === name),
    [liveTactics]
  );

  const setOverride = useCallback((name: string, field: TacticField, value: string | number) => {
    setOverrides(prev => {
      const next = { ...prev, [name]: { ...(prev[name] ?? {}), [field]: value } };
      save(next);
      return next;
    });
  }, []);

  const resetOverride = useCallback((name: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[name];
      save(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOverrides({});
    save({});
  }, []);

  return (
    <TacticScoresCtx.Provider value={{ liveTactics, overrides, setOverride, resetOverride, resetAll, getEffective }}>
      {children}
    </TacticScoresCtx.Provider>
  );
}

export function useTacticScores() {
  return useContext(TacticScoresCtx);
}
