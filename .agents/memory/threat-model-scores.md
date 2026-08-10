---
name: Threat Model score architecture
description: How intent/capability scores flow between ThreatModel and ActorPrioritisation, including PP-TAP/SIRT bonus logic.
---

## Score priority chain (both pages)

1. Local override (localStorage in ActorPrioritisation, actorOverrides.intentFinalScore in TM) — highest
2. Threat Model effective score (fetched from API on mount in ActorPrioritisation)
3. data.json / threatModelData.json base value

## PP-TAP and SIRT bonus logic

- `ppTapList` and `sirtList` are string arrays (actor names or malware substrings) stored in `cs-threat-model-state.json`.
- `matchesList(actorName, malware, list)` — returns true if actor name exactly matches OR malware string contains any list item (substring, case-insensitive).
- PP-TAP match → +1 intent, badge "PP-TAP +1"
- SIRT match → +2 intent, badge "SIRT +2"
- Effective intent = min(7, base + ppTapBonus + sirtBonus)
- Capability gets no bonus — only intent is boosted.
- Lists are seeded from Excel data on first load (SEED_PPTAP = 18 actors, SEED_SIRT = 13 actors).

**Why:** User wanted PP-TAP/SIRT to be editable lists with scoring impact, seeded from Excel pptap/sirt fields.

## API state file

`artifacts/api-server/cs-threat-model-state.json` shape:
```json
{
  "customActors": [],
  "actorOverrides": {
    "ACTOR NAME": {
      "inMonitoringList": true,
      "intentFinalScore": 5,
      "capabilityFinalScore": 4,
      "csEnriched": true,
      "csLastRefreshed": "...",
      "csData": { ... }
    }
  },
  "ppTapList": ["ACTOR NAME", "MalwareName", ...],
  "sirtList": ["ACTOR NAME", ...]
}
```

## ActorPrioritisation sync

On mount, fetches `/api/cs/threat-model-state`, computes effective scores from TM static actors + overrides + ppTapList/sirtList, and stores as `tmScores: Record<string, {intent, capability}>`. These are used as the base in the actors useMemo (before localStorage overrides win).

## Inline score editing (ThreatModel)

Pencil icon in Actions column → inline number inputs for intent (1–7) and capability (1–6). On save, calls `saveScores()` which writes to `actorOverrides[name].intentFinalScore` for base actors, or directly to `customActors[idx]` for custom actors.
