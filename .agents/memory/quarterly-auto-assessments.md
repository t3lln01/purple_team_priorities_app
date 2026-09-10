---
name: Quarterly auto-assessments
description: Score-source precedence and persistence rules for procedure-based quarterly suggestions.
---

Approved automated assessments must remain a separate quarterly state collection rather than being copied into manual actor overrides. Manual rubric selections have the highest precedence, approved assessments come next, and static source scores are the fallback.

Organisation context may adjust suggestions when analysts set industry, technology, or country filters. Industry and country matches increase intent; technology matches and demonstrated in-quarter targeting increase capability. Every adjustment must retain its matched terms and source for review.

Quarter views are created at the start of the next month: Q1 on February 1 using November–January, Q2 on May 1 using February–April, Q3 on August 1 using May–July, and Q4 on November 1 using August–October.

**Why:** Reviewers need to approve or reject generated evidence without losing the distinction between analyst judgment and deterministic suggestions. Keeping the sources separate also makes historical quarter review auditable. Context adjustments must be explainable so analysts can distinguish general actor scoring from relevance to their organisation.

**How to apply:** New scoring or export behavior should preserve the source distinction and should not copy quarter-specific assessment evidence into a newly seeded quarter. Baseline suggestions use dated evidence from the selected quarter. Context matching may additionally use actor profile targeting plus the selected quarter's technique, tactic, procedure, and report-name text, never out-of-quarter reports. Use live procedure data when present and the bundled procedure dataset as the offline/fresh-session fallback.