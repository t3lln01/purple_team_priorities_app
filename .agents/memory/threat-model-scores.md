---
name: Threat Model score architecture
description: How intent/capability scores flow between ThreatModel and ActorPrioritisation, including PP-TAP/SIRT bonus logic.
---

## Actor ranking rule

Actor Prioritisation is read-only and ranks actors exclusively from the selected Threat Model quarter:

- Resolve intent and capability with the Threat Model priority chain: manual override, CrowdStrike data, approved quarterly assessment, then static Threat Model baseline.
- Add PP-TAP/SIRT bonuses to intent and cap effective intent at 7.
- Priority = effective intent × effective capability. TTP risk and Actor Prioritisation local overrides do not contribute.
- The selected quarter is shared between Threat Model and Actor Prioritisation and persists across navigation/reloads.

**Why:** Rankings must reflect the quarter-specific Threat Model directly, without procedure-derived TTP risk or a second set of editable actor scores.

**How to apply:** Any ranking, export, or summary that represents Actor Prioritisation should use this formula and the currently selected Threat Model quarter.

## PP-TAP and SIRT bonus logic

- PP-TAP match adds +1 intent.
- SIRT match adds +2 intent.
- Matching is case-insensitive against the actor name or malware/tool text.
- Effective intent is capped at 7; capability receives no list bonus.
- PP-TAP and SIRT lists are stored inside each quarter's Threat Model snapshot, not as one global list. A saved empty list is intentional and must not be replaced by legacy seed values on reload.
- Bulk list imports append deduplicated actor/malware names to the selected quarter only.

**Why:** Quarterly list membership is part of the evidence and scoring context for that quarter; changing a later quarter must not rewrite historical PP-TAP or SIRT membership.

**How to apply:** Always load and save both lists with the selected quarter state, and preserve empty saved lists as empty.
