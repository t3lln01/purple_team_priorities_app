---
name: Embedded preview cookies
description: Django form verification must account for the cross-site embedded preview, not only top-level tests.
---
Treat the embedded preview as a cross-site HTTPS browser context when validating Django form submissions.

**Why:** Top-level browser tests passed, but real embedded preview submissions omitted security cookies and were rejected before reaching the connector. CrowdStrike credentials were valid. Changing cookies to Secure / SameSite=None did not resolve the user's missing-cookie failures.

**How to apply:** Authenticated form protection must not depend on an auxiliary Django cookie being accepted. Bind CSRF tokens to the server-verified authentication session while retaining token and origin validation. Never exempt write endpoints from CSRF protection. Verify successful submissions with Django cookies absent and rejection of tokens from another session; top-level success with all cookies present is insufficient.
