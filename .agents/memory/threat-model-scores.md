---
name: Threat Model score architecture
description: How intent/capability scores flow between ThreatModel and ActorPrioritisation, including PP-TAP/SIRT bonus logic.
---

## Actor ranking rule

Actor Prioritisation is read-only. The selected Threat Model quarter filters monitoring membership only:

- Resolve intent and capability with the Threat Model priority chain: manual override, CrowdStrike data, approved quarterly assessment, then static Threat Model baseline.
- Add PP-TAP/SIRT bonuses to intent and cap effective intent at 7.
- Resolve scores and PP-TAP/SIRT bonuses from the current Threat Model quarter, independently of the selected monitoring quarter.
- Priority = effective intent × effective capability × (sum of risk scores for distinct observed TIDs ÷ number of those TIDs). Use all-time procedures; do not apply a quarter/date filter to evidence.
- The selected quarter is shared between Threat Model and Actor Prioritisation and persists across navigation/reloads.

**Why:** The user explicitly changed the ranking rule on 2026-09-18: quarter is only a monitored-actor filter, while priority must include average known-TID risk rather than procedure frequency.

**How to apply:** Keep monitoring membership separate from scoring inputs. Count each observed TID once, retain sub-technique IDs, and use all-time evidence for Actor Prioritisation. The separate Risk Calculation page's quarterly evidence rule is unchanged.

## PP-TAP and SIRT bonus logic

- PP-TAP match adds +1 intent.
- SIRT match adds +2 intent.
- Matching is case-insensitive against the actor name or malware/tool text.
- Effective intent is capped at 7; capability receives no list bonus.
- PP-TAP and SIRT lists are stored inside each quarter's Threat Model snapshot, not as one global list. A saved empty list is intentional and must not be replaced by legacy seed values on reload.
- Bulk list imports append deduplicated actor/malware names to the selected quarter only.

**Why:** Quarterly list membership is part of the evidence and scoring context for that quarter; changing a later quarter must not rewrite historical PP-TAP or SIRT membership.

**How to apply:** Always load and save both lists with the selected quarter state, and preserve empty saved lists as empty.

## Technique risk quarter rule

- Risk Calculation uses the same selected Threat Model quarter as Actor Prioritisation.
- Only procedures with dates inside that calendar quarter contribute technique evidence.
- The latest qualifying procedure determines default last-occurrence recency and likelihood as of the quarter end; a manual likelihood override still wins.
- Techniques with no dated procedure in the selected quarter are excluded rather than carrying forward all-time evidence.

**Why:** Historical risk views must represent what was observed and knowable during that quarter, not today's age or procedures from another reporting period.

**How to apply:** Any technique risk summary or export should use the shared quarter bounds and in-quarter procedure evidence before ranking or aggregating results.

## Quarterly monitoring status

- Monitored/not-monitored actor status is explicit state inside each quarter snapshot.
- Static actor defaults and legacy per-actor flags are migration inputs only; once saved, the quarter monitoring map is authoritative.
- A newly initialized quarter may copy the previous quarter as its starting point, but later changes remain isolated.

**Why:** Monitoring membership is a historical Threat Model decision and must not change past or future quarters when toggled in one view.

**How to apply:** Read, toggle, add, and delete actor monitoring membership through the selected quarter's monitoring map and persist it with the rest of that snapshot.

## Explicit quarter saves

- Threat Model edits remain a local draft until the user saves the complete selected-quarter snapshot.
- The snapshot includes scores and rubric selections, PP-TAP, SIRT, custom actors, automated assessments, and monitoring status.
- Failed or unauthorized writes must remain visibly unsaved and show the server error.

**Why:** Independent auto-saves could fail silently or persist only part of a quarter, leaving the UI inconsistent with the stored snapshot.

**How to apply:** New quarter-level editable fields must participate in the shared dirty-state comparison and full-snapshot save action.

## Durable snapshot storage

- Quarter snapshots are stored in managed PostgreSQL, not writable files in the API service.
- An empty snapshot table imports the bundled legacy JSON once so existing quarters are retained.

**Why:** Published service files can revert when an instance is replaced, which restored old monitoring counts and removed custom actors.

**How to apply:** All quarter reads and saves must use the snapshot table; JSON files are migration input only.
