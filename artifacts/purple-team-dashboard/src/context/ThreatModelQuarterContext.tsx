import { createContext, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "pt_selected_threat_model_quarter";

function currentQuarterLabel(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let quarter: number;
  let quarterYear = year;

  if (month === 1) {
    quarter = 4;
    quarterYear = year - 1;
  } else if (month <= 4) {
    quarter = 1;
  } else if (month <= 7) {
    quarter = 2;
  } else if (month <= 10) {
    quarter = 3;
  } else {
    quarter = 4;
  }

  return `Q${quarter} ${quarterYear}`;
}

export const CURRENT_THREAT_MODEL_QUARTER = currentQuarterLabel();

export type ThreatModelQuarterWindow = {
  fromMs: number;
  toMs: number;
  fromLabel: string;
  toLabel: string;
};

export function getThreatModelQuarterWindow(label: string): ThreatModelQuarterWindow | null {
  const match = label.match(/^Q([1-4])\s+(\d{4})$/);
  if (!match) return null;

  const quarter = Number(match[1]);
  const year = Number(match[2]);
  const startMonth = (quarter - 1) * 3;
  const from = new Date(year, startMonth, 1);
  const nextQuarter = new Date(year, startMonth + 3, 1);
  const to = new Date(nextQuarter.getTime() - 1);
  const format = (date: Date) => date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return {
    fromMs: from.getTime(),
    toMs: to.getTime(),
    fromLabel: format(from),
    toLabel: format(to),
  };
}

export const ALL_THREAT_MODEL_QUARTERS = (() => {
  const quarters: string[] = [];
  const match = CURRENT_THREAT_MODEL_QUARTER.match(/Q(\d) (\d+)/);
  if (!match) return [CURRENT_THREAT_MODEL_QUARTER];

  const currentQuarter = Number(match[1]);
  const currentYear = Number(match[2]);
  let quarter = 1;
  let year = 2025;

  while (year < currentYear || (year === currentYear && quarter <= currentQuarter)) {
    quarters.push(`Q${quarter} ${year}`);
    quarter += 1;
    if (quarter > 4) {
      quarter = 1;
      year += 1;
    }
  }

  return quarters;
})();

type ThreatModelQuarterContextValue = {
  selectedQuarter: string;
  setSelectedQuarter: (quarter: string) => void;
};

const ThreatModelQuarterContext = createContext<ThreatModelQuarterContextValue | null>(null);

export function ThreatModelQuarterProvider({ children }: { children: ReactNode }) {
  const [selectedQuarterState, setSelectedQuarterState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && ALL_THREAT_MODEL_QUARTERS.includes(stored)
      ? stored
      : CURRENT_THREAT_MODEL_QUARTER;
  });

  function setSelectedQuarter(quarter: string) {
    if (!ALL_THREAT_MODEL_QUARTERS.includes(quarter)) return;
    setSelectedQuarterState(quarter);
    localStorage.setItem(STORAGE_KEY, quarter);
  }

  return (
    <ThreatModelQuarterContext.Provider
      value={{ selectedQuarter: selectedQuarterState, setSelectedQuarter }}
    >
      {children}
    </ThreatModelQuarterContext.Provider>
  );
}

export function useThreatModelQuarter() {
  const value = useContext(ThreatModelQuarterContext);
  if (!value) {
    throw new Error("useThreatModelQuarter must be used inside ThreatModelQuarterProvider");
  }
  return value;
}