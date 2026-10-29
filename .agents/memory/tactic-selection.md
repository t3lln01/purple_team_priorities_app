---
name: Persistent tactic selection
description: Cross-app exclusions independent of imported source data and MITRE versions.
---

Disabling a tactic excludes its TIDs from analysis lists, evidence, risk totals, and actor-priority numerator and denominator. A TID with multiple tactics is excluded if any assigned tactic is disabled.

**Why:** The user requested tactic selections affecting all app sections and calculations, surviving refreshes and new file/API imports.

**How to apply:** Keep exclusions separate from imported datasets and version-specific score overrides. Preserve raw data and stored scores when filtering so re-enabling restores them. The current selection is browser-local, like the existing scoring preferences; do not claim cross-device synchronization.
