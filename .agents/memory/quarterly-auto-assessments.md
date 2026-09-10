---
name: Quarterly auto-assessments
description: Score-source precedence and persistence rules for procedure-based quarterly suggestions.
---

Approved automated assessments must remain a separate quarterly state collection rather than being copied into manual actor overrides. Manual rubric selections have the highest precedence, approved assessments come next, and static source scores are the fallback.

**Why:** Reviewers need to approve or reject generated evidence without losing the distinction between analyst judgment and deterministic suggestions. Keeping the sources separate also makes historical quarter review auditable.

**How to apply:** New scoring or export behavior should preserve the source distinction and should not copy quarter-specific assessment evidence into a newly seeded quarter. Use live procedure data when present and the bundled procedure dataset as the offline/fresh-session fallback.