import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { useAppData } from "./AppDataContext";
import data from "@/data.json";

export type DateRange = "all" | "3m" | "6m" | "9m" | "1y" | "custom";

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: "All time",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "9m": "Last 9 months",
  "1y": "Last year",
  custom: "Custom",
};

const DAY = 86_400_000;

const allProceduresData: Array<{ mitreId: string; date: number | null }> =
  (data as any).allProcedures ?? [];

type DateWindowCtx = {
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (s: string) => void;
  setCustomTo: (s: string) => void;
  fromMs: number;
  toMs: number;
  tidsInWindow: Set<string> | null;
};

const Ctx = createContext<DateWindowCtx | null>(null);

export function useDateWindow(): DateWindowCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDateWindow must be used inside DateWindowProvider");
  return c;
}

export function DateWindowProvider({ children }: { children: ReactNode }) {
  const { liveActorData } = useAppData();

  const [dateRange, setDateRange]   = useState<DateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");

  const { fromMs, toMs } = useMemo(() => {
    const now = Date.now();
    if (dateRange === "3m") return { fromMs: now - 90  * DAY, toMs: now };
    if (dateRange === "6m") return { fromMs: now - 180 * DAY, toMs: now };
    if (dateRange === "9m") return { fromMs: now - 270 * DAY, toMs: now };
    if (dateRange === "1y") return { fromMs: now - 365 * DAY, toMs: now };
    if (dateRange === "custom") return {
      fromMs: customFrom ? new Date(customFrom).getTime()           : -Infinity,
      toMs:   customTo   ? new Date(customTo).getTime() + DAY - 1  :  Infinity,
    };
    return { fromMs: -Infinity, toMs: Infinity };
  }, [dateRange, customFrom, customTo]);

  const tidsInWindow = useMemo<Set<string> | null>(() => {
    if (dateRange === "all") return null;
    const set = new Set<string>();
    const inWindow = (date: number | null) => date !== null && date >= fromMs && date <= toMs;
    for (const p of allProceduresData) {
      if (p.mitreId && inWindow(p.date)) set.add(p.mitreId);
    }
    for (const p of liveActorData?.procedures ?? []) {
      if (p.mitreId && inWindow(p.date)) set.add(p.mitreId);
    }
    return set;
  }, [dateRange, fromMs, toMs, liveActorData]);

  return (
    <Ctx.Provider value={{
      dateRange, setDateRange,
      customFrom, setCustomFrom,
      customTo,   setCustomTo,
      fromMs, toMs,
      tidsInWindow,
    }}>
      {children}
    </Ctx.Provider>
  );
}
