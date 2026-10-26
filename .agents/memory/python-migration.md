---
name: Python migration constraints
description: Preserve data and cookie authentication during the user-requested full Django rewrite.
---
The user explicitly selected a full Python/Django rewrite, including the interface, not only an API port.

**Why:** The user chose that scope after being offered backend-only conversion.

**How to apply:** Implement future Purple Team features in Django and server-rendered templates. Minimal browser JavaScript for Clerk and progressive enhancement is still required. Do not reactivate the legacy React/Express runtime.

Development artifact commands execute from their artifact directories; production launch paths must be validated separately. Gunicorn config paths should be resolved absolutely by the launcher before changing directories.

**Why:** Relative config and workspace-root paths caused startup failures during conversion.

**How to apply:** Preserve the working portable launcher and explicit development directory change when changing process configuration.
