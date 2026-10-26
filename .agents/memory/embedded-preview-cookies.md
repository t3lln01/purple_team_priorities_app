---
name: Embedded preview cookies
description: Django form verification must account for the cross-site embedded preview, not only top-level tests.
---
Treat the embedded preview as a cross-site HTTPS browser context when validating Django form submissions.

**Why:** Top-level browser tests passed, but real embedded preview submissions omitted Lax security cookies and were rejected before reaching the connector. CrowdStrike credentials were valid.

**How to apply:** Retain secure cross-site cookie settings and CSRF token/origin validation. Never fix iframe form failures by exempting write endpoints from CSRF protection. Top-level success alone does not establish iframe behavior.
