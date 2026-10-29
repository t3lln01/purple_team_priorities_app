const tacticIds: Record<string, string> = {
  ta0043: "reconnaissance", ta0042: "resource development", ta0001: "initial access",
  ta0002: "execution", ta0003: "persistence", ta0004: "privilege escalation",
  ta0005: "defense evasion", ta0006: "credential access", ta0007: "discovery",
  ta0008: "lateral movement", ta0009: "collection", ta0011: "command and control",
  ta0010: "exfiltration", ta0040: "impact",
};

export function normalizeTactic(value: string) {
  const key = value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return tacticIds[key] ?? key;
}

export function tacticNames(value: string | string[] = []) {
  return (Array.isArray(value) ? value : value.split(/[,;|]/))
    .map(normalizeTactic).filter(Boolean);
}

export function techniqueIsEnabled(
  tid: string,
  extraTactics: string | string[],
  mappings: Map<string, Set<string>>,
  disabled: Set<string>,
) {
  const names = [...(mappings.get(tid.trim().toUpperCase()) ?? []), ...tacticNames(extraTactics)];
  return !names.some(name => disabled.has(normalizeTactic(name)));
}
